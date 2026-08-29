import type { ThemeTokens } from './types';

export function drawingColorPresets(tokens: ThemeTokens): string[] {
  return [
    tokens.primary,
    tokens['chart-1'],
    tokens['chart-2'],
    tokens['chart-3'],
    tokens['chart-4'],
    tokens['chart-5'],
    tokens.foreground,
  ];
}

export function defaultDrawingColor(tokens: ThemeTokens): string {
  return tokens.primary;
}
