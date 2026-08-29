import { useEffect, useRef, useState } from 'react';
import { Moon, Palette, Sun } from 'lucide-react';
import { THEME_PRESET_IDS, THEME_PRESETS, type ThemeMode } from '../lib/theme';

type Props = {
  themeId: string;
  themeMode: ThemeMode;
  onThemeId: (id: string) => void;
  onThemeMode: (mode: ThemeMode) => void;
};

export default function ThemePicker({ themeId, themeMode, onThemeId, onThemeMode }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = THEME_PRESETS[themeId] ?? THEME_PRESETS.terminal;

  return (
    <div className="theme-picker" ref={rootRef}>
      <button
        type="button"
        className={open ? 'theme-picker-toggle active' : 'theme-picker-toggle'}
        aria-label="Theme"
        aria-expanded={open}
        title="Theme"
        onClick={() => setOpen((v) => !v)}
      >
        <Palette size={16} />
      </button>
      {open && (
        <div className="theme-picker-popover" role="dialog" aria-label="Themes">
          <div className="theme-picker-header">
            <span className="theme-picker-title">{active.label}</span>
            <div className="theme-picker-modes" role="group" aria-label="Mode">
              <button
                type="button"
                className={themeMode === 'light' ? 'theme-mode-btn active' : 'theme-mode-btn'}
                aria-label="Light"
                title="Light"
                onClick={() => onThemeMode('light')}
              >
                <Sun size={14} />
              </button>
              <button
                type="button"
                className={themeMode === 'dark' ? 'theme-mode-btn active' : 'theme-mode-btn'}
                aria-label="Dark"
                title="Dark"
                onClick={() => onThemeMode('dark')}
              >
                <Moon size={14} />
              </button>
            </div>
          </div>
          <div className="theme-picker-grid">
            {THEME_PRESET_IDS.map((id) => {
              const preset = THEME_PRESETS[id];
              const tokens = preset.styles[themeMode];
              const selected = id === themeId;
              return (
                <button
                  key={id}
                  type="button"
                  className={selected ? 'theme-preset-card active' : 'theme-preset-card'}
                  title={preset.label}
                  onClick={() => {
                    onThemeId(id);
                    setOpen(false);
                  }}
                >
                  <span className="theme-preset-swatches" style={{ background: tokens.background }}>
                    <i style={{ background: tokens.primary }} />
                    <i style={{ background: tokens['candle-up'] }} />
                    <i style={{ background: tokens['candle-down'] }} />
                  </span>
                  <span className="theme-preset-label">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
