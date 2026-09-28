'use client';
import { useState } from 'react';
import Link from '@/components/site-link';
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
  learnMore,
}: {
  label: string;
  learnMore?: string;
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
        {learnMore && <Link className="metric-learn-more" href={learnMore}>How this is measured →</Link>}
      </PopoverContent>
    </Popover>
  );
}
