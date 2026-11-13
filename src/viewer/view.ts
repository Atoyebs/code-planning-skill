import type { Base, Decision, Note } from '../schema.ts';
import { escapeHtml as h } from '../utility/text.ts';
import { renderDiagram } from './diagram.ts';
import type { Store } from './store.ts';

/** Line-icon paths on a 20x20 grid, taken from the "Dark control room" design. */
const ICONS = {
  goal: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  approach: 'M5 17V10a4 4 0 0 1 4-4h7 M13 3l3 3-3 3',
  visual: 'M3 3h5v4H3z M12 13h5v4h-5z M8 5h5.5a1 1 0 0 1 1 1v7',
  touchpoints: 'M6 3h5l4 4v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M11 3v4h4',
  steps: 'M3.5 5.5l1.5 1.5 2.5-3 M10 6h7 M3.5 13.5l1.5 1.5 2.5-3 M10 14h7',
  testing: 'M8 3h4 M9 3v5l-4.2 7a1.3 1.3 0 0 0 1.1 2h8.2a1.3 1.3 0 0 0 1.1-2L11 8V3 M6.8 13h6.4',
  risks: 'M10 3.5l7.5 13h-15z M10 8.5v3.5 M10 14.6v.1',
  decisions: 'M10 17v-6 M10 11L5 6 M10 11l5-5 M5 9.5V6h3.5 M15 9.5V6h-3.5',
  done: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M7 10.2l2 2 4-4.4',
  excluded: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M5.2 5.2l9.6 9.6',
  create: 'M10 4v12 M4 10h12',
  modify: 'M4 16l.8-3.4L13.5 4a1.4 1.4 0 0 1 2 0l.5.5a1.4 1.4 0 0 1 0 2L7.4 15.2z M12 5.5l2.5 2.5',
  delete: 'M4 6h12 M8 6V4h4v2 M6 6l.7 10h6.6L14 6 M8.5 9v4.5 M11.5 9v4.5',
  config: 'M4 6h7 M15 6h1 M4 14h1 M9 14h7 M13 4.5v3 M7 12.5v3',
  migrations: 'M4 5.5C4 4.1 6.7 3 10 3s6 1.1 6 2.5S13.3 8 10 8 4 6.9 4 5.5z M4 5.5v9C4 15.9 6.7 17 10 17s6-1.1 6-2.5v-9 M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5',
  dependencies: 'M10 3l6 3v8l-6 3-6-3V6z M4 6l6 3 6-3 M10 9v8',
  tests: 'M7 6l-4 4 4 4 M13 6l4 4-4 4',
  edges: 'M4 4v5a3 3 0 0 0 3 3h9 M13 9l3 3-3 3',
  manual: 'M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10z M10 7.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z',
  assumptions: 'M6 3h8v14l-4-3-4 3z',
  questions: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M8 8.2a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.6 M10 14v.1',
  sun: 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M10 2v1.5 M10 16.5V18 M2 10h1.5 M16.5 10H18 M4.3 4.3l1.1 1.1 M14.6 14.6l1.1 1.1 M4.3 15.7l1.1-1.1 M14.6 5.4l1.1-1.1',
  moon: 'M16.5 11.5A7 7 0 0 1 8.5 3.5a7 7 0 1 0 8 8z',
  note: 'M4 4h12v9H9.5L6 16v-3H4z',
  save: 'M4 4h9l3 3v9H4z M7 4v4h5 M7 16v-5h6v5',
  copy: 'M7 7h9v9H7z M4 13V4h9',
} as const;

type IconName = keyof typeof ICONS;

/** The seven plan sections, in order. Their ids double as the URL hash. */
export const SECTIONS = [
  { id: 'goal', label: 'Goal' },
  { id: 'approach', label: 'Approach' },
  { id: 'visual', label: 'Visual overview' },
  { id: 'touchpoints', label: 'Touchpoints' },
  { id: 'steps', label: 'Steps' },
  { id: 'testing', label: 'Testing' },
  { id: 'risks', label: 'Risks and unknowns' },
] as const;

