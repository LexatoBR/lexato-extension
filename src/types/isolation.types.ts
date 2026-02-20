/**
 * Tipos para o Modo de Isolamento de Extensões
 *
 * Define interfaces e tipos para gerenciamento de extensões durante captura.
 * O isolamento desativa temporariamente extensões de terceiros para garantir
 * integridade da prova digital.
 *
 * @module IsolationTypes
 * @see Requirements 1-10 do Extension Isolation Mode
 */

// ============================================================================
// Tipos Chrome (definidos localmente para compatibilidade)
// ============================================================================

/**
 * Tipo de instalação da extensão
 */
export type ExtensionInstallType =
  | 'admin'
  | 'development'
  | 'normal'
  | 'sideload'
  | 'other';

/**
 * Tipo da extensão
 */
export type ExtensionType =
  | 'extension'
  | 'hosted_app'
  | 'packaged_app'
  | 'legacy_packaged_app'
  | 'theme'
  | 'login_screen_extension';

// ============================================================================
// Enums
// ============================================================================

/**
 * Códigos de erro específicos do isolamento
 * Requirement 8.4
 */
export enum IsolationErrorCode {
  /** Permissão management não disponível */
  PERMISSION_DENIED = 'ISOLATION_PERMISSION_DENIED',
  /** Falha ao listar extensões */
  LIST_FAILED = 'ISOLATION_LIST_FAILED',
  /** Falha ao criar snapshot */
  SNAPSHOT_FAILED = 'ISOLATION_SNAPSHOT_FAILED',
  /** Timeout na desativação */
  DISABLE_TIMEOUT = 'ISOLATION_DISABLE_TIMEOUT',
  /** Timeout na restauração */
  RESTORE_TIMEOUT = 'ISOLATION_RESTORE_TIMEOUT',
  /** Snapshot corrompido ou modificado */
  SNAPSHOT_CORRUPTED = 'ISOLATION_SNAPSHOT_CORRUPTED',
  /** Violação detectada durante captura */
  VIOLATION_DETECTED = 'ISOLATION_VIOLATION_DETECTED',
  /** Extensão Lexato desativada (crítico) */
  LEXATO_DISABLED = 'ISOLATION_LEXATO_DISABLED',
  /** Isolamento já ativo */
  ALREADY_ACTIVE = 'ISOLATION_ALREADY_ACTIVE',
  /** Isolamento não ativo */
  NOT_ACTIVE = 'ISOLATION_NOT_ACTIVE',
  /** Snapshot não encontrado */
  SNAPSHOT_NOT_FOUND = 'ISOLATION_SNAPSHOT_NOT_FOUND',
}

// ============================================================================
// Interfaces de Extensão
// ============================================================================

/**
 * Informações de uma extensão para o snapshot
 * Requirement 3.2
 */
export interface ExtensionEntry {
  /** ID único da extensão */
  id: string;
  /** Nome da extensão */
  name: string;
  /** Se estava habilitada antes do isolamento */
  wasEnabled: boolean;
  /** Se pode ser desabilitada */
  mayDisable: boolean;
  /** Tipo de instalação (admin, development, normal, sideload, other) */
  installType: ExtensionInstallType;
  /** Tipo da extensão */
  type: ExtensionType;
  /** Versão da extensão */
  version: string;
}

/**
 * Snapshot do estado das extensões
 * Requirements 3.1, 3.2, 3.3, 3.5
 */
export interface ExtensionSnapshot {
  /** ID único do snapshot */
  id: string;
  /** CorrelationId da captura associada */
  correlationId: string;
  /** Timestamp de criação */
  createdAt: number;
  /** Lista de extensões no momento do snapshot */
  extensions: ExtensionEntry[];
  /** Hash SHA-256 do snapshot para validação */
  hash: string;
  /** ID da extensão Lexato (para validação) */
  lexatoExtensionId: string;
}

// ============================================================================
// Interfaces de Resultado
// ============================================================================

/**
 * Resultado da ativação do isolamento
 * Requirement 4
 */
export interface IsolationResult {
  /** Se o isolamento foi ativado com sucesso */
  success: boolean;
  /** Snapshot criado */
  snapshot: ExtensionSnapshot | null;
  /** IDs das extensões desativadas */
  disabledExtensions: string[];
  /** Extensões que não puderam ser desativadas */
  nonDisableableExtensions: ExtensionEntry[];
  /** Erro se houver */
  error?: string;
  /** Código de erro se houver */
  errorCode?: IsolationErrorCode;
  /** Tempo total da operação (ms) */
  elapsedMs: number;
}

/**
 * Resultado da restauração
 * Requirement 5
 */
