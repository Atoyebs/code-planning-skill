---
name: feature-plan
description: Plan one feature inside an existing codebase as a short, visual dashboard (goal, approach, diagrams, touchpoints, steps, testing, risks) that the developer reads, ticks off, decides on and annotates, instead of a wall of text. Use when the user asks to plan, scope or design a feature or a non-trivial change before coding, says "plan this feature", or says they have left notes, comments or decisions on an existing plan. Not for planning a whole app from scratch.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/plan.mjs *)
---

# Feature plan

You produce a private, visual plan for **one feature in an existing codebase**. The plan is
data (`plan.json`) rendered into a self-contained dashboard (`plan.html`) the developer opens
in a browser. It exists because prose plans make the reader lose the thread, fail to picture
the change, miss what matters, and miss where their input is needed. Judge every choice
against those four problems.

Hard rules:

- **Read-only.** Never create, edit or delete anything inside the repo being planned.
- **The schema decides length.** Word budgets are enforced by validation. Do not fight them; cut.
- **Never reuse or renumber ids.** Notes and ticks are attached to item ids.

## Files

The skill folder (`${CLAUDE_SKILL_DIR}`, the folder holding this file) contains:

| File | Use |
|---|---|
| `scripts/plan.mjs` | `dir`, `validate`, `stamp`, `serve` and `stop` commands. Needs only Node 18+ |
| `schema/plan.schema.ts` | The exact shape and word budget of every field. **Read it before writing `plan.json`** |
| `examples/magic-link-signin.plan.json` | A complete valid plan to copy the shape from |
| `agents/scout.md`, `researcher.md`, `reviewer.md` | Briefs for sub-agents |

Each plan lives **outside the repo**, in `~/.plans/<repo-name>/<feature-slug>/`:

| File | Owner | Purpose |
|---|---|---|
| `plan.json` | You | The plan. Edit this |
| `plan.html` | Generated | The dashboard. Never edit by hand; re-stamp instead |
| `plan.state.json` | Developer | Their ticks, decision picks and notes, saved from the dashboard |

Get the folder (created if missing) by running this from inside the repo:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/plan.mjs dir <feature-slug>
```

If you are sandboxed to the project folder, ask for access to that exact folder.

## Flow

Scale every stage to the feature. A small feature needs one scout, no researchers, and
one-line Approach and Risks sections.

1. **Scope gate.** Confirm this is one feature in an existing system. A whole app or system:
   decline, and offer to plan its first feature. A trivial change: say a plan is overkill and stop.
2. **Intake.** Restate the goal in one sentence, draft "done when" criteria, and ask only
   questions that block planning. Never ask what you could look up.
   If a plan already exists for this feature, read its `plan.json` and continue from it.
3. **Codebase survey.** Give a sub-agent the brief in `agents/scout.md` (an Explore or
   read-only agent if you have one).
4. **Assumption triage.** List everything the plan depends on and label each: seen in code,
   stable knowledge, or volatile external fact (library and framework APIs, cloud limits,
   pricing, deprecations, tooling behaviour).
5. **Verification.** For each volatile fact, give a sub-agent the brief in `agents/researcher.md`,
   one fact per agent, in parallel. A fact counts as verified only if it is confirmed in current
   official docs **for the version installed in the repo**, or by two reputable sources from the
   last year. Your own memory is never proof. Anything unverified gets `provenance: assumed`
   and also appears under assumptions.
6. **Approach and decisions.** Up to three key changes. Surface only real forks as decisions,
   each with a recommendation. Reusing an existing pattern is not a decision; departing from
   one is. **Big-fork rule:** if a decision would change most of the plan (two different
   architectures, say), ask in chat now. Do not draft a whole plan on a coin-flip.
7. **Detail.** Touchpoints, steps, tests, risks, diagrams. Write `plan.json` with
   `status: "draft"`, assuming your recommended option for every decision, and tag every item
   that would change under a different option with `dependsOn: ["<decision id>"]`.
8. **Independent review.** Run `validate` and fix every problem. Then give a fresh sub-agent
   the brief in `agents/reviewer.md` plus only the path to `plan.json` and the repo. Do not
   pass your reasoning; it must start cold. Fix what it finds.
9. **Render.** Serve the plan and open it. Run this **in the background**: it keeps running
   so the dashboard can save the developer's picks and notes straight into the plan folder.

   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/plan.mjs serve <plan-dir> --open
   ```

   It prints the dashboard's address, also writes an offline `plan.html`, and is safe to run
   again for the same plan. It stops by itself about 15 minutes after the developer closes
   the last dashboard tab, so running `serve` again is also how you bring a plan back. If you cannot keep a process
   running, use `stamp <plan-dir> --open` instead; the developer then saves by hand.

   Then say, in two or three lines: which decisions need them, and that after picking options
   and leaving notes they should tell you they are done. Their changes save automatically.

