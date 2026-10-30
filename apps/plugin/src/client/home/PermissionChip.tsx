/**
 * The access-mode chip on the design entry page.
 *
 * It opens the same kind of menu the host composer uses: one row per preset,
 * with a second "confirm" step for the presets that carry risk. The choice is
 * not written to the Host here — the entry page has no Session yet; the chosen
 * preset rides along until the Session exists.
 */
import type { MouseEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretIcon, ShieldIcon } from '../icons';
import { openMenu, type MenuItem } from '../menu/menuStore';
import type { PermissionChoice } from './permissions';

interface PermissionChipProps {
  choice: PermissionChoice | null;
  /** The user's pick for the Session about to start; null means "the default". */
  value: string | null;
  disabled: boolean;
  onPick(preset: string): void;
}

export function PermissionChip({ choice, value, disabled, onPick }: PermissionChipProps): ReactElement | null {
  const { t } = useTranslation();
  if (choice === null) return null;

  const selected = choice.options.find((option) => option.id === (value ?? choice.current)) ?? choice.options[0];
  if (selected === undefined) return null;

  const showMenu = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    const rect = event.currentTarget.getBoundingClientRect();
    const items: MenuItem[] = choice.options.map((option) => ({
      id: option.id,
      label: option.label,
      ...(option.risky ? { confirm: { label: t('permission.confirm'), cancelLabel: t('menu.cancel') } } : {}),
    }));
    const picked = await openMenu({ x: rect.left, y: rect.bottom + 6 }, items);
    if (picked !== null) onPick(picked);
  };

  return (
    <button
      type="button"
      className="bp-perm"
      disabled={disabled}
      aria-haspopup="menu"
      title={t('permission.title')}
      onClick={(event) => void showMenu(event)}
    >
      <ShieldIcon />
      <span className="bp-perm-label">{selected.label}</span>
      <CaretIcon size={10} />
    </button>
  );
}
