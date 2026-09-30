import "./styles/globals.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { limpiarAlmacenViejo } from "./shared/lib/limpiarAlmacen";

// Antes que nada: los datos del simulador que ya no existe llenaban el almacenamiento del navegador.
limpiarAlmacenViejo();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
