'use client';
import { useState } from 'react';
import Link from '@/components/site-link';
import { CircleAlert, Info } from 'lucide-react';
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
  variant = 'info',
  id,
}: {
  label: string;
  learnMore?: string;
  variant?: 'info' | 'status';
  id?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className="holdings-info-trigger"
        aria-label={label}
        openOnHover
        delay={200}
        closeDelay={150}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
      >
        {variant === 'status' ? <CircleAlert size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />}
      </PopoverTrigger>
      <PopoverContent
        id={id ? id + '-details' : undefined}
        className="holdings-info-popover"
        align="end"
        sideOffset={8}
        initialFocus={false}
        finalFocus={false}
        aria-label={label}
      >
        <PopoverDescription>{children}</PopoverDescription>
        {learnMore && <Link className="metric-learn-more" href={learnMore}>Methodology →</Link>}
      </PopoverContent>
    </Popover>
  );
}
