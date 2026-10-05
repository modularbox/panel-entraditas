import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { ConfirmModal } from "./ConfirmModal";

/** Si el que llama no dice que va a pasar, al menos se pregunta antes de hacerlo. */
const AVISO_POR_DEFECTO = "¿Está seguro de la acción que va a realizar?";

interface AccionConConfirmacionProps {
  etiqueta: string;
  confirmar?: string;
  /** Lo que va a pasar, dicho antes de que nadie pulse. Es el mensaje del modal. */
  aviso?: ReactNode;
  accion: () => Promise<void>;
  trabajando?: string;
  peligro?: boolean;
  compacto?: boolean;
  disabled?: boolean;
}

export function AccionConConfirmacion({
  etiqueta,
  confirmar = "Aceptar",
  aviso,
  accion,
  trabajando = "Un momento...",
  peligro = true,
  compacto = true,
  disabled = false
}: AccionConConfirmacionProps) {
  const [abierta, setAbierta] = useState(false);
  const tamano = `shrink-0 whitespace-nowrap ${compacto ? "h-8 px-3 text-xs" : ""}`;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={tamano}
        disabled={disabled}
        onClick={() => setAbierta(true)}
      >
        {etiqueta}
      </Button>
      <ConfirmModal
        open={abierta}
        onOpenChange={setAbierta}
        title="Confirmar acción"
        message={aviso ?? AVISO_POR_DEFECTO}
        confirmLabel={confirmar}
        danger={peligro}
        working={trabajando}
        onConfirm={accion}
      />
    </>
  );
}