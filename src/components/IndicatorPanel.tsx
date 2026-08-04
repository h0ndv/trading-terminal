import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  INDICATOR_META,
  formatPeriodInput,
  parsePeriodInput,
  reorderIndicators,
  type BuiltinIndicatorId,
  type IndicatorCategory,
  type IndicatorConfig,
} from "../lib/indicators";

type Props = {
  value: IndicatorConfig[];
  onChange: (next: IndicatorConfig[]) => void;
};

type TabId = "all" | IndicatorCategory;

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "overlay", label: "Overlay" },
  { id: "oscillator", label: "Oscillators" },
  { id: "volume", label: "Volume" },
];

function draftsFromValue(value: IndicatorConfig[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of value) {
    out[c.id] = formatPeriodInput(c.calcParams);
  }
  return out;
}

export default function IndicatorPanel({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("all");
  const [drafts, setDrafts] = useState(() => draftsFromValue(value));
  const [draggingId, setDraggingId] = useState<BuiltinIndicatorId | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDrafts(draftsFromValue(value));
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const visible = value.filter((c) =>
    tab === "all" ? true : INDICATOR_META[c.id].category === tab,
  );

  function patch(id: BuiltinIndicatorId, next: Partial<IndicatorConfig>) {
    onChange(value.map((c) => (c.id === id ? { ...c, ...next } : c)));
  }

  function commitPeriod(id: BuiltinIndicatorId) {
    const meta = INDICATOR_META[id];
    const cfg = value.find((c) => c.id === id);
    const parsed = parsePeriodInput(
      drafts[id] ?? "",
      meta.paramCount,
      meta.allowFloat,
    );
    if (parsed) {
      patch(id, { calcParams: parsed });
      setDrafts((d) => ({ ...d, [id]: formatPeriodInput(parsed) }));
    } else if (cfg) {
      setDrafts((d) => ({ ...d, [id]: formatPeriodInput(cfg.calcParams) }));
    }
  }

  function onDragStart(e: DragEvent, id: BuiltinIndicatorId) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function onDragOverRow(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDropRow(e: DragEvent, beforeId: BuiltinIndicatorId) {
    e.preventDefault();
    const id = (e.dataTransfer.getData("text/plain") ||
      draggingId) as BuiltinIndicatorId | null;
    setDraggingId(null);
    if (!id || id === beforeId) return;
    onChange(reorderIndicators(value, id, beforeId));
  }

  return (
    <div className="indicator-panel" ref={rootRef}>
      <button
        type="button"
        className={open ? "indicator-toggle active" : "indicator-toggle"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        Indicators
      </button>
      {open && (
        <div
          className="indicator-popover"
          role="dialog"
          aria-label="Indicators"
        >
          <div className="indicator-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={
                  tab === t.id ? "indicator-tab active" : "indicator-tab"
                }
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="indicator-list">
            {visible.length === 0 ? (
              <div className="indicator-empty">No indicators</div>
            ) : (
              visible.map((cfg) => {
                const meta = INDICATOR_META[cfg.id];
                return (
                  <div
                    key={cfg.id}
                    className={
                      draggingId === cfg.id
                        ? "indicator-row dragging"
                        : "indicator-row"
                    }
                    onDragOver={onDragOverRow}
                    onDrop={(e) => onDropRow(e, cfg.id)}
                  >
                    <button
                      type="button"
                      className="indicator-drag"
                      title="Drag to reorder"
                      aria-label={`Reorder ${meta.label}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, cfg.id)}
                      onDragEnd={() => setDraggingId(null)}
                    >
                      ::
                    </button>
                    <label className="indicator-enable">
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={(e) =>
                          patch(cfg.id, { enabled: e.target.checked })
                        }
                      />
                      <span>{meta.label}</span>
                    </label>
                    <label className="indicator-params">
                      <span className="indicator-params-label">Params</span>
                      <input
                        className="indicator-period"
                        type="text"
                        inputMode="decimal"
                        disabled={!cfg.enabled}
                        placeholder={meta.paramHint}
                        value={drafts[cfg.id] ?? ""}
                        aria-label={`${meta.label} params`}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [cfg.id]: e.target.value,
                          }))
                        }
                        onBlur={() => commitPeriod(cfg.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitPeriod(cfg.id);
                          }
                        }}
                      />
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
