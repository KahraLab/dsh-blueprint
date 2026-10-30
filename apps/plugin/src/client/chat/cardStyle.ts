/**
 * Styles for the chat turn-tail card.
 *
 * The chat surface does not load the panel stylesheet, so the card carries its
 * own small sheet. Colours come from the host's alias tokens, so light, dark and
 * future themes all read correctly.
 */
export const CARD_CSS = `
.bp-tail-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 2px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.06));
  max-width: 520px;
}
.bp-tail-mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-primary, #e6e8eb);
}
.bp-tail-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.bp-tail-title {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #8f8f8f);
}
.bp-tail-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #e6e8eb);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-tail-open {
  flex: none;
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22));
  background: transparent;
  color: var(--dsw-alias-label-primary, #e6e8eb);
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.bp-tail-open:hover {
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.12));
}
`;
