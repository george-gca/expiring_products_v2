import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Registered manually via the `virtual:pwa-register/react` hook
      // (see src/Root.tsx) instead of the plugin's auto-injected script, so
      // the app can show a "new version available" prompt rather than
      // silently swapping the service worker underneath an open tab.
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Produtos a vencer',
        short_name: 'Produtos a vencer',
        theme_color: '#6e6197',
        background_color: '#212529',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
