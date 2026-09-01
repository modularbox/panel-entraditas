import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "El correo es obligatorio").email("Correo no válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
  captchaAnswer: z.string().min(1, "Responde la prueba de verificación"),
  acceptsTerms: z.boolean().refine((value) => value === true, "Debes aceptar los términos y condiciones")
});

export type LoginFormValues = z.infer<typeof loginSchema>;
