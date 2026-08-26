import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { step1Schema, type Step1FormValues } from "./step1Schema";
import { useVenuesQuery } from "./useVenuesQuery";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface Step1BasicInfoProps {
  eventId: string | null;
  onSaved: (id: string) => void;
}

export function Step1BasicInfo({ eventId, onSaved }: Step1BasicInfoProps) {
  const token = useSessionStore((s) => s.token);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: existingEvent, isError: hasLoadError } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
  const { data: venues = [] } = useVenuesQuery();
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<Step1FormValues>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      title: "", category: "concierto", city: "", venueName: "", date: "", time: "",
      description: "", isCompetition: false, hasSubEvents: false
    }
  });

  // Resuming an existing draft (fresh wizard mount after a refresh, or the
  // event detail page reusing this component) pre-fills from the fetched event —
  // but only while the user hasn't started editing yet, so a fetch that resolves
  // after the user has already typed something doesn't clobber their edits (and,
  // on submit, doesn't silently overwrite real server data with untouched defaults).
  useEffect(() => {
    if (existingEvent && !isDirty) {
      const venue = venues.find((v) => v.id === existingEvent.venueId);
      const firstSubEvent = [...subEvents].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      reset({
        title: existingEvent.title,
        category: existingEvent.category,
        city: venue?.city ?? "",
        venueName: venue?.name ?? "",
        date: firstSubEvent ? firstSubEvent.startsAt.slice(0, 10) : "",
        time: firstSubEvent ? firstSubEvent.startsAt.slice(11, 16) : "",
        description: existingEvent.description,
        isCompetition: existingEvent.isCompetition,
        hasSubEvents: existingEvent.hasSubEvents
      });
    }
  }, [existingEvent, venues, subEvents, isDirty, reset]);

  async function onSubmit(values: Step1FormValues) {
    setSaveError(null);
    try {
      const event = eventId
        ? await apiClient.patch<Event>(`/events/${eventId}`, values, { token: token! })
        : await apiClient.post<Event>("/events", values, { token: token! });
      onSaved(event.id);
    } catch (error) {
      setSaveError(error instanceof AppError ? error.message : "No se pudo guardar el evento");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      <label htmlFor="title">Título</label>
      <input id="title" {...register("title")} />
      {errors.title && <span role="alert">{errors.title.message}</span>}

      <label htmlFor="category">Categoría</label>
      <select id="category" {...register("category")}>
        <option value="concierto">Concierto</option>
        <option value="teatro">Teatro</option>
        <option value="festival">Festival</option>
        <option value="deporte">Deporte</option>
        <option value="conferencia">Conferencia</option>
      </select>

      <label htmlFor="city">Ciudad</label>
      <input id="city" {...register("city")} />
      {errors.city && <span role="alert">{errors.city.message}</span>}

      <label htmlFor="venueName">Recinto</label>
      <input id="venueName" {...register("venueName")} />
      {errors.venueName && <span role="alert">{errors.venueName.message}</span>}

      <label htmlFor="date">Fecha</label>
      <input id="date" type="date" {...register("date")} />
      {errors.date && <span role="alert">{errors.date.message}</span>}

      <label htmlFor="time">Hora</label>
      <input id="time" type="time" {...register("time")} />
      {errors.time && <span role="alert">{errors.time.message}</span>}

      <label htmlFor="description">Descripción</label>
      <textarea id="description" {...register("description")} />
      {errors.description && <span role="alert">{errors.description.message}</span>}

      <label className="mt-4 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" {...register("isCompetition")} />
        ¿Es una competición? (partido o evento con equipos o participantes)
      </label>

      <label className="mt-2 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" {...register("hasSubEvents")} />
        Este evento tiene varias funciones o fechas
      </label>

      {hasLoadError && <p role="alert">No se pudo cargar el evento.</p>}
      {saveError && <p role="alert">{saveError}</p>}

      <Button type="submit" disabled={isSubmitting} className="mt-6 self-start">
        Guardar y continuar
      </Button>
    </form>
  );
}
