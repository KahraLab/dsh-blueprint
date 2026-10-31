/**
 * The floating tool palette.
 *
 * It reads and writes the editor store directly: a toolbar button changing the
 * tool is not something the canvas needs to hear about through props.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CaretIcon,
  FrameIcon,
  HandIcon,
  IconToolGlyph,
  PointerIcon,
  TextIcon,
} from '../icons';
import { useBlueprint } from '../editor/store';
import { ShapeIcon, ShapeMenu, shapeLabel } from './ShapeMenu';
import { usePanelUi } from './panelStore';

export function EditorToolbar(): ReactElement {
  const { t } = useTranslation();
  const tool = useBlueprint((state) => state.tool);
  const shapeKind = useBlueprint((state) => state.shapeKind);
  const setTool = useBlueprint((state) => state.setTool);
  const setShapeKind = useBlueprint((state) => state.setShapeKind);
  const moveMenu = usePanelUi((state) => state.menus.move);
  const shapeMenu = usePanelUi((state) => state.menus.shape);
  const iconPicker = usePanelUi((state) => state.menus.iconPicker);
  const toggleMenu = usePanelUi((state) => state.toggleMenu);
  const closeMenus = usePanelUi((state) => state.closeMenus);
  const setIconPicker = usePanelUi((state) => state.setIconPicker);

  return (
    <div className="bp-tools" role="toolbar" aria-label={t('tools.group')}>
      <div className="bp-tool-group">
        <button
          type="button"
          className="bp-tool"
          data-on={tool === 'move' || tool === 'hand'}
          title={tool === 'hand' ? t('tools.hand') : t('tools.move')}
          aria-label={t('tools.moveOrHand')}
          aria-pressed={tool === 'move' || tool === 'hand'}
          onClick={() => setTool(tool === 'hand' ? 'hand' : 'move')}
        >
          {tool === 'hand' ? <HandIcon /> : <PointerIcon />}
        </button>
        <button
          type="button"
          className="bp-caret"
          data-open={moveMenu}
          aria-label={t('tools.moveOptions')}
          aria-expanded={moveMenu}
          onClick={() => toggleMenu('move')}
        >
          <CaretIcon />
        </button>
        {moveMenu ? (
          <div className="bp-menu" role="menu">
            {([
              { id: 'move', label: t('tools.move'), Icon: PointerIcon },
              { id: 'hand', label: t('tools.hand'), Icon: HandIcon },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="bp-menu-item"
                data-on={tool === item.id}
                onClick={() => {
                  setTool(item.id);
                  closeMenus();
                }}
              >
                <item.Icon size={13} />
                <span className="bp-menu-label">{item.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="bp-tool"
        data-on={tool === 'frame'}
        title={t('tools.frame')}
        aria-label={t('tools.frame')}
        aria-pressed={tool === 'frame'}
        onClick={() => setTool('frame')}
      >
        <FrameIcon />
      </button>

      {/* Insert has one tool today, so it is a plain button: the click opens the
          picker directly. A caret only earns its place when there is something
          to choose between. */}
      <button
        type="button"
        className="bp-tool"
        title={t('tools.icon')}
        aria-label={t('tools.icon')}
        aria-haspopup="dialog"
        aria-expanded={iconPicker}
        onClick={() => {
          closeMenus();
          setIconPicker(true);
        }}
      >
        <IconToolGlyph />
      </button>

      <div className="bp-tool-group">
        <button
          type="button"
          className="bp-tool"
          data-on={tool === 'shape'}
          title={shapeLabel(shapeKind, t)}
          aria-label={t('tools.shapeAria', { name: shapeLabel(shapeKind, t) })}
          aria-pressed={tool === 'shape'}
          onClick={() => setTool('shape')}
        >
          <ShapeIcon kind={shapeKind} />
        </button>
        <button
          type="button"
          className="bp-caret"
          data-open={shapeMenu}
          aria-label={t('tools.pickShape')}
          aria-expanded={shapeMenu}
          onClick={() => toggleMenu('shape')}
        >
          <CaretIcon />
        </button>
        {shapeMenu ? (
          <ShapeMenu
            shapeKind={shapeKind}
            onPick={(kind) => {
              setShapeKind(kind);
              setTool('shape');
              closeMenus();
            }}
          />
        ) : null}
      </div>

      <button
        type="button"
        className="bp-tool"
        data-on={tool === 'text'}
        title={t('tools.text')}
        aria-label={t('tools.text')}
        aria-pressed={tool === 'text'}
        onClick={() => setTool('text')}
      >
        <TextIcon />
      </button>
    </div>
  );
}
