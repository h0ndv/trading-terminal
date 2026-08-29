import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { GripVertical, Star } from 'lucide-react';
import { toolLabel, type DrawingToolId } from '../lib/drawings';
import type { QuickBarPos } from '../lib/settings';

type Props = {
  favorites: DrawingToolId[];
  activeTool: DrawingToolId | null;
  onSelectTool: (tool: DrawingToolId | null) => void;
  barPos: QuickBarPos | null;
  onBarPosChange: (pos: QuickBarPos) => void;
};

function clampPos(x: number, y: number, el: HTMLElement, parent: HTMLElement): QuickBarPos {
  const er = el.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  const maxX = Math.max(0, pr.width - er.width);
  const maxY = Math.max(0, pr.height - er.height);
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}

export default function FavoriteToolsBar({
  favorites,
  activeTool,
  onSelectTool,
  barPos,
  onBarPosChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<QuickBarPos | null>(null);
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const display = draft ?? barPos;

  if (favorites.length === 0) return null;

  function onGripPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const cur = display ?? { x: er.left - pr.left, y: er.top - pr.top };
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
    setDraft(clampPos(e.clientX - pr.left - drag.ox, e.clientY - pr.top - drag.oy, el, parent));
  }

  function onGripPointerUp(e: ReactPointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setDraft((d) => {
      if (d) onBarPosChange(d);
      return null;
    });
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const style: CSSProperties | undefined = display
    ? { left: display.x, top: display.y, transform: 'none' }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={dragging ? 'quick-bar favorites-bar dragging' : 'quick-bar favorites-bar'}
      role="toolbar"
      aria-label="Favorite tools"
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
      <Star size={12} strokeWidth={2} className="favorites-bar-icon" aria-hidden />
      {favorites.map((id) => (
        <button
          key={id}
          type="button"
          className={activeTool === id ? 'quick-bar-btn text active' : 'quick-bar-btn text'}
          title={toolLabel(id)}
          aria-pressed={activeTool === id}
          onClick={() => onSelectTool(activeTool === id ? null : id)}
        >
          {toolLabel(id)}
        </button>
      ))}
    </div>
  );
}
