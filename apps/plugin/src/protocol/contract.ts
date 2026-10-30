/**
 * The protocol contract: what a caller may send us, and what we publish about it.
 *
 * One zod definition drives three things, so they cannot drift:
 *
 *   - runtime validation of the JSON that `apply` receives;
 *   - the JSON Schema that `bp schema` publishes to a model;
 *   - the TypeScript types the rest of the protocol layer works with.
 *
 * Field rules themselves are not written here. They come from
 * `model/fields.ts`, the same table the canvas is checked against.
 */
import * as z from 'zod';
import { ALIGNS, DERIVED_FIELDS, DIRECTIONS, FRAME_FIELDS, JUSTIFIES, LAYER_FIELDS, LAYER_KINDS, NODE_FIELDS, type FieldSpec } from '../model/fields';
import { ProtocolError } from './errors';

/** Names the canvas makes up: 画板1, 矩形2, … A model has to do better. */
const AUTO_NAME = /^(画板|矩形|文字|椭圆|直线|箭头|多边形|星形|图标|编组|frame|rect|text|ellipse|line|arrow|polygon|star|icon|group)\s*\d*$/i;

/** Batch-local names, as used by `ref` and `@name`. */
const REF_NAME = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------- field shapes

function zodFor(spec: FieldSpec): z.ZodType {
  switch (spec.kind) {
    case 'string':
      return spec.minLength === undefined ? z.string() : z.string().min(spec.minLength);
    case 'number': {
      let schema = z.number();
      if (spec.min !== undefined) schema = schema.min(spec.min);
      if (spec.max !== undefined) schema = schema.max(spec.max);
      return schema;
    }
    case 'boolean':
      return z.boolean();
    case 'enum':
      return z.enum([...spec.values] as [string, ...string[]]);
    case 'fills':
      return z.array(
        z.union([
          z.string().min(1),
          z.strictObject({ color: z.string().min(1), opacity: z.number().min(0).max(1).optional() }, { error: 'fills 里每项要么是颜色字符串，要么是 { color, opacity }' }),
        ]),
      );
    case 'layout':
      return layoutShape();
  }
}

function layoutShape(): z.ZodType {
  const padding = z.strictObject({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() });
  return z.union([
    z.null(),
    z.strictObject({
      direction: z.enum([...DIRECTIONS] as [string, ...string[]]),
      gap: z.number().min(0).optional(),
      padding: padding.optional(),
      align: z.enum([...ALIGNS] as [string, ...string[]]).optional(),
      justify: z.enum([...JUSTIFIES] as [string, ...string[]]).optional(),
    }),
  ]);
}

/** All fields of a node, optional: a payload describes what it wants, not everything. */
function optionalFields(names: readonly string[]): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const name of names) {
    // `kind` picks the constructor and the derived fields are filled by the
    // host from what the caller named; neither is something a payload sets.
    if (name === 'kind' || DERIVED_FIELDS.includes(name)) continue;
    const spec = NODE_FIELDS[name];
    if (!spec) continue;
    shape[name] = zodFor(spec).optional();
  }
  return shape;
}

const semanticName = z
  .string()
  .trim()
  .min(1, 'name 不能为空')
  .refine((value) => !AUTO_NAME.test(value), 'name 要说明这个节点是干什么的，不要用 画板1、矩形2 这类自动编号');

const refName = z.string().regex(REF_NAME, 'ref 只能由字母、数字、下划线和短横线组成');

const children = z.array(z.unknown());

const frameNodeShape = z.strictObject(
  { ...optionalFields(FRAME_FIELDS), name: semanticName.optional(), ref: refName.optional(), children: children.optional() },
  { error: nodeObjectError },
);

const layerNodeShape = z.strictObject(
  {
    ...optionalFields(LAYER_FIELDS),
    kind: z.enum([...LAYER_KINDS] as [string, ...string[]]),
    name: semanticName.optional(),
    ref: refName.optional(),
    children: children.optional(),
  },
  { error: nodeObjectError },
);

const framePatchShape = z.strictObject(optionalFields(FRAME_FIELDS), { error: nodeObjectError });
const layerPatchShape = z.strictObject(optionalFields(LAYER_FIELDS), { error: nodeObjectError });

