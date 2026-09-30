'use client';
import {useRef,useState} from 'react';
import {ChartNoAxesCombined,ChartPie,X} from 'lucide-react';
import {api} from '@/lib/client';
import type {StockToken} from '@/lib/tokens';
import type {PreparedAttachment} from '@/lib/discussion-attachments';
import {DiscussionAttachment} from './discussion-attachment';
export function DiscussionAttachmentComposer({tokens,value,onChange,disabled,onBusy,consent,onConsent}:{tokens:readonly StockToken[];value:PreparedAttachment|null;onChange:(v:PreparedAttachment|null)=>void;disabled:boolean;onBusy:(v:boolean)=>void;consent:boolean;onConsent:(v:boolean)=>void}) {
  const choices=tokens.filter(t=>t.issuer==='backpack');
  const [kind,setKind]=useState<'chart'|'portfolio'|null>(null);
  const [symbol,setSymbol]=useState(choices[0]?.symbol??'');
  const [period,setPeriod]=useState<1|7>(7);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef(0);
  function clear(){request.current++;onChange(null);onConsent(false);setError('');setBusy(false);onBusy(false);}
  async function prepare(){
    const id=++request.current;setBusy(true);onBusy(true);setError('');onChange(null);onConsent(false);
    try {const result=await api<PreparedAttachment>('community/attachments',{kind,symbol,period});if(id===request.current)onChange(result);}
    catch(e){if(id===request.current)setError(e instanceof Error?e.message:'Could not prepare attachment.');}
    finally{if(id===request.current){setBusy(false);onBusy(false);}}
  }
  return <div className="attachment-composer">
    <div className="attachment-tools"><button type="button" disabled={disabled||busy} aria-pressed={kind==='chart'} onClick={()=>{clear();setKind('chart');}}><ChartNoAxesCombined size={16}/>Add chart</button><button type="button" disabled={disabled||busy} aria-pressed={kind==='portfolio'} onClick={()=>{clear();setKind('portfolio');}}><ChartPie size={16}/>Add snapshot</button>{kind&&<button type="button" disabled={disabled||busy} aria-label="Remove attachment" onClick={()=>{clear();setKind(null);}}><X size={16}/></button>}</div>
    {kind==='chart'&&<div className="attachment-controls"><label>Stock<select aria-label="Chart stock" disabled={disabled||busy} value={symbol} onChange={e=>{clear();setSymbol(e.target.value);}}>{choices.map(t=><option key={t.symbol} value={t.symbol}>{t.symbol} · {t.shortName}</option>)}</select></label><label>Range<select aria-label="Chart range" disabled={disabled||busy} value={period} onChange={e=>{clear();setPeriod(Number(e.target.value) as 1|7);}}><option value={1}>1 day</option><option value={7}>7 days</option></select></label></div>}
    {kind==='portfolio'&&!value&&<p className="attachment-caption">Preview your Backpack allocation. Your address, quantities and total value stay private. Nothing is shared until you post.</p>}
    {kind&&<button className="attachment-prepare" type="button" disabled={disabled||busy} onClick={()=>void prepare()}>{busy?'Preparing…':value?'Refresh preview':'Prepare preview'}</button>}
    {error&&<p role="alert" className="field-error">{error}</p>}
    {value&&<><DiscussionAttachment attachment={value.attachment}/><p className="attachment-caption">This preview is saved exactly as shown. Post within 10 minutes or refresh it.</p>{value.attachment.kind==='portfolio'&&<label className="attachment-consent"><input type="checkbox" checked={consent} disabled={disabled} onChange={e=>onConsent(e.target.checked)}/>I agree to publish these token names and percentages with my post.</label>}</>}
  </div>;
}
