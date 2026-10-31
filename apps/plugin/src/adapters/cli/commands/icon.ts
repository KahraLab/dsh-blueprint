/**
 * Icon library commands: what sets are available, download one, find an icon,
 * read its drawing.
 *
 * The library is global (`~/.dsh/blueprint/icons/`), not per blueprint: an icon is
 * material the user collected once and can drop into any blueprint.
 */
import { defineCommand } from 'citty';
import { fetchCatalog, installSet, installedSets, readIcon, searchIcons } from '../../../infrastructure/icons/store';
import { numberOf } from '../args';
import { emit } from '../output';

export const iconCatalogCommand = defineCommand({
  meta: { name: 'catalog', description: '看有哪些图标集、已经下载了哪些' },
  args: {
    q: { type: 'string', description: '按名字过滤，比如 arrow' },
    installed: { type: 'boolean', description: '只看已经下载的' },
    refresh: { type: 'boolean', description: '重新拉一次目录，不用本地缓存' },
  },
  async run({ args }) {
    const catalog = await fetchCatalog({ refresh: args.refresh });
    const installed = installedSets();
    const have = new Set(installed.map((item) => item.prefix));
    const query = (args.q ?? '').trim().toLowerCase();

    const sets = Object.values(catalog.collections)
      .filter((info) => (args.installed ? have.has(info.prefix) : true))
      .filter((info) => (query === '' ? true : `${info.prefix} ${info.name} ${info.category ?? ''}`.toLowerCase().includes(query)))
      .map((info) => ({
        prefix: info.prefix,
        name: info.name,
        total: info.total,
        category: info.category,
        installed: have.has(info.prefix),
        ...(info.license?.title ? { license: info.license.title } : {}),
      }))
      .sort((left, right) => Number(right.installed) - Number(left.installed) || left.name.localeCompare(right.name));

    emit({ ok: true, root: catalog.fetchedAt, installed, sets });
  },
});

export const iconInstallCommand = defineCommand({
  meta: { name: 'install', description: '下载一个图标集到 ~/.dsh/blueprint/icons/，之后断网也能用' },
  args: {
    prefix: { type: 'positional', description: '图标集名字，比如 lucide、tabler；从 bp icon catalog 里抄', required: true },
  },
  async run({ args }) {
    const summary = await installSet(args.prefix);
    emit({ ok: true, set: summary.prefix, name: summary.name, total: summary.total, bytes: summary.bytes });
  },
});

export const iconSearchCommand = defineCommand({
  meta: { name: 'search', description: '在已经下载的图标里按名字找；多个词用空格隔开' },
  args: {
    query: { type: 'positional', description: '要找什么，比如 search、arrow left', required: true },
    set: { type: 'string', description: '只在一个集合里找，比如 lucide' },
    limit: { type: 'string', description: '最多给几条，默认 40' },
  },
  run({ args }) {
    const matches = searchIcons(args.query, {
      ...(args.set === undefined ? {} : { set: args.set }),
      ...(args.limit === undefined ? {} : { limit: numberOf(args.limit, 'limit') }),
    });
    emit({ ok: true, query: args.query, count: matches.length, matches });
  },
});

export const iconGetCommand = defineCommand({
  meta: { name: 'get', description: '读一个图标的 SVG，写成 集合/名字，比如 lucide/search' },
  args: {
    id: { type: 'positional', description: '集合/名字，比如 lucide/search', required: true },
  },
  run({ args }) {
    const icon = readIcon(args.id);
    emit({ ok: true, set: icon.set, name: icon.name, width: icon.width, height: icon.height, svg: icon.svg });
  },
});

export const iconCommand = defineCommand({
  meta: { name: 'icon', description: '图标：看目录、下载集合、搜索、读 SVG' },
  subCommands: {
    catalog: iconCatalogCommand,
    install: iconInstallCommand,
    search: iconSearchCommand,
    get: iconGetCommand,
  },
});
