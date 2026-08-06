// Vite plugin to copy routes.json to dist after build
import { promises as fs } from 'fs';

export default function CopyRoutesJsonPlugin() {
  return {
    name: 'copy-routes-json',
    closeBundle: async () => {
      try {
        await fs.copyFile('public/routes.json', 'dist/routes.json');
        console.log('routes.json copiado para dist/');
      } catch (err) {
        console.error('Erro ao copiar routes.json:', err);
      }
    },
  };
}