const idSchema = z.string().min(1, 'id 要写字符串');
const parentSchema = z.string().min(1).nullable();
const indexSchema = z.int().nonnegative().nullable();

const insertOpShape = z.strictObject({
  op: z.literal('insert'),
  parent: parentSchema.optional(),
  index: indexSchema.optional(),
  node: z.unknown(),
});
const removeOpShape = z.strictObject({ op: z.literal('remove'), id: idSchema });
const setOpShape = z.strictObject({ op: z.literal('set'), id: idSchema, patch: z.unknown() });
const moveOpShape = z.strictObject({ op: z.literal('move'), id: idSchema, parent: parentSchema.optional(), index: indexSchema.optional() });
const replaceOpShape = z.strictObject({ op: z.literal('replace'), id: idSchema, node: z.unknown() });

const requestShape = z.strictObject({
  baseRevision: z.int().nonnegative().optional(),
  reason: z.string().optional(),
  ops: z.array(z.unknown()).min(1, 'ops 是空的，没有要改的东西'),
});

// ---------------------------------------------------------------- parsed types

export interface WireNode {
  /** Validated payload without `ref` and `children`; defaults are applied later. */
  fields: Record<string, unknown>;
  children: readonly WireNode[];
  /** False when the payload left `children` out; `replace` then keeps the old ones. */
  childrenProvided: boolean;
  ref: string | null;
}

export type WireOp =
  | { op: 'insert'; parent: string | null; index: number | null; node: WireNode }
  | { op: 'remove'; id: string }
  | { op: 'set'; id: string; patch: Record<string, unknown> }
  | { op: 'move'; id: string; parent: string | null; index: number | null }
  | { op: 'replace'; id: string; node: WireNode };

export interface WireRequest {
  baseRevision?: number | null;
  reason: string | null;
  /** Untouched operations; each is parsed and built against the current document. */
  ops: readonly unknown[];
}

// ---------------------------------------------------------------- parsing

/** The envelope of an `apply` request. Problems here are usage errors. */
export function parseRequest(raw: unknown): WireRequest {
  const parsed = requestShape.safeParse(raw);
  if (!parsed.success) throw envelopeError(parsed.error);

  const ops = parsed.data.ops;
  if (ops.length === 0) {
    throw new ProtocolError('USAGE', 'ops 是空的，没有要改的东西', { field: 'ops', hint: '一次 apply 至少带一条操作' });
  }
  return { baseRevision: parsed.data.baseRevision ?? null, reason: parsed.data.reason ?? null, ops };
}

/** One operation's envelope. The document is not consulted here. */
export function parseOp(raw: unknown): WireOp {
  if (!isRecord(raw)) throw new ProtocolError('VALIDATION_FAILED', '每个操作要写成一个对象');
  const name = raw.op;
  if (typeof name !== 'string') {
    throw new ProtocolError('VALIDATION_FAILED', '每个操作都要有 op 字段', { field: 'op', hint: '只有 insert / remove / set / move / replace' });
  }

  switch (name) {
    case 'insert': {
      const parsed = insertOpShape.safeParse(raw);
      if (!parsed.success) throw issueError(parsed.error);
      if (raw.node === undefined) throw new ProtocolError('VALIDATION_FAILED', 'insert 要带 node', { field: 'node' });
      return {
        op: 'insert',
        parent: parsed.data.parent ?? null,
        index: parsed.data.index ?? null,
        node: parseNode(parsed.data.node, 'insert'),
      };
    }
    case 'remove': {
      const parsed = removeOpShape.safeParse(raw);
      if (!parsed.success) throw issueError(parsed.error);
      return { op: 'remove', id: parsed.data.id };
    }
    case 'set': {
      const parsed = setOpShape.safeParse(raw);
      if (!parsed.success) throw issueError(parsed.error);
      if (raw.patch === undefined) throw new ProtocolError('VALIDATION_FAILED', 'set 要带 patch', { field: 'patch' });
      // The patch is checked once we know whether the target is a screen or a layer.
      return { op: 'set', id: parsed.data.id, patch: raw.patch as Record<string, unknown> };
    }
    case 'move': {
      const parsed = moveOpShape.safeParse(raw);
      if (!parsed.success) throw issueError(parsed.error);
      if (raw.parent === undefined && raw.index === undefined) {
        throw new ProtocolError('VALIDATION_FAILED', 'move 要说搬到哪（parent），或者放到第几个（index）', { field: 'parent' });
      }
      return { op: 'move', id: parsed.data.id, parent: parsed.data.parent ?? null, index: parsed.data.index ?? null };
    }
    case 'replace': {
      const parsed = replaceOpShape.safeParse(raw);
      if (!parsed.success) throw issueError(parsed.error);
      if (raw.node === undefined) throw new ProtocolError('VALIDATION_FAILED', 'replace 要带 node', { field: 'node' });
      return { op: 'replace', id: parsed.data.id, node: parseNode(parsed.data.node, 'replace') };
    }
    default:
      throw new ProtocolError('VALIDATION_FAILED', `不认识的 op：${name}`, { field: 'op', hint: '只有 insert / remove / set / move / replace' });
  }
}

