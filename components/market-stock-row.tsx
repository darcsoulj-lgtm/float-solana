'use client';
import type { MouseEvent, ReactNode } from 'react';

export function MarketStockRow({
  symbol,
  name,
  selected,
  held,
  onSelect,
  href,
  mobileMarket,
  children,
}: {
  symbol: string;
  name: string;
  selected: boolean;
  held: boolean;
  onSelect?: (symbol: string) => void;
  href?: string;
  mobileMarket?: ReactNode;
  children: ReactNode;
}) {
  return (
    <tr
      className={selected ? 'is-selected' : ''}
      onClick={(event: MouseEvent<HTMLTableRowElement>) => {
        if ((event.target as HTMLElement).closest('a, button, input, select, [role=button], [role=dialog]')) return;
        if (href) window.location.assign(href);
        else onSelect?.(symbol);
      }}
    >
      <td>
        {href ? (
          <a
            className="stock-row-trigger"
            id={`stock-trigger-${symbol}`}
            href={href}
            aria-label={`View ${symbol} market`}
          >
            <strong>{symbol}</strong>
            <span title={name}>{name}</span>
            {held && <small>Held</small>}
          </a>
        ) : (
          <button
            className="stock-row-trigger"
            type="button"
            id={`stock-trigger-${symbol}`}
            aria-label={`View ${symbol} details`}
            aria-pressed={selected}
            aria-expanded={selected}
            aria-controls={selected ? 'selected-stock-detail' : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(symbol);
            }}
          >
            <strong>{symbol}</strong>
            <span title={name}>{name}</span>
            {held && <small>Held</small>}
          </button>
        )}
        {mobileMarket && (
          <span className="stock-row-mobile-market">{mobileMarket}</span>
        )}
      </td>
      {children}
    </tr>
  );
}