/** What the developer is currently looking at. Not saved; it resets on reload. */
export interface Ui {
  /** A section id, or "notes" for the notes inbox. */
  section: string;
  /** Index of the diagram tab that is showing. */
  diagram: number;
  /** Id of the item whose notes are expanded, if any. */
  openNote: string | null;
}

/**
 * Draws an icon.
 *
 * @param name - Which icon.
 * @param size - Width and height in pixels.
 * @returns SVG markup, hidden from screen readers because it is decoration.
 */
function icon(name: IconName, size = 18): string {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

/** The tick-box drawn inside every checkable row. */
const TICK_BOX =
  '<span class="box" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6 9.5 3.6"/></svg></span>';

/**
 * Builds the whole dashboard as an HTML string from the plan and the
 * developer's state. It never touches the page itself; main.ts puts the
 * result on screen and handles clicks.
 */
export class PlanView {
  private readonly store: Store;
  private readonly ui: Ui;
  /** For each item id: which section it is in and a short label, used by the notes inbox. */
  readonly anchors = new Map<string, { section: string; label: string }>();

  /**
   * @param store - The plan plus the developer's ticks, picks and notes.
   * @param ui - What is currently selected on screen.
   */
  constructor(store: Store, ui: Ui) {
    this.store = store;
    this.ui = ui;
    const p = store.plan;
    /** Remembers where a list of items lives and how to name each one. */
    const index = <T extends Base>(section: string, items: T[], label: (item: T) => string) =>
      items.forEach((it) => this.anchors.set(it.id, { section, label: label(it) }));
    index('goal', p.goal.doneWhen, (i) => i.text);
    index('approach', p.approach.keyChanges, (i) => i.title);
    index('approach', p.approach.decisions, (i) => i.question);
    index('visual', p.visuals, (i) => i.label);
    index('touchpoints', p.touchpoints.files, (i) => i.path);
    index('touchpoints', [...p.touchpoints.config, ...p.touchpoints.migrations, ...p.touchpoints.dependencies], (i) => i.code);
    index('steps', p.steps, (i) => i.title);
    index('testing', p.testing.tests, (i) => i.title);
    index('testing', [...p.testing.edgeCases, ...p.testing.manualChecks], (i) => i.text);
    index('risks', p.risks.risks, (i) => i.title);
    index('risks', [...p.risks.assumptions, ...p.risks.openQuestions], (i) => i.text);
  }

  /**
   * Counts how many of a list of checkable items are ticked.
   *
   * @param items - Checkable items.
   * @returns The number ticked.
   */
  private doneCount(items: Base[]): number {
    return items.filter((i) => this.store.state.checks[i.id]).length;
  }

  /**
   * Counts the decisions the developer has made.
   *
   * @returns The number of decisions with an option picked.
   */
  private decidedCount(): number {
    return this.store.plan.approach.decisions.filter((d) => this.store.state.decisions[d.id]).length;
  }

  /**
   * Lists the notes attached to one item.
   *
   * @param anchor - The item's id.
   * @param status - Which notes to return.
   * @returns The matching notes.
   */
  private notesFor(anchor: string, status: Note['status']): Note[] {
    return this.store.state.notes.filter((n) => n.anchor === anchor && n.status === status);
  }

  /**
   * Works out whether an item is still waiting on a decision.
   * "provisional" means a decision it depends on is not made yet;
   * "needs rewrite" means the developer picked a different option from the
   * one the text was written for, so the agent has to revise it.
   *
   * @param item - Any plan item.
   * @returns The marker text, or an empty string when the item is settled.
   */
  private pending(item: Base): string {
    const decisions = this.store.plan.approach.decisions;
    let result = '';
    for (const depId of item.dependsOn ?? []) {
      const d = decisions.find((x) => x.id === depId);
      const picked = d && this.store.state.decisions[d.id];
      if (!d || !picked) return 'provisional';
      if (picked !== (d.chosen ?? d.recommended)) result = 'needs rewrite';
    }
    return result;
  }

  /**
   * Builds the small markers shown beside an item: whether it is provisional
   * and where its claim comes from (code, docs or assumed).
   *
   * @param item - Any plan item.
   * @param extra - More marker HTML to show alongside.
   * @returns HTML for the markers, or an empty string when there are none.
   */
  private tags(item: Base, extra = ''): string {
    const pending = this.pending(item);
    let out = pending ? `<span class="tag dashed amber">${pending}</span>` : '';
    const prov = item.provenance;
    if (prov?.kind === 'assumed') out += '<span class="tag amber">assumed</span>';
    if (prov?.kind === 'code') out += `<span class="tag" title="Seen in ${h(prov.path)}">code</span>`;
    if (prov?.kind === 'docs') {
      const s = prov.sources[0];
      const detail = `${s.date}${s.version ? `, version ${s.version}` : ''}${prov.sources.length > 1 ? `, +${prov.sources.length - 1} more` : ''}`;
      out += `<a class="tag blue" href="${h(s.url)}" target="_blank" rel="noopener" title="Verified in docs (${h(detail)})">docs</a>`;
    }
    out += extra;
    return out ? `<span class="tags">${out}</span>` : '';
  }

  /**
   * Wraps an item's content with its markers, its note button and, when
   * expanded, its notes. Every item goes through here so notes work the same
   * way everywhere.
   *
   * @param item - The plan item.
   * @param main - HTML for the item's own content.
   * @param cls - Extra CSS classes for the wrapper.
   * @param extraTags - More marker HTML to show beside the item.
   * @returns HTML for the complete item.
   */
  private item(item: Base, main: string, cls = '', extraTags = ''): string {
    const open = this.notesFor(item.id, 'open').length;
    const expanded = this.ui.openNote === item.id;
    const button = `<button class="nb${open ? ' has' : ''}" data-act="note" data-id="${item.id}" aria-expanded="${expanded}" aria-label="Notes on this item, ${open} open">${icon('note', 16)}${open ? `<span>${open}</span>` : ''}</button>`;
    return `<div class="it ${cls}"><div class="it-row"><div class="it-main">${main}</div>${this.tags(item, extraTags)}${button}</div>${expanded ? this.notePanel(item.id) : ''}</div>`;
  }

  /**
   * Draws one note with the agent's reply, if any.
   *
   * @param note - The note.
   * @returns HTML for the note.
   */
  private note(note: Note): string {
    const kind = note.kind === 'forAgent' ? '<span class="mono amber">for agent</span>' : '<span class="mono mut">to self</span>';
    const reply = note.reply ? `<p class="reply"><span class="mono acc">agent</span> ${h(note.reply.text)}</p>` : '';
    return `<div class="note">${kind}<div class="note-body"><p>${h(note.text)}</p>${reply}</div><button class="b sm" data-act="resolve" data-id="${note.id}">${note.status === 'open' ? 'Resolve' : 'Reopen'}</button></div>`;
  }

  /**
   * Draws the expanded notes area under an item: open notes, resolved notes
   * tucked away, and a box for adding a new one.
   *
   * @param anchor - Id of the item the notes belong to.
   * @returns HTML for the notes area.
   */
  private notePanel(anchor: string): string {
    const resolved = this.notesFor(anchor, 'resolved');
    const tucked = resolved.length
      ? `<details><summary class="mono mut">${resolved.length} resolved</summary>${resolved.map((n) => this.note(n)).join('')}</details>`
      : '';
    return `<div class="np">${this.notesFor(anchor, 'open').map((n) => this.note(n)).join('')}${tucked}
<textarea id="note-text" rows="2" aria-label="New note" placeholder="Leave a note on this item"></textarea>
<div class="np-acts"><button class="b amber" data-act="add-note" data-id="${anchor}" data-kind="forAgent">Add for agent</button><button class="b" data-act="add-note" data-id="${anchor}" data-kind="toSelf">Add note to self</button></div></div>`;
  }

  /**
   * Draws a checkable row's button: tick-box plus content.
   *
   * @param id - Id of the item being ticked.
   * @param body - HTML shown next to the tick-box.
   * @returns HTML for the button.
   */
  private check(id: string, body: string): string {
    const done = !!this.store.state.checks[id];
    return `<button class="ck${done ? ' done' : ''}" data-act="check" data-id="${id}" aria-pressed="${done}">${TICK_BOX}<span class="ck-body">${body}</span></button>`;
  }

  /**
   * Draws a small monospace heading with an icon.
   *
   * @param name - Which icon.
   * @param text - The heading text.
   * @param cls - Colour class.
   * @param tag - Heading element to use.
   * @returns HTML for the heading.
   */
  private kicker(name: IconName, text: string, cls = 'acc', tag = 'h2'): string {
    return `<${tag} class="kicker ${cls}">${icon(name)}<span>${text}</span></${tag}>`;
  }

  /**
   * Draws the top bar: plan title, live progress, and the save, copy, notes
   * and theme buttons.
   *
   * @returns HTML for the header.
   */
  private header(): string {
    const { plan, state, dirty, autosaving } = this.store;
    const stat = (name: IconName, value: string, label: string) =>
      `<div class="pill">${icon(name)}<b class="mono">${value}</b><span>${label}</span></div>`;
    const openNotes = state.notes.filter((n) => n.status === 'open').length;
    const dark = document.documentElement.dataset.theme !== 'light';
    const saveHint = dirty
      ? 'You have changes the agent cannot see yet. Save plan.state.json into the plan folder.'
      : autosaving ? 'Changes are saving to plan.state.json automatically.' : 'Save plan.state.json into the plan folder so the agent can read your picks and notes.';
    return `<header class="hd">
<div class="hd-l"><span class="bar" aria-hidden="true"></span><div class="hd-t">
<div class="mono mut">feature plan${plan.repo.branch ? ` · ${h(plan.repo.branch)}` : ''} <span class="tag ${plan.status === 'draft' ? 'amber dashed' : 'acc'}">${plan.status}</span></div>
<h1 class="title">${h(plan.title)}</h1></div></div>
<div class="hd-r">
${stat('steps', `${this.doneCount(plan.steps)}/${plan.steps.length}`, 'steps done')}
${stat('decisions', `${this.decidedCount()}/${plan.approach.decisions.length}`, 'decisions made')}
${stat('done', `${this.doneCount(plan.goal.doneWhen)}/${plan.goal.doneWhen.length}`, 'criteria met')}
<button class="pill${this.ui.section === 'notes' ? ' on' : ''}" data-act="nav" data-id="notes">${icon('note')}<b class="mono">${openNotes}</b><span>open notes</span></button>
<button class="pill" data-act="save" title="${saveHint}">${icon('save')}<span>${autosaving && !dirty ? 'Autosaving' : 'Save for agent'}</span>${dirty ? '<span class="dot" role="img" aria-label="unsaved changes"></span>' : ''}</button>
<button class="sq" data-act="copy" aria-label="Copy plan as markdown" title="Copy plan as markdown">${icon('copy', 20)}</button>
<button class="sq" data-act="theme" aria-label="Switch to ${dark ? 'light' : 'dark'} mode" title="Switch to ${dark ? 'light' : 'dark'} mode">${icon(dark ? 'sun' : 'moon', 20)}</button>
</div></header>`;
  }

  /**
   * Draws the row of seven section tiles, each with a live count.
   *
   * @returns HTML for the navigation.
   */
  private nav(): string {
    const p = this.store.plan;
    const undecided = p.approach.decisions.length - this.decidedCount();
    const meta: Record<string, string> = {
      goal: `${this.doneCount(p.goal.doneWhen)}/${p.goal.doneWhen.length}`,
      approach: undecided ? `${undecided} open` : 'set',
      visual: String(p.visuals.length),
      touchpoints: String(p.touchpoints.files.length),
      steps: `${this.doneCount(p.steps)}/${p.steps.length}`,
      testing: `${this.doneCount(p.testing.manualChecks)}/${p.testing.manualChecks.length}`,
      risks: String(p.risks.risks.length),
    };
    const tiles = SECTIONS.map((s, i) => {
      const current = s.id === this.ui.section ? ' aria-current="page"' : '';
      return `<button class="tile" data-act="nav" data-id="${s.id}"${current}><span class="tile-top mono">${icon(s.id, 20)}<span>${meta[s.id]}</span></span><span class="tile-name"><span class="mono">0${i + 1}</span><span>${s.label}</span></span></button>`;
    });
    return `<nav class="nav" aria-label="Plan sections">${tiles.join('')}</nav>`;
  }

  /**
   * Draws the Goal section: the goal, what is out of scope, and the
   * checkable "done when" list.
   *
   * @returns HTML for the section.
   */
  private goal(): string {
    const { goal } = this.store.plan;
    const scope = goal.outOfScope.length
      ? `<div class="col g12">${this.kicker('excluded', 'not in this plan', 'mut')}<ul class="chips">${goal.outOfScope.map((s) => `<li>${h(s)}</li>`).join('')}</ul></div>`
      : '';
    const rows = goal.doneWhen.map((c) => this.item(c, this.check(c.id, h(c.text)))).join('');
    return `<section aria-label="Goal" class="split">
<div class="col g32 grow-420 pt8"><div class="col g14">${this.kicker('goal', '01 goal', 'acc', 'div')}<p class="goal">${h(goal.statement)}</p></div>${scope}</div>
<div class="panel grow-380 rows"><div class="panel-hd"><h2>${icon('done')}<span>Done when</span></h2><span class="mono mut">${this.doneCount(goal.doneWhen)} of ${goal.doneWhen.length} met</span></div>${rows}</div>
</section>`;
  }

  /**
   * Draws one decision card with its options and the agent's recommendation.
   *
   * @param d - The decision.
   * @returns HTML for the card.
   */
  private decision(d: Decision): string {
    const picked = this.store.state.decisions[d.id];
    const options = d.options.map((o) => {
      const star = o.id === d.recommended
        ? '<svg class="star" width="14" height="14" viewBox="0 0 14 14" role="img" aria-label="Recommended"><path d="M7 1l1.8 3.9 4.2.5-3.1 2.9.8 4.2L7 10.4l-3.7 2.1.8-4.2L1 5.4l4.2-.5z"/></svg>'
        : '';
      return `<button class="opt" data-act="pick" data-id="${d.id}" data-opt="${o.id}" aria-pressed="${picked === o.id}"><span>${h(o.label)}</span>${star}</button>`;
    });
    const main = `<h3>${h(d.question)}</h3><div class="opts">${options.join('')}</div><p class="why"><span class="mono amber">agent recommends</span>&nbsp; ${h(d.reason)}</p>`;
    return this.item(d, main, `dec${picked ? '' : ' undecided'}`);
  }

  /**
   * Draws the Approach section: the key changes and the decisions that need
   * the developer.
   *
   * @returns HTML for the section.
   */
  private approach(): string {
    const { keyChanges, decisions } = this.store.plan.approach;
    const changes = keyChanges.map((k, i) =>
      this.item(k, `<div class="change"><div class="num">${i + 1}</div><div class="col g6"><h3>${h(k.title)}</h3><p>${h(k.text)}</p></div></div>`, 'line'),
    );
    const right = decisions.length
      ? `<div class="col g12 grow-440"><div class="between">${this.kicker('decisions', 'your decisions', 'amber')}<span class="mono mut">${this.decidedCount()} of ${decisions.length} decided</span></div>${decisions.map((d) => this.decision(d)).join('')}</div>`
      : '';
    return `<section aria-label="Approach" class="split"><div class="col grow-360">${this.kicker('approach', '02 key changes')}${changes.join('')}</div>${right}</section>`;
  }

  /**
   * Draws the Visual overview section: one diagram at a time, with tabs.
   *
   * @returns HTML for the section.
   */
  private visual(): string {
    const { visuals } = this.store.plan;
    const current = visuals[this.ui.diagram] ?? visuals[0];
    const tabs = visuals.length > 1
      ? `<div class="tabs">${visuals.map((v, i) => `<button class="tab" data-act="diagram" data-id="${i}" aria-pressed="${v === current}">${h(v.label)}</button>`).join('')}</div>`
      : '';
    const caption = this.item(current, `<div class="col g10">${this.kicker('visual', '03 visual overview', 'acc', 'div')}<p class="caption">${h(current.caption)}</p></div>`);
    return `<section aria-label="Visual overview" class="col g16"><div class="between wrap"><div class="grow">${caption}</div>${tabs}</div><div class="panel canvas">${renderDiagram(current)}</div>
<p class="legend mono mut"><span class="key new"></span>new or changed<span class="key existing"></span>existing<span class="key alt"></span>error or alternative path</p></section>`;
  }

  /**
   * Draws the Touchpoints section: files grouped by create, modify and
   * delete, then config, migrations and dependencies.
   *
   * @returns HTML for the section.
   */
  private touchpoints(): string {
    const t = this.store.plan.touchpoints;
    const groups = (['create', 'modify', 'delete'] as const)
      .map((action) => ({ action, files: t.files.filter((f) => f.action === action) }))
      .filter((g) => g.files.length)
      .map((g) => {
        const cards = g.files.map((f) => {
          const cut = f.path.lastIndexOf('/') + 1;
          return this.item(f, `<span class="mono path"><span class="mut">${h(f.path.slice(0, cut))}</span>${h(f.path.slice(cut))}</span><span class="sub">${h(f.note)}</span>`, 'card');
        });
        return `<div class="col g8"><div class="group-hd ${g.action}"><h2>${icon(g.action)}<span>${g.action}</span></h2><span class="mono mut">${g.files.length} file${g.files.length === 1 ? '' : 's'}</span></div>${cards.join('')}</div>`;
      });
    const extras = (['config', 'migrations', 'dependencies'] as const).map((key) => {
      const items = t[key].map((c) => this.item(c, `<span class="mono code">${h(c.code)}</span><span class="sub mut">${h(c.note)}</span>`));
      return `<div class="cell">${this.kicker(key, key, 'mut')}${items.join('') || '<span class="sub mut">None</span>'}</div>`;
    });
    return `<section aria-label="Touchpoints" class="col g24"><div class="grid-300">${groups.join('')}</div><div class="strip">${extras.join('')}</div></section>`;
  }

  /**
   * Draws the Steps section: overall progress plus the ordered, checkable
   * steps, with the first unfinished one marked "next up".
   *
   * @returns HTML for the section.
   */
  private steps(): string {
    const { steps } = this.store.plan;
    const next = steps.find((s) => !this.store.state.checks[s.id]);
    const bar = steps.map((s) => `<span class="${this.store.state.checks[s.id] ? 'done' : s === next ? 'next' : ''}"></span>`).join('');
    const rows = steps.map((s, i) => {
      const body = `<span class="step-title">${h(s.title)}</span><span class="mono verify"><span>verify:</span> ${h(s.verify)}</span>`;
      const label = s === next ? '<span class="mono acc">next up</span>' : `<span class="mono mut">${String(i + 1).padStart(2, '0')}</span>`;
      return this.item(s, this.check(s.id, body), `step${s === next ? ' next' : ''}`, label);
    });
    return `<section aria-label="Steps" class="split">
<div class="col g16 grow-240 pt8">${this.kicker('steps', '05 steps', 'acc', 'div')}<div class="big">${this.doneCount(steps)}<span>/${steps.length}</span></div><div class="bar-seg" aria-hidden="true">${bar}</div><p class="sub mut">Work top to bottom. Tick a step only after its check passes.</p></div>
<div class="col g6 grow-520">${rows.join('')}</div></section>`;
  }

  /**
   * Draws the Testing section: tests to write, edge cases and checkable
   * manual checks.
   *
   * @returns HTML for the section.
   */
  private testing(): string {
    const t = this.store.plan.testing;
    const tests = t.tests.map((x) => this.item(x, `<div class="test"><span class="mono kind ${x.kind}">${x.kind}</span><span class="col g2"><span class="test-title">${h(x.title)}</span><span class="sub mut">${h(x.covers)}</span></span></div>`, 'topline'));
    const edges = t.edgeCases.map((e, i) => this.item(e, `<div class="edge"><span class="mono amber">${String(i + 1).padStart(2, '0')}</span><span>${h(e.text)}</span></div>`, 'topline'));
    const manual = t.manualChecks.map((m) => this.item(m, this.check(m.id, h(m.text))));
    const panel = (name: IconName, title: string, body: string[], cls = '') =>
      `<div class="panel ${cls}"><div class="panel-hd"><h2>${icon(name)}<span>${title}</span></h2></div>${body.join('') || '<p class="sub mut pad">None</p>'}</div>`;
    return `<section aria-label="Testing" class="grid-300">${panel('tests', 'Tests to write', tests, 'padded')}${panel('edges', 'Edge cases', edges, 'padded')}${panel('manual', 'Manual checks', manual, 'rows')}</section>`;
  }

  /**
   * Draws the Risks and unknowns section: risks with fallbacks, then
   * assumptions and open questions.
   *
   * @returns HTML for the section.
   */
  private risks(): string {
    const r = this.store.plan.risks;
    const risks = r.risks.map((x) => this.item(x, `<div class="risk"><div class="mono level ${x.level}"><span aria-hidden="true"></span>${x.level}</div><h2>${h(x.title)}</h2><p><span class="mono mut">fallback</span>&nbsp; ${h(x.fallback)}</p></div>`, 'risk-row'));
    const list = (name: IconName, cls: string, items: typeof r.assumptions, itemCls: string) =>
      `<div class="col g4">${this.kicker(name, name === 'questions' ? 'open questions' : name, cls)}${items.map((a) => this.item(a, `<span class="${itemCls}">${h(a.text)}</span>`, 'topline')).join('') || '<p class="sub mut">None</p>'}</div>`;
    return `<section aria-label="Risks and unknowns" class="col g24">${risks.length ? `<div class="panel flush">${risks.join('')}</div>` : ''}<div class="grid-320">${list('assumptions', 'mut', r.assumptions, 'assume')}${list('questions', 'amber', r.openQuestions, 'question')}</div></section>`;
  }

  /**
   * Draws the notes inbox: every open note in one place, each linking back
   * to the item it is attached to.
   *
   * @returns HTML for the inbox.
   */
  private inbox(): string {
    const { notes } = this.store.state;
    const row = (n: Note) => {
      const anchor = this.anchors.get(n.anchor);
      const link = anchor
        ? `<button class="link" data-act="goto" data-id="${n.anchor}">${h(anchor.label)}</button>`
        : '<span class="mono mut">item no longer in the plan</span>';
      return `<div class="it topline">${link}${this.note(n)}</div>`;
    };
    const open = notes.filter((n) => n.status === 'open');
    const resolved = notes.filter((n) => n.status === 'resolved');
    const tucked = resolved.length ? `<details><summary class="mono mut">${resolved.length} resolved</summary>${resolved.map(row).join('')}</details>` : '';
    const empty = '<p class="sub mut">No open notes. Use the note button on any item to leave one for the agent or for yourself.</p>';
    return `<section aria-label="Notes" class="col g12">${this.kicker('note', 'open notes')}${open.map(row).join('') || empty}${tucked}</section>`;
  }

  /**
   * Builds the whole page for the current plan, state and selection.
   *
   * @returns HTML for the dashboard.
   */
  html(): string {
    const sections: Record<string, () => string> = {
      goal: () => this.goal(),
      approach: () => this.approach(),
      visual: () => this.visual(),
      touchpoints: () => this.touchpoints(),
      steps: () => this.steps(),
      testing: () => this.testing(),
      risks: () => this.risks(),
      notes: () => this.inbox(),
    };
    return `${this.header()}${this.nav()}<main>${(sections[this.ui.section] ?? sections.goal)()}</main>`;
  }
}
