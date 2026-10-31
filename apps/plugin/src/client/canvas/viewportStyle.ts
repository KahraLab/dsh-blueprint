/**
 * Where the world sits on screen, and how it is scaled.
 *
 * Two representations of the same viewport. At rest the scene is laid out at its
 * final size with CSS `zoom`, so text is rasterised at the size it is painted at
 * and stays sharp when zoomed in. A gesture cannot afford that: `zoom` relayouts
 * the whole subtree on every tick, and a pinch sends dozens of ticks per second.
 * While the pointer is moving the scene is scaled with `transform` instead —
 * compositor only, no layout — and the frame that ends the gesture swaps back.
 *
 * Both describe the same affine map, so the swap is invisible:
 *   transform: translate(x, y) scale(z)  →  x + w·z
 *   zoom: z  with translate(x/z, y/z)    →  (x/z + w)·z  =  x + w·z
 */
import type { CSSProperties } from 'react';
import type { Viewport } from '../editor/types';

/** 点阵底纹的格子边长，跟着画布一起缩放。 */
const GRID = 16;

/** 世界层的缩放与平移。`gesturing` 为真时只改合成器，不改排版。 */
export function worldStyleFor(viewport: Viewport, gesturing = false): CSSProperties {
  if (gesturing) {
    return {
      zoom: 1,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    };
  }
  return {
    zoom: viewport.zoom,
    transform: `translate(${viewport.x / viewport.zoom}px, ${viewport.y / viewport.zoom}px)`,
  };
}

/** 画布底色上的点阵，属于世界坐标：跟着一起平移缩放。 */
export function hostStyleFor(viewport: Viewport): CSSProperties {
  return {
    backgroundSize: `${GRID * viewport.zoom}px ${GRID * viewport.zoom}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };
}

const kebab = (key: string): string => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * 把 React 会写的样式直接写到节点上。
 *
 * 滚动手势走 requestAnimationFrame，而 React 提交状态排在绘制之后，画面就会
 * 慢一帧、时快时慢。在帧内先自己写一遍，React 随后写入同样的值。
 */
export function paintViewport(host: HTMLElement, world: HTMLElement, viewport: Viewport, gesturing: boolean): void {
  for (const [node, style] of [[world, worldStyleFor(viewport, gesturing)], [host, hostStyleFor(viewport)]] as const) {
    for (const [key, value] of Object.entries(style)) {
      if (value !== undefined) node.style.setProperty(kebab(key), String(value));
    }
  }
}
