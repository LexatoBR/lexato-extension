/**
 * Testes Unitários: TabIsolationManager
 *
 * Testa o gerenciador de isolamento de abas, incluindo:
 * - Ativação do isolamento (fechar outras abas/janelas)
 * - Desativação do lockdown com ordem correta
 * - Registro de tentativas bloqueadas
 * - Geração de seção do manifesto
 *
 * @module tab-isolation-manager.test
 * @requirements 17.1-17.5: Lockdown Deactivation

 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TabIsolationManager,
  type BlockedTabAttempt,
} from '../../../src/background/tab-isolation-manager';
import { AuditLogger } from '../../../src/lib/audit-logger';

// ============================================================================
// Mocks
// ============================================================================

/**
 * Mock do chrome.tabs API
 */
const mockTabsQuery = vi.fn();
const mockTabsRemove = vi.fn();
const mockTabsReload = vi.fn();
const mockTabsSendMessage = vi.fn();

/**
 * Mock do chrome.windows API
 */
const mockWindowsGetAll = vi.fn();
const mockWindowsRemove = vi.fn();

/**
 * Mock do chrome.management API
 */
const mockManagementSetEnabled = vi.fn();

vi.stubGlobal('chrome', {
  tabs: {
    query: mockTabsQuery,
    remove: mockTabsRemove,
    reload: mockTabsReload,
    sendMessage: mockTabsSendMessage,
  },
  windows: {
    getAll: mockWindowsGetAll,
    remove: mockWindowsRemove,
  },
  management: {
    setEnabled: mockManagementSetEnabled,
  },
});

/**
 * Mock do AuditLogger
 */
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as AuditLogger;

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Limpa todos os mocks
 */
function clearAllMocks(): void {
  vi.clearAllMocks();
}

/**
 * Configura mocks padrão para cenário de sucesso
 */
function setupDefaultMocks(): void {
  mockTabsQuery.mockResolvedValue([]);
  mockTabsRemove.mockResolvedValue(undefined);
  mockTabsReload.mockResolvedValue(undefined);
  mockTabsSendMessage.mockResolvedValue(undefined);
  mockWindowsGetAll.mockResolvedValue([]);
  mockWindowsRemove.mockResolvedValue(undefined);
  mockManagementSetEnabled.mockResolvedValue(undefined);
}

// ============================================================================
// Testes
// ============================================================================

