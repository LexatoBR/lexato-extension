/**
 * @fileoverview Configuração de ambiente da Extensão Chrome Lexato
 * @description Configuração centralizada de ambientes.
 *
 * AMBIENTES:
 * - dev: Desenvolvimento local
 * - staging: Homologação e testes integrados
 * - prod: Produção
 *
 * VARIÁVEIS VITE:
 * - VITE_LEXATO_ENV: Ambiente (dev/staging/prod)
 * - VITE_API_BASE_URL: Override da URL da API (opcional)
 * - VITE_FRONTEND_URL: Override da URL do frontend (opcional)
 *
 * @author Equipe Lexato
 * @created 2026-01-29
 */

// =============================================================================
// TIPOS
// =============================================================================

/**
 * Ambientes suportados pelo sistema Lexato.
 */
export type Environment = 'dev' | 'staging' | 'prod';

/**
 * Configuração completa de um ambiente
 */
export interface EnvironmentConfig {
  /** Identificador do ambiente */
  id: Environment;
  /** Nome legível do ambiente (para logs e Sentry) */
  name: string;
  /** Indica se é ambiente de produção */
  isProduction: boolean;
  /** Região AWS padrão */
  awsRegion: string;
  /** URL base da API REST */
  apiUrl: string;
  /** URL do frontend principal - app */
  appUrl: string;
  /** URL do painel administrativo */
  adminUrl: string;
  /** URL do verificador público */
  verificadorUrl: string;
  /** URL do WebSocket para notificações */
  wsUrl: string;
  /** URL do CDN para assets */
  cdnUrl: string;
}

// =============================================================================
// CONFIGURAÇÕES DOS AMBIENTES
// =============================================================================

/**
 * Configurações de cada ambiente.
 *
 * IMPORTANTE: URLs de produção devem usar domínios customizados,
 * NUNCA URLs diretas do API Gateway (ex: *.execute-api.amazonaws.com)
 */
