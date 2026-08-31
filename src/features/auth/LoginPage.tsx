import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Button } from "@/shared/ui/button";
import { loginSchema, type LoginFormValues } from "./loginSchema";

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate();
  const login = useSessionStore((s) => s.login);
  const [loginError, setLoginError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setLoginError(null);
    try {
      await login(values.email, values.password);
      navigate("/eventos");
    } catch {
      setLoginError("Credenciales inválidas");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border-2 border-foreground bg-surface p-8 shadow-flat">
        <p className="font-display text-2xl font-semibold text-primary">entraditas</p>
        <h1 className="mt-1 text-sm text-muted-foreground">Panel de administración</h1>

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

          {loginError && (
            <p role="alert" className="text-sm text-destructive">
              {loginError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-2">
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
