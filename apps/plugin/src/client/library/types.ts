/**
 * What the list replies with and what a view needs from one scope.
 *
 * Kept apart from the store so a component can name the shape without pulling
 * the whole store into its module graph.
 */
import type { BlueprintDocument } from '../../domain/document';

export interface BlueprintSummary {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  /** The file exists but is not readable as a blueprint document. */
  broken: boolean;
}

export interface LibraryMessages {
  loadFailed: string;
  createFailed: string;
  renameFailed: string;
  deleteFailed: string;
}

export interface LibrarySlice {
  /** `null` until the first answer arrives; `[]` when the workspace has none. */
  entries: BlueprintSummary[] | null;
  /** First screen of each blueprint, when it could be read. */
  previews: Readonly<Record<string, BlueprintDocument | null>>;
  /** The blueprint this Session last opened, as the host reports it. */
  current: string | null;
  /** Folder name of the workspace the list came from, for titles. */
  workspace: string | null;
  error: string | null;
  loading: boolean;
}

export const EMPTY_SLICE: LibrarySlice = {
  entries: null,
  previews: {},
  current: null,
  workspace: null,
  error: null,
  loading: false,
};
