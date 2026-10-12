// Drawings of the map for the landing page. Drawn rather than captured, and
// unlabelled: text is a bar, so no node reads as a claim about someone's code.
// Every colour is a product token, so both themes come for free, and each hue
// means what it means on the canvas: green leads in, amber leads out, accent
// is the selection, tier colours are roles.

type Point = { x: number; y: number };

// The canvas draws left to right, so every edge leaves a right side and
// enters a left side.
function curve(from: Point, to: Point): string {
  const dx = (to.x - from.x) / 2;
  return `M${from.x} ${from.y} C${from.x + dx} ${from.y} ${to.x - dx} ${to.y} ${to.x} ${to.y}`;
}

const SVG_CLASS = "block h-auto w-full";

/** Stands in for a line of text. */
function Bar({ x, y, width, strong = false }: { x: number; y: number; width: number; strong?: boolean }) {
  return <rect x={x} y={y} width={width} height={5} rx={1} fill="var(--fg)" opacity={strong ? 0.6 : 0.3} />;
}

/** A folded folder: a box with a name and a file count. */
function Folder({ x, y, width, label, dim = false }: { x: number; y: number; width: number; label: number; dim?: boolean }) {
  return (
    <g opacity={dim ? 0.4 : 1}>
      <rect x={x + 0.5} y={y + 0.5} width={width} height={30} rx={2} fill="var(--surface-raised)" stroke="var(--line)" />
      <Bar x={x + 10} y={y + 13} width={label} strong />
      <rect x={x + width - 22} y={y + 13} width={12} height={5} rx={1} fill="var(--fg-muted)" opacity={0.5} />
    </g>
  );
}

const TIER_FILL = {
  surface: "var(--tier-surface)",
  layer: "var(--tier-layer)",
  plumbing: "var(--tier-plumbing)",
  support: "var(--fg-muted)",
  none: null,
} as const;

type Row = { tier: keyof typeof TIER_FILL; label: number };

const PANEL_ROWS: Row[] = [
  { tier: "surface", label: 58 },
  { tier: "surface", label: 44 },
  { tier: "layer", label: 66 },
  { tier: "layer", label: 50 },
  { tier: "layer", label: 38 },
  { tier: "plumbing", label: 54 },
  { tier: "plumbing", label: 46 },
  { tier: "support", label: 62 },
  { tier: "none", label: 40 },
];

const PANEL = { x: 216, y: 48, width: 152, header: 40, row: 22 };
const SELECTED_ROW = 3;

function rowY(index: number): number {
  return PANEL.y + PANEL.header + 8 + index * PANEL.row + PANEL.row / 2;
}

