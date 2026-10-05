import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const local = (value: string | undefined) => {
    if (!value) return false;
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(value).hostname,
    );
  };
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Vite 8 console forwarding crashes on Convex stacks without source filenames.
      // Browser devtools retain the original errors.
      forwardConsole: false,
      port: 5173,
      strictPort: true,
      proxy: {
        ...(local(env.VITE_CONVEX_SITE_URL)
          ? {
              "/__convex-site": {
                target: env.VITE_CONVEX_SITE_URL,
                changeOrigin: true,
                rewrite: (path: string) =>
                  path.replace(/^\/__convex-site(?=\/|$)/, ""),
              },
            }
          : {}),
        ...(local(env.VITE_CONVEX_URL)
          ? {
              "/__convex": {
                target: env.VITE_CONVEX_URL,
                ws: true,
                changeOrigin: true,
                rewrite: (path: string) =>
                  path.replace(/^\/__convex(?=\/|$)/, ""),
              },
            }
          : {}),
      },
    },
  };
});
