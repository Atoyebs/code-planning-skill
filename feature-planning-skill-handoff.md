# Feature planning skill: build handoff

Handoff for Claude Code. This captures every decision from the design
conversation so the skill can be built without that conversation.

Status labels used below:
- **Agreed**: the owner (Ini) explicitly chose or approved it
- **Proposed**: recommended during design, not objected to, not explicitly confirmed. Build it, but treat as adjustable
- **Open**: still needs a decision. Ask before building, or pick the suggested default and flag it

---

## 1. What we are building

A personal Claude skill that helps a software developer plan one feature
inside an existing app or system. Its output is a private, visual,
dashboard-style plan that the developer reads, annotates and decides on,
and that an agent can read back and revise.

The problem it solves: agent-written plans arrive as a verbose wall of
text where the only structure is bold and bullets. The reader then:

1. Loses the thread
2. Can't picture the core changes
3. Can't tell what is important
4. Can't tell where their input is needed

Every build choice should be judged against those four problems.

### Not in scope
- Planning an entire app or system from scratch (see the scope gate, section 4)
- Stakeholder-facing documents. This is a private working tool
- Writing or modifying code in the target repo. The planner is read-only

---

## 2. Decision log

| # | Topic | Decision | Status |
|---|---|---|---|
| 1 | Audience | Solo developer, private use. No team or stakeholder sections | Agreed |
| 2 | Length | Short. Cut anything a developer working privately would not use, keep everything needed to understand and implement | Agreed |
| 3 | Plan sections | Seven sections (section 6) | Agreed |
| 4 | Diagrams | One to four per plan, chosen by what the change mostly affects | Agreed |
| 5 | Output style | Visual dashboard with custom components, low verbal density, lightly interactive | Agreed |
| 6 | Layout | Dashboard. One section visible at a time, switched from a section navigation | Agreed |
| 7 | Visual design | "B · Dark control room" artboard (section 8) | Agreed |
| 8 | Notes | Developer can leave notes for themselves and for the agent; visible but tidy; agent can read and respond | Agreed |
| 9 | Works outside Claude | Plan must open and be usable outside the Claude app, as local files | Agreed |
| 10 | Storage | Outside the repo: `~/.plans/<repo-name>/<feature-name>/` | Agreed |
| 11 | Format | Structured data as source of truth, rendered to one self-contained static HTML file | Agreed |
| 12 | Viewer tooling | Vite project with an HTML template, built to a single static file | Agreed |
| 13 | Scope | Features within an app or system only, never a whole app | Agreed |
| 14 | Sub-agents | Use them deliberately, for token efficiency and task focus | Agreed |
| 15 | Verification | Fast-changing facts need current official docs, or two reputable sources from the last year | Agreed |
| 16 | Decision checkpoint | Dashboard first: draft the full plan with decisions open, finalise after the developer picks (two-pass flow, section 5) | Agreed |
| 17 | Build location | Build and test the skill in Claude Code | Agreed |
| 18 | File set | `plan.json`, generated `plan.html`, plus a user-owned file for notes | Agreed in outline |
| 19 | Build once, stamp per plan | Vite builds a template once; each plan injects its JSON into the template with no per-plan build | Proposed |
| 20 | Provenance labels | Every claim labelled: seen in code, verified in docs, or assumed | Proposed |
| 21 | `dependsOn` tagging | Items that hinge on a decision are tagged and shown as provisional | Proposed |
| 22 | Independent reviewer | A fresh sub-agent checks the plan before the developer sees it | Proposed |
| 23 | Word budgets | Hard caps per field, enforced by schema validation | Proposed |
| 24 | Light and dark modes | Both, with a toggle (the artboard has this) | Proposed |
| 25 | Diagram format | Mermaid, or a simple nodes-and-edges format laid out by the viewer | Open |
| 26 | Notes UI | Not designed in the chosen artboard yet | Open |
| 27 | Saving state from a static page | Mechanism not finalised (section 9) | Open |
| 28 | Viewer framework | Plain TypeScript, or a small framework such as Preact or Svelte | Open |
| 29 | Which agents besides Claude Code must read the plan | Not answered | Open |

