import { ISSUERS, type IssuerId } from './tokens';
export type MemberView = 'overview' | 'home' | 'markets' | 'profile';
export type MarketView = 'all' | IssuerId;
export function memberLocation(search: string) {
  const params = new URLSearchParams(search);
  const requested = params.get('view');
  const view: MemberView =
    requested === 'saved'
      ? 'home'
      : requested === 'backpack'
        ? 'markets'
        : requested === 'topics'
          ? 'home'
          : requested === 'home' ||
            requested === 'markets' ||
            requested === 'profile'
          ? requested
          : 'overview';
  return {
    view,
    market: (requested === 'backpack'
      ? 'backpack'
      : (ISSUERS.find((issuer) => issuer.id === params.get('issuer'))?.id ??
        'all')) as MarketView,
    feed:
      requested === 'saved'
        ? 'saved'
        : params.get('feed') === 'saved'
          ? 'saved'
          : 'all',
    agenda: requested === 'calendar' || params.get('agenda') === 'open',
  };
}
