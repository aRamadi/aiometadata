// Resolves the "Original Title" sentinel value to a real locale before it is
// used for anything other than title selection (upstream API calls, cache
// keys, country/certification lookups, poster/logo language matching, etc.).

export function isOriginalTitleMode(language: string): boolean {
  return language === 'original';
}

export function resolveApiLanguage(language: string, fallback: string = 'en-US'): string {
  return isOriginalTitleMode(language) ? fallback : language;
}

/**
 * True when a title should be shown in its own original language: either
 * Display Language is set to "Original Title" outright, or the item's
 * original language is in the user's per-language allowlist (e.g. always
 * show Arabic- and Italian-original titles untranslated, everything else
 * in the normal Display Language).
 */
export function shouldUseOriginalTitle(
  language: string,
  originalLanguage?: string | null,
  originalTitleLanguages?: string[] | null
): boolean {
  if (isOriginalTitleMode(language)) return true;
  if (!originalLanguage || !Array.isArray(originalTitleLanguages) || originalTitleLanguages.length === 0) {
    return false;
  }
  const base = originalLanguage.toLowerCase();
  return originalTitleLanguages.some(l => l?.split('-')[0]?.toLowerCase() === base);
}

/** Base codes ("ar") of the Original Title Languages list. */
function originalTitleBases(originalTitleLanguages?: string[] | null): string[] {
  if (!Array.isArray(originalTitleLanguages)) return [];
  return Array.from(new Set(originalTitleLanguages
    .map(l => l?.split('-')[0]?.toLowerCase())
    .filter((l): l is string => !!l)));
}

/**
 * The include_video_language list for a TMDB details call: the display
 * language, English and untagged, plus the Original Title Languages, so a
 * title made in one of them can show its own trailers (most Arabic series'
 * trailers on TMDB are tagged Arabic and nothing else).
 */
export function videoLanguagesFor(langCode: string, originalTitleLanguages?: string[] | null): string {
  return Array.from(new Set([langCode, 'en', 'null', ...originalTitleBases(originalTitleLanguages)])).join(',');
}

/**
 * The trailers to show from all a title has (each tagged with its ISO 639-1
 * `lang`).  A title made in one of the Original Title Languages shows its
 * own-language trailers first, then the display language's and English.
 * Anything else keeps the usual choice (display language, else English,
 * else whatever there is) but never falls back to a trailer in one of those
 * languages, which videoLanguagesFor only fetched for titles made in them.
 */
export function pickTrailers(
  trailers: any[],
  langCode: string,
  originalLanguage?: string | null,
  originalTitleLanguages?: string[] | null
): any[] {
  if (!Array.isArray(trailers) || trailers.length === 0) return [];
  const extra = originalTitleBases(originalTitleLanguages);
  const own = (originalLanguage || '').split('-')[0].toLowerCase();
  if (own && extra.includes(own)) {
    const first = trailers.filter(t => t?.lang === own);
    if (first.length > 0) {
      const rest = trailers.filter(t => t?.lang !== own && (t?.lang === langCode || t?.lang === 'en'));
      return [...first, ...rest];
    }
  }
  const usable = trailers.filter(t => t?.lang === langCode || !extra.includes(t?.lang));
  const userLang = usable.filter(t => t?.lang === langCode);
  if (userLang.length > 0) return userLang;
  const english = usable.filter(t => t?.lang === 'en');
  return english.length > 0 ? english : usable;
}

module.exports = { isOriginalTitleMode, resolveApiLanguage, shouldUseOriginalTitle, videoLanguagesFor, pickTrailers };
