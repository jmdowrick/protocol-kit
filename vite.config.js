import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

// The peers the host app provides, kept out of the bundle.
const EXTERNAL = [/^vue$/, /^primevue(\/|$)/, /^@primevue\//, /^papaparse$/]

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      // The core, and the editor in a module of its own so a host that only reads protocols needs no Vue.
      entry: {
        index: fileURLToPath(new URL('./src/index.js', import.meta.url)),
        editor: fileURLToPath(new URL('./src/editor/index.js', import.meta.url)),
      },
      formats: ['es'],
      cssFileName: 'editor',
    },
    rollupOptions: {
      external: (id) => EXTERNAL.some((pattern) => pattern.test(id)),
    },
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    exclude: ['node_modules/**', 'dist/**'],
  },
})
