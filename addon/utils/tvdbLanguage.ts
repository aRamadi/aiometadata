/**
 * TVDB files European Portuguese under `por` and Brazilian under `pt`, and most records
 * carry only one of the two. Falling straight from the missing one to English hands a
 * Portuguese speaker English while a Portuguese translation sits in the same record, so
 * the sibling variant is tried first.
 */
export function tvdbLanguageChain(primary: string | null | undefined): string[] {
  const code = primary || 'eng';
  const chain = [code];
  if (code === 'por') chain.push('pt');
  else if (code === 'pt') chain.push('por');
  if (!chain.includes('eng')) chain.push('eng');
  return chain;
}

/** First non-empty `field` across the chain, plus which chain entry produced it. */
export function pickTranslationWithLang(
  items: any[] | null | undefined,
  chain: string[],
  field: string
): { value: string | undefined; language: string | null } {
  if (!Array.isArray(items)) return { value: undefined, language: null };
  for (const code of chain) {
    const value = items.find(item => item?.language === code)?.[field];
    if (typeof value === 'string' && value.trim() !== '') return { value, language: code };
  }
  return { value: undefined, language: null };
}

/** First non-empty `field` across the language chain. */
export function pickTranslation(
  items: any[] | null | undefined,
  chain: string[],
  field: string
): string | undefined {
  return pickTranslationWithLang(items, chain, field).value;
}

export type LocalizationStamp = {
  titleLang: 'exact' | 'fallback';
  overviewLang: 'exact' | 'fallback';
};

/**
 * Whether a TVDB record's name and overview are in the user's own language. Keys off
 * which language matched, never the value: a Spanish "Breaking Bad" is still Spanish.
 */
export function classifyTvdbLocalization(record: any, chain: string[]): LocalizationStamp {
  const original = String(record?.originalLanguage || '').toLowerCase();
  const verdict = (items: any[] | null | undefined, field: string): 'exact' | 'fallback' => {
    const { language } = pickTranslationWithLang(items, chain, field);
    // No match means the base field is used, which is in the record's original language.
    if (language === null) return original === chain[0] ? 'exact' : 'fallback';
    return language === chain[0] ? 'exact' : 'fallback';
  };
  return {
    titleLang: verdict(record?.translations?.nameTranslations, 'name'),
    overviewLang: verdict(record?.translations?.overviewTranslations, 'overview'),
  };
}

/** First artwork of `type` across the language chain, before any untyped fallback. */
export function pickArtwork(
  artworks: any[] | null | undefined,
  type: number | string,
  chain: string[],
  field: string
): string | undefined {
  if (!Array.isArray(artworks)) return undefined;
  for (const code of chain) {
    const value = artworks.find(art => art?.type === type && art?.language === code)?.[field];
    if (value) return value;
  }
  return undefined;
}

// Fork: TVDB backgrounds (series 3, movie 15) often tie on score, and the
// first listed won, usually the oldest: Monster showed its 2024 backdrop
// over the 2026 one with the same score. Among equal scores, newest first.
const BACKGROUND_TYPES = new Set([3, 15]);

/** Whether `a` should win over `b`, two artworks of one type and language. */
export function artworkBeats(a: any, b: any): boolean {
  const scoreA = a?.score ?? 0;
  const scoreB = b?.score ?? 0;
  if (scoreA !== scoreB) return scoreA > scoreB;
  return BACKGROUND_TYPES.has(a?.type) && (Number(a?.id) || 0) > (Number(b?.id) || 0);
}

/** `artworks` with each group of equally scored backgrounds newest first;
 * everything else keeps TVDB's order. */
export function newestBackgroundsFirst(artworks: any[] | null | undefined): any[] | null | undefined {
  if (!Array.isArray(artworks) || !artworks.some(a => BACKGROUND_TYPES.has(a?.type))) return artworks;
  // Each tied group keeps the places its members had, refilled newest first.
  const groups = new Map<string, number[]>();
  artworks.forEach((art, index) => {
    if (!BACKGROUND_TYPES.has(art?.type)) return;
    const key = `${art.type}:${art.score ?? 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(index);
  });
  const out = artworks.slice();
  for (const places of groups.values()) {
    const newest = places.map(i => artworks[i]).sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
    places.forEach((place, k) => { out[place] = newest[k]; });
  }
  return out;
}

module.exports = { tvdbLanguageChain, pickTranslation, pickTranslationWithLang, pickArtwork, classifyTvdbLocalization, artworkBeats, newestBackgroundsFirst };
