import { useEffect, useState } from "react";
import {
  INDICATOR_META,
  parseParamSlots,
  type BuiltinIndicatorId,
  type IndicatorConfig,
} from "../lib/indicators";
import Dialog from "./ui/Dialog";

type Props = {
  config: IndicatorConfig | null;
  onClose: () => void;
  onSave: (id: BuiltinIndicatorId, calcParams: number[]) => void;
};

export default function IndicatorSettingsDialog({
  config,
  onClose,
  onSave,
}: Props) {
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    const meta = INDICATOR_META[config.id];
    const next = meta.paramLabels.map((_, i) =>
      config.calcParams[i] != null ? String(config.calcParams[i]) : "",
    );
    setSlots(next);
    setError(null);
  }, [config]);

  if (!config) return null;

  const meta = INDICATOR_META[config.id];

  function confirm() {
    const parsed = parseParamSlots(slots, meta);
    if (!parsed) {
      setError(
        meta.paramMode === "variable"
          ? `Enter ${meta.minParams}–${meta.maxParams} positive values`
          : "Fill all fields with valid values",
      );
      return;
    }
    onSave(config!.id, parsed);
    onClose();
  }

  return (
    <Dialog
      open
      title={meta.label}
      onClose={onClose}
      onConfirm={confirm}
      confirmLabel="Confirm"
    >
      {meta.paramLabels.map((label, i) => (
        <label key={label} className="dialog-field">
          <span className="dialog-field-label">{label}</span>
          <input
            type="text"
            inputMode="decimal"
            value={slots[i] ?? ""}
            placeholder={
              meta.paramMode === "variable" && i >= meta.minParams
                ? "optional"
                : undefined
            }
            aria-label={label}
            onChange={(e) => {
              const v = e.target.value;
              setSlots((prev) => {
                const next = [...prev];
                next[i] = v;
                return next;
              });
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirm();
              }
            }}
          />
        </label>
      ))}
      {error && <div className="dialog-error">{error}</div>}
    </Dialog>
  );
}
