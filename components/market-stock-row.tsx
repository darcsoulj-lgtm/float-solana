'use client';
import type { ReactNode } from 'react';

export function MarketStockRow({
  symbol,
  name,
  selected,
  held,
  onSelect,
  children,
}: {
  symbol: string;
  name: string;
  selected: boolean;
  held: boolean;
  onSelect: (symbol: string) => void;
  children: ReactNode;
}) {
  return (
    <tr
      className={selected ? 'is-selected' : ''}
      onClick={() => onSelect(symbol)}
    >
      <td>
        <button
          type="button"
          id={`stock-trigger-${symbol}`}
          aria-label={`View ${symbol} details`}
          aria-pressed={selected}
          aria-expanded={selected}
          aria-controls={selected ? 'selected-stock-detail' : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(symbol);
          }}
        >
          <strong>{symbol}</strong>
          <span>{name}</span>
          {held && <small>Held</small>}
        </button>
      </td>
      {children}
    </tr>
  );
}
