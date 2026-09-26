export type TranslationLanguage = 'en' | 'ko';
export type TranslationPreference = TranslationLanguage | 'auto';
export type TranslationText = { title: string; body: string };
export const TRANSLATION_PREFERENCE_KEY = 'float-translation-language-v1';

export function translationLanguage(preference: string | null, browserLanguage = 'en'): TranslationLanguage {
  return preference === 'ko' || preference === 'en'
    ? preference
    : browserLanguage.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

// Reject changed finance identifiers and numeric values before displaying a translation.
const protectedPattern = /https?:\/\/[^\s<>"']+|[1-9A-HJ-NP-Za-km-z]{32,44}|(?<![A-Za-z0-9_])\$[A-Za-z][A-Za-z0-9.-]*|(?<![A-Za-z0-9_])[A-Z]{2,8}(?:[.-][A-Z]{1,5})?x?(?![A-Za-z0-9_])|[$€£₩]?[+-]?\d[\d,]*(?:\.\d+)?(?:%|[kKmMbB])?/gu;
const commonWords = new Set(['US', 'USA', 'UK', 'EU', 'OK', 'THE', 'AND', 'THIS', 'THAT', 'WHAT', 'WHY', 'HOW', 'WHEN', 'WHERE', 'YES', 'NO', 'NOT', 'IF', 'BUY', 'SELL']);

export function needsTranslation(text: string, target: TranslationLanguage) {
  const prose = text.replace(protectedPattern, value => commonWords.has(value) ? value : '');
  if (target === 'en') return /[가-힣]/u.test(prose);
  // Korean posts often contain an English company name or ticker; do not flag those as English posts.
  if (/[가-힣]/u.test(prose)) return false;
  return /[a-z]{2,}/iu.test(prose);
}

export function translationLiterals(text: string) { return (text.match(protectedPattern) || []).filter(value => !commonWords.has(value)); }

export function validateTranslationLiterals(text: string, values: string[]) {
  const literals = translationLiterals(text).filter(value => values.includes(value) || !/^[A-Z]{2,8}(?:[.-][A-Z]{1,5})?x?$/.test(value));
  if (JSON.stringify([...literals].sort()) !== JSON.stringify([...values].sort()))
    throw new Error('Translation introduced a protected value.');
  return text;
}
