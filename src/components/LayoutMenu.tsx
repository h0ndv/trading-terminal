import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, LayoutTemplate, RotateCcw } from "lucide-react";
import {
  exportLayoutToFile,
  importLayoutFromFile,
  type AppSettings,
} from "../lib/settings";
import Dialog from "./ui/Dialog";

type Props = {
  getSettings: () => AppSettings;
  onImport: (settings: AppSettings) => void;
  onRestore: () => void;
};

export default function LayoutMenu({
  getSettings,
  onImport,
  onRestore,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<AppSettings | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onExport() {
    setOpen(false);
    try {
      const ok = await exportLayoutToFile(getSettings());
      if (ok) console.info("Layout exported");
    } catch (e) {
      console.error("export layout failed", e);
    }
  }

  async function onPickImport() {
    setOpen(false);
    setImportError(null);
    try {
      const result = await importLayoutFromFile();
      if (!result.ok) {
        if (result.reason === "invalid") {
          setImportError("Invalid or unsupported layout file.");
        }
        return;
      }
      setPendingImport(result.settings);
    } catch (e) {
      console.error("import layout failed", e);
      setImportError("Could not read layout file.");
    }
  }

  function onConfirmImport() {
    if (!pendingImport) return;
    onImport(pendingImport);
    setPendingImport(null);
  }

  function onConfirmRestore() {
    onRestore();
    setRestoreOpen(false);
  }

  return (
    <>
      <div className="layout-menu" ref={rootRef}>
        <button
          type="button"
          className={open ? "layout-menu-toggle active" : "layout-menu-toggle"}
          aria-label="Layout"
          aria-expanded={open}
          title="Layout"
          onClick={() => setOpen((v) => !v)}
        >
          <LayoutTemplate size={16} />
        </button>
        {open && (
          <div className="layout-menu-popover" role="menu" aria-label="Layout">
            <div className="layout-menu-title">Workspace layout</div>
            <button
              type="button"
              className="layout-menu-item"
              role="menuitem"
              onClick={() => void onExport()}
            >
              <Download size={14} />
              Export layout
            </button>
            <button
              type="button"
              className="layout-menu-item"
              role="menuitem"
              onClick={() => void onPickImport()}
            >
              <FolderOpen size={14} />
              Import layout
            </button>
            <button
              type="button"
              className="layout-menu-item danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setRestoreOpen(true);
              }}
            >
              <RotateCcw size={14} />
              Restore defaults
            </button>
          </div>
        )}
      </div>

      <Dialog
        open={pendingImport != null}
        title="Import layout?"
        onClose={() => setPendingImport(null)}
        onConfirm={onConfirmImport}
        confirmLabel="Import"
      >
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          This will replace your current workspace (symbol, timeframe,
          indicators, drawings, watchlist, and theme).
        </p>
      </Dialog>

      <Dialog
        open={importError != null}
        title="Import failed"
        onClose={() => setImportError(null)}
        confirmLabel="OK"
        onConfirm={() => setImportError(null)}
        cancelLabel="Close"
      >
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          {importError}
        </p>
      </Dialog>

      <Dialog
        open={restoreOpen}
        title="Restore defaults?"
        onClose={() => setRestoreOpen(false)}
        onConfirm={onConfirmRestore}
        confirmLabel="Restore"
        confirmDanger
      >
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          Reset workspace to factory defaults? Your current layout will be lost.
        </p>
      </Dialog>
    </>
  );
}
