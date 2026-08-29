import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import {
  GROUP_TOOL_ICONS,
  IconChevron,
  IconEye,
  IconEyeOff,
  IconMagnet,
  IconPalette,
  IconStar,
  IconTrash,
  IconTrendLine,
} from './DrawingToolIcons';
import {
  DRAWING_TOOL_GROUPS,
  cycleMagnetMode,
  findToolGroup,
  magnetModeLabel,
  toolNeedsText,
  type DrawingStyle,
  type DrawingToolGroupId,
  type DrawingToolId,
  type OverlayMagnetMode,
} from '../lib/drawings';

type Props = {
  activeTool: DrawingToolId | null;
  onActiveTool: (tool: DrawingToolId | null) => void;
  magnetMode: OverlayMagnetMode;
  onMagnetMode: (mode: OverlayMagnetMode) => void;
  style: DrawingStyle;
  onStyleChange: (next: DrawingStyle) => void;
  colorPresets: string[];
  annotationText: string;
  onAnnotationTextChange: (text: string) => void;
  drawingsHidden: boolean;
  onToggleDrawingsHidden: () => void;
  onClear: () => void;
  favoriteTools: DrawingToolId[];
  onToggleFavorite: (tool: DrawingToolId) => void;
  favoritesBarVisible: boolean;
  onToggleFavoritesBar: () => void;
};

function initialLastTools(): Record<DrawingToolGroupId, DrawingToolId> {
  const out = {} as Record<DrawingToolGroupId, DrawingToolId>;
  for (const g of DRAWING_TOOL_GROUPS) {
    out[g.id] = g.tools[0].id;
  }
  return out;
}

