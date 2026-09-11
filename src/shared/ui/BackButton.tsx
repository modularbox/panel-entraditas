import { useNavigate } from "react-router-dom";
import { getPreviousPanelVisit } from "./panelHistory";

interface BackButtonProps {
  /** Ruta de la sección a la que volver si no hay historial interno del panel (p.ej. /eventos). */
  fallback?: string;
}

/** "Volver" vuelve a la vista anterior dentro del panel (nunca al login ni fuera de la app). */
export function BackButton({ fallback }: BackButtonProps) {
  const navigate = useNavigate();
  const handleClick = () => {
    const previous = getPreviousPanelVisit();
    // El historial del navegador no sirve: contiene /login (de cuando se entró) y,
    // si el panel se abre en deep link, páginas externas o de auth.
    if (previous) {
      navigate(previous);
      return;
    }
    if (fallback) {
      navigate(fallback);
      return;
    }
    navigate(-1);
  };
  return (
    <button type="button" className="shrink-0 text-sm font-semibold text-primary hover:underline" onClick={handleClick}>
      ← Volver
    </button>
  );
}