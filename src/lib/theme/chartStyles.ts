import type { DeepPartial, Styles } from 'klinecharts';
import type { ThemeTokens } from './types';

export function toKLineStyles(tokens: ThemeTokens): DeepPartial<Styles> {
  const up = tokens['candle-up'];
  const down = tokens['candle-down'];
  const muted = tokens['muted-foreground'];
  const fg = tokens.foreground;
  const border = tokens.border;
  const card = tokens.card;
  const noChange = muted;

  const lineColors = [
    tokens['chart-1'],
    tokens['chart-2'],
    tokens['chart-3'],
    tokens['chart-4'],
    tokens['chart-5'],
  ];

  return {
    grid: {
      horizontal: { color: border },
      vertical: { color: border },
    },
    candle: {
      bar: {
        upColor: up,
        downColor: down,
        noChangeColor: noChange,
        upBorderColor: up,
        downBorderColor: down,
        noChangeBorderColor: noChange,
        upWickColor: up,
        downWickColor: down,
        noChangeWickColor: noChange,
      },
      priceMark: {
        high: { color: muted },
        low: { color: muted },
        last: {
          upColor: up,
          downColor: down,
          noChangeColor: noChange,
        },
      },
      tooltip: {
        title: { color: fg },
        legend: { color: fg },
      },
    },
    indicator: {
      lines: lineColors.map((color) => ({ color })),
      lastValueMark: {
        text: { color: fg },
      },
      tooltip: {
        title: { color: fg },
        legend: { color: fg },
      },
      bars: [
        {
          upColor: up,
          downColor: down,
          noChangeColor: noChange,
        },
      ],
      circles: [
        {
          upColor: up,
          downColor: down,
          noChangeColor: noChange,
        },
      ],
      ohlc: {
        upColor: up,
        downColor: down,
        noChangeColor: noChange,
      },
    },
    xAxis: {
      axisLine: { color: border },
      tickLine: { color: border },
      tickText: { color: muted },
    },
    yAxis: {
      axisLine: { color: border },
      tickLine: { color: border },
      tickText: { color: muted },
    },
    crosshair: {
      horizontal: {
        line: { color: muted },
        text: { backgroundColor: card, color: fg },
      },
      vertical: {
        line: { color: muted },
        text: { backgroundColor: card, color: fg },
      },
    },
    separator: {
      color: border,
    },
  };
}
