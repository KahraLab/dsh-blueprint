/**
 * The read side of the protocol: what is on the canvas, what the user pointed
 * at, and which nodes match a search.
 *
 * Every answer is one JSON-ready object carrying the document revision, so the
 * caller can quote the revision back when it writes. Pure functions over the
 * stored document; the command line only prints what they return.
 */
import type { Frame, Layer, LayerKind } from '../model/document';
import { LAYER_KINDS } from '../model/fields';
import { countNodes, findNodes, kindOf, locateNode, type FindFilter, type NodeLocation } from '../model/tree';
import type { StoredDocument } from '../node/docfile';
import { readSelection } from '../node/selection';
import { ProtocolError } from './errors';

/** `bp view` — the blueprint, one screen, or one element. */
export function buildView(stored: StoredDocument, id: string | undefined): Record<string, unknown> {
  const { document: doc } = stored;

  if (id !== undefined) {
    const found = locateNode(doc, id);
    if (!found) {
      throw new ProtocolError('NOT_FOUND', `找不到 id 为 ${id} 的节点`, { hint: '先跑 bp view 看蓝图里有什么' });
    }
    if (found.kind === 'frame') {
      return { ok: true, revision: stored.revision, scope: 'frame', kind: 'frame', frame: found.node };
    }
    return {
      ok: true,
      revision: stored.revision,
      scope: 'layer',
      kind: kindOf(found),
      node: found.node,
      frameId: found.frameId,
      parentId: found.parentId,
      path: found.path,
    };
  }

  const counts = countNodes(doc);
  return {
    ok: true,
    revision: stored.revision,
    blueprint: { frames: counts.frames, layers: counts.layers },
    frames: doc.frames.map(frameSummary),
    layers: doc.layers.map(layerSummary),
  };
}

/** `bp selection` — what the user is pointing at, if anything. */
export function buildSelection(stored: StoredDocument, sessionId: string | null): Record<string, unknown> {
  const reported = readSelection(sessionId);
  const { document: doc } = stored;

  const valid: NodeLocation[] = [];
  for (const item of reported) {
    const id = item.layerId ?? item.frameId;
    if (!id) continue;
    const found = locateNode(doc, id);
    if (found) valid.push(found);
  }

  if (valid.length === 0) {
    return {
      ok: true,
      revision: stored.revision,
      selection: null,
      count: 0,
      reason: reported.length > 0 ? '用户选中的元素已经不在文档里了' : '用户现在没有选中任何元素',
    };
  }

  const primary = valid[0]!;
  return {
    ok: true,
    revision: stored.revision,
    selection: describeSelection(primary),
    count: valid.length,
    ...(valid.length > 1 ? { note: '用户选中了多个元素，这是第一个；改之前先跟他确认' } : {}),
  };
}

/** `bp find` — nodes matching a name, a kind, a container, or all three. */
export function buildFind(stored: StoredDocument, args: { name?: string; kind?: string; in?: string }): Record<string, unknown> {
  const { document: doc } = stored;
  const filter: FindFilter = {};

  if (args.name !== undefined && args.name.length > 0) filter.name = args.name;
  if (args.kind !== undefined) {
    if (args.kind !== 'frame' && !LAYER_KINDS.includes(args.kind as LayerKind)) {
      throw new ProtocolError('USAGE', `不认识的 kind：${args.kind}`, { field: 'kind', hint: `能找的有：frame ${LAYER_KINDS.join(' ')}` });
    }
    filter.kind = args.kind as 'frame' | LayerKind;
  }
  if (args.in !== undefined) {
    const container = locateNode(doc, args.in);
    if (!container) throw new ProtocolError('NOT_FOUND', `找不到容器 ${args.in}`, { hint: '先跑 bp view 看蓝图里有什么' });
    filter.within = container;
  }
  if (filter.name === undefined && filter.kind === undefined && filter.within === undefined) {
    throw new ProtocolError('USAGE', 'find 至少要给一个条件：--name、--kind 或 --in', { hint: '比如 bp find --name 登录按钮' });
  }

  const { matches, truncated } = findNodes(doc, filter);
  return { ok: true, revision: stored.revision, matches: matches.map(describeMatch), truncated };
}

// ---------------------------------------------------------------- shapes

function frameSummary(frame: Frame): Record<string, unknown> {
  return {
    id: frame.id,
    name: frame.name,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    children: frame.children.map(layerSummary),
  };
}

function layerSummary(layer: Layer): Record<string, unknown> {
  return {
    id: layer.id,
    kind: layer.kind,
    name: layer.name,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    sizeW: layer.sizeW,
    sizeH: layer.sizeH,
    childCount: layer.children.length,
    ...(layer.text.length > 0 ? { text: layer.text } : {}),
  };
}

function describeSelection(found: NodeLocation): Record<string, unknown> {
  return {
    frameId: found.frameId,
    layerId: found.kind === 'layer' ? found.node.id : null,
    kind: kindOf(found),
    name: found.node.name,
    path: found.path,
  };
}

function describeMatch(found: NodeLocation): Record<string, unknown> {
  const text = (found.node as Partial<Layer>).text;
  return {
    id: found.node.id,
    kind: kindOf(found),
    name: found.node.name,
    frameId: found.frameId,
    path: found.path,
    ...(typeof text === 'string' && text.length > 0 ? { text } : {}),
  };
}
