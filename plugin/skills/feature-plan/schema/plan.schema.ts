/**
 * The shape of a feature plan (plan.json) and of the developer's state file
 * (plan.state.json). This file is the single source of truth: the CLI
 * validates against it and the viewer takes its types from it.
 *
 * Word budgets are part of the schema on purpose. They are what keeps plans
 * short; instructions alone do not.
 */
import { z } from 'zod';
import { countSentences, countWords } from './utility/text.ts';

/**
 * Builds a text field that allows at most `max` words.
 *
 * @param max - The word budget for the field.
 * @returns A Zod string that fails validation when over budget.
 */
const words = (max: number) =>
  z.string().trim().min(1).refine((s) => countWords(s) <= max, `must be ${max} words or fewer`);

/**
 * Builds a text field that allows at most `max` sentences.
 *
 * @param max - The sentence budget for the field.
 * @returns A Zod string that fails validation when over budget.
 */
const sentences = (max: number) =>
  z.string().trim().min(1).refine((s) => countSentences(s) <= max, `must be ${max} sentences or fewer`);

/** Default budget for any text field without a tighter one. */
const text = sentences(2);

/** Stable item id. Notes and ticks anchor to ids, so never reuse or renumber them. */
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'ids use letters, digits, "-" and "_"');

/** Where a claim comes from: seen in the code, verified in docs, or assumed. */
const provenance = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('code'), path: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('docs'),
    sources: z
      .array(z.strictObject({ url: z.url(), date: z.iso.date(), version: z.string().optional() }))
      .min(1),
  }),
  z.strictObject({ kind: z.literal('assumed') }),
]);

/** Fields every plan item shares. */
const base = {
  id,
  /** Decision ids this item hinges on. It shows as provisional until they are decided. */
  dependsOn: z.array(id).optional(),
  provenance: provenance.optional(),
};

const item = z.strictObject({ ...base, text });

const keyChange = z.strictObject({ ...base, title: words(8), text: words(30) });

const decision = z.strictObject({
  ...base,
  question: words(12),
  options: z.array(z.strictObject({ id, label: words(5) })).min(2).max(4),
  /** Option id the agent recommends. */
  recommended: id,
  /** Option id the plan text is currently written for. Defaults to `recommended`. */
  chosen: id.optional(),
  reason: words(25),
});

/** existing = already in the codebase, new = added or changed by this plan, alt = error or alternative path. */
const tone = z.enum(['existing', 'new', 'alt']).optional();

/** Boxes and arrows on a grid. The agent picks each box's column and row; the viewer draws it. */
const graphSource = z.strictObject({
  type: z.literal('graph'),
  nodes: z
    .array(
      z.strictObject({
        id,
        label: words(4),
        sub: words(5).optional(),
        col: z.number().int().min(0).max(5),
        row: z.number().int().min(0).max(3),
        tone,
      }),
    )
    .min(2)
    .max(12),
  edges: z.array(
    z.strictObject({ from: id, to: id, label: words(3).optional(), dashed: z.boolean().optional() }),
  ),
});

/** Who calls whom, top to bottom. Use for service or API interactions. */
const sequenceSource = z.strictObject({
  type: z.literal('sequence'),
  actors: z.array(z.strictObject({ id, label: words(4), tone })).min(2).max(6),
  messages: z
    .array(z.strictObject({ from: id, to: id, label: words(6), dashed: z.boolean().optional() }))
    .min(1)
    .max(12),
});

const diagram = z.strictObject({
  ...base,
  kind: z.enum(['architecture', 'dataFlow', 'sequence', 'state', 'er', 'userFlow', 'component']),
  /** Tab label. */
  label: words(4),
  caption: words(14),
  source: z.discriminatedUnion('type', [graphSource, sequenceSource]),
});

const fileTouch = z.strictObject({
  ...base,
  action: z.enum(['create', 'modify', 'delete']),
  /** Path relative to the repo root. */
  path: z.string().min(1),
  note: text,
});

const codeNote = z.strictObject({ ...base, code: z.string().min(1), note: text });

const step = z.strictObject({
  ...base,
  title: words(12),
  verify: words(14),
  /** doneWhen ids this step delivers. */
  criteria: z.array(id).optional(),
});

const testItem = z.strictObject({
  ...base,
  kind: z.enum(['unit', 'integration', 'e2e']),
  title: words(12),
  covers: text,
  /** doneWhen ids this test proves. */
  criteria: z.array(id).optional(),
});

const risk = z.strictObject({
  ...base,
  level: z.enum(['high', 'medium', 'low']),
  title: text,
  fallback: text,
});

