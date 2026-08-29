import { Group, Panel, Separator, type Layout } from "react-resizable-panels";
import ChartPanel from "./ChartPanel";
import type { IndicatorFeatureAction } from "./Chart";
import {
  type DrawingSnapshot,
  type DrawingStyle,
  type DrawingToolId,
  type OverlayMagnetMode,
} from "../lib/drawings";
import type { BuiltinIndicatorId } from "../lib/indicators";
import type { ThemeTokens } from "../lib/theme";
import type { SymbolInfo } from "../lib/types";
import type { ChartId, ChartPanelConfig, WorkspaceLayout } from "../lib/workspace";

type Props = {
  charts: ChartPanelConfig[];
  activeChartId: ChartId;
  workspaceLayout: WorkspaceLayout | null;
  symbols: SymbolInfo[];
  themeTokens: ThemeTokens;
  themeId: string;
  themeMode: string;
  activeTool: DrawingToolId | null;
  magnetMode: OverlayMagnetMode;
  drawStyle: DrawingStyle;
  annotationText: string;
  drawingsBySymbol: Record<string, DrawingSnapshot[]>;
  onActiveChartId: (id: ChartId) => void;
  onLayoutChange: (layout: WorkspaceLayout) => void;
  onDrawingsChange: (symbol: string, next: DrawingSnapshot[]) => void;
  onActiveToolConsumed: () => void;
  onIndicatorFeature: (
    chartId: ChartId,
    id: BuiltinIndicatorId,
    action: IndicatorFeatureAction,
  ) => void;
  onOpenDrawingSettings: (id: string) => void;
  onDrawingSelect: (id: string | null) => void;
};

const PANEL_GROUP_ID = "chart-workspace";

function precisionFor(
  symbols: SymbolInfo[],
  ticker: string,
): { price: number; volume: number } {
  const info = symbols.find((s) => s.ticker === ticker);
  return {
    price: info?.price_precision ?? 2,
    volume: info?.volume_precision ?? 3,
  };
}

function layoutToRecord(layout: Layout): Record<string, number> {
  return Object.fromEntries(
    Object.entries(layout).map(([k, v]) => [k, Number(v)]),
  );
}

function recordToLayout(record: Record<string, number>): Layout | undefined {
  const entries = Object.entries(record);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([k, v]) => [k, v]));
}

function ResizeHandle() {
  return <Separator className="chart-resize-handle" />;
}

function renderPanel(
  chart: ChartPanelConfig,
  props: Props,
): React.ReactNode {
  const { price, volume } = precisionFor(props.symbols, chart.symbol);
  const drawings = props.drawingsBySymbol[chart.symbol] ?? [];

  return (
    <ChartPanel
      key={chart.id}
      chart={chart}
      isActive={chart.id === props.activeChartId}
      pricePrecision={price}
      volumePrecision={volume}
      themeTokens={props.themeTokens}
      themeId={props.themeId}
      themeMode={props.themeMode}
      activeTool={props.activeTool}
      magnetMode={props.magnetMode}
      drawStyle={props.drawStyle}
      annotationText={props.annotationText}
      drawings={drawings}
      onFocus={() => props.onActiveChartId(chart.id)}
      onDrawingsChange={(next) =>
        props.onDrawingsChange(chart.symbol, next)
      }
      onActiveToolConsumed={props.onActiveToolConsumed}
      onIndicatorFeature={(id, action) =>
        props.onIndicatorFeature(chart.id, id, action)
      }
      onOpenDrawingSettings={props.onOpenDrawingSettings}
      onDrawingSelect={props.onDrawingSelect}
    />
  );
}

export default function ChartWorkspace(props: Props) {
  const { charts, workspaceLayout, onLayoutChange } = props;

  const defaultLayout =
    recordToLayout(workspaceLayout?.defaultLayout ?? {}) ?? undefined;

  const onLayoutChanged = (layout: Layout) => {
    onLayoutChange({
      panelGroupId: PANEL_GROUP_ID,
      defaultLayout: layoutToRecord(layout),
    });
  };

  if (charts.length === 1) {
    return (
      <div className="chart-workspace chart-workspace-single">
        {renderPanel(charts[0]!, props)}
      </div>
    );
  }

  if (charts.length === 2) {
    return (
      <Group
        id={PANEL_GROUP_ID}
        orientation="horizontal"
        className="chart-workspace"
        onLayoutChanged={onLayoutChanged}
        defaultLayout={defaultLayout}
      >
        <Panel id={charts[0]!.id} minSize={15} defaultSize={50}>
          {renderPanel(charts[0]!, props)}
        </Panel>
        <ResizeHandle />
        <Panel id={charts[1]!.id} minSize={15} defaultSize={50}>
          {renderPanel(charts[1]!, props)}
        </Panel>
      </Group>
    );
  }

  if (charts.length === 3) {
    return (
      <Group
        id={PANEL_GROUP_ID}
        orientation="horizontal"
        className="chart-workspace"
        onLayoutChanged={onLayoutChanged}
        defaultLayout={defaultLayout}
      >
        <Panel id={charts[0]!.id} minSize={15} defaultSize={50}>
          {renderPanel(charts[0]!, props)}
        </Panel>
        <ResizeHandle />
        <Panel id={`${PANEL_GROUP_ID}-right`} minSize={15} defaultSize={50}>
          <Group orientation="vertical">
            <Panel id={charts[1]!.id} minSize={15} defaultSize={50}>
              {renderPanel(charts[1]!, props)}
            </Panel>
            <ResizeHandle />
            <Panel id={charts[2]!.id} minSize={15} defaultSize={50}>
              {renderPanel(charts[2]!, props)}
            </Panel>
          </Group>
        </Panel>
      </Group>
    );
  }

  return (
    <Group
      id={PANEL_GROUP_ID}
      orientation="horizontal"
      className="chart-workspace"
      onLayoutChanged={onLayoutChanged}
      defaultLayout={defaultLayout}
    >
      <Panel id={charts[0]!.id} minSize={15} defaultSize={50}>
        {renderPanel(charts[0]!, props)}
      </Panel>
      <ResizeHandle />
      <Panel id={`${PANEL_GROUP_ID}-right`} minSize={15} defaultSize={50}>
        <Group orientation="vertical">
          <Panel id={charts[1]!.id} minSize={15} defaultSize={50}>
            {renderPanel(charts[1]!, props)}
          </Panel>
          <ResizeHandle />
          <Panel id={`${PANEL_GROUP_ID}-br`} minSize={15} defaultSize={50}>
            <Group orientation="horizontal">
              <Panel id={charts[2]!.id} minSize={15} defaultSize={50}>
                {renderPanel(charts[2]!, props)}
              </Panel>
              <ResizeHandle />
              <Panel id={charts[3]!.id} minSize={15} defaultSize={50}>
                {renderPanel(charts[3]!, props)}
              </Panel>
            </Group>
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}
