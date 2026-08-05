import type { TooltipFeatureStyle } from "klinecharts";

export const INDICATOR_FEATURE = {
  visible: "visible",
  settings: "settings",
  close: "close",
} as const;

export type IndicatorFeatureId =
  (typeof INDICATOR_FEATURE)[keyof typeof INDICATOR_FEATURE];

const BASE = {
  marginLeft: 6,
  marginTop: 4,
  marginRight: 0,
  marginBottom: 0,
  paddingLeft: 2,
  paddingTop: 2,
  paddingRight: 2,
  paddingBottom: 2,
  size: 12,
  color: "#8b949e",
  activeColor: "#e6edf3",
  backgroundColor: "transparent",
  activeBackgroundColor: "rgba(110, 118, 129, 0.3)",
  borderRadius: 2,
  type: "path" as const,
  position: "middle" as const,
};

export const INDICATOR_TOOLTIP_FEATURES: TooltipFeatureStyle[] = [
  {
    ...BASE,
    id: INDICATOR_FEATURE.visible,
    content: {
      style: "stroke",
      path: "M1,6 C3,3 5,2 6.5,2 C8,2 10,3 12,6 C10,9 8,10 6.5,10 C5,10 3,9 1,6 Z M6.5,8 C7.6,8 8.5,7.1 8.5,6 C8.5,4.9 7.6,4 6.5,4 C5.4,4 4.5,4.9 4.5,6 C4.5,7.1 5.4,8 6.5,8 Z",
      lineWidth: 1,
    },
  },
  {
    ...BASE,
    id: INDICATOR_FEATURE.settings,
    content: {
      style: "stroke",
      path: "M6.5,1.5 L7.2,3.2 L9,2.8 L10.2,4.2 L8.8,5.2 L9.8,6.8 L8,7.5 L8,9.5 L6.5,8.8 L5,9.5 L5,7.5 L3.2,6.8 L4.2,5.2 L2.8,4.2 L4,2.8 L5.8,3.2 Z M6.5,5.2 A1.3,1.3 0 1,0 6.5,7.8 A1.3,1.3 0 1,0 6.5,5.2",
      lineWidth: 1,
    },
  },
  {
    ...BASE,
    id: INDICATOR_FEATURE.close,
    content: {
      style: "stroke",
      path: "M3,3 L10,10 M10,3 L3,10",
      lineWidth: 1.25,
    },
  },
];
