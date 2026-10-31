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
  /** Whether the entry page has already offered its starter prompt once. */
  starterApplied: boolean;
  /** Preset picked for the Session this page starts; null keeps the Host default. */
  permission: string | null;
  sending: boolean;
  error: string | null;

  setPage(page: HomePage): void;
  selectWorkspace(workspaceId: string): void;
  setPrompt(prompt: string): void;
  /** Fill an empty draft with the localized canvas starter, once per page load. */
  offerStarter(starter: string): void;
  setPermission(preset: string): void;
  setSending(sending: boolean): void;
  setError(error: string | null): void;
}

export const useHomeUi = create<HomeUiState>()((set) => ({
  page: 'entry',
  selectedWorkspaceId: null,
  prompt: '',
  starterApplied: false,
  permission: null,
  sending: false,
  error: null,

  setPage: (page) => set({ page, error: null }),
  selectWorkspace: (selectedWorkspaceId) => {
    rememberWorkspace(selectedWorkspaceId);
    set({ selectedWorkspaceId });
  },
  setPrompt: (prompt) => set({ prompt }),
  offerStarter: (starter) => set((state) => {
    if (state.starterApplied) return state;
    return { starterApplied: true, prompt: state.prompt.trim() === '' ? starter : state.prompt };
  }),
  setPermission: (permission) => set({ permission }),
  setSending: (sending) => set({ sending }),
  setError: (error) => set({ error }),
}));
