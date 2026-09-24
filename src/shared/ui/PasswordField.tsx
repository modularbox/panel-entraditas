import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

/**
 * Una casilla de contraseña con el ojo para verla.
 *
 * El ojo, y no un "Mostrar"/"Ocultar" escrito: se repetía la misma función con dos aspectos
 * distintos según la pantalla, y el texto además desplazaba la casilla para hacerle sitio. El
 * icono es el mismo gesto que ya usa la web pública.
 */
function OjoIcono({ tachado }: { tachado: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {tachado && <path d="m4 20 16-16" />}
    </svg>
  );
}

export interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Cuánto tiempo se queda visible antes de volver a taparse. 0 la deja visible. */
  revealMs?: number;
}

/**
 * `forwardRef` no es opcional: react-hook-form registra la casilla pasándole una `ref`, y un
 * componente de función que no la reenvía la pierde en silencio. El formulario se queda sin leer
 * la contraseña y el inicio de sesión falla sin decir por qué.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { revealMs = 3000, className = "", id, ...props },
  ref
) {
  const generado = useId();
  const inputId = id ?? generado;
  const [visible, setVisible] = useState(false);

  function alternar() {
    setVisible((actual) => {
      const siguiente = !actual;
      // Se vuelve a tapar sola: una contraseña a la vista en un panel abierto en una taquilla es
      // justo lo que este botón intenta evitar.
      if (siguiente && revealMs > 0) window.setTimeout(() => setVisible(false), revealMs);
      return siguiente;
    });
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        id={inputId}
        type={visible ? "text" : "password"}
        className={`h-10 w-full rounded-md border-2 border-foreground bg-background px-3 pr-11 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={alternar}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <OjoIcono tachado={visible} />
      </button>
    </div>
  );
});
