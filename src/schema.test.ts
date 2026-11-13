// Unit tests for the plan rules: word budgets, links between items, and the
// pure helpers. Run with `npm test` (Node's built-in test runner).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { planDir, stampHtml, validatePlan } from './cli.ts';
import type { Plan } from './schema.ts';
import { countSentences, countWords } from './utility/text.ts';

const EXAMPLE = 'plugin/skills/feature-plan/examples/magic-link-signin.plan.json';

/** Loads a fresh copy of the example plan so each test can break it its own way. */
const example = () => JSON.parse(readFileSync(EXAMPLE, 'utf8'));

/** Returns the validation errors for a plan after applying one change to the example. */
const errorsAfter = (change: (plan: any) => void): string[] => {
  const plan = example();
  change(plan);
  return validatePlan(plan).errors;
};

test('counts words and sentences, ignoring dots inside file names', () => {
  assert.equal(countWords('  one two   three '), 3);
  assert.equal(countSentences('Export createSession from session.ts for reuse'), 1);
  assert.equal(countSentences('15 minutes. It covers slow delivery.'), 2);
});

test('the bundled example plan is valid', () => {
  assert.deepEqual(validatePlan(example()).errors, []);
});

test('rejects text over its word budget', () => {
  const errors = errorsAfter((p) => (p.steps[0].title = 'one two three four five six seven eight nine ten eleven twelve thirteen'));
  assert.deepEqual(errors, ['steps.0.title: must be 12 words or fewer']);
});

test('rejects a goal longer than two sentences', () => {
  const errors = errorsAfter((p) => (p.goal.statement = 'One. Two. Three.'));
  assert.deepEqual(errors, ['goal.statement: must be 2 sentences or fewer']);
});

test('rejects duplicate ids, since notes anchor to them', () => {
  assert.match(errorsAfter((p) => (p.steps[1].id = 's1')).join(), /id "s1" is used more than once/);
});

test('rejects dependsOn that points at no decision', () => {
  assert.match(errorsAfter((p) => (p.steps[0].dependsOn = ['nope'])).join(), /"nope", which is not a decision id/);
});

test('rejects a criterion that no step or test covers', () => {
  const errors = errorsAfter((p) => p.goal.doneWhen.push({ id: 'a7', text: 'Something new' })).join();
  assert.match(errors, /doneWhen "a7" is not covered by any step/);
  assert.match(errors, /doneWhen "a7" is not covered by any test/);
});

test('rejects a diagram edge to a missing node and unknown fields', () => {
  assert.match(errorsAfter((p) => (p.visuals[0].source.edges[0].to = 'ghost')).join(), /"ghost" is not one of its nodes/);
  assert.notEqual(errorsAfter((p) => (p.summary = 'extra')).length, 0);
});

test('stampHtml fills both slots and cannot be broken out of by plan text', () => {
  const template = '<script id="plan-data" type="application/json">null</script><script id="plan-state" type="application/json">null</script>';
  const plan = { title: '</script><b>$&' } as unknown as Plan;
  const html = stampHtml(template, plan, null);
  assert.equal(html.match(/<\/script>/g)?.length, 2);
  assert.ok(html.includes('"\\u003c/script>\\u003cb>$&"'), html);
  assert.throws(() => stampHtml('<html></html>', plan, null), /no "plan-data" slot/);
});

test('planDir rejects unsafe slugs and builds ~/.plans/<repo>/<feature>', () => {
  const root = join(tmpdir(), 'no-such-plans-root');
  assert.equal(planDir('magic-link', '/code/my-app', root), join(root, 'my-app', 'magic-link'));
  assert.throws(() => planDir('../escape', '/code/my-app', root), /feature slug/);
});
