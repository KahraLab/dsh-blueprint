/**
 * Editing keys: delete, single-letter tools, undo and redo.
 *
 * The handlers are pure predicates so they can be tested without a DOM; the
 * installer is the only part that touches `window`.
 */
import { redo, undo, useBlueprint } from './store';
import type { ShapeKind, Tool } from './types';

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return element !== null && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable);
}

export function handleDeleteKey(event: Pick<KeyboardEvent, 'key' | 'target' | 'preventDefault'>): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
  if (isTyping(event.target)) return false;
  const { selections, deleteSelection } = useBlueprint.getState();
  if (selections.length === 0) return false;
  event.preventDefault();
  deleteSelection();
  return true;
}

/** Single-key tool switching, the way the toolbar menu advertises it. */
const TOOL_KEYS: Record<string, { tool: Tool; shape?: ShapeKind }> = {
  v: { tool: 'move' },
  h: { tool: 'hand' },
  f: { tool: 'frame' },
  t: { tool: 'text' },
  r: { tool: 'shape', shape: 'rect' },
  l: { tool: 'shape', shape: 'line' },
  L: { tool: 'shape', shape: 'arrow' },
  o: { tool: 'shape', shape: 'ellipse' },
  p: { tool: 'shape', shape: 'polygon' },
  P: { tool: 'shape', shape: 'star' },
};

export function handleToolKey(
  event: Pick<KeyboardEvent, 'key' | 'target' | 'metaKey' | 'ctrlKey' | 'altKey'>,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isTyping(event.target)) return false;
  const binding = TOOL_KEYS[event.key] ?? TOOL_KEYS[event.key.toLowerCase()];
  if (!binding) return false;
  const state = useBlueprint.getState();
  state.setTool(binding.tool);
  if (binding.shape) state.setShapeKind(binding.shape);
  return true;
}

/** Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z or Ctrl+Y redo. */
export function handleHistoryKey(
  event: Pick<KeyboardEvent, 'key' | 'target' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'preventDefault'>,
): boolean {
  if (!event.metaKey && !event.ctrlKey) return false;
  if (isTyping(event.target)) return false;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    return undo();
  }
  if ((key === 'z' && event.shiftKey) || key === 'y') {
    event.preventDefault();
    return redo();
  }
  return false;
}

/** Install every editing key once; the returned function removes them again. */
export function installKeys(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (handleHistoryKey(event)) return;
    if (handleDeleteKey(event)) return;
    handleToolKey(event);
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
