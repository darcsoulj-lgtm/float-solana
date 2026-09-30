'use client';
import Image from 'next/image';
import type { MouseEvent, ReactNode } from 'react';

export function MarketStockRow({
  symbol,
  name,
  logoSrc,
  selected,
  held,
  onSelect,
  href,
  mobileMarket,
  children,
}: {
  symbol: string;
  name: string;
  logoSrc?: string | null;
  selected: boolean;
  held: boolean;
  onSelect?: (symbol: string) => void;
  href?: string;
  mobileMarket?: ReactNode;
  children: ReactNode;
}) {
  const logo = logoSrc !== undefined ? (
    <span className="stock-row-logo" aria-hidden="true">
      <span>{symbol.slice(0, 1)}</span>
      {logoSrc && <Image unoptimized src={logoSrc} alt="" width={24} height={24} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
    </span>
  ) : null;
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
            className={`stock-row-trigger${logoSrc !== undefined ? ' has-logo' : ''}`}
            id={`stock-trigger-${symbol}`}
            href={href}
            aria-label={`View ${symbol} market`}
          >
            {logo}
            <span className="stock-row-identity">
              <strong className="stock-row-name" title={name}>{name}</strong>
              <span className="stock-row-symbol">{symbol}</span>
            </span>
            {held && <small>Held</small>}
          </a>
        ) : (
          <button
            className={`stock-row-trigger${logoSrc !== undefined ? ' has-logo' : ''}`}
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
            {logo}
            <span className="stock-row-identity">
              <strong className="stock-row-name" title={name}>{name}</strong>
              <span className="stock-row-symbol">{symbol}</span>
            </span>
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