export const planSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    /** Feature slug. */
    id,
    title: words(8),
    status: z.enum(['draft', 'final']),
    repo: z.strictObject({ path: z.string().min(1), branch: z.string().optional() }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    goal: z.strictObject({
      statement: sentences(2),
      /** Acceptance criteria, checkable. */
      doneWhen: z.array(item).min(1),
      outOfScope: z.array(text),
    }),
    approach: z.strictObject({
      keyChanges: z.array(keyChange).min(1).max(3),
      decisions: z.array(decision),
    }),
    visuals: z.array(diagram).min(1).max(4),
    touchpoints: z.strictObject({
      files: z.array(fileTouch),
      config: z.array(codeNote),
      migrations: z.array(codeNote),
      dependencies: z.array(codeNote),
    }),
    steps: z.array(step).min(1),
    testing: z.strictObject({
      tests: z.array(testItem),
      edgeCases: z.array(item),
      manualChecks: z.array(item),
    }),
    risks: z.strictObject({
      risks: z.array(risk),
      assumptions: z.array(item),
      openQuestions: z.array(item),
    }),
  })
  .superRefine(checkLinks);

const note = z.strictObject({
  id,
  /** Id of the plan item the note belongs to. */
  anchor: id,
  kind: z.enum(['forAgent', 'toSelf']),
  text: z.string().min(1),
  status: z.enum(['open', 'resolved']),
  createdAt: z.string(),
  /** Written by the agent. */
  reply: z.strictObject({ text: z.string().min(1), at: z.string() }).optional(),
});

/** Everything the developer does in the dashboard. Owned by the developer, not the agent. */
export const planStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planId: z.string(),
  /** Bump this on every write; the viewer keeps whichever copy is newest. */
  updatedAt: z.string(),
  /** decision id -> picked option id */
  decisions: z.record(z.string(), z.string().nullable()),
  /** item id -> ticked */
  checks: z.record(z.string(), z.boolean()),
  notes: z.array(note),
});

export type Plan = z.infer<typeof planSchema>;
export type PlanState = z.infer<typeof planStateSchema>;
export type Note = z.infer<typeof note>;
export type Decision = z.infer<typeof decision>;
export type Diagram = z.infer<typeof diagram>;
export type Provenance = z.infer<typeof provenance>;
/** The fields shared by every plan item. */
export type Base = { id: string; dependsOn?: string[]; provenance?: Provenance };

/**
 * Lists every item in a plan that carries an id.
 * Used to check ids are unique and to find what a note is attached to.
 *
 * @param plan - A plan with the right overall shape.
 * @returns All items, in the order the sections appear.
 */
export function allItems(plan: z.input<typeof planSchema>): Base[] {
  return [
    ...plan.goal.doneWhen,
    ...plan.approach.keyChanges,
    ...plan.approach.decisions,
    ...plan.visuals,
    ...plan.touchpoints.files,
    ...plan.touchpoints.config,
    ...plan.touchpoints.migrations,
    ...plan.touchpoints.dependencies,
    ...plan.steps,
    ...plan.testing.tests,
    ...plan.testing.edgeCases,
    ...plan.testing.manualChecks,
    ...plan.risks.risks,
    ...plan.risks.assumptions,
    ...plan.risks.openQuestions,
  ];
}

/**
 * Checks the links between plan items, which per-field rules cannot see:
 * unique ids, references that point at something real, and every acceptance
 * criterion traced to at least one step and one test.
 *
 * @param plan - A plan that already passed the per-field rules.
 * @param ctx - Zod's context, used to report each problem found.
 */
function checkLinks(plan: z.input<typeof planSchema>, ctx: z.RefinementCtx): void {
  /** Reports one problem against the whole plan. */
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });

  const seen = new Set<string>();
  for (const { id: itemId } of allItems(plan)) {
    if (seen.has(itemId)) fail(`id "${itemId}" is used more than once`);
    seen.add(itemId);
  }

  const decisionIds = new Set(plan.approach.decisions.map((d) => d.id));
  for (const it of allItems(plan)) {
    for (const dep of it.dependsOn ?? []) {
      if (!decisionIds.has(dep)) fail(`"${it.id}" dependsOn "${dep}", which is not a decision id`);
    }
  }

  for (const d of plan.approach.decisions) {
    const optionIds = d.options.map((o) => o.id);
    for (const key of ['recommended', 'chosen'] as const) {
      const value = d[key];
      if (value && !optionIds.includes(value)) fail(`decision "${d.id}": ${key} "${value}" is not one of its options`);
    }
  }

  const criteria = plan.goal.doneWhen.map((c) => c.id);
  for (const [name, list] of [['step', plan.steps], ['test', plan.testing.tests]] as const) {
    const covered = new Set(list.flatMap((x) => x.criteria ?? []));
    for (const c of covered) if (!criteria.includes(c)) fail(`a ${name} lists criteria "${c}", which is not a doneWhen id`);
    for (const c of criteria) if (!covered.has(c)) fail(`doneWhen "${c}" is not covered by any ${name}`);
  }

  for (const v of plan.visuals) {
    const src = v.source;
    const nodeIds = (src.type === 'graph' ? src.nodes : src.actors).map((n) => n.id);
    for (const e of src.type === 'graph' ? src.edges : src.messages) {
      for (const end of [e.from, e.to]) {
        if (!nodeIds.includes(end)) fail(`diagram "${v.id}": "${end}" is not one of its nodes`);
      }
    }
    if (src.type === 'graph') {
      const cells = src.nodes.map((n) => `${n.col},${n.row}`);
      if (new Set(cells).size !== cells.length) fail(`diagram "${v.id}": two nodes share the same col and row`);
    }
  }
}
