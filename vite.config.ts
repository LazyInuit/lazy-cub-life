import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    watch: {
      // Windows locks large design assets during edit → Vite watcher EBUSY crash
      ignored: ['**/Cub Games/**'],
    },
  },
})
