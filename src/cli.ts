#!/usr/bin/env node
/**
 * Command-line tool the skill runs. Three commands:
 *
 *   plan.mjs dir <feature-slug>     print (and create) the plan folder for the repo you are in
 *   plan.mjs validate <plan-dir>    check plan.json against the schema and word budgets
 *   plan.mjs stamp <plan-dir> [--open]   validate, then write plan.html (re-run to re-stamp)
 *   plan.mjs serve <plan-dir> [--open]   serve the plan locally so the dashboard saves into the plan folder
 *   plan.mjs stop <plan-dir>             stop that plan's server
 *
 * It is bundled into one file with no dependencies, so the skill needs only Node.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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
 * Reads and validates plan.json from a plan folder.
 *
 * @param dir - The plan folder.
 * @returns The valid plan.
 * @throws An error listing every problem when the plan is invalid.
 */
function loadPlan(dir: string): Plan {
  const { plan, errors } = validatePlan(JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')));
  if (!plan) {
    throw new Error(`plan.json is invalid (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n- ${errors.join('\n- ')}`);
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
    throw new Error(`plan.state.json is invalid:\n- ${formatIssues(result.error).join('\n- ')}`);
  }
  return result.data;
}

/**
 * Opens a file in the default browser.
 *
 * @param file - Absolute path or web address to open.
 */
function openInBrowser(file: string): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [file]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]]
    : ['xdg-open', [file]];
  spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true }).unref();
}

/**
 * Builds the finished dashboard page for a plan folder from its current files.
 *
 * @param dir - The plan folder.
 * @returns The HTML for plan.html.
 * @throws An error when plan.json or plan.state.json is invalid.
 */
function stampDir(dir: string): string {
  const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'template.html'), 'utf8');
  return stampHtml(template, loadPlan(dir), loadState(dir));
}

/**
 * How long the plan server waits with no dashboard tab open before it stops.
 * Long enough to survive a reload or a closed-then-reopened tab.
 */
const GRACE_MS = Number(process.env.FEATURE_PLAN_GRACE_MS) || 15 * 60 * 1000;

/**
 * The ports a plan's server may use. The same plan always starts from the
 * same port, so its address (and saved theme) stays stable, and `stop` knows
 * where to look. The extras cover a port that something else has taken.
 *
 * @param planPath - The real path of the plan folder.
 * @returns Ten neighbouring port numbers, preferred first.
 */
function candidatePorts(planPath: string): number[] {
  const first = 4700 + (parseInt(createHash('sha1').update(planPath).digest('hex').slice(0, 4), 16) % 1000);
  return Array.from({ length: 10 }, (_unused, i) => first + i);
}

/**
 * Finds the running server for a plan, if there is one.
 *
 * @param planPath - The real path of the plan folder.
 * @returns The server's address, or null when none is running.
 */
async function findServer(planPath: string): Promise<string | null> {
  for (const port of candidatePorts(planPath)) {
    const url = `http://127.0.0.1:${port}/`;
    const owner = await fetch(`${url}whoami`).then((r) => r.text()).catch(() => '');
    if (owner === planPath) return url;
  }
  return null;
}

/**
 * Serves one plan on this machine only, so the dashboard can save
 * plan.state.json straight into the plan folder. A page opened from disk
 * cannot choose where to write; a page talking to this server can.
 *
 * Each page load is stamped fresh, so a reload shows the agent's latest edits.
 * Running it twice for the same plan reuses the server that is already up.
 *
 * It stops when it is no longer needed: on the `stop` command, or once no
 * dashboard tab has been open for a while. Each open tab holds a connection
 * to `/alive`, which is how the server knows someone is still looking.
 *
 * @param dir - The plan folder.
 * @param open - Whether to open the dashboard in the browser.
 */
