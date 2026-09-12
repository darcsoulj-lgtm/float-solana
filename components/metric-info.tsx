'use client';
import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverDescription,
} from './ui/popover';

export function MetricInfo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="holdings-info-trigger"
        aria-label={label}
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
        aria-label={label}
      >
        <PopoverDescription>{children}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
