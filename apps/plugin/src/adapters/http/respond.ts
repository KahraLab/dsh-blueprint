/**
 * Turning whatever a route threw into the JSON failure shape the client reads.
 *
 * One place decides the status code for each error kind, so a route body can
 * `throw new RequestError('缺少 blueprint 参数')` and stay about its own job.
 */
import { BlueprintError } from '../../infrastructure/fs/blueprint';
import { RequestError } from './scope';

export function statusOf(error: BlueprintError): number {
  if (error.kind === 'missing') return 404;
  if (error.kind === 'exists') return 409;
  if (error.kind === 'id') return 400;
  return 422;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function failure(error: unknown): Response {
  if (error instanceof RequestError) {
    return Response.json({ ok: false, error: error.message, code: 'request' }, { status: 400 });
  }
  if (error instanceof BlueprintError) {
    return Response.json({ ok: false, error: error.message, code: error.kind }, { status: statusOf(error) });
  }
  return Response.json({ ok: false, error: message(error), code: 'internal' }, { status: 500 });
}

/** Run a route body, turning any thrown error into the host's JSON failure shape. */
export async function guarded(run: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return failure(error);
  }
}

/** Parse a JSON body; an unreadable one is a 400, the same everywhere. */
export async function bodyOf<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new RequestError('请求体不是 JSON');
  }
}
