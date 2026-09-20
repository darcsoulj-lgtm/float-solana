'use client';
import type { MouseEvent, ReactNode } from 'react';

export function MarketStockRow({
  symbol,
  name,
  selected,
  held,
  onSelect,
  href,
  children,
}: {
  symbol: string;
  name: string;
  selected: boolean;
  held: boolean;
  onSelect?: (symbol: string) => void;
  href?: string;
  children: ReactNode;
}) {
  return (
    <tr
      className={selected ? 'is-selected' : ''}
      onClick={(event: MouseEvent<HTMLTableRowElement>) => {
        if (href) {
          if (!(event.target as HTMLElement).closest('a')) window.location.assign(href);
        } else onSelect?.(symbol);
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
      </td>
      {children}
    </tr>
  );
}
