'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
const localDate = (day: string) => { const [y,m,d]=day.split('-').map(Number); return new Date(y,m-1,d); };
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function MarketDateNavigation({days,value,onChange,label}: {days:string[];value:string;onChange:(day:string)=>void;label:string}) {
  const [open,setOpen]=useState(false);
  const available=[...new Set(days)].sort(), index=available.indexOf(value);
  if(index<0) return null;
  const date=localDate(value), title=date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  return <fieldset className="market-date-navigation"><legend className="sr-only">{label}</legend>
    <button type="button" aria-label={`Previous ${label.toLowerCase()}`} disabled={index===0} onClick={()=>onChange(available[index-1])}><ChevronLeft size={16}/></button>
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger className="market-date-trigger" aria-label={`${label}: ${title}. Open calendar`}>{title}</PopoverTrigger><PopoverContent className="market-date-popover" align="end"><Calendar mode="single" selected={date} defaultMonth={date} startMonth={localDate(available[0])} endMonth={localDate(available.at(-1)!)} disabled={d=>!available.includes(dayKey(d))} onSelect={d=>{if(d){onChange(dayKey(d));setOpen(false);}}}/></PopoverContent></Popover>
    <button type="button" aria-label={`Next ${label.toLowerCase()}`} disabled={index===available.length-1} onClick={()=>onChange(available[index+1])}><ChevronRight size={16}/></button>
  </fieldset>;
}
