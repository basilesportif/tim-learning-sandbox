import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRootDir = resolve(appDir, '..', '..');

export default defineConfig(({ mode }) => {
  const appEnv = loadEnv(mode, appDir, '');
  const rootEnv = loadEnv(mode, repoRootDir, '');
  const clerkPublishableKey = appEnv.VITE_CLERK_PUBLISHABLE_KEY
    || appEnv.CLERK_PUBLISHABLE_KEY
    || rootEnv.CLERK_PUBLISHABLE_KEY
    || rootEnv.VITE_CLERK_PUBLISHABLE_KEY
    || '';

  return {
    plugins: [react()],
    base: '/vocab/',
    define: {
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(clerkPublishableKey),
    },
  };
});
