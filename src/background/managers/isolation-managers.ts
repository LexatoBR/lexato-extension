/**
 * Gerenciadores de Isolamento - Singletons Compartilhados
 *
 * Este módulo exporta instâncias singleton dos gerenciadores de isolamento
 * para garantir que o mesmo estado seja compartilhado em todo o service worker.
 *
 * IMPORTANTE: Sempre use estas funções em vez de criar novas instâncias.
 *
 * @module IsolationManagers
 */

import { AuditLogger } from '../../lib/audit-logger';
import { TabIsolationManager } from '../tab-isolation-manager';
import { ExtensionIsolationManager } from '../extension-isolation-manager';

// ============================================================================
// Singletons
// ============================================================================

/**
 * Instância singleton do TabIsolationManager
 */
let tabIsolationManagerInstance: TabIsolationManager | null = null;

/**
 * Instância singleton do ExtensionIsolationManager
 */
let extensionIsolationManagerInstance: ExtensionIsolationManager | null = null;

/**
 * Logger padrão para os managers
 */
let defaultLogger: AuditLogger | null = null;

// ============================================================================
// Funções de Acesso aos Singletons
// ============================================================================

/**
 * Obtém ou cria a instância singleton do TabIsolationManager
 *
 * @param logger - Logger para auditoria (opcional, usa default se não fornecido)
 * @returns Instância singleton do TabIsolationManager
 */
export function getTabIsolationManager(logger?: AuditLogger): TabIsolationManager {
  if (!tabIsolationManagerInstance) {
    const loggerToUse = logger ?? defaultLogger ?? new AuditLogger();
    tabIsolationManagerInstance = new TabIsolationManager(loggerToUse);
  }
  return tabIsolationManagerInstance;
}

/**
 * Obtém ou cria a instância singleton do ExtensionIsolationManager
 *
 * @param logger - Logger para auditoria (opcional, usa default se não fornecido)
 * @returns Instância singleton do ExtensionIsolationManager
 */
export function getExtensionIsolationManager(logger?: AuditLogger): ExtensionIsolationManager {
  if (!extensionIsolationManagerInstance) {
    const loggerToUse = logger ?? defaultLogger ?? new AuditLogger();
    extensionIsolationManagerInstance = new ExtensionIsolationManager(loggerToUse);
  }
  return extensionIsolationManagerInstance;
}

/**
 * Define o logger padrão para os managers
 *
 * @param logger - Logger para auditoria
 */
export function setDefaultLogger(logger: AuditLogger): void {
  defaultLogger = logger;
}

/**
 * Reseta os singletons (apenas para testes)
 *
 * @internal
 */
export function resetIsolationManagers(): void {
  tabIsolationManagerInstance = null;
  extensionIsolationManagerInstance = null;
  defaultLogger = null;
}
