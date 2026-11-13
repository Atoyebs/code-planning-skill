import './style.css';
import type { Note, Plan, PlanState } from '../schema.ts';
import { toMarkdown } from './markdown.ts';
import { readSlot, Store } from './store.ts';
import { escapeHtml } from '../utility/text.ts';
import { PlanView, SECTIONS, type Ui } from './view.ts';

const THEME_KEY = 'feature-plan:theme';
const app = document.getElementById('app')!;

/**
 * Reads which section the URL hash points at, so a section can be linked
 * and survives a reload.
 *
 * @returns A valid section id, falling back to "goal".
 */
function sectionFromHash(): string {
  const id = location.hash.slice(1);
  return id === 'notes' || SECTIONS.some((s) => s.id === id) ? id : 'goal';
}

/**
 * Copies text to the clipboard, with a fallback for browsers that block the
 * clipboard API on pages opened from disk.
 *
 * @param text - The text to copy.
 */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

let toastTimer = 0;
// The toast lives outside #app so redraws never wipe it and screen readers
// hear each message (a polite live region, like Radix's Toast).
const toastEl = Object.assign(document.createElement('div'), { className: 'toast' });
toastEl.setAttribute('role', 'status');
toastEl.setAttribute('aria-live', 'polite');
toastEl.addEventListener('click', (event) => {
  if ((event.target as Element).closest('button')) toastEl.classList.remove('show');
});
document.body.append(toastEl);

/**
 * Shows a small confirmation card in the corner for a few seconds.
 * It stays while the pointer is over it, and has a close button.
 *
 * @param title - What happened, in a word or two.
 * @param detail - One more line, such as where a file was saved.
 */
function toast(title: string, detail = ''): void {
  toastEl.innerHTML = `<div><b>${escapeHtml(title)}</b>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</div><button aria-label="Dismiss">Close</button>`;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  /** Hides the toast unless the pointer is resting on it. */
  const hide = () => {
    if (toastEl.matches(':hover')) toastTimer = window.setTimeout(hide, 1000);
    else toastEl.classList.remove('show');
  };
  toastTimer = window.setTimeout(hide, 5000);
}

/**
 * Starts the dashboard for a plan: draws it, then redraws after every click
 * that changes something.
 *
 * @param plan - The plan to show.
 * @param fileState - The developer's saved state stamped into the page, if any.
 */
function start(plan: Plan, fileState: PlanState | null): void {
  const store = new Store(plan, fileState);
  const ui: Ui = { section: sectionFromHash(), diagram: 0, openNote: null };
  const view = new PlanView(store, ui);
  document.title = `${plan.title} · feature plan`;

  /** Redraws the page, keeping keyboard focus on the control that was just used. */
  const render = () => {
    const focused = (document.activeElement as HTMLElement | null)?.dataset;
    const selector = focused?.act
      ? `[data-act="${focused.act}"][data-id="${focused.id ?? ''}"]${focused.opt ? `[data-opt="${focused.opt}"]` : ''}`
      : null;
    app.innerHTML = view.html();
    if (selector) app.querySelector<HTMLElement>(selector)?.focus();
  };

  /** Switches to a section and records it in the URL hash. */
  const go = (section: string) => {
    ui.section = section;
    history.replaceState(null, '', `#${section}`);
  };

  store.onChange = render;
  window.addEventListener('hashchange', () => {
    ui.section = sectionFromHash();
    render();
  });

  // One listener for the whole page (event delegation): every control says
  // what it does through data-act, so redrawing never loses a handler.
  app.addEventListener('click', (event) => {
    const el = (event.target as Element).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const { act, id = '', opt = '', kind = '' } = el.dataset;
    switch (act) {
      case 'nav':
        go(id);
        ui.openNote = null;
        return render();
      case 'check':
        return store.toggleCheck(id);
      case 'pick':
        return store.pick(id, opt);
      case 'diagram':
        ui.diagram = Number(id);
        return render();
      case 'note':
        ui.openNote = ui.openNote === id ? null : id;
        return render();
      case 'add-note':
        return store.addNote(id, kind as Note['kind'], (document.getElementById('note-text') as HTMLTextAreaElement).value);
      case 'resolve':
        return store.toggleResolved(id);
      case 'goto':
        go(view.anchors.get(id)?.section ?? 'goal');
        ui.openNote = id;
        return render();
      case 'theme': {
        const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Theme just won't be remembered.
        }
        return render();
      }
      case 'copy':
        return void copyText(toMarkdown(plan, store.state)).then(() => toast('Copied', 'The plan is on your clipboard as markdown.'));
      case 'save':
        return void store.save().then(({ title, detail }) => toast(title, detail));
    }
  });

  render();
  // Served by the plan server: hold a connection open so it knows this tab is
  // still in use, and can stop itself once every tab has closed.
  if (location.protocol !== 'file:') new EventSource('alive');
}

try {
  document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
} catch {
  // Storage blocked: stay on the default dark theme.
}

let plan = readSlot<Plan>('plan-data');
let state = readSlot<PlanState>('plan-state');
if (!plan && import.meta.env.DEV) {
  // `npm run dev` has no stamped data, so preview the bundled example.
  plan = (await import('../../plugin/skills/feature-plan/examples/magic-link-signin.plan.json')).default as Plan;
  state = (await import('../../plugin/skills/feature-plan/examples/magic-link-signin.state.json')).default as PlanState;
}
if (plan) start(plan, state);
else app.innerHTML = '<p style="padding:32px">No plan data. This is the empty viewer template; run the stamp command to make a plan page.</p>';
