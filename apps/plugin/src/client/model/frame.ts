export interface Frame {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

let counter = 0;

function nextId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  counter += 1;
  return `frame-${Date.now()}-${counter}`;
}

/** A fresh phone-sized frame, cascaded so new frames do not land on top of each other. */
export function createFrame(existing: readonly Frame[]): Frame {
  const index = existing.length;
  return {
    id: nextId(),
    name: `画板 ${index + 1}`,
    x: 120 + index * 80,
    y: 120 + index * 60,
    width: 390,
    height: 844,
  };
}

export const FRAME_MIN_SIZE = 120;
