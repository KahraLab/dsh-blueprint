/**
 * The Harness supplies React DOM from its own module table; the plugin only
 * needs `createPortal` for menus and dialogs, which must escape the sidebar's
 * stacking context.
 */
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
