import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";




export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  plugins: [
    cloudflare(),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js'
      },
    },
  },
  publicDir: 'static',
})
