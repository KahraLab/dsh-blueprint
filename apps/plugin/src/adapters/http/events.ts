/**
 * The live library channel.
 *
 * Server-sent events fit this one-way signal: the browser reconnects by
 * itself, the payload stays tiny, and it uses the same origin and cookie as
 * the JSON routes. A `ready` frame asks for one full read after every
 * (re)connect; `change` frames only carry the ids that moved.
 */
import { EVENT_STREAM } from '../../shared/config';
import type { WorkspaceChange, WorkspaceWatchers } from '../../infrastructure/fs/watch';

export interface ChangeSignal {
  seq: number;
  ids: string[] | null;
  pointer: boolean;
}


export function eventHeaders(): Record<string, string> {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
  };
}

export function openEvents(
  root: string,
  watchers: WorkspaceWatchers,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  let seq = 0;
  let ids: Set<string> | null = new Set();
  let pointer = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let stop: (() => void) | null = null;

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (timer !== null) clearTimeout(timer);
    if (heartbeat !== null) clearInterval(heartbeat);
    timer = null;
    heartbeat = null;
    stop?.();
    stop = null;
    try {
      controller?.close();
    } catch {
      // The bridge may have cancelled the stream first.
    }
  };

  const raw = (text: string): void => {
    if (closed || controller === null) return;
    try {
      controller.enqueue(encoder.encode(text));
    } catch {
      close();
    }
  };

  const send = (event: string, data: unknown): void => {
    raw(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const flush = (): void => {
    timer = null;
    if (closed) return;
    const next = ids === null ? null : [...ids];
    const moved = pointer;
    ids = new Set();
    pointer = false;
    if (next !== null && next.length === 0 && !moved) return;
    seq += 1;
    send('change', { seq, ids: next, pointer: moved });
  };

  const onChange = (change: WorkspaceChange): void => {
    if (change.ids === null) ids = null;
    else if (ids !== null) for (const id of change.ids) ids.add(id);
    if (change.pointer) pointer = true;
    if (timer === null) timer = setTimeout(flush, EVENT_STREAM.coalesceMs);
  };

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      raw('retry: 2000\n\n');
      send('ready', { seq, ids: null, pointer: false });
      stop = watchers.subscribe(root, onChange);
      heartbeat = setInterval(() => raw(': ping\n\n'), EVENT_STREAM.heartbeatMs);
      if (signal !== undefined) {
        if (signal.aborted) close();
        else signal.addEventListener('abort', close, { once: true });
      }
    },
    cancel() {
      close();
    },
  });
}
