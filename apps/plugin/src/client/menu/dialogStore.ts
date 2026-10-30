/**
 * Small modal questions: confirm a destructive command, or rename something.
 *
 * Callers await an answer; the host renders one dialog at a time. Keeping the
 * promise out of React means a right-click handler reads top to bottom instead
 * of threading "is the dialog open" state through the tree.
 */
import { create } from 'zustand';

export interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}

export interface PromptRequest {
  kind: 'prompt';
  title: string;
  message?: string;
  value: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Return an error message to keep the dialog open, or null to accept. */
  validate?(value: string): string | null;
}

export type DialogRequest = ConfirmRequest | PromptRequest;

interface DialogState {
  request: DialogRequest | null;
}

export const useDialog = create<DialogState>()(() => ({ request: null }));

let pending: ((value: string | boolean | null) => void) | null = null;

function open(request: DialogRequest, resolve: (value: string | boolean | null) => void): void {
  pending?.(null);
  pending = resolve;
  useDialog.setState({ request });
}

export function confirmAction(request: Omit<ConfirmRequest, 'kind'>): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    open({ kind: 'confirm', ...request }, (value) => resolve(value === true));
  });
}

export function askName(request: Omit<PromptRequest, 'kind'>): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    open({ kind: 'prompt', ...request }, (value) => resolve(typeof value === 'string' ? value : null));
  });
}

export function settleDialog(value: string | boolean | null): void {
  useDialog.setState({ request: null });
  pending?.(value);
}
