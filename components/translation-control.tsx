'use client';
import { Languages } from 'lucide-react';
import { useTranslation, useTranslationPreference } from '@/hooks/use-translation';

export function TranslationControl({ translation }: { translation: ReturnType<typeof useTranslation> }) {
  if (!translation.available) return null;
  const korean = translation.language === 'ko';
  return <div className="post-translation-control">
    <button type="button" disabled={translation.busy} aria-pressed={translation.shown} onClick={() => void translation.toggle()}>
      <Languages size={14} aria-hidden="true" />
      {translation.busy ? (korean ? '번역 중…' : 'Translating…') : translation.shown ? (korean ? '원문 보기' : 'View original') : (korean ? '한국어로 번역' : 'Translate to English')}
    </button>
    {translation.shown && <span>{korean ? '자동 번역' : 'Machine translated'}</span>}
    {translation.error && <output>{translation.error}</output>}
  </div>;
}

export function TranslatedReply({ id, body }: { id: string; body: string }) {
  const translation = useTranslation('reply', id, { title: '', body });
  return <>
    <p lang={translation.shown ? translation.language : undefined}>{translation.value?.body ?? body}</p>
    <TranslationControl translation={translation} />
  </>;
}

export function TranslationSettings() {
  const { preference, setPreference } = useTranslationPreference();
  return <section className="profile-appearance profile-translation" aria-labelledby="translation-heading">
    <div>
      <h3 id="translation-heading">Translation language</h3>
      <p>Translate posts when you choose. Saved on this device.</p>
    </div>
    <select aria-label="Translation language" value={preference} onChange={event => setPreference(event.target.value as 'auto' | 'ko' | 'en')}>
      <option value="auto">Device language</option>
      <option value="ko">한국어</option>
      <option value="en">English</option>
    </select>
  </section>;
}