/**
 * One node payload, children included.
 *
 * Screens and elements are told apart by `kind`: a screen has none. Deciding
 * before validating keeps error messages about the payload the caller meant,
 * instead of a union of "neither branch matched".
 */
export function parseNode(raw: unknown, mode: 'insert' | 'replace'): WireNode {
  if (!isRecord(raw)) throw new ProtocolError('VALIDATION_FAILED', 'node 要写成一个对象', { field: 'node' });
  const isFrame = raw.kind === undefined;
  const parsed = (isFrame ? frameNodeShape : layerNodeShape).safeParse(raw);
  if (!parsed.success) throw issueError(parsed.error);

  const { children: rawChildren, ref, ...fields } = parsed.data as Record<string, unknown> & { children?: unknown[]; ref?: string };
  const built = (rawChildren ?? []).map((child) => parseNode(child, 'insert'));

  if (mode === 'insert' && typeof fields.name !== 'string') {
    throw new ProtocolError('VALIDATION_FAILED', '新节点要写 name，说明它是干什么的', {
      field: 'name',
      hint: '比如「登录页」「手机号输入框」「登录按钮」；不要用 画板1、矩形2 这类自动编号',
    });
  }
  return { fields, children: built, childrenProvided: rawChildren !== undefined, ref: ref ?? null };
}

/**
 * A `set` patch. Which fields are allowed depends on the target node, so the
 * caller passes the kind it looked up from the document.
 */
export function parsePatch(raw: unknown, kind: 'frame' | 'layer'): Record<string, unknown> {
  if (!isRecord(raw)) throw new ProtocolError('VALIDATION_FAILED', 'set 的 patch 要写成一个对象', { field: 'patch' });
  if ('kind' in raw) throw new ProtocolError('VALIDATION_FAILED', 'kind 建好就不改', { field: 'kind' });
  if (Object.keys(raw).length === 0) throw new ProtocolError('VALIDATION_FAILED', 'set 的 patch 是空的，没有要改的字段', { field: 'patch' });

  const parsed = (kind === 'frame' ? framePatchShape : layerPatchShape).safeParse(raw);
  if (!parsed.success) throw issueError(parsed.error);
  return parsed.data as Record<string, unknown>;
}

// ---------------------------------------------------------------- json schema

