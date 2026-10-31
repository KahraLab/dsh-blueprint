/**
 * The skill that teaches a model to use the canvas.
 *
 * The prose lives in skills/dsh-blueprint-canvas/SKILL.md, in the same format
 * as any other skill, and is inlined at build time. This module only fills in
 * the two values that change with the installation: the command path and the
 * rules shared with the command line.
 */
import { CORE_RULES } from '../../application/guide';
import { parseFrontmatter } from '../../shared/frontmatter';
import type { SkillRegistration } from '../../types/dsh';
import SOURCE from '../../../skills/dsh-blueprint-canvas/SKILL.md';

export const SKILL_NAME = 'dsh-blueprint-canvas';

const COMMAND_TOKEN = '{{command}}';
const RULES_TOKEN = '{{coreRules}}';

function ruleList(rules: readonly string[]): string {
  return rules.map((rule) => `- ${rule}`).join('\n');
}

export function skillFor(command: string): SkillRegistration {
  const parsed = parseFrontmatter(SOURCE);
  if (parsed === null) throw new Error(`${SKILL_NAME}/SKILL.md 缺少 frontmatter`);
  const { fields, body } = parsed;

  const description = fields.description?.trim() ?? '';
  if (description === '') throw new Error(`${SKILL_NAME}/SKILL.md 缺少 description`);

  const content = body
    .replace(/^\r?\n+/u, '')
    .replaceAll(COMMAND_TOKEN, command)
    .replaceAll(RULES_TOKEN, ruleList(CORE_RULES));
  if (content.includes('{{')) throw new Error(`${SKILL_NAME}/SKILL.md 有未替换的占位符`);

  return {
    name: fields.name?.trim() ?? SKILL_NAME,
    description,
    whenToUse: fields.whenToUse?.trim(),
    content,
    source: 'bundled',
    invocation: { modelInvocable: true, userInvocable: true },
  };
}
