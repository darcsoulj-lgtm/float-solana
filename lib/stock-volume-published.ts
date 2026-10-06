import snapshot from './stock-volume-published.json';
import { validStockVolumeComparison, type StockVolumeComparison } from './stock-volume-comparison';

// Public display approved by Alpaca, reported directly by RJ on 4 Oct 2026.
// Fixed historical study, not an automatically refreshed production feed.
// Only the normalized, verified public figures are included; never credentials
// or raw research response files. Invalid source edits hide the card.
export function publishedStockVolumeComparisons(value: unknown = snapshot): StockVolumeComparison[] {
  return validStockVolumeComparison(value) ? [value] : [];
}
