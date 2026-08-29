import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDanger?: boolean;
  children: ReactNode;
  footerExtra?: ReactNode;
};

export default function Dialog({
  open,
  title,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDanger = false,
  children,
  footerExtra,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('input,button,select')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 className="dialog-title">{title}</h2>
          <button type="button" className="dialog-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        <footer className="dialog-footer">
          {footerExtra}
          <div className="dialog-footer-actions">
            <button type="button" className="dialog-btn" onClick={onClose}>
              {cancelLabel}
            </button>
            {onConfirm && (
              <button
                type="button"
                className={confirmDanger ? 'dialog-btn danger-fill' : 'dialog-btn primary'}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
