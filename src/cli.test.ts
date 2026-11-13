// Integration tests: run the built CLI the way the skill does, against real
// files in a temporary folder. `npm test` builds first.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { planDir } from './cli.ts';

const SKILL = 'plugin/skills/feature-plan';

/** Runs the built CLI and returns its exit code and output. */
const run = (...args: string[]) => {
  const result = spawnSync('node', [`${SKILL}/scripts/plan.mjs`, ...args], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout + result.stderr };
};

/** Makes a temporary plan folder holding the example plan. */
const tempPlan = () => {
  const dir = mkdtempSync(join(tmpdir(), 'feature-plan-'));
  copyFileSync(`${SKILL}/examples/magic-link-signin.plan.json`, join(dir, 'plan.json'));
  return dir;
};

test('stamp writes a self-contained plan.html holding the plan and the saved state', () => {
  const dir = tempPlan();
  copyFileSync(`${SKILL}/examples/magic-link-signin.state.json`, join(dir, 'plan.state.json'));
  const { code, out } = run('stamp', dir);
  assert.equal(code, 0, out);
  const html = readFileSync(join(dir, 'plan.html'), 'utf8');
  assert.match(html, /"title":"Magic-link sign-in"/);
  assert.match(html, /"planId":"magic-link-signin"/);
  // Offline use: nothing may be loaded from the network.
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="https?:/);
});

test('validate fails with readable problems and stamp refuses an invalid plan', () => {
  const dir = tempPlan();
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  plan.approach.keyChanges[0].title = 'this title is far too long to fit the eight word budget';
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
  const validated = run('validate', dir);
  assert.equal(validated.code, 1);
  assert.match(validated.out, /approach\.keyChanges\.0\.title: must be 8 words or fewer/);
  assert.equal(run('stamp', dir).code, 1);
});

test('planDir adds a suffix when another repo with the same folder name has plans', () => {
  const root = mkdtempSync(join(tmpdir(), 'plans-root-'));
  mkdirSync(join(root, 'app', 'old-feature'), { recursive: true });
  writeFileSync(join(root, 'app', 'old-feature', 'plan.json'), JSON.stringify({ repo: { path: '/work/app' } }));
  assert.equal(planDir('new-feature', '/work/app', root), join(root, 'app', 'new-feature'));
  assert.match(planDir('new-feature', '/personal/app', root), /app-[0-9a-f]{6}\/new-feature$/);
});

test('unknown commands print usage', () => {
  const { code, out } = run('nonsense');
  assert.equal(code, 2);
  assert.match(out, /usage:/);
});

test('serve shows the plan and saves state into the plan folder, for its own page only', async () => {
  const { spawn } = await import('node:child_process');
  const dir = tempPlan();
  const child = spawn('node', [`${SKILL}/scripts/plan.mjs`, 'serve', dir]);
  try {
    const url: string = await new Promise((resolve, reject) => {
      child.stdout.once('data', (line) => resolve(String(line).trim()));
      child.stderr.once('data', (line) => reject(new Error(String(line))));
    });
    assert.match(await (await fetch(url)).text(), /"title":"Magic-link sign-in"/);

    const state = readFileSync(`${SKILL}/examples/magic-link-signin.state.json`, 'utf8');
    /** Sends a save the way the dashboard does, optionally pretending to be another site. */
    const put = (body: string, origin?: string) =>
      fetch(`${url}state`, { method: 'PUT', body, headers: origin ? { Origin: origin } : {} });

    const saved = await put(state);
    assert.equal(saved.status, 200);
    const { path } = (await saved.json()) as { path: string };
    assert.ok(path.endsWith('plan.state.json'));
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), JSON.parse(state));

    assert.equal((await put('{"not":"a state"}')).status, 400);
    assert.equal((await put(state, 'https://evil.example')).status, 403);

    // A second serve reuses the running server, and stop closes it.
    assert.equal(run('serve', dir).out.trim(), url);
    assert.match(run('stop', dir).out, /^stopped http/);
    await new Promise((resolve) => child.once('exit', resolve));
    assert.match(run('stop', dir).out, /no server is running/);
  } finally {
    child.kill();
  }
});

test('the server stays up while a dashboard tab is open and stops soon after the last one closes', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn('node', [`${SKILL}/scripts/plan.mjs`, 'serve', tempPlan()], {
    env: { ...process.env, FEATURE_PLAN_GRACE_MS: '300' },
  });
  try {
    const url: string = await new Promise((resolve) => child.stdout.once('data', (line) => resolve(String(line).trim())));
    const tab = new AbortController();
    await fetch(`${url}alive`, { signal: tab.signal }); // an open tab
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(child.exitCode, null, 'stopped while a tab was still open');
    tab.abort(); // the tab closes
    await new Promise((resolve) => child.once('exit', resolve));
    assert.equal(child.exitCode, 0);
  } finally {
    child.kill();
  }
});
