import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {stat} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';

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
          server.middlewares.use('/api/local-address', (request, response) => {
            const addresses = Object.values(networkInterfaces()).flatMap(entries => entries ?? []);
            const address = addresses.find(entry => entry.family === 'IPv4' && !entry.internal)?.address ?? '';
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({ address }));
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
