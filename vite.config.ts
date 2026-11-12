import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {stat} from 'node:fs/promises';

export default defineConfig(() => {
  return {
    plugins: [
      react(), tailwindcss(),
      {
        name: 'local-tiktok-api',
        configureServer(server) {
          const loadHandler = async (path: string) => {
            const url = new URL(path, import.meta.url);
            url.searchParams.set('updated', String((await stat(url)).mtimeMs));
            return (await import(url.href)).default;
          };
          server.middlewares.use('/api/tiktok', async (request, response) => {
            const handler = await loadHandler('./api/tiktok.js');
            await handler(request, response);
          });
          server.middlewares.use('/api/control', async (request, response) => {
            const handler = await loadHandler('./api/control.js');
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
