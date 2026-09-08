import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  conectarConLaApi,
  isApiConfigured,
  logoutFromApi,
  quienSoyEnLaApi,
  type ApiStaff
} from "@/shared/lib/entraditasApi";

/**
 * Conexion del panel con entraditas.com.
 *
 * Son dos sesiones distintas a proposito, y conviene entender por que:
 *
 *   - La sesion del PANEL se valida contra sus mocks, cuyas contrasenas de demostracion estan
 *     escritas en el repositorio. No protegen nada.
 *   - La sesion de la API decide lo que aparece en la web publica, asi que tiene sus propias
 *     credenciales, que no viven en ningun sitio del codigo.
 *
 * Si se reutilizaran las mismas, publicar en entraditas.com quedaria protegido por una
 * contrasena que cualquiera puede leer en GitHub. De ahi este formulario aparte.
 *
 * La sesion se guarda en el navegador, asi que solo hay que conectarse una vez cada dos dias.
 */
export function ConexionWebPublica() {
  const [staff, setStaff] = useState<ApiStaff | null>(null);
  const [comprobando, setComprobando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;
    quienSoyEnLaApi()
      .then((resultado) => {
        if (vigente) setStaff(resultado);
      })
      .finally(() => {
        if (vigente) setComprobando(false);
      });
    return () => {
      vigente = false;
    };
  }, []);

  async function conectar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      setStaff(await conectarConLaApi(email.trim(), password));
      setAbierto(false);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar con la web publica.");
    } finally {
      setEnviando(false);
    }
  }

  async function desconectar() {
    await logoutFromApi();
    setStaff(null);
  }

  // Sin API configurada en la compilacion no hay nada que conectar: el panel funciona contra sus
  // mocks y publicar no sale de aqui. Mejor no ensenar un formulario que no puede funcionar.
  if (!isApiConfigured() || comprobando) return null;

  if (staff) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-success bg-success-bg px-4 py-2">
        <span className="text-sm font-semibold text-success">
          Conectado a entraditas.com como {staff.email}
        </span>
        <span className="text-xs text-muted-foreground">
          Lo que apruebes y publiques aparecera en la web al momento.
        </span>
        <Button type="button" variant="outline" onClick={() => void desconectar()} className="ml-auto h-8 px-3 text-xs">
          Desconectar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-primary bg-primary/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Sin conexión con entraditas.com</span>
        <span className="text-xs text-muted-foreground">
          Puedes trabajar con normalidad, pero lo que publiques no saldrá a la web hasta que conectes.
        </span>
        {!abierto && (
          <Button type="button" onClick={() => setAbierto(true)} className="ml-auto h-8 px-3 text-xs">
            Conectar
          </Button>
        )}
      </div>

      {abierto && (
        <form onSubmit={(e) => void conectar(e)} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Correo</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-9 w-56 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-9 w-56 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
            />
          </label>
          <Button type="submit" disabled={enviando} className="h-9 px-3 text-xs">
            {enviando ? "Conectando..." : "Conectar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAbierto(false);
              setError(null);
            }}
            className="h-9 px-3 text-xs"
          >
            Cancelar
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
