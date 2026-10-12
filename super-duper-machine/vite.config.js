import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// devicemotion only works in secure contexts, so the dev server serves a
// self-signed https cert. That lets a phone on the LAN test the sensors.
export default defineConfig({
  base: "./",
  plugins: [basicSsl()],
  server: { host: true },
  preview: { host: true },
});
