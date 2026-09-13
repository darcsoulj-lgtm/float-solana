import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const snapshot = () => window.matchMedia(QUERY).matches;
const serverSnapshot = () => false;
export function useIsMobile() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
