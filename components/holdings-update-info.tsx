'use client';
import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverDescription,
} from './ui/popover';

export function HoldingsUpdateInfo({
  checking,
  available,
  checkedAt,
}: {
  checking: boolean;
  available: boolean;
  checkedAt: number | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="holdings-info-trigger"
        aria-label="Holdings update details"
        openOnHover
        delay={200}
        closeDelay={150}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
      >
        <Info size={14} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        className="holdings-info-popover"
        align="end"
        sideOffset={8}
        initialFocus={false}
        finalFocus={false}
        aria-label="Holdings updates"
      >
        <PopoverDescription className="holdings-info-description">
          <span>
            {checking
              ? 'Checking holdings…'
              : available
                ? 'Updates every minute'
                : 'Verify wallet to enable updates'}
          </span>
          {checkedAt && (
            <span className="holdings-info-time">
              Last checked{' '}
              <time dateTime={new Date(checkedAt).toISOString()}>
                {new Date(checkedAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            </span>
          )}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
