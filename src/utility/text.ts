/**
 * Counts the words in a piece of text.
 * Used to enforce the plan's word budgets, which keep plans short.
 *
 * @param text - Any plain text.
 * @returns How many whitespace-separated words it holds.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Counts the sentences in a piece of text.
 * A sentence ends at ".", "!" or "?" followed by a space or the end of the
 * text, so dots inside file names or versions ("session.ts", "v1.2") do not count.
 *
 * @param text - Any plain text.
 * @returns How many sentences it holds. Text with no end mark counts as one.
 */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const ends = trimmed.match(/[.!?]+(?=\s|$)/g)?.length ?? 0;
  return /[.!?]$/.test(trimmed) ? ends : ends + 1;
}

/**
 * Makes text safe to place inside HTML.
 * The viewer builds its page from strings, so every piece of plan text goes
 * through this first to stop it being read as markup.
 *
 * @param text - Untrusted text from a plan or a note.
 * @returns The same text with HTML special characters escaped.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
