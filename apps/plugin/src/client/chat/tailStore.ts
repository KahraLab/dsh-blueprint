/**
 * The card a finished turn can end with.
 *
 * Two facts decide it: the turn must be the newest one in this Session (older
 * tails exist for every completed turn), and the blueprint must have moved since
 * the last time the chat looked. The decision is cached per turn so a later list
 * update cannot make a card appear on the wrong turn or vanish mid-scroll.
 */
import { create } from 'zustand';
import type { BlueprintSummary } from '../library';

interface ChatTailState {
  /** Newest completed turn per Session, discovered from the rendered tails. */
  latest: Readonly<Record<string, number>>;
  /** Turns whose list read finished; the card waits for its own answer. */
  fetched: Readonly<Record<string, true>>;
  noteTurn(sessionId: string, turn: number): void;
  markFetched(turnKey: string): void;
}

export const useChatTail = create<ChatTailState>()((set, get) => ({
  latest: {},
  fetched: {},
  noteTurn: (sessionId, turn) => {
    const known = get().latest[sessionId];
    if (known !== undefined && known >= turn) return;
    set((state) => ({ latest: { ...state.latest, [sessionId]: turn } }));
  },
  markFetched: (turnKey) => set((state) => (
    state.fetched[turnKey] === true ? state : { fetched: { ...state.fetched, [turnKey]: true } }
  )),
}));

export interface TailCard {
  id: string;
  title: string;
  /** A blueprint that did not exist before is worth different words. */
  created: boolean;
}

const decisions = new Map<string, TailCard | null>();
const lastRevision = new Map<string, number>();
const DECISION_LIMIT = 200;
const RECENT_MS = 10 * 60 * 1000;

function candidateFor(entries: readonly BlueprintSummary[], current: string | null): BlueprintSummary | null {
  if (entries.length === 0) return null;
  const opened = entries.find((entry) => entry.id === current);
  if (opened !== undefined) return opened;
  return [...entries].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
}

function movedSince(sessionId: string, entry: BlueprintSummary): boolean {
  const previous = lastRevision.get(sessionId);
  if (previous !== undefined) return previous !== entry.revision;
  // Nothing to compare against yet: a blueprint touched moments ago is this
  // turn's work; an old one is the session's furniture.
  const time = Date.parse(entry.updatedAt);
  return Number.isFinite(time) && Date.now() - time < RECENT_MS;
}

export function cardForTurn(
  turnKey: string,
  sessionId: string,
  entries: readonly BlueprintSummary[],
  current: string | null,
): TailCard | null {
  const cached = decisions.get(turnKey);
  if (cached !== undefined) return cached;

  const candidate = candidateFor(entries, current);
  const card = candidate !== null && movedSince(sessionId, candidate)
    ? { id: candidate.id, title: candidate.title, created: candidate.revision === 0 }
    : null;
  decisions.set(turnKey, card);
  if (candidate !== null) lastRevision.set(sessionId, candidate.revision);
  if (decisions.size > DECISION_LIMIT) {
    const oldest = decisions.keys().next().value;
    if (oldest !== undefined) decisions.delete(oldest);
  }
  return card;
}
