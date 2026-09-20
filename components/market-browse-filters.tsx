'use client';
import { ISSUERS, type IssuerId } from '@/lib/tokens';
import type { AssetFilter } from '@/lib/market-browse';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from './ui/popover';

export function MarketBrowseFilters({
  issuers,
  onIssuers,
  asset,
  onAsset,
}: {
  issuers: IssuerId[];
  onIssuers: (ids: IssuerId[]) => void;
  asset: AssetFilter;
  onAsset: (value: AssetFilter) => void;
}) {
  return (
    <div className="market-browse-filters">
      <div className="market-asset-tabs" aria-label="Asset filters">
        {(
          [
            ['all', 'All assets'],
            ['stocks', 'Stocks'],
            ['funds', 'Funds & ETFs'],
            ['private', 'Pre-IPO'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={asset === value}
            onClick={() => onAsset(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="market-issuer-selection">
        <Popover>
          <PopoverTrigger className="market-filter-trigger">
            {issuers.length ? `Issuers · ${issuers.length}` : 'All issuers'} ▾
          </PopoverTrigger>
          <PopoverContent className="market-issuer-popover" align="start">
            <PopoverTitle>Filter by issuer</PopoverTitle>
            {ISSUERS.map((issuer) => (
              <label key={issuer.id}>
                <input
                  type="checkbox"
                  checked={issuers.includes(issuer.id)}
                  onChange={() =>
                    onIssuers(
                      issuers.includes(issuer.id)
                        ? issuers.filter((id) => id !== issuer.id)
                        : [...issuers, issuer.id],
                    )
                  }
                />
                {issuer.name}
              </label>
            ))}
            <button type="button" onClick={() => onIssuers([])}>
              Clear selection
            </button>
          </PopoverContent>
        </Popover>
        {ISSUERS.filter((item) => issuers.includes(item.id)).map((item) => (
          <button
            className="market-selected-issuer"
            key={item.id}
            type="button"
            aria-label={`Remove ${item.name} filter`}
            onClick={() => onIssuers(issuers.filter((id) => id !== item.id))}
          >
            {item.name} ×
          </button>
        ))}
        {(issuers.length > 0 || asset !== 'all') && (
          <button
            type="button"
            className="market-clear-filters"
            onClick={() => {
              onIssuers([]);
              onAsset('all');
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
