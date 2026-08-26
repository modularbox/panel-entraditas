import { z } from "zod";

export const step1Schema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  category: z.string().min(1, "La categoría es obligatoria"),
  city: z.string().min(1, "La ciudad es obligatoria"),
  venueName: z.string().min(1, "El recinto es obligatorio"),
  date: z.string().min(1, "La fecha es obligatoria"),
  time: z.string().min(1, "La hora es obligatoria"),
  description: z.string().min(1, "La descripción es obligatoria"),
  isCompetition: z.boolean(),
  hasSubEvents: z.boolean()
});

export type Step1FormValues = z.infer<typeof step1Schema>;
