import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * DevUtils production build.
 *
 * - `viteSingleFile` inlines the JS+CSS into dist/index.html, which matches the
 *   committed production bundle and lets server/index.mjs inject the CSP nonce
 *   and runtime config by rewriting the single <script type="module" crossorigin>
 *   tag it expects.
 * - `build.target: "es2022"` and default `assetsInlineLimit: 100000000` (set by
 *   the singlefile plugin) keep everything inline.
 */
const injectRuntimeConfigInDev = {
  name: "devutils:runtime-config-dev",
  apply: "serve",
  transformIndexHtml(html: string) {
    // In dev, nothing loads /runtime-config.js; inject it so window.__DEVUTILS_CONFIG__
    // is set (same as the production gateway does). The Vite proxy serves it from the gateway.
    return html.replace("</head>", '<script src="/runtime-config.js"></script></head>');
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), injectRuntimeConfigInDev, viteSingleFile()],
  build: {
    target: "es2022",
  },
  server: {
    // The dev server only serves the SPA; the gateway runs separately on its
    // own port. Proxy same-origin API calls to the Node gateway so /api/*
    // works in `npm run dev` without CORS changes.
    proxy: {
      "/api": {
        target: process.env.DEVUTILS_GATEWAY_URL ?? "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/runtime-config.js": {
        target: process.env.DEVUTILS_GATEWAY_URL ?? "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
