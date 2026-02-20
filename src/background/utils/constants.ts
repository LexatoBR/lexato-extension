/**
 * Constantes do Service Worker
 *
 * Centraliza magic numbers e configurações para melhor manutenibilidade.
 *
 * @module ServiceWorkerConstants
 */

// ============================================================================
// Delays e Timeouts
// ============================================================================

/**
 * Delays utilizados no fluxo de captura e operações assíncronas
 * Valores em milissegundos
 */
export const DELAYS = {
  /** Tempo de estabilização após reload da página */
  POST_RELOAD_STABILIZATION_MS: 2000,
  /** Tempo para inicialização do content script */
  CONTENT_SCRIPT_INIT_MS: 300,
  /** Tempo para limpeza do estado de captura após sucesso */
  CAPTURE_STATE_CLEANUP_MS: 5000,
  /** Intervalo entre tentativas de ping ao content script */
  CONTENT_SCRIPT_PING_INTERVAL_MS: 100,
  /** Timeout máximo para aguardar content script */
  CONTENT_SCRIPT_MAX_WAIT_MS: 5000,
  /** Timeout para reload da página */
  PAGE_RELOAD_TIMEOUT_MS: 30000,
  /** Intervalo de polling para status de reload */
  PAGE_RELOAD_POLL_INTERVAL_MS: 100,
} as const;

// ============================================================================
// Chaves de Storage
// ============================================================================

/**
 * Chaves de armazenamento para autenticação e estado
 * 
 * IMPORTANTE: Usar prefixo 'lexato_' para evitar conflitos com outras extensões
 * e manter consistência com auth-manager.ts e handlers de captura.
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'lexato_access_token',
  REFRESH_TOKEN: 'lexato_refresh_token',
  ID_TOKEN: 'lexato_id_token',
  EXPIRES_AT: 'lexato_expires_at',
  OBTAINED_AT: 'lexato_obtained_at',
  USER: 'lexato_user',
  CAPTURE_STATE: 'lexato_capture_state',
  INSTALLED_AT: 'lexato_installed_at',
  VERSION: 'lexato_version',
} as const;

// ============================================================================
// Configuração de Autenticação
// ============================================================================

/**
 * Configuração de autenticação (imutável)
 * Requisitos: 3.1, 3.2, 4.1, 4.3
 */
export const AUTH_CONFIG = Object.freeze({
  /** Tempo antes da expiração para fazer refresh (5 minutos) */
  REFRESH_BEFORE_EXPIRY_MS: 5 * 60 * 1000,
  /** Intervalo de verificação de expiração (1 minuto) */
  CHECK_INTERVAL_MS: 60 * 1000,
  /** Número máximo de tentativas de refresh consecutivas */
  MAX_REFRESH_ATTEMPTS: 3,
  /** Nome do alarme de refresh */
  REFRESH_ALARM_NAME: 'token-refresh-check',
  /** Validade máxima do refresh token (7 dias) - Requisito 4.1, 4.3 */
  REFRESH_TOKEN_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
} as const);

// ============================================================================
// Configuração de Reload
// ============================================================================

/**
 * Configuração para reload de página durante captura
 */
export const RELOAD_CONFIG = Object.freeze({
  /** Timeout máximo para aguardar reload (30s) */
  TIMEOUT_MS: DELAYS.PAGE_RELOAD_TIMEOUT_MS,
  /** Intervalo de polling para verificar status */
  POLL_INTERVAL_MS: DELAYS.PAGE_RELOAD_POLL_INTERVAL_MS,
} as const);

// ============================================================================
// Configuração de Retry
// ============================================================================

/**
 * Configuração para retry com backoff exponencial
 * Requisito 3.7: Retry com backoff exponencial e jitter (30%)
 */
export const RETRY_CONFIG = Object.freeze({
  /** Número máximo de tentativas */
  MAX_ATTEMPTS: 3,
  /** Delay inicial em ms */
  INITIAL_DELAY_MS: 1000,
  /** Fator de multiplicação do delay */
  BACKOFF_FACTOR: 2,
  /** Percentual de jitter (30%) */
  JITTER_PERCENT: 0.3,
} as const);

// ============================================================================
// Configuração de Preview e Confirmação
// ============================================================================

/**
 * URL base do frontend para preview de evidências
 * Requisito 12: Notificações de Pré-Visualização
 *
 * Importado da configuração centralizada de ambiente.
 * Para override em desenvolvimento, configure VITE_FRONTEND_URL no .env.
 *
 * @see src/config/environment.ts - Configuração centralizada
 */
import { getAppUrl } from '../../config/environment';

export const FRONTEND_URL = getAppUrl();

/**
 * Configuração de alarmes para notificações de preview
 * Requisito 12: Notificações de Pré-Visualização
 */
export const PREVIEW_ALARM_CONFIG = Object.freeze({
  /** Prefixo para alarme de lembrete (15 min antes de expirar) */
  REMINDER_PREFIX: 'reminder_',
  /** Prefixo para alarme urgente (5 min antes de expirar) */
  URGENT_PREFIX: 'urgent_',
  /** Prefixo para alarme de expiração */
  EXPIRATION_PREFIX: 'expiration_',
  /** Minutos antes de expirar para lembrete (60 - 15 = 45) */
  REMINDER_DELAY_MINUTES: 45,
  /** Minutos antes de expirar para urgente (60 - 5 = 55) */
  URGENT_DELAY_MINUTES: 55,
  /** Minutos para expiração total */
  EXPIRATION_DELAY_MINUTES: 60,
  /** Tempo total de expiração em minutos */
  EXPIRATION_MINUTES: 60,
} as const);

/**
 * Configuração de badge para evidências pendentes
 */
export const BADGE_CONFIG = Object.freeze({
  /** Cor do badge para evidências pendentes (laranja) */
  PENDING_COLOR: '#FFA500',
  /** Cor do badge para urgente (vermelho) */
  URGENT_COLOR: '#FF0000',
} as const);

// ============================================================================
// Tipos
// ============================================================================

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
