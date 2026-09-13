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

module.exports = { isOriginalTitleMode, resolveApiLanguage, shouldUseOriginalTitle };
