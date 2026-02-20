/**
 * Configuração do Sentry para upload de source maps
 *
 * Este arquivo é usado apenas durante o build de produção para
 * fazer upload dos source maps para o Sentry, permitindo melhor
 * debugging de erros em produção.
 *
 * @module ViteConfigSentry
 */

import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin } from 'vite';

/**
 * Retorna o plugin do Sentry se configurado corretamente
 *
 * @param mode - Modo de build (development | staging | production)
 * @returns Plugin do Sentry ou array vazio
 */
export function getSentryPlugin(mode: string): Plugin[] {
  // Só ativa em produção ou staging
  if (mode !== 'production' && mode !== 'staging') {
    return [];
  }

  // Verifica se as variáveis de ambiente estão configuradas
  // Configure SENTRY_ORG e SENTRY_PROJECT no seu .env ou CI/CD
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!authToken) {
    console.warn('[Sentry] SENTRY_AUTH_TOKEN não configurado, source maps não serão enviados');
    return [];
  }

  if (!org || !project) {
    console.warn('[Sentry] SENTRY_ORG e SENTRY_PROJECT são obrigatórios para upload de source maps');
    return [];
  }

  console.info('[Sentry] Configurando upload de source maps para', { org, project });

  return [
    sentryVitePlugin({
      org,
      project,
      authToken,

      // Configurações de upload
      sourcemaps: {
        // Envia source maps automaticamente
        assets: './dist/**',

        // Remove source maps do bundle final
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },

      // Release
      release: {
        // Usa a versão do manifest.json
        name: `chrome-extension@${process.env.npm_package_version || 'unknown'}`,

        // Limpa releases antigas
        cleanArtifacts: true,

        // Define como release de produção
        setCommits: {
          auto: true,
        },
      },

      // Configurações de telemetria
      telemetry: false,

      // Silencia logs em CI
      silent: process.env.CI === 'true',
    }),
  ];
}