export default function DrawingToolbar({
  activeTool,
  onActiveTool,
  magnetMode,
  onMagnetMode,
  style,
  onStyleChange,
  colorPresets,
  annotationText,
  onAnnotationTextChange,
  drawingsHidden,
  onToggleDrawingsHidden,
  onClear,
  favoriteTools,
  onToggleFavorite,
  favoritesBarVisible,
  onToggleFavoritesBar,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openGroupId, setOpenGroupId] = useState<DrawingToolGroupId | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [lastTools, setLastTools] =
    useState<Record<DrawingToolGroupId, DrawingToolId>>(initialLastTools);

  const showText = activeTool != null && toolNeedsText(activeTool);
  const magnetOn = magnetMode !== 'normal';

  useEffect(() => {
    if (activeTool == null) return;
    const group = findToolGroup(activeTool);
    if (!group) return;
    setLastTools((prev) =>
      prev[group.id] === activeTool ? prev : { ...prev, [group.id]: activeTool },
    );
  }, [activeTool]);

  useEffect(() => {
    if (openGroupId == null && !styleOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenGroupId(null);
        setStyleOpen(false);
      }
    }
    function onPointerDown(e: MouseEvent) {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        setOpenGroupId(null);
        setStyleOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [openGroupId, styleOpen]);

  function selectLastTool(id: DrawingToolGroupId) {
    setStyleOpen(false);
    onActiveTool(lastTools[id]);
  }

  function toggleGroupMenu(id: DrawingToolGroupId) {
    setStyleOpen(false);
    setOpenGroupId((prev) => (prev === id ? null : id));
  }

  function selectTool(id: DrawingToolId) {
    onActiveTool(activeTool === id ? null : id);
    setOpenGroupId(null);
  }

  const openGroup =
    openGroupId != null ? DRAWING_TOOL_GROUPS.find((g) => g.id === openGroupId) : undefined;

  return (
    <div ref={rootRef} className="drawing-toolbar" role="toolbar" aria-label="Drawing tools">
      <div className="drawing-rail" role="group" aria-label="Tool groups">
        {DRAWING_TOOL_GROUPS.map((g) => {
          const lastId = lastTools[g.id];
          const lastLabel = g.tools.find((t) => t.id === lastId)?.label ?? g.label;
          const groupActive = activeTool != null && g.tools.some((t) => t.id === activeTool);
          const menuOpen = openGroupId === g.id;
          const Icon = GROUP_TOOL_ICONS[g.id] ?? IconTrendLine;
          return (
            <div
              key={g.id}
              className={groupActive || menuOpen ? 'drawing-rail-slot active' : 'drawing-rail-slot'}
            >
              <button
                type="button"
                className={groupActive ? 'drawing-rail-btn active' : 'drawing-rail-btn'}
                aria-pressed={groupActive}
                title={lastLabel}
                onClick={() => selectLastTool(g.id)}
              >
                <Icon size={16} />
              </button>
              <button
                type="button"
                className={menuOpen ? 'drawing-rail-menu-btn active' : 'drawing-rail-menu-btn'}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                title={`${g.label} options`}
                onClick={() => toggleGroupMenu(g.id)}
              >
                <IconChevron size={8} />
              </button>
            </div>
          );
        })}
      </div>

      {openGroup && (
        <div className="drawing-flyout" role="menu" aria-label={openGroup.label}>
          <div className="drawing-flyout-title">{openGroup.label}</div>
          {openGroup.tools.map((t) => {
            const fav = favoriteTools.includes(t.id);
            return (
              <div
                key={t.id}
                className={activeTool === t.id ? 'drawing-flyout-row active' : 'drawing-flyout-row'}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="drawing-flyout-item"
                  onClick={() => selectTool(t.id)}
                >
                  {t.label}
                </button>
                <button
                  type="button"
                  className={fav ? 'drawing-fav-btn active' : 'drawing-fav-btn'}
                  title={fav ? 'Remove favorite' : 'Add favorite'}
                  aria-label={fav ? `Unfavorite ${t.label}` : `Favorite ${t.label}`}
                  aria-pressed={fav}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(t.id);
                  }}
                >
                  <Star size={14} strokeWidth={2} fill={fav ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="drawing-rail-spacer" />

      <div className="drawing-actions" role="group" aria-label="Actions">
        <button
          type="button"
          className={favoritesBarVisible ? 'drawing-rail-btn active' : 'drawing-rail-btn'}
          aria-pressed={favoritesBarVisible}
          title={favoritesBarVisible ? 'Hide favorites bar' : 'Show favorites bar'}
          onClick={() => {
            setOpenGroupId(null);
            setStyleOpen(false);
            onToggleFavoritesBar();
          }}
        >
          <IconStar size={16} filled={favoritesBarVisible} />
        </button>
        <button
          type="button"
          className={styleOpen ? 'drawing-rail-btn active' : 'drawing-rail-btn'}
          aria-expanded={styleOpen}
          aria-haspopup="dialog"
          title="Style"
          onClick={() => {
            setOpenGroupId(null);
            setStyleOpen((v) => !v);
          }}
        >
          <IconPalette size={16} />
        </button>
        <button
          type="button"
          className={magnetOn ? 'drawing-rail-btn active' : 'drawing-rail-btn'}
          aria-pressed={magnetOn}
          title={magnetModeLabel(magnetMode)}
          onClick={() => onMagnetMode(cycleMagnetMode(magnetMode))}
        >
          <IconMagnet size={16} />
        </button>
        <button
          type="button"
          className={drawingsHidden ? 'drawing-rail-btn active' : 'drawing-rail-btn'}
          aria-pressed={drawingsHidden}
          title={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
          onClick={onToggleDrawingsHidden}
        >
          {drawingsHidden ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </button>
        <button type="button" className="drawing-rail-btn" title="Clear drawings" onClick={onClear}>
          <IconTrash size={16} />
        </button>
      </div>

      {styleOpen && (
        <div
          className="drawing-flyout drawing-flyout-style"
          role="dialog"
          aria-label="Drawing style"
        >
          <div className="drawing-flyout-title">Style</div>
          <div className="drawing-style">
            <input
              className="drawing-color"
              type="color"
              value={style.color}
              title="Line color"
              aria-label="Line color"
              onChange={(e) => onStyleChange({ ...style, color: e.target.value })}
            />
            {colorPresets.map((c) => (
              <button
                key={c}
                type="button"
                className={
                  style.color.toLowerCase() === c.toLowerCase()
                    ? 'drawing-swatch active'
                    : 'drawing-swatch'
                }
                style={{ background: c }}
                title={c}
                aria-label={`Color ${c}`}
                onClick={() => onStyleChange({ ...style, color: c })}
              />
            ))}
            <label className="drawing-size">
              <span className="drawing-size-label">W</span>
              <select
                value={style.size}
                aria-label="Line width"
                onChange={(e) =>
                  onStyleChange({
                    ...style,
                    size: Number(e.target.value),
                  })
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={style.lineStyle === 'solid' ? 'drawing-btn active' : 'drawing-btn'}
              aria-pressed={style.lineStyle === 'solid'}
              title="Solid line"
              onClick={() => onStyleChange({ ...style, lineStyle: 'solid' })}
            >
              Solid
            </button>
            <button
              type="button"
              className={style.lineStyle === 'dashed' ? 'drawing-btn active' : 'drawing-btn'}
              aria-pressed={style.lineStyle === 'dashed'}
              title="Dashed line"
              onClick={() => onStyleChange({ ...style, lineStyle: 'dashed' })}
            >
              Dash
            </button>
          </div>
        </div>
      )}

      {showText && (
        <div className="drawing-annot-pop">
          <input
            className="drawing-annot-text"
            type="text"
            value={annotationText}
            placeholder="Annotation text"
            aria-label="Annotation text"
            onChange={(e) => onAnnotationTextChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
