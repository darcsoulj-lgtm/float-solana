'use client';
import { useEffect, useState } from 'react';
import { MarketOverviewPanel } from '@/components/market-overview';
import { StockVolumeComparisonCard } from '@/components/stock-volume-comparison';
import { validStockVolumeComparison, type StockVolumeComparison } from '@/lib/stock-volume-comparison';

export function StockVolumePreview() {
  const [comparisons, setComparisons] = useState<StockVolumeComparison[]>([]);
  const [status, setStatus] = useState('Loading verified comparison…');
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    let active = true;
    void fetch('/__float-preview/stock-volume', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw Error('Unavailable');
      const data = await response.json();
      if (!data || typeof data !== 'object' || !('comparisons' in data) || !Array.isArray(data.comparisons) || !data.comparisons.length || !data.comparisons.every(validStockVolumeComparison)) throw Error('Invalid comparison');
      if (active) { setComparisons(data.comparisons); setStatus(''); }
    }).catch(() => { if (active) setStatus('Verified comparison unavailable. Start the private preview with its local data bridge.'); });
    return () => { active = false; };
  }, []);
  if (process.env.NODE_ENV !== 'development') return null;
  return <div className="public-markets">
    <p className="stock-volume-preview-note">Private preview · Verified historical data · Oct 2, 2026</p>
    {status && <output className="stock-volume-preview-note">{status}</output>}
    <MarketOverviewPanel issuerScope="backpack" holdings={[]} hidePortfolio comparisonPreview={<StockVolumeComparisonCard comparisons={comparisons} />} />
  </div>;
}
