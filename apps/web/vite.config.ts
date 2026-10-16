import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dayTheme } from "./day-theme";
import { palette } from "./day-palette";
import { gmPreload } from "./gm-preload-plugin";

export default defineConfig({
  // 部署在子路径时用 BASE_PATH 指定，例如 BASE_PATH=/ttr/ npm run build。
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), dayTheme(palette), gmPreload()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/socket.io": { target: "http://localhost:3007", ws: true },
      "/health": "http://localhost:3007"
    }
  }
});
