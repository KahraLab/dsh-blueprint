/**
 * A colour picker anchored to a swatch in the inspector.
 *
 * The panel is a portal on `<body>`: the inspector scrolls and clips its own
 * content, so an absolutely positioned popover would be cut off at the rail's
 * edge. It hangs below the swatch and flips above it when the viewport runs out,
 * which is why the position is measured after the first paint.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { hsvToHex, normalizeHex, parseColor, rgbToHsv, toHex, type Hsv } from '../../../domain/color';
import { ColorStage } from './ColorStage';
import { ColorValue } from './ColorValue';

interface ColorPickerProps {
  /** The fill's colour, any CSS string the document accepts. */
  color: string;
  /** The fill's alpha, 0–1. */
  opacity: number;
  /** The swatch the panel points at. */
  anchor: HTMLElement;
  /** Colours already used in the document. */
  palette: readonly string[];
  /** Hide the alpha slider and percent field when alpha is not ours to edit. */
  showAlpha?: boolean;
  onChange(color: string, opacity: number): void;
  onClose(): void;
}

interface Draft {
  hex: string;
  hsv: Hsv;
}

/** Hue survives a trip through grey, where the RGB value no longer carries one. */
function toDraft(color: string, previousHue = 0): Draft {
  const parsed = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const hsv = rgbToHsv(parsed);
  return {
    hex: toHex(parsed),
    hsv: { h: hsv.s > 0 ? hsv.h : previousHue, s: hsv.s, v: hsv.v },
  };
}

const MARGIN = 8;
const GAP = 6;

function eyeDropperCtor(): (new () => { open(): Promise<{ sRGBHex: string }> }) | null {
  const candidate = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  return typeof candidate === 'function' ? candidate : null;
}

export function ColorPicker({ color, opacity, anchor, palette, showAlpha = true, onChange, onClose }: ColorPickerProps): ReactElement {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const normalized = normalizeHex(color) ?? '#000000';
  const [draft, setDraft] = useState<Draft>(() => toDraft(normalized));
  // A colour chosen outside the picker (a text edit, another layer) replaces the
  // draft. Our own emissions come back through props and must not.
  if (draft.hex !== normalized && normalized !== lastSent.current) {
    // Somebody else changed the colour (undo, a text edit): follow it, and stop
    // treating our previous emission as current.
    lastSent.current = null;
    setDraft(toDraft(normalized, draft.hsv.h));
  }

  const emit = useCallback(
    (hex: string): void => {
      lastSent.current = hex;
      onChange(hex, opacity);
    },
    [onChange, opacity],
  );

  const commitHsv = (hsv: Hsv): void => {
    setDraft({ hex: hsvToHex(hsv), hsv });
    emit(hsvToHex(hsv));
  };

  const commitColor = (value: string): void => {
    const next = toDraft(value, draft.hsv.h);
    setDraft(next);
    emit(next.hex);
  };

  const place = useCallback((): void => {
    const element = panelRef.current;
    if (!element) return;
    const box = anchor.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;

    const left = Math.min(Math.max(box.left, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN));
    let top = box.bottom + GAP;
    if (top + height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, box.top - height - GAP);
    }
    setPos({ left, top });
  }, [anchor]);

  useLayoutEffect(() => {
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // The swatch toggles the panel itself; closing here would reopen it on click.
      if (panelRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchor, onClose]);

  const canPickScreen = eyeDropperCtor() !== null;

  const pickFromScreen = (): void => {
    const EyeDropper = eyeDropperCtor();
    if (EyeDropper === null) return;
    new EyeDropper()
      .open()
      .then((result) => commitColor(result.sRGBHex))
      .catch(() => {
        // The reader dismissed the system picker; the colour stays as it was.
      });
  };

  return createPortal(
    <div
      ref={panelRef}
      className="bp-cp"
      role="dialog"
      aria-label={t('inspector.colorPicker')}
      data-testid="color-picker"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <div className="bp-cp-head">
        <span className="bp-cp-title">{t('inspector.colorPicker')}</span>
        <button
          type="button"
          className="bp-cp-close"
          title={t('inspector.closeColor')}
          aria-label={t('inspector.closeColor')}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <ColorStage
        hsv={draft.hsv}
        alpha={opacity}
        hex={draft.hex}
        showAlpha={showAlpha}
        onChange={commitHsv}
        onAlphaChange={(next) => onChange(draft.hex, next)}
      />

      <ColorValue
        hex={draft.hex}
        alpha={opacity}
        showAlpha={showAlpha}
        onChange={commitColor}
        onAlphaChange={(next) => onChange(draft.hex, next)}
        canPickScreen={canPickScreen}
        onPickScreen={pickFromScreen}
      />

      {palette.length > 0 ? (
        <div className="bp-cp-palette-block">
          <span className="bp-cp-palette-label">{t('inspector.pageColors')}</span>
          <div className="bp-cp-palette">
            {palette.map((entry) => (
              <button
                key={entry}
                type="button"
                className="bp-cp-swatch"
                data-testid="color-picker-palette-swatch"
                style={{ background: entry }}
                title={entry}
                aria-label={`${t('inspector.useColor')} ${entry}`}
                onClick={() => commitColor(entry)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