export interface RestoreResult {
  /** Se a restauração foi bem-sucedida */
  success: boolean;
  /** IDs das extensões restauradas */
  restoredExtensions: string[];
  /** Extensões que falharam ao restaurar */
  failedExtensions: Array<{ id: string; name: string; error: string }>;
  /** Erro geral se houver */
  error?: string;
  /** Código de erro se houver */
  errorCode?: IsolationErrorCode;
  /** Tempo total da operação (ms) */
  elapsedMs: number;
}

// ============================================================================
// Interfaces de Status
// ============================================================================

/**
 * Status atual do isolamento
 * Requirement 7.3
 */
export interface IsolationStatus {
  /** Se o isolamento está ativo */
  isActive: boolean;
  /** Snapshot atual (se ativo) */
  snapshot: ExtensionSnapshot | null;
  /** Quantidade de extensões desativadas */
  disabledCount: number;
  /** Quantidade de extensões não desativáveis */
  nonDisableableCount: number;
  /** IDs das extensões desativadas */
  disabledExtensionIds: string[];
  /** Extensões não desativáveis (admin) */
  nonDisableableExtensions: ExtensionEntry[];
}

// ============================================================================
// Interfaces de Configuração
// ============================================================================

/**
 * Configuração do isolamento
 * Requirement 8
 */
export interface IsolationConfig {
  /** Timeout para desativação (ms) - padrão 30000 */
  disableTimeout: number;
  /** Timeout para restauração (ms) - padrão 30000 */
  restoreTimeout: number;
  /** Idade máxima de snapshot órfão (ms) - padrão 3600000 (1 hora) */
  orphanSnapshotMaxAge: number;
  /** Tipos de extensão a excluir da desativação */
  excludedTypes: ExtensionType[];
  /** Chave de storage para snapshot */
  snapshotStorageKey: string;
}

// ============================================================================
// Interfaces de Violação
// ============================================================================

/**
 * Violação detectada durante isolamento
 * Requirement 10.3, 10.4
 */
export interface IsolationViolation {
  /** Tipo de violação */
  type: 'extension_reactivated' | 'new_extension_installed' | 'lexato_disabled';
  /** Timestamp da detecção */
  timestamp: number;
  /** ID da extensão envolvida */
  extensionId: string;
  /** Nome da extensão */
  extensionName: string;
  /** Detalhes adicionais */
  details: Record<string, unknown>;
}

// ============================================================================
// Interfaces de Persistência
// ============================================================================

/**
 * Estrutura do snapshot persistido em chrome.storage.local
 * Requirement 3.4
 */
export interface PersistedSnapshot {
  /** Snapshot completo */
  snapshot: ExtensionSnapshot;
  /** Timestamp de persistência */
  persistedAt: number;
  /** Versão da extensão que criou */
  version: string;
}

// ============================================================================
// Interfaces de Preview
// ============================================================================

/**
 * Resultado do preview de isolamento
 * Requirement 7.2
 */
export interface IsolationPreview {
  /** Extensões que serão desativadas */
  extensionsToDisable: ExtensionEntry[];
  /** Extensões que não podem ser desativadas */
  nonDisableableExtensions: ExtensionEntry[];
  /** Total de extensões instaladas */
  totalExtensions: number;
  /** Total que será desativado */
  toDisableCount: number;
  /** Total não desativável */
  nonDisableableCount: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Verifica se objeto é ExtensionEntry válido
 */
export function isExtensionEntry(obj: unknown): obj is ExtensionEntry {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const entry = obj as Record<string, unknown>;
  return (
    typeof entry['id'] === 'string' &&
    typeof entry['name'] === 'string' &&
    typeof entry['wasEnabled'] === 'boolean' &&
    typeof entry['mayDisable'] === 'boolean' &&
    typeof entry['installType'] === 'string' &&
    typeof entry['type'] === 'string' &&
    typeof entry['version'] === 'string'
  );
}

/**
 * Verifica se objeto é ExtensionSnapshot válido
 */
export function isExtensionSnapshot(obj: unknown): obj is ExtensionSnapshot {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const snapshot = obj as Record<string, unknown>;
  return (
    typeof snapshot['id'] === 'string' &&
    typeof snapshot['correlationId'] === 'string' &&
    typeof snapshot['createdAt'] === 'number' &&
    Array.isArray(snapshot['extensions']) &&
    typeof snapshot['hash'] === 'string' &&
    typeof snapshot['lexatoExtensionId'] === 'string'
  );
}

/**
 * Verifica se objeto é PersistedSnapshot válido
 */
export function isPersistedSnapshot(obj: unknown): obj is PersistedSnapshot {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const persisted = obj as Record<string, unknown>;
  return (
    isExtensionSnapshot(persisted['snapshot']) &&
    typeof persisted['persistedAt'] === 'number' &&
    typeof persisted['version'] === 'string'
  );
}