export const environments: Record<Environment, EnvironmentConfig> = {
  /**
   * Ambiente de desenvolvimento local
   */
  dev: {
    id: 'dev',
    name: 'development',
    isProduction: false,
    awsRegion: 'sa-east-1',
    apiUrl: 'http://127.0.0.1:3000',
    appUrl: 'http://127.0.0.1:3000',
    adminUrl: 'http://127.0.0.1:3002',
    verificadorUrl: 'http://127.0.0.1:3003',
    wsUrl: 'ws://127.0.0.1:3001',
    cdnUrl: 'http://127.0.0.1:3001',
  },

  /**
   * Ambiente de staging/homologação
   * NOTA: Todas as URLs de staging devem ser configuradas via variáveis de ambiente.
   * Veja .env.example para referência.
   */
  staging: {
    id: 'staging',
    name: 'staging',
    isProduction: false,
    awsRegion: 'sa-east-1',
    apiUrl: (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? 'http://localhost:3000',
    appUrl: (import.meta.env['VITE_FRONTEND_URL'] as string | undefined) ?? 'http://localhost:3001',
    adminUrl: (import.meta.env['VITE_ADMIN_URL'] as string | undefined) ?? 'http://localhost:3002',
    verificadorUrl: (import.meta.env['VITE_VERIFICADOR_URL'] as string | undefined) ?? 'http://localhost:3003',
    wsUrl: (import.meta.env['VITE_WS_URL'] as string | undefined) ?? 'ws://localhost:3001',
    cdnUrl: (import.meta.env['VITE_CDN_URL'] as string | undefined) ?? 'http://localhost:3001',
  },

  /**
   * Ambiente de produção
   *
   * API Gateway Custom Domain: api.lexato.com.br
   * Região AWS: sa-east-1
   */
  prod: {
    id: 'prod',
    name: 'production',
    isProduction: true,
    awsRegion: 'sa-east-1',
    apiUrl: 'https://api.lexato.com.br',
    appUrl: 'https://app.lexato.com.br',
    adminUrl: 'https://admin.lexato.com.br',
    verificadorUrl: 'https://verificar.lexato.com.br',
    wsUrl: (import.meta.env['VITE_WS_URL'] as string | undefined) ?? 'wss://ws.lexato.com.br',
    cdnUrl: 'https://cdn.lexato.com.br',
  },
} as const;

// =============================================================================
// CONSTANTES
// =============================================================================

/**
 * Lista de ambientes válidos
 */
export const VALID_ENVIRONMENTS: readonly Environment[] = ['dev', 'staging', 'prod'] as const;

/**
 * Ambiente padrão quando não especificado
 */
export const DEFAULT_ENVIRONMENT: Environment = 'dev';

// =============================================================================
// FUNÇÕES DE VALIDAÇÃO
// =============================================================================

/**
 * Verifica se um valor é um ambiente válido
 */
export function isValidEnvironment(value: unknown): value is Environment {
  return typeof value === 'string' && VALID_ENVIRONMENTS.includes(value as Environment);
}

/**
 * Obtém a configuração de um ambiente
 */
export function getEnvironmentConfig(env: Environment): EnvironmentConfig {
  if (!isValidEnvironment(env)) {
    throw new Error(
      `Ambiente inválido: "${String(env)}". Ambientes válidos: ${VALID_ENVIRONMENTS.join(', ')}`
    );
  }
  return environments[env];
}

// =============================================================================
// DETECÇÃO DE AMBIENTE (VITE)
// =============================================================================

/**
 * Detecta o ambiente atual baseado em variáveis do Vite.
 *
 * Ordem de prioridade:
 * 1. VITE_LEXATO_ENV (novo padrão)
 * 2. VITE_ENV (legado)
 * 3. import.meta.env.MODE mapeado
 * 4. Default: 'dev' em DEV, 'prod' em PROD
 */
export function detectCurrentEnvironment(): Environment {
  // 1. Prioridade: VITE_LEXATO_ENV (novo padrão)
  const lexatoEnv = import.meta.env['VITE_LEXATO_ENV'];
  if (lexatoEnv && isValidEnvironment(lexatoEnv)) {
    return lexatoEnv;
  }

  // 2. VITE_ENV (legado)
  const viteEnv = import.meta.env['VITE_ENV'];
  if (viteEnv) {
    // Mapear valores legados
    if (viteEnv === 'development') {
      return 'dev';
    }
    if (viteEnv === 'production') {
      return 'prod';
    }
    if (isValidEnvironment(viteEnv)) {
      return viteEnv;
    }
  }

  // 3. import.meta.env.MODE
  const mode = import.meta.env.MODE;
  if (mode === 'development') {
    return 'dev';
  }
  if (mode === 'production') {
    return 'prod';
  }

  // 4. Default baseado em DEV/PROD
  if (import.meta.env.DEV) {
    return 'dev';
  }
  if (import.meta.env.PROD) {
    return 'prod';
  }

  return DEFAULT_ENVIRONMENT;
}

// =============================================================================
// CACHE DE CONFIGURAÇÃO
// =============================================================================

let cachedEnvironment: Environment | null = null;
let cachedConfig: EnvironmentConfig | null = null;

/**
 * Obtém o ambiente atual (com cache).
 */
export function getCurrentEnv(): Environment {
  cachedEnvironment ??= detectCurrentEnvironment();
  return cachedEnvironment;
}

/**
 * Obtém a configuração completa do ambiente atual (com cache).
 * Aplica overrides de variáveis VITE se definidas.
 *
 * @example
 * const config = getEnvironment();
 * console.log(config.apiUrl); // https://api.lexato.com.br
 */
export function getEnvironment(): EnvironmentConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const baseConfig = getEnvironmentConfig(getCurrentEnv());

  // Aplicar overrides de variáveis VITE (para desenvolvimento/debug)
  // Usa ?? para nullish coalescing (apenas null/undefined, não strings vazias)
  cachedConfig = {
    ...baseConfig,
    apiUrl: (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? baseConfig.apiUrl,
    appUrl: (import.meta.env['VITE_FRONTEND_URL'] as string | undefined) ?? baseConfig.appUrl,
    wsUrl: (import.meta.env['VITE_WS_URL'] as string | undefined) ?? baseConfig.wsUrl,
  };

  return cachedConfig;
}

// =============================================================================
// FUNÇÕES UTILITÁRIAS
// =============================================================================

/**
 * Verifica se está em ambiente de produção.
 */
export function isProd(): boolean {
  return getCurrentEnv() === 'prod';
}

/**
 * Verifica se está em ambiente de staging.
 */
export function isStaging(): boolean {
  return getCurrentEnv() === 'staging';
}

/**
 * Verifica se está em ambiente de desenvolvimento.
 */
export function isDev(): boolean {
  return getCurrentEnv() === 'dev';
}

/**
 * Verifica se debug está habilitado.
 */
export function isDebugEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env['VITE_DEBUG'] === 'true';
}

/**
 * Obtém URL da API para o ambiente atual.
 */
export function getApiUrl(): string {
  return getEnvironment().apiUrl;
}

/**
 * Obtém URL do frontend (app) para o ambiente atual.
 */
export function getAppUrl(): string {
  return getEnvironment().appUrl;
}

/**
 * Obtém URL do WebSocket para o ambiente atual.
 */
export function getWsUrl(): string {
  return getEnvironment().wsUrl;
}

/**
 * Obtém URL do CDN para o ambiente atual.
 */
export function getCdnUrl(): string {
  return getEnvironment().cdnUrl;
}

/**
 * Obtém nome do ambiente para Sentry.
 */
export function getSentryEnvironment(): string {
  return getEnvironment().name;
}

/**
 * Limpa o cache de configuração.
 */
export function clearEnvironmentCache(): void {
  cachedEnvironment = null;
  cachedConfig = null;
}
