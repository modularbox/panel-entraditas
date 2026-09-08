/// <reference types="vite/client" />

// Variables de entorno del panel. Declararlas aqui hace que TypeScript avise si se usa una que
// no existe, en vez de dejar pasar un `undefined` silencioso en tiempo de ejecucion.
interface ImportMetaEnv {
  /** Base de api.entraditas.com. Vacia = el panel funciona solo contra sus mocks. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
