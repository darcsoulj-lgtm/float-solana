import type { ComponentProps } from 'react';
// Full document navigation keeps public and authenticated routes independent
// of the framework client router, which fails in the current production build.
export default function SiteLink({ children, ...props }: ComponentProps<'a'>) {
  return <a {...props}>{children}</a>;
}