async function serve(dir: string, open: boolean): Promise<void> {
  const planPath = realpathSync(dir);
  writeFileSync(join(planPath, 'plan.html'), stampDir(planPath)); // keep the offline copy current

  /** Prints the dashboard's address and opens it if asked. */
  const announce = (url: string) => {
    console.log(url);
    if (open) openInBrowser(url);
  };
  const running = await findServer(planPath);
  if (running) return announce(running);

  let viewers = 0;
  let idle: NodeJS.Timeout | undefined;
  /** Starts the countdown to stopping when no tab is open, and cancels it when one is. */
  const watchViewers = () => {
    clearTimeout(idle);
    if (viewers === 0) idle = setTimeout(() => process.exit(0), GRACE_MS);
  };

  const server = createServer((req, res) => {
    const port = (server.address() as AddressInfo).port;
    const own = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    /** Sends a reply. */
    const send = (status: number, body: string, type = 'text/plain') => {
      res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(body);
    };
    // Only this page may talk to the server: refuse other hosts and other sites' scripts.
    const origin = req.headers.origin;
    if (!own.includes(`http://${req.headers.host}`) || (origin && !own.includes(origin))) return send(403, 'forbidden');

    const route = `${req.method} ${(req.url ?? '/').split('?')[0]}`;
    if (route === 'GET /' || route === 'GET /plan.html') {
      try {
        send(200, stampDir(planPath), 'text/html');
      } catch (error) {
        send(500, (error as Error).message);
      }
    } else if (route === 'GET /whoami') {
      send(200, planPath);
    } else if (route === 'GET /alive') {
      // An open tab. The connection stays open until the tab closes.
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      res.write(': connected\n\n');
      viewers += 1;
      watchViewers();
      res.on('close', () => {
        viewers -= 1;
        watchViewers();
      });
    } else if (route === 'POST /stop') {
      send(200, 'stopping');
      setImmediate(() => process.exit(0));
    } else if (route === 'PUT /state') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2_000_000) req.destroy();
      });
      req.on('end', () => {
        try {
          const file = join(planPath, 'plan.state.json');
          writeFileSync(file, JSON.stringify(planStateSchema.parse(JSON.parse(body)), null, 2));
          send(200, JSON.stringify({ path: file }), 'application/json');
        } catch {
          send(400, 'invalid state');
        }
      });
    } else {
      send(404, 'not found');
    }
  });

  const ports = candidatePorts(planPath);
  server.on('error', (error: NodeJS.ErrnoException) => {
    const next = ports.shift();
    if (error.code !== 'EADDRINUSE' || next === undefined) throw error;
    server.listen(next, '127.0.0.1'); // something else has that port: try the next one
  });
  server.on('listening', () => {
    watchViewers();
    announce(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  });
  server.listen(ports.shift(), '127.0.0.1');
}

/**
 * Stops a plan's server, for when the plan is final or the developer is done.
 *
 * @param dir - The plan folder.
 * @returns A line saying what happened.
 */
async function stop(dir: string): Promise<string> {
  const running = await findServer(realpathSync(dir));
  if (!running) return 'no server is running for this plan';
  const reply = await fetch(`${running}stop`, { method: 'POST' });
  return reply.ok ? `stopped ${running}` : `could not stop ${running} (it replied ${reply.status})`;
}

/**
 * Runs the command given on the command line.
 *
 * @param argv - Arguments after the script name.
 */
async function main(argv: string[]): Promise<void> {
  const [command, target] = argv;
  if (command === 'dir' && target) {
    const dir = planDir(target, currentRepo());
    mkdirSync(dir, { recursive: true });
    console.log(dir);
  } else if (command === 'validate' && target) {
    loadPlan(target);
    console.log('plan.json is valid');
  } else if (command === 'stamp' && target) {
    const out = join(target, 'plan.html');
    writeFileSync(out, stampDir(target));
    console.log(out);
    if (argv.includes('--open')) openInBrowser(out);
  } else if (command === 'serve' && target) {
    await serve(target, argv.includes('--open'));
  } else if (command === 'stop' && target) {
    console.log(await stop(target));
  } else {
    console.error('usage: plan.mjs dir <feature-slug> | validate <plan-dir> | stamp <plan-dir> [--open] | serve <plan-dir> [--open] | stop <plan-dir>');
    process.exit(2);
  }
}

// Only run when executed directly, so tests can import the functions above.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
