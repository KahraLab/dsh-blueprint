/**
 * History snapshots on disk.
 *
 * Each successful write that changes the document records a snapshot of the
 * document *before* the change in `.dsh-blueprint/blueprints/<id>/history/<snapshotId>.json`.
 *
 * Metadata is kept in `.dsh-blueprint/blueprints/<id>/history/index.json`.
 * Automatic snapshots keep at most the most recent 100 entries. Manual snapshots
 * (reason starting with "manual:") are never pruned.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { customAlphabet } from 'nanoid';
import type { BlueprintDocument } from '../model/document';
import { writeJsonAtomic } from './atomic';

const newSnapshotId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

export const MAX_AUTO_SNAPSHOTS = 100;

export interface SnapshotEntry {
  id: string;
  revision: number;
  timestamp: string;
  reason: string;
  by: 'human' | 'ai';
  file: string;
}

export function historyDir(dir: string): string {
  return join(dir, 'history');
}

export function historyIndexFile(dir: string): string {
  return join(historyDir(dir), 'index.json');
}

export function readHistoryIndex(dir: string): SnapshotEntry[] {
  const file = historyIndexFile(dir);
  if (!existsSync(file)) return [];
  try {
    const content = readFileSync(file, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as SnapshotEntry[]) : [];
  } catch {
    return [];
  }
}

export function readSnapshotDocument(dir: string, fileOrId: string): BlueprintDocument | null {
  const fileName = fileOrId.endsWith('.json') ? fileOrId : `${fileOrId}.json`;
  const snapshotPath = join(historyDir(dir), fileName);
  if (!existsSync(snapshotPath)) return null;
  try {
    return JSON.parse(readFileSync(snapshotPath, 'utf8')) as BlueprintDocument;
  } catch {
    return null;
  }
}

export interface RecordSnapshotOptions {
  revision: number;
  reason: string;
  by: 'human' | 'ai';
  maxAutoSnapshots?: number;
}

export function recordSnapshot(
  blueprintDirectory: string,
  beforeDoc: BlueprintDocument,
  options: RecordSnapshotOptions,
): SnapshotEntry {
  const hDir = historyDir(blueprintDirectory);
  mkdirSync(hDir, { recursive: true });

  const id = newSnapshotId();
  const file = `${id}.json`;
  const snapshotPath = join(hDir, file);

  // Write snapshot of document before changes
  writeJsonAtomic(snapshotPath, beforeDoc);

  const entry: SnapshotEntry = {
    id,
    revision: options.revision,
    timestamp: new Date().toISOString(),
    reason: options.reason,
    by: options.by,
    file,
  };

  const entries = readHistoryIndex(blueprintDirectory);
  entries.push(entry);

  const maxAuto = options.maxAutoSnapshots ?? MAX_AUTO_SNAPSHOTS;
  const autoEntries: SnapshotEntry[] = [];
  const manualEntries: SnapshotEntry[] = [];

  for (const item of entries) {
    if (item.reason.startsWith('manual:')) {
      manualEntries.push(item);
    } else {
      autoEntries.push(item);
    }
  }

  let keptAuto = autoEntries;
  if (autoEntries.length > maxAuto) {
    const toRemove = autoEntries.slice(0, autoEntries.length - maxAuto);
    keptAuto = autoEntries.slice(autoEntries.length - maxAuto);
    for (const item of toRemove) {
      try {
        unlinkSync(join(hDir, item.file));
      } catch {
        // Ignored if already removed
      }
    }
  }

  const keptFiles = new Set([...manualEntries.map((e) => e.file), ...keptAuto.map((e) => e.file)]);
  const finalEntries = entries.filter((e) => keptFiles.has(e.file));

  writeJsonAtomic(historyIndexFile(blueprintDirectory), finalEntries);
  return entry;
}
