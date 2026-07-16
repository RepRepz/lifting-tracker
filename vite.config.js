import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes asset URLs relative, so the build works at
// https://<user>.github.io/<repo>/ regardless of the repo name.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
