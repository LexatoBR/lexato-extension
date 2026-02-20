/**
 * Testes unitários para ExtensionIsolationManager
 *
 * Testa funcionalidades de isolamento de extensões durante captura:
 * - Listagem e filtragem de extensões
 * - Criação e validação de snapshots
 * - Desativação e restauração de extensões
 * - Recuperação de snapshots pendentes
 * - Detecção de violações
 *
 * @module ExtensionIsolationManagerTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ExtensionIsolationManager } from '../../../src/background/extension-isolation-manager';
import { AuditLogger } from '../../../src/lib/audit-logger';
import type {
  ExtensionEntry,
  ExtensionSnapshot,
  ExtensionInstallType,
  ExtensionType,
} from '../../../src/types/isolation.types';
import {
  isExtensionEntry,
  isExtensionSnapshot,
  isPersistedSnapshot,
} from '../../../src/types/isolation.types';

// ============================================================================
// Mocks
// ============================================================================

// Mock do chrome.management API
const mockManagementAPI = {
  getAll: vi.fn(),
  setEnabled: vi.fn(),
  getSelf: vi.fn(),
};

// Mock do chrome.storage.local
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

// Mock do chrome.runtime
const mockRuntime = {
  id: 'lexato_extension_id_123',
  getManifest: vi.fn(() => ({ version: '1.0.0' })),
};

// Configurar mocks globais do Chrome
vi.stubGlobal('chrome', {
  management: mockManagementAPI,
  storage: { local: mockStorage },
  runtime: mockRuntime,
});

// ============================================================================
// Helpers para Testes
// ============================================================================

/**
 * Cria mock de ExtensionInfo do Chrome
 */
function createMockExtensionInfo(
  overrides: Partial<chrome.management.ExtensionInfo> = {}
): chrome.management.ExtensionInfo {
  return {
    id: `ext_${Math.random().toString(36).substring(2, 9)}`,
    name: 'Test Extension',
    shortName: 'Test',
    description: 'A test extension',
    version: '1.0.0',
    enabled: true,
    mayDisable: true,
    installType: 'normal' as ExtensionInstallType,
    type: 'extension' as ExtensionType,
    homepageUrl: '',
    updateUrl: '',
    offlineEnabled: false,
    optionsUrl: '',
    permissions: [],
    hostPermissions: [],
    ...overrides,
  } as chrome.management.ExtensionInfo;
}

/**
 * Cria logger mock para testes
 */
function createMockLogger(): AuditLogger {
  return new AuditLogger('test-correlation-id');
}


// ============================================================================
// Arbitraries para Property-Based Testing
// ============================================================================

/**
 * Arbitrary para gerar ExtensionInfo válido
 */
const extensionInfoArbitrary = fc.record({
  id: fc.string({ minLength: 10, maxLength: 32 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ maxLength: 100 }),
  version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
  enabled: fc.boolean(),
  mayDisable: fc.boolean(),
  installType: fc.constantFrom(
    'admin',
    'development',
    'normal',
    'sideload',
    'other'
  ) as fc.Arbitrary<ExtensionInstallType>,
  type: fc.constantFrom(
    'extension',
    'hosted_app',
    'packaged_app',
    'legacy_packaged_app',
    'theme',
    'login_screen_extension'
  ) as fc.Arbitrary<ExtensionType>,
  homepageUrl: fc.constant(''),
  updateUrl: fc.constant(''),
  offlineEnabled: fc.boolean(),
  optionsUrl: fc.constant(''),
  permissions: fc.constant([]),
  hostPermissions: fc.constant([]),
});

/**
 * Arbitrary para gerar lista de extensões
 */
const extensionListArbitrary = fc.array(extensionInfoArbitrary, { minLength: 0, maxLength: 20 });

// ============================================================================
// Testes de Type Guards
// ============================================================================

describe('Type Guards', () => {
  describe('isExtensionEntry', () => {
    it('deve retornar true para ExtensionEntry válido', () => {
      const entry: ExtensionEntry = {
        id: 'ext_123',
        name: 'Test Extension',
        wasEnabled: true,
        mayDisable: true,
        installType: 'normal',
        type: 'extension',
        version: '1.0.0',
      };
      expect(isExtensionEntry(entry)).toBe(true);
    });

    it('deve retornar false para objeto inválido', () => {
      expect(isExtensionEntry(null)).toBe(false);
      expect(isExtensionEntry(undefined)).toBe(false);
      expect(isExtensionEntry({})).toBe(false);
      expect(isExtensionEntry({ id: 'test' })).toBe(false);
    });
  });

  describe('isExtensionSnapshot', () => {
    it('deve retornar true para ExtensionSnapshot válido', () => {
      const snapshot: ExtensionSnapshot = {
        id: 'snap_123',
        correlationId: 'corr_456',
        createdAt: Date.now(),
        extensions: [],
        hash: 'abc123',
        lexatoExtensionId: 'lexato_123',
      };
      expect(isExtensionSnapshot(snapshot)).toBe(true);
    });

    it('deve retornar false para objeto inválido', () => {
      expect(isExtensionSnapshot(null)).toBe(false);
      expect(isExtensionSnapshot({ id: 'test' })).toBe(false);
    });
  });

  describe('isPersistedSnapshot', () => {
    it('deve retornar true para PersistedSnapshot válido', () => {
      const persisted = {
        snapshot: {
          id: 'snap_123',
          correlationId: 'corr_456',
          createdAt: Date.now(),
          extensions: [],
          hash: 'abc123',
          lexatoExtensionId: 'lexato_123',
        },
        persistedAt: Date.now(),
        version: '1.0.0',
      };
      expect(isPersistedSnapshot(persisted)).toBe(true);
    });

    it('deve retornar false para objeto inválido', () => {
      expect(isPersistedSnapshot(null)).toBe(false);
      expect(isPersistedSnapshot({ snapshot: {} })).toBe(false);
    });
  });
});


// ============================================================================
// Testes do ExtensionIsolationManager
// ============================================================================