/** The hero: folded folders around one opened folder, one file selected. */
export function MapFigure() {
  const left = [60, 140, 220, 300].map((y) => ({ x: 24, y, width: 128 }));
  const right = [80, 170, 260].map((y) => ({ x: 416, y, width: 120 }));
  const inLeft = (i: number): Point => ({ x: left[i].x + left[i].width + 0.5, y: left[i].y + 15.5 });
  const inRight = (i: number): Point => ({ x: right[i].x + 0.5, y: right[i].y + 15.5 });
  const rowIn = (i: number): Point => ({ x: PANEL.x + 0.5, y: rowY(i) });
  const rowOut = (i: number): Point => ({ x: PANEL.x + PANEL.width + 0.5, y: rowY(i) });

  const height = PANEL.header + 16 + PANEL_ROWS.length * PANEL.row;

  return (
    <svg
      viewBox="0 0 560 360"
      className={SVG_CLASS}
      role="img"
      aria-label="A dependency map: folders drawn as boxes, one folder opened into its files, and the imports into and out of the selected file highlighted."
    >
      <rect x={0.5} y={0.5} width={559} height={359} rx={4} fill="var(--surface)" stroke="var(--line)" />

      {/* Unrelated imports stay grey and faint while something is selected. */}
      <g fill="none" stroke="var(--fg-muted)" strokeWidth={1} opacity={0.35}>
        <path d={curve(inLeft(2), rowIn(7))} />
        <path d={curve(inLeft(3), rowIn(8))} />
        <path d={curve(rowOut(1), inRight(1))} />
        <path d={curve(rowOut(5), inRight(1))} />
      </g>
      <g fill="none" stroke="var(--edge-in)" strokeWidth={1.5}>
        <path d={curve(inLeft(0), rowIn(SELECTED_ROW))} />
        <path d={curve(inLeft(1), rowIn(SELECTED_ROW))} strokeWidth={2.5} />
      </g>
      <g fill="none" stroke="var(--edge-out)" strokeWidth={1.5}>
        <path d={curve(rowOut(SELECTED_ROW), inRight(0))} />
        <path d={curve(rowOut(SELECTED_ROW), inRight(2))} />
      </g>

      <Folder {...left[0]} label={56} />
      <Folder {...left[1]} label={72} />
      <Folder {...left[2]} label={48} dim />
      <Folder {...left[3]} label={64} dim />
      <Folder {...right[0]} label={52} />
      <Folder {...right[1]} label={60} dim />
      <Folder {...right[2]} label={44} />

      <g>
        <rect
          x={PANEL.x + 0.5}
          y={PANEL.y + 0.5}
          width={PANEL.width}
          height={height}
          rx={2}
          fill="var(--surface-raised)"
          stroke="var(--accent)"
        />
        <Bar x={PANEL.x + 10} y={PANEL.y + 12} width={70} strong />
        <rect x={PANEL.x + 90} y={PANEL.y + 12} width={28} height={5} rx={1} fill="var(--fg-muted)" opacity={0.5} />
        <rect x={PANEL.x + 10} y={PANEL.y + 25} width={40} height={4} rx={1} fill="var(--fg-muted)" opacity={0.35} />
        <line
          x1={PANEL.x + 0.5}
          x2={PANEL.x + PANEL.width + 0.5}
          y1={PANEL.y + PANEL.header + 0.5}
          y2={PANEL.y + PANEL.header + 0.5}
          stroke="var(--line)"
        />
        {PANEL_ROWS.map((row, i) => {
          const cy = rowY(i);
          const selected = i === SELECTED_ROW;
          const fill = TIER_FILL[row.tier];
          return (
            <g key={i}>
              {selected && (
                <rect
                  x={PANEL.x + 1}
                  y={cy - PANEL.row / 2}
                  width={PANEL.width - 1}
                  height={PANEL.row}
                  fill="var(--accent)"
                  opacity={0.15}
                />
              )}
              {fill && <rect x={PANEL.x + 10} y={cy - 3} width={6} height={6} rx={1} fill={fill} />}
              <Bar x={PANEL.x + 22} y={cy - 2.5} width={row.label} strong={selected} />
              {/* Fan-in and fan-out, in the colours the canvas gives them. */}
              <rect x={PANEL.x + PANEL.width - 34} y={cy - 2} width={9} height={4} rx={1} fill="var(--edge-in)" opacity={0.7} />
              <rect x={PANEL.x + PANEL.width - 20} y={cy - 2} width={9} height={4} rx={1} fill="var(--edge-out)" opacity={0.7} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** A file node: a box with a role swatch and a name. */
function FileNode({ x, y, tier, label, selected = false, dim = false }: { x: number; y: number; tier: keyof typeof TIER_FILL; label: number; selected?: boolean; dim?: boolean }) {
  const fill = TIER_FILL[tier];
  return (
    <g opacity={dim ? 0.35 : 1}>
      <rect
        x={x + 0.5}
        y={y + 0.5}
        width={112}
        height={24}
        rx={2}
        fill="var(--surface-raised)"
        stroke={selected ? "var(--accent)" : "var(--line)"}
      />
      {selected && <rect x={x + 1} y={y + 1} width={111} height={23} rx={2} fill="var(--accent)" opacity={0.15} />}
      {fill && <rect x={x + 10} y={y + 9.5} width={6} height={6} rx={1} fill={fill} />}
      <Bar x={x + 22} y={y + 10} width={label} strong={selected} />
    </g>
  );
}

/**
 * Blast radius: the selected file on the right, the files importing it one
 * step out, the files importing those two steps out. Beyond that, nothing.
 */
export function ReachFigure() {
  const selected = { x: 344, y: 138 };
  const one = [
    { x: 184, y: 58, tier: "surface", label: 60 },
    { x: 184, y: 138, tier: "layer", label: 48 },
    { x: 184, y: 218, tier: "layer", label: 66 },
  ] as const;
  const two = [
    { x: 24, y: 24, tier: "surface", label: 52 },
    { x: 24, y: 92, tier: "surface", label: 70 },
    { x: 24, y: 184, tier: "layer", label: 44 },
    { x: 24, y: 252, tier: "none", label: 58 },
  ] as const;
  const outside = [
    { x: 344, y: 40, tier: "plumbing", label: 50 },
    { x: 344, y: 236, tier: "support", label: 62 },
  ] as const;
  const out = (n: { x: number; y: number }): Point => ({ x: n.x + 112.5, y: n.y + 12.5 });
  const into = (n: { x: number; y: number }): Point => ({ x: n.x + 0.5, y: n.y + 12.5 });

  return (
    <svg
      viewBox="0 0 480 300"
      className={SVG_CLASS}
      role="img"
      aria-label="A selected file, the files that import it, and the files that import those, two steps out."
    >
      <g fill="none" stroke="var(--fg-muted)" opacity={0.35}>
        <path d={curve(out(one[0]), into(outside[0]))} />
        <path d={curve(out(two[3]), into(outside[1]))} />
      </g>
      <g fill="none" stroke="var(--edge-in)" strokeWidth={1.5}>
        {one.map((n, i) => (
          <path key={i} d={curve(out(n), into(selected))} />
        ))}
      </g>
      <g fill="none" stroke="var(--edge-in)" strokeWidth={1.5} opacity={0.55}>
        <path d={curve(out(two[0]), into(one[0]))} />
        <path d={curve(out(two[1]), into(one[0]))} />
        <path d={curve(out(two[1]), into(one[1]))} />
        <path d={curve(out(two[2]), into(one[2]))} />
      </g>
      {two.map((n, i) => (
        <FileNode key={i} {...n} dim={i === 3} />
      ))}
      {one.map((n, i) => (
        <FileNode key={i} {...n} />
      ))}
      {outside.map((n, i) => (
        <FileNode key={i} {...n} dim />
      ))}
      <FileNode {...selected} tier="layer" label={54} selected />
    </svg>
  );
}

/**
 * Resolution: a source file whose imports each land on a real file, except
 * one that doesn't. That one gets no line; it is counted instead.
 */
export function ResolveFigure() {
  const card = { x: 24, y: 24, width: 176, height: 212 };
  // Code lines in the card; the import lines are the first four.
  const lines = [
    { width: 120, imports: 0 },
    { width: 104, imports: 1 },
    { width: 132, imports: 2 },
    { width: 96, imports: 3 },
    { width: 0, imports: null },
    { width: 84, imports: null },
    { width: 128, imports: null },
    { width: 110, imports: null },
    { width: 72, imports: null },
    { width: 118, imports: null },
  ];
  const lineY = (i: number) => card.y + 22 + i * 19;
  const targets = [
    { x: 344, y: 30, tier: "layer", label: 56 },
    { x: 344, y: 82, tier: "plumbing", label: 48 },
    { x: 344, y: 134, tier: "layer", label: 64 },
  ] as const;

  return (
    <svg
      viewBox="0 0 480 260"
      className={SVG_CLASS}
      role="img"
      aria-label="A source file whose first three imports each connect to a real file, and a fourth import that connects to nothing."
    >
      <rect
        x={card.x + 0.5}
        y={card.y + 0.5}
        width={card.width}
        height={card.height}
        rx={2}
        fill="var(--surface-raised)"
        stroke="var(--line)"
      />
      {lines.map((line, i) =>
        line.width === 0 ? null : (
          <rect
            key={i}
            x={card.x + 14}
            y={lineY(i) - 2.5}
            width={line.width}
            height={5}
            rx={1}
            fill="var(--fg)"
            opacity={line.imports === null ? 0.18 : 0.5}
          />
        ),
      )}
      <g fill="none" stroke="var(--fg-muted)" strokeWidth={1.5}>
        {targets.map((t, i) => (
          <path key={i} d={curve({ x: card.x + card.width + 0.5, y: lineY(i) }, { x: t.x + 0.5, y: t.y + 12.5 })} />
        ))}
      </g>
      {/* The unresolved import: a stub that stops, and nothing on the other end. */}
      <path
        d={`M${card.x + card.width + 0.5} ${lineY(3)} H${card.x + card.width + 40}`}
        stroke="var(--fg-muted)"
        strokeWidth={1.5}
        strokeDasharray="3 3"
        fill="none"
      />
      <circle cx={card.x + card.width + 46} cy={lineY(3)} r={4} fill="var(--surface)" stroke="var(--fg-muted)" strokeWidth={1.5} />
      {targets.map((t, i) => (
        <FileNode key={i} {...t} />
      ))}
    </svg>
  );
}
