/**
 * Permission presets on the design entry page.
 *
 * A page without a Session cannot show a Session's access mode, so the chip
 * shows the preset a new Session would start with and records any change; the
 * chosen preset is sent to the Session as `/permission <preset>` once it exists.
 * The catalog comes from the same Remote call the host composer uses.
 */
import type {
  PermissionCatalog,
  PermissionPreset,
  PermissionPresetsService,
  PluginContext,
} from '../../types/dsh';

export interface PermissionOption {
  id: string;
  label: string;
  /** Presets that deserve a second look before they are switched on. */
  risky: boolean;
}

export interface PermissionChoice {
  current: string;
  options: PermissionOption[];
}

const LABEL_KEYS: Readonly<Record<string, string>> = {
  'read-only': 'permission.readOnly',
  'workspace-write': 'permission.workspaceWrite',
  'danger-full-access': 'permission.fullAccess',
  auto: 'permission.auto',
};

/** English labels the Host ships for the built-in presets; they are matched to detect "unchanged" names. */
const DEFAULT_LABELS: Readonly<Record<string, string>> = {
  'permission.readOnly': 'Read Only',
  'permission.workspaceWrite': 'Workspace Write',
  'permission.fullAccess': 'Full access',
  'permission.auto': 'Auto review',
};

const RISKY = new Set(['danger-full-access', 'auto']);

/** `workspace-write` → "Workspace Write", for presets the Host names itself. */
function titleCase(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name;
  return name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/** The product label for a preset, falling back to the Host's name. */
export function permissionLabel(
  preset: PermissionPreset,
  t: (key: string) => string,
): string {
  const key = LABEL_KEYS[preset.value];
  if (key !== undefined && (preset.name === preset.value || preset.name === DEFAULT_LABELS[key])) {
    return t(key);
  }
  return titleCase(preset.name);
}

/** Turn the catalog into the chip's choices; null when the host offers none. */
export function buildPermissionChoice(
  catalog: PermissionCatalog,
  t: (key: string) => string,
): PermissionChoice | null {
  const options = catalog.defaultOptions.map((preset) => ({
    id: preset.value,
    label: permissionLabel(preset, t),
    risky: RISKY.has(preset.value),
  }));
  const [first] = options;
  if (first === undefined) return null;
  const current = options.some((option) => option.id === catalog.defaultPreset)
    ? catalog.defaultPreset
    : first.id;
  return { current, options };
}

/** Ask the Host which presets exist and which one new Sessions start with. */
export async function loadPermissionChoice(
  ctx: PluginContext,
  t: (key: string) => string,
): Promise<PermissionChoice | null> {
  const presets = ctx.get<PermissionPresetsService>('remote.permissionPresets');
  if (presets === undefined) return null;
  try {
    const answer = await presets.catalog();
    if (!answer.ok || answer.value === undefined) return null;
    return buildPermissionChoice(answer.value, t);
  } catch {
    // A host without permission presets simply has no chip.
    return null;
  }
}

/** Switch a materialized Session's preset through the Host's own command. */
export async function applyPermissionPreset(
  ctx: PluginContext,
  sessionId: string,
  preset: string,
): Promise<void> {
  const session = ctx.sessions.binding?.(sessionId)?.session;
  if (session === undefined) throw new Error('the Session is not materialized yet');
  const answer = await session.command(`/permission ${preset}`);
  if (!answer.ok) {
    const reason = answer.error === undefined ? 'unknown error' : `${answer.error.code}: ${answer.error.message}`;
    throw new Error(`permission switch failed: ${reason}`);
  }
  if (answer.value !== undefined && !answer.value.matched) {
    throw new Error('the host offers no /permission command');
  }
}
