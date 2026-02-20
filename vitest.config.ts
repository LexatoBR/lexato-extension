import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Configuração do Vitest para a Extensão Chrome Lexato
 * 
 * Testes unitários com cobertura mínima de 80%
 */
export default defineConfig({
  plugins: [react()],
  
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
    },
  },
  
  test: {
    // Ambiente de teste
    environment: 'jsdom',
    
    // Arquivos de setup
    setupFiles: ['./tests/setup.ts'],
    
    // Padrões de arquivos de teste
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    
    // Excluir
    exclude: [
      'node_modules',
      'dist',
      'coverage',
    ],
    
    // Timeout máximo por teste (10 segundos conforme requisito 19.8)
    testTimeout: 10000,
    
    // Globals para não precisar importar describe, it, expect
    globals: true,
    
    // Cobertura de código
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      
      // Cobertura mínima de 80% (requisito 19.1)
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
      
      // Incluir apenas código fonte
      include: ['src/**/*.{ts,tsx}'],
      
      // Excluir arquivos de configuração e tipos
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
        'src/manifest.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
      ],
    },
    
    // Reporters
    reporters: ['default', 'verbose'],
    
    // Watch mode desabilitado por padrão (usar --watch para ativar)
    watch: false,
  },
});
