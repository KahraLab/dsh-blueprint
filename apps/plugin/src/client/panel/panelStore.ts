/**
 * Panel chrome that outlives a single render: which screen is in front, how wide
 * the side rails are, and which menu is open.
 *
 * Keeping it in a store means the header, the toolbar and the panes can all read
 * and change it without passing a dozen callbacks down the tree.
 */
import { create } from 'zustand';

/** What the panel shows. `auto` lets the saved view and the Session pointer decide. */
export type PanelMode =
  | { readonly kind: 'auto' }
  | { readonly kind: 'editor'; readonly blueprintId: string }
  | { readonly kind: 'gallery'; readonly blueprintId: string | null };

export const AUTO: PanelMode = { kind: 'auto' };

export const LAYERS_MIN_WIDTH = 160;
export const LAYERS_MAX_WIDTH = 360;
export const LAYERS_DEFAULT_WIDTH = 200;
export const INSPECTOR_MIN_WIDTH = 160;
export const INSPECTOR_MAX_WIDTH = 340;
export const INSPECTOR_DEFAULT_WIDTH = 200;

type MenuName = 'move' | 'shape' | 'insert' | 'iconPicker';

interface PanelUiState {
  /** One mode per Session, so two panels cannot fight over what is in front. */
  modes: Readonly<Record<string, PanelMode>>;
  /** The Session the mounted panel is showing, for the tab title. */
  activeSession: string | null;
  layersWidth: number;
  inspectorWidth: number;
  menus: Readonly<Record<MenuName, boolean>>;

  modeOf(key: string): PanelMode;
  setActiveSession(sessionId: string | null): void;
  openBlueprint(key: string, blueprintId: string): void;
  showGallery(key: string, blueprintId: string | null): void;
  setLayersWidth(width: number): void;
  setInspectorWidth(width: number): void;
  toggleMenu(menu: MenuName): void;
  closeMenus(): void;
  setIconPicker(open: boolean): void;
}

export const usePanelUi = create<PanelUiState>()((set, get) => ({
  modes: {},
  activeSession: null,
  layersWidth: LAYERS_DEFAULT_WIDTH,
  inspectorWidth: INSPECTOR_DEFAULT_WIDTH,
  menus: { move: false, shape: false, insert: false, iconPicker: false },

  modeOf: (key) => get().modes[key] ?? AUTO,
  setActiveSession: (activeSession) => set({ activeSession }),
  openBlueprint: (key, blueprintId) => set((state) => ({
    modes: { ...state.modes, [key]: { kind: 'editor', blueprintId } },
    menus: { move: false, shape: false, insert: false, iconPicker: false },
  })),
  showGallery: (key, blueprintId) => set((state) => ({
    modes: { ...state.modes, [key]: { kind: 'gallery', blueprintId } },
    menus: { move: false, shape: false, insert: false, iconPicker: false },
  })),
  setLayersWidth: (layersWidth) => set({ layersWidth }),
  setInspectorWidth: (inspectorWidth) => set({ inspectorWidth }),
  toggleMenu: (menu) => set((state) => ({
    menus: {
      ...state.menus,
      [menu]: !state.menus[menu],
      // The tool menus are peers: opening one closes the others.
      ...(menu === 'iconPicker' ? {} : { iconPicker: false }),
      ...(menu === 'move' ? {} : { move: false }),
      ...(menu === 'shape' ? {} : { shape: false }),
      ...(menu === 'insert' ? {} : { insert: false }),
    },
  })),
  closeMenus: () => set({ menus: { move: false, shape: false, insert: false, iconPicker: false } }),
  setIconPicker: (iconPicker) => set((state) => ({ menus: { ...state.menus, iconPicker } })),
}));

/** Clamp a panel width to the range the separator allows. */
export function clampPane(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}

/**
 * One pointerdown anywhere closes menus that were clicked outside. Installed once
 * by the plugin, not by every menu, so a menu cannot outlive its owner.
 */
export function installMenuDismissal(): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.bp-menu, .bp-caret, .bp-layer-action, .bp-ip-backdrop')) return;
    usePanelUi.getState().closeMenus();
  };
  window.addEventListener('pointerdown', onPointerDown, true);
  return () => window.removeEventListener('pointerdown', onPointerDown, true);
}
