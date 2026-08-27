import { z } from "zod";

export const invitationAcceptSchema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string().min(1, "Confirma la contraseña")
}).refine((data) => data.password === data.confirmPassword, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] });
export type InvitationAcceptFormValues = z.infer<typeof invitationAcceptSchema>;
