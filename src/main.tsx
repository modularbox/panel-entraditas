import "./styles/globals.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { limpiarAlmacenViejo } from "./shared/lib/limpiarAlmacen";
import { consumirConexionEnPestana, limpiarTraspasosCaducados } from "./shared/auth/conectarEnPestana";

// Antes que nada: los datos del simulador que ya no existe llenaban el almacenamiento del navegador.
limpiarAlmacenViejo();
// Los traspasos de "Conectar" que nadie recogio se van, y el de esta pestana se recoge ANTES de
// montar: su sesion tiene que ser la conectada desde el primer momento, no despues de haber
// restaurado la del superadmin que la abrio.
limpiarTraspasosCaducados();
consumirConexionEnPestana();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
