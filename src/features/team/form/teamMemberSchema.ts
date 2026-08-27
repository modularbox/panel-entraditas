import { z } from "zod";
import { RoleSlugSchema } from "@entraditas/types";

export const teamMemberSchema = z.object({
  email: z.string().min(1, "El correo es obligatorio").email("Correo no válido"),
  fullName: z.string().min(1, "El nombre es obligatorio"),
  role: RoleSlugSchema,
  capabilityKeys: z.array(z.string()),
  eventScopes: z.array(z.string())
});
export type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;