---

## 3. Architecture

### Skill package (suggested layout)

```
feature-plan/
  SKILL.md                  # the planning flow and rules
  agents/
    scout.md                # codebase survey instructions
    researcher.md           # external verification instructions
    reviewer.md             # independent plan review instructions
  schema/
    plan.schema.ts          # TypeScript types (source of truth)
    plan.schema.json        # generated JSON Schema for validation
  viewer/                   # Vite + TypeScript project (source)
  dist/
    template.html           # prebuilt single-file viewer with an empty data slot
  scripts/
    stamp.(ts|mjs)          # inject plan.json into template.html
    validate.(ts|mjs)       # validate plan.json against the schema
  examples/
    magic-link-signin.plan.json   # sample plan matching the artboard
```

Verify the current skill and sub-agent file conventions for Claude Code
against its official documentation before settling the layout. Do not
rely on memory for this.

### Files written per plan

Location: `~/.plans/<repo-name>/<feature-name>/`

| File | Owner | Purpose |
|---|---|---|
| `plan.json` | Agent | The plan content. The agent edits this |
| `plan.html` | Generated | Template with `plan.json` inlined. The developer opens this |
| `plan.state.json` | Developer | Notes, decision picks and ticked items (see note below) |

Note on the third file: the conversation called it `plan.comments.json`
and scoped it to notes. Proposed change: make it `plan.state.json` and
store notes, decision picks and ticks together, so everything the
developer does is in one user-owned file and never collides with
agent edits to `plan.json`. Confirm with the owner.

### Storage rules
- Plans live outside the repo so they can never be committed by mistake. No git-ignore handling is needed
- `plan.json` records the repo path and branch so the agent knows which codebase it describes
- If two repos share a folder name, append a short suffix
- Outside a repo, the same location works with a general folder name
- The skill prints the plan path and opens the page after creating or updating a plan
- Agents that are sandboxed to the project folder need access to `~/.plans/`. The skill instructions must name exact file paths so the right permission is requested

### Why build once and stamp
- A page opened from disk generally cannot fetch a neighbouring JSON file, so the data must be inlined into the HTML
- Running Vite per plan would need Node, an install and a build every time. Stamping is a string replace
- Old plans keep the template they were stamped with. Provide a "re-stamp" command so plans can pick up viewer upgrades (all content is in `plan.json`)

Use `vite-plugin-singlefile` to inline JS and CSS into one HTML file.
Known limits: single entry point only, and in-page navigation must be
hash-based for local files. Both fit this viewer. Check the plugin's
current docs and version before use.

---

## 4. Planning flow

Nine stages. Stages 3, 5 and 8 are delegated to sub-agents.

| # | Stage | What happens | Who |
|---|---|---|---|
| 1 | Scope gate | Confirm it is one feature in an existing system. Decline or split whole-app requests. For trivial changes, say a plan is overkill | Main agent |
| 2 | Intake | Restate the goal in one sentence, draft "done when" criteria, ask only blocking questions | Main agent |
| 3 | Codebase survey | Find relevant files, existing patterns, tests and installed dependency versions. Return a short findings list with file paths | Scout |
| 4 | Assumption triage | List everything the plan depends on. Label each: seen in code, stable knowledge, or volatile external fact | Main agent |
| 5 | Verification | For each volatile fact, apply the verification rule (section 4.2) | Researchers, in parallel |
| 6 | Approach and decisions | Shape the key changes. Surface only real forks, each with a recommendation | Main agent |
| 7 | Detail | Touchpoints, steps, tests, risks, diagrams | Main agent |
| 8 | Independent review | Check the plan against the code (section 4.3) | Reviewer |
| 9 | Render and iterate | Validate, stamp, open. Revise from notes and decisions | Main agent |

### 4.1 Sub-agent roles

| Role | Job | Returns |
|---|---|---|
| Scout | Read-only survey of the codebase | Short findings: relevant files with paths, patterns to follow, existing tests, dependency versions from the lockfile, things that touch the affected code |
| Researcher | Verify one external fact per agent | Claim, verdict, source URLs, source dates, version the source applies to, confidence |
| Reviewer | Critique the finished draft, starting cold | List of problems, each tied to a plan item ID |

