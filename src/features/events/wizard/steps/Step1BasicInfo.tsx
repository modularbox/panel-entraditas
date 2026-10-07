import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { NumericInput } from "@/shared/ui/NumericInput";
import { borrarBorrador, describirGuardado, guardarBorrador, leerBorrador, type EventDraft } from "../eventDraft";
import { OptionButton, QuestionSection } from "./EventRulesQuestions";
import { CoverImageCropper } from "./CoverImageCropper";
import { step1Schema, type Step1FormValues } from "./step1Schema";
import { PREVIEW_CATEGORIES, PublicEventPreview, RichTextEditor } from "./publicEventPreview";
import { useConfirm } from "@/shared/ui/useConfirm";
import { useWizardStore } from "../wizardStore";
import { useSyncEventChangesToWeb } from "@/features/publish/useSyncEventChangesToWeb";
import { LIMITES } from "@/shared/lib/formLimits";
import { useOrganizationsQuery } from "@/features/organizations/list/useOrganizationsQuery";

/**
 * Que ha pasado, en cristiano.
 *
 * Antes cualquier fallo salia como "No se pudo guardar el evento": una sesion caducada, un
 * servidor caido y un campo mal decian exactamente lo mismo, asi que no habia nada que hacer con
 * el mensaje salvo volver a pulsar el boton a ver si sonaba la flauta.
 */
export function mensajeDeFallo(error: unknown): string {
  if (error instanceof AppError) {
    if (error.code === "UNAUTHENTICATED") {
      return "Se cerró la sesión mientras escribías. Lo que llevabas queda guardado aquí: vuelve a entrar y sigue.";
    }
    return error.message;
  }
  return "No se pudo guardar el evento. Lo que llevabas escrito queda guardado aquí como borrador.";
}

export interface GuardadoSeccion {
  ok: boolean;
  error?: string;
}

export interface Step1BasicInfoProps {
  eventId: string | null;
  onSaved: (id: string) => void;
  goNext?: () => void;
  /**
   * En el detalle del evento el "Guardar" vive fuera de esta seccion y desde ahi se dispara al
   * formulario. La seccion se registra y devuelve una funcion que la desregistra.
   */
  registrarGuardado?: (guardar: () => Promise<GuardadoSeccion>) => () => void;
  /** El detalle no pinta el boton propio: el "Guardar" esta al lado de las secciones. */
  ocultarBotonGuardar?: boolean;
}

