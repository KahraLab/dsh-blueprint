let counter = 0;

export function nextId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return `${prefix}-${cryptoObj.randomUUID()}`;
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}
