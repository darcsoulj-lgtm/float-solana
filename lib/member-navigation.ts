import { ISSUERS, type IssuerId } from './tokens';
export type MemberView = 'overview' | 'home' | 'topics' | 'markets' | 'profile';
export type MarketView = 'all' | IssuerId;
export function memberLocation(search: string) {
  const params = new URLSearchParams(search);
  const requested = params.get('view');
  const view: MemberView =
    requested === 'saved'
      ? 'home'
      : requested === 'backpack'
        ? 'markets'
        : requested === 'home' ||
            requested === 'topics' ||
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
        : params.get('feed') === 'saved' || params.get('feed') === 'all'
          ? params.get('feed')!
          : 'personal',
    agenda: requested === 'calendar' || params.get('agenda') === 'open',
  };
}
