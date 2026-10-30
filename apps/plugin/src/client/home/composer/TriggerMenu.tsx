/**
 * The popup under the entry composer's caret.
 *
 * It renders whatever rows a trigger resolved, grouped by their section, and
 * only handles presentation: the composer owns the keyboard and the choice.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { Icon } from '../../ui/Icon';
import type { TriggerIcon, TriggerRow } from './sources';

/** Phosphor names, so one menu rows all draw with the same weight. */
const GLYPHS: Record<TriggerIcon, string> = {
  file: 'file',
  folder: 'folder',
  session: 'chat-circle',
  command: 'command',
  skill: 'sparkle',
};

interface TriggerMenuProps {
  id: string;
  rows: readonly TriggerRow[];
  highlight: number;
  emptyLabel: string;
  anchor: 'above' | 'below';
  onHover(index: number): void;
  onPick(row: TriggerRow): void;
}

export function TriggerMenu({
  id,
  rows,
  highlight,
  emptyLabel,
  anchor,
  onHover,
  onPick,
}: TriggerMenuProps): ReactElement {
  const list = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = list.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [highlight, rows]);

  return (
    <div
      className="bp-trigger-menu"
      data-anchor={anchor}
      data-trigger-menu=""
      // Keep the caret where it is: picking with the mouse must not blur first.
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="bp-trigger-list" id={id} role="listbox" ref={list}>
        {rows.length === 0 ? (
          <p className="bp-trigger-empty">{emptyLabel}</p>
        ) : rows.map((row, index) => {
          const first = index === 0 || rows[index - 1]?.section !== row.section;
          return (
            <div key={row.key} role="presentation">
              {first ? <p className="bp-trigger-section" role="presentation">{row.section}</p> : null}
              <button
                type="button"
                role="option"
                id={`${id}-${index}`}
                aria-selected={index === highlight}
                aria-disabled={row.disabled === true}
                disabled={row.disabled === true}
                data-active={index === highlight}
                className="bp-trigger-row"
                onMouseEnter={() => {
                  if (row.disabled !== true) onHover(index);
                }}
                onClick={() => {
                  if (row.disabled !== true) onPick(row);
                }}
              >
                <span className="bp-trigger-glyph" aria-hidden="true"><Icon name={GLYPHS[row.icon]} size={14} /></span>
                <span className="bp-trigger-label">{row.label}</span>
                {row.description === undefined ? null : <span className="bp-trigger-desc">{row.description}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