/** The published contract: the same shapes above, wired for JSON Schema. */
export function requestJsonSchema(): Record<string, unknown> {
  let nodeDoc: z.ZodType;
  const frameNodeDoc = z.strictObject({
    ...optionalFields(FRAME_FIELDS),
    name: semanticName.optional().meta({ description: 'insert 时必填：说明这个屏幕是干什么的' }),
    ref: refName.optional().meta({ description: '批内临时引用，不写进文档' }),
    children: z.array(z.lazy(() => nodeDoc)).optional(),
  });
  const layerNodeDoc = z.strictObject({
    ...optionalFields(LAYER_FIELDS),
    kind: z.enum([...LAYER_KINDS] as [string, ...string[]]).meta({ description: '元素种类；屏幕没有这个字段' }),
    name: semanticName.optional(),
    ref: refName.optional().meta({ description: '批内临时引用，不写进文档' }),
    children: z.array(z.lazy(() => nodeDoc)).optional(),
  });
  nodeDoc = z.union([frameNodeDoc, layerNodeDoc]);

  const opDoc = z.discriminatedUnion('op', [
    z.strictObject({
      op: z.literal('insert'),
      parent: parentSchema.optional().meta({ description: '放进哪个容器；null 表示画布最外层' }),
      index: indexSchema.optional(),
      node: nodeDoc,
    }),
    z.strictObject({ op: z.literal('remove'), id: idSchema }),
    z.strictObject({
      op: z.literal('set'),
      id: idSchema,
      patch: z.union([framePatchShape, layerPatchShape]).meta({ description: '能改哪些字段取决于目标是屏幕还是元素' }),
    }),
    z.strictObject({ op: z.literal('move'), id: idSchema, parent: parentSchema.optional(), index: indexSchema.optional() }),
    z.strictObject({ op: z.literal('replace'), id: idSchema, node: nodeDoc }),
  ]);

  const requestDoc = z.strictObject({
    baseRevision: z.int().nonnegative().optional().meta({ description: '读到的 revision，可选（无锁写入可省略）' }),
    reason: z.string().optional().meta({ description: '这次修改做了什么，给人和历史看' }),
    ops: z.array(opDoc).min(1),
  });

  return z.toJSONSchema(requestDoc, { target: 'draft-2020-12', cycles: 'ref' });
}

// ---------------------------------------------------------------- errors

function nodeObjectError(issue: { code?: string; keys?: string[] }): string | undefined {
  if (issue.code === 'unrecognized_keys' && issue.keys) {
    return `不认识的字段：${issue.keys.join('、')}`;
  }
  return undefined;
}

function envelopeError(error: z.ZodError): ProtocolError {
  const issue = firstLeaf(error.issues);
  const field = fieldOf(issue.path);
  return new ProtocolError('USAGE', messageFor(issue), {
    ...(field ? { field } : {}),
    hint: '请求形如 { "reason": "...", "ops": [...] }',
  });
}

function issueError(error: z.ZodError): ProtocolError {
  const issue = firstLeaf(error.issues);
  return new ProtocolError('VALIDATION_FAILED', messageFor(issue), {
    ...(fieldOf(issue.path) ? { field: fieldOf(issue.path) } : {}),
    hint: '字段和取值见 bp schema；这一批整体不会落盘',
  });
}

interface IssueLike {
  code: string;
  path: readonly (string | number | symbol)[];
  message: string;
  errors?: readonly IssueLike[][];
  expected?: string;
  minimum?: number;
  maximum?: number;
  values?: readonly unknown[];
  keys?: readonly string[];
}

/** Union errors hide the useful leaf; walk down to the first one. */
function firstLeaf(issues: readonly unknown[]): IssueLike {
  let list = issues as readonly IssueLike[];
  for (;;) {
    const [head] = list;
    if (!head) return { code: 'custom', path: [], message: '输入不合法' };
    if (Array.isArray(head.errors) && head.errors.length > 0) {
      list = head.errors[0] ?? [];
      continue;
    }
    return head;
  }
}

function fieldOf(path: readonly (string | number | symbol)[]): string | null {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const part = path[index];
    if (typeof part === 'string') return part;
  }
  return null;
}

function messageFor(issue: IssueLike): string {
  const field = fieldOf(issue.path);
  const label = field === null ? '' : `「${field}」`;
  switch (issue.code) {
    case 'invalid_type':
      return `${label}要写${typeName(issue.expected)}`;
    case 'unrecognized_keys':
      return nodeObjectError(issue as { code?: string; keys?: string[] }) ?? `${label}里没有这些字段`;
    case 'too_small':
      return issue.minimum === undefined ? `${label}太短了` : `${label}不能小于 ${issue.minimum}`;
    case 'too_big':
      return issue.maximum === undefined ? `${label}太长了` : `${label}不能大于 ${issue.maximum}`;
    case 'invalid_value':
      return `${label}只能是：${(issue.values ?? []).join('、')}`;
    case 'invalid_union':
      return `${label}写法不对`;
    default:
      return issue.message;
  }
}

function typeName(expected: string | undefined): string {
  const names: Record<string, string> = { string: '字符串', number: '数字', int: '整数', boolean: 'true 或 false', array: '数组', object: '对象', null: 'null' };
  return names[expected ?? ''] ?? '正确的类型';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