No sub-agents available? Do stages 3, 5 and 8 yourself, in order, following the same briefs.

## What good content looks like

- **Evidence over assertion.** Give `provenance` to every claim that matters: `code` (with the
  path you saw it in), `docs` (URL, the source's date, version), or `assumed`.
- **Follow existing patterns.** Plan the way the codebase already does things.
- **Trace criteria to steps to tests.** Every "done when" id must appear in the `criteria` of
  at least one step and one test. Validation enforces this.
- **Riskiest thing first.** If one assumption could sink the approach, step one is a small
  spike that tests it.
- **Steps that leave things working.** Small, verifiable, safe to stop after. Each has a
  `verify` line someone can actually check.
- **Blast radius.** Cover callers, consumers, migrations and permissions of what you change.
- **Honest unknowns.** What you could not verify is an open question, stated plainly.

## Diagrams

One to four, each showing one of the most important changes, no two telling the same story,
12 boxes or fewer, mid-to-high level. Mark boxes `"tone": "new"` when added or changed by
this plan and `"alt"` for error or alternative paths; leave existing things untoned.

| If the work mostly changes | Lead with (`kind`) | Optionally add |
|---|---|---|
| Infrastructure, cloud resources, permissions | `architecture` | `sequence` |
| How data moves or is transformed | `dataFlow` | `sequence` |
| Stored data shape | `er` | `dataFlow` |
| Service or API interactions | `sequence` | `component` |
| Stateful behaviour (statuses, retries) | `state` | `sequence` |
| UI and user journeys | `userFlow` | `component` |
| Code structure | `component` | `sequence` |

Two source formats, both drawn by the dashboard:

- `"type": "graph"`: boxes on a grid. You choose each box's `col` and `row`. Keep arrows
  between neighbouring cells, flowing left to right or top to bottom, so none crosses a box.
- `"type": "sequence"`: `actors` across the top, `messages` in the order they happen. Use
  `"dashed": true` for responses.

## When the developer comes back

They will say something like "done", "I've picked" or "I left comments".

1. Read `<plan-dir>/plan.state.json`. If it is missing or older than they imply, the page was
   probably opened from disk rather than from the plan server: ask them to press
   **Save for agent** (in Firefox and Safari it downloads the file, which they then move into
   the plan folder), or run `serve` again.
2. **Decisions.** For each decision compare their pick in `state.decisions` with the option
   the plan is written for (`chosen`, or `recommended` when `chosen` is absent).
   - Same: nothing to rewrite.
   - Different: rewrite **only** the items whose `dependsOn` includes that decision, keeping
     their ids, then set the decision's `chosen` to their pick.
   - Not picked yet: leave it, and say it is still open.
3. **Notes.** For each note with `kind: "forAgent"` and `status: "open"`: check it against the
   plan and the code, then either revise the item it is anchored to or answer it. Record your
   answer in the state file as `"reply": { "text": "...", "at": "<ISO time>" }` and set
   `"status": "resolved"`. Ignore `toSelf` notes. Change nothing else in the state file except
   `updatedAt`, which you must set to the current ISO time so the dashboard picks up your edit.
4. If you rewrote items, have the reviewer re-check just those ids.
5. When every decision is picked and no `forAgent` note is open, set `status: "final"`.
   Bump the plan's `updatedAt`, then run `validate`, then `serve <plan-dir> --open` again.
   A served page shows your edits on reload, so tell the developer to reload if it is open.

**Stop the server when the work is over**: once the plan is final and the developer has seen
it, or whenever they say they are done with the plan, run:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/plan.mjs stop <plan-dir>
```

Their ticks are already saved, and `plan.html` in the plan folder still opens from disk.

Re-running `stamp` or `serve` on any plan folder also upgrades an old plan to the current dashboard.
