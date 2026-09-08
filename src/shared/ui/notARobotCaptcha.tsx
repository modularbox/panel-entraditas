import { useEffect, useRef, useState } from "react";
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";

interface NotARobotCaptchaProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

/**
 * CAPTCHA mock a lo "No soy un robot" (estilo reCAPTCHA).
 * Simula la verificacion con un breve spinner, pero NO realiza ninguna
 * comprobacion real: cualquier persona puede marcarlo. Solo evita que el
 * formulario se envie sin haberlo activado.
 */
export function NotARobotCaptcha({ checked, onChange, error }: NotARobotCaptchaProps) {
  const [verifying, setVerifying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function handleToggle() {
    if (checked) {
      onChange(false);
      return;
    }
    if (verifying) return;
    setVerifying(true);
    timer.current = window.setTimeout(() => {
      setVerifying(false);
      onChange(true);
    }, 900);
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium">Verificación</legend>
      <div
        className={cn(
          "flex items-center justify-between rounded-md border-2 border-foreground bg-surface px-4 py-3 shadow-flat",
          error && "border-destructive"
        )}
      >
        <label htmlFor="not-a-robot" className="flex cursor-pointer select-none items-center gap-3">
          <input
            id="not-a-robot"
            type="checkbox"
            checked={checked}
            onChange={handleToggle}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-background text-background transition-colors",
              checked && "bg-success text-background"
            )}
          >
            {verifying ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
            ) : (
              checked && <Icon name="check" size={18} />
            )}
          </span>
          <span className="text-sm font-bold">{checked ? "Verificado" : "No soy un robot"}</span>
        </label>

        <span
          aria-hidden="true"
          className="flex flex-col items-center gap-0.5 text-[10px] font-bold uppercase leading-none"
        >
          <Icon name="shield" size={16} />
          reCAPTCHA
        </span>
      </div>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </fieldset>
  );
}