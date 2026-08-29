import ChartView, {
  type IndicatorFeatureAction,
} from "./Chart";
import { useChartStream } from "../hooks/useChartStream";
import {
  type DrawingSnapshot,
  type DrawingStyle,
  type DrawingToolId,
  type OverlayMagnetMode,
} from "../lib/drawings";
import type { BuiltinIndicatorId } from "../lib/indicators";
import type { ThemeTokens } from "../lib/theme";
import type { ChartPanelConfig } from "../lib/workspace";

type Props = {
  chart: ChartPanelConfig;
  isActive: boolean;
  pricePrecision: number;
  volumePrecision: number;
  themeTokens: ThemeTokens;
  themeId: string;
  themeMode: string;
  activeTool: DrawingToolId | null;
  magnetMode: OverlayMagnetMode;
  drawStyle: DrawingStyle;
  annotationText: string;
  drawings: DrawingSnapshot[];
  onFocus: () => void;
  onDrawingsChange: (next: DrawingSnapshot[]) => void;
  onActiveToolConsumed: () => void;
  onIndicatorFeature: (
    id: BuiltinIndicatorId,
    action: IndicatorFeatureAction,
  ) => void;
  onOpenDrawingSettings: (id: string) => void;
  onDrawingSelect: (id: string | null) => void;
};

export default function ChartPanel({
  chart,
  isActive,
  pricePrecision,
  volumePrecision,
  themeTokens,
  themeId,
  themeMode,
  activeTool,
  magnetMode,
  drawStyle,
  annotationText,
  drawings,
  onFocus,
  onDrawingsChange,
  onActiveToolConsumed,
  onIndicatorFeature,
  onOpenDrawingSettings,
  onDrawingSelect,
}: Props) {
  const stream = useChartStream(chart.symbol, chart.timeframe);

  return (
    <div
      className={isActive ? "chart-panel active" : "chart-panel"}
      onPointerDown={onFocus}
      role="tabpanel"
      aria-selected={isActive}
    >
      <div className="chart-panel-header">
        <span className="chart-panel-label">
          {chart.symbol} · {chart.timeframe}
        </span>
      </div>
      <div className="chart-panel-body">
        <ChartView
          symbol={chart.symbol}
          timeframe={chart.timeframe}
          pricePrecision={pricePrecision}
          volumePrecision={volumePrecision}
          stream={stream}
          indicators={chart.indicators}
          themeTokens={themeTokens}
          themeId={themeId}
          themeMode={themeMode}
          activeTool={isActive ? activeTool : null}
          magnetMode={magnetMode}
          drawStyle={drawStyle}
          annotationText={annotationText}
          drawings={drawings}
          onDrawingsChange={onDrawingsChange}
          onActiveToolConsumed={onActiveToolConsumed}
          onIndicatorFeature={onIndicatorFeature}
          onOpenDrawingSettings={onOpenDrawingSettings}
          onDrawingSelect={onDrawingSelect}
        />
      </div>
    </div>
  );
}
