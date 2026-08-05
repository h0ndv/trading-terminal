export type DrawingToolId =
  | "segment"
  | "straightLine"
  | "rayLine"
  | "priceLine"
  | "horizontalStraightLine"
  | "horizontalRayLine"
  | "horizontalSegment"
  | "verticalStraightLine"
  | "verticalRayLine"
  | "verticalSegment"
  | "priceChannelLine"
  | "parallelStraightLine"
  | "fibonacciLine"
  | "brush"
  | "simpleAnnotation"
  | "simpleTag";

export type DrawingToolGroupId =
  | "singleLine"
  | "horizontal"
  | "vertical"
  | "multi"
  | "annotate";

export type DrawingToolDef = { id: DrawingToolId; label: string };

export type DrawingToolGroup = {
  id: DrawingToolGroupId;
  label: string;
  short: string;
  tools: DrawingToolDef[];
};

export type OverlayMagnetMode = "normal" | "weak_magnet" | "strong_magnet";

export type DrawingLineStyleKind = "solid" | "dashed";

export type DrawingStyle = {
  color: string;
  size: number;
  lineStyle: DrawingLineStyleKind;
};

export type DrawingPoint = {
  timestamp: number;
  value: number;
  dataIndex?: number;
};

export type DrawingSnapshot = {
  id: string;
  name: string;
  groupId?: string;
  points: DrawingPoint[];
  lock?: boolean;
  visible?: boolean;
  mode?: OverlayMagnetMode;
  extendData?: unknown;
  styles?: DrawingStyle;
};

export const USER_DRAWING_GROUP = "user";

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: "#58a6ff",
  size: 1,
  lineStyle: "solid",
};

export const DRAWING_COLOR_PRESETS = [
  "#58a6ff",
  "#3fb950",
  "#f85149",
  "#d29922",
  "#a371f7",
  "#e8eaed",
] as const;

export const DRAWING_TOOL_GROUPS: DrawingToolGroup[] = [
  {
    id: "singleLine",
    label: "Lines",
    short: "Ln",
    tools: [
      { id: "segment", label: "Segment" },
      { id: "straightLine", label: "Straight" },
      { id: "rayLine", label: "Ray" },
      { id: "priceLine", label: "Price" },
    ],
  },
  {
    id: "horizontal",
    label: "Horizontal",
    short: "Hz",
    tools: [
      { id: "horizontalStraightLine", label: "H Straight" },
      { id: "horizontalRayLine", label: "H Ray" },
      { id: "horizontalSegment", label: "H Segment" },
    ],
  },
  {
    id: "vertical",
    label: "Vertical",
    short: "Vt",
    tools: [
      { id: "verticalStraightLine", label: "V Straight" },
      { id: "verticalRayLine", label: "V Ray" },
      { id: "verticalSegment", label: "V Segment" },
    ],
  },
  {
    id: "multi",
    label: "Channels / Fib",
    short: "Fb",
    tools: [
      { id: "priceChannelLine", label: "Channel" },
      { id: "parallelStraightLine", label: "Parallel" },
      { id: "fibonacciLine", label: "Fibonacci" },
    ],
  },
  {
    id: "annotate",
    label: "Annotate",
    short: "An",
    tools: [
      { id: "brush", label: "Brush" },
      { id: "simpleAnnotation", label: "Annotation" },
      { id: "simpleTag", label: "Tag" },
    ],
  },
];

const TOOL_IDS = new Set<string>(
  DRAWING_TOOL_GROUPS.flatMap((g) => g.tools.map((t) => t.id)),
);
const NEEDS_TEXT = new Set<DrawingToolId>([
  "simpleAnnotation",
  "simpleTag",
]);

export function toolNeedsText(id: DrawingToolId): boolean {
  return NEEDS_TEXT.has(id);
}

export function findToolGroup(
  toolId: DrawingToolId,
): DrawingToolGroup | undefined {
  return DRAWING_TOOL_GROUPS.find((g) =>
    g.tools.some((t) => t.id === toolId),
  );
}

export function toOverlayStyles(style: DrawingStyle): {
  line: {
    color: string;
    size: number;
    style: DrawingLineStyleKind;
    dashedValue: number[];
    smooth: boolean;
  };
  text: { color: string };
} {
  return {
    line: {
      color: style.color,
      size: style.size,
      style: style.lineStyle,
      dashedValue: [6, 4],
      smooth: false,
    },
    text: { color: style.color },
  };
}

export function normalizeDrawingStyle(raw: unknown): DrawingStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const color = typeof r.color === "string" ? r.color : undefined;
  const size = Number(r.size);
  const lineStyle =
    r.lineStyle === "solid" || r.lineStyle === "dashed"
      ? r.lineStyle
      : undefined;
  if (!color || !Number.isFinite(size) || size < 1 || !lineStyle) {
    return undefined;
  }
  return {
    color,
    size: Math.min(8, Math.max(1, Math.floor(size))),
    lineStyle,
  };
}

