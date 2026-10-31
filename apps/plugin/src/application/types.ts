/**
 * 应用层的数据形状。
 *
 * 这两组类型是「一次读写要传什么、拿回什么」，不是磁盘格式也不是 HTTP
 * 格式。放在应用层，是因为用例只该认这些字段；把它们写在文件系统适配器
 * 里，用例就得反过来 import 适配器，依赖方向就倒了。
 */
import type { BlueprintDocument } from '../domain/document';
import type { DocumentOp } from '../domain/ops';

/** 一份蓝图文件的内容：身份、版本号，加上文档本身。 */
export interface StoredDocument {
  schema: number;
  id: string;
  title: string;
  createdAt: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  document: BlueprintDocument;
}

/** 画布报给宿主的选中项。 */
export interface StoredSelection {
  frameId: string | null;
  layerId: string | null;
}

/** 一次写入要说清楚的事。 */
export interface ChangeRequest {
  ops?: readonly DocumentOp[];
  /** 整份文档，只在画布的差异补丁应用不了时兜底。 */
  document?: BlueprintDocument;
  by: string;
  reason?: string | null;
  maxAutoSnapshots?: number;
}

/** 一次写入的结果。失败时文档保持原样。 */
export interface ChangeResult {
  ok: boolean;
  /** 尝试结束后文件里的版本号；失败时就是原来的值。 */
  revision: number;
  /** 文件现在的样子，被拒的写手可以据此重来。 */
  document: BlueprintDocument;
  error: string | null;
  /** 哪一条操作没通过、为什么。 */
  failure: { index: number; message: string } | null;
  /** 所有操作跑完之后，整份文档暴露出来的问题。 */
  problems: readonly string[];
}
