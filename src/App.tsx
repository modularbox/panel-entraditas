import { BrowserRouter } from "react-router-dom";
import { AppProviders } from "./app/providers";
import { AppRoutes } from "./app/router";
import { ThemeManager } from "./app/theme";

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <ThemeManager />
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