export function styleFromOverlayStyles(raw: unknown): DrawingStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const line = (raw as Record<string, unknown>).line;
  if (!line || typeof line !== "object") return undefined;
  const l = line as Record<string, unknown>;
  return normalizeDrawingStyle({
    color: l.color,
    size: l.size,
    lineStyle: l.style,
  });
}

function normalizePoint(raw: unknown): DrawingPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const timestamp = Number(p.timestamp);
  const value = Number(p.value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(value)) return null;
  const point: DrawingPoint = { timestamp, value };
  const dataIndex = Number(p.dataIndex);
  if (Number.isFinite(dataIndex)) point.dataIndex = dataIndex;
  return point;
}

export function normalizeDrawing(raw: unknown): DrawingSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.name !== "string" || !r.name) return null;
  if (!Array.isArray(r.points)) return null;
  const points = r.points
    .map(normalizePoint)
    .filter((p): p is DrawingPoint => p != null);
  if (points.length === 0) return null;

  const snap: DrawingSnapshot = {
    id: r.id,
    name: r.name,
    points,
    groupId:
      typeof r.groupId === "string" ? r.groupId : USER_DRAWING_GROUP,
  };
  if (typeof r.lock === "boolean") snap.lock = r.lock;
  if (typeof r.visible === "boolean") snap.visible = r.visible;
  if (
    r.mode === "normal" ||
    r.mode === "weak_magnet" ||
    r.mode === "strong_magnet"
  ) {
    snap.mode = r.mode;
  }
  if (r.extendData !== undefined) snap.extendData = r.extendData;
  const styles = normalizeDrawingStyle(r.styles);
  if (styles) snap.styles = styles;
  return snap;
}

export function normalizeDrawings(raw: unknown): DrawingSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: DrawingSnapshot[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const snap = normalizeDrawing(item);
    if (!snap || seen.has(snap.id)) continue;
    seen.add(snap.id);
    out.push(snap);
  }
  return out;
}

export function normalizeDrawingsBySymbol(
  raw: unknown,
): Record<string, DrawingSnapshot[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, DrawingSnapshot[]> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const symbol = key.trim().toUpperCase();
    if (!symbol) continue;
    const list = normalizeDrawings(val);
    if (list.length > 0) out[symbol] = list;
  }
  return out;
}

export function snapshotFromOverlay(overlay: {
  id: string;
  name: string;
  groupId?: string;
  lock?: boolean;
  visible?: boolean;
  mode?: OverlayMagnetMode;
  extendData?: unknown;
  styles?: unknown;
  points?: Array<Partial<DrawingPoint> & Record<string, unknown>>;
}): DrawingSnapshot | null {
  const points = (overlay.points ?? [])
    .map((p) => normalizePoint(p))
    .filter((p): p is DrawingPoint => p != null);
  if (!overlay.id || !overlay.name || points.length === 0) return null;
  const styles = styleFromOverlayStyles(overlay.styles);
  return {
    id: overlay.id,
    name: overlay.name,
    groupId: overlay.groupId ?? USER_DRAWING_GROUP,
    points,
    lock: overlay.lock,
    visible: overlay.visible,
    mode: overlay.mode,
    extendData: overlay.extendData,
    ...(styles ? { styles } : {}),
  };
}

export function isDrawingToolId(id: string): id is DrawingToolId {
  return TOOL_IDS.has(id);
}

export function patchDrawing(
  list: DrawingSnapshot[],
  id: string,
  patch: Partial<Omit<DrawingSnapshot, "id" | "name" | "points">>,
): DrawingSnapshot[] {
  return list.map((d) => (d.id === id ? { ...d, ...patch } : d));
}

export function setAllDrawingsVisible(
  list: DrawingSnapshot[],
  visible: boolean,
): DrawingSnapshot[] {
  return list.map((d) =>
    d.visible === visible ? d : { ...d, visible },
  );
}

export function drawingsAreHidden(list: DrawingSnapshot[]): boolean {
  return list.length > 0 && list.every((d) => d.visible === false);
}

export function cycleMagnetMode(
  mode: OverlayMagnetMode,
): OverlayMagnetMode {
  if (mode === "normal") return "weak_magnet";
  if (mode === "weak_magnet") return "strong_magnet";
  return "normal";
}

export function magnetModeLabel(mode: OverlayMagnetMode): string {
  if (mode === "weak_magnet") return "Weak magnet";
  if (mode === "strong_magnet") return "Strong magnet";
  return "Magnet off";
}

export function toolLabel(id: DrawingToolId): string {
  for (const g of DRAWING_TOOL_GROUPS) {
    const t = g.tools.find((x) => x.id === id);
    if (t) return t.label;
  }
  return id;
}

export function normalizeFavoriteTools(raw: unknown): DrawingToolId[] {
  if (!Array.isArray(raw)) return [];
  const out: DrawingToolId[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !isDrawingToolId(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item);
    if (out.length >= 12) break;
  }
  return out;
}

export function toggleFavoriteTool(
  list: DrawingToolId[],
  id: DrawingToolId,
): DrawingToolId[] {
  if (list.includes(id)) return list.filter((t) => t !== id);
  if (list.length >= 12) return list;
  return [...list, id];
}
