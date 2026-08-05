import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockOpen,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  DEFAULT_DRAWING_STYLE,
  type DrawingSnapshot,
  type DrawingStyle,
} from "../lib/drawings";
import {
  INDICATOR_META,
  type BuiltinIndicatorId,
  type IndicatorConfig,
} from "../lib/indicators";

export type QuickTarget =
  | { kind: "drawing"; id: string }
  | { kind: "indicator"; id: BuiltinIndicatorId };

type Props = {
  target: QuickTarget | null;
  drawing: DrawingSnapshot | null;
  indicator: IndicatorConfig | null;
  colorPresets: string[];
  barPos: Pos | null;
  onBarPosChange: (pos: Pos) => void;
  onClose: () => void;
  onOpenFullSettings: () => void;
  onPatchDrawing: (id: string, patch: Partial<DrawingSnapshot>) => void;
  onDeleteDrawing: (id: string) => void;
  onPatchIndicator: (
    id: BuiltinIndicatorId,
    patch: Partial<IndicatorConfig>,
  ) => void;
  onRemoveIndicator: (id: BuiltinIndicatorId) => void;
};

function styleOf(d: DrawingSnapshot): DrawingStyle {
  return d.styles ?? { ...DEFAULT_DRAWING_STYLE };
}

type Flyout = "color" | "width" | "line" | null;

type Pos = { x: number; y: number };

function clampPos(
  x: number,
  y: number,
  el: HTMLElement,
  parent: HTMLElement,
): Pos {
  const er = el.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  const maxX = Math.max(0, pr.width - er.width);
  const maxY = Math.max(0, pr.height - er.height);
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}

function QuickBarShell({
  ariaLabel,
  children,
  onClose,
  flyout,
  setFlyout,
  pos,
  onPosChange,
}: {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  flyout: Flyout;
  setFlyout: (f: Flyout) => void;
  pos: Pos | null;
  onPosChange: (pos: Pos) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Pos | null>(null);
  const dragRef = useRef<{
    ox: number;
    oy: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const display = draft ?? pos;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (flyout) setFlyout(null);
        else onClose();
      }
    }
    function onPointerDownOutside(e: MouseEvent) {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        setFlyout(null);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDownOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDownOutside);
    };
  }, [flyout, onClose, setFlyout]);

  function onGripPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setFlyout(null);

    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;

    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const cur: Pos = display ?? {
      x: er.left - pr.left,
      y: er.top - pr.top,
    };
    setDraft(cur);

    dragRef.current = {
      ox: e.clientX - pr.left - cur.x,
      oy: e.clientY - pr.top - cur.y,
    };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onGripPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!drag || !el || !parent) return;

    const pr = parent.getBoundingClientRect();
    setDraft(
      clampPos(
        e.clientX - pr.left - drag.ox,
        e.clientY - pr.top - drag.oy,
        el,
        parent,
      ),
    );
  }

  function onGripPointerUp(e: ReactPointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setDraft((d) => {
      if (d) onPosChange(d);
      return null;
    });
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const style: CSSProperties | undefined = display
    ? { left: display.x, top: display.y, transform: "none" }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={dragging ? "quick-bar dragging" : "quick-bar"}
      role="toolbar"
      aria-label={ariaLabel}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="quick-bar-grip"
        title="Drag"
        aria-label="Drag toolbar"
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onPointerCancel={onGripPointerUp}
      >
        <GripVertical size={14} strokeWidth={2} />
      </button>
      {children}
    </div>
  );
}

