import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { step1Schema, type Step1FormValues } from "./step1Schema";
import { PREVIEW_CATEGORIES, PublicEventPreview, RichTextEditor } from "./publicEventPreview";

export interface Step1BasicInfoProps {
  eventId: string | null;
  onSaved: (id: string) => void;
  goNext?: () => void;
}

function dateParts(value: string | null | undefined): { startDate: string; startTime: string } {
  if (!value) return { startDate: "", startTime: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { startDate: "", startTime: "" };
  return { startDate: date.toISOString().slice(0, 10), startTime: date.toISOString().slice(11, 16) };
}

function toIsoDate(date: string | undefined, time: string | undefined): string | null {
  if (!date || !time) return null;
  return new Date(`${date}T${time}:00`).toISOString();
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

export function Step1BasicInfo({ eventId, onSaved, goNext }: Step1BasicInfoProps) {
  const token = useSessionStore((s) => s.token);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [coverMode, setCoverMode] = useState<"upload" | "url">("upload");
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
      hasSubEvents: false
    }
  });

  const values = watch();
  const activeCategory = PREVIEW_CATEGORIES.find((item) => item.id === values.category) ?? PREVIEW_CATEGORIES[0]!;
  const galleryImages = values.gallery
    ?.split("\n")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  useEffect(() => {
    if (existingEvent && !isDirty) {
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
        hasSubEvents: existingEvent.hasSubEvents
      });
    }
  }, [existingEvent, isDirty, reset]);

  async function onSubmit(formValues: Step1FormValues) {
    setSaveError(null);
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
        hasSubEvents: formValues.hasSubEvents
      };
      const event = eventId
        ? await apiClient.patch<Event>(`/events/${eventId}`, payload, { token: token! })
        : await apiClient.post<Event>("/events", payload, { token: token! });
      onSaved(event.id);
      goNext?.();
    } catch (error) {
      setSaveError(error instanceof AppError ? error.message : "No se pudo guardar el evento");
    }
  }

  async function handleCoverFiles(files: FileList | null) {
    const [first] = await filesToDataUrls(files);
    if (first) setValue("coverImageUrl", first, { shouldDirty: true, shouldValidate: true });
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <div className="grid min-w-0 gap-6">
        <fieldset className="!mt-0">
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
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-foreground bg-background p-4 text-center text-sm font-bold">
              <Icon name="upload" size={22} />
              Adjuntar imagen de portada
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void handleCoverFiles(e.target.files)} />
            </label>
          ) : (
            <input
              placeholder="https://..."
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
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-foreground px-4 py-2 text-sm font-extrabold shadow-flat transition-transform hover:-translate-y-px"
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
          <input id="serviceFeeValue" type="number" step="0.01" min="0" {...register("serviceFeeValue")} />
        </fieldset>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...register("hasSubEvents")} />
          Este evento tiene varias sesiones, pases o fechas
        </label>

        {hasLoadError && <p role="alert">No se pudo cargar el evento.</p>}
        {saveError && <p role="alert">{saveError}</p>}

        <Button type="submit" disabled={isSubmitting} className="self-start">
          Guardar y continuar
        </Button>
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

