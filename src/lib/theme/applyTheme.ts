import { THEME_TOKEN_KEYS, type ThemeMode, type ThemeTokens } from './types';

export function applyThemeToDOM(tokens: ThemeTokens, mode: ThemeMode): void {
  const root = document.documentElement;
  for (const key of THEME_TOKEN_KEYS) {
    root.style.setProperty(`--${key}`, tokens[key]);
  }
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
}
