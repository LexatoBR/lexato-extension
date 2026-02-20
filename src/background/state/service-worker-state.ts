/**
 * Estado do Service Worker
 *
 * Encapsula variáveis globais mutáveis em um objeto de estado
 * para melhor testabilidade e controle de mutações.
 *
 * @module ServiceWorkerState
 */

import type { AuditLogger } from '../../lib/audit-logger';
import type { CaptureState } from '../../types/api.types';
import type { ExtensionIsolationManager } from '../extension-isolation-manager';
import type { APIClient } from '../api-client';
import type { UploadHandler } from '../upload-handler';
import { AUTH_CONFIG } from '../utils/constants';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Interface do estado do Service Worker
 */
export interface ServiceWorkerState {
  /** Logger global */
  logger: AuditLogger | null;
  /** Estado de captura em andamento */
  captureState: CaptureState | null;
  /** Cliente de API */
  apiClient: APIClient | null;
  /** Handler de upload */
  uploadHandler: UploadHandler | null;
  /** Flag de refresh em andamento */
  isRefreshing: boolean;
  /** Gerenciador de isolamento */
  isolationManager: ExtensionIsolationManager | null;
  /** Flag de isolamento ativo para captura */
  isIsolationActive: boolean;
}

/**
 * Estado do gerenciador de refresh de tokens
 */
export interface RefreshState {
  /** Contador de falhas consecutivas */
  failureCount: number;
  /** Incrementa contador de falhas */
  incrementFailure(): number;
  /** Reseta contador após sucesso */
  resetFailures(): void;
  /** Verifica se atingiu limite de falhas */
  hasExceededMaxAttempts(): boolean;
}

// ============================================================================
// Estado Global
// ============================================================================

/**
 * Estado global do Service Worker
 * Encapsula todas as variáveis mutáveis
 */
export const serviceWorkerState: ServiceWorkerState = {
  logger: null,
  captureState: null,
  apiClient: null,
  uploadHandler: null,
  isRefreshing: false,
  isolationManager: null,
  isIsolationActive: false,
};

/**
 * Estado do gerenciador de refresh de tokens
 * Encapsula controle de falhas consecutivas para melhor testabilidade
 * Requisito 3.1: Tratamento de erros de refresh
 */
export const refreshState: RefreshState = {
  failureCount: 0,

  incrementFailure(): number {
    return ++this.failureCount;
  },

  resetFailures(): void {
    this.failureCount = 0;
  },

  hasExceededMaxAttempts(): boolean {
    return this.failureCount >= AUTH_CONFIG.MAX_REFRESH_ATTEMPTS;
  },
};

// ============================================================================
// Funções de Acesso ao Estado
// ============================================================================

/**
 * Obtém estado de captura atual
 */
export function getCaptureState(): CaptureState | null {
  return serviceWorkerState.captureState;
}

/**
 * Define estado de captura
 */
export function setCaptureState(state: CaptureState | null): void {
  serviceWorkerState.captureState = state;
}

/**
 * Atualiza estado de captura parcialmente
 */
export function updateCaptureStatePartial(updates: Partial<CaptureState>): void {
  if (serviceWorkerState.captureState) {
    Object.assign(serviceWorkerState.captureState, updates);
  }
}

/**
 * Verifica se há captura em andamento
 */
export function hasCaptureInProgress(): boolean {
  const state = serviceWorkerState.captureState;
  return !!(state && state.status !== 'completed' && state.status !== 'failed');
}

/**
 * Obtém flag de isolamento ativo
 */
export function isIsolationActive(): boolean {
  return serviceWorkerState.isIsolationActive;
}

/**
 * Define flag de isolamento ativo
 */
export function setIsolationActive(active: boolean): void {
  serviceWorkerState.isIsolationActive = active;
}

/**
 * Obtém flag de refresh em andamento
 */
export function isRefreshInProgress(): boolean {
  return serviceWorkerState.isRefreshing;
}

/**
 * Define flag de refresh em andamento
 */
export function setRefreshInProgress(inProgress: boolean): void {
  serviceWorkerState.isRefreshing = inProgress;
}

// ============================================================================
// Reset de Estado (para testes)
// ============================================================================

/**
 * Reseta todo o estado do Service Worker
 * Útil para testes unitários
 */
export function resetServiceWorkerState(): void {
  serviceWorkerState.logger = null;
  serviceWorkerState.captureState = null;
  serviceWorkerState.apiClient = null;
  serviceWorkerState.uploadHandler = null;
  serviceWorkerState.isRefreshing = false;
  serviceWorkerState.isolationManager = null;
  serviceWorkerState.isIsolationActive = false;
  refreshState.failureCount = 0;
}