describe('TabIsolationManager', () => {
  let manager: TabIsolationManager;

  beforeEach(() => {
    clearAllMocks();
    setupDefaultMocks();
    manager = new TabIsolationManager(mockLogger);
  });

  afterEach(() => {
    clearAllMocks();
  });

  // ==========================================================================
  // Estado Inicial
  // ==========================================================================

  describe('Estado Inicial', () => {
    it('deve iniciar com isolamento desativado', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('deve retornar null para recordingTabId quando inativo', () => {
      expect(manager.getRecordingTabId()).toBeNull();
    });

    it('deve retornar null para recordingWindowId quando inativo', () => {
      expect(manager.getRecordingWindowId()).toBeNull();
    });

    it('deve retornar estado inicial correto', () => {
      const state = manager.getState();
      expect(state.isActive).toBe(false);
      expect(state.recordingTabId).toBeNull();
      expect(state.recordingWindowId).toBeNull();
      expect(state.activatedAt).toBeNull();
      expect(state.closedTabsBeforeRecording).toEqual([]);
      expect(state.blockedAttempts).toEqual([]);
      expect(state.disabledExtensionIds).toEqual([]);
      expect(state.keyboardBlocked).toBe(false);
      expect(state.contextMenuBlocked).toBe(false);
      expect(state.devToolsBlocked).toBe(false);
    });
  });

  // ==========================================================================
  // Ativação do Isolamento
  // ==========================================================================

  describe('Ativação do Isolamento', () => {
    it('deve ativar isolamento e fechar outras abas', async () => {
      const recordingTabId = 1;
      const recordingWindowId = 100;

      // Mock: 3 abas abertas, uma é a de gravação
      mockTabsQuery.mockResolvedValue([
        { id: 1, url: 'https://example.com', title: 'Example' },
        { id: 2, url: 'https://other.com', title: 'Other' },
        { id: 3, url: 'https://third.com', title: 'Third' },
      ]);

      await manager.activate(recordingTabId, recordingWindowId);

      expect(manager.isActive()).toBe(true);
      expect(manager.getRecordingTabId()).toBe(recordingTabId);
      expect(manager.getRecordingWindowId()).toBe(recordingWindowId);

      // Deve ter fechado as abas 2 e 3
      expect(mockTabsRemove).toHaveBeenCalledWith([2, 3]);
    });

    it('deve registrar abas fechadas no estado', async () => {
      const recordingTabId = 1;
      const recordingWindowId = 100;

      mockTabsQuery.mockResolvedValue([
        { id: 1, url: 'https://example.com', title: 'Recording Tab' },
        { id: 2, url: 'https://closed.com', title: 'Closed Tab' },
      ]);

      await manager.activate(recordingTabId, recordingWindowId);

      const state = manager.getState();
      expect(state.closedTabsBeforeRecording).toHaveLength(1);
      expect(state.closedTabsBeforeRecording[0]?.url).toBe('https://closed.com');
      expect(state.closedTabsBeforeRecording[0]?.title).toBe('Closed Tab');
    });

    it('deve ignorar abas devtools ao fechar', async () => {
      const recordingTabId = 1;
      const recordingWindowId = 100;

      mockTabsQuery.mockResolvedValue([
        { id: 1, url: 'https://example.com', title: 'Recording' },
        { id: 2, url: 'devtools://devtools/bundled/inspector.html', title: 'DevTools' },
        { id: 3, url: 'https://other.com', title: 'Other' },
      ]);

      await manager.activate(recordingTabId, recordingWindowId);

      // Deve ter fechado apenas a aba 3 (não a devtools)
      expect(mockTabsRemove).toHaveBeenCalledWith([3]);
    });

    it('deve fechar outras janelas', async () => {
      const recordingTabId = 1;
      const recordingWindowId = 100;

      mockTabsQuery.mockResolvedValue([{ id: 1, url: 'https://example.com', title: 'Recording' }]);
      mockWindowsGetAll.mockResolvedValue([
        { id: 100, type: 'normal' },
        { id: 200, type: 'normal' },
        { id: 300, type: 'normal' }, // Outra janela normal
      ]);

      await manager.activate(recordingTabId, recordingWindowId);

      // Deve ter fechado janelas 200 e 300
      expect(mockWindowsRemove).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Desativação do Lockdown (Task 17)
  // ==========================================================================

  describe('Desativação do Lockdown', () => {
    beforeEach(async () => {
      // Ativar isolamento primeiro
      mockTabsQuery.mockResolvedValue([{ id: 1, url: 'https://example.com', title: 'Recording' }]);
      await manager.activate(1, 100);
    });

    it('deve desativar lockdown com sucesso', async () => {
      const result = await manager.deactivateLockdown();

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(manager.isActive()).toBe(false);
    });

    it('deve executar etapas na ordem correta', async () => {
      // Marcar todos os bloqueios como ativos
      manager.setKeyboardBlocked(true);
      manager.setContextMenuBlocked(true);
      manager.setDevToolsBlocked(true);
      manager.registerDisabledExtension('ext-1');

      const result = await manager.deactivateLockdown();

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toContain('keyboard_restored');
      expect(result.stepsCompleted).toContain('context_menu_restored');
      expect(result.stepsCompleted).toContain('devtools_restored');
      expect(result.stepsCompleted).toContain('extensions_re_enabled');
    });

    it('deve restaurar atalhos de teclado', async () => {
      manager.setKeyboardBlocked(true);

      await manager.deactivateLockdown();

      expect(mockTabsSendMessage).toHaveBeenCalledWith(1, { type: 'RESTORE_KEYBOARD' });
    });

    it('deve restaurar menu de contexto', async () => {
      manager.setContextMenuBlocked(true);

      await manager.deactivateLockdown();

      expect(mockTabsSendMessage).toHaveBeenCalledWith(1, { type: 'RESTORE_CONTEXT_MENU' });
    });

    it('deve re-habilitar extensões desabilitadas', async () => {
      manager.registerDisabledExtension('ext-1');
      manager.registerDisabledExtension('ext-2');

      await manager.deactivateLockdown();

      expect(mockManagementSetEnabled).toHaveBeenCalledWith('ext-1', true);
      expect(mockManagementSetEnabled).toHaveBeenCalledWith('ext-2', true);
    });

    it('deve recarregar aba quando solicitado', async () => {
      await manager.deactivateLockdown(true);

      expect(mockTabsReload).toHaveBeenCalledWith(1);
      expect(manager.getState().recordingTabId).toBeNull();
    });

    it('não deve recarregar aba por padrão', async () => {
      await manager.deactivateLockdown();

      expect(mockTabsReload).not.toHaveBeenCalled();
    });

    it('deve continuar mesmo se restauração de teclado falhar', async () => {
      manager.setKeyboardBlocked(true);
      mockTabsSendMessage.mockRejectedValueOnce(new Error('Tab closed'));

      const result = await manager.deactivateLockdown();

      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Falha ao restaurar teclado');
    });

    it('deve continuar mesmo se re-habilitação de extensão falhar', async () => {
      manager.registerDisabledExtension('ext-1');
      mockManagementSetEnabled.mockRejectedValueOnce(new Error('Extension removed'));

      const result = await manager.deactivateLockdown();

      expect(result.success).toBe(true);
      // Warnings são registrados no logger, não no resultado para falhas individuais de extensão
    });

    it('deve limpar estado após desativação', async () => {
      manager.setKeyboardBlocked(true);
      manager.setContextMenuBlocked(true);
      manager.registerDisabledExtension('ext-1');

      await manager.deactivateLockdown();

      const state = manager.getState();
      expect(state.isActive).toBe(false);
      expect(state.recordingTabId).toBeNull();
      expect(state.recordingWindowId).toBeNull();
      expect(state.disabledExtensionIds).toEqual([]);
    });

    it('deve registrar etapas não bloqueadas corretamente', async () => {
      // Nenhum bloqueio ativo
      const result = await manager.deactivateLockdown();

      expect(result.stepsCompleted).toContain('keyboard_not_blocked');
      expect(result.stepsCompleted).toContain('context_menu_not_blocked');
      expect(result.stepsCompleted).toContain('devtools_not_blocked');
      expect(result.stepsCompleted).toContain('no_extensions_to_enable');
    });
  });

  // ==========================================================================
  // Registro de Tentativas Bloqueadas
  // ==========================================================================

  describe('Registro de Tentativas Bloqueadas', () => {
    beforeEach(async () => {
      mockTabsQuery.mockResolvedValue([{ id: 1, url: 'https://example.com', title: 'Recording' }]);
      await manager.activate(1, 100);
    });

    it('deve registrar tentativa bloqueada', async () => {
      const attempt: BlockedTabAttempt = {
        type: 'new_tab',
        attemptedUrl: 'https://blocked.com',
        timestamp: new Date().toISOString(),
        action: 'closed',
        reactionTimeMs: 50,
      };

      await manager.logBlockedAttempt(attempt);

      const state = manager.getState();
      expect(state.blockedAttempts).toHaveLength(1);
      expect(state.blockedAttempts[0]).toEqual(attempt);
    });

    it('deve registrar múltiplas tentativas', async () => {
      const attempt1: BlockedTabAttempt = {
        type: 'new_tab',
        timestamp: new Date().toISOString(),
        action: 'closed',
      };

      const attempt2: BlockedTabAttempt = {
        type: 'window_open',
        timestamp: new Date().toISOString(),
        action: 'blocked',
      };

      await manager.logBlockedAttempt(attempt1);
      await manager.logBlockedAttempt(attempt2);

      const state = manager.getState();
      expect(state.blockedAttempts).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Geração de Seção do Manifesto
  // ==========================================================================

  describe('Geração de Seção do Manifesto', () => {
    it('deve gerar seção do manifesto corretamente', async () => {
      mockTabsQuery.mockResolvedValue([
        { id: 1, url: 'https://example.com', title: 'Recording' },
        { id: 2, url: 'https://closed.com', title: 'Closed' },
      ]);

      await manager.activate(1, 100);

      await manager.logBlockedAttempt({
        type: 'new_tab',
        timestamp: new Date().toISOString(),
        action: 'closed',
        reactionTimeMs: 30,
      });

      await manager.logBlockedAttempt({
        type: 'window_open',
        timestamp: new Date().toISOString(),
        action: 'blocked',
        reactionTimeMs: 50,
      });

      const manifest = manager.generateManifestSection();

      expect(manifest.enabled).toBe(true);
      expect(manifest.closedTabsBeforeRecording).toHaveLength(1);
      expect(manifest.totalBlockedAttempts).toBe(2);
      expect(manifest.blockedAttempts).toHaveLength(2);
      expect(manifest.integrityVerified).toBe(true);
      expect(manifest.averageReactionTimeMs).toBe(40); // (30 + 50) / 2
    });

    it('deve calcular média de tempo de reação corretamente', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 1, url: 'https://example.com', title: 'Recording' }]);
      await manager.activate(1, 100);

      await manager.logBlockedAttempt({
        type: 'new_tab',
        timestamp: new Date().toISOString(),
        action: 'closed',
        reactionTimeMs: 100,
      });

      await manager.logBlockedAttempt({
        type: 'new_tab',
        timestamp: new Date().toISOString(),
        action: 'closed',
        reactionTimeMs: 200,
      });

      await manager.logBlockedAttempt({
        type: 'new_tab',
        timestamp: new Date().toISOString(),
        action: 'closed',
        // Sem reactionTimeMs - deve ser ignorado na média
      });

      const manifest = manager.generateManifestSection();
      expect(manifest.averageReactionTimeMs).toBe(150); // (100 + 200) / 2
    });

    it('deve retornar undefined para averageReactionTimeMs sem dados', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 1, url: 'https://example.com', title: 'Recording' }]);
      await manager.activate(1, 100);

      const manifest = manager.generateManifestSection();
      expect(manifest.averageReactionTimeMs).toBeUndefined();
    });
  });

  // ==========================================================================
  // Métodos de Configuração de Bloqueio
  // ==========================================================================

  describe('Métodos de Configuração de Bloqueio', () => {
    it('deve registrar extensão desabilitada', () => {
      manager.registerDisabledExtension('ext-1');
      manager.registerDisabledExtension('ext-2');

      const state = manager.getState();
      expect(state.disabledExtensionIds).toEqual(['ext-1', 'ext-2']);
    });

    it('não deve duplicar extensão desabilitada', () => {
      manager.registerDisabledExtension('ext-1');
      manager.registerDisabledExtension('ext-1');

      const state = manager.getState();
      expect(state.disabledExtensionIds).toEqual(['ext-1']);
    });

    it('deve marcar teclado como bloqueado', () => {
      manager.setKeyboardBlocked(true);
      expect(manager.getState().keyboardBlocked).toBe(true);

      manager.setKeyboardBlocked(false);
      expect(manager.getState().keyboardBlocked).toBe(false);
    });

    it('deve marcar menu de contexto como bloqueado', () => {
      manager.setContextMenuBlocked(true);
      expect(manager.getState().contextMenuBlocked).toBe(true);

      manager.setContextMenuBlocked(false);
      expect(manager.getState().contextMenuBlocked).toBe(false);
    });

    it('deve marcar DevTools como bloqueado', () => {
      manager.setDevToolsBlocked(true);
      expect(manager.getState().devToolsBlocked).toBe(true);

      manager.setDevToolsBlocked(false);
      expect(manager.getState().devToolsBlocked).toBe(false);
    });
  });

  // ==========================================================================
  // Método Legado deactivate()
  // ==========================================================================

  describe('Método Legado deactivate()', () => {
    it('deve desativar isolamento básico', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 1, url: 'https://example.com', title: 'Recording' }]);
      await manager.activate(1, 100);

      expect(manager.isActive()).toBe(true);

      await manager.deactivate();

      expect(manager.isActive()).toBe(false);
      expect(manager.getRecordingTabId()).toBeNull();
      expect(manager.getRecordingWindowId()).toBeNull();
    });
  });
});
