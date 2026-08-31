import { z } from "zod";

export const step1Schema = z.object({
  coverImageUrl: z.string().optional(),
  gallery: z.string().optional(),
  category: z.string().min(1, "La categoría es obligatoria"),
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  startDate: z.string().optional(),
  startTime: z.string().optional(),
  datePending: z.boolean(),
  notifyWhenDateConfirmed: z.boolean(),
  location: z.string().min(1, "La ubicación es obligatoria"),
  locality: z.string().min(1, "La localidad es obligatoria"),
  description: z.string().min(1, "La descripción es obligatoria"),
  serviceFeeType: z.enum(["none", "fixed", "percent"]),
  serviceFeeValue: z.coerce.number().min(0).optional(),
  hasSubEvents: z.boolean()
}).superRefine((values, ctx) => {
  if (values.datePending) return;
  if (!values.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "La fecha es obligatoria" });
    return;
  }
  if (!values.startTime) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startTime"], message: "La hora es obligatoria" });
    return;
  }
  const start = new Date(`${values.startDate}T${values.startTime}:00`);
  if (start.getTime() < Date.now()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "La fecha no puede estar en el pasado" });
  }
});

export type Step1FormValues = z.infer<typeof step1Schema>;