Rules:
- One narrow job per sub-agent, with a fixed return format
- Sub-agents return summaries with evidence, never file or page dumps. This is where the token saving comes from
- The main agent keeps synthesis, trade-offs and the conversation with the developer
- Scale to the feature. A small feature may need one scout and no researchers. Do not spawn agents for everything
- The reviewer must not see the planner's reasoning, so it cannot simply agree with it

### 4.2 Verification rule

Applies to anything fast-changing: library and framework APIs, cloud
service capabilities and limits, pricing, deprecations, tooling
behaviour.

A volatile fact counts as verified only if one of these holds:
- It is confirmed in current official documentation for the version actually installed in the repo, or
- It is corroborated by at least two reputable sources published within the last year

Otherwise it is labelled assumed and appears in Risks and unknowns.

Supporting rules:
- Pin research to the installed version from the lockfile. The latest docs can describe APIs the repo does not have
- Model knowledge is a starting point, never sufficient proof for a volatile fact
- Record source URL and date with every verified claim

### 4.3 Reviewer checklist
- Every file path in Touchpoints exists (for modify and delete) or has a sensible parent (for create)
- Steps are in a workable order and each leaves the code in a working state
- Every "done when" criterion maps to at least one step and at least one test
- Nothing labelled assumed is stated as fact elsewhere in the plan
- Word budgets are respected
- Decisions are real forks, not things the agent could have looked up
- Blast radius is covered: callers, consumers, migrations, permissions

### 4.4 Planner priorities
- **Evidence over assertion.** Every claim carries a provenance label
- **Follow existing patterns.** Reuse how the codebase already does things. A new approach is a decision for the developer
- **Decisions before detail.** Never ask the developer what could have been looked up
- **Trace criteria to steps to tests**
- **Blast radius.** Check what else touches the changed code
- **Riskiest thing first.** If an assumption could sink the approach, step one is a small spike to test it
- **Steps that leave things working.** Small, verifiable, safe to stop after
- **Read-only planning.** Never edit the target repo
- **Honest unknowns.** What could not be verified is stated plainly as an open question
- **Resumable.** `plan.json` is the state, so a new session can pick the plan up without the original conversation
- **Right-sized.** Sections shrink for small features. Approach and Risks can be a line or two

---

## 5. Two-pass decision flow

The developer chose to see the dashboard first and decide there.

**Pass 1: draft**
- The agent writes the whole plan, assuming its own recommended option for each decision
- Every item that depends on a decision is tagged with that decision (`dependsOn`)
- The dashboard shows tagged items as provisional and the plan as a draft
- The reviewer checks the draft before the developer first sees it

**Developer decides**
- Picks options in the dashboard, leaves notes, then tells the agent they are done

**Pass 2: finalise**
- Recommended option chosen: nothing is regenerated, the provisional marker clears
- Different option chosen: the agent rewrites only the items tagged to that decision
- The reviewer re-checks only rewritten items
- Plan status flips from draft to final

**Rule for big forks:** if a decision would change most of the plan (for
example two different architectures), ask the developer in chat before
pass 1. Do not draft a whole plan on a coin-flip.

---

## 6. Plan content

### Sections, in order

1. **Goal**: one or two sentence goal, checkable "done when" list, out-of-scope list
2. **Approach**: up to three key changes, plus decisions the developer must make
3. **Visual overview**: one to four diagrams, each with a one-line caption
4. **Touchpoints**: files to create, modify or delete, plus config, migrations and dependencies
5. **Steps**: ordered, checkable tasks, each with a verify line
6. **Testing**: tests to write, edge cases, manual checks
7. **Risks and unknowns**: risks with fallbacks, assumptions, open questions

### Diagram selection

Up to four, budget weighted towards the dominant type of change. Every
diagram must show one of the most important proposed changes; small
features may need only one. No two diagrams tell the same story.
Roughly 12 nodes or fewer each. New and changed elements are visually
distinct from existing ones. Mid-to-high level only.

