import './style.css';
import type { Note, Plan, PlanState } from '../schema.ts';
import { toMarkdown } from './markdown.ts';
import { readSlot, Store } from './store.ts';
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

/**
 * Starts the dashboard for a plan: draws it, then redraws after every click
 * that changes something.
 *
 * @param plan - The plan to show.
 * @param fileState - The developer's saved state stamped into the page, if any.
 */
function start(plan: Plan, fileState: PlanState | null): void {
  const store = new Store(plan, fileState);
  const ui: Ui = { section: sectionFromHash(), diagram: 0, openNote: null, toast: '' };
  const view = new PlanView(store, ui);
  let toastTimer = 0;
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

  /** Shows a short status message for a few seconds. */
  const toast = (message: string) => {
    ui.toast = message;
    render();
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      ui.toast = '';
      render();
    }, 6000);
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
        return void copyText(toMarkdown(plan, store.state)).then(() => toast('Plan copied as markdown.'));
      case 'save':
        return void store.save().then(toast);
    }
  });

  render();
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