export default function QuickEditBar({
  target,
  drawing,
  indicator,
  colorPresets,
  barPos,
  onBarPosChange,
  onClose,
  onOpenFullSettings,
  onPatchDrawing,
  onDeleteDrawing,
  onPatchIndicator,
  onRemoveIndicator,
}: Props) {
  const [flyout, setFlyout] = useState<Flyout>(null);

  useEffect(() => {
    setFlyout(null);
  }, [target?.kind, target && "id" in target ? target.id : null]);

  if (!target) return null;

  if (target.kind === "drawing" && drawing) {
    const style = styleOf(drawing);
    const locked = Boolean(drawing.lock);

    return (
      <QuickBarShell
        ariaLabel="Drawing quick settings"
        onClose={onClose}
        flyout={flyout}
        setFlyout={setFlyout}
        pos={barPos}
        onPosChange={onBarPosChange}
      >
        <div className="quick-bar-group">
          <button
            type="button"
            className="quick-bar-btn"
            title="Color"
            aria-expanded={flyout === "color"}
            onClick={() =>
              setFlyout((f) => (f === "color" ? null : "color"))
            }
          >
            <span
              className="quick-bar-swatch"
              style={{ background: style.color }}
            />
          </button>
          {flyout === "color" && (
            <div className="quick-bar-flyout" role="dialog" aria-label="Color">
              <input
                className="drawing-color"
                type="color"
                value={style.color}
                aria-label="Custom color"
                onChange={(e) =>
                  onPatchDrawing(drawing.id, {
                    styles: { ...style, color: e.target.value },
                  })
                }
              />
              {colorPresets.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={
                    style.color.toLowerCase() === c.toLowerCase()
                      ? "drawing-swatch active"
                      : "drawing-swatch"
                  }
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  onClick={() => {
                    onPatchDrawing(drawing.id, {
                      styles: { ...style, color: c },
                    });
                    setFlyout(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="quick-bar-group">
          <button
            type="button"
            className="quick-bar-btn text"
            title="Line width"
            aria-expanded={flyout === "width"}
            onClick={() =>
              setFlyout((f) => (f === "width" ? null : "width"))
            }
          >
            <span className="quick-bar-width-icon" aria-hidden />
            {style.size}px
          </button>
          {flyout === "width" && (
            <div className="quick-bar-flyout" role="menu" aria-label="Width">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="menuitem"
                  className={
                    style.size === n
                      ? "quick-bar-menu-item active"
                      : "quick-bar-menu-item"
                  }
                  onClick={() => {
                    onPatchDrawing(drawing.id, {
                      styles: { ...style, size: n },
                    });
                    setFlyout(null);
                  }}
                >
                  {n}px
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="quick-bar-group">
          <button
            type="button"
            className="quick-bar-btn text"
            title="Line style"
            aria-expanded={flyout === "line"}
            onClick={() => setFlyout((f) => (f === "line" ? null : "line"))}
          >
            <span
              className={
                style.lineStyle === "dashed"
                  ? "quick-bar-line-icon dashed"
                  : "quick-bar-line-icon"
              }
              aria-hidden
            />
            {style.lineStyle === "dashed" ? "Dashed" : "Solid"}
          </button>
          {flyout === "line" && (
            <div className="quick-bar-flyout" role="menu" aria-label="Style">
              {(["solid", "dashed"] as const).map((ls) => (
                <button
                  key={ls}
                  type="button"
                  role="menuitem"
                  className={
                    style.lineStyle === ls
                      ? "quick-bar-menu-item active"
                      : "quick-bar-menu-item"
                  }
                  onClick={() => {
                    onPatchDrawing(drawing.id, {
                      styles: { ...style, lineStyle: ls },
                    });
                    setFlyout(null);
                  }}
                >
                  {ls === "solid" ? "Solid" : "Dashed"}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className={locked ? "quick-bar-btn active" : "quick-bar-btn"}
          title={locked ? "Unlock" : "Lock"}
          aria-pressed={locked}
          onClick={() => onPatchDrawing(drawing.id, { lock: !locked })}
        >
          {locked ? (
            <Lock size={14} strokeWidth={2} />
          ) : (
            <LockOpen size={14} strokeWidth={2} />
          )}
        </button>

        <button
          type="button"
          className="quick-bar-btn"
          title="Settings"
          aria-label="Open settings"
          onClick={onOpenFullSettings}
        >
          <Settings2 size={14} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="quick-bar-btn danger"
          title="Delete"
          aria-label="Delete drawing"
          onClick={() => onDeleteDrawing(drawing.id)}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </QuickBarShell>
    );
  }

  if (target.kind === "indicator" && indicator) {
    const meta = INDICATOR_META[indicator.id];
    const visible = indicator.visible !== false;

    return (
      <QuickBarShell
        ariaLabel={`${meta.label} quick settings`}
        onClose={onClose}
        flyout={flyout}
        setFlyout={setFlyout}
        pos={barPos}
        onPosChange={onBarPosChange}
      >
        <span className="quick-bar-label">
          {meta.label}({indicator.calcParams.join(",")})
        </span>

        <button
          type="button"
          className={visible ? "quick-bar-btn" : "quick-bar-btn active"}
          title={visible ? "Hide" : "Show"}
          aria-pressed={!visible}
          onClick={() =>
            onPatchIndicator(indicator.id, { visible: !visible })
          }
        >
          {visible ? (
            <Eye size={14} strokeWidth={2} />
          ) : (
            <EyeOff size={14} strokeWidth={2} />
          )}
        </button>

        <button
          type="button"
          className="quick-bar-btn"
          title="Settings"
          aria-label="Open settings"
          onClick={onOpenFullSettings}
        >
          <Settings2 size={14} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="quick-bar-btn danger"
          title="Remove"
          aria-label={`Remove ${meta.label}`}
          onClick={() => {
            onRemoveIndicator(indicator.id);
            onClose();
          }}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </QuickBarShell>
    );
  }

  return null;
}
