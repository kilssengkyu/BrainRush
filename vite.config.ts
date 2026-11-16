import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// 웹 문서는 게임의 로그인과 SDK를 불러오지 않는 별도 HTML로 빌드합니다.
const htmlEntries = ['index.html', ...['privacy', 'terms', 'support', 'delete-account']
  .map((page) => `galaxy-express/${page}/index.html`)]

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: htmlEntries.map((entry) => fileURLToPath(new URL(entry, import.meta.url))),
    },
  },
})
