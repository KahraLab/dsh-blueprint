/**
 * JSON over the plugin's own routes.
 *
 * Every caller needs the same three things: read the body even when the status
 * is an error (the host puts the reason there), survive a host that is
 * restarting, and tell "missing" apart from "empty". Keeping that in one place
 * means no view has to remember to check `response.ok`.
 */
export interface JsonReply<T> {
  /** The request completed and the status was 2xx. */
  ok: boolean;
  /** HTTP status, or 0 when the request never reached the host. */
  status: number;
  data: T | null;
}

export interface JsonRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** How many times to try in total. Reads retry; writes do not. */
  attempts?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function once<T>(url: string, request: JsonRequest): Promise<JsonReply<T>> {
  try {
    const response = await fetch(url, {
      method: request.method ?? 'GET',
      headers: request.body === undefined
        ? { accept: 'application/json' }
        : { accept: 'application/json', 'content-type': 'application/json' },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    if (!response.ok) {
      // The host still puts the reason in the body; read it, but never as success.
      const data = await response.json().catch(() => null) as T | null;
      return { ok: false, status: response.status, data };
    }
    const data = await response.json().catch(() => null) as T | null;
    return { ok: true, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function requestJson<T>(url: string, request: JsonRequest = {}): Promise<JsonReply<T>> {
  const attempts = Math.max(1, request.attempts ?? 1);
  let reply: JsonReply<T> = { ok: false, status: 0, data: null };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    reply = await once<T>(url, request);
    if (reply.ok) return reply;
    if (attempt < attempts - 1) await sleep(300 * (attempt + 1));
  }
  return reply;
}

/** A read that returns `null` instead of throwing when it cannot be served. */
export async function getJson<T>(url: string, attempts = 3): Promise<T | null> {
  const reply = await requestJson<T>(url, { attempts });
  return reply.ok ? reply.data : null;
}

/** A write. The reply keeps the host's error message, so the caller can show it. */
export function postJson<T>(url: string, body: unknown): Promise<JsonReply<T>> {
  return requestJson<T>(url, { method: 'POST', body });
}
