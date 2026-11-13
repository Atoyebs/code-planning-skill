import type { Plan, PlanState } from '../schema.ts';
import { describeDiagram } from './diagram.ts';

/**
 * Turns a plan into markdown, for pasting into an issue, a PR or a chat.
 *
 * @param plan - The plan to export.
 * @param state - The developer's ticks and picks, so the export shows progress.
 * @returns The whole plan as one markdown string.
 */
export function toMarkdown(plan: Plan, state: PlanState): string {
  /** A markdown checkbox line for a checkable item. */
  const box = (id: string, text: string) => `- [${state.checks[id] ? 'x' : ' '}] ${text}`;
  /** A plain bullet line. */
  const bullet = (text: string) => `- ${text}`;
  /** A heading followed by its lines, or nothing when there are no lines. */
  const block = (heading: string, lines: string[]) => (lines.length ? [heading, ...lines, ''] : []);

  const decisions = plan.approach.decisions.map((d) => {
    const label = (optionId?: string | null) => d.options.find((o) => o.id === optionId)?.label;
    const picked = label(state.decisions[d.id]);
    return bullet(`**${d.question}** ${picked ? `Chosen: ${picked}.` : 'Undecided.'} Recommended: ${label(d.recommended)}. ${d.reason}`);
  });

  return [
    `# ${plan.title} (${plan.status})`,
    '',
    plan.goal.statement,
    '',
    ...block('## Done when', plan.goal.doneWhen.map((c) => box(c.id, c.text))),
    ...block('## Not in this plan', plan.goal.outOfScope.map(bullet)),
    ...block('## Approach', plan.approach.keyChanges.map((k, i) => `${i + 1}. **${k.title}.** ${k.text}`)),
    ...block('## Decisions', decisions),
    ...plan.visuals.flatMap((v) => block(`## ${v.label}`, [v.caption, '', ...describeDiagram(v).map(bullet)])),
    ...block('## Touchpoints', plan.touchpoints.files.map((f) => bullet(`${f.action} \`${f.path}\`: ${f.note}`))),
    ...block('### Config', plan.touchpoints.config.map((c) => bullet(`\`${c.code}\`: ${c.note}`))),
    ...block('### Migrations', plan.touchpoints.migrations.map((c) => bullet(`\`${c.code}\`: ${c.note}`))),
    ...block('### Dependencies', plan.touchpoints.dependencies.map((c) => bullet(`\`${c.code}\`: ${c.note}`))),
    ...block('## Steps', plan.steps.map((s) => `${box(s.id, s.title)}\n  - verify: ${s.verify}`)),
    ...block('## Tests to write', plan.testing.tests.map((t) => bullet(`${t.kind}: **${t.title}**. ${t.covers}`))),
    ...block('### Edge cases', plan.testing.edgeCases.map((e) => bullet(e.text))),
    ...block('### Manual checks', plan.testing.manualChecks.map((m) => box(m.id, m.text))),
    ...block('## Risks', plan.risks.risks.map((r) => bullet(`${r.level}: **${r.title}** Fallback: ${r.fallback}`))),
    ...block('### Assumptions', plan.risks.assumptions.map((a) => bullet(a.text))),
    ...block('### Open questions', plan.risks.openQuestions.map((q) => bullet(q.text))),
  ]
    .join('\n')
    .trim();
}
