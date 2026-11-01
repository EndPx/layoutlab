import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Same-origin /api for the M3 live server (loopback only, no browser keys).
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
