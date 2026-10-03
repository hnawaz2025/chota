import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['data/*', 'icon-*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,jpg,json,geojson}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'CHOTA — Small AI. Big memory.', short_name: 'CHOTA', lang: 'ur', dir: 'rtl',
        description: 'Offline Urdu memory and trip companion for livestock herders around Nushki',
        theme_color: '#c8611d', background_color: '#f6efe2', display: 'standalone', start_url: './',
        icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
      },
    }),
  ],
  server: { host: true },
})
