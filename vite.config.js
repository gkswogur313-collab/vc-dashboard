import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cloudflare Pages는 하위 도메인 루트(예: <프로젝트>.pages.dev/)에서 서빙하므로 base='/'.
export default defineConfig({
  base: '/',
  plugins: [react()],
})
