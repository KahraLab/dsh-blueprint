/**
 * The command line's outward face.
 *
 * Success is one JSON object on stdout with exit 0; failure is one JSON object
 * on stderr with a non-zero exit code. Nothing else is printed, so a model can
 * parse the output without pattern matching.
 */
import { ProjectError } from '../node/project';
import { EXIT_CODES, ProtocolError, isProtocolError } from '../protocol/errors';

export function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/** Print a failure and return the exit code the process should use. */
export function report(error: unknown): number {
  const failure = asProtocolError(error);
  const payload = { ok: false, code: failure.code, message: failure.message, ...failure.extra };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  return EXIT_CODES[failure.code];
}

/**
 * argument parsing happens in citty, which throws its own errors. A caller that
 * passed a bad flag gets a usage error, not "something went wrong inside".
 */
function asProtocolError(error: unknown): ProtocolError {
  if (isProtocolError(error)) return error;
  if (error instanceof ProjectError) {
    const code = error.kind === 'missing' ? 'NOT_FOUND' : error.kind === 'id' ? 'USAGE' : 'VALIDATION_FAILED';
    return new ProtocolError(code, error.message);
  }

  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code.startsWith('E') && error instanceof Error) {
    const message = stripAnsi(error.message);
    return new ProtocolError('USAGE', translate(message), { hint: 'bp help 看命令列表，bp help <命令> 看选项' });
  }
  return new ProtocolError('INTERNAL', error instanceof Error ? error.message : String(error), { hint: '这是命令自身的错误，不是文档的问题' });
}

/** citty speaks English; the command's callers do not. */
function translate(message: string): string {
  const known: ReadonlyArray<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^Unknown command (\S+)/, (match) => `没有 ${match[1]} 这条命令`],
    [/^Missing required positional argument: (\S+)/, (match) => `缺少参数 <${match[1]!.toLowerCase()}>`],
    [/^Missing required argument: --(\S+)/, (match) => `缺少参数 --${match[1]}`],
    [/^Invalid value for argument: --(\S+) \((\S+)\)/, (match) => `--${match[1]} 的取值 ${match[2]} 不对`],
    [/^No command specified/, () => '没有说要做什么'],
  ];
  for (const [pattern, text] of known) {
    const match = message.match(pattern);
    if (match) return text(match);
  }
  return message;
}

/** citty colours its messages; payloads must stay plain text. */
export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}