| If the work mostly changes | Lead with | Optionally add |
|---|---|---|
| Infrastructure (IaC, cloud resources, networking, permissions) | Architecture diagram, one or two | Deployment or sequence diagram |
| How data moves or is transformed | Data flow diagram | Sequence diagram of the major new code path |
| Stored data shape (schemas, migrations) | Entity relationship diagram | Data flow diagram |
| Service or API interactions | Sequence diagram | Component diagram |
| Stateful behaviour (workflows, statuses, retries) | State diagram | Sequence diagram |
| UI and user journeys | User flow diagram | Component tree |
| Code structure (new modules, refactors) | Component or module dependency diagram | Sequence diagram |

### Word budgets (proposed starting values)

| Field | Limit |
|---|---|
| Goal | 2 sentences |
| Key change title | 8 words |
| Key change text | 30 words |
| Decision question | 12 words |
| Decision option label | 5 words |
| Recommendation reason | 25 words |
| Step title | 12 words |
| Step verify line | 14 words |
| Diagram caption | 14 words |
| Any other text field | 2 sentences |

Enforce in validation. The schema is what stops verbosity; instructions
alone will not.

### Draft schema

A starting point derived from the chosen artboard plus the agreed
additions. Refine during the build.

```ts
type Provenance =
  | { kind: "code"; path: string }
  | { kind: "docs"; sources: { url: string; date: string; version?: string }[] }
  | { kind: "assumed" };

interface Plan {
  schemaVersion: 1;
  id: string;                    // feature slug
  title: string;
  status: "draft" | "final";
  repo: { path: string; branch?: string };
  createdAt: string;
  updatedAt: string;

  goal: {
    statement: string;
    doneWhen: Item[];            // acceptance criteria, checkable
    outOfScope: string[];
  };

  approach: {
    keyChanges: KeyChange[];     // max 3
    decisions: Decision[];
  };

  visuals: Diagram[];            // 1 to 4

  touchpoints: {
    files: FileTouch[];
    config: CodeNote[];
    migrations: CodeNote[];
    dependencies: CodeNote[];
  };

  steps: Step[];

  testing: {
    tests: TestItem[];
    edgeCases: Item[];
    manualChecks: Item[];        // checkable
  };

  risks: {
    risks: Risk[];
    assumptions: Item[];
    openQuestions: Item[];
  };
}

interface Base {
  id: string;                    // stable; notes and state anchor to this
  dependsOn?: string[];          // decision ids; provisional until decided
  provenance?: Provenance;
}

interface Item extends Base { text: string }
interface KeyChange extends Base { title: string; text: string }

interface Decision extends Base {
  question: string;
  options: { id: string; label: string }[];   // 2 to 4
  recommended: string;                        // option id
  reason: string;
}

interface Diagram extends Base {
  kind: "architecture" | "dataFlow" | "sequence" | "state" | "er"
      | "userFlow" | "component";
  label: string;                 // tab label
  caption: string;
  source: unknown;               // format is an open decision, see section 10
}

interface FileTouch extends Base {
  action: "create" | "modify" | "delete";
  path: string;
  note: string;
}

interface CodeNote extends Base { code: string; note: string }

interface Step extends Base {
  title: string;
  verify: string;
  criteria?: string[];           // doneWhen ids this step delivers
}

interface TestItem extends Base {
  kind: "unit" | "integration" | "e2e";
  title: string;
  covers: string;
  criteria?: string[];           // doneWhen ids this test proves
}

interface Risk extends Base {
  level: "high" | "medium" | "low";
  title: string;
  fallback: string;
}
```

User-owned state file:

```ts
interface PlanState {
  schemaVersion: 1;
  planId: string;
  decisions: Record<string, string | null>;  // decision id -> option id
  checks: Record<string, boolean>;           // item id -> done
  notes: Note[];
}

interface Note {
  id: string;
  anchor: string;                // id of the plan item it belongs to
  kind: "forAgent" | "toSelf";
  text: string;
  status: "open" | "resolved";
  createdAt: string;
  reply?: { text: string; at: string };      // written by the agent
}
```

Stable IDs matter: notes must stay attached when the agent rewrites an
item. Never reuse or renumber IDs.

---

