import type { StockToken } from './tokens';
export type TesseraContext = {
  mint: string;
  sector: string;
  markPrice: number | null;
};
export function parseTesseraContext(
  input: unknown,
  tokens: readonly StockToken[],
): TesseraContext[] {
  if (!Array.isArray(input)) throw new Error('Invalid Tessera response');
  const verified = new Set(
    tokens
      .filter((token) => token.issuer === 'tessera')
      .map((token) => token.mint),
  );
  return input.flatMap((item) => {
    if (!item || typeof item !== 'object' || !verified.has(item.mint))
      return [];
    return [
      {
        mint: item.mint,
        sector:
          typeof item.sector === 'string' ? item.sector.slice(0, 100) : '',
        markPrice:
          typeof item.markPrice === 'number' &&
          Number.isFinite(item.markPrice) &&
          item.markPrice > 0
            ? item.markPrice
            : null,
      },
    ];
  });
}
