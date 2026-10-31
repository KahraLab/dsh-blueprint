/**
 * `bp` — the canvas command line.
 *
 * A model cannot see the canvas, so this is how it looks and edits. Every
 * command writes one JSON object; failures are JSON on stderr with a non-zero
 * exit code. This file is only the entry point: dispatch, help, and turning a
 * thrown `ProtocolError` into that output.
 *
 *   bp view                     what is on the canvas (or one screen / one node)
 *   bp selection                what the user is pointing at
 *   bp find --name 登录按钮      which nodes match
 *   bp apply < change.json      one batch of operations, all or nothing
 *   bp add / set / move / rm    one change each, the same write path
 *   bp group <id,id>            put sibling layers into one group
 *   bp schema                   the full contract for a model
 *
 * Running `bp` with no command prints citty's command list plus the workflow
 * rules; the command list is generated, so it cannot drift from the registry.
 */
import { type CommandDef, defineCommand, renderUsage, runCommand } from 'citty';
import { subCommands } from '../adapters/cli/commands';
import { report, stripAnsi } from '../adapters/cli/output';
import { ProtocolError } from '../application/errors';
import { CORE_RULES } from '../application/guide';

const ORDER = `怎么选命令
  · 用户指着画布说「这个」「它」→ 先 bp selection
  · 用户说出了名字 → bp find
  · 都不知道 → bp view
  · 不知道在哪个蓝图里 → bp blueprint list / bp session
`;

const RULES = `写进去的规矩
${CORE_RULES.map((rule) => `  · ${rule}`).join('\n')}
`;

const main = defineCommand({
  meta: { name: 'bp', description: '画布命令行：读写会话右侧栏里的蓝图画布' },
  subCommands,
  async run({ rawArgs }) {
    // citty runs the matched subcommand and then the parent's run; print the
    // directory page only when no subcommand was named. The command list comes
    // from citty itself, so it cannot go stale when a command is added.
    const named = rawArgs.find((token) => !token.startsWith('-'));
    if (named && subCommands[named]) return;
    process.stdout.write(await directoryPage());
  },
});

// `help <命令>` is itself a command, so a model can ask for one page at a time.
subCommands.help = defineCommand({
  meta: { name: 'help', description: '看某条命令的详细说明：bp help add' },
  args: { command: { type: 'positional', description: '命令名', required: false } },
  async run({ args }) {
    const name = args.command;
    if (!name) {
      await printHelp([]);
      return;
    }
    if (!subCommands[name]) {
      throw new ProtocolError('USAGE', `没有 ${name} 这条命令`, { hint: `能看的：${Object.keys(subCommands).join(' ')}` });
    }
    await printHelp([name]);
  },
});

/** Subcommand entries may be thunks; help needs the real thing. */
async function resolve(entry: NonNullable<(typeof subCommands)[string]>): Promise<CommandDef<any>> {
  return typeof entry === 'function' ? await entry() : await entry;
}

/** Usage from citty, plus the rules that are not a list of flags. */
async function directoryPage(): Promise<string> {
  const usage = stripAnsi(await renderUsage(main));
  return `${usage}\n\n${ORDER}\n${RULES}`;
}

async function printHelp(rawArgs: readonly string[]): Promise<void> {
  const named = rawArgs.find((token) => !token.startsWith('-'));
  const target = named && subCommands[named] ? await resolve(subCommands[named]!) : main;
  if (target === main) {
    process.stdout.write(await directoryPage());
    return;
  }
  const text = stripAnsi(await renderUsage(target, main));
  process.stdout.write(`${text}\n`);
}

function wantsHelp(rawArgs: readonly string[]): boolean {
  return rawArgs.includes('--help') || rawArgs.includes('-h');
}

const rawArgs = process.argv.slice(2);

try {
  if (wantsHelp(rawArgs)) {
    await printHelp(rawArgs);
  } else {
    await runCommand(main, { rawArgs });
  }
} catch (error) {
  process.exitCode = report(error);
}
