import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    target: 'esnext',
    // Three independent pages: the renderer, the compute demo and the talk.
    rollupOptions: {
      input: { render: 'index.html', compute: 'compute/index.html', talk: 'talk/index.html' },
    },
  },
})
