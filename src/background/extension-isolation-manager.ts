/**
 * ExtensionIsolationManager - Gerenciador de Isolamento de Extensões
 *
 * Desativa temporariamente extensões de terceiros durante captura de evidências
 * para garantir integridade da prova digital. Utiliza chrome.management API.
 *
 * Funcionalidades:
 * - Listagem e filtragem de extensões elegíveis
 * - Criação de snapshot do estado atual
 * - Desativação em paralelo com timeout
 * - Restauração garantida (mesmo em caso de erro)
 * - Recuperação de snapshots órfãos
 * - Detecção de violações durante captura
 *
 * @module ExtensionIsolationManager
 * @see Requirements 1-10 do Extension Isolation Mode
 */

import { AuditLogger } from '../lib/audit-logger';
import { permissionHelper } from '../lib/permissions/permission-helper';
import type {
  ExtensionEntry,
  ExtensionSnapshot,
  IsolationResult,
  RestoreResult,
  IsolationStatus,
  IsolationConfig,
  IsolationPreview,
  PersistedSnapshot,
  IsolationViolation,
  IsolationErrorCode,
  ExtensionType,
  ExtensionInstallType,
} from '../types/isolation.types';
import { isPersistedSnapshot } from '../types/isolation.types';

// ============================================================================
// Constantes e Configuração Padrão
// ============================================================================

/**
 * Configuração padrão do isolamento
 */
const DEFAULT_CONFIG: IsolationConfig = {
  /** Timeout para processo de desativação (ms) */
  disableTimeout: 30000,
  /** Timeout para processo de restauração (ms) */
  restoreTimeout: 30000,
  /** Tempo máximo para snapshot órfão (ms) - 1 hora */
  orphanSnapshotMaxAge: 3600000,
  /** Tipos de extensão a excluir */
  excludedTypes: ['theme', 'login_screen_extension'] as ExtensionType[],
  /** Chave de storage para snapshot */
  snapshotStorageKey: 'lexato_isolation_snapshot',
};


// ============================================================================
// ExtensionIsolationManager
// ============================================================================

/**
 * ExtensionIsolationManager - Gerencia isolamento de extensões durante captura
 *
 * @example
 * ```typescript
 * const logger = new AuditLogger(correlationId);
 * const manager = new ExtensionIsolationManager(logger);
 *
 * // Ativar isolamento
 * const result = await manager.activateIsolation(correlationId);
 * if (result.success) {
 *   // Prosseguir com captura
 * }
 *
 * // Após captura, restaurar
 * await manager.deactivateIsolation();
 * ```
 */
export class ExtensionIsolationManager {
  private logger: AuditLogger;
  private config: IsolationConfig;
  private isIsolationActive = false;
  private currentSnapshot: ExtensionSnapshot | null = null;
  private disabledExtensions: string[] = [];
  private nonDisableableExtensions: ExtensionEntry[] = [];
  private ownExtensionId: string;
  private violations: IsolationViolation[] = [];

  /**
   * Cria nova instância do ExtensionIsolationManager
   *
   * @param logger - Instância do AuditLogger para registro de eventos
   * @param config - Configuração opcional (usa padrões se não fornecida)
   */
  constructor(logger: AuditLogger, config?: Partial<IsolationConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ownExtensionId = this.getOwnExtensionId();
  }

  // ==========================================================================
  // Métodos Públicos
  // ==========================================================================

