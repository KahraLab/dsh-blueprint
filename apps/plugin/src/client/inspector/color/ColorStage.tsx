/**
 * The three drag surfaces of the colour picker: saturation/brightness, hue and
 * alpha.
 *
 * Each one turns a pointer position into a value and reports it on every move,
 * so the canvas repaints while the pointer is still down. The drag listeners are
 * native and captured on the surface itself, which keeps the gesture working
 * even when the pointer leaves the small slider.
 */
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { colorToRgba } from '../../model/fill';
import type { Hsv } from '../../../domain/color';

interface ColorStageProps {
  hsv: Hsv;
  /** The fill's alpha, 0–1. */
  alpha: number;
  /** Solid colour shown on the thumb, `#RRGGBB`. */
  hex: string;
  /** When false the alpha track is not rendered. */
  showAlpha?: boolean;
  onChange(next: Hsv): void;
  onAlphaChange(next: number): void;
}

type Track = (rect: DOMRect, clientX: number, clientY: number) => void;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function drag(event: ReactPointerEvent<HTMLElement>, track: Track): void {
  event.preventDefault();
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  element.setPointerCapture(event.pointerId);

  const apply = (clientX: number, clientY: number): void => track(rect, clientX, clientY);
  apply(event.clientX, event.clientY);

  const stop = (): void => {
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', stop);
    element.removeEventListener('pointercancel', stop);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  const move = (moveEvent: PointerEvent): void => apply(moveEvent.clientX, moveEvent.clientY);

  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', stop);
  element.addEventListener('pointercancel', stop);
}

export function ColorStage({ hsv, alpha, hex, showAlpha = true, onChange, onAlphaChange }: ColorStageProps): ReactElement {
  return (
    <div className="bp-cp-stage">
      <div
        className="bp-cp-sv"
        data-testid="color-picker-area"
        style={{ background: `hsl(${hsv.h}, 100%, 50%)` }}
        onPointerDown={(event) =>
          drag(event, (rect, x, y) => {
            const s = clamp01((x - rect.left) / rect.width);
            const v = 1 - clamp01((y - rect.top) / rect.height);
            onChange({ ...hsv, s, v });
          })
        }
      >
        <span className="bp-cp-sv-plane">
          <span className="bp-cp-sv-white" />
          <span className="bp-cp-sv-black" />
        </span>
        <span
          className="bp-cp-sv-thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>

      <div
        className="bp-cp-hue"
        data-testid="color-picker-hue"
        onPointerDown={(event) =>
          drag(event, (rect, x) => {
            const h = clamp01((x - rect.left) / rect.width) * 360;
            onChange({ ...hsv, h });
          })
        }
      >
        <span className="bp-cp-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h}, 100%, 50%)` }} />
      </div>

      {showAlpha ? (
        <div
          className="bp-cp-alpha"
          data-testid="color-picker-alpha"
          onPointerDown={(event) =>
            drag(event, (rect, x) => onAlphaChange(clamp01((x - rect.left) / rect.width)))
          }
        >
          <span className="bp-cp-checker" />
          <span
            className="bp-cp-alpha-fill"
            style={{ background: `linear-gradient(to right, ${colorToRgba(hex, 0)}, ${hex})` }}
          />
          <span className="bp-cp-thumb" style={{ left: `${alpha * 100}%`, background: hex }} />
        </div>
      ) : null}
    </div>
  );
}
