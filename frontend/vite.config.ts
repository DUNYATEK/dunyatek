import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages under https://dunyatek.github.io/dunyatek/
  base: '/dunyatek/',
  plugins: [react()],
})
