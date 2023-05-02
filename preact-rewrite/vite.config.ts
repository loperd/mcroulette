import globalStyle from '@originjs/vite-plugin-global-style'
import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
      preact(),
      globalStyle({
        sourcePath: 'src/assets/styles/',
      })
  ],
})
