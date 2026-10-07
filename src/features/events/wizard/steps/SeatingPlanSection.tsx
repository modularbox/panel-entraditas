import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapacityPool, Event, Gate, SubEvent, TemplateZone, TicketType, Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/useConfirm";
import { zoneTicketTypeGroupId } from "@/shared/lib/zoneTicketType";
import { useWizardStore } from "../wizardStore";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { useZonesQuery } from "./useZonesQuery";
import { defaultZoneLayout, type ZoneLayout } from "./zoneGeometry";
import { ZoneCanvas } from "./ZoneCanvas";
import { ZoneEditorPanel } from "./ZoneEditorPanel";
import { ZoneListEditor } from "./ZoneListEditor";
import { ZoneSeatEditor } from "./ZoneSeatEditor";
import { SeatRowsEditor, type PlanPatch } from "./SeatRowsEditor";
import { PlanTemplates } from "./PlanTemplates";
import type { GuardadoSeccion } from "./Step1BasicInfo";
import { SeatingModeChooser } from "./SeatingModeChooser";
import { TicketTypeAssignment, type ZoneAssignment } from "./TicketTypeAssignment";
import { groupTicketTypes } from "./Step4TicketTypes";
import { useSyncEventChangesToWeb } from "@/features/publish/useSyncEventChangesToWeb";
import {
  buildSeatGrid,
  countAssignedByGroup,
  countUnassigned,
  fromSeatAssignmentList,
  pruneAssignments,
  remapById,
  rowOriginForStage,
  toSeatAssignmentList,
  type Seat,
  type SeatAssignments
} from "./seatMap";

export interface SeatingPlanSectionProps {
  eventId: string | null;
  onValidationChange?: (valid: boolean) => void;
  registrarGuardado?: (guardar: () => Promise<GuardadoSeccion>) => () => void;
}

const SELLABLE_KINDS: Zone["kind"][] = ["numbered", "standing"];
const ZONE_KIND_NAMES: Record<Zone["kind"], string> = {
  numbered: "Nueva zona numerada",
  standing: "Nueva zona de pie",
  stage: "Escenario",
  accessible: "Movilidad reducida",
  gate: "Puerta"
};

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useCapacityPoolsQuery(subEventId: string | undefined) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["capacity-pools", subEventId],
    queryFn: () => apiClient.get<CapacityPool[]>(`/sub-events/${subEventId}/capacity`, { token: token! }),
    enabled: Boolean(subEventId && token)
  });
}

function useTicketTypesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: () => apiClient.get<TicketType[]>(`/events/${eventId}/ticket-types`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useGatesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["gates", eventId],
    queryFn: () => apiClient.get<Gate[]>(`/events/${eventId}/gates`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

export function SeatingPlanSection({ eventId, onValidationChange, registrarGuardado }: SeatingPlanSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { data: event } = useEventQuery(eventId);
  const venueId = event?.venueId ?? null;
  const { data: zones = [] } = useZonesQuery(venueId);
  const { data: subEvents = [], isSuccess: subEventsLoaded } = useSubEventsQuery(eventId);
  const firstSubEvent = subEvents[0];
  const { data: pools = [], isFetching: poolsFetching } = useCapacityPoolsQuery(firstSubEvent?.id);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const { data: gates = [] } = useGatesQuery(eventId);
  const syncEventChanges = useSyncEventChangesToWeb(eventId);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Un evento creado sin mapa no tiene recinto: para dibujar el plano hace falta uno, y aqui se
  // crea y se vincula al evento antes de entrar al editor.
  const [recintoNombre, setRecintoNombre] = useState("");
  const [recintoCiudad, setRecintoCiudad] = useState("");
  const [recintoAforo, setRecintoAforo] = useState(100);
  const [creandoRecinto, setCreandoRecinto] = useState(false);
  const [recintoError, setRecintoError] = useState<string | null>(null);
  // Drawing surface size. A working preference, kept in the wizard's store (and in localStorage)
  // rather than in this component: as component state it was lost every time the step unmounted,
  // so going to the next step and back reset the canvas.
  const canvasHeight = useWizardStore((s) => s.canvasHeight);
  const canvasWidth = useWizardStore((s) => s.canvasWidth);
  const setCanvasSize = useWizardStore((s) => s.setCanvasSize);
  const creatingSessionRef = useRef(false);
  const creandoPoolsRef = useRef(false);

  /**
   * Las filas y el reparto de asientos se editan a toquecitos (una fila, una butaca), y guardar
   * cada toque como una peticion propia hacia que el editor esperase a la red en cada click:
   * vuelta al servidor por butaca mas el refetch de despues, asi que escribir el nombre de una
   * fila o pulsar botones en un patio de cincuenta filas iba a rastras.
   *
   * Los cambios de filas/asientos, por tanto, se aplican primero a la caché de react-query (el
   * editor reacciona en el siguiente render) y dejan la escritura en la API para cuando el editor
   * se tranquiliza: un unico timer agrupa todo lo tocado en la ventana, con un PATCH por zona
   * tocada, uno por pool tocado y un solo refetch final. Al desmontar el paso (salir de el o
   * publicar) cualquier cambio pendiente se fuerza antes de que se deshagan las consultas.
   */
  type ZonaPendiente = {
    id: string;
    patch: Partial<Pick<Zone, "name" | "capacity" | "rows" | "rowSeats" | "seatRows" | "rowNaming" | "seatNaming">>;
  };
  const GUARDADO_EN_COLA_MS = 350;
  const zonaPendienteRef = useRef<Record<string, ZonaPendiente>>({});
  const poolPendienteRef = useRef<Record<string, Record<string, unknown>>>({});
  const timerGuardadoRef = useRef<number | null>(null);
  const flushRef = useRef<() => void>(() => {});

  function actualizarZonaEnCache(id: string, patch: ZonaPendiente["patch"]) {
    queryClient.setQueryData<Zone[]>(["zones", venueId], (prev) =>
      prev ? prev.map((z) => (z.id === id ? { ...z, ...patch } : z)) : prev
    );
  }

  function encolarPool(poolId: string, patch: Record<string, unknown>) {
    poolPendienteRef.current[poolId] = { ...poolPendienteRef.current[poolId], ...patch };
    queryClient.setQueryData<CapacityPool[]>(["capacity-pools", firstSubEvent?.id], (prev) =>
      prev ? prev.map((p) => (p.id === poolId ? { ...p, ...patch } : p)) : prev
    );
  }

  function programarGuardado() {
    if (timerGuardadoRef.current !== null) window.clearTimeout(timerGuardadoRef.current);
    timerGuardadoRef.current = window.setTimeout(() => {
      timerGuardadoRef.current = null;
      void flushRef.current();
    }, GUARDADO_EN_COLA_MS);
  }

  async function flushPendientes() {
    const zonas = zonaPendienteRef.current;
    const pools = poolPendienteRef.current;
    zonaPendienteRef.current = {};
    poolPendienteRef.current = {};
    if (Object.keys(zonas).length === 0 && Object.keys(pools).length === 0) return;
    if (!token) return;
    setError(null);
    try {
      for (const zona of Object.values(zonas)) {
        await apiClient.patch(`/zones/${zona.id}`, zona.patch, { token });
        // La capacidad del pool se sincroniza al editar; si el pool no estaba todavia en la
        // cache en ese momento (el efecto automatico lo acaba de crear), se corrige aqui
        // comparando con lo que se acaba de guardar en la zona.
        if (zona.patch.capacity !== undefined) {
          const pool = (
            queryClient.getQueryData<CapacityPool[]>(["capacity-pools", firstSubEvent?.id]) ?? []
          ).find((p) => p.zoneId === zona.id);
          if (pool && pool.totalCapacity !== zona.patch.capacity) {
            await apiClient.patch(`/capacity-pools/${pool.id}`, { totalCapacity: zona.patch.capacity }, { token });
          }
        }
      }
      for (const [poolId, patch] of Object.entries(pools)) {
        await apiClient.patch(`/capacity-pools/${poolId}`, patch, { token });
      }
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
      void syncEventChanges();
    }
  }
  flushRef.current = flushPendientes;

  // El "Guardar" del detalle fuerza el vaciado inmediato del rebote de 350 ms: sin esto, un cambio
  // recien hecho podria quedarse sin escribir si se pulsa justo despues de editar.
  useEffect(() => {
    if (!registrarGuardado) return;
    return registrarGuardado(async () => {
      await flushRef.current();
      return { ok: true };
    });
  }, [registrarGuardado]);

  // Al salir del paso, cualquier cambio que el rebote no haya escrito todavia se fuerza antes de
  // que el editor se desmonte, para no perder la ultima fila por navegar deprisa.
  useEffect(() => {
    return () => {
      if (timerGuardadoRef.current !== null) {
        window.clearTimeout(timerGuardadoRef.current);
        timerGuardadoRef.current = null;
      }
      if (Object.keys(zonaPendienteRef.current).length > 0 || Object.keys(poolPendienteRef.current).length > 0) {
        void flushRef.current();
      }
    };
  }, []);

  /**
   * An event with no session gets one, silently.
   *
   * Capacity hangs off a session, and the seat breakdown is stored on that capacity. A
   * single-session event never created one -- nothing in the panel does, outside the "Varias
   * funciones" step -- so on those events every seat action was written to a pool that did not
   * exist and nothing was saved: you picked seats, pressed OK, and nothing happened. A single
   * session *is* a session of one, so it is created here from the event's own date.
   */
  useEffect(() => {
    if (!eventId || !token || !event || !subEventsLoaded || subEvents.length > 0 || creatingSessionRef.current) return;
    creatingSessionRef.current = true;
    (async () => {
      try {
        await apiClient.post<SubEvent>(
          `/events/${eventId}/sub-events`,
          {
            name: event.hasSubEvents ? "Primera sesión" : "Sesión única",
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            doorsOpenAt: null,
            status: "scheduled",
            sortOrder: 0
          },
          { token }
        );
        await queryClient.invalidateQueries({ queryKey: ["sub-events", eventId] });
        void syncEventChanges();
      } catch (e) {
        creatingSessionRef.current = false;
        if (e instanceof AppError) setError(e.message);
      }
    })();
  }, [eventId, token, event, subEventsLoaded, subEvents.length, queryClient, syncEventChanges]);

  // The drawn plan is the source of truth: any sellable zone without a
  // matching capacity pool for this event's first function gets one
  // created automatically, with no manual "activate" step.
  //
  // It only runs once the pools query has actually settled (isFetching
  // false): zones re-render optimistically on every edit and the pool list
  // is briefly stale while a refetch is in flight, so without this gate a
  // burst of edits could each decide "this zone has no pool" and create a
  // stack of duplicate pools. creandoPoolsRef stops the same batch from
  // firing twice while its own creations are still loading.
  useEffect(() => {
    if (!firstSubEvent) return;
    if (poolsFetching || creandoPoolsRef.current) return;
    const missing = zones.filter((z) => SELLABLE_KINDS.includes(z.kind) && !pools.some((p) => p.zoneId === z.id));
    if (missing.length === 0) return;
    creandoPoolsRef.current = true;
    (async () => {
      try {
        for (const zone of missing) {
          await apiClient.post(
            `/sub-events/${firstSubEvent.id}/capacity-pools`,
            { name: zone.name, zoneId: zone.id, totalCapacity: zone.capacity },
            { token: token! }
          );
        }
      } finally {
        creandoPoolsRef.current = false;
      }
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent.id] });
      void syncEventChanges();
    })();
  }, [zones, pools, poolsFetching, firstSubEvent, token, queryClient, syncEventChanges]);

  // Prellena el formulario de creacion de recinto con lo que ya dice el evento; solo la primera
  // vez, para no pisar lo que la persona vaya corrigiendo.
  useEffect(() => {
    if (!event) return;
    setRecintoNombre((valor) => valor || (event.location ?? ""));
    setRecintoCiudad((valor) => valor || (event.locality ?? ""));
  }, [event]);

  /**
   * Crea el recinto del evento y lo vincula a el.
   *
   * Un evento puede haberse creado "sin mapa": el paso de asientos exige un recinto porque las
   * zonas cuelgan de el, y sin recinto el plano no tenia salida. La API ya sabe crear recintos
   * (POST /venues) y colgarlos del evento (PATCH events con venueId), asi que aqui se juntan las
   * dos cosas y se vuelve al editor con el recinto asignado.
   */
  async function crearRecinto() {
    if (!event || !token) return;
    const nombre = recintoNombre.trim() || event.location?.trim() || "Recinto";
    const ciudad = recintoCiudad.trim() || event.locality?.trim() || "";
    const aforo = Math.max(1, Math.floor(Number(recintoAforo) || 1));

    const adelante = await confirmar({
      title: "Crear el recinto",
      message: `Se crea "${nombre}"${ciudad ? ` en ${ciudad}` : ""} con aforo ${aforo} y se cuelga del evento. El evento no tiene hoy ninguno, y las zonas se guardan dentro.`,
      confirmLabel: "Sí, crear recinto",
      working: "Creando..."
    });
    if (!adelante) return;

    setCreandoRecinto(true);
    setRecintoError(null);
    try {
      const recinto = await apiClient.post<{ id: string }>(
        "/venues",
        { organizationId: event.organizationId ?? undefined, name: nombre, city: ciudad, totalCapacity: aforo },
        { token }
      );
      await apiClient.patch(`/events/${eventId}`, { venueId: recinto.id }, { token });
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      void syncEventChanges();
    } catch (e) {
      if (e instanceof AppError) setRecintoError(e.message);
    } finally {
      setCreandoRecinto(false);
    }
  }

  async function addZone(kind: Zone["kind"]) {
    if (!venueId) return;
    const adelante = await confirmar({
      title: "Añadir una zona",
      message: `Se crea la zona "${ZONE_KIND_NAMES[kind]}" dentro del recinto. Empieza vacía, sin repartir ningún asiento, y la editas a continuación.`,
      confirmLabel: "Sí, añadir",
      working: "Creando..."
    });
    if (!adelante) return;
    setError(null);
    const layout: ZoneLayout = defaultZoneLayout(kind, zones);
    try {
      const created = await apiClient.post<Zone>(
        `/venues/${venueId}/zones`,
        { name: ZONE_KIND_NAMES[kind], kind, capacity: 0, ...layout },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      void syncEventChanges();
      setSelectedZoneId(created.id);
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  /**
   * Copies a zone's shape next to itself. The seat breakdown is deliberately NOT copied: the new
   * zone starts with every seat free, because two blocks of the room almost never sell the same
   * mix and silently duplicating an allocation would double-spend the ticket types' stock.
   */
  async function duplicateZone(id: string) {
    if (!venueId) return;
    setError(null);
    const zone = zones.find((candidate) => candidate.id === id);
    if (!zone) return;

    // En sentido inverso si es facil de deshacer: se anade una copia, no se toca la original.
    const adelante = await confirmar({
      title: "Duplicar la zona",
      message: `Se crea otra zona al lado llamada "${zone.name} (copia)" con la misma forma y aforo. La original no cambia, y los asientos de la copia empiezan todos libres (no se reparte el reparto de la original, para no gastar dos veces el mismo stock).`,
      confirmLabel: "Sí, duplicar",
      working: "Duplicando..."
    });
    if (!adelante) return;

    const { id: _id, venueId: _venueId, name, x, y, ...rest } = zone;
    try {
      const created = await apiClient.post<Zone>(
        `/venues/${venueId}/zones`,
        {
          ...rest,
          name: `${name} (copia)`,
          x: Math.min(x + 5, Math.max(0, 100 - zone.width)),
          y: Math.min(y + 5, Math.max(0, 100 - zone.height))
        },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      void syncEventChanges();
      setSelectedZoneId(created.id);
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  /**
   * Cambia la forma o la numeracion de una zona numerada sin perder lo repartido.
   *
   * El identificador de una butaca es su nombre ("A-7"), que es lo que hace que el panel y la web
   * hablen de la misma butaca. El precio de eso es que renombrar una fila, empezar a numerar en
   * otro sitio o pasar la zona entera de letras a numeros cambia TODOS los identificadores, y los
   * tipos de entrada colgados de ellos se irian al suelo sin decir nada. Aqui se emparejan por el
   * sitio que ocupan, que no cambia, y se vuelven a colgar de su butaca.
   */
  async function updatePlan(zone: Zone, patch: PlanPatch) {
    const antes = buildSeatGrid({ ...zone, rowAOrigin: rowOriginForStage(zone, stage) });
    const siguiente: Zone = { ...zone, ...patch };
    const despues = buildSeatGrid({ ...siguiente, rowAOrigin: rowOriginForStage(siguiente, stage) });

    const pool = pools.find((p) => p.zoneId === zone.id);
    const asignaciones = pruneAssignments(fromSeatAssignmentList(pool?.seatAssignments), antes);
    const movidas = remapById(antes, despues, asignaciones);
    const accesibles = remapById(antes, despues, pool?.accessibleSeatIds ?? []);

    // Las filas mandan sobre lo que hubiera antes: la capacidad sale de ellas, y los dos formatos
    // viejos se retiran para que no queden dos descripciones de la misma sala.
    await updateZone(
      zone.id,
      {
        ...patch,
        capacity: despues.length,
        ...(patch.seatRows ? { rowSeats: null, rows: null } : {})
      },
      { defer: true }
    );
    if (pool) {
      await patchPool(
        zone.id,
        {
          seatAssignments: toSeatAssignmentList(movidas),
          accessibleSeatIds: accesibles
        },
        { defer: true }
      );
    }
  }

  async function updateZone(
    id: string,
    patch: Partial<
      Pick<
        Zone,
        | "name"
        | "capacity"
        | "rows"
        | "rowSeats"
        | "seatRows"
        | "rowNaming"
        | "seatNaming"
        | "x"
        | "y"
        | "width"
        | "height"
      >
    >,
    opts?: { defer?: boolean }
  ) {
    setError(null);
    // Los cambios frecuentes (filas, asientos) no esperan a la red: se reflejan en la caché al
    // momento y la escritura se agrupa. Lo puntual (un nombre al salir de la casilla, un arrastre
    // terminado) sigue guardandose al momento, como siempre.
    if (opts?.defer) {
      actualizarZonaEnCache(id, patch);
      zonaPendienteRef.current[id] = {
        id,
        patch: { ...zonaPendienteRef.current[id]?.patch, ...patch }
      };
      if (patch.capacity !== undefined) {
        const pool = pools.find((p) => p.zoneId === id);
        if (pool) encolarPool(pool.id, { totalCapacity: patch.capacity });
      }
      programarGuardado();
      return;
    }
    try {
      await apiClient.patch(`/zones/${id}`, patch, { token: token! });
      // Zone capacity and its capacity pool's totalCapacity are two separate records
      // that must be kept in lockstep whenever the zone's capacity changes.
      if (patch.capacity !== undefined) {
        const pool = pools.find((p) => p.zoneId === id);
        if (pool) {
          await apiClient.patch(`/capacity-pools/${pool.id}`, { totalCapacity: patch.capacity }, { token: token! });
          await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      void syncEventChanges();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteZone(id: string) {
    const zona = zones.find((z) => z.id === id);
    const nombre = zona?.name ?? "esta zona";
    const puestos = zona ? `${zona.capacity} asientos` : "";
    const puerta = gates.some((g) => g.zoneId === id)
      ? " La puerta que tenias asignada a esta zona se queda sin zona y hay que volver a elegirla."
      : "";

    const adelante = await confirmar({
      title: "Eliminar la zona",
      message: `Se elimina "${nombre}"${puestos ? ` (${puestos})` : ""} del plano y desaparece de entraditas.com.${puerta} Las entradas ya compradas de esta zona se conservan. No se puede deshacer desde aqui.`,
      confirmLabel: "Sí, eliminar",
      danger: true,
      working: "Eliminando..."
    });
    if (!adelante) return;

    setError(null);
    try {
      await apiClient.delete(`/zones/${id}`, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      void syncEventChanges();
      if (selectedZoneId === id) setSelectedZoneId(null);
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  /** Asigna la puerta del evento a una zona (una puerta solo puede servir a una zona). */
  async function assignGate(zoneId: string, gateId: string | null) {
    const zona = zones.find((candidate) => candidate.id === zoneId);
    const actuales = gates.filter((gate) => gate.zoneId === zoneId);
    const elegida = gateId ? gates.find((gate) => gate.id === gateId) : undefined;

    const adelante = await confirmar({
      title: gateId === null ? "Quitar la puerta" : "Cambiar la puerta",
      message:
        gateId === null
          ? `Se desvincula ${actuales.length === 1 ? "la puerta" : "las puertas"} de "${zona?.name ?? "esta zona"}". No deja de existir: queda sin zona y la puedes volver a asignar.`
          : elegida && elegida.zoneId && elegida.zoneId !== zoneId
            ? `La puerta "${elegida.name}" pasa a "${zona?.name ?? "esta zona"}". Si hoy servía a otra zona, esa se queda sin puerta.`
            : `Se asocia la puerta "${elegida?.name ?? ""}" a "${zona?.name ?? "esta zona"}".`,
      confirmLabel: gateId === null ? "Sí, quitar" : "Sí, cambiar",
      danger: gateId !== null && Boolean(elegida?.zoneId && elegida.zoneId !== zoneId),
      working: "Guardando..."
    });
    if (!adelante) return;

    setError(null);
    try {
      if (gateId === null) {
        for (const gate of actuales) {
          await apiClient.patch(`/gates/${gate.id}`, { zoneId: null }, { token: token! });
        }
      } else {
        if (elegida && elegida.zoneId !== zoneId) {
          for (const gate of actuales) {
            if (gate.id !== gateId) {
              await apiClient.patch(`/gates/${gate.id}`, { zoneId: null }, { token: token! });
            }
          }
          await apiClient.patch(`/gates/${gateId}`, { zoneId }, { token: token! });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
      void syncEventChanges();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function assignTicketType(zoneId: string, groupId: string | null) {
    const zone = zones.find((z) => z.id === zoneId);
    const pool = pools.find((p) => p.zoneId === zoneId);
    if (!zone || !pool) return;

    // Cambiar de grupo cambia con que tipo de entrada se vende la zona, y por tanto el stock que
    // consume: las entradas ya vendidas no se tocan, pero el reparto de aforo pasa a ser otro.
    const adelante = await confirmar({
      title: "Cambiar el tipo de entrada",
      message: groupId
        ? `La zona "${zone.name}" pasa a venderse con otro tipo de entrada. Su aforo (${zone.capacity}) queda repartido bajo ese grupo.`
        : `Se quita el tipo de entrada de "${zone.name}": la zona queda sin vender hasta que le asignes uno.`,
      confirmLabel: "Sí, cambiar",
      working: "Guardando..."
    });
    if (!adelante) return;

    setError(null);
    try {
      await apiClient.patch(
        `/capacity-pools/${pool.id}`,
        { totalCapacity: zone.capacity, ticketTypeGroupId: groupId },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
      await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
      void syncEventChanges();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function patchPool(zoneId: string, patch: Record<string, unknown>, opts?: { defer?: boolean }) {
    setError(null);
    const pool = pools.find((p) => p.zoneId === zoneId);
    // Capacity pools hang off the event's first session. Without one there is nothing to write
    // the breakdown to, and staying silent here made the whole assignment look broken.
    if (!pool) {
      setError(
        firstSubEvent
          ? "Todavía se está preparando el aforo de esta zona. Vuelve a intentarlo en un momento."
          : "Este evento no tiene ninguna fecha o sesión todavía, y el aforo cuelga de ella. Vuelve al paso de fechas, confirma una sesión y luego reparte los asientos."
      );
      return;
    }
    if (opts?.defer) {
      encolarPool(pool.id, patch);
      programarGuardado();
      return;
    }
    try {
      await apiClient.patch(`/capacity-pools/${pool.id}`, patch, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
      void syncEventChanges();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function saveSeatAssignments(zoneId: string, next: SeatAssignments) {
    await patchPool(zoneId, { seatAssignments: toSeatAssignmentList(next) }, { defer: true });
  }

  async function saveAccessibleSeats(zoneId: string, next: string[]) {
    await patchPool(zoneId, { accessibleSeatIds: next }, { defer: true });
  }

  async function setSeatingMode(mode: Event["seatingMode"]) {
    if (!event) return;
    // Mismo calculo que en el render: un evento con zonas pero sin la opcion guardada ya vive en
    // "plan", y cambiarlo ahi si que hay algo que dejar de usar.
    const anterior = event.seatingMode ?? (zones.length > 0 ? "plan" : null);
    if (anterior === mode) return;
    if (anterior !== null) {
      const adelante = await confirmar({
        title: "Cambiar la forma de crear las zonas",
        message: `Ahora mismo usas "${anterior === "plan" ? "plano con asientos" : "zonas sin plano"}", y al cambiar solo se guarda la que elijas ahora. Las zonas que ya existan no se borran solas.`,
        confirmLabel: "Sí, cambiar",
        danger: true,
        working: "Cambiando..."
      });
      if (!adelante) return;
    }

    setError(null);
    try {
      await apiClient.patch(`/events/${eventId}`, { seatingMode: mode }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      void syncEventChanges();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  /** Recreates a saved layout's zones in this venue. Additive: it never deletes what is there. */
  async function applyTemplate(templateZones: TemplateZone[]) {
    if (!venueId) return;
    for (const zone of templateZones) {
      await apiClient.post(`/venues/${venueId}/zones`, zone, { token: token! });
    }
    await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
    void syncEventChanges();
  }

  const groups = useMemo(() => groupTicketTypes(ticketTypes), [ticketTypes]);
  const sellableZones = useMemo(() => zones.filter((z) => SELLABLE_KINDS.includes(z.kind)), [zones]);
  const stage = useMemo(() => zones.find((zone) => zone.kind === "stage") ?? null, [zones]);

  // Seats are derived from each numbered zone's shape, and their ticket types come from the
  // pool's sparse breakdown. Assignments pointing at seats that no longer exist (after a
  // resize or a row-count change) are dropped so they stop consuming a ticket type's stock.
  const seatGrids = useMemo(() => {
    const grids: Record<string, Seat[]> = {};
    for (const zone of sellableZones) {
      if (zone.kind !== "numbered") continue;
      grids[zone.id] = buildSeatGrid({ ...zone, rowAOrigin: rowOriginForStage(zone, stage) });
    }
    return grids;
  }, [sellableZones, stage]);

  const seatAssignmentsByZone = useMemo(() => {
    const byZone: Record<string, SeatAssignments> = {};
    for (const zone of sellableZones) {
      const grid = seatGrids[zone.id];
      if (!grid) continue;
      const pool = pools.find((p) => p.zoneId === zone.id);
      byZone[zone.id] = pruneAssignments(fromSeatAssignmentList(pool?.seatAssignments), grid);
    }
    return byZone;
  }, [sellableZones, seatGrids, pools]);

  const accessibleSeatsByZone = useMemo(() => {
    const byZone: Record<string, string[]> = {};
    for (const pool of pools) {
      if (pool.zoneId && pool.accessibleSeatIds?.length) byZone[pool.zoneId] = pool.accessibleSeatIds;
    }
    return byZone;
  }, [pools]);

  const groupColors = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.groupId, group.color])),
    [groups]
  );

  // A zone's whole-zone ticket type. Older events stored that link the other way round (on the
  // ticket type's capacityPoolId); zoneTicketTypeGroupId resolves both, and publishing uses the
  // same function so the plan shown here and the one sent to entraditas.com always agree.
  const resolveZoneGroupId = useMemo(() => {
    return (pool: CapacityPool | undefined): string | null => zoneTicketTypeGroupId(pool, ticketTypes);
  }, [ticketTypes]);

  /** What each ticket type has taken across every zone: seats for numbered, whole capacity for standing. */
  const takenByGroup = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const zone of sellableZones) {
      const seatAssignments = seatAssignmentsByZone[zone.id];
      if (seatAssignments) {
        for (const [groupId, count] of Object.entries(countAssignedByGroup(seatAssignments))) {
          totals[groupId] = (totals[groupId] ?? 0) + count;
        }
        continue;
      }
      const pool = pools.find((p) => p.zoneId === zone.id);
      const groupId = resolveZoneGroupId(pool);
      if (groupId) totals[groupId] = (totals[groupId] ?? 0) + (pool?.totalCapacity ?? zone.capacity);
    }
    return totals;
  }, [sellableZones, seatAssignmentsByZone, pools, resolveZoneGroupId]);

  // Standing zones keep the whole-zone assignment; numbered zones are driven by their seats.
  const standingZones = sellableZones.filter((zone) => zone.kind === "standing");
  const numberedZones = sellableZones.filter((zone) => zone.kind === "numbered");

  const assignments: ZoneAssignment[] = standingZones.map((zone) => {
    const pool = pools.find((p) => p.zoneId === zone.id);
    const assignedGroupId = resolveZoneGroupId(pool);
    const assignedGroup = groups.find((group) => group.groupId === assignedGroupId);
    const assignedTotalForGroup = assignedGroupId ? takenByGroup[assignedGroupId] ?? 0 : 0;
    return {
      zone,
      assignedGroupId,
      assignedCapacity: pool?.totalCapacity ?? zone.capacity,
      groupLimit: assignedGroup?.quantityTotal ?? null,
      assignedTotalForGroup,
      isOverCapacity:
        assignedGroup?.quantityTotal !== null &&
        assignedGroup?.quantityTotal !== undefined &&
        assignedTotalForGroup > assignedGroup.quantityTotal
    };
  });

  const numberedStatuses = numberedZones.map((zone) => {
    const seats = seatGrids[zone.id] ?? [];
    const zoneAssignments = seatAssignmentsByZone[zone.id] ?? {};
    const unassigned = countUnassigned(seats, zoneAssignments);
    return { zone, seatCount: seats.length, unassigned, assigned: seats.length - unassigned };
  });

  // This step runs *before* ticket types exist in the wizard, so it can only require that every
  // sellable zone has capacity. Tying a seat to a ticket type is done once those exist, and an
  // over-allocation is still blocking because it means the numbers no longer add up.
  const isValid =
    !assignments.some((a) => a.isOverCapacity) && !numberedStatuses.some((status) => status.seatCount === 0);

  useEffect(() => {
    onValidationChange?.(isValid);
  }, [isValid, onValidationChange]);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const selectedSeats = selectedZone ? seatGrids[selectedZone.id] : undefined;

  if (!eventId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guarda la información del evento para poder dibujar el plano de asientos.
      </p>
    );
  }
  if (!event) return null;
  if (!venueId) {
    return (
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend>Recinto</legend>
          <p className="mt-1 mb-3 max-w-3xl text-sm text-muted-foreground">
            Para que los compradores elijan su butaca, este evento necesita un recinto donde dibujar
            el plano. Se crea aqui y se le asigna: luego podras elegir &quot;Con plano&quot; y dibujar
            las zonas y las filas de asientos.
          </p>
          {recintoError && <p role="alert">{recintoError}</p>}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label htmlFor="recinto-nombre">Nombre</label>
              <input
                id="recinto-nombre"
                value={recintoNombre}
                onChange={(e) => setRecintoNombre(e.target.value)}
                placeholder={event.location ?? "Ej: Palacio de Congresos"}
              />
            </div>
            <div>
              <label htmlFor="recinto-ciudad">Ciudad</label>
              <input
                id="recinto-ciudad"
                value={recintoCiudad}
                onChange={(e) => setRecintoCiudad(e.target.value)}
                placeholder={event.locality ?? "Ej: Madrid"}
              />
            </div>
            <div className="lg:col-span-3 lg:max-w-48">
              <label htmlFor="recinto-aforo">Aforo</label>
              <input
                id="recinto-aforo"
                type="number"
                min={1}
                value={recintoAforo}
                onChange={(e) => setRecintoAforo(Number(e.target.value))}
              />
              <span className="text-xs text-muted-foreground">
                El aforo se ajusta después al dibujar las filas.
              </span>
            </div>
          </div>
          <Button type="button" disabled={creandoRecinto} onClick={() => void crearRecinto()} className="mt-1">
            {creandoRecinto ? "Creando recinto…" : "Crear recinto y dibujar el plano"}
          </Button>
        </fieldset>
      </div>
    );
  }

  // An event drawn before this choice existed already has zones on a plan, so it keeps the plan
  // instead of being asked again. Only a genuinely empty event gets the chooser.
  const mode = event.seatingMode ?? (zones.length > 0 ? "plan" : null);

  if (mode === null) {
    return (
      <div className="flex flex-col gap-4">
        {error && <p role="alert">{error}</p>}
        <SeatingModeChooser mode={null} onChoose={(next) => void setSeatingMode(next)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}

      <SeatingModeChooser mode={mode} onChoose={(next) => void setSeatingMode(next)} />

      {!firstSubEvent && (
        <p role="alert" className="rounded-md border-2 border-destructive px-3 py-2 text-sm font-semibold">
          Este evento no tiene ninguna fecha o sesión todavía. El aforo cuelga de la sesión, así
          que puedes dibujar las zonas pero el reparto de asientos no se guardará hasta que
          confirmes una fecha en el paso anterior.
        </p>
      )}

      {mode === "plan" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold">Tamaño del plano</span>
            <label htmlFor="canvas-height" className="text-xs text-muted-foreground">
              Alto
            </label>
            <input
              id="canvas-height"
              type="range"
              min="280"
              max="900"
              step="20"
              value={canvasHeight}
              onChange={(e) => setCanvasSize({ height: Number(e.target.value) })}
            />
            <label htmlFor="canvas-width" className="text-xs text-muted-foreground">
              Ancho
            </label>
            <input
              id="canvas-width"
              type="range"
              min="40"
              max="100"
              step="5"
              value={canvasWidth}
              onChange={(e) => setCanvasSize({ width: Number(e.target.value) })}
            />
            <span className="text-xs text-muted-foreground">
              {canvasHeight} px de alto - {canvasWidth}% de ancho
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div style={{ width: `${canvasWidth}%` }}>
              <ZoneCanvas
                zones={zones}
                selectedZoneId={selectedZoneId}
                onSelectZone={setSelectedZoneId}
                onZoneCommitted={(id, layout) => updateZone(id, layout)}
                seatAssignmentsByZone={seatAssignmentsByZone}
                groupColors={groupColors}
                accessibleSeatsByZone={accessibleSeatsByZone}
                heightPx={canvasHeight}
              />
            </div>
            <ZoneEditorPanel
              zones={zones}
              selectedZoneId={selectedZoneId}
              onAddZone={addZone}
              onUpdateZone={updateZone}
              onDeleteZone={deleteZone}
              onDuplicateZone={(id) => void duplicateZone(id)}
              gates={gates}
              onAssignGate={(zoneId, gateId) => void assignGate(zoneId, gateId)}
            />
          </div>
        </>
      ) : (
        <ZoneListEditor
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
          onAddZone={addZone}
          onUpdateZone={updateZone}
          onDeleteZone={deleteZone}
        />
      )}

      {/* Templates work for both modes: a set of zones is reusable whether or not it is drawn. */}
      <PlanTemplates zones={zones} mode={mode} onApply={applyTemplate} />

      {selectedZone && selectedZone.kind === "numbered" && (
        <SeatRowsEditor
          zone={selectedZone}
          rowAOrigin={rowOriginForStage(selectedZone, stage)}
          onChange={(patch) => void updatePlan(selectedZone, patch)}
        />
      )}

      {selectedZone && selectedZone.kind === "numbered" && (selectedSeats?.length ?? 0) === 0 && (
        <p className="rounded-md border-2 border-border bg-surface p-3 text-sm text-muted-foreground">
          "{selectedZone.name}" todavía no tiene ninguna butaca. Crea sus filas arriba para poder
          repartirlas por tipo de entrada.
        </p>
      )}

      {/* El fallo al guardar se repite aqui: el de arriba queda fuera de pantalla en un plano largo. */}
      {error && selectedZone?.kind === "numbered" && (
        <p role="alert" className="rounded-md border-2 border-destructive px-3 py-2 text-sm font-semibold">
          {error}
        </p>
      )}

      {selectedZone && selectedZone.kind === "numbered" && selectedSeats && selectedSeats.length > 0 && (
        <ZoneSeatEditor
          zone={selectedZone}
          seats={selectedSeats}
          assignments={seatAssignmentsByZone[selectedZone.id] ?? {}}
          groups={groups}
          // The stock a ticket type has left is shared with every other zone, so this zone's
          // own seats are excluded from the "already taken" figure it is capped against.
          assignedElsewhereByGroup={Object.fromEntries(
            groups.map((group) => {
              const here = countAssignedByGroup(seatAssignmentsByZone[selectedZone.id] ?? {})[group.groupId] ?? 0;
              return [group.groupId, (takenByGroup[group.groupId] ?? 0) - here];
            })
          )}
          onChange={(next) => void saveSeatAssignments(selectedZone.id, next)}
          accessibleSeatIds={pools.find((p) => p.zoneId === selectedZone.id)?.accessibleSeatIds ?? []}
          onAccessibleChange={(next) => void saveAccessibleSeats(selectedZone.id, next)}
        />
      )}

      {numberedStatuses.length > 0 && (
        <ul aria-label="Resumen de zonas numeradas" className="flex flex-col gap-1">
          {numberedStatuses.map(({ zone, seatCount, assigned, unassigned }) => (
            <li key={zone.id} className="text-sm">
              <span className="font-semibold">{zone.name}:</span>{" "}
              {seatCount === 0 ? (
                <span role="alert" className="font-semibold text-destructive">
                  indica cuántas plazas tiene esta zona.
                </span>
              ) : assigned === 0 ? (
                <span role="alert" className="font-semibold text-destructive">
                  {seatCount} asientos sin ningun tipo de entrada asignado.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {assigned}/{seatCount} asientos asignados
                  {unassigned > 0 && ` - ${unassigned} sin asignar (se pueden dejar sin vender)`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {standingZones.length > 0 && (
        <TicketTypeAssignment assignments={assignments} groups={groups} onAssign={assignTicketType} />
      )}
    </div>
  );
}
