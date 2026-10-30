/**
 * The turn-tail card: a finished AI turn that changed a blueprint ends with a
 * way back into the design.
 *
 * It asks the list once per turn instead of trusting a cached copy, and only the
 * newest turn draws a card.
 */
import { useEffect, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { PluginContext } from '../../types/dsh';
import { MarkIcon } from '../icons';
import { scopeKey, useBlueprintLibrary, useLibrarySlice } from '../library';
import { openBlueprintInPanel } from '../panel/openInPanel';
import { cardForTurn, useChatTail } from './tailStore';
import { CARD_CSS } from './cardStyle';

interface TurnTailCardProps {
  ctx: PluginContext;
  /** Supplied by the session-scoped turn-tail slot. */
  sessionId?: string;
  /** Which turn this tail closes. */
  turn?: number;
}

export function TurnTailCard({ ctx, sessionId, turn }: TurnTailCardProps): ReactElement | null {
  const { t } = useTranslation();
  const turnNumber = typeof turn === 'number' ? turn : -1;
  const latest = useChatTail((state) => (sessionId === undefined ? false : state.latest[sessionId] === turnNumber));
  const noteTurn = useChatTail((state) => state.noteTurn);
  const turnKey = `${sessionId ?? ''}:${turnNumber}`;
  const fetched = useChatTail((state) => state.fetched[turnKey] === true);
  const markFetched = useChatTail((state) => state.markFetched);

  const scope = useMemo(() => ({ sessionId: sessionId ?? null }), [sessionId]);
  const key = scopeKey(scope);
  const library = useLibrarySlice(key);
  const messages = useMemo(
    () => ({ loadFailed: t('gallery.loadFailed'), createFailed: t('gallery.createFailed') }),
    [t],
  );

  useEffect(() => {
    if (sessionId === undefined || turnNumber < 0) return;
    noteTurn(sessionId, turnNumber);
  }, [noteTurn, sessionId, turnNumber]);

  useEffect(() => {
    if (!latest) return;
    let alive = true;
    void useBlueprintLibrary.getState()
      .reload(scope, messages, { quiet: true, previews: false })
      .then(() => {
        if (alive) markFetched(turnKey);
      });
    return () => {
      alive = false;
    };
  }, [latest, markFetched, messages, scope, turnKey]);

  if (sessionId === undefined || !latest || !fetched || library.entries === null) return null;

  const card = cardForTurn(turnKey, sessionId, library.entries, library.current);
  if (card === null) return null;

  return (
    <div className="bp-tail-card">
      <style>{CARD_CSS}</style>
      <span className="bp-tail-mark" aria-hidden="true"><MarkIcon size={18} /></span>
      <span className="bp-tail-text">
        <span className="bp-tail-title">{card.created ? t('chat.created') : t('chat.updated')}</span>
        <span className="bp-tail-name">{card.title}</span>
      </span>
      <button
        type="button"
        className="bp-tail-open"
        onClick={() => void openBlueprintInPanel(ctx, sessionId, card.id)}
      >
        {t('chat.open')}
      </button>
    </div>
  );
}
