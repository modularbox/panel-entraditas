import { z } from "zod";

export const step1Schema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  category: z.string().min(1, "La categoría es obligatoria"),
  description: z.string().min(1, "La descripción es obligatoria"),
  hasSubEvents: z.boolean()
});

export type Step1FormValues = z.infer<typeof step1Schema>;
