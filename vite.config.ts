import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  // EXA_API_KEY stays on the dev server: the browser demo calls /exa and the
  // proxy adds the key, so it is never bundled into or visible to the page.
  const { EXA_API_KEY = "" } = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 1420,
      strictPort: true,
      proxy: {
        "/exa": {
          target: "https://api.exa.ai",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/exa/, ""),
          headers: { "x-api-key": EXA_API_KEY },
        },
      },
    },
    clearScreen: false,
  };
});
