import type { Note, Plan, PlanState } from '../schema.ts';

/**
 * Reads one of the JSON data slots the stamp command fills in.
 *
 * @param slotId - The id of the script tag holding the data.
 * @returns The parsed data, or null when the slot is empty or unreadable.
 */
export function readSlot<T>(slotId: string): T | null {
  try {
    return JSON.parse(document.getElementById(slotId)?.textContent || 'null') as T | null;
  } catch {
    return null;
  }
}

/**
 * Holds everything the developer does in the dashboard (ticks, decision
 * picks, notes) and keeps it safe.
 *
 * Every change is copied to the browser's localStorage so a reload loses
 * nothing. The agent cannot read localStorage, so "Save" also writes
 * plan.state.json: straight to disk where the browser allows it (Chrome,
 * Edge), otherwise as a download to drop into the plan folder.
 *
 * Pattern: Observer. The view registers one `onChange` listener and redraws
 * whenever the state changes.
 */
export class Store {
  readonly plan: Plan;
  state: PlanState;
  /** True when there are changes the state file on disk does not have yet. */
  dirty = false;
  /** Called after every change so the view can redraw. */
  onChange: () => void = () => {};

  private readonly storageKey: string;
  private fileHandle: FileSystemFileHandle | null = null;

  /**
   * @param plan - The plan being shown.
   * @param fileState - The state stamped into the page from plan.state.json, if any.
   */
  constructor(plan: Plan, fileState: PlanState | null) {
    this.plan = plan;
    this.storageKey = `feature-plan:${plan.repo.path}:${plan.id}`;
    const local = this.readLocal();
    // Keep whichever copy is newest: the file wins after the agent replies
    // to notes, the browser copy wins when there are unsaved clicks.
    const localIsNewer = !!local && (!fileState || local.updatedAt > fileState.updatedAt);
    this.state = (localIsNewer ? local : fileState) ?? {
      schemaVersion: 1,
      planId: plan.id,
      updatedAt: '',
      decisions: {},
      checks: {},
      notes: [],
    };
    this.dirty = localIsNewer;
  }

  /**
   * Reads the browser's copy of the state.
   *
   * @returns The saved state, or null when there is none or storage is blocked.
   */
  private readLocal(): PlanState | null {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || 'null') as PlanState | null;
    } catch {
      return null;
    }
  }

  /**
   * Records that something changed: stamps the time, keeps a browser copy,
   * writes the file if one is connected, and tells the view to redraw.
   */
  private commit(): void {
    this.state.updatedAt = new Date().toISOString();
    this.dirty = true;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch {
      // Storage can be blocked (private windows). The Save button still works.
    }
    if (this.fileHandle) void this.writeFile();
    this.onChange();
  }

  /**
   * Writes the state to the connected plan.state.json.
   */
  private async writeFile(): Promise<void> {
    if (!this.fileHandle) return;
    const writable = await this.fileHandle.createWritable();
    await writable.write(JSON.stringify(this.state, null, 2));
    await writable.close();
    this.dirty = false;
    this.onChange();
  }

  /** True once Save has connected a file, so later changes save themselves. */
  get autosaving(): boolean {
    return this.fileHandle !== null;
  }

  /**
   * Ticks or unticks a checkable item (criterion, step or manual check).
   *
   * @param itemId - The item's id.
   */
  toggleCheck(itemId: string): void {
    this.state.checks[itemId] = !this.state.checks[itemId];
    this.commit();
  }

  /**
   * Picks a decision option, or clears the pick when it is clicked again.
   *
   * @param decisionId - The decision's id.
   * @param optionId - The option being clicked.
   */
  pick(decisionId: string, optionId: string): void {
    const current = this.state.decisions[decisionId];
    this.state.decisions[decisionId] = current === optionId ? null : optionId;
    this.commit();
  }

  /**
   * Adds a note to a plan item.
   *
   * @param anchor - Id of the item the note belongs to.
   * @param kind - Whether the agent should act on it or it is a private reminder.
   * @param text - What the developer wrote.
   */
  addNote(anchor: string, kind: Note['kind'], text: string): void {
    if (!text.trim()) return;
    this.state.notes.push({
      id: `n-${Date.now().toString(36)}`,
      anchor,
      kind,
      text: text.trim(),
      status: 'open',
      createdAt: new Date().toISOString(),
    });
    this.commit();
  }

  /**
   * Flips a note between open and resolved.
   *
   * @param noteId - The note's id.
   */
  toggleResolved(noteId: string): void {
    const found = this.state.notes.find((n) => n.id === noteId);
    if (!found) return;
    found.status = found.status === 'open' ? 'resolved' : 'open';
    this.commit();
  }

  /**
   * Saves the state where the agent can read it.
   *
   * @returns A short message telling the developer what happened.
   */
  async save(): Promise<string> {
    const picker = (window as unknown as { showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker;
    if (picker) {
      try {
        // shortcut: the file connection lasts until reload (one extra click per session);
        // keep the handle in IndexedDB if that becomes annoying.
        this.fileHandle ??= await picker({
          suggestedName: 'plan.state.json',
          types: [{ description: 'Plan state', accept: { 'application/json': ['.json'] } }],
        });
        await this.writeFile();
        return 'Saved. Further changes save automatically until you reload.';
      } catch (error) {
        if ((error as Error).name === 'AbortError') return 'Save cancelled.';
        this.fileHandle = null; // fall through to a download
      }
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' }));
    link.download = 'plan.state.json';
    link.click();
    URL.revokeObjectURL(link.href);
    this.dirty = false;
    this.onChange();
    return 'Downloaded plan.state.json. Move it into the plan folder, next to plan.html.';
  }
}
