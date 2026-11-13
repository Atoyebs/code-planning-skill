#!/usr/bin/env node
/**
 * Command-line tool the skill runs. Three commands:
 *
 *   plan.mjs dir <feature-slug>     print (and create) the plan folder for the repo you are in
 *   plan.mjs validate <plan-dir>    check plan.json against the schema and word budgets
 *   plan.mjs stamp <plan-dir> [--open]   validate, then write plan.html (re-run to re-stamp)
 *
 * It is bundled into one file with no dependencies, so the skill needs only Node.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { type Plan, type PlanState, planSchema, planStateSchema } from './schema.ts';

/**
 * Turns Zod's error list into short lines an agent can act on.
 *
 * @param error - The error from a failed schema check.
 * @returns One line per problem, such as "steps.3.title: must be 12 words or fewer".
 */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
}

/**
 * Checks raw plan data against the schema, word budgets and link rules.
 *
 * @param raw - Parsed JSON from plan.json.
 * @returns The typed plan when valid, otherwise the list of problems.
 */
export function validatePlan(raw: unknown): { plan?: Plan; errors: string[] } {
  const result = planSchema.safeParse(raw);
  return result.success ? { plan: result.data, errors: [] } : { errors: formatIssues(result.error) };
}

/**
 * Puts plan data into the viewer template to make a self-contained page.
 * The data is inlined because a page opened from disk cannot fetch a
 * neighbouring JSON file.
 *
 * @param template - The prebuilt viewer HTML with its two empty data slots.
 * @param plan - The plan to show.
 * @param state - The developer's saved state, or null when there is none yet.
 * @returns The finished HTML for plan.html.
 */
export function stampHtml(template: string, plan: Plan, state: PlanState | null): string {
  /** Fills one <script type="application/json"> slot, escaping "<" so data cannot close the tag. */
  const fill = (html: string, slotId: string, data: unknown) => {
    const slot = new RegExp(`(<script id="${slotId}" type="application/json">)[\\s\\S]*?(</script>)`);
    if (!slot.test(html)) throw new Error(`template has no "${slotId}" slot`);
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return html.replace(slot, (_match, open: string, close: string) => open + json + close);
  };
  return fill(fill(template, 'plan-data', plan), 'plan-state', state);
}

/**
 * Works out where a feature's plan lives: ~/.plans/<repo-name>/<feature>.
 * Plans live outside the repo so they can never be committed by mistake.
 * If a different repo with the same folder name already has plans there,
 * a short suffix is added to keep the two apart.
 *
 * @param feature - The feature slug.
 * @param repoPath - Absolute path of the repo being planned.
 * @param root - Folder that holds all plans.
 * @returns Absolute path of the plan folder.
 */
export function planDir(feature: string, repoPath: string, root = join(homedir(), '.plans')): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(feature)) {
    throw new Error('feature slug must be lowercase letters, digits and dashes');
  }
  const name = basename(repoPath);
  /** True when the folder already holds a plan that belongs to another repo. */
  const takenByOtherRepo = (dir: string) =>
    existsSync(dir) &&
    readdirSync(dir).some((entry) => {
      try {
        return JSON.parse(readFileSync(join(dir, entry, 'plan.json'), 'utf8')).repo.path !== repoPath;
      } catch {
        return false;
      }
    });
  const suffix = createHash('sha1').update(repoPath).digest('hex').slice(0, 6);
  const repoDir = takenByOtherRepo(join(root, name)) ? `${name}-${suffix}` : name;
  return join(root, repoDir, feature);
}

/**
 * Finds the root of the git repo the command is run in.
 *
 * @returns The repo root, or the current folder when not inside a repo.
 */
function currentRepo(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return process.cwd();
  }
}

/**
 * Reads and validates plan.json from a plan folder, exiting with the list of
 * problems when it is invalid.
 *
 * @param dir - The plan folder.
 * @returns The valid plan.
 */
function loadPlan(dir: string): Plan {
  const { plan, errors } = validatePlan(JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')));
  if (!plan) {
    console.error(`plan.json is invalid (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  return plan;
}

/**
 * Reads the developer's state file if there is one.
 *
 * @param dir - The plan folder.
 * @returns The state, or null when the developer has not saved any yet.
 */
function loadState(dir: string): PlanState | null {
  const file = join(dir, 'plan.state.json');
  if (!existsSync(file)) return null;
  const result = planStateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!result.success) {
    console.error(`plan.state.json is invalid:\n- ${formatIssues(result.error).join('\n- ')}`);
    process.exit(1);
  }
  return result.data;
}

/**
 * Opens a file in the default browser.
 *
 * @param file - Absolute path to open.
 */
function openInBrowser(file: string): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [file]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]]
    : ['xdg-open', [file]];
  spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true }).unref();
}

/**
 * Runs the command given on the command line.
 *
 * @param argv - Arguments after the script name.
 */
function main(argv: string[]): void {
  const [command, target] = argv;
  if (command === 'dir' && target) {
    const dir = planDir(target, currentRepo());
    mkdirSync(dir, { recursive: true });
    console.log(dir);
  } else if (command === 'validate' && target) {
    loadPlan(target);
    console.log('plan.json is valid');
  } else if (command === 'stamp' && target) {
    const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'template.html'), 'utf8');
    const out = join(target, 'plan.html');
    writeFileSync(out, stampHtml(template, loadPlan(target), loadState(target)));
    console.log(out);
    if (argv.includes('--open')) openInBrowser(out);
  } else {
    console.error('usage: plan.mjs dir <feature-slug> | validate <plan-dir> | stamp <plan-dir> [--open]');
    process.exit(2);
  }
}

// Only run when executed directly, so tests can import the functions above.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
