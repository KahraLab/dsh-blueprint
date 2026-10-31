/**
 * Colours used by the current selection, with one click to replace them all.
 *
 * Clicking a swatch opens the picker without the alpha control: alpha belongs
 * to each fill and stroke, so this operation changes only the colour.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsedColor } from './color/palette';
import { ColorPicker } from './color/ColorPicker';

interface SelectionColorsSectionProps {
  colors: readonly UsedColor[];
  palette: readonly string[];
  onReplace(from: string, to: string): void;
}

interface Anchor {
  color: string;
  element: HTMLButtonElement;
}

export function SelectionColorsSection({ colors, palette, onReplace }: SelectionColorsSectionProps): ReactElement {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.selectionColors')}</h5>

      {colors.map(({ color, count }) => (
        <div className="bp-color-use" key={color}>
          <button
            type="button"
            className="bp-swatch"
            data-testid="inspector-selection-color"
            aria-haspopup="dialog"
            aria-expanded={anchor?.color === color}
            aria-label={t('inspector.replaceColor')}
            title={color}
            onClick={(event) => {
              // The picker's outside-click listener must not close the panel
              // another swatch is about to replace.
              event.stopPropagation();
              const element = event.currentTarget;
              setAnchor((current) => (current?.element === element ? null : { color, element }));
            }}
          >
            <span className="bp-swatch-fill" style={{ background: color }} />
          </button>
          <span className="bp-color-use-value">{color}</span>
          <span className="bp-color-use-count">{t('inspector.colorUses', { count })}</span>
        </div>
      ))}

      {anchor === null ? null : (
        <ColorPicker
          color={anchor.color}
          opacity={1}
          anchor={anchor.element}
          palette={palette}
          showAlpha={false}
          onChange={(color) => {
            onReplace(anchor.color, color);
            setAnchor(null);
          }}
          onClose={() => setAnchor(null)}
        />
      )}
    </section>
  );
}
