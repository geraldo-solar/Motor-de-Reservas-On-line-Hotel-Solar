import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo-gold.png', 'logo-white.png', 'logo-dark.png', 'hero-family-pool.jpg'],
        manifest: {
          name: 'Hotel Solar - Reservas',
          short_name: 'Solar Reservas',
          description: 'Sistema de Reservas do Hotel Solar',
          theme_color: '#1a3c34',
          background_color: '#F9F8F6',
          display: 'standalone',
          icons: [
            {
              src: 'logo-gold.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'logo-gold.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'supabase-images',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      })
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
