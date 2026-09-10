'use client';
import { useId, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { SourceCard, EventCard } from './member-brief';
import { TOKENS } from '@/lib/tokens';
import { validateEditorial, type EditorialItem } from '@/lib/editorial';
import { api } from '@/lib/client';
function localTime(ms: number) {
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function EditorialEditor({
  item,
  kind,
  onClose,
  onSaved,
}: {
  item?: EditorialItem;
  kind: 'news' | 'event';
  onClose: () => void;
  onSaved: (status: string) => void;
}) {
  const [initialDate] = useState(() =>
    new Date(item?.published_at || Date.now()).toISOString().slice(0, 10),
  );
  const id = useId(),
    formRef = useRef<HTMLFormElement>(null),
    submitting = useRef(false);
  const [symbols, setSymbols] = useState(item?.symbols || []),
    [search, setSearch] = useState('');
  const [certainty, setCertainty] = useState(item?.certainty || 'confirmed'),
    [featured, setFeatured] = useState(!!item?.featured);
  const [knownTime, setKnownTime] = useState(item?.event_at != null),
    [preview, setPreview] = useState<EditorialItem | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  function payload(status: string) {
    const f = new FormData(formRef.current!);
    const rawTime = f.get('eventTime');
    const time =
      knownTime && typeof rawTime === 'string' && rawTime
        ? new Date(rawTime).toISOString()
        : null;
    return {
      id: item?.id,
      expected_updated_at: item?.updated_at,
      kind,
      title: f.get('title'),
      summary: f.get('summary'),
      publisher: f.get('publisher'),
      url: f.get('url'),
      published_date: f.get('publishedDate'),
      event_date: time ? time.slice(0, 10) : f.get('eventDate'),
      event_at: time,
      certainty,
      status,
      symbols,
      featured,
    };
  }
  async function save(status: string) {
    if (submitting.current) return;
    setError('');
    try {
      const b = payload(status);
      validateEditorial(b);
      submitting.current = true;
      setBusy(true);
      await api('editorial/items', b);
      onSaved(status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose();
      }}
    >
      <DialogContent className="editorial-dialog">
        <DialogTitle>
          {item ? 'Edit' : 'New'} {kind === 'news' ? 'story' : 'event'}
        </DialogTitle>
        <DialogDescription>
          {kind === 'news'
            ? 'A short summary, a trusted source, and the stocks it connects to.'
            : 'Record the source and distinguish announced dates from estimates.'}
        </DialogDescription>
        <form
          ref={formRef}
          className="editorial-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save('published');
          }}
        >
          <fieldset disabled={busy}>
            <label htmlFor={id + '-title'}>
              Title
              <input
                id={id + '-title'}
                name="title"
                defaultValue={item?.title || ''}
                maxLength={160}
                placeholder={
                  kind === 'news'
                    ? 'A clear, factual headline'
                    : 'Company · Earnings call'
                }
                required
              />
            </label>
            <label htmlFor={id + '-summary'}>
              Summary
              <textarea
                id={id + '-summary'}
                name="summary"
                defaultValue={item?.summary || ''}
                minLength={20}
                maxLength={800}
                placeholder="Summarize the source in your own words. Keep interpretation separate from facts."
                required
              />
            </label>
            <div className="editorial-form-row">
              <label htmlFor={id + '-publisher'}>
                Publisher
                <input
                  id={id + '-publisher'}
                  name="publisher"
                  defaultValue={item?.publisher || ''}
                  maxLength={80}
                  placeholder="Company investor relations"
                  required
                />
              </label>
              <label htmlFor={id + '-published'}>
                Source publication date
                <input
                  id={id + '-published'}
                  type="date"
                  name="publishedDate"
                  defaultValue={initialDate}
                  required
                />
              </label>
            </div>
            <label htmlFor={id + '-url'}>
              Original source link
              <input
                id={id + '-url'}
                type="url"
                name="url"
                defaultValue={item?.url || ''}
                placeholder="https://"
                required
              />
            </label>
            {kind === 'event' && (
              <div className="event-editor-fields">
                <Tabs
                  value={certainty}
                  onValueChange={(v) =>
                    setCertainty(String(v) as 'confirmed' | 'estimated')
                  }
                >
                  <TabsList aria-label="Date confidence">
                    <TabsTrigger value="confirmed">
                      Confirmed by source
                    </TabsTrigger>
                    <TabsTrigger value="estimated">Estimated date</TabsTrigger>
                  </TabsList>
                </Tabs>
                <label className="editorial-check">
                  <Checkbox
                    checked={knownTime}
                    onCheckedChange={(v) => setKnownTime(!!v)}
                    disabled={busy}
                  />{' '}
                  An exact time has been announced
                </label>
                {knownTime ? (
                  <label htmlFor={id + '-event-time'}>
                    Event date & time (your timezone)
                    <input
                      id={id + '-event-time'}
                      type="datetime-local"
                      name="eventTime"
                      defaultValue={
                        item?.event_at ? localTime(item.event_at) : ''
                      }
                      required
                    />
                  </label>
                ) : (
                  <label htmlFor={id + '-event-date'}>
                    Event date
                    <input
                      id={id + '-event-date'}
                      type="date"
                      name="eventDate"
                      defaultValue={item?.event_date || ''}
                      required
                    />
                  </label>
                )}
                <p className="editorial-help">
                  Confirmed times convert to each member’s timezone. Dates
                  without a time stay on the stated calendar day.
                </p>
              </div>
            )}
            <div className="editorial-stock-field">
              <span className="editorial-label">
                Related stocks · {symbols.length} selected
              </span>
              <input
                aria-label="Find stocks to tag"
                placeholder="Find a ticker or company"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="editorial-stock-options">
                {TOKENS.filter((t) =>
                  (t.symbol + ' ' + t.shortName)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ).map((t) => (
                  <label key={t.symbol}>
                    <Checkbox
                      disabled={
                        busy ||
                        (!symbols.includes(t.symbol) && symbols.length >= 10)
                      }
                      checked={symbols.includes(t.symbol)}
                      onCheckedChange={(v) =>
                        setSymbols((s) =>
                          v
                            ? [...s, t.symbol]
                            : s.filter((x) => x !== t.symbol),
                        )
                      }
                    />
                    <strong>{t.symbol}</strong>
                    <span>{t.shortName}</span>
                  </label>
                ))}
              </div>
            </div>
            {kind === 'news' && (
              <label className="editorial-check">
                <Checkbox
                  checked={featured}
                  onCheckedChange={(v) => setFeatured(!!v)}
                  disabled={busy}
                />{' '}
                Feature this story
              </label>
            )}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="editorial-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                try {
                  const p = validateEditorial(payload('draft'));
                  setPreview({
                    ...p,
                    id: item?.id || 'preview',
                    created_at: Date.now(),
                    updated_at: Date.now(),
                  } as EditorialItem);
                  setError('');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Preview
            </Button>
            {(!item || item.status === 'draft') && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void save('draft')}
              >
                Save draft
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? 'Saving…'
                : item?.status === 'published'
                  ? 'Update published item'
                  : 'Publish'}
            </Button>
            {item && item.status !== 'archived' && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void save('archived')}
              >
                Archive
              </Button>
            )}
          </div>
          {preview && (
            <section className="editorial-preview">
              <div className="editorial-preview-heading">
                <strong>Member preview</strong>
                <button type="button" onClick={() => setPreview(null)}>
                  Close preview
                </button>
              </div>
              {kind === 'news' ? (
                <SourceCard item={preview} />
              ) : (
                <EventCard item={preview} />
              )}
            </section>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
