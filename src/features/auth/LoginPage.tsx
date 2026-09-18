import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AppError, SIMULADOR_PARADO } from "@/shared/lib/apiClient";
import { leerCierre, mensajeDeCierre } from "@/shared/auth/sessionExpiry";
import { MINUTOS_DE_INACTIVIDAD } from "@/shared/auth/useInactivityLogout";
import { Button } from "@/shared/ui/button";
import { NotARobotCaptcha } from "@/shared/ui/notARobotCaptcha";
import { loginSchema, type LoginFormValues } from "./loginSchema";

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate();
  const login = useSessionStore((s) => s.login);
  const [loginError, setLoginError] = useState<string | null>(null);
  // Cuando el fallo se arregla recargando, se ofrece recargar ahi mismo en vez de esperar a que
  // se le ocurra a quien esta delante.
  const [seArreglaRecargando, setSeArreglaRecargando] = useState(false);
  // Por que se acabo la sesion anterior. Se lee una vez al abrir la pantalla: entrar la borra, y
  // sin esto el mensaje desapareceria a media animacion de salida.
  const [cierre] = useState(() => leerCierre());
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const captchaVerified = watch("captchaVerified");

  async function onSubmit(values: LoginFormValues) {
    setLoginError(null);
    setSeArreglaRecargando(false);
    if (!values.captchaVerified) {
      setError("captchaVerified", { message: "Marca la casilla para confirmar que no eres un robot" });
      return;
    }
    try {
      await login(values.email, values.password);
      navigate("/eventos");
    } catch (error) {
      // El motivo que llega de la API se ensena tal cual. Antes se sustituia siempre por
      // "Credenciales inválidas", y con eso una contrasena que dejo de valer no se distingue de
      // una mal escrita: se prueba la misma diez veces sin entender por que no entra.
      setLoginError(error instanceof Error && error.message ? error.message : "Credenciales inválidas");
      setSeArreglaRecargando(error instanceof AppError && error.code === SIMULADOR_PARADO);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border-2 border-foreground bg-surface p-8 shadow-flat">
        <p className="font-display text-2xl font-semibold text-primary">entraditas</p>
        <h1 className="mt-1 text-sm text-muted-foreground">Panel de administración</h1>

        {cierre && (
          <p
            role="status"
            className="mt-4 rounded-md border-2 border-foreground bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground"
          >
            {mensajeDeCierre(cierre, MINUTOS_DE_INACTIVIDAD)}
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              {...register("email")}
            />
            {errors.email && (
              <span role="alert" className="text-sm text-destructive">
                {errors.email.message}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>

            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="h-10 w-full rounded-md border-2 border-foreground bg-background px-3 pr-20 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                {...register("password")}
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {errors.password && (
              <span role="alert" className="text-sm text-destructive">
                {errors.password.message}
              </span>
            )}
          </div>

          <NotARobotCaptcha
            checked={Boolean(captchaVerified)}
            error={errors.captchaVerified?.message}
            onChange={(next) => {
              setValue("captchaVerified", next);
              if (next) clearErrors("captchaVerified");
            }}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="acceptsTerms" className="flex items-center gap-2 text-sm font-medium">
              <input id="acceptsTerms" type="checkbox" {...register("acceptsTerms")} />
              Acepto los{" "}
              <Link to="/terminos" className="underline">
                términos y condiciones
              </Link>
            </label>
            {errors.acceptsTerms && (
              <span role="alert" className="text-sm text-destructive">
                {errors.acceptsTerms.message}
              </span>
            )}
          </div>

          {loginError && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm text-destructive">{loginError}</p>
              {seArreglaRecargando && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-sm font-bold underline underline-offset-2"
                >
                  Recargar la página
                </button>
              )}
            </div>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-2">
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
