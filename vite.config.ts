import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": "/src" }
  },
  server: {
    port: 5174
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: false,
    exclude: ["**/node_modules/**", "**/dist/**", "./e2e/**"]
  }
});
