/**
 * The card a finished turn can end with.
 *
 * Two facts decide it: the turn must be the newest one in this Session (older
 * tails exist for every completed turn), and the blueprint must have moved since
 * the chat last looked. The answer is remembered per turn and re-asked when the
 * blueprint saves again, so work done in the canvas counts too.
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

interface Decision {
  card: TailCard | null;
  /** Revision the answer was based on; a later save asks the question again. */
  revision: number | null;
  title: string | null;
}

const decisions = new Map<string, Decision>();
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

/**
 * The card for one turn, re-asked whenever the watched blueprint gains a
 * revision. That way a save made from the canvas — not just one made by the
 * assistant — still ends the turn with a way back into the design.
 */
export function cardForTurn(
  turnKey: string,
  sessionId: string,
  entries: readonly BlueprintSummary[],
  current: string | null,
): TailCard | null {
  const candidate = candidateFor(entries, current);
  const revision = candidate?.revision ?? null;
  const title = candidate?.title ?? null;
  const cached = decisions.get(turnKey);
  if (cached !== undefined && cached.revision === revision && cached.title === title) return cached.card;

  const moved = candidate !== null && movedSince(sessionId, candidate);
  const known = cached?.card ?? null;
  const card: TailCard | null = candidate !== null && (moved || known?.id === candidate.id)
    ? { id: candidate.id, title: candidate.title, created: candidate.revision === 0 }
    : known;

  decisions.set(turnKey, { card, revision, title });
  if (candidate !== null) lastRevision.set(sessionId, candidate.revision);
  if (decisions.size > DECISION_LIMIT) {
    const oldest = decisions.keys().next().value;
    if (oldest !== undefined) decisions.delete(oldest);
  }
  return card;
}
