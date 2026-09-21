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
  hasSubEvents: z.boolean(),
  // Dias extra (ademas de la fecha principal). Cada dia crea el mismo evento como un evento
  // separado, guardado con su nombre y la fecha: "Titulo fecha".
  extraDates: z.array(z.string()).optional()
}).superRefine((values, ctx) => {
  if (!values.datePending) {
    if (!values.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "La fecha es obligatoria" });
    } else if (!values.startTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startTime"], message: "La hora es obligatoria" });
    } else if (new Date(`${values.startDate}T${values.startTime}:00`).getTime() < Date.now()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "La fecha no puede estar en el pasado" });
    }
  }
  const diasExtra = (values.extraDates ?? []).filter((dia) => dia.trim() !== "");
  if (values.hasSubEvents && !values.datePending && values.startDate && diasExtra.length > 0) {
    const vistas = new Set<string>([values.startDate]);
    diasExtra.forEach((dia) => {
      const fecha = new Date(`${dia}T23:59:59`);
      if (Number.isNaN(fecha.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["extraDates"], message: "Elige la fecha del día adicional." });
        return;
      }
      if (fecha.getTime() < Date.now()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["extraDates"], message: "La fecha no puede estar en el pasado." });
        return;
      }
      if (vistas.has(dia)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["extraDates"], message: "Los días no pueden repetirse." });
        return;
      }
      vistas.add(dia);
    });
  }
});

export type Step1FormValues = z.infer<typeof step1Schema>;
