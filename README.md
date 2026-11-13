# feature-plan

A skill for Claude Code (and other coding agents) that plans **one feature in an existing
codebase** and gives you the plan as a visual dashboard instead of a wall of text.

- Seven short sections: goal, approach, diagrams, touchpoints, steps, testing, risks
- Tick off steps and criteria, pick between options where the agent needs your call
- Leave notes on any item, for the agent or for yourself; the agent reads and answers them
- One self-contained HTML file per plan. Opens offline, dark and light themes
- Plans live in `~/.plans/<repo>/<feature>/`, outside your repo, so they are never committed
- The agent never edits your code while planning

## Install

Needs [Node.js](https://nodejs.org) 18 or newer. Nothing else to install or build.

**Claude Code (plugin):**

```bash
claude plugin marketplace add Atoyebs/code-planning-skill
```

```bash
claude plugin install feature-plan@code-planning-skill
```

**Other agents, or Claude Code without plugins** (uses the [skills CLI](https://github.com/vercel-labs/skills)):

```bash
npx skills add Atoyebs/code-planning-skill
```

**By hand:** copy the `plugin/skills/feature-plan` folder into `~/.claude/skills/`.

## Use

In a repo, ask for a plan:

> Plan adding magic-link sign-in

The agent surveys the code, checks fast-changing facts against current docs, writes the plan
and opens the dashboard. Then:

1. Read it. Pick an option on each decision card. Leave notes where you disagree.
2. Press **Save for agent**. In Chrome and Edge, choose the plan folder once and later changes
   save themselves. In Firefox and Safari it downloads `plan.state.json`; move it into the
   plan folder next to `plan.html`.
3. Tell the agent you are done. It rewrites only what your choices affect, answers your
   notes, and marks the plan final.

To see a finished example without running the agent:

```bash
mkdir -p /tmp/demo-plan && cp plugin/skills/feature-plan/examples/magic-link-signin.plan.json /tmp/demo-plan/plan.json && node plugin/skills/feature-plan/scripts/plan.mjs stamp /tmp/demo-plan --open
```

## How it works

```
 agent writes            stamp command               you
 plan.json   ─────────►  plan.html   ─────────►  tick, pick, note
     ▲                   (one file,                   │
     │                    offline)                    ▼
     └──────────── agent reads ◄──────────── plan.state.json
```

The dashboard is built once into `dist/template.html`. Making a plan page is just dropping
the plan's data into that template, so there is no build step per plan.

## Develop

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

| Path | What it is |
|---|---|
| `src/schema.ts` | The plan's shape and word budgets (Zod). Single source of truth |
| `src/cli.ts` | The `dir`, `validate` and `stamp` commands |
| `src/viewer/` | The dashboard (TypeScript, no framework), built by Vite into one HTML file |
| `plugin/skills/feature-plan/` | The installable skill. `dist/`, `scripts/` and `schema/` are build output, committed so users need no build |
| `docs/` | Design decisions |

`npm run build` regenerates the build output. Commit it together with source changes.
