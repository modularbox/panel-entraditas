import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { ConfirmModal } from "./ConfirmModal";

interface AccionConConfirmacionProps {
  etiqueta: string;
  confirmar?: string;
  aviso?: ReactNode;
  accion: () => Promise<void>;
  trabajando?: string;
  peligro?: boolean;
  compacto?: boolean;
  disabled?: boolean;
  mensajeModal?: string;
}

export function AccionConConfirmacion({
  etiqueta,
  confirmar = "Aceptar",
  aviso,
  accion,
  trabajando = "Un momento...",
  peligro = true,
  compacto = true,
  disabled = false,
  mensajeModal = "¿Está seguro de la acción que va a realizar?"
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
        message={mensajeModal}
        confirmLabel={confirmar}
        danger={peligro}
        working={trabajando}
        onConfirm={accion}
      />
    </>
  );
}