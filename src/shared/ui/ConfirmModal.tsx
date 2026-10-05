import { useState } from "react";
import { AppError } from "@/shared/lib/apiClient";
import { Button } from "./button";

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
  danger?: boolean;
  working?: string;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title = "Confirmar acción",
  message,
  confirmLabel = "Aceptar",
  cancelLabel = "Cancelar",
  onConfirm,
  danger = false,
  working = "Un momento..."
}: ConfirmModalProps) {
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleConfirm() {
    setEnCurso(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (causa) {
      setError(
        causa instanceof AppError || causa instanceof Error
          ? causa.message
          : "No se pudo realizar la acción. Vuelve a intentarlo."
      );
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onMouseDown={() => onOpenChange(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="flex w-full max-w-md flex-col rounded-lg border-2 border-foreground bg-surface shadow-flat"
      >
        <header className="border-b-2 border-foreground px-5 py-4">
          <h2 id="confirm-dialog-title" className="font-display text-lg font-semibold">
            {title}
          </h2>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">
          <p className="text-sm text-foreground">{message}</p>
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-foreground px-5 py-4">
          <Button type="button" variant="outline" disabled={enCurso} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={danger ? "destructive" : "default"} disabled={enCurso} onClick={() => void handleConfirm()}>
            {enCurso ? working : confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
