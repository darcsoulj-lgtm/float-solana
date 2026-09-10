'use client';
import { useId, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { api } from '@/lib/client';
export function RoomCreator({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const id = useId(),
    submitting = useRef(false);
  const [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !submitting.current) onClose();
      }}
    >
      <DialogContent className="compose-dialog">
        <DialogTitle>Start a room.</DialogTitle>
        <DialogDescription>
          A company, an idea, a shared interest. Make it yours.
        </DialogDescription>
        <form
          className="discussion-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting.current) return;
            submitting.current = true;
            setBusy(true);
            setError('');
            try {
              const room = await api<{ id: string }>('community/rooms', {
                name,
                description,
              });
              await onCreated(room.id);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              submitting.current = false;
              setBusy(false);
            }
          }}
        >
          <div className="discussion-field">
            <label htmlFor={id + '-name'}>Room name</label>
            <input
              id={id + '-name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={3}
              maxLength={60}
              required
              placeholder="e.g. The memory club"
              disabled={busy}
            />
          </div>
          <div className="discussion-field">
            <label htmlFor={id + '-description'}>What’s it about?</label>
            <textarea
              id={id + '-description'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={10}
              maxLength={240}
              required
              placeholder="Help people decide whether to join the conversation."
              disabled={busy}
            />
          </div>
          <p className="room-help">
            Open to all verified members. You’ll automatically follow your new
            room.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create room'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
