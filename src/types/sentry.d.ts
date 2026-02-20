/**
 * Tipos do Sentry para a extensão Chrome
 *
 * Define os tipos customizados usados na integração com o Sentry.
 *
 * @module SentryTypes
 */

declare module '@sentry/browser' {
  export * from '@sentry/browser';
}

/**
 * Declaração das variáveis de ambiente do Sentry
 */
interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ENV?: 'development' | 'staging' | 'production';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}