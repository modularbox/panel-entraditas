import "./styles/globals.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { alFallarElSimulador } from "./shared/lib/apiClient";

const OPCIONES = { onUnhandledRequest: "bypass" } as const;

async function enableMocking() {
  const { worker } = await import("./mocks/browser");

  /**
   * Como volver a levantarlo si deja de atender a mitad de sesión.
   *
   * El panel no tiene servidor: esto ES su servidor, un service worker dentro del navegador. El
   * navegador puede dejar de darle el control de la pestaña —una recarga forzada, un despliegue
   * nuevo, o simplemente descartarlo por inactividad— y a partir de ahí toda llamada al panel
   * falla. Pasaba justo al volver después de un rato, que es cuando más raro se ve.
   *
   * `start()` es idempotente: si ya está atendiendo, esto no hace nada.
   */
  alFallarElSimulador(async () => {
    await worker.start(OPCIONES);
  });

  return worker.start(OPCIONES);
}

void enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