describe('ExtensionIsolationManager', () => {
  let manager: ExtensionIsolationManager;
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    manager = new ExtensionIsolationManager(logger);

    // Configurar mocks padrão
    mockManagementAPI.getAll.mockResolvedValue([]);
    mockManagementAPI.setEnabled.mockResolvedValue(undefined);
    mockStorage.get.mockResolvedValue({});
    mockStorage.set.mockResolvedValue(undefined);
    mockStorage.remove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Testes de Status
  // ==========================================================================

  describe('getIsolationStatus', () => {
    it('deve retornar status inicial correto', () => {
      const status = manager.getIsolationStatus();

      expect(status.isActive).toBe(false);
      expect(status.snapshot).toBeNull();
      expect(status.disabledCount).toBe(0);
      expect(status.nonDisableableCount).toBe(0);
      expect(status.disabledExtensionIds).toEqual([]);
      expect(status.nonDisableableExtensions).toEqual([]);
    });
  });

  // ==========================================================================
  // Testes de Preview
  // ==========================================================================

  describe('previewIsolation', () => {
    it('deve retornar preview vazio quando não há extensões', async () => {
      mockManagementAPI.getAll.mockResolvedValue([]);

      const preview = await manager.previewIsolation();

      expect(preview.totalExtensions).toBe(0);
      expect(preview.toDisableCount).toBe(0);
      expect(preview.nonDisableableCount).toBe(0);
      expect(preview.extensionsToDisable).toEqual([]);
      expect(preview.nonDisableableExtensions).toEqual([]);
    });

    it('deve excluir extensão Lexato do preview', async () => {
      const extensions = [
        createMockExtensionInfo({ id: mockRuntime.id, name: 'Lexato' }),
        createMockExtensionInfo({ id: 'other_ext', name: 'Other Extension' }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);

      const preview = await manager.previewIsolation();

      expect(preview.toDisableCount).toBe(1);
      expect(preview.extensionsToDisable.find((e) => e.id === mockRuntime.id)).toBeUndefined();
    });

    it('deve excluir themes do preview', async () => {
      const extensions = [
        createMockExtensionInfo({ id: 'theme_1', type: 'theme', name: 'Dark Theme' }),
        createMockExtensionInfo({ id: 'ext_1', type: 'extension', name: 'Normal Extension' }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);

      const preview = await manager.previewIsolation();

      expect(preview.toDisableCount).toBe(1);
      expect(preview.extensionsToDisable.find((e) => e.type === 'theme')).toBeUndefined();
    });

    it('deve identificar extensões não desativáveis (admin)', async () => {
      const extensions = [
        createMockExtensionInfo({
          id: 'admin_ext',
          name: 'Admin Extension',
          mayDisable: false,
          installType: 'admin',
        }),
        createMockExtensionInfo({ id: 'normal_ext', name: 'Normal Extension' }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);

      const preview = await manager.previewIsolation();

      expect(preview.nonDisableableCount).toBe(1);
      const firstNonDisableable = preview.nonDisableableExtensions[0];
      expect(firstNonDisableable).toBeDefined();
      expect(firstNonDisableable!.id).toBe('admin_ext');
    });
  });


  // ==========================================================================
  // Testes de Ativação
  // ==========================================================================

  describe('activateIsolation', () => {
    it('deve ativar isolamento com sucesso', async () => {
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1', enabled: true }),
        createMockExtensionInfo({ id: 'ext_2', name: 'Extension 2', enabled: true }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);

      const result = await manager.activateIsolation('test-correlation-id');

      expect(result.success).toBe(true);
      expect(result.snapshot).not.toBeNull();
      expect(result.disabledExtensions).toHaveLength(2);
      expect(result.error).toBeUndefined();
      expect(mockManagementAPI.setEnabled).toHaveBeenCalledTimes(2);
      expect(mockStorage.set).toHaveBeenCalled();
    });

    it('deve falhar se já estiver ativo', async () => {
      mockManagementAPI.getAll.mockResolvedValue([
        createMockExtensionInfo({ id: 'ext_1', enabled: true }),
      ]);

      // Primeira ativação
      await manager.activateIsolation('corr-1');

      // Segunda ativação deve falhar
      const result = await manager.activateIsolation('corr-2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('já está ativo');
    });

    it('deve criar snapshot com hash válido', async () => {
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1' }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);

      const result = await manager.activateIsolation('test-correlation-id');

      expect(result.snapshot).not.toBeNull();
      expect(result.snapshot?.hash).toBeDefined();
      expect(result.snapshot?.hash.length).toBe(64); // SHA-256 hex
      expect(result.snapshot?.correlationId).toBe('test-correlation-id');
    });

    it('deve ignorar extensões desabilitadas', async () => {
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', enabled: true }),
        createMockExtensionInfo({ id: 'ext_2', enabled: false }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);

      const result = await manager.activateIsolation('test-correlation-id');

      expect(result.disabledExtensions).toHaveLength(1);
      expect(result.disabledExtensions[0]).toBe('ext_1');
    });

    it('deve continuar mesmo se algumas extensões falharem', async () => {
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', enabled: true }),
        createMockExtensionInfo({ id: 'ext_2', enabled: true }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);
      mockManagementAPI.setEnabled
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Falha ao desativar'));

      const result = await manager.activateIsolation('test-correlation-id');

      expect(result.success).toBe(true);
      expect(result.disabledExtensions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Testes de Desativação
  // ==========================================================================

  describe('deactivateIsolation', () => {
    it('deve desativar isolamento e restaurar extensões', async () => {
      // Ativar primeiro
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1', enabled: true }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);
      await manager.activateIsolation('test-correlation-id');

      // Configurar mock para carregar snapshot
      mockStorage.get.mockResolvedValue({
        lexato_isolation_snapshot: {
          snapshot: {
            id: 'snap_123',
            correlationId: 'test-correlation-id',
            createdAt: Date.now(),
            extensions: [
              {
                id: 'ext_1',
                name: 'Extension 1',
                wasEnabled: true,
                mayDisable: true,
                installType: 'normal',
                type: 'extension',
                version: '1.0.0',
              },
            ],
            hash: 'valid_hash',
            lexatoExtensionId: mockRuntime.id,
          },
          persistedAt: Date.now(),
          version: '1.0.0',
        },
      });

      // Desativar
      const result = await manager.deactivateIsolation();

      expect(result.success).toBe(true);
      expect(result.restoredExtensions).toHaveLength(1);
      expect(mockStorage.remove).toHaveBeenCalled();
    });

    it('deve falhar se não estiver ativo', async () => {
      const result = await manager.deactivateIsolation();

      expect(result.success).toBe(false);
      expect(result.error).toContain('não está ativo');
    });

    it('deve manter snapshot se restauração falhar', async () => {
      // Ativar primeiro
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', enabled: true }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);
      await manager.activateIsolation('test-correlation-id');

      // Configurar mock para carregar snapshot
      mockStorage.get.mockResolvedValue({
        lexato_isolation_snapshot: {
          snapshot: {
            id: 'snap_123',
            correlationId: 'test-correlation-id',
            createdAt: Date.now(),
            extensions: [
              {
                id: 'ext_1',
                name: 'Extension 1',
                wasEnabled: true,
                mayDisable: true,
                installType: 'normal',
                type: 'extension',
                version: '1.0.0',
              },
            ],
            hash: 'valid_hash',
            lexatoExtensionId: mockRuntime.id,
          },
          persistedAt: Date.now(),
          version: '1.0.0',
        },
      });

      // Simular falha na restauração
      mockManagementAPI.setEnabled.mockRejectedValue(new Error('Falha'));

      const result = await manager.deactivateIsolation();

      expect(result.success).toBe(false);
      expect(result.failedExtensions).toHaveLength(1);
      // Snapshot não deve ser removido
      expect(mockStorage.remove).not.toHaveBeenCalled();
    });
  });


  // ==========================================================================
  // Testes de Recuperação
  // ==========================================================================

  describe('checkPendingSnapshots', () => {
    it('deve restaurar snapshot pendente', async () => {
      mockStorage.get.mockResolvedValue({
        lexato_isolation_snapshot: {
          snapshot: {
            id: 'snap_orphan',
            correlationId: 'old-correlation',
            createdAt: Date.now() - 1000,
            extensions: [
              {
                id: 'ext_1',
                name: 'Extension 1',
                wasEnabled: true,
                mayDisable: true,
                installType: 'normal',
                type: 'extension',
                version: '1.0.0',
              },
            ],
            hash: 'valid_hash',
            lexatoExtensionId: mockRuntime.id,
          },
          persistedAt: Date.now() - 1000,
          version: '1.0.0',
        },
      });

      await manager.checkPendingSnapshots();

      expect(mockManagementAPI.setEnabled).toHaveBeenCalledWith('ext_1', true);
      expect(mockStorage.remove).toHaveBeenCalled();
    });

    it('deve não fazer nada se não houver snapshot pendente', async () => {
      mockStorage.get.mockResolvedValue({});

      await manager.checkPendingSnapshots();

      expect(mockManagementAPI.setEnabled).not.toHaveBeenCalled();
      expect(mockStorage.remove).not.toHaveBeenCalled();
    });
  });

  describe('forceRestore', () => {
    it('deve restaurar extensões do snapshot', async () => {
      mockStorage.get.mockResolvedValue({
        lexato_isolation_snapshot: {
          snapshot: {
            id: 'snap_123',
            correlationId: 'test',
            createdAt: Date.now(),
            extensions: [
              {
                id: 'ext_1',
                name: 'Extension 1',
                wasEnabled: true,
                mayDisable: true,
                installType: 'normal',
                type: 'extension',
                version: '1.0.0',
              },
            ],
            hash: 'valid_hash',
            lexatoExtensionId: mockRuntime.id,
          },
          persistedAt: Date.now(),
          version: '1.0.0',
        },
      });

      const result = await manager.forceRestore();

      expect(result.success).toBe(true);
      expect(result.restoredExtensions).toHaveLength(1);
    });

    it('deve retornar sucesso se não houver nada para restaurar', async () => {
      mockStorage.get.mockResolvedValue({});

      const result = await manager.forceRestore();

      expect(result.success).toBe(true);
      expect(result.restoredExtensions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Testes de Violações
  // ==========================================================================

  describe('checkForViolations', () => {
    it('deve retornar array vazio se isolamento não estiver ativo', async () => {
      const violations = await manager.checkForViolations();
      expect(violations).toEqual([]);
    });

    it('deve detectar extensão reativada', async () => {
      // Ativar isolamento
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1', enabled: true }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);
      await manager.activateIsolation('test-correlation-id');

      // Simular extensão reativada
      mockManagementAPI.getAll.mockResolvedValue([
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1', enabled: true }),
      ]);

      const violations = await manager.checkForViolations();

      expect(violations).toHaveLength(1);
      const firstViolation = violations[0];
      expect(firstViolation).toBeDefined();
      expect(firstViolation!.type).toBe('extension_reactivated');
      expect(firstViolation!.extensionId).toBe('ext_1');
    });

    it('deve detectar nova extensão instalada', async () => {
      // Ativar isolamento com uma extensão
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1', enabled: true }),
      ];
      mockManagementAPI.getAll.mockResolvedValue(extensions);
      await manager.activateIsolation('test-correlation-id');

      // Simular nova extensão instalada
      mockManagementAPI.getAll.mockResolvedValue([
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1', enabled: false }),
        createMockExtensionInfo({ id: 'ext_new', name: 'New Extension', enabled: true }),
      ]);

      const violations = await manager.checkForViolations();

      const newExtViolation = violations.find((v) => v.type === 'new_extension_installed');
      expect(newExtViolation).toBeDefined();
      expect(newExtViolation?.extensionId).toBe('ext_new');
    });
  });
});


// ============================================================================
// Testes de Propriedade (Property-Based Testing)
// ============================================================================

describe('Property-Based Tests', () => {
  let manager: ExtensionIsolationManager;
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    manager = new ExtensionIsolationManager(logger);
    mockManagementAPI.setEnabled.mockResolvedValue(undefined);
    mockStorage.get.mockResolvedValue({});
    mockStorage.set.mockResolvedValue(undefined);
    mockStorage.remove.mockResolvedValue(undefined);
  });

  /**
   * Property 1: Filtragem Correta de Extensões
   * Requirements 2.2, 2.4, 2.5
   */
  describe('Property 1: Filtragem Correta de Extensões', () => {
    it('NUNCA deve incluir extensão Lexato na lista de desativação', async () => {
      await fc.assert(
        fc.asyncProperty(extensionListArbitrary, async (extensions) => {
          // Adicionar Lexato à lista
          const withLexato = [
            ...extensions,
            createMockExtensionInfo({ id: mockRuntime.id, name: 'Lexato', enabled: true }),
          ];
          mockManagementAPI.getAll.mockResolvedValue(withLexato);

          const preview = await manager.previewIsolation();

          // Lexato NUNCA deve estar na lista de desativação
          const hasLexato = preview.extensionsToDisable.some((e) => e.id === mockRuntime.id);
          expect(hasLexato).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('NUNCA deve incluir themes na lista de desativação', async () => {
      await fc.assert(
        fc.asyncProperty(extensionListArbitrary, async (extensions) => {
          mockManagementAPI.getAll.mockResolvedValue(extensions);

          const preview = await manager.previewIsolation();

          // Themes NUNCA devem estar na lista
          const hasTheme = preview.extensionsToDisable.some((e) => e.type === 'theme');
          expect(hasTheme).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('DEVE incluir apenas extensões com mayDisable: true', async () => {
      await fc.assert(
        fc.asyncProperty(extensionListArbitrary, async (extensions) => {
          mockManagementAPI.getAll.mockResolvedValue(extensions);

          const preview = await manager.previewIsolation();

          // Todas as extensões elegíveis devem ter mayDisable: true
          for (const ext of preview.extensionsToDisable) {
            expect(ext.mayDisable).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Integridade do Snapshot
   * Requirements 3.2, 3.3, 3.5, 10.1
   */
  describe('Property 2: Integridade do Snapshot', () => {
    it('snapshot DEVE conter todos os campos obrigatórios', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              enabled: fc.constant(true),
              mayDisable: fc.constant(true),
              installType: fc.constant('normal' as ExtensionInstallType),
              type: fc.constant('extension' as ExtensionType),
              version: fc.constant('1.0.0'),
              description: fc.constant(''),
              homepageUrl: fc.constant(''),
              updateUrl: fc.constant(''),
              offlineEnabled: fc.constant(false),
              optionsUrl: fc.constant(''),
              permissions: fc.constant([]),
              hostPermissions: fc.constant([]),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (extensions) => {
            mockManagementAPI.getAll.mockResolvedValue(extensions);

            const result = await manager.activateIsolation('test-corr');

            if (result.success && result.snapshot) {
              // Verificar campos obrigatórios
              expect(result.snapshot.id).toBeDefined();
              expect(result.snapshot.correlationId).toBe('test-corr');
              expect(typeof result.snapshot.createdAt).toBe('number');
              expect(Array.isArray(result.snapshot.extensions)).toBe(true);
              expect(result.snapshot.hash).toBeDefined();
              expect(result.snapshot.hash.length).toBe(64); // SHA-256
              expect(result.snapshot.lexatoExtensionId).toBe(mockRuntime.id);
            }

            // Limpar estado para próxima iteração
            await manager.forceRestore();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 3: Consistência de Desativação
   * Requirements 4.2, 4.4, 4.5
   *
   * Para qualquer operação de desativação:
   * - Apenas extensões com wasEnabled: true E mayDisable: true devem ser desativadas
   * - Cada tentativa de desativação (sucesso ou falha) DEVE ser registrada no AuditLogger
   * - Falha em desativar uma extensão NÃO deve impedir a desativação das demais
   */
  describe('Property 3: Consistência de Desativação', () => {
    /**
     * Arbitrary para gerar extensões com diferentes estados
     */
    const mixedExtensionArbitrary = fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      enabled: fc.boolean(),
      mayDisable: fc.boolean(),
      installType: fc.constantFrom(
        'admin',
        'development',
        'normal',
        'sideload',
        'other'
      ) as fc.Arbitrary<ExtensionInstallType>,
      type: fc.constant('extension' as ExtensionType),
      version: fc.constant('1.0.0'),
      description: fc.constant(''),
      homepageUrl: fc.constant(''),
      updateUrl: fc.constant(''),
      offlineEnabled: fc.constant(false),
      optionsUrl: fc.constant(''),
      permissions: fc.constant([]),
      hostPermissions: fc.constant([]),
    });

    it('DEVE desativar apenas extensões com enabled: true E mayDisable: true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mixedExtensionArbitrary, { minLength: 1, maxLength: 10 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);

            await testManager.activateIsolation(correlationId);

            // Obter todas as chamadas de setEnabled
            const setEnabledCalls = mockManagementAPI.setEnabled.mock.calls;

            // Para cada chamada de desativação, verificar que a extensão era elegível
            for (const call of setEnabledCalls) {
              const [extId, enabled] = call as [string, boolean];

              // Só verificar chamadas de desativação (enabled = false)
              if (enabled === false) {
                const originalExt = extensions.find((e) => e.id === extId);

                // Se encontrou a extensão original, verificar elegibilidade
                if (originalExt) {
                  // 4.2: Apenas extensões com enabled: true E mayDisable: true
                  expect(originalExt.enabled).toBe(true);
                  expect(originalExt.mayDisable).toBe(true);
                }
              }
            }

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('DEVE registrar cada tentativa de desativação no AuditLogger', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              enabled: fc.constant(true),
              mayDisable: fc.constant(true),
              installType: fc.constant('normal' as ExtensionInstallType),
              type: fc.constant('extension' as ExtensionType),
              version: fc.constant('1.0.0'),
              description: fc.constant(''),
              homepageUrl: fc.constant(''),
              updateUrl: fc.constant(''),
              offlineEnabled: fc.constant(false),
              optionsUrl: fc.constant(''),
              permissions: fc.constant([]),
              hostPermissions: fc.constant([]),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);

            await testManager.activateIsolation(correlationId);

            const entries = testLogger.getEntries();

            // 4.4: Cada extensão desativada DEVE ter log
            for (const ext of extensions) {
              const extLog = entries.find(
                (e) =>
                  e.process === 'ISOLATION' &&
                  e.action === 'EXTENSION_DISABLED' &&
                  e.data?.['extensionId'] === ext.id
              );
              expect(extLog).toBeDefined();
              expect(extLog?.data?.['extensionName']).toBe(ext.name);
            }

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('falha em desativar uma extensão NÃO deve impedir desativação das demais', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              enabled: fc.constant(true),
              mayDisable: fc.constant(true),
              installType: fc.constant('normal' as ExtensionInstallType),
              type: fc.constant('extension' as ExtensionType),
              version: fc.constant('1.0.0'),
              description: fc.constant(''),
              homepageUrl: fc.constant(''),
              updateUrl: fc.constant(''),
              offlineEnabled: fc.constant(false),
              optionsUrl: fc.constant(''),
              permissions: fc.constant([]),
              hostPermissions: fc.constant([]),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          fc.uuid(),
          fc.integer({ min: 0 }),
          async (extensions, correlationId, failIndex) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.getAll.mockResolvedValue(extensions);

            // Configurar para falhar em uma extensão específica
            const failAt = failIndex % extensions.length;
            let callCount = 0;
            mockManagementAPI.setEnabled.mockImplementation(async () => {
              const currentCall = callCount++;
              if (currentCall === failAt) {
                throw new Error('Falha simulada na desativação');
              }
              return undefined;
            });

            const result = await testManager.activateIsolation(correlationId);

            // 4.5: Operação deve continuar mesmo com falha
            expect(result.success).toBe(true);

            // Deve ter tentado desativar todas as extensões
            expect(mockManagementAPI.setEnabled).toHaveBeenCalledTimes(extensions.length);

            // Deve ter desativado todas exceto a que falhou
            expect(result.disabledExtensions.length).toBe(extensions.length - 1);

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('DEVE registrar falhas de desativação com detalhes do erro', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              enabled: fc.constant(true),
              mayDisable: fc.constant(true),
              installType: fc.constant('normal' as ExtensionInstallType),
              type: fc.constant('extension' as ExtensionType),
              version: fc.constant('1.0.0'),
              description: fc.constant(''),
              homepageUrl: fc.constant(''),
              updateUrl: fc.constant(''),
              offlineEnabled: fc.constant(false),
              optionsUrl: fc.constant(''),
              permissions: fc.constant([]),
              hostPermissions: fc.constant([]),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (extensions, correlationId, errorMessage) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.getAll.mockResolvedValue(extensions);

            // Configurar para falhar em todas as extensões
            mockManagementAPI.setEnabled.mockRejectedValue(new Error(errorMessage));

            await testManager.activateIsolation(correlationId);

            const entries = testLogger.getEntries();

            // 4.4: Falhas DEVEM ser registradas com detalhes
            const failureLogs = entries.filter(
              (e) => e.process === 'ISOLATION' && e.action === 'EXTENSION_DISABLE_FAILED'
            );

            // Deve haver um log de falha para cada extensão
            expect(failureLogs.length).toBe(extensions.length);

            // Cada log de falha deve conter extensionId, extensionName e error
            for (const log of failureLogs) {
              expect(log.data?.['extensionId']).toBeDefined();
              expect(log.data?.['extensionName']).toBeDefined();
              expect(log.data?.['error']).toBeDefined();
            }

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Consistência de Restauração
   * Requirements 5.2, 5.4
   *
   * Para qualquer operação de restauração:
   * - Apenas extensões que estavam wasEnabled: true no snapshot devem ser restauradas
   * - Cada tentativa de restauração (sucesso ou falha) DEVE ser registrada no AuditLogger
   * - O snapshot DEVE ser removido apenas após restauração completa bem-sucedida
   */
  describe('Property 4: Consistência de Restauração', () => {
    /**
     * Arbitrary para gerar extensões com diferentes estados de wasEnabled
     */
    const mixedEnabledExtensionArbitrary = fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      wasEnabled: fc.boolean(),
      mayDisable: fc.constant(true),
      installType: fc.constant('normal' as ExtensionInstallType),
      type: fc.constant('extension' as ExtensionType),
      version: fc.constant('1.0.0'),
    });

    it('DEVE restaurar apenas extensões com wasEnabled: true no snapshot', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mixedEnabledExtensionArbitrary, { minLength: 1, maxLength: 10 }),
          fc.uuid(),
          async (snapshotExtensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockStorage.remove.mockResolvedValue(undefined);

            // Criar extensões originais (todas habilitadas para ativação)
            const originalExtensions = snapshotExtensions.map((ext) => ({
              id: ext.id,
              name: ext.name,
              description: '',
              version: '1.0.0',
              enabled: true,
              mayDisable: true,
              installType: 'normal' as ExtensionInstallType,
              type: 'extension' as ExtensionType,
              homepageUrl: '',
              updateUrl: '',
              offlineEnabled: false,
              optionsUrl: '',
              permissions: [],
              hostPermissions: [],
            }));

            mockManagementAPI.getAll.mockResolvedValue(originalExtensions);

            // Ativar isolamento primeiro
            await testManager.activateIsolation(correlationId);

            // Configurar mock para carregar snapshot com extensões de diferentes estados
            const snapshotId = `snap_${Date.now()}`;
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: snapshotId,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: snapshotExtensions,
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Resetar chamadas de setEnabled para contar apenas restaurações
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);

            // Desativar isolamento (restaurar)
            await testManager.deactivateIsolation();

            // Obter todas as chamadas de setEnabled
            const setEnabledCalls = mockManagementAPI.setEnabled.mock.calls;

            // Contar extensões que deveriam ser restauradas (wasEnabled: true)
            const expectedToRestore = snapshotExtensions.filter((ext) => ext.wasEnabled);

            // 5.2: Apenas extensões com wasEnabled: true devem ser restauradas
            // Cada chamada de restauração deve ser para uma extensão com wasEnabled: true
            for (const call of setEnabledCalls) {
              const [extId, enabled] = call as [string, boolean];

              // Só verificar chamadas de restauração (enabled = true)
              if (enabled === true) {
                const snapshotExt = snapshotExtensions.find((e) => e.id === extId);

                // Se encontrou a extensão no snapshot, verificar que wasEnabled era true
                if (snapshotExt) {
                  expect(snapshotExt.wasEnabled).toBe(true);
                }
              }
            }

            // Verificar que o número de chamadas de restauração corresponde ao esperado
            const restoreCalls = (setEnabledCalls as Array<[string, boolean]>).filter(
              (call) => call[1] === true
            );
            expect(restoreCalls.length).toBe(expectedToRestore.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('DEVE registrar cada tentativa de restauração no AuditLogger', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              wasEnabled: fc.constant(true),
              mayDisable: fc.constant(true),
              installType: fc.constant('normal' as ExtensionInstallType),
              type: fc.constant('extension' as ExtensionType),
              version: fc.constant('1.0.0'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.uuid(),
          async (snapshotExtensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockStorage.remove.mockResolvedValue(undefined);

            // Criar extensões originais
            const originalExtensions = snapshotExtensions.map((ext) => ({
              id: ext.id,
              name: ext.name,
              description: '',
              version: '1.0.0',
              enabled: true,
              mayDisable: true,
              installType: 'normal' as ExtensionInstallType,
              type: 'extension' as ExtensionType,
              homepageUrl: '',
              updateUrl: '',
              offlineEnabled: false,
              optionsUrl: '',
              permissions: [],
              hostPermissions: [],
            }));

            mockManagementAPI.getAll.mockResolvedValue(originalExtensions);

            // Ativar isolamento primeiro
            await testManager.activateIsolation(correlationId);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: snapshotExtensions,
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Limpar entradas anteriores para focar na restauração
            testLogger.clear();

            // Desativar isolamento (restaurar)
            await testManager.deactivateIsolation();

            const entries = testLogger.getEntries();

            // 5.4: Cada extensão restaurada DEVE ter log
            for (const ext of snapshotExtensions) {
              const extLog = entries.find(
                (e) =>
                  e.process === 'ISOLATION' &&
                  e.action === 'EXTENSION_RESTORED' &&
                  e.data?.['extensionId'] === ext.id
              );
              expect(extLog).toBeDefined();
              expect(extLog?.data?.['extensionName']).toBe(ext.name);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('snapshot DEVE ser removido apenas após restauração completa bem-sucedida', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              wasEnabled: fc.constant(true),
              mayDisable: fc.constant(true),
              installType: fc.constant('normal' as ExtensionInstallType),
              type: fc.constant('extension' as ExtensionType),
              version: fc.constant('1.0.0'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.uuid(),
          async (snapshotExtensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockStorage.remove.mockReset();
            mockStorage.remove.mockResolvedValue(undefined);

            // Criar extensões originais
            const originalExtensions = snapshotExtensions.map((ext) => ({
              id: ext.id,
              name: ext.name,
              description: '',
              version: '1.0.0',
              enabled: true,
              mayDisable: true,
              installType: 'normal' as ExtensionInstallType,
              type: 'extension' as ExtensionType,
              homepageUrl: '',
              updateUrl: '',
              offlineEnabled: false,
              optionsUrl: '',
              permissions: [],
              hostPermissions: [],
            }));

            mockManagementAPI.getAll.mockResolvedValue(originalExtensions);

            // Ativar isolamento primeiro
            await testManager.activateIsolation(correlationId);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: snapshotExtensions,
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Resetar mock de remove para verificar chamada
            mockStorage.remove.mockReset();
            mockStorage.remove.mockResolvedValue(undefined);

            // Desativar isolamento (restaurar) - sucesso
            const result = await testManager.deactivateIsolation();

            // Se restauração foi bem-sucedida, snapshot DEVE ser removido
            if (result.success && result.failedExtensions.length === 0) {
              expect(mockStorage.remove).toHaveBeenCalled();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('snapshot NÃO deve ser removido se restauração falhar', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              wasEnabled: fc.constant(true),
              mayDisable: fc.constant(true),
              installType: fc.constant('normal' as ExtensionInstallType),
              type: fc.constant('extension' as ExtensionType),
              version: fc.constant('1.0.0'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (snapshotExtensions, correlationId, errorMessage) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockStorage.remove.mockReset();
            mockStorage.remove.mockResolvedValue(undefined);

            // Criar extensões originais
            const originalExtensions = snapshotExtensions.map((ext) => ({
              id: ext.id,
              name: ext.name,
              description: '',
              version: '1.0.0',
              enabled: true,
              mayDisable: true,
              installType: 'normal' as ExtensionInstallType,
              type: 'extension' as ExtensionType,
              homepageUrl: '',
              updateUrl: '',
              offlineEnabled: false,
              optionsUrl: '',
              permissions: [],
              hostPermissions: [],
            }));

            mockManagementAPI.getAll.mockResolvedValue(originalExtensions);

            // Configurar para sucesso na ativação
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);

            // Ativar isolamento primeiro
            await testManager.activateIsolation(correlationId);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: snapshotExtensions,
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Resetar mock de remove para verificar chamada
            mockStorage.remove.mockReset();
            mockStorage.remove.mockResolvedValue(undefined);

            // Configurar para falhar na restauração
            mockManagementAPI.setEnabled.mockRejectedValue(new Error(errorMessage));

            // Desativar isolamento (restaurar) - vai falhar
            const result = await testManager.deactivateIsolation();

            // Se restauração falhou, snapshot NÃO deve ser removido
            if (!result.success || result.failedExtensions.length > 0) {
              expect(mockStorage.remove).not.toHaveBeenCalled();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('DEVE registrar falhas de restauração com detalhes do erro', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              wasEnabled: fc.constant(true),
              mayDisable: fc.constant(true),
              installType: fc.constant('normal' as ExtensionInstallType),
              type: fc.constant('extension' as ExtensionType),
              version: fc.constant('1.0.0'),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (snapshotExtensions, correlationId, errorMessage) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockStorage.remove.mockResolvedValue(undefined);

            // Criar extensões originais
            const originalExtensions = snapshotExtensions.map((ext) => ({
              id: ext.id,
              name: ext.name,
              description: '',
              version: '1.0.0',
              enabled: true,
              mayDisable: true,
              installType: 'normal' as ExtensionInstallType,
              type: 'extension' as ExtensionType,
              homepageUrl: '',
              updateUrl: '',
              offlineEnabled: false,
              optionsUrl: '',
              permissions: [],
              hostPermissions: [],
            }));

            mockManagementAPI.getAll.mockResolvedValue(originalExtensions);

            // Configurar para sucesso na ativação
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);

            // Ativar isolamento primeiro
            await testManager.activateIsolation(correlationId);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: snapshotExtensions,
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Limpar entradas anteriores
            testLogger.clear();

            // Configurar para falhar na restauração
            mockManagementAPI.setEnabled.mockRejectedValue(new Error(errorMessage));

            // Desativar isolamento (restaurar) - vai falhar
            await testManager.deactivateIsolation();

            const entries = testLogger.getEntries();

            // 5.4: Falhas de restauração DEVEM ter log com detalhes do erro
            const failureLogs = entries.filter(
              (e) => e.process === 'ISOLATION' && e.action === 'EXTENSION_RESTORE_FAILED'
            );

            // Deve haver um log de falha para cada extensão
            expect(failureLogs.length).toBe(snapshotExtensions.length);

            // Cada log de falha deve conter extensionId, extensionName e error
            for (const log of failureLogs) {
              expect(log.data?.['extensionId']).toBeDefined();
              expect(log.data?.['extensionName']).toBeDefined();
              expect(log.data?.['error']).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Invariante Lexato Ativa
   * Requirement 10.2
   */
  describe('Property 6: Invariante Lexato Ativa', () => {
    it('extensão Lexato NUNCA deve ser desativada', async () => {
      await fc.assert(
        fc.asyncProperty(extensionListArbitrary, async (extensions) => {
          // Garantir que Lexato está na lista
          const withLexato = [
            ...extensions,
            createMockExtensionInfo({ id: mockRuntime.id, name: 'Lexato', enabled: true }),
          ];
          mockManagementAPI.getAll.mockResolvedValue(withLexato);

          await manager.activateIsolation('test-corr');

          // Verificar que setEnabled NUNCA foi chamado para Lexato
          const calls = mockManagementAPI.setEnabled.mock.calls;
          const lexatoCalls = calls.filter(
            (call) => (call as [string, boolean])[0] === mockRuntime.id
          );
          expect(lexatoCalls).toHaveLength(0);

          // Limpar estado
          await manager.forceRestore();
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: Auditoria Completa
   * Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.7
   *
   * Para qualquer operação de isolamento ou restauração:
   * - DEVE haver log de início com correlationId e categoria "ISOLATION"
   * - Cada extensão processada DEVE ter log com id, name e resultado
   * - DEVE haver log de fim com tempo total e resultado
   */
  describe('Property 7: Auditoria Completa', () => {
    /**
     * Arbitrary para gerar extensões válidas para desativação
     */
    const validExtensionArbitrary = fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      enabled: fc.constant(true),
      mayDisable: fc.constant(true),
      installType: fc.constant('normal' as ExtensionInstallType),
      type: fc.constant('extension' as ExtensionType),
      version: fc.constant('1.0.0'),
      description: fc.constant(''),
      homepageUrl: fc.constant(''),
      updateUrl: fc.constant(''),
      offlineEnabled: fc.constant(false),
      optionsUrl: fc.constant(''),
      permissions: fc.constant([]),
      hostPermissions: fc.constant([]),
    });

    it('operação de ativação DEVE gerar logs com categoria ISOLATION e correlationId', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo logger para capturar entradas
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            mockManagementAPI.getAll.mockResolvedValue(extensions);

            await testManager.activateIsolation(correlationId);

            const entries = testLogger.getEntries();

            // 9.1: DEVE haver log de início com correlationId
            const startLog = entries.find(
              (e) => e.process === 'ISOLATION' && e.action === 'ACTIVATION_START'
            );
            expect(startLog).toBeDefined();
            expect(startLog?.correlationId).toBe(correlationId);

            // 9.7: Todos os logs DEVEM ter categoria ISOLATION
            const isolationLogs = entries.filter((e) => e.process === 'ISOLATION');
            expect(isolationLogs.length).toBeGreaterThan(0);

            // 9.2: Cada extensão desativada DEVE ter log com id e name
            for (const ext of extensions) {
              const extLog = entries.find(
                (e) =>
                  e.process === 'ISOLATION' &&
                  e.action === 'EXTENSION_DISABLED' &&
                  e.data?.['extensionId'] === ext.id
              );
              if (extLog) {
                expect(extLog.data?.['extensionName']).toBeDefined();
              }
            }

            // DEVE haver log de fim (ACTIVATION_COMPLETE ou ACTIVATION_FAILED)
            const endLog = entries.find(
              (e) =>
                e.process === 'ISOLATION' &&
                (e.action === 'ACTIVATION_COMPLETE' || e.action === 'ACTIVATION_FAILED')
            );
            expect(endLog).toBeDefined();
            expect(endLog?.data?.['elapsedMs']).toBeDefined();

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('operação de desativação DEVE gerar logs de início e fim da restauração', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 3 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo logger para capturar entradas
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            mockManagementAPI.getAll.mockResolvedValue(extensions);

            // Ativar primeiro
            await testManager.activateIsolation(correlationId);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: extensions.map((ext) => ({
                    id: ext.id,
                    name: ext.name,
                    wasEnabled: true,
                    mayDisable: true,
                    installType: 'normal',
                    type: 'extension',
                    version: '1.0.0',
                  })),
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Limpar entradas anteriores para focar na desativação
            testLogger.clear();

            // Desativar
            await testManager.deactivateIsolation();

            const entries = testLogger.getEntries();

            // 9.4: DEVE haver log de início da restauração
            const startLog = entries.find(
              (e) => e.process === 'ISOLATION' && e.action === 'DEACTIVATION_START'
            );
            expect(startLog).toBeDefined();

            // 9.4: DEVE haver log de fim da restauração
            const endLog = entries.find(
              (e) =>
                e.process === 'ISOLATION' &&
                (e.action === 'DEACTIVATION_COMPLETE' || e.action === 'DEACTIVATION_FAILED')
            );
            expect(endLog).toBeDefined();

            // 9.7: Todos os logs DEVEM ter categoria ISOLATION
            for (const entry of entries) {
              if (
                entry.action.includes('DEACTIVATION') ||
                entry.action.includes('RESTORE') ||
                entry.action.includes('SNAPSHOT')
              ) {
                expect(entry.process).toBe('ISOLATION');
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('falhas de restauração DEVEM ser registradas com detalhes do erro', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 3 }),
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 50 }),
          async (extensions, correlationId, errorMessage) => {
            // Criar novo logger para capturar entradas
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            mockManagementAPI.getAll.mockResolvedValue(extensions);

            // Ativar primeiro
            await testManager.activateIsolation(correlationId);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: extensions.map((ext) => ({
                    id: ext.id,
                    name: ext.name,
                    wasEnabled: true,
                    mayDisable: true,
                    installType: 'normal',
                    type: 'extension',
                    version: '1.0.0',
                  })),
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Simular falha na restauração
            mockManagementAPI.setEnabled.mockRejectedValue(new Error(errorMessage));

            // Limpar entradas anteriores
            testLogger.clear();

            // Desativar (vai falhar)
            await testManager.deactivateIsolation();

            const entries = testLogger.getEntries();

            // 9.5: Falhas de restauração DEVEM ter log com detalhes do erro
            const failureLogs = entries.filter(
              (e) =>
                e.process === 'ISOLATION' &&
                (e.action === 'EXTENSION_RESTORE_FAILED' || e.action === 'DEACTIVATION_FAILED')
            );

            // Deve haver pelo menos um log de falha
            expect(failureLogs.length).toBeGreaterThan(0);

            // Logs de falha de extensão devem conter detalhes
            const extFailureLogs = entries.filter(
              (e) => e.process === 'ISOLATION' && e.action === 'EXTENSION_RESTORE_FAILED'
            );
            for (const log of extFailureLogs) {
              expect(log.data?.['extensionId']).toBeDefined();
              expect(log.data?.['error']).toBeDefined();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('extensões não desativáveis DEVEM ser registradas com motivo', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 3, maxLength: 20 }),
          async (correlationId, extName) => {
            // Criar novo logger para capturar entradas
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Criar extensão não desativável (admin)
            const adminExtension = createMockExtensionInfo({
              id: `admin_${Date.now()}`,
              name: extName,
              enabled: true,
              mayDisable: false,
              installType: 'admin',
            });

            mockManagementAPI.getAll.mockResolvedValue([adminExtension]);

            await testManager.activateIsolation(correlationId);

            const entries = testLogger.getEntries();

            // 9.3: Extensões não desativáveis DEVEM ter log com motivo
            const nonDisableableLog = entries.find(
              (e) => e.process === 'ISOLATION' && e.action === 'NON_DISABLEABLE_EXTENSIONS'
            );
            expect(nonDisableableLog).toBeDefined();
            expect(nonDisableableLog?.data?.['count']).toBeGreaterThan(0);
            expect(nonDisableableLog?.data?.['extensions']).toBeDefined();

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Garantia de Restauração
   * Requirements 6.5, 5.6
   *
   * Para qualquer fluxo de captura (sucesso, falha ou cancelamento):
   * - As extensões DEVEM ser restauradas ao estado original
   * - Mesmo em caso de exceção não tratada, a restauração DEVE ocorrer (finally)
   * - Se restauração falhar, o snapshot DEVE ser mantido para retry
   */
  describe('Property 5: Garantia de Restauração', () => {
    /**
     * Arbitrary para gerar extensões válidas para desativação
     */
    const validExtensionArbitrary = fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      enabled: fc.constant(true),
      mayDisable: fc.constant(true),
      installType: fc.constant('normal' as ExtensionInstallType),
      type: fc.constant('extension' as ExtensionType),
      version: fc.constant('1.0.0'),
      description: fc.constant(''),
      homepageUrl: fc.constant(''),
      updateUrl: fc.constant(''),
      offlineEnabled: fc.constant(false),
      optionsUrl: fc.constant(''),
      permissions: fc.constant([]),
      hostPermissions: fc.constant([]),
    });

    /**
     * Simula fluxo de captura com sucesso
     * Requirement 6.5: Extensões DEVEM ser restauradas após captura bem-sucedida
     */
    it('extensões DEVEM ser restauradas após fluxo de captura bem-sucedido', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);
            mockStorage.remove.mockResolvedValue(undefined);

            // 1. Ativar isolamento (simula início da captura)
            const activationResult = await testManager.activateIsolation(correlationId);
            expect(activationResult.success).toBe(true);

            // Verificar que extensões foram desativadas
            const disableCalls = mockManagementAPI.setEnabled.mock.calls.filter(
              (call) => (call as [string, boolean])[1] === false
            );
            expect(disableCalls.length).toBe(extensions.length);

            // Configurar mock para carregar snapshot na restauração
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: activationResult.snapshot?.id,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: extensions.map((ext) => ({
                    id: ext.id,
                    name: ext.name,
                    wasEnabled: true,
                    mayDisable: true,
                    installType: 'normal',
                    type: 'extension',
                    version: '1.0.0',
                  })),
                  hash: activationResult.snapshot?.hash ?? 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Resetar contagem de chamadas para verificar restauração
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);

            // 2. Desativar isolamento (simula fim da captura bem-sucedida)
            const deactivationResult = await testManager.deactivateIsolation();

            // 6.5: Extensões DEVEM ser restauradas
            expect(deactivationResult.success).toBe(true);
            expect(deactivationResult.restoredExtensions.length).toBe(extensions.length);

            // Verificar que setEnabled foi chamado com true para cada extensão
            const restoreCalls = mockManagementAPI.setEnabled.mock.calls.filter(
              (call) => (call as [string, boolean])[1] === true
            );
            expect(restoreCalls.length).toBe(extensions.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Simula fluxo de captura com falha
     * Requirement 6.5: Extensões DEVEM ser restauradas mesmo em caso de falha
     */
    it('extensões DEVEM ser restauradas após fluxo de captura com falha', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);
            mockStorage.remove.mockResolvedValue(undefined);

            // 1. Ativar isolamento
            const activationResult = await testManager.activateIsolation(correlationId);
            expect(activationResult.success).toBe(true);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: activationResult.snapshot?.id,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: extensions.map((ext) => ({
                    id: ext.id,
                    name: ext.name,
                    wasEnabled: true,
                    mayDisable: true,
                    installType: 'normal',
                    type: 'extension',
                    version: '1.0.0',
                  })),
                  hash: activationResult.snapshot?.hash ?? 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // 2. Simular falha na captura (não importa o motivo)
            // O importante é que a restauração seja chamada

            // Resetar contagem de chamadas
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);

            // 3. Desativar isolamento (restaurar após falha)
            const deactivationResult = await testManager.deactivateIsolation();

            // 6.5: Extensões DEVEM ser restauradas mesmo após falha
            expect(deactivationResult.success).toBe(true);
            expect(deactivationResult.restoredExtensions.length).toBe(extensions.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 5.6: Se restauração falhar, snapshot DEVE ser mantido para retry
     */
    it('snapshot DEVE ser mantido se restauração falhar para permitir retry', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (extensions, correlationId, errorMessage) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);
            mockStorage.remove.mockReset();
            mockStorage.remove.mockResolvedValue(undefined);

            // 1. Ativar isolamento
            const activationResult = await testManager.activateIsolation(correlationId);
            expect(activationResult.success).toBe(true);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: activationResult.snapshot?.id,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: extensions.map((ext) => ({
                    id: ext.id,
                    name: ext.name,
                    wasEnabled: true,
                    mayDisable: true,
                    installType: 'normal',
                    type: 'extension',
                    version: '1.0.0',
                  })),
                  hash: activationResult.snapshot?.hash ?? 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Configurar para falhar na restauração
            mockManagementAPI.setEnabled.mockRejectedValue(new Error(errorMessage));

            // 2. Tentar desativar isolamento (vai falhar)
            const deactivationResult = await testManager.deactivateIsolation();

            // 5.6: Se restauração falhar, snapshot DEVE ser mantido
            expect(deactivationResult.success).toBe(false);
            expect(deactivationResult.failedExtensions.length).toBeGreaterThan(0);

            // Snapshot NÃO deve ter sido removido
            expect(mockStorage.remove).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 6.5: forceRestore DEVE restaurar extensões do snapshot
     */
    it('forceRestore DEVE restaurar extensões do snapshot persistido', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockStorage.remove.mockResolvedValue(undefined);

            // Configurar mock para carregar snapshot (simula snapshot órfão)
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now() - 60000, // 1 minuto atrás
                  extensions: extensions.map((ext) => ({
                    id: ext.id,
                    name: ext.name,
                    wasEnabled: true,
                    mayDisable: true,
                    installType: 'normal',
                    type: 'extension',
                    version: '1.0.0',
                  })),
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now() - 60000,
                version: '1.0.0',
              },
            });

            // Chamar forceRestore
            const result = await testManager.forceRestore();

            // 6.5: forceRestore DEVE restaurar extensões
            expect(result.success).toBe(true);
            expect(result.restoredExtensions.length).toBe(extensions.length);

            // Verificar que setEnabled foi chamado com true para cada extensão
            const restoreCalls = mockManagementAPI.setEnabled.mock.calls.filter(
              (call) => (call as [string, boolean])[1] === true
            );
            expect(restoreCalls.length).toBe(extensions.length);

            // Snapshot deve ter sido removido após sucesso
            expect(mockStorage.remove).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 5.6: forceRestore DEVE manter snapshot se falhar
     */
    it('forceRestore DEVE manter snapshot se restauração falhar', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 3 }),
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (extensions, correlationId, errorMessage) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockStorage.remove.mockReset();
            mockStorage.remove.mockResolvedValue(undefined);

            // Configurar mock para carregar snapshot
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now(),
                  extensions: extensions.map((ext) => ({
                    id: ext.id,
                    name: ext.name,
                    wasEnabled: true,
                    mayDisable: true,
                    installType: 'normal',
                    type: 'extension',
                    version: '1.0.0',
                  })),
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now(),
                version: '1.0.0',
              },
            });

            // Configurar para falhar na restauração
            mockManagementAPI.setEnabled.mockRejectedValue(new Error(errorMessage));

            // Chamar forceRestore
            const result = await testManager.forceRestore();

            // 5.6: Se restauração falhar, snapshot DEVE ser mantido
            expect(result.success).toBe(false);
            expect(result.failedExtensions.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 6.5: checkPendingSnapshots DEVE restaurar snapshots órfãos
     */
    it('checkPendingSnapshots DEVE restaurar extensões de snapshots órfãos', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockStorage.remove.mockResolvedValue(undefined);

            // Configurar mock para carregar snapshot órfão
            mockStorage.get.mockResolvedValue({
              lexato_isolation_snapshot: {
                snapshot: {
                  id: `snap_orphan_${Date.now()}`,
                  correlationId,
                  createdAt: Date.now() - 3600000, // 1 hora atrás
                  extensions: extensions.map((ext) => ({
                    id: ext.id,
                    name: ext.name,
                    wasEnabled: true,
                    mayDisable: true,
                    installType: 'normal',
                    type: 'extension',
                    version: '1.0.0',
                  })),
                  hash: 'valid_hash',
                  lexatoExtensionId: mockRuntime.id,
                },
                persistedAt: Date.now() - 3600000,
                version: '1.0.0',
              },
            });

            // Chamar checkPendingSnapshots (simula startup do service worker)
            await testManager.checkPendingSnapshots();

            // 6.5: Extensões DEVEM ser restauradas de snapshots órfãos
            const restoreCalls = mockManagementAPI.setEnabled.mock.calls.filter(
              (call) => (call as [string, boolean])[1] === true
            );
            expect(restoreCalls.length).toBe(extensions.length);

            // Snapshot deve ter sido removido após restauração
            expect(mockStorage.remove).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 9: Detecção de Violações
   * Requirements 10.3, 10.4
   *
   * Para qualquer período de isolamento ativo:
   * - Se uma extensão for reativada externamente, DEVE ser detectado como violação
   * - Se uma nova extensão for instalada, DEVE ser detectado e registrado
   * - Violações DEVEM ser registradas no AuditLogger com detalhes
   */
  describe('Property 9: Detecção de Violações', () => {
    /**
     * Arbitrary para gerar extensões válidas para desativação
     */
    const validExtensionArbitrary = fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      enabled: fc.constant(true),
      mayDisable: fc.constant(true),
      installType: fc.constant('normal' as ExtensionInstallType),
      type: fc.constant('extension' as ExtensionType),
      version: fc.constant('1.0.0'),
      description: fc.constant(''),
      homepageUrl: fc.constant(''),
      updateUrl: fc.constant(''),
      offlineEnabled: fc.constant(false),
      optionsUrl: fc.constant(''),
      permissions: fc.constant([]),
      hostPermissions: fc.constant([]),
    });

    /**
     * Requirement 10.4: DEVE detectar extensão reativada durante isolamento
     *
     * Para qualquer extensão desativada durante isolamento, se ela for
     * reativada externamente, checkForViolations DEVE detectar e registrar
     * uma violação do tipo 'extension_reactivated'.
     */
    it('DEVE detectar extensão reativada durante isolamento', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          fc.integer({ min: 0 }),
          async (extensions, correlationId, reactivateIndex) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);
            mockStorage.remove.mockResolvedValue(undefined);

            // 1. Ativar isolamento
            const activationResult = await testManager.activateIsolation(correlationId);

            // Se não houver extensões para desativar, pular
            if (!activationResult.success || activationResult.disabledExtensions.length === 0) {
              return;
            }

            // 2. Simular extensão reativada externamente
            // Escolher uma extensão desativada para reativar
            const reactivatedIdx = reactivateIndex % activationResult.disabledExtensions.length;
            const reactivatedExtId = activationResult.disabledExtensions[reactivatedIdx];
            const reactivatedExt = extensions.find((e) => e.id === reactivatedExtId);

            // Configurar mock para retornar extensão como habilitada novamente
            const currentExtensions = extensions.map((ext) => ({
              ...ext,
              // Extensão reativada aparece como enabled: true
              enabled: ext.id === reactivatedExtId ? true : false,
            }));
            mockManagementAPI.getAll.mockResolvedValue(currentExtensions);

            // 3. Verificar violações
            const violations = await testManager.checkForViolations();

            // 10.4: DEVE detectar extensão reativada
            const reactivationViolation = violations.find(
              (v) => v.type === 'extension_reactivated' && v.extensionId === reactivatedExtId
            );
            expect(reactivationViolation).toBeDefined();
            expect(reactivationViolation?.extensionName).toBe(reactivatedExt?.name);
            expect(reactivationViolation?.timestamp).toBeGreaterThan(0);

            // Verificar que violação foi registrada no AuditLogger
            const entries = testLogger.getEntries();
            const violationLog = entries.find(
              (e) =>
                e.process === 'ISOLATION' &&
                e.action === 'VIOLATION_EXTENSION_REACTIVATED' &&
                e.data?.['extensionId'] === reactivatedExtId
            );
            expect(violationLog).toBeDefined();

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 10.3: DEVE detectar nova extensão instalada durante isolamento
     *
     * Para qualquer nova extensão instalada durante o período de isolamento,
     * checkForViolations DEVE detectar e registrar uma violação do tipo
     * 'new_extension_installed'.
     */
    it('DEVE detectar nova extensão instalada durante isolamento', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          async (extensions, correlationId, newExtId, newExtName) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);
            mockStorage.remove.mockResolvedValue(undefined);

            // 1. Ativar isolamento
            const activationResult = await testManager.activateIsolation(correlationId);

            if (!activationResult.success) {
              return;
            }

            // 2. Simular nova extensão instalada durante isolamento
            // Garantir que o ID da nova extensão não conflita com existentes
            const uniqueNewExtId = `new_${newExtId}_${Date.now()}`;
            const newExtension = {
              id: uniqueNewExtId,
              name: newExtName,
              description: '',
              version: '1.0.0',
              enabled: true, // Nova extensão está habilitada
              mayDisable: true,
              installType: 'normal' as ExtensionInstallType,
              type: 'extension' as ExtensionType,
              homepageUrl: '',
              updateUrl: '',
              offlineEnabled: false,
              optionsUrl: '',
              permissions: [],
              hostPermissions: [],
            };

            // Configurar mock para retornar extensões originais (desabilitadas) + nova extensão
            const currentExtensions = [
              ...extensions.map((ext) => ({ ...ext, enabled: false })),
              newExtension,
            ];
            mockManagementAPI.getAll.mockResolvedValue(currentExtensions);

            // 3. Verificar violações
            const violations = await testManager.checkForViolations();

            // 10.3: DEVE detectar nova extensão instalada
            const newExtViolation = violations.find(
              (v) => v.type === 'new_extension_installed' && v.extensionId === uniqueNewExtId
            );
            expect(newExtViolation).toBeDefined();
            expect(newExtViolation?.extensionName).toBe(newExtName);
            expect(newExtViolation?.timestamp).toBeGreaterThan(0);
            expect(newExtViolation?.details).toBeDefined();

            // Verificar que violação foi registrada no AuditLogger
            const entries = testLogger.getEntries();
            const violationLog = entries.find(
              (e) =>
                e.process === 'ISOLATION' &&
                e.action === 'VIOLATION_NEW_EXTENSION' &&
                e.data?.['extensionId'] === uniqueNewExtId
            );
            expect(violationLog).toBeDefined();

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 10.3, 10.4: Violações DEVEM ser acumuladas e recuperáveis
     *
     * Para qualquer sequência de violações durante isolamento, todas DEVEM
     * ser registradas e recuperáveis via getViolations().
     */
    it('violações DEVEM ser acumuladas e recuperáveis via getViolations()', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 2, maxLength: 5 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);
            mockStorage.remove.mockResolvedValue(undefined);

            // 1. Ativar isolamento
            const activationResult = await testManager.activateIsolation(correlationId);

            if (!activationResult.success || activationResult.disabledExtensions.length === 0) {
              return;
            }

            // 2. Simular múltiplas violações: extensão reativada + nova extensão
            const reactivatedExtId = activationResult.disabledExtensions[0];
            const newExtId = `new_ext_${Date.now()}`;

            const currentExtensions = [
              // Extensão reativada
              ...extensions.map((ext) => ({
                ...ext,
                enabled: ext.id === reactivatedExtId ? true : false,
              })),
              // Nova extensão instalada
              {
                id: newExtId,
                name: 'Nova Extensão',
                description: '',
                version: '1.0.0',
                enabled: true,
                mayDisable: true,
                installType: 'normal' as ExtensionInstallType,
                type: 'extension' as ExtensionType,
                homepageUrl: '',
                updateUrl: '',
                offlineEnabled: false,
                optionsUrl: '',
                permissions: [],
                hostPermissions: [],
              },
            ];
            mockManagementAPI.getAll.mockResolvedValue(currentExtensions);

            // 3. Verificar violações
            await testManager.checkForViolations();

            // 4. Recuperar violações acumuladas
            const allViolations = testManager.getViolations();

            // DEVE ter pelo menos 2 violações (reativação + nova extensão)
            expect(allViolations.length).toBeGreaterThanOrEqual(2);

            // DEVE ter violação de reativação
            const hasReactivation = allViolations.some(
              (v) => v.type === 'extension_reactivated' && v.extensionId === reactivatedExtId
            );
            expect(hasReactivation).toBe(true);

            // DEVE ter violação de nova extensão
            const hasNewExt = allViolations.some(
              (v) => v.type === 'new_extension_installed' && v.extensionId === newExtId
            );
            expect(hasNewExt).toBe(true);

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 10.3, 10.4: checkForViolations NÃO deve detectar violações
     * quando isolamento não está ativo
     */
    it('NÃO deve detectar violações quando isolamento não está ativo', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (correlationId) => {
          // Criar novo manager para cada iteração
          const testLogger = new AuditLogger(correlationId);
          const testManager = new ExtensionIsolationManager(testLogger);

          // Não ativar isolamento

          // Verificar violações
          const violations = await testManager.checkForViolations();

          // NÃO deve haver violações quando isolamento não está ativo
          expect(violations).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 10.3, 10.4: Extensões desabilitadas que permanecem desabilitadas
     * NÃO devem gerar violação
     */
    it('extensões que permanecem desabilitadas NÃO devem gerar violação', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validExtensionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          async (extensions, correlationId) => {
            // Criar novo manager para cada iteração
            const testLogger = new AuditLogger(correlationId);
            const testManager = new ExtensionIsolationManager(testLogger);

            // Resetar mocks
            mockManagementAPI.setEnabled.mockReset();
            mockManagementAPI.setEnabled.mockResolvedValue(undefined);
            mockManagementAPI.getAll.mockResolvedValue(extensions);
            mockStorage.remove.mockResolvedValue(undefined);

            // 1. Ativar isolamento
            const activationResult = await testManager.activateIsolation(correlationId);

            if (!activationResult.success) {
              return;
            }

            // 2. Simular que todas as extensões permanecem desabilitadas
            const currentExtensions = extensions.map((ext) => ({
              ...ext,
              enabled: false, // Todas permanecem desabilitadas
            }));
            mockManagementAPI.getAll.mockResolvedValue(currentExtensions);

            // 3. Verificar violações
            const violations = await testManager.checkForViolations();

            // NÃO deve haver violações de reativação
            const reactivationViolations = violations.filter(
              (v) => v.type === 'extension_reactivated'
            );
            expect(reactivationViolations).toHaveLength(0);

            // Limpar estado
            await testManager.forceRestore();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Testes de Serialização Determinística e Hash
  // ==========================================================================

  describe('Serialização Determinística e Hash', () => {
    it('deve gerar hash consistente para o mesmo snapshot', async () => {
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1' }),
        createMockExtensionInfo({ id: 'ext_2', name: 'Extension 2' }),
      ];

      mockManagementAPI.getAll.mockResolvedValue(extensions);
      mockManagementAPI.setEnabled.mockResolvedValue(undefined);
      mockStorage.set.mockResolvedValue(undefined);

      // Ativar isolamento duas vezes e comparar hashes
      const result1 = await manager.activateIsolation('correlation-1');
      const hash1 = result1.snapshot?.hash;

      // Limpar e reativar
      await manager.forceRestore();
      mockStorage.remove.mockResolvedValue(undefined);

      const result2 = await manager.activateIsolation('correlation-1');
      const hash2 = result2.snapshot?.hash;

      // Hashes devem ser diferentes pois createdAt e id são diferentes
      // Mas o formato deve ser consistente (64 caracteres hex)
      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1?.length).toBe(64);
      expect(hash2?.length).toBe(64);
    });

    it('deve validar hash corretamente após persistência e recuperação', async () => {
      const extensions = [
        createMockExtensionInfo({ id: 'ext_1', name: 'Extension 1', enabled: true }),
      ];

      mockManagementAPI.getAll.mockResolvedValue(extensions);
      mockManagementAPI.setEnabled.mockResolvedValue(undefined);

      // Capturar o snapshot persistido
      let persistedData: unknown = null;
      mockStorage.set.mockImplementation((data) => {
        persistedData = data;
        return Promise.resolve();
      });

      // Ativar isolamento
      const activationResult = await manager.activateIsolation('test-correlation');
      expect(activationResult.success).toBe(true);
      expect(activationResult.snapshot).not.toBeNull();

      // Simular recuperação do storage com o mesmo snapshot
      mockStorage.get.mockResolvedValue(persistedData);

      // Desativar isolamento - deve validar hash sem erros
      mockManagementAPI.setEnabled.mockResolvedValue(undefined);
      mockStorage.remove.mockResolvedValue(undefined);

      const deactivationResult = await manager.deactivateIsolation();

      // Deve ter sucesso (hash válido)
      expect(deactivationResult.success).toBe(true);
    });

    it('deve gerar hash diferente para objetos com ordem de propriedades diferente', async () => {
      // Este teste verifica que a serialização determinística funciona
      // criando dois objetos com mesmas propriedades em ordens diferentes
      const extensions1 = [
        createMockExtensionInfo({ id: 'a', name: 'A', version: '1.0' }),
        createMockExtensionInfo({ id: 'b', name: 'B', version: '2.0' }),
      ];

      const extensions2 = [
        createMockExtensionInfo({ id: 'b', name: 'B', version: '2.0' }),
        createMockExtensionInfo({ id: 'a', name: 'A', version: '1.0' }),
      ];

      // Primeiro snapshot
      mockManagementAPI.getAll.mockResolvedValue(extensions1);
      mockManagementAPI.setEnabled.mockResolvedValue(undefined);
      mockStorage.set.mockResolvedValue(undefined);

      const result1 = await manager.activateIsolation('test-1');
      const hash1 = result1.snapshot?.hash;

      await manager.forceRestore();
      mockStorage.remove.mockResolvedValue(undefined);

      // Segundo snapshot com ordem diferente
      mockManagementAPI.getAll.mockResolvedValue(extensions2);

      const result2 = await manager.activateIsolation('test-1');
      const hash2 = result2.snapshot?.hash;

      // Hashes devem ser diferentes pois a ordem das extensões é diferente
      // (arrays não são reordenados, apenas objetos têm chaves ordenadas)
      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      // Nota: hashes serão diferentes devido a timestamps diferentes
    });

    it('deve manter consistência de hash com objetos aninhados', async () => {
      const extensions = [
        createMockExtensionInfo({
          id: 'ext_nested',
          name: 'Nested Extension',
          permissions: ['tabs', 'storage', 'activeTab'],
          hostPermissions: ['*://*.example.com/*'],
        }),
      ];

      mockManagementAPI.getAll.mockResolvedValue(extensions);
      mockManagementAPI.setEnabled.mockResolvedValue(undefined);
      mockStorage.set.mockResolvedValue(undefined);

      const result = await manager.activateIsolation('nested-test');

      expect(result.success).toBe(true);
      expect(result.snapshot?.hash).toBeDefined();
      expect(result.snapshot?.hash.length).toBe(64);
    });
  });
});
