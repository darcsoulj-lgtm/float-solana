'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ChartNoAxesCombined,ChartPie,X} from 'lucide-react';
import {SearchPicker} from './search-picker';
import {api} from '@/lib/client';
import type {StockToken} from '@/lib/tokens';
import type {PreparedAttachment} from '@/lib/discussion-attachments';
import {DiscussionAttachment} from './discussion-attachment';
export function DiscussionAttachmentComposer({tokens,value,onChange,disabled,onBusy,onRequired,consent,onConsent}:{tokens:readonly StockToken[];value:PreparedAttachment|null;onChange:(v:PreparedAttachment|null)=>void;disabled:boolean;onBusy:(v:boolean)=>void;onRequired:(v:boolean)=>void;consent:boolean;onConsent:(v:boolean)=>void}) {
  const choices=useMemo(()=>tokens.filter(t=>t.issuer==='backpack').sort((a,b)=>a.symbol.localeCompare(b.symbol)),[tokens]);
  const items=useMemo(()=>choices.map(token=>({value:token.symbol,label:`${token.symbol} · ${token.shortName}`})),[choices]);
  const [kind,setKind]=useState<'chart'|'portfolio'|null>(null);
  const [symbol,setSymbol]=useState('');
  const [period,setPeriod]=useState<1|7>(7);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef(0);
  function change(next:'chart'|'portfolio'|null){request.current++;onChange(null);onConsent(false);setError('');onRequired(next!==null);const preparing=next==='portfolio'||(next==='chart'&&!!symbol);setBusy(preparing);onBusy(preparing);}
  const prepare=useCallback(async (nextKind:'chart'|'portfolio',nextSymbol:string,nextPeriod:1|7)=>{
    const id=++request.current;
    setBusy(true);onBusy(true);onRequired(true);onChange(null);onConsent(false);setError('');
    try {const result=await api<PreparedAttachment>('community/attachments',{kind:nextKind,symbol:nextSymbol,period:nextPeriod});if(id===request.current)onChange(result);}
    catch(e){if(id===request.current)setError(e instanceof Error?e.message:'Could not prepare attachment.');}
    finally{if(id===request.current){setBusy(false);onBusy(false);}}
  },[onBusy,onRequired,onChange,onConsent]);
  useEffect(()=>{
    if(!value||!kind)return;
    const timer=setTimeout(()=>void prepare(kind,symbol,period),Math.max(0,value.expiresAt-Date.now()));
    return ()=>clearTimeout(timer);
  },[value,kind,symbol,period,prepare]);
  return <div className="attachment-composer">
    <div className="attachment-tools"><button type="button" disabled={disabled} aria-pressed={kind==='chart'} onClick={()=>{change('chart');setKind('chart');if(symbol)void prepare('chart',symbol,period);}}><ChartNoAxesCombined size={16}/>Add chart</button><button type="button" disabled={disabled} aria-pressed={kind==='portfolio'} onClick={()=>{change('portfolio');setKind('portfolio');void prepare('portfolio',symbol,period);}}><ChartPie size={16}/>Add snapshot</button>{kind&&<button type="button" disabled={disabled} aria-label="Remove attachment" onClick={()=>{change(null);setKind(null);}}><X size={16}/></button>}</div>
    {kind==='chart'&&<div className="attachment-controls"><div className="attachment-stock-picker"><span>Stock</span><SearchPicker label="Chart stock" value={symbol} items={items} disabled={disabled} onChange={next=>{if(next!==symbol){change('chart');setSymbol(next);void prepare('chart',next,period);}}}/></div><label>Range<select aria-label="Chart range" disabled={disabled} value={period} onChange={e=>{change('chart');const next=Number(e.target.value) as 1|7;setPeriod(next);if(symbol)void prepare('chart',symbol,next);}}><option value={1}>1 day</option><option value={7}>7 days</option></select></label></div>}
    {busy&&<output className="attachment-caption">Preparing {kind==='chart'?'chart':'snapshot'}…</output>}
    {error&&<><p role="alert" className="field-error">{error}</p><button type="button" disabled={disabled} onClick={()=>{if(kind){change(kind);void prepare(kind,symbol,period);}}}>Try again</button></>}
    {value&&<><DiscussionAttachment attachment={value.attachment}/>{value.attachment.kind==='portfolio'&&<label className="attachment-consent"><input type="checkbox" checked={consent} disabled={disabled} onChange={e=>onConsent(e.target.checked)}/><span>Share these holdings and percentages with my post.</span></label>}</>}
  </div>;
}
