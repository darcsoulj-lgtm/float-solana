import type { MarketOverview } from '@/lib/market-data';
import { MetricInfo } from './metric-info';

export function OndoPrimaryVolume({
  data,
  now,
}: {
  data: MarketOverview | null;
  now: number;
}) {
  const source = data?.ondoVolume;
  const volume = source?.data;
  const usable =
    volume && volume.endAt <= now && now - volume.endAt <= 72 * 3600000;
  if (!usable) return null;
  return (
    <div className="market-activity-scope" data-testid="ondo-primary-volume">
      <span>Ondo mint / redeem · Solana</span>{' '}
      <strong>
        {new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 2,
        }).format(volume.usd)}
      </strong>{' '}
      <time dateTime={new Date(volume.startAt).toISOString()}>
        {new Date(volume.startAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        })}{' '}
        UTC
      </time>{' '}
      <MetricInfo label="About Ondo mint and redeem volume" learnMore="/data-methodology#pools">
        Daily token creation and redemption trades, including those through Jupiter.
        At least 10 hours behind. Separate from pool volume; not added to it.
        Does not cover all trading between holders or private market makers.{' '}
        <a
          href="https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/ondo-global-markets/index.ts"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source & method ↗
        </a>
      </MetricInfo>
    </div>
  );
}