  /**
   * Ativa o modo de isolamento desativando extensões de terceiros
   * Requirements 4.1-4.8
   *
   * @param correlationId - ID de correlação da captura
   * @returns Resultado da ativação com snapshot e lista de extensões
   */
  async activateIsolation(correlationId: string): Promise<IsolationResult> {
    const startTime = Date.now();

    // Verificar se já está ativo
    if (this.isIsolationActive) {
      this.logger.warn('ISOLATION', 'ALREADY_ACTIVE', {
        currentSnapshotId: this.currentSnapshot?.id,
      });
      return {
        success: false,
        snapshot: this.currentSnapshot,
        disabledExtensions: this.disabledExtensions,
        nonDisableableExtensions: this.nonDisableableExtensions,
        error: 'Isolamento já está ativo',
        errorCode: 'ISOLATION_ALREADY_ACTIVE' as IsolationErrorCode,
        elapsedMs: Date.now() - startTime,
      };
    }

    this.logger.info('ISOLATION', 'ACTIVATION_START', { correlationId });

    try {
      // 1. Listar e filtrar extensões elegíveis
      const allExtensions = await this.listAllExtensions();
      const { eligible, nonDisableable } = this.filterEligibleExtensions(allExtensions);

      this.nonDisableableExtensions = nonDisableable;

      // Registrar extensões não desativáveis
      if (nonDisableable.length > 0) {
        this.logger.warn('ISOLATION', 'NON_DISABLEABLE_EXTENSIONS', {
          count: nonDisableable.length,
          extensions: nonDisableable.map((e) => ({ id: e.id, name: e.name })),
        });
      }

      // 2. Criar snapshot
      const snapshot = await this.createSnapshot(correlationId, eligible);
      this.currentSnapshot = snapshot;

      // 3. Persistir snapshot antes de desativar
      await this.persistSnapshot(snapshot);

      // 4. Desativar extensões em paralelo com timeout
      const disableResults = await this.disableExtensionsWithTimeout(eligible);

      this.disabledExtensions = disableResults.disabled;
      this.isIsolationActive = true;

      this.logger.info('ISOLATION', 'ACTIVATION_COMPLETE', {
        correlationId,
        snapshotId: snapshot.id,
        snapshotHash: snapshot.hash,
        disabledCount: disableResults.disabled.length,
        failedCount: disableResults.failed.length,
        nonDisableableCount: nonDisableable.length,
        elapsedMs: Date.now() - startTime,
      });

      return {
        success: true,
        snapshot,
        disabledExtensions: disableResults.disabled,
        nonDisableableExtensions: nonDisableable,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('ISOLATION', 'ACTIVATION_FAILED', {
        correlationId,
        error: errorMessage,
      });

      // Tentar restaurar se algo foi desativado
      if (this.disabledExtensions.length > 0) {
        await this.forceRestore();
      }

      return {
        success: false,
        snapshot: null,
        disabledExtensions: [],
        nonDisableableExtensions: [],
        error: errorMessage,
        errorCode: 'ISOLATION_SNAPSHOT_FAILED' as IsolationErrorCode,
        elapsedMs: Date.now() - startTime,
      };
    }
  }


  /**
   * Desativa o modo de isolamento restaurando extensões
   * Requirements 5.1-5.8
   *
   * @returns Resultado da restauração
   */
  async deactivateIsolation(): Promise<RestoreResult> {
    const startTime = Date.now();

    if (!this.isIsolationActive || !this.currentSnapshot) {
      this.logger.warn('ISOLATION', 'NOT_ACTIVE', {});
      return {
        success: false,
        restoredExtensions: [],
        failedExtensions: [],
        error: 'Isolamento não está ativo',
        errorCode: 'ISOLATION_NOT_ACTIVE' as IsolationErrorCode,
        elapsedMs: Date.now() - startTime,
      };
    }

    this.logger.info('ISOLATION', 'DEACTIVATION_START', {
      snapshotId: this.currentSnapshot.id,
      snapshotHash: this.currentSnapshot.hash,
      extensionsToRestore: this.disabledExtensions.length,
    });

    try {
      // 1. Carregar e validar snapshot
      const persistedSnapshot = await this.loadSnapshot();
      if (!persistedSnapshot) {
        throw new Error('Snapshot não encontrado no storage');
      }

      // 2. Validar hash do snapshot
      const isValid = await this.validateSnapshotHash(persistedSnapshot.snapshot);
      if (!isValid) {
        this.logger.error('ISOLATION', 'SNAPSHOT_HASH_INVALID', {
          snapshotId: persistedSnapshot.snapshot.id,
          snapshotHash: persistedSnapshot.snapshot.hash,
        });
        // Continuar mesmo com hash inválido, mas registrar
      }

      // 3. Restaurar extensões em paralelo com timeout
      const restoreResults = await this.restoreExtensionsWithTimeout(
        persistedSnapshot.snapshot.extensions
      );

      // 4. Remover snapshot após sucesso
      if (restoreResults.failed.length === 0) {
        await this.removeSnapshot();
      } else {
        this.logger.warn('ISOLATION', 'SNAPSHOT_KEPT_DUE_TO_FAILURES', {
          failedCount: restoreResults.failed.length,
        });
      }

      // 5. Resetar estado
      this.isIsolationActive = false;
      this.currentSnapshot = null;
      this.disabledExtensions = [];
      this.violations = [];

      this.logger.info('ISOLATION', 'DEACTIVATION_COMPLETE', {
        snapshotHash: persistedSnapshot.snapshot.hash,
        restoredCount: restoreResults.restored.length,
        failedCount: restoreResults.failed.length,
        elapsedMs: Date.now() - startTime,
      });

      return {
        success: restoreResults.failed.length === 0,
        restoredExtensions: restoreResults.restored,
        failedExtensions: restoreResults.failed,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('ISOLATION', 'DEACTIVATION_FAILED', { error: errorMessage });

      return {
        success: false,
        restoredExtensions: [],
        failedExtensions: [],
        error: errorMessage,
        errorCode: 'ISOLATION_RESTORE_TIMEOUT' as IsolationErrorCode,
        elapsedMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Alias para deactivateIsolation para compatibilidade
   * Usado pelo handler de cancelamento
   */
  async restore(): Promise<RestoreResult> {
    return this.deactivateIsolation();
  }

  /**
   * Obtém status atual do isolamento
   * Requirement 7.3
   */
  getIsolationStatus(): IsolationStatus {
    return {
      isActive: this.isIsolationActive,
      snapshot: this.currentSnapshot,
      disabledCount: this.disabledExtensions.length,
      nonDisableableCount: this.nonDisableableExtensions.length,
      disabledExtensionIds: [...this.disabledExtensions],
      nonDisableableExtensions: [...this.nonDisableableExtensions],
    };
  }

  /**
   * Força restauração manual (para recuperação de erros)
   * Requirement 8.5
   */
  async forceRestore(): Promise<RestoreResult> {
    const startTime = Date.now();
    this.logger.info('ISOLATION', 'FORCE_RESTORE_START', {
      currentSnapshotHash: this.currentSnapshot?.hash ?? null,
    });

    try {
      const persistedSnapshot = await this.loadSnapshot();

      if (!persistedSnapshot) {
        // Sem snapshot, tentar restaurar todas as extensões desativadas conhecidas
        if (this.disabledExtensions.length > 0) {
          const results = await this.restoreExtensionsByIds(this.disabledExtensions);
          this.resetState();
          return {
            success: results.failed.length === 0,
            restoredExtensions: results.restored,
            failedExtensions: results.failed,
            elapsedMs: Date.now() - startTime,
          };
        }

        return {
          success: true,
          restoredExtensions: [],
          failedExtensions: [],
          elapsedMs: Date.now() - startTime,
        };
      }

      // Restaurar do snapshot
      const results = await this.restoreExtensionsWithTimeout(persistedSnapshot.snapshot.extensions);
      await this.removeSnapshot();
      this.resetState();

      this.logger.info('ISOLATION', 'FORCE_RESTORE_COMPLETE', {
        snapshotHash: persistedSnapshot.snapshot.hash,
        restoredCount: results.restored.length,
        failedCount: results.failed.length,
      });

      return {
        success: results.failed.length === 0,
        restoredExtensions: results.restored,
        failedExtensions: results.failed,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('ISOLATION', 'FORCE_RESTORE_FAILED', { error: errorMessage });

      return {
        success: false,
        restoredExtensions: [],
        failedExtensions: [],
        error: errorMessage,
        elapsedMs: Date.now() - startTime,
      };
    }
  }


  /**
   * Verifica e restaura snapshots pendentes (chamado no startup)
   * Requirements 8.1, 8.2, 8.3, 8.6
   */
  async checkPendingSnapshots(): Promise<void> {
    this.logger.info('ISOLATION', 'CHECK_PENDING_SNAPSHOTS', {});

    try {
      const persistedSnapshot = await this.loadSnapshot();

      if (!persistedSnapshot) {
        this.logger.info('ISOLATION', 'NO_PENDING_SNAPSHOTS', {});
        return;
      }

      const snapshotAge = Date.now() - persistedSnapshot.persistedAt;

      // Verificar se snapshot é muito antigo (órfão)
      if (snapshotAge > this.config.orphanSnapshotMaxAge) {
        this.logger.warn('ISOLATION', 'ORPHAN_SNAPSHOT_FOUND', {
          snapshotId: persistedSnapshot.snapshot.id,
          snapshotHash: persistedSnapshot.snapshot.hash,
          ageMs: snapshotAge,
          maxAgeMs: this.config.orphanSnapshotMaxAge,
        });
      }

      // Restaurar extensões do snapshot pendente
      this.logger.info('ISOLATION', 'RESTORING_PENDING_SNAPSHOT', {
        snapshotId: persistedSnapshot.snapshot.id,
        snapshotHash: persistedSnapshot.snapshot.hash,
        extensionsCount: persistedSnapshot.snapshot.extensions.length,
      });

      const results = await this.restoreExtensionsWithTimeout(persistedSnapshot.snapshot.extensions);
      await this.removeSnapshot();

      this.logger.info('ISOLATION', 'PENDING_SNAPSHOT_RESTORED', {
        snapshotHash: persistedSnapshot.snapshot.hash,
        restoredCount: results.restored.length,
        failedCount: results.failed.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('ISOLATION', 'CHECK_PENDING_SNAPSHOTS_FAILED', { error: errorMessage });
    }
  }

  /**
   * Lista extensões que serão desativadas (preview)
   * Requirement 7.2
   */
  async previewIsolation(): Promise<IsolationPreview> {
    const allExtensions = await this.listAllExtensions();
    const { eligible, nonDisableable } = this.filterEligibleExtensions(allExtensions);

    return {
      extensionsToDisable: eligible,
      nonDisableableExtensions: nonDisableable,
      totalExtensions: allExtensions.length,
      toDisableCount: eligible.length,
      nonDisableableCount: nonDisableable.length,
    };
  }

  /**
   * Verifica violações durante isolamento
   * Requirements 10.3, 10.4, 10.5
   */
  async checkForViolations(): Promise<IsolationViolation[]> {
    if (!this.isIsolationActive || !this.currentSnapshot) {
      return [];
    }

    const newViolations: IsolationViolation[] = [];
    const currentExtensions = await this.listAllExtensions();

    // Verificar extensões reativadas
    for (const disabledId of this.disabledExtensions) {
      const current = currentExtensions.find((e) => e.id === disabledId);
      if (current?.enabled) {
        const violation: IsolationViolation = {
          type: 'extension_reactivated',
          timestamp: Date.now(),
          extensionId: disabledId,
          extensionName: current.name,
          details: { version: current.version },
        };
        newViolations.push(violation);
        this.violations.push(violation);

        this.logger.critical('ISOLATION', 'VIOLATION_EXTENSION_REACTIVATED', {
          extensionId: disabledId,
          extensionName: current.name,
        });
      }
    }

    // Verificar novas extensões instaladas
    const snapshotIds = new Set(this.currentSnapshot.extensions.map((e) => e.id));
    snapshotIds.add(this.ownExtensionId); // Adicionar Lexato

    for (const ext of currentExtensions) {
      if (!snapshotIds.has(ext.id) && ext.enabled) {
        const violation: IsolationViolation = {
          type: 'new_extension_installed',
          timestamp: Date.now(),
          extensionId: ext.id,
          extensionName: ext.name,
          details: { version: ext.version, installType: ext.installType },
        };
        newViolations.push(violation);
        this.violations.push(violation);

        this.logger.warn('ISOLATION', 'VIOLATION_NEW_EXTENSION', {
          extensionId: ext.id,
          extensionName: ext.name,
        });
      }
    }

    // Verificar se Lexato foi desativada (crítico)
    const lexato = currentExtensions.find((e) => e.id === this.ownExtensionId);
    if (lexato && !lexato.enabled) {
      const violation: IsolationViolation = {
        type: 'lexato_disabled',
        timestamp: Date.now(),
        extensionId: this.ownExtensionId,
        extensionName: 'Lexato',
        details: {},
      };
      newViolations.push(violation);
      this.violations.push(violation);

      this.logger.critical('ISOLATION', 'VIOLATION_LEXATO_DISABLED', {});
    }

    return newViolations;
  }

  /**
   * Obtém violações detectadas
   */
  getViolations(): IsolationViolation[] {
    return [...this.violations];
  }


  // ==========================================================================
  // Métodos Privados - Listagem e Filtragem
  // ==========================================================================

  /**
   * Obtém ID da própria extensão Lexato
   */
  private getOwnExtensionId(): string {
    return chrome.runtime.id;
  }

  /**
   * Lista todas as extensões instaladas usando chrome.management.getAll()
   * Requirement 2.1
   *
   * Verifica permissão 'management' antes de chamar a API.
   * Se a permissão não foi concedida no pré-flight, retorna lista vazia
   * (degradação graciosa conforme Requirement 2.7).
   */
  private async listAllExtensions(): Promise<chrome.management.ExtensionInfo[]> {
    // Verificar permissão 'management' antes de usar a API
    const hasManagement = await permissionHelper.hasPermission('management');
    if (!hasManagement) {
      this.logger.warn('ISOLATION', 'MANAGEMENT_PERMISSION_NOT_GRANTED', {
        action: 'listAllExtensions',
        degradation: 'Retornando lista vazia - isolamento de extensões indisponível',
      });
      return [];
    }

    try {
      const extensions = await chrome.management.getAll();
      this.logger.info('ISOLATION', 'EXTENSIONS_LISTED', {
        totalCount: extensions.length,
      });
      return extensions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('ISOLATION', 'LIST_EXTENSIONS_FAILED', { error: errorMessage });
      throw new Error(`Falha ao listar extensões: ${errorMessage}`);
    }
  }

  /**
   * Filtra extensões elegíveis para desativação
   * Requirements 2.2, 2.4, 2.5, 2.6, 2.7
   *
   * @param extensions - Lista de todas as extensões
   * @returns Objeto com extensões elegíveis e não desativáveis
   */
  private filterEligibleExtensions(extensions: chrome.management.ExtensionInfo[]): {
    eligible: ExtensionEntry[];
    nonDisableable: ExtensionEntry[];
  } {
    const eligible: ExtensionEntry[] = [];
    const nonDisableable: ExtensionEntry[] = [];

    for (const ext of extensions) {
      // Excluir a própria extensão Lexato
      if (ext.id === this.ownExtensionId) {
        continue;
      }

      // Excluir tipos não relevantes (themes, login_screen_extension)
      if (this.config.excludedTypes.includes(ext.type as ExtensionType)) {
        continue;
      }

      // Criar entrada da extensão
      const entry: ExtensionEntry = {
        id: ext.id,
        name: ext.name,
        wasEnabled: ext.enabled,
        mayDisable: ext.mayDisable ?? false,
        installType: ext.installType as ExtensionInstallType,
        type: ext.type as ExtensionType,
        version: ext.version,
      };

      // Verificar se pode ser desativada
      if (!ext.mayDisable) {
        nonDisableable.push(entry);
        continue;
      }

      // Apenas extensões habilitadas precisam ser desativadas
      if (ext.enabled) {
        eligible.push(entry);
      }
    }

    this.logger.info('ISOLATION', 'EXTENSIONS_FILTERED', {
      eligibleCount: eligible.length,
      nonDisableableCount: nonDisableable.length,
    });

    return { eligible, nonDisableable };
  }

  // ==========================================================================
  // Métodos Privados - Snapshot
  // ==========================================================================

  /**
   * Cria snapshot do estado atual das extensões
   * Requirements 3.1, 3.2, 3.3, 3.5
   */
  private async createSnapshot(
    correlationId: string,
    extensions: ExtensionEntry[]
  ): Promise<ExtensionSnapshot> {
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const snapshotData = {
      id: snapshotId,
      correlationId,
      createdAt: Date.now(),
      extensions,
      lexatoExtensionId: this.ownExtensionId,
    };

    // Calcular hash SHA-256 do snapshot
    const hash = await this.calculateSnapshotHash(snapshotData);

    const snapshot: ExtensionSnapshot = {
      ...snapshotData,
      hash,
    };

    this.logger.info('ISOLATION', 'SNAPSHOT_CREATED', {
      snapshotId,
      correlationId,
      extensionsCount: extensions.length,
      hash: hash.substring(0, 16) + '...',
    });

    return snapshot;
  }

  /**
   * Serializa objeto de forma determinística (chaves ordenadas)
   * Garante que o mesmo objeto sempre gera a mesma string JSON
   *
   * @param obj - Objeto a ser serializado
   * @returns String JSON com chaves ordenadas
   */
  private serializarDeterministico(obj: unknown): string {
    if (obj === null || obj === undefined) {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.serializarDeterministico(item)).join(',') + ']';
    }

    if (typeof obj === 'object') {
      const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
      const pairs = sortedKeys.map((key) => {
        const value = (obj as Record<string, unknown>)[key];
        return `${JSON.stringify(key)}:${this.serializarDeterministico(value)}`;
      });
      return '{' + pairs.join(',') + '}';
    }

    return JSON.stringify(obj);
  }

  /**
   * Calcula hash SHA-256 do snapshot
   * Usa serialização determinística para garantir consistência
   */
  private async calculateSnapshotHash(
    data: Omit<ExtensionSnapshot, 'hash'>
  ): Promise<string> {
    // Usar serialização determinística para garantir hash consistente
    const content = this.serializarDeterministico(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Valida hash do snapshot
   * Requirement 10.1
   */
  private async validateSnapshotHash(snapshot: ExtensionSnapshot): Promise<boolean> {
    const { hash, ...dataWithoutHash } = snapshot;
    const calculatedHash = await this.calculateSnapshotHash(dataWithoutHash);
    const isValid = calculatedHash === hash;

    if (!isValid) {
      this.logger.error('ISOLATION', 'SNAPSHOT_HASH_MISMATCH', {
        expected: hash.substring(0, 16) + '...',
        calculated: calculatedHash.substring(0, 16) + '...',
      });
    }

    return isValid;
  }


  // ==========================================================================
  // Métodos Privados - Persistência
  // ==========================================================================

  /**
   * Persiste snapshot em chrome.storage.local
   * Requirement 3.4
   */
  private async persistSnapshot(snapshot: ExtensionSnapshot): Promise<void> {
    const persisted: PersistedSnapshot = {
      snapshot,
      persistedAt: Date.now(),
      version: chrome.runtime.getManifest().version,
    };

    await chrome.storage.local.set({
      [this.config.snapshotStorageKey]: persisted,
    });

    this.logger.info('ISOLATION', 'SNAPSHOT_PERSISTED', {
      snapshotId: snapshot.id,
      storageKey: this.config.snapshotStorageKey,
    });
  }

  /**
   * Carrega snapshot do chrome.storage.local
   * Requirement 3.4
   */
  private async loadSnapshot(): Promise<PersistedSnapshot | null> {
    const result = await chrome.storage.local.get([this.config.snapshotStorageKey]);
    const data = result[this.config.snapshotStorageKey];

    if (!data) {
      return null;
    }

    if (!isPersistedSnapshot(data)) {
      this.logger.warn('ISOLATION', 'INVALID_PERSISTED_SNAPSHOT', { data });
      return null;
    }

    return data;
  }

  /**
   * Remove snapshot do chrome.storage.local
   * Requirement 3.7
   */
  private async removeSnapshot(): Promise<void> {
    await chrome.storage.local.remove([this.config.snapshotStorageKey]);
    this.logger.info('ISOLATION', 'SNAPSHOT_REMOVED', {
      storageKey: this.config.snapshotStorageKey,
    });
  }

  // ==========================================================================
  // Métodos Privados - Desativação e Restauração
  // ==========================================================================

  /**
   * Desativa extensões em paralelo com timeout
   * Requirements 4.1, 4.3, 4.5, 4.8
   */
  private async disableExtensionsWithTimeout(
    extensions: ExtensionEntry[]
  ): Promise<{ disabled: string[]; failed: Array<{ id: string; error: string }> }> {
    const disabled: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    if (extensions.length === 0) {
      return { disabled, failed };
    }

    // Criar promise com timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout de ${this.config.disableTimeout}ms excedido`));
      }, this.config.disableTimeout);
    });

    // Desativar em paralelo
    const disablePromises = extensions.map(async (ext) => {
      try {
        await chrome.management.setEnabled(ext.id, false);
        this.logger.info('ISOLATION', 'EXTENSION_DISABLED', {
          extensionId: ext.id,
          extensionName: ext.name,
        });
        return { id: ext.id, success: true };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
        this.logger.error('ISOLATION', 'EXTENSION_DISABLE_FAILED', {
          extensionId: ext.id,
          extensionName: ext.name,
          error: errorMessage,
        });
        return { id: ext.id, success: false, error: errorMessage };
      }
    });

    try {
      const results = await Promise.race([
        Promise.allSettled(disablePromises),
        timeoutPromise,
      ]);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            disabled.push(result.value.id);
          } else {
            failed.push({ id: result.value.id, error: result.value.error ?? 'Falha desconhecida' });
          }
        } else {
          // Promise rejeitada
          failed.push({ id: 'unknown', error: result.reason?.message ?? 'Erro desconhecido' });
        }
      }
    } catch {
      // Timeout - registrar extensões que não foram processadas
      this.logger.error('ISOLATION', 'DISABLE_TIMEOUT', {
        disabledCount: disabled.length,
        totalCount: extensions.length,
      });
    }

    return { disabled, failed };
  }

  /**
   * Restaura extensões em paralelo com timeout
   * Requirements 5.1, 5.2, 5.3, 5.7
   */
  private async restoreExtensionsWithTimeout(
    extensions: ExtensionEntry[]
  ): Promise<{ restored: string[]; failed: Array<{ id: string; name: string; error: string }> }> {
    const restored: string[] = [];
    const failed: Array<{ id: string; name: string; error: string }> = [];

    // Filtrar apenas extensões que estavam habilitadas
    const toRestore = extensions.filter((ext) => ext.wasEnabled);

    if (toRestore.length === 0) {
      return { restored, failed };
    }

    // Criar promise com timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout de ${this.config.restoreTimeout}ms excedido`));
      }, this.config.restoreTimeout);
    });

    // Restaurar em paralelo
    const restorePromises = toRestore.map(async (ext) => {
      try {
        await chrome.management.setEnabled(ext.id, true);
        this.logger.info('ISOLATION', 'EXTENSION_RESTORED', {
          extensionId: ext.id,
          extensionName: ext.name,
        });
        return { id: ext.id, name: ext.name, success: true };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
        this.logger.error('ISOLATION', 'EXTENSION_RESTORE_FAILED', {
          extensionId: ext.id,
          extensionName: ext.name,
          error: errorMessage,
        });
        return { id: ext.id, name: ext.name, success: false, error: errorMessage };
      }
    });

    try {
      const results = await Promise.race([
        Promise.allSettled(restorePromises),
        timeoutPromise,
      ]);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            restored.push(result.value.id);
          } else {
            failed.push({
              id: result.value.id,
              name: result.value.name,
              error: result.value.error ?? 'Falha desconhecida',
            });
          }
        }
      }
    } catch {
      this.logger.error('ISOLATION', 'RESTORE_TIMEOUT', {
        restoredCount: restored.length,
        totalCount: toRestore.length,
      });
    }

    return { restored, failed };
  }

  /**
   * Restaura extensões por IDs (sem snapshot)
   */
  private async restoreExtensionsByIds(
    ids: string[]
  ): Promise<{ restored: string[]; failed: Array<{ id: string; name: string; error: string }> }> {
    const restored: string[] = [];
    const failed: Array<{ id: string; name: string; error: string }> = [];

    for (const id of ids) {
      try {
        await chrome.management.setEnabled(id, true);
        restored.push(id);
        this.logger.info('ISOLATION', 'EXTENSION_RESTORED_BY_ID', { extensionId: id });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        failed.push({ id, name: 'Desconhecido', error: errorMessage });
        this.logger.error('ISOLATION', 'EXTENSION_RESTORE_BY_ID_FAILED', {
          extensionId: id,
          error: errorMessage,
        });
      }
    }

    return { restored, failed };
  }

  /**
   * Reseta estado interno do manager
   */
  private resetState(): void {
    this.isIsolationActive = false;
    this.currentSnapshot = null;
    this.disabledExtensions = [];
    this.nonDisableableExtensions = [];
    this.violations = [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export { DEFAULT_CONFIG };
export type { IsolationConfig };
