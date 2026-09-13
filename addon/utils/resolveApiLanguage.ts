// Resolves the "Original Title" sentinel value to a real locale before it is
// used for anything other than title selection (upstream API calls, cache
// keys, country/certification lookups, poster/logo language matching, etc.).

export function isOriginalTitleMode(language: string): boolean {
  return language === 'original';
}

export function resolveApiLanguage(language: string, fallback: string = 'en-US'): string {
  return isOriginalTitleMode(language) ? fallback : language;
}

module.exports = { isOriginalTitleMode, resolveApiLanguage };
