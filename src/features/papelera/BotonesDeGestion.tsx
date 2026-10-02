import { useSessionStore } from "@/shared/auth/sessionStore";
import { AccionConConfirmacion } from "@/shared/ui/AccionConConfirmacion";
import { useAvisoGlobal } from "@/shared/ui/AvisoGlobal";
import { cambiarBloqueo, enviarAPapelera, useRefrescarTodo, VER_PAPELERA } from "./papelera";

/**
 * Los botones de eliminar y bloquear de cada pantalla (tanda 21), todos con su confirmacion.
 *
 * Quien puede (la API lo vuelve a comprobar, esto solo evita ensenar un boton que va a fallar):
 *  - eventos y ventas: superadmin y organizador;
 *  - clientes y organizaciones: solo el superadmin.
 *
 * `alEliminar` es para las fichas: despues de eliminar no hay ficha que ensenar y se vuelve a la
 * lista.
 */

function usePuedeGestionar(): { token: string | null; gestiona: boolean; superadmin: boolean } {
  const token = useSessionStore((s) => s.token);
  const rol = useSessionStore((s) => s.user?.role);
  return { token, gestiona: rol === "superadmin" || rol === "organizador", superadmin: rol === "superadmin" };
}

interface EliminarProps {
  compacto?: boolean;
  alEliminar?: () => void;
}

export function EliminarEvento({ id, titulo, compacto, alEliminar }: EliminarProps & { id: string; titulo: string }) {
  const { token, gestiona } = usePuedeGestionar();
  const refrescar = useRefrescarTodo();
  const avisar = useAvisoGlobal((s) => s.avisar);
  if (!gestiona || !token) return null;
  return (
    <AccionConConfirmacion
      etiqueta="Eliminar"
      confirmar="Sí, a la papelera"
      trabajando="Eliminando..."
      compacto={compacto}
      aviso="Va a la papelera: deja de verse en el panel y en entraditas.com, y sus ventas dejan de contar. Se puede restaurar desde la Papelera."
      accion={async () => {
        await enviarAPapelera("event", id, token);
        avisar(`"${titulo}" está en la papelera.`, VER_PAPELERA);
        alEliminar?.();
        await refrescar();
      }}
    />
  );
}

export function EliminarVenta({ id, numero, compacto, alEliminar }: EliminarProps & { id: string; numero: string }) {
  const { token, gestiona } = usePuedeGestionar();
  const refrescar = useRefrescarTodo();
  const avisar = useAvisoGlobal((s) => s.avisar);
  if (!gestiona || !token) return null;
  return (
    <AccionConConfirmacion
      etiqueta="Eliminar"
      confirmar="Sí, a la papelera"
      trabajando="Eliminando..."
      compacto={compacto}
      aviso="Va a la papelera: deja de contar en Ventas, en el dashboard y en la cuenta del comprador. Sus butacas siguen ocupadas hasta que la borres para siempre."
      accion={async () => {
        await enviarAPapelera("order", id, token);
        avisar(`La venta ${numero} está en la papelera.`, VER_PAPELERA);
        alEliminar?.();
        await refrescar();
      }}
    />
  );
}

interface GestionProps extends EliminarProps {
  nombre: string;
  /** "blocked"/"suspended" si ya esta bloqueado. */
  bloqueado: boolean;
}

export function GestionCliente({ email, nombre, bloqueado, compacto, alEliminar }: GestionProps & { email: string }) {
  const { token, superadmin } = usePuedeGestionar();
  const refrescar = useRefrescarTodo();
  const avisar = useAvisoGlobal((s) => s.avisar);
  if (!superadmin || !token) return null;
  return (
    <div className="flex flex-nowrap items-start gap-2">
      {bloqueado ? (
        <AccionConConfirmacion
          etiqueta="Desbloquear"
          confirmar="Sí, desbloquear"
          trabajando="Desbloqueando..."
          peligro={false}
          compacto={compacto}
          aviso="Vuelve a poder entrar en entraditas.com y a comprar."
          accion={async () => {
            await cambiarBloqueo("customer", email, false, token);
            avisar(`${nombre} ya puede volver a entrar y comprar.`);
            await refrescar();
          }}
        />
      ) : (
        <AccionConConfirmacion
          etiqueta="Bloquear"
          confirmar="Sí, bloquear"
          trabajando="Bloqueando..."
          compacto={compacto}
          aviso="No podrá entrar en entraditas.com ni comprar hasta que lo desbloquees. Se le cierra la sesión ahora mismo. No se borra nada."
          accion={async () => {
            await cambiarBloqueo("customer", email, true, token);
            avisar(`${nombre} está bloqueado: no puede entrar ni comprar.`);
            await refrescar();
          }}
        />
      )}
      <AccionConConfirmacion
        etiqueta="Eliminar"
        confirmar="Sí, a la papelera"
        trabajando="Eliminando..."
        compacto={compacto}
        aviso="Va a la papelera: su cuenta deja de funcionar y no sale en Clientes. Sus compras se quedan en Ventas. Se puede restaurar desde la Papelera."
        accion={async () => {
          await enviarAPapelera("customer", email, token);
          avisar(`${nombre} está en la papelera.`, VER_PAPELERA);
          alEliminar?.();
          await refrescar();
        }}
      />
    </div>
  );
}

export function GestionOrganizacion({ id, nombre, bloqueado, compacto, alEliminar }: GestionProps & { id: string }) {
  const { token, superadmin } = usePuedeGestionar();
  const refrescar = useRefrescarTodo();
  const avisar = useAvisoGlobal((s) => s.avisar);
  if (!superadmin || !token) return null;
  return (
    <div className="flex flex-nowrap items-start gap-2">
      {bloqueado ? (
        <AccionConConfirmacion
          etiqueta="Desbloquear"
          confirmar="Sí, desbloquear"
          trabajando="Desbloqueando..."
          peligro={false}
          compacto={compacto}
          aviso="Su equipo vuelve a entrar al panel y sus eventos publicados vuelven a venderse en entraditas.com."
          accion={async () => {
            await cambiarBloqueo("organization", id, false, token);
            avisar(`${nombre} está desbloqueada: vuelve a vender.`);
            await refrescar();
          }}
        />
      ) : (
        <AccionConConfirmacion
          etiqueta="Bloquear"
          confirmar="Sí, bloquear"
          trabajando="Bloqueando..."
          compacto={compacto}
          aviso="Su equipo no podrá entrar al panel y sus eventos dejan de venderse en entraditas.com hasta que la desbloquees. No se borra nada."
          accion={async () => {
            await cambiarBloqueo("organization", id, true, token);
            avisar(`${nombre} está bloqueada: ni entra al panel ni vende.`);
            await refrescar();
          }}
        />
      )}
      <AccionConConfirmacion
        etiqueta="Eliminar"
        confirmar="Sí, a la papelera"
        trabajando="Eliminando..."
        compacto={compacto}
        aviso="Va a la papelera con sus eventos y sus ventas: dejan de verse en el panel, en la web y en las cifras, y su equipo no puede entrar. Se puede restaurar desde la Papelera."
        accion={async () => {
          await enviarAPapelera("organization", id, token);
          avisar(`${nombre} está en la papelera, con sus eventos y sus ventas.`, VER_PAPELERA);
          alEliminar?.();
          await refrescar();
        }}
      />
    </div>
  );
}
