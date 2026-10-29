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
 *   bp schema                   the full contract for a model
 */
import { type CommandDef, defineCommand, renderUsage, runCommand } from 'citty';
import { subCommands } from '../cli/commands';
import { report, stripAnsi } from '../cli/output';
import { ProtocolError } from '../protocol/errors';

const DIRECTORY = `
bp — DSH 蓝图插件配套命令行工具

  bp view [id]                 看原型 / 一块屏幕 / 一个元素（JSON）
  bp selection                 用户当前选中了什么
  bp find --name 文本           按名字、类型或容器找元素
  bp apply < change.json       一次提交一批修改
  bp add / set / move / rm     单条修改的快捷写法
  bp schema                    字段、操作、错误码的完整说明

什么时候用哪条
  · 用户指着画布说「这个」「它」→ 先 bp selection
  · 用户说出了名字 → bp find
  · 都不知道 → bp view

写进去的规矩
  · 一次 apply 要么全成，要么一个都不落盘
  · 新建节点必须写语义化的 name；画板1、矩形2 这类会被拒绝
  · baseRevision 对不上就重新读，命令不会自动重试
  · 一次 apply 就是一个撤销单元

看细节
  bp help add      某条命令的全部选项
  bp schema        字段、操作和错误码
`;

const main = defineCommand({
  meta: { name: 'bp', description: '画布命令行：读写会话右侧栏里的原型画布' },
  subCommands,
  run({ rawArgs }) {
    // citty runs the matched subcommand and then the parent's run; print the
    // directory page only when no subcommand was named.
    const named = rawArgs.find((token) => !token.startsWith('-'));
    if (named && subCommands[named]) return;
    console.log(DIRECTORY);
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

async function printHelp(rawArgs: readonly string[]): Promise<void> {
  const named = rawArgs.find((token) => !token.startsWith('-'));
  const target = named && subCommands[named] ? await resolve(subCommands[named]!) : main;
  const text = stripAnsi(await renderUsage(target, target === main ? undefined : main));
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
