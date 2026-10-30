/**
 * One context menu for every surface.
 *
 * It is positioned at the pointer and clamped into the viewport, closes on
 * Escape, an outside press, scroll or resize, and returns focus to whatever
 * opened it.
 */
import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { registerHost, unregisterHost, useIsFirstHost } from './hosts';
import { CheckIcon } from '../icons';
import { dismissMenu, pickMenuItem, useContextMenu, type MenuItem } from './menuStore';

const MARGIN = 8;

export function ContextMenuHost(): ReactElement | null {
  const anchor = useContextMenu((state) => state.anchor);
  const items = useContextMenu((state) => state.items);
  const ref = useRef<HTMLDivElement | null>(null);
  const host = useMemo(() => Symbol('context-menu-host'), []);
  const first = useIsFirstHost(host);

  useEffect(() => {
    registerHost(host);
    return () => unregisterHost(host);
  }, [host]);

  useEffect(() => {
    if (anchor === null) return;
    const node = ref.current;
    if (node === null) return;
    const box = node.getBoundingClientRect();
    const left = Math.min(anchor.x, window.innerWidth - box.width - MARGIN);
    const top = Math.min(anchor.y, window.innerHeight - box.height - MARGIN);
    node.style.left = `${Math.max(MARGIN, left)}px`;
    node.style.top = `${Math.max(MARGIN, top)}px`;
    node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [anchor, items, first]);

  useEffect(() => {
    if (anchor === null) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current?.contains(event.target as Node)) return;
      dismissMenu();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissMenu();
      }
    };
    // Capture: a click on a card underneath must dismiss, not open it.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', dismissMenu);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', dismissMenu);
    };
  }, [anchor]);

  if (anchor === null || !first) return null;

  const choose = (item: MenuItem): void => {
    if (item.confirm === undefined) {
      pickMenuItem(item.id);
      return;
    }
    // Confirm in place: the menu becomes the question, so there is no second
    // surface that can be covered, clipped or lost.
    useContextMenu.setState({
      items: [
        { id: item.id, label: item.confirm.label, danger: true },
        { id: 'cancel', label: item.confirm.cancelLabel },
      ],
    });
  };

  return createPortal(
    <div className="bp-ctx bp-menu" role="menu" ref={ref} style={{ left: anchor.x, top: anchor.y }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="bp-menu-item"
          data-danger={item.danger || undefined}
          disabled={item.disabled}
          onClick={() => choose(item)}
        >
          {item.icon === undefined ? null : <span className="bp-menu-icon" aria-hidden="true">{item.icon}</span>}
          <span className="bp-menu-label">{item.label}</span>
          {item.checked === true ? <CheckIcon size={13} /> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}
