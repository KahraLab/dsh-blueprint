/**
 * State shared by the two central pages: which page is in front, the workspace
 * chosen, and the entry draft.
 *
 * A store keeps the prompt when the user peeks at the Dashboard and comes back,
 * and keeps the page choice out of the render tree.
 */
import { create } from 'zustand';
import { rememberWorkspace } from '../blueprintNavigation';

export type HomePage = 'entry' | 'dashboard';

interface HomeUiState {
  page: HomePage;
  selectedWorkspaceId: string | null;
  prompt: string;
  sending: boolean;
  error: string | null;

  setPage(page: HomePage): void;
  selectWorkspace(workspaceId: string): void;
  setPrompt(prompt: string): void;
  setSending(sending: boolean): void;
  setError(error: string | null): void;
}

export const useHomeUi = create<HomeUiState>()((set) => ({
  page: 'entry',
  selectedWorkspaceId: null,
  prompt: '',
  sending: false,
  error: null,

  setPage: (page) => set({ page, error: null }),
  selectWorkspace: (selectedWorkspaceId) => {
    rememberWorkspace(selectedWorkspaceId);
    set({ selectedWorkspaceId });
  },
  setPrompt: (prompt) => set({ prompt }),
  setSending: (sending) => set({ sending }),
  setError: (error) => set({ error }),
}));
