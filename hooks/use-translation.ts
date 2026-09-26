'use client';
import { useRef, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from '@/lib/client';
import { needsTranslation, translationLanguage, TRANSLATION_PREFERENCE_KEY, type TranslationPreference, type TranslationText } from '@/lib/translation';
const eventName = 'float-translation-preference';
let memoryPreference: TranslationPreference | null = null;
function preference(): TranslationPreference {
  if (memoryPreference) return memoryPreference;
  try {
    const value = localStorage.getItem(TRANSLATION_PREFERENCE_KEY);
    if (value === 'ko' || value === 'en' || value === 'auto') return value;
  } catch { /* Private browsing can disable storage; the current page still works. */ }
  return memoryPreference || 'auto';
}
function snapshot() { return `${preference()}:${navigator.language}`; }
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener('storage', callback);
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener('storage', callback); };
}
export function useTranslationPreference() {
  const [setting, browserLanguage] = useSyncExternalStore(subscribe, snapshot, () => 'auto:en').split(':');
  return {
    preference: setting as TranslationPreference,
    language: translationLanguage(setting, browserLanguage),
    setPreference: (value: TranslationPreference) => {
      memoryPreference = value;
      try { localStorage.setItem(TRANSLATION_PREFERENCE_KEY, value); memoryPreference = null; } catch { /* Session-only fallback. */ }
      window.dispatchEvent(new Event(eventName));
    },
  };
}
type Result = TranslationText & { translated: boolean };
export function useTranslation(type: 'thread' | 'reply', id: string, source: TranslationText) {
  const { language } = useTranslationPreference();
  const key = JSON.stringify([type, id, source.title, source.body, language]);
  const request = useRef<string | null>(null);
  const [state, setState] = useState<{ key: string; busy: boolean; result?: Result; shown?: boolean; error?: string }>();
  const current = state?.key === key ? state : undefined;
  return {
    language,
    available: needsTranslation(source.title + '\n' + source.body, language),
    busy: !!current?.busy,
    shown: !!current?.shown,
    error: current?.error,
    value: current?.shown ? current.result : undefined,
    async toggle() {
      if (request.current === key) return;
      if (current?.result) { setState({ ...current, shown: !current.shown }); return; }
      request.current = key;
      setState({ key, busy: true });
      try {
        const result = await api<Result>('translate', { type, id, target: language });
        if (request.current === key) setState({ key, busy: false, result, shown: result.translated });
      } catch (error) {
        if (request.current === key) setState({ key, busy: false, error: error instanceof ApiError && error.status === 429 ? (language === 'ko' ? '번역 요청 한도에 도달했어요. 나중에 다시 시도해 주세요.' : 'Translation limit reached. Please try again later.') : language === 'ko' ? '번역하지 못했어요. 잠시 후 다시 시도해 주세요.' : 'Translation unavailable. Please try again later.' });
      } finally { if (request.current === key) request.current = null; }
    },
  };
}
