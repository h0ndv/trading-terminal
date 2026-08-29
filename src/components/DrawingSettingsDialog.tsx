import { useEffect, useState } from 'react';
import {
  DEFAULT_DRAWING_STYLE,
  toolNeedsText,
  type DrawingSnapshot,
  type DrawingStyle,
  type DrawingToolId,
  type OverlayMagnetMode,
} from '../lib/drawings';
import Dialog from './ui/Dialog';

type Props = {
  drawing: DrawingSnapshot | null;
  colorPresets: string[];
  onClose: () => void;
  onSave: (id: string, patch: Partial<DrawingSnapshot>) => void;
  onDelete: (id: string) => void;
};

function styleOf(d: DrawingSnapshot): DrawingStyle {
  return d.styles ?? { ...DEFAULT_DRAWING_STYLE };
}

export default function DrawingSettingsDialog({
  drawing,
  colorPresets,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [color, setColor] = useState(DEFAULT_DRAWING_STYLE.color);
  const [size, setSize] = useState(1);
  const [lineStyle, setLineStyle] = useState<'solid' | 'dashed'>('solid');
  const [visible, setVisible] = useState(true);
  const [lock, setLock] = useState(false);
  const [mode, setMode] = useState<OverlayMagnetMode>('normal');
  const [text, setText] = useState('');

  useEffect(() => {
    if (!drawing) return;
    const s = styleOf(drawing);
    setColor(s.color);
    setSize(s.size);
    setLineStyle(s.lineStyle);
    setVisible(drawing.visible !== false);
    setLock(Boolean(drawing.lock));
    setMode(drawing.mode ?? 'normal');
    setText(typeof drawing.extendData === 'string' ? drawing.extendData : '');
  }, [drawing]);

  if (!drawing) return null;

  const needsText = toolNeedsText(drawing.name as DrawingToolId);

  function confirm() {
    const patch: Partial<DrawingSnapshot> = {
      visible,
      lock,
      mode,
      styles: { color, size, lineStyle },
    };
    if (needsText) patch.extendData = text.trim() || 'Note';
    onSave(drawing!.id, patch);
    onClose();
  }

  return (
    <Dialog
      open
      title={drawing.name}
      onClose={onClose}
      onConfirm={confirm}
      confirmLabel="Confirm"
      footerExtra={
        <button type="button" className="dialog-btn danger" onClick={() => onDelete(drawing.id)}>
          Delete
        </button>
      }
    >
      <div className="dialog-field">
        <span className="dialog-field-label">Color</span>
        <div className="drawing-style">
          <input
            className="drawing-color"
            type="color"
            value={color}
            aria-label="Line color"
            onChange={(e) => setColor(e.target.value)}
          />
          {colorPresets.map((c) => (
            <button
              key={c}
              type="button"
              className={
                color.toLowerCase() === c.toLowerCase() ? 'drawing-swatch active' : 'drawing-swatch'
              }
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>

      <label className="dialog-field">
        <span className="dialog-field-label">Width</span>
        <select
          value={size}
          aria-label="Line width"
          onChange={(e) => setSize(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="dialog-field">
        <span className="dialog-field-label">Line style</span>
        <select
          value={lineStyle}
          aria-label="Line style"
          onChange={(e) => setLineStyle(e.target.value as 'solid' | 'dashed')}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
      </label>

      <label className="dialog-field">
        <span className="dialog-field-label">Magnet</span>
        <select
          value={mode}
          aria-label="Magnet mode"
          onChange={(e) => setMode(e.target.value as OverlayMagnetMode)}
        >
          <option value="normal">Off</option>
          <option value="weak_magnet">Weak</option>
          <option value="strong_magnet">Strong</option>
        </select>
      </label>

      {needsText && (
        <label className="dialog-field">
          <span className="dialog-field-label">Text</span>
          <input
            type="text"
            value={text}
            aria-label="Annotation text"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      )}

      <label className="dialog-check">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Visible
      </label>

      <label className="dialog-check">
        <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
        Lock
      </label>
    </Dialog>
  );
}
