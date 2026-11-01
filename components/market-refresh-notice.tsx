// Keep refresh failures separate from the freshness of individual observations.
// Provider details belong in operational monitoring, never in this public notice.
export function MarketRefreshNotice({ failed, hasData }: { failed: boolean; hasData: boolean }) {
  if (!failed) return null;
  return (
    <output className="market-refresh-notice" aria-live="polite">
      {hasData ? 'Update delayed' : 'Market data temporarily unavailable'}
    </output>
  );
}
