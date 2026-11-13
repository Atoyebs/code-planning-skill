import type { Diagram } from '../schema.ts';
import { escapeHtml as h } from '../utility/text.ts';

type GraphSource = Extract<Diagram['source'], { type: 'graph' }>;
type SequenceSource = Extract<Diagram['source'], { type: 'sequence' }>;

/** Box size and spacing, in pixels. */
const BOX_W = 152;
const BOX_H = 72;
const GAP_Y = 48;
const PAD = 16;

/** One shared arrowhead, coloured through CSS so it follows the theme. */
const ARROW_DEF =
  '<defs><marker id="arrow" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="dg-head" d="M0 0L8 4L0 8z"/></marker></defs>';

/**
 * Draws one box: a bold label with an optional small second line.
 *
 * @param node - The label, optional sub-label and tone of the box.
 * @param x - Left edge in pixels.
 * @param y - Top edge in pixels.
 * @param height - Box height in pixels.
 * @returns HTML for the box.
 */
function box(node: { label: string; sub?: string; tone?: string }, x: number, y: number, height = BOX_H): string {
  const sub = node.sub ? `<span class="dg-sub">${h(node.sub)}</span>` : '';
  return `<div class="dg-node ${node.tone ?? 'existing'}" style="left:${x}px;top:${y}px;width:${BOX_W}px;height:${height}px"><b>${h(node.label)}</b>${sub}</div>`;
}

/**
 * Draws a boxes-and-arrows diagram on a grid.
 * The agent chooses each box's column and row, so no layout engine is needed
 * and the result matches the dashboard's look.
 *
 * @param source - Nodes with grid positions, and the edges between them.
 * @returns HTML for the diagram.
 */
function renderGraph(source: GraphSource): string {
  // Leave wider gaps when arrows carry labels, so the text fits above them.
  const gapX = source.edges.some((e) => e.label) ? 120 : 64;
  /** Left edge of a column. */
  const left = (col: number) => PAD + col * (BOX_W + gapX);
  /** Top edge of a row. */
  const top = (row: number) => PAD + row * (BOX_H + GAP_Y);
  const byId = new Map(source.nodes.map((n) => [n.id, n]));
  const cols = Math.max(...source.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...source.nodes.map((n) => n.row)) + 1;
  const width = left(cols) - gapX + PAD;
  const height = top(rows) - GAP_Y + PAD;

  const edges = source.edges.map((edge) => {
    const a = byId.get(edge.from)!;
    const b = byId.get(edge.to)!;
    const midY = (n: { row: number }) => top(n.row) + BOX_H / 2;
    let path: string;
    let label: { x: number; y: number; anchor: string };
    if (a.col === b.col) {
      // Straight up or down.
      const down = b.row > a.row;
      const x = left(a.col) + BOX_W / 2;
      const y1 = down ? top(a.row) + BOX_H : top(a.row);
      const y2 = down ? top(b.row) : top(b.row) + BOX_H;
      path = `M${x} ${y1}V${y2}`;
      label = { x: x + 8, y: (y1 + y2) / 2 + 4, anchor: 'start' };
    } else {
      // Sideways; bends once near the source when the rows differ.
      const right = b.col > a.col;
      const x1 = right ? left(a.col) + BOX_W : left(a.col);
      const x2 = right ? left(b.col) : left(b.col) + BOX_W;
      const bend = x1 + (right ? 20 : -20);
      path = a.row === b.row ? `M${x1} ${midY(a)}H${x2}` : `M${x1} ${midY(a)}H${bend}V${midY(b)}H${x2}`;
      const from = a.row === b.row ? x1 : bend;
      label = { x: (from + x2) / 2, y: midY(b) - 8, anchor: 'middle' };
    }
    const text = edge.label
      ? `<text class="dg-label" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}">${h(edge.label)}</text>`
      : '';
    return `<path class="dg-edge${edge.dashed ? ' dashed' : ''}" d="${path}" marker-end="url(#arrow)"/>${text}`;
  });

  const nodes = source.nodes.map((n) => box(n, left(n.col), top(n.row)));
  return `<div class="dg" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}" aria-hidden="true">${ARROW_DEF}${edges.join('')}</svg>${nodes.join('')}</div>`;
}

/**
 * Draws a sequence diagram: actors across the top, messages as arrows going
 * down the page in the order they happen.
 *
 * @param source - The actors and the messages between them.
 * @returns HTML for the diagram.
 */
function renderSequence(source: SequenceSource): string {
  const gapX = 72;
  const headH = 52;
  const rowH = 46;
  /** Centre line of an actor's column. */
  const centre = (actorId: string) => PAD + source.actors.findIndex((a) => a.id === actorId) * (BOX_W + gapX) + BOX_W / 2;
  const width = PAD * 2 + source.actors.length * (BOX_W + gapX) - gapX;
  const firstY = PAD + headH + 44;
  const height = firstY + (source.messages.length - 1) * rowH + 28;

  const lifelines = source.actors.map((a) => `<path class="dg-life" d="M${centre(a.id)} ${PAD + headH}V${height - 8}"/>`);
  const messages = source.messages.map((m, i) => {
    const y = firstY + i * rowH;
    const x1 = centre(m.from);
    const x2 = centre(m.to);
    const dashed = m.dashed ? ' dashed' : '';
    if (m.from === m.to) {
      // A call to itself: a small loop out to the right and back.
      return `<path class="dg-edge${dashed}" d="M${x1} ${y - 10}h28v16h-26" marker-end="url(#arrow)"/><text class="dg-label" x="${x1 + 36}" y="${y + 2}">${h(m.label)}</text>`;
    }
    return `<path class="dg-edge${dashed}" d="M${x1} ${y}H${x2}" marker-end="url(#arrow)"/><text class="dg-label" x="${(x1 + x2) / 2}" y="${y - 8}" text-anchor="middle">${h(m.label)}</text>`;
  });
  const heads = source.actors.map((a) => box(a, centre(a.id) - BOX_W / 2, PAD, headH));
  return `<div class="dg" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}" aria-hidden="true">${ARROW_DEF}${lifelines.join('')}${messages.join('')}</svg>${heads.join('')}</div>`;
}

/**
 * Describes a diagram in words, for screen readers and the markdown export,
 * since the drawing itself is only visual.
 *
 * @param diagram - The diagram to describe.
 * @returns One line per arrow, such as "Login form -> Issue route".
 */
export function describeDiagram(diagram: Diagram): string[] {
  const src = diagram.source;
  const names = new Map((src.type === 'graph' ? src.nodes : src.actors).map((n) => [n.id, n.label]));
  return (src.type === 'graph' ? src.edges : src.messages).map(
    (e) => `${names.get(e.from)} -> ${names.get(e.to)}${e.label ? ` (${e.label})` : ''}`,
  );
}

/**
 * Draws a plan diagram in the dashboard's style.
 *
 * @param diagram - The diagram from the plan.
 * @returns HTML for the diagram, with a text description for screen readers.
 */
export function renderDiagram(diagram: Diagram): string {
  const drawing = diagram.source.type === 'graph' ? renderGraph(diagram.source) : renderSequence(diagram.source);
  return `<div role="img" aria-label="${h(`${diagram.label}: ${describeDiagram(diagram).join('; ')}`)}">${drawing}</div>`;
}
