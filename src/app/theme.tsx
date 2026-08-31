import { useEffect } from "react";
import { useSessionStore } from "@/shared/auth/sessionStore";

// Tags <html data-theme="superadmin"> while a superadmin session is active so
// globals.css can swap in the dark-blue palette; every other role keeps the
// default cream/black brand theme.
export function ThemeManager() {
  const role = useSessionStore((s) => s.user?.role ?? null);

  useEffect(() => {
    document.documentElement.dataset.theme = role === "superadmin" ? "superadmin" : "default";
  }, [role]);

  return null;
}