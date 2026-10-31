/**
 * 用例需要的外部能力。
 *
 * 应用层只说「我要能读文件、能写文件、能拿到一张图标的画」，不关心底下是
 * 磁盘、内存还是网络。适配器在入口处把这些实现递进来，所以协议层里看不到
 * 一行 `node:fs`。
 */
import type { ChangeRequest, ChangeResult, StoredDocument } from './types';

/** 蓝图文档的存取。 */
export interface DocumentGateway {
  read(file: string): StoredDocument;
  change(file: string, request: ChangeRequest): ChangeResult;
}

/**
 * 一张图标的取用结果。
 *
 * 不抛异常，是因为「没下载」「名字没写」在协议层要变成两种不同的错误码，
 * 让应用层拿到一个字符串去猜，比直接说清楚更麻烦。
 */
export type IconDrawing =
  | { ok: true; svg: string }
  | { ok: false; reason: 'usage' | 'missing'; message: string };

/** 本机已下载的图标集合。 */
export interface IconSource {
  drawing(set: string, name: string): IconDrawing;
}
