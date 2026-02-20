import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './src/manifest';
import { getSentryPlugin } from './vite.config.sentry';
import { sourcemapGuardPlugin } from './vite-plugin-sourcemap-guard';

/**
 * Configuração do Vite para a Extensão Chrome Lexato
 *
 * Utiliza @crxjs/vite-plugin para build de extensões Manifest V3
 * com suporte a React 19, TypeScript e Tailwind CSS 4
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    crx({ manifest }),
    ...getSentryPlugin(mode),
    // Verificação pós-build: garante remoção de .map em produção.
    // Se o Sentry não estiver configurado, remove .map manualmente (fallback).
    // @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
    sourcemapGuardPlugin(),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@lib': resolve(__dirname, 'src/lib'),
      '@store': resolve(__dirname, 'src/store'),
      '@types': resolve(__dirname, 'src/types'),
      '@assets': resolve(__dirname, 'src/assets'),
      '@background': resolve(__dirname, 'src/background'),
      '@content': resolve(__dirname, 'src/content'),
      '@options': resolve(__dirname, 'src/options'),
      '@overlay': resolve(__dirname, 'src/overlay'),
      '@offscreen': resolve(__dirname, 'src/offscreen'),
      '@sidepanel': resolve(__dirname, 'src/sidepanel'),
    },
  },

  define: {
    // Polyfill para global (necessário para amazon-cognito-identity-js)
    global: 'globalThis',
  },

  build: {
    // Gerar source maps separados para produção (debugging)
    sourcemap: mode === 'production' ? 'hidden' : true,

    // Otimizações de build
    minify: mode === 'production' ? 'esbuild' : false,

    // Diretório de saída
    outDir: 'dist',

    // Limpar diretório antes do build
    emptyOutDir: true,

    rollupOptions: {
      // Incluir offscreen document e capture bridge como entry points adicionais
      input: {
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
        'capture-bridge': resolve(__dirname, 'src/capture-bridge/capture-bridge.html'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        preview: resolve(__dirname, 'src/preview/index.html'),
        'tab-isolation-injector': resolve(__dirname, 'src/content/tab-isolation-injector.ts'),
        'lockdown-injector': resolve(__dirname, 'src/content/lockdown-injector.ts'),
      },
      output: {
        // Separar chunks para melhor cache
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'state-vendor': ['zustand'],
          'crypto-vendor': ['hash-wasm'],
        },
      },
    },
  },

  // Configuração do servidor de desenvolvimento
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },

  // Otimizações de dependências
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', 'hash-wasm', 'axios'],
  },
}));
