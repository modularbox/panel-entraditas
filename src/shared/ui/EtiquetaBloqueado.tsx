/** "Bloqueado", al lado del nombre: no entra ni compra (cliente) o no entra ni vende (organización). */
export function EtiquetaBloqueado({ femenino = false }: { femenino?: boolean }) {
  return (
    <span className="whitespace-nowrap rounded border-2 border-destructive px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-destructive">
      {femenino ? "Bloqueada" : "Bloqueado"}
    </span>
  );
}
