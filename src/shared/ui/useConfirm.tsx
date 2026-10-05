import { createContext, useContext, useState, type ReactNode } from "react";
import { ConfirmModal } from "./ConfirmModal";

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  working?: string;
  onConfirm?: () => Promise<void> | void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  };

  const handleConfirm = async () => {
    if (options.onConfirm) await options.onConfirm();
    resolver?.(true);
  };

  const handleCancel = () => {
    setOpen(false);
    resolver?.(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmModal
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resolver?.(false);
        }}
        title={options.title}
        message={options.message ?? "¿Está seguro de la acción que va a realizar?"}
        confirmLabel={options.confirmLabel}
        cancelLabel={options.cancelLabel}
        danger={options.danger}
        working={options.working}
        onConfirm={handleConfirm}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