function dateParts(value: string | null | undefined): { startDate: string; startTime: string } {
  if (!value) return { startDate: "", startTime: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { startDate: "", startTime: "" };
  return { startDate: date.toISOString().slice(0, 10), startTime: date.toISOString().slice(11, 16) };
}

function toIsoDate(date: string | undefined, time: string | undefined): string | null {
  if (!date || !time) return null;
  return `${date}T${time}:00.000Z`;
}

function fechaEnTitulo(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio!, mes! - 1, dia!).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

async function filesToDataUrls(files: FileList | null): Promise<string[]> {
  if (!files) return [];
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
}

export function Step1BasicInfo({ eventId, onSaved, goNext, registrarGuardado, ocultarBotonGuardar }: Step1BasicInfoProps) {
  const confirmar = useConfirm();
  const token = useSessionStore((s) => s.token);
  const draftRules = useWizardStore((s) => s.draftRules);
  const syncEventChanges = useSyncEventChangesToWeb(eventId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [coverMode, setCoverMode] = useState<"upload" | "url">("upload");
  // El superadmin no pertenece a ninguna organizacion: al crear un evento tiene que decir de cual
  // es. Sin esto el servidor contestaba "falta organizador" y no habia donde elegirlo (tanda 20).
  const esSuperadmin = useSessionStore((s) => s.user?.role === "superadmin");
  const eligeOrganizador = esSuperadmin && !eventId;
  const { data: organizaciones = [] } = useOrganizationsQuery();
  const [organizadorId, setOrganizadorId] = useState("");
  const { data: existingEvent, isError: hasLoadError } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<Step1FormValues>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      coverImageUrl: "",
      gallery: "",
      category: "concierto",
      title: "",
      startDate: "",
      startTime: "",
      datePending: true,
      notifyWhenDateConfirmed: true,
      location: "",
      locality: "",
      description: "",
      serviceFeeType: "none",
      serviceFeeValue: 0,
      cashbackPercent: 0,
      hasSubEvents: false,
      extraDates: []
    }
  });

  const values = watch();
  const activeCategory = PREVIEW_CATEGORIES.find((item) => item.id === values.category) ?? PREVIEW_CATEGORIES[0]!;
  const galleryImages = values.gallery
    ?.split("\n")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  // Lo que se estaba escribiendo y no llego a guardarse. Se recupera una sola vez por evento:
  // despues manda lo que haya en el formulario, que es lo que la persona esta viendo.
  const [borrador, setBorrador] = useState<EventDraft | null>(null);
  const recuperado = useRef<string | null>(null);
  const ultimoGuardado = useRef<string>("");

  useEffect(() => {
    const clave = eventId ?? "nuevo";
    if (recuperado.current === clave) return;
    recuperado.current = clave;
    const encontrado = leerBorrador(eventId);
    if (!encontrado) return;
    setBorrador(encontrado);
    reset(encontrado.valores as Step1FormValues);
  }, [eventId, reset]);

  /**
   * Se guarda segun se escribe, no al salir ni al fallar. Una sesion que se cae, una pestana que
   * se cierra sin querer o un fallo de red no avisan antes, y hasta que se pulsa "Guardar y
   * continuar" esto no existe en ningun sitio.
   */
  useEffect(() => {
    if (!isDirty) return;
    const serializado = JSON.stringify(values);
    const id = window.setTimeout(() => {
      if (serializado === ultimoGuardado.current) return;
      ultimoGuardado.current = serializado;
      guardarBorrador(eventId, JSON.parse(serializado) as Record<string, unknown>);
    }, 600);
    return () => window.clearTimeout(id);
  }, [values, isDirty, eventId]);

  function descartarBorrador() {
    borrarBorrador();
    setBorrador(null);
    ultimoGuardado.current = "";
    if (existingEvent) {
      const startsAt = dateParts(existingEvent.startsAt);
      const datePending = existingEvent.datePending ?? !existingEvent.startsAt;
      reset({
        coverImageUrl: existingEvent.coverImageUrl ?? "",
        gallery: existingEvent.gallery?.join("\n") ?? "",
        category: existingEvent.category,
        title: existingEvent.title,
        startDate: startsAt.startDate,
        startTime: startsAt.startTime,
        datePending,
        notifyWhenDateConfirmed: existingEvent.notifyWhenDateConfirmed ?? datePending,
        location: existingEvent.location ?? "",
        locality: existingEvent.locality ?? "",
        description: existingEvent.description,
        serviceFeeType: existingEvent.serviceFeeType ?? "none",
        serviceFeeValue: existingEvent.serviceFeeValue ?? 0,
        cashbackPercent: existingEvent.cashbackPercent ?? 0,
        hasSubEvents: existingEvent.hasSubEvents,
        extraDates: []
      });
    } else {
      reset();
    }
  }

  useEffect(() => {
    // Un borrador recuperado gana: es lo ultimo que escribio esta persona y todavia no esta en
    // ningun sitio. Lo guardado en el evento se puede volver a traer con "Descartar el borrador".
    if (existingEvent && !isDirty && !borrador) {
      const startsAt = dateParts(existingEvent.startsAt);
      const datePending = existingEvent.datePending ?? !existingEvent.startsAt;
      reset({
        coverImageUrl: existingEvent.coverImageUrl ?? "",
        gallery: existingEvent.gallery?.join("\n") ?? "",
        category: existingEvent.category,
        title: existingEvent.title,
        startDate: startsAt.startDate,
        startTime: startsAt.startTime,
        datePending,
        notifyWhenDateConfirmed: existingEvent.notifyWhenDateConfirmed ?? datePending,
        location: existingEvent.location ?? "",
        locality: existingEvent.locality ?? "",
        description: existingEvent.description,
        serviceFeeType: existingEvent.serviceFeeType ?? "none",
        serviceFeeValue: existingEvent.serviceFeeValue ?? 0,
        cashbackPercent: existingEvent.cashbackPercent ?? 0,
        hasSubEvents: existingEvent.hasSubEvents,
        extraDates: []
      });
    }
  }, [existingEvent, isDirty, borrador, reset]);

  async function onSubmit(formValues: Step1FormValues, opciones?: unknown): Promise<boolean> {
    setSaveError(null);
    if (eligeOrganizador && !organizadorId) {
      setSaveError("Elige para qué organizador es el evento.");
      return false;
    }

    // Guardar el evento lo cambia de verdad (nombre, fechas, portada, quién lo organiza), asi que
    // se pregunta. El aviso nombra lo que mas se nota: el titulo y las fechas que vera la gente.
    // Desde el detalle lo pregunta el boton "Guardar" de fuera, asi que aqui se puede saltar.
    const titulo = formValues.title?.trim();
    const fechas = formValues.datePending
      ? "sin fecha todavia"
      : `${formValues.startDate} a las ${formValues.startTime}`;
    const sinConfirmacion =
      typeof opciones === "object" && opciones !== null && "sinConfirmacion" in opciones
        ? Boolean((opciones as { sinConfirmacion?: boolean }).sinConfirmacion)
        : false;
    if (!sinConfirmacion) {
      const adelante = await confirmar({
        title: eventId ? "Guardar los cambios del evento" : "Guardar el evento",
        message: eventId
          ? `Se guardan los cambios de "${titulo || "este evento"}" y se actualizan en entraditas.com. Fechas: ${fechas}. Quien ya tenga una entrada no pierde su butaca.`
          : `Se crea "${titulo || "este evento"}" con fechas ${fechas}. Todavia no se anuncia en entraditas.com: eso se hace al final del asistente.`,
        confirmLabel: "Sí, guardar",
        working: "Guardando..."
      });
      if (!adelante) return false;
    }

    try {
      const startsAt = formValues.datePending ? null : toIsoDate(formValues.startDate, formValues.startTime);
      const endsAt = startsAt ? new Date(new Date(startsAt).getTime() + 2 * 60 * 60 * 1000).toISOString() : null;
      const payload = {
        coverImageUrl: formValues.coverImageUrl?.trim() || null,
        gallery: formValues.gallery
          ?.split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        category: formValues.category,
        title: formValues.title,
        location: formValues.location,
        locality: formValues.locality,
        description: formValues.description,
        startsAt,
        endsAt,
        datePending: formValues.datePending,
        notifyWhenDateConfirmed: formValues.datePending ? true : formValues.notifyWhenDateConfirmed,
        serviceFeeType: formValues.serviceFeeType,
        serviceFeeValue: formValues.serviceFeeType === "none" ? 0 : formValues.serviceFeeValue ?? 0,
        cashbackPercent: formValues.cashbackPercent ?? 0,
        // Al crear, las respuestas del cuestionario previo viajan ya con el evento: nacen
        // contestadas. Dentro del asistente se ajustan en sus pasos (tipos y asientos).
        ...(eventId ? {} : draftRules ? { rules: draftRules } : {}),
        ...(eligeOrganizador ? { organizationId: organizadorId } : {}),
        hasSubEvents: formValues.hasSubEvents
      };

      // "Varias sesiones" en paso 1 + fechas distintas al crear: crea un evento por cada fecha,
      // cada uno titulado "Titulo fecha" y como borrador. El asistente continua con el primero.
      const diasExtra = (formValues.extraDates ?? []).map((d) => d.trim()).filter(Boolean);
      const esCreacionVariosDias =
        !eventId && formValues.hasSubEvents && !formValues.datePending && Boolean(formValues.startDate) && diasExtra.length > 0;

      let event: Event;
      if (esCreacionVariosDias) {
        const dias = [formValues.startDate!, ...diasExtra];
        let primero: Event | null = null;
        for (const dia of dias) {
          const inicio = toIsoDate(dia, formValues.startTime)!;
          const fin = new Date(new Date(inicio).getTime() + 2 * 60 * 60 * 1000).toISOString();
          const creado = await apiClient.post<Event>(
            "/events",
            { ...payload, title: `${formValues.title} ${fechaEnTitulo(dia)}`, startsAt: inicio, endsAt: fin },
            { token: token! }
          );
          primero ??= creado;
        }
        event = primero!;
      } else {
        event = eventId
          ? await apiClient.patch<Event>(`/events/${eventId}`, payload, { token: token! })
          : await apiClient.post<Event>("/events", payload, { token: token! });
      }
      // Ya esta guardado de verdad: el borrador ha cumplido y estorbaria la proxima vez.
      borrarBorrador();
      setBorrador(null);
      ultimoGuardado.current = "";
      onSaved(event.id);
      void syncEventChanges();
      goNext?.();
      return true;
    } catch (error) {
      // Se vuelca ya, sin esperar al temporizador del guardado automatico: si el guardado ha
      // fallado, este es justo el momento en que hace falta que este puesto.
      ultimoGuardado.current = JSON.stringify(formValues);
      guardarBorrador(eventId, formValues as unknown as Record<string, unknown>);
      setSaveError(mensajeDeFallo(error));
      return false;
    }
  }

  async function handleGalleryFiles(files: FileList | null) {
    const urls = await filesToDataUrls(files);
    if (urls.length) setValue("gallery", [...galleryImages, ...urls].join("\n"), { shouldDirty: true });
  }

  function setDatePending(enabled: boolean) {
    setValue("datePending", enabled, { shouldDirty: true, shouldValidate: true });
    setValue("notifyWhenDateConfirmed", enabled ? true : values.notifyWhenDateConfirmed, { shouldDirty: true });
    if (enabled) {
      setValue("startDate", "", { shouldDirty: true, shouldValidate: true });
      setValue("startTime", "", { shouldDirty: true, shouldValidate: true });
    }
  }

  function addExtraDate() {
    setValue("extraDates", [...(values.extraDates ?? []), ""], { shouldDirty: true, shouldValidate: true });
  }

  function setExtraDate(index: number, value: string) {
    const next = [...(values.extraDates ?? [])];
    next[index] = value;
    setValue("extraDates", next, { shouldDirty: true, shouldValidate: true });
  }

  function removeExtraDate(index: number) {
    setValue("extraDates", (values.extraDates ?? []).filter((_, i) => i !== index), { shouldDirty: true, shouldValidate: true });
  }

  // Desde el detalle, el "Guardar" (al lado de las secciones) dispara el formulario sin volver a
  // preguntar, que ya lo ha hecho el de fuera. trigger() respeta el schema de este paso.
  useEffect(() => {
    if (!registrarGuardado) return;
    return registrarGuardado(async () => {
      // Tras reset() desde el evento, los booleanos de los inputs ocultos llegan como "true"/"false"
      // (string) y tumbarian el schema: se dejan como booleanos antes de validar y enviar.
      const crudos = getValues();
      const valores = {
        ...crudos,
        datePending: crudos.datePending === true,
        notifyWhenDateConfirmed: crudos.notifyWhenDateConfirmed === true,
        hasSubEvents: crudos.hasSubEvents === true
      };
      const resultado = step1Schema.safeParse(valores);
      if (!resultado.success) {
        return { ok: false, error: "Faltan campos obligatorios en la información general." };
      }
      const guardado = await onSubmit(valores, { sinConfirmacion: true });
      return guardado
        ? { ok: true }
        : { ok: false, error: saveError ?? "No se pudieron guardar los cambios de la información general." };
    });
  }, [registrarGuardado]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <div className="grid min-w-0 gap-6">
        {borrador && (
          <p
            role="status"
            className="!mt-0 flex flex-wrap items-center gap-2 rounded-md border-2 border-foreground bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground"
          >
            <span>
              Recuperado lo que estabas escribiendo ({describirGuardado(borrador.guardadoEn)}).
              {borrador.imagenesOmitidas && " Las imágenes no cabían en el borrador: vuelve a adjuntarlas."}
            </span>
            <button type="button" className="ml-auto underline" onClick={descartarBorrador}>
              Descartar el borrador
            </button>
          </p>
        )}

        {eligeOrganizador && (
          <div className="!mt-0">
            <label htmlFor="organizador">Organizador</label>
            <select id="organizador" value={organizadorId} onChange={(e) => setOrganizadorId(e.target.value)} required>
              <option value="">Elige la organización del evento</option>
              {organizaciones.map((organizacion) => (
                <option key={organizacion.id} value={organizacion.id}>
                  {organizacion.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Como superadmin no perteneces a ninguna: el evento, sus ventas y sus clientes serán de la que elijas.
            </p>
          </div>
        )}

        <fieldset className={eligeOrganizador ? undefined : "!mt-0"}>
          <legend>Imagen de portada</legend>
          <input type="hidden" {...register("coverImageUrl")} />
          <div className="mb-3 inline-flex rounded-md border-2 border-foreground bg-surface p-1">
            {(["upload", "url"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCoverMode(mode)}
                className={`inline-flex items-center gap-2 rounded-sm px-3 py-2 text-xs font-extrabold uppercase ${
                  coverMode === mode ? "bg-primary text-primary-foreground" : "text-foreground"
                }`}
              >
                <Icon name={mode === "upload" ? "upload" : "link"} size={15} />
                {mode === "upload" ? "Adjuntar" : "URL"}
              </button>
            ))}
          </div>
          {coverMode === "upload" ? (
            // Con recorte: la portada se pinta recortada (object-fit: cover), asi que sin elegir
            // el encuadre lo decide el navegador y casi nunca acierta.
            <CoverImageCropper
              value={values.coverImageUrl ?? ""}
              onChange={(dataUrl) => setValue("coverImageUrl", dataUrl, { shouldDirty: true, shouldValidate: true })}
            />
          ) : (
            <input
              placeholder="https://..."
              maxLength={LIMITES.texto}
              value={values.coverImageUrl ?? ""}
              onChange={(e) => setValue("coverImageUrl", e.target.value, { shouldDirty: true, shouldValidate: true })}
            />
          )}
        </fieldset>

        <fieldset>
          <legend>Galería</legend>
          <input type="hidden" {...register("gallery")} />
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-foreground bg-background p-4 text-center text-sm font-bold">
            <Icon name="upload" size={22} />
            Adjuntar varias imágenes
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void handleGalleryFiles(e.target.files)} />
          </label>
          {galleryImages.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {galleryImages.map((image, index) => (
                <img key={`${image}-${index}`} src={image} alt="" className="aspect-square rounded-md border-2 border-foreground object-cover" />
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Categoría</legend>
          <input type="hidden" {...register("category")} />
          <div className="flex flex-wrap gap-2">
            {PREVIEW_CATEGORIES.map((category) => {
              const active = values.category === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setValue("category", category.id, { shouldDirty: true, shouldValidate: true })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-foreground px-4 py-2 text-sm font-extrabold shadow-flat"
                  style={{ backgroundColor: active ? category.bg : "hsl(var(--surface))", color: active ? category.text : "hsl(var(--foreground))" }}
                >
                  <Icon name={category.icon} size={17} />
                  {category.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label htmlFor="title">Título</label>
            <input id="title" {...register("title")} />
            {errors.title && <span role="alert">{errors.title.message}</span>}
          </div>

          <label className="flex items-center gap-2 rounded-md border-2 border-foreground bg-surface-alt p-3 text-sm font-bold lg:col-span-2">
            <input type="checkbox" checked={Boolean(values.datePending)} onChange={(event) => setDatePending(event.target.checked)} />
            Fecha por confirmar
          </label>

          <div>
            <label htmlFor="startDate">Fecha</label>
            <input id="startDate" type="date" disabled={values.datePending} {...register("startDate")} />
            {errors.startDate && <span role="alert">{errors.startDate.message}</span>}
          </div>
          <div>
            <label htmlFor="startTime">Hora</label>
            <input id="startTime" type="time" disabled={values.datePending} {...register("startTime")} />
            {errors.startTime && <span role="alert">{errors.startTime.message}</span>}
          </div>

          <div>
            <label htmlFor="location">Ubicación</label>
            <input id="location" placeholder="Ej: Palacio de Congresos" {...register("location")} />
            {errors.location && <span role="alert">{errors.location.message}</span>}
          </div>
          <div>
            <label htmlFor="locality">Localidad</label>
            <input id="locality" placeholder="Ej: Madrid" {...register("locality")} />
            {errors.locality && <span role="alert">{errors.locality.message}</span>}
          </div>
        </div>

        <fieldset>
          <legend>Descripción</legend>
          <input type="hidden" {...register("description")} />
          <RichTextEditor
            id="description"
            label="Descripción"
            value={values.description ?? ""}
            onChange={(next) => setValue("description", next, { shouldDirty: true, shouldValidate: true })}
          />
          {errors.description && <span role="alert">{errors.description.message}</span>}
        </fieldset>

        <fieldset>
          <legend>Gastos de gestión</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="radio" value="none" {...register("serviceFeeType")} />
              Sin gastos extra
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="radio" value="fixed" {...register("serviceFeeType")} />
              Importe fijo
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="radio" value="percent" {...register("serviceFeeType")} />
              Porcentaje
            </label>
          </div>
          <label htmlFor="serviceFeeValue">Valor</label>
          <NumericInput id="serviceFeeValue" allowDecimal maxLength={7} step="0.01" min="0" {...register("serviceFeeValue")} />
        </fieldset>

        <fieldset>
          <legend>Cashback al monedero</legend>
          <p className="mt-1 mb-2 text-sm text-muted-foreground">
            Porcentaje de lo que se paga por las entradas (sin gastos de gestión) que vuelve al monedero de quien
            compra en entraditas.com. 0 = sin cashback. Máximo 50 %.
          </p>
          <label htmlFor="cashbackPercent">Cashback (%)</label>
          <NumericInput id="cashbackPercent" maxLength={2} step="1" min="0" max="50" {...register("cashbackPercent")} />
          {errors.cashbackPercent && <span role="alert">{errors.cashbackPercent.message}</span>}
        </fieldset>

        {/* Al final del paso: es lo que decide si el siguiente paso es "Sesiones". */}
        <QuestionSection title="Sesiones" hint="Festivales y giras suelen tener varias sesiones, pases o fechas.">
          <input type="hidden" {...register("hasSubEvents")} />
          <div className="flex flex-wrap gap-2">
            <OptionButton
              selected={!values.hasSubEvents}
              onClick={() => setValue("hasSubEvents", false, { shouldDirty: true })}
            >
              Sesión única
            </OptionButton>
            <OptionButton
              selected={Boolean(values.hasSubEvents)}
              onClick={() => setValue("hasSubEvents", true, { shouldDirty: true })}
            >
              Varias sesiones
            </OptionButton>
          </div>
        </QuestionSection>

        {values.hasSubEvents && !eventId && !values.datePending && (
          <fieldset>
            <legend>Días del evento</legend>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              Cada día crea un evento con su propio nombre y fecha (se guardan como "Título fecha").
            </p>
            <ul className="flex flex-col gap-2">
              {(values.extraDates ?? []).map((dia, index) => (
                <li key={index} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`dias-extra-${index}`}>Día {index + 2}</label>
                    <input
                      id={`dias-extra-${index}`}
                      type="date"
                      value={dia}
                      onChange={(e) => setExtraDate(index, e.target.value)}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={() => removeExtraDate(index)}>
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" className="mt-2" onClick={addExtraDate}>
              Añadir otro día
            </Button>
            {(errors.extraDates as { message?: string } | undefined)?.message && (
              <span role="alert">{(errors.extraDates as { message?: string }).message}</span>
            )}
          </fieldset>
        )}

        {hasLoadError && <p role="alert">No se pudo cargar el evento.</p>}
        {saveError && <p role="alert">{saveError}</p>}

        {!ocultarBotonGuardar && (
          <Button type="submit" disabled={isSubmitting} className="self-start">
            Guardar y continuar
          </Button>
        )}
      </div>

      <PublicEventPreview
        event={{
          category: activeCategory,
          title: values.title,
          coverImageUrl: values.coverImageUrl,
          gallery: galleryImages,
          datePending: values.datePending,
          startDate: values.startDate,
          startTime: values.startTime,
          location: values.location,
          locality: values.locality,
          description: values.description,
          durationMinutes: 120,
          serviceFeeType: values.serviceFeeType,
          serviceFeeValue: values.serviceFeeValue,
          ticketTiers: [{ id: "preview", name: "Entrada general", priceCents: 2500, description: "Acceso general" }]
        }}
      />
    </form>
  );
}

