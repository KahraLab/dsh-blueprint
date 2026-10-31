/**
 * JSON over the plugin's own routes.
 *
 * Every caller needs the same four things: read the body even when the status is
 * an error (the host puts the reason there), survive a host that is restarting,
 * tell "missing" apart from "empty", and quote the host's own words when a
 * request fails. Keeping that in one place means no view has to remember to
 * check `response.ok`, and a proxy's HTML error page still reaches the user as
 * readable text instead of a silent empty result.
 */
export interface JsonReply<T> {
  /** The request completed and the status was 2xx. */
  ok: boolean;
  /** HTTP status, or 0 when the request never reached the host. */
  status: number;
  data: T | null;
  /** The host's `error` field when it sent one. */
  error: string | null;
  /** The first bytes of a body that was not JSON, for a readable failure. */
  raw: string;
}

export interface JsonRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** How many times to try in total. Reads retry; writes do not. */
  attempts?: number;
  /** Abort the request when the caller's query was superseded. */
  signal?: AbortSignal;
}

/** Enough of a failure body to say what went wrong, without dragging in a page of HTML. */
const RAW_LIMIT = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a body once: JSON when it is, raw text when it is not. */
function decode<T>(text: string): { data: T | null; error: string | null; raw: string } {
  if (text === '') return { data: null, error: null, raw: '' };
  try {
    const data = JSON.parse(text) as T;
    const error = (data as { error?: unknown }).error;
    return { data, error: typeof error === 'string' ? error : null, raw: '' };
  } catch {
    return { data: null, error: null, raw: text.slice(0, RAW_LIMIT) };
  }
}

async function once<T>(url: string, request: JsonRequest): Promise<JsonReply<T>> {
  try {
    const response = await fetch(url, {
      method: request.method ?? 'GET',
      headers: request.body === undefined
        ? { accept: 'application/json' }
        : { accept: 'application/json', 'content-type': 'application/json' },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const body = await response.text().catch(() => '');
    const { data, error, raw } = decode<T>(body);
    return { ok: response.ok, status: response.status, data, error, raw };
  } catch {
    return { ok: false, status: 0, data: null, error: null, raw: '' };
  }
}

export async function requestJson<T>(url: string, request: JsonRequest = {}): Promise<JsonReply<T>> {
  const attempts = Math.max(1, request.attempts ?? 1);
  let reply: JsonReply<T> = { ok: false, status: 0, data: null, error: null, raw: '' };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    reply = await once<T>(url, request);
    if (reply.ok) return reply;
    // A 4xx will not become a 2xx by waiting; only retry what could be a restart.
    if (reply.status > 0 && reply.status < 500) return reply;
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

/** `HTTP 500：蓝图不存在` — a failure line that says which layer said no. */
export function describeFailure(reply: Pick<JsonReply<unknown>, 'status' | 'error' | 'raw'>): string {
  if (reply.status === 0) return '连接不上宿主';
  const reason = reply.error ?? (reply.raw === '' ? '' : reply.raw);
  return reason === '' ? `HTTP ${reply.status}` : `HTTP ${reply.status}：${reason}`;
}
