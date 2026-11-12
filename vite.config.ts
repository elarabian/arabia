import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), tailwindcss(),
      {
        name: 'local-tiktok-api',
        configureServer(server) {
          server.middlewares.use('/api/tiktok', async (request, response) => {
            const { default: handler } = await import(new URL('./api/tiktok.js', import.meta.url).href);
            await handler(request, response);
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': import.meta.dirname,
      },
    },
  };
});
