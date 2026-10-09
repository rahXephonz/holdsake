import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // The gift-card renderer loads a native .node binary: never pre-bundle it, never inline it in
  // the server build; Node loads it at runtime
  optimizeDeps: { exclude: ['@resvg/resvg-js'] },
  ssr: { external: ['@resvg/resvg-js'] },
  plugins: [devtools(), nitro(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
