import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Eye, EyeOff, Settings2 } from 'lucide-react';
import {
  INDICATOR_META,
  reorderIndicators,
  type BuiltinIndicatorId,
  type IndicatorCategory,
  type IndicatorConfig,
} from '../lib/indicators';

type Props = {
  value: IndicatorConfig[];
  onChange: (next: IndicatorConfig[]) => void;
  onOpenSettings: (id: BuiltinIndicatorId) => void;
};

type TabId = 'all' | IndicatorCategory;

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'oscillator', label: 'Oscillators' },
  { id: 'volume', label: 'Volume' },
];

export default function IndicatorPanel({ value, onChange, onOpenSettings }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('all');
  const [draggingId, setDraggingId] = useState<BuiltinIndicatorId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const visible = value.filter((c) =>
    tab === 'all' ? true : INDICATOR_META[c.id].category === tab,
  );

  function patch(id: BuiltinIndicatorId, next: Partial<IndicatorConfig>) {
    onChange(value.map((c) => (c.id === id ? { ...c, ...next } : c)));
  }

  function onDragStart(e: DragEvent, id: BuiltinIndicatorId) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function onDragOverRow(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDropRow(e: DragEvent, beforeId: BuiltinIndicatorId) {
    e.preventDefault();
    const id = (e.dataTransfer.getData('text/plain') || draggingId) as BuiltinIndicatorId | null;
    setDraggingId(null);
    if (!id || id === beforeId) return;
    onChange(reorderIndicators(value, id, beforeId));
  }

  return (
    <div className="indicator-panel" ref={rootRef}>
      <button
        type="button"
        className={open ? 'indicator-toggle active' : 'indicator-toggle'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        Indicators
      </button>
      {open && (
        <div className="indicator-popover" role="dialog" aria-label="Indicators">
          <div className="indicator-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'indicator-tab active' : 'indicator-tab'}
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
                    className={draggingId === cfg.id ? 'indicator-row dragging' : 'indicator-row'}
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
                        onChange={(e) => patch(cfg.id, { enabled: e.target.checked })}
                      />
                      <span>
                        {meta.label}
                        {cfg.enabled ? ` (${cfg.calcParams.join(',')})` : ''}
                      </span>
                    </label>
                    <div className="indicator-row-actions">
                      <button
                        type="button"
                        className={
                          cfg.visible ? 'indicator-action-btn' : 'indicator-action-btn active'
                        }
                        title={cfg.visible ? 'Hide' : 'Show'}
                        aria-label={cfg.visible ? `Hide ${meta.label}` : `Show ${meta.label}`}
                        disabled={!cfg.enabled}
                        onClick={() => patch(cfg.id, { visible: !cfg.visible })}
                      >
                        {cfg.visible ? (
                          <Eye size={14} strokeWidth={2} />
                        ) : (
                          <EyeOff size={14} strokeWidth={2} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="indicator-action-btn"
                        title="Settings"
                        aria-label={`${meta.label} settings`}
                        disabled={!cfg.enabled}
                        onClick={() => {
                          setOpen(false);
                          onOpenSettings(cfg.id);
                        }}
                      >
                        <Settings2 size={14} strokeWidth={2} />
                      </button>
                    </div>
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