## 7. Notes

Agreed behaviour:
- A note attaches to any plan item by its ID
- Two kinds: "for agent" and "note to self", so the agent knows what to act on
- Visible but tidy: collapsed to a marker with a count, expandable, resolved notes tucked away
- The agent replies in place or revises the item, then marks the note resolved
- The developer says "I've left comments" and the agent reads the state file, reviews each open "for agent" note against the plan, and responds

Not yet designed: how notes look and where they live in the chosen
dashboard. See section 10.

---

## 8. Viewer design reference

Chosen design: artboard "B · Dark control room", from the canvas
"Feature plan dashboard". Its sample content is a "Magic-link sign-in"
feature. The owner should supply the artboard source and a screenshot
alongside this file; treat those as the visual source of truth and
rebuild faithfully.

### Layout
- **Header:** a short vertical accent bar; a monospace label "feature plan · <branch>"; the plan title; three live stat pills (steps done, decisions made, criteria met); a theme toggle
- **Section navigation:** a row of seven tiles in a responsive grid. Each has an icon, a two-digit number, the section name and a small meta value (for example `2/8`, `2 open`, a count). The active tile is filled with the accent colour
- **Main area:** shows only the selected section

### Per-section treatment
- **Goal:** large goal statement on the left with out-of-scope items as dashed pills beneath; a "Done when" panel on the right with checkable rows and an "n of m met" counter
- **Approach:** numbered key changes on the left (large muted numerals, title, one or two lines of text, hairline dividers); decision cards on the right, each with the question, option buttons, a star on the recommended option and an "agent recommends" line. Undecided cards have an amber border; the chosen option is filled with the accent colour
- **Visual overview:** caption on the left, tabs to switch diagram on the right, one diagram at a time in a panel. Highlighted nodes use the accent fill; error or alternative paths use a dashed amber border
- **Touchpoints:** three columns grouped Create, Modify, Delete, each with a coloured underline and a file count; file cards show a muted directory, the filename and a note. Below, a three-cell strip for config, migrations and dependencies
- **Steps:** a large `done/total` counter with a segmented progress bar on the left; step rows on the right with checkbox, title and a monospace "verify:" line. The first unfinished step is highlighted and tagged "next up"
- **Testing:** three panels: tests to write (kind in colour, title, what it covers), edge cases (numbered), manual checks (checkable)
- **Risks and unknowns:** risk rows with a level marker (high, medium, low), title and fallback; two columns below for assumptions and open questions

### Design tokens (from the artboard)

Fonts: Space Grotesk (400, 500, 600) for text; JetBrains Mono (400, 500)
for labels, counters, paths and code.

```css
/* dark (default) */
--bg:#0F1114; --panel:#171A1F; --panel2:#20242B;
--line:#2A2F38; --line-strong:#4A515E;
--text:#ECEEF1; --text2:#C9CED6; --muted:#A3ABB8; --edge:#8A93A2;
--ink:#14170A; --ink2:#2C3311;
--amber:#FFB454; --amber-line:#7A5A2A;
--red:#FF9A8B; --blue:#8FC1FF;
--accent:#C6F24E; --accent-text:var(--accent);

/* light */
--bg:#F5F6F2; --panel:#FFFFFF; --panel2:#EEF0EA;
--line:#DFE1DA; --line-strong:#B4B8AE;
--text:#14161A; --text2:#3A3F47; --muted:#5A606B; --edge:#6B7280;
--amber:#8F4A00; --amber-line:#E0B77A;
--red:#A8321F; --blue:#1F5FA8;
--accent-text:color-mix(in oklab, var(--accent) 38%, #0B0D06);
```

Colour meaning:
- Accent (lime): active section, progress, selected or done states, create
- Amber: needs the developer (undecided decisions, open questions, recommendations)
- Blue: modify, integration tests
- Red: delete, high risk

Shape and size: radii of 10 to 16px on controls and panels; 1px
hairline borders; interactive targets at least 44px tall; visible focus
outlines; real `button` elements for anything clickable.

