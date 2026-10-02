require("dotenv").config();
import * as moviedb from "./getTmdb.js";
import * as Utils from '../utils/parseProps.js';
import { getMeta } from './getMeta.js';
import { cacheWrapMetaSmart } from './getCache.js';
import { UserConfig } from '../types/index.js';
import { allowsUnrated, hasAgeRatingCap, passesAgeRating } from '../utils/ageRating.js';
const consola = require('consola');

const logger = consola.withTag('GetTrending'); 

// --- Original-language filter (fork change) --------------------------------
// TMDB's trending chart has no language filter. TMDB_TRENDING_ORIGINAL_LANGUAGES
// (comma-separated ISO 639-1 codes, e.g. "en") keeps only titles originally in
// one of them. Pages stay a full 20: page n is the (n-1)*20..n*20 slice of the
// filtered chart, read from TMDB page 1 on, so page boundaries never shift.
// Unset or empty: the chart as TMDB has it.
const TRENDING_PAGE_SIZE = 20;
// TMDB pages read at most for one catalog page: enough while a third of the
// chart is in the wanted languages.
const TRENDING_MAX_PAGES_PER_PAGE = 3;
const TRENDING_PAGE_TTL_MS = 10 * 60 * 1000;
const trendingPageCache = new Map<string, { at: number; value: any }>();

function trendingOriginalLanguages(): string[] {
  return (process.env.TMDB_TRENDING_ORIGINAL_LANGUAGES || '')
    .split(',')
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
}

/** One page of TMDB's trending chart, kept for a few minutes: reading page 3
 * of the filtered chart reads TMDB pages 1 and 2 again. */
async function trendingChartPage(parameters: any, page: number, config: UserConfig): Promise<any> {
  const key = `${parameters.media_type}|${parameters.time_window}|${parameters.language}|${page}`;
  const hit = trendingPageCache.get(key);
  if (hit && Date.now() - hit.at < TRENDING_PAGE_TTL_MS) return hit.value;
  const value = await moviedb.trending({ ...parameters, page }, config);
  trendingPageCache.set(key, { at: Date.now(), value });
  if (trendingPageCache.size > 500) trendingPageCache.delete(trendingPageCache.keys().next().value as string);
  return value;
}

/** The trending chart's page `page`, filtered to `languages` (see above). */
async function filteredTrendingPage(parameters: any, page: number, languages: string[], config: UserConfig): Promise<any> {
  const wanted = page * TRENDING_PAGE_SIZE;
  const kept: any[] = [];
  let totalPages = Infinity;
  for (let tmdbPage = 1; kept.length < wanted && tmdbPage <= Math.min(totalPages, page * TRENDING_MAX_PAGES_PER_PAGE); tmdbPage++) {
    const res = await trendingChartPage(parameters, tmdbPage, config);
    totalPages = res?.total_pages ?? tmdbPage;
    for (const item of res?.results || []) {
      if (languages.includes(String(item.original_language || '').toLowerCase())) kept.push(item);
    }
  }
  return { results: kept.slice((page - 1) * TRENDING_PAGE_SIZE, wanted) };
}

async function getTrending(type: string, language: string, page: number, genre: string, config: UserConfig, userUUID: string, includeVideos: boolean = false): Promise<{ metas: any[] }> {
  const startTime = performance.now();
  try {
    logger.debug(`[getTrending] Fetching trending for type=${type}, language=${language}, page=${page}, genre=${genre}`);
    const media_type = type === "series" ? "tv" : type;
    const time_window = genre && ['day', 'week'].includes(genre.toLowerCase()) ? genre.toLowerCase() : "day";
    
    const parameters = { media_type, time_window, language, page };
    
    const tmdbStartTime = performance.now();
    const languages = trendingOriginalLanguages();
    const res: any = languages.length
      ? await filteredTrendingPage(parameters, Number(page) || 1, languages, config)
      : await moviedb.trending(parameters, config);
    const tmdbTime = performance.now() - tmdbStartTime;
    logger.debug(`[getTrending] TMDB trending fetch took ${tmdbTime.toFixed(2)}ms`);
    
    const metasStartTime = performance.now();
    let preferredProvider;
    if (type === 'movie') {
      preferredProvider = config.providers?.movie || 'tmdb';
    } else {
      preferredProvider = config.providers?.series || 'tvdb';
    }

    const metas = await Promise.all((res?.results || []).map(async (item: any) => {
      let stremioId = `tmdb:${item.id}`;
      const result =  await cacheWrapMetaSmart(userUUID, stremioId, async () => {
        return await getMeta(type, language, stremioId, config, userUUID, includeVideos);
      }, undefined, {enableErrorCaching: true, maxRetries: 2, config}, type as any, includeVideos);
      
      if (result && result.meta) {
        
        const certifications: any = type === 'movie'
            ? await moviedb.getMovieCertifications({ id: item.id }, config)
            : await moviedb.getTvCertifications({ id: item.id }, config);
        result.meta.app_extras = result.meta.app_extras || {};
        const cert = type === 'movie'
            ? Utils.getTmdbMovieCertificationForCountry(certifications)
            : Utils.getTmdbTvCertificationForCountry(certifications);
        result.meta.app_extras.certification = cert;
        const trendCountry = language?.split('-')[1];
        result.meta.app_extras.certificationLocal = trendCountry && trendCountry !== 'US'
            ? (type === 'movie' ? Utils.getTmdbMovieCertificationForCountry(certifications, trendCountry) : Utils.getTmdbTvCertificationForCountry(certifications, trendCountry)) || cert
            : cert;
            
        return result.meta;
      }
      return null;
    }));
    const metasTime = performance.now() - metasStartTime;
    const validMetas = metas.filter(meta => meta !== null);
    logger.debug(`[getTrending] ${validMetas.length} Metas processing took ${metasTime.toFixed(2)}ms`);

    const userRating = config.ageRating;
    let filteredMetas = validMetas;

    if (hasAgeRatingCap(config)) {
      const allowUnrated = allowsUnrated(config);
      const beforeCount = filteredMetas.length;
      const filterStartTime = performance.now();

      filteredMetas = validMetas.filter(meta =>
        passesAgeRating(meta.app_extras?.certification, type, userRating, allowUnrated)
      );

      const afterCount = filteredMetas.length;
      const filterTime = performance.now() - filterStartTime;
      if (beforeCount !== afterCount) {
        logger.debug(`[getTrending] Age rating filter removed ${beforeCount - afterCount} items in ${filterTime.toFixed(2)}ms`);
      }
    } else {
      logger.debug(`[getTrending] No age rating filtering applied (ageRating: ${userRating})`);
    }
    
    const totalTime = performance.now() - startTime;
    logger.debug(`[getTrending] Total function execution took ${totalTime.toFixed(2)}ms`);
    
    return { metas: filteredMetas };

  } catch (error: any) {
    console.error(`Error fetching trending for type=${type}:`, error.message);
    return { metas: [] };
  }
}

export { getTrending };