### Behaviours already in the artboard
- Clicking a nav tile switches the section
- Ticking acceptance criteria, steps and manual checks updates the header stats and tile meta live
- Picking a decision option updates "decisions made" and the Approach tile
- "Next up" moves automatically to the first unfinished step
- Diagram tabs switch the visible diagram
- Theme toggle switches dark and light

### What the viewer still needs (not in the artboard)
- Draft or final indicator in the header
- Provisional marker on items with an undecided `dependsOn`
- Provenance indicator per item (subtle; assumed items should stand out)
- Notes: add, view, expand, resolve, and a way to see all open notes
- Persisting state (section 9)
- "Copy as markdown" for pasting the plan elsewhere
- Fonts bundled into the file. The artboard loads them from Google Fonts, which breaks offline use
- Hash-based section routing so a section can be linked and survives reload

---

## 9. Saving state from a static page

Requirement: decision picks, ticks and notes must reach a file the
agent can read, from a page opened straight from disk.

Constraint found during design: writing directly to a local file from a
web page (File System Access API) is supported in Chromium browsers
such as Chrome and Edge, not in Firefox or Safari.

Options to evaluate, in suggested order:
1. **Direct save where supported**, with the developer granting access to the plan folder once
2. **Export fallback**: a "Save notes" button that downloads `plan.state.json` for the developer to drop into the plan folder
3. **Tiny local server** started by the skill, which serves the plan and writes the state file

Also keep an in-browser copy (for example `localStorage`) so nothing is
lost on reload, treating the file as the source of truth for the agent.
Verify current browser support in official documentation before
choosing.

An existing open-source tool, Plannotator, reviews and annotates agent
plans and sends structured feedback back to coding agents. It was noted
as worth evaluating before building a custom comment layer. It is
centred on markdown plans, so it may not fit a custom dashboard.

---

## 10. Open items

| Item | Suggested default |
|---|---|
| Diagram format | Start with Mermaid stored as text in `plan.json`, bundled and themed to the design tokens. The artboard's diagrams are hand-positioned HTML, which an agent cannot author reliably. If themed Mermaid cannot get close to the artboard's look, consider a simple nodes-and-edges format the viewer lays out |
| Notes UI | Design in the artboard's style before building. Needs: a marker on annotated items, an add-note affordance on every item, an inbox of open notes reachable from the header |
| Save mechanism | Section 9, option 1 with option 2 as fallback |
| Viewer framework | Smallest thing that keeps components typed and state simple. Decide after sketching the notes feature |
| Other agents | Ask the owner which agents besides Claude Code must read the plan. The files are plain JSON, so any file-reading agent should work |
| Third file name and scope | `plan.state.json` holding notes, picks and ticks |
| Word budgets | Section 6 values, tuned after the first few real plans |

---

## 11. Suggested build order

1. **Schema**: TypeScript types, generated JSON Schema, validation script with word-budget checks
2. **Sample data**: turn the artboard's magic-link content into `examples/magic-link-signin.plan.json`
3. **Viewer**: Vite project rendering the sample faithfully to the artboard, in both themes, fonts bundled
4. **Stamp script**: template plus `plan.json` in, `plan.html` out; plus re-stamp
5. **State**: decisions, ticks and notes saved and reloaded
6. **Missing UI**: draft or final, provisional, provenance, notes
7. **Diagrams**: chosen format rendered in the design's style
8. **SKILL.md and sub-agent instructions**: the nine-stage flow, two-pass rule, verification rule, return formats
9. **Test run** on a real feature in a real repo, then tune instructions and budgets

### Definition of done for version 1
- Asking for a whole app is declined or split; asking for a feature produces a plan
- The plan validates, stays within word budgets and opens offline from `~/.plans/`
- All seven sections render to match the chosen design in both themes
- At least one volatile fact in the test run shows verified provenance with dated sources, and unverified ones appear as assumptions
- Picking a non-recommended option causes only the tagged items to be rewritten
- A "for agent" note left in the dashboard is read, answered and resolved by the agent
- Nothing is written inside the target repo

---

## 12. To supply alongside this file

- The "B · Dark control room" artboard source (HTML) and a screenshot
- A repo and a real feature to use for the first test run
- Answers to the open items in section 10, where the owner has a view
