/**
 * Testes de Integração: Side Panel ↔ Service Worker
 *
 * Testa a comunicação via message passing entre o Side Panel e o Service Worker,
 * incluindo:
 * - STATS_UPDATE: Atualizações de estatísticas de interação
 * - NAVIGATION_UPDATE: Atualizações de navegação
 * - RECORDING_STATE_UPDATE: Atualizações de estado da gravação
 *
 * @module sidepanel-communication.test
 * @requirements 2.7, 3.1, 3.2

 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RecordingStateManager,
  resetRecordingStateManager,
} from '../../src/background/recording-state-manager';
import {
  SidePanelHandler,
  resetSidePanelHandler,
} from '../../src/background/sidepanel-handler';
import type {
  RecordingState,
  InteractionStats,
  NavigationEntry,
  SidePanelMessage,
  Alert,
  UploadProgress,
} from '../../src/sidepanel/types';

// ============================================================================
// Mocks
// ============================================================================

/**
 * Mock do chrome.runtime.sendMessage para capturar mensagens enviadas
 */
const mockSendMessage = vi.fn().mockResolvedValue(undefined);

/**
 * Mock do chrome.sidePanel para simular abertura/fechamento do Side Panel
 */
const mockSidePanelOpen = vi.fn().mockResolvedValue(undefined);
const mockSidePanelSetPanelBehavior = vi.fn().mockResolvedValue(undefined);
const mockSidePanelSetOptions = vi.fn().mockResolvedValue(undefined);

/**
 * Configura mocks do Chrome antes de cada teste
 */
function setupChromeMocks(): void {
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: mockSendMessage,
      id: 'test-extension-id',
    },
    sidePanel: {
      open: mockSidePanelOpen,
      setPanelBehavior: mockSidePanelSetPanelBehavior,
      setOptions: mockSidePanelSetOptions,
    },
  });
}

// ============================================================================
// Tipos Auxiliares
// ============================================================================

/**
 * Extrai mensagens de um tipo específico dos mocks
 */
function getMessagesByType<T extends SidePanelMessage['type']>(
  type: T
): Array<Extract<SidePanelMessage, { type: T }>> {
  return mockSendMessage.mock.calls
    .map((call) => call[0] as SidePanelMessage)
    .filter((msg): msg is Extract<SidePanelMessage, { type: T }> => msg?.type === type);
}

/**
 * Obtém a última mensagem de um tipo específico
 */
function getLastMessageOfType<T extends SidePanelMessage['type']>(
  type: T
): Extract<SidePanelMessage, { type: T }> | undefined {
  const messages = getMessagesByType(type);
  return messages[messages.length - 1];
}

// ============================================================================
// Testes de Integração
// ============================================================================

describe('Integração Side Panel ↔ Service Worker', () => {
  let stateManager: RecordingStateManager;
  let sidePanelHandler: SidePanelHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    setupChromeMocks();
    resetRecordingStateManager();
    resetSidePanelHandler();

    // Cria instâncias com autoBroadcast habilitado para testar comunicação
    stateManager = new RecordingStateManager({ autoBroadcast: true });
    sidePanelHandler = new SidePanelHandler();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Testes de STATS_UPDATE
  // ==========================================================================

  describe('Message Passing: STATS_UPDATE', () => {
    /**
     * Testa que atualizações de estatísticas são enviadas via message passing
     * Requisito 2.7: Stats transmitidas do content script para Side Panel via Service Worker
     */
    it('deve enviar STATS_UPDATE quando estatísticas são atualizadas', async () => {
      // Inicia gravação
      stateManager.startRecording();
      vi.clearAllMocks(); // Limpa mensagens de início

      // Atualiza estatísticas
      stateManager.updateStats({ clickCount: 5 });

      // Verifica que mensagem foi enviada
      expect(mockSendMessage).toHaveBeenCalled();

      const statsMessage = getLastMessageOfType('STATS_UPDATE');
      expect(statsMessage).toBeDefined();
      expect(statsMessage?.payload).toEqual({ clickCount: 5 });
    });

    /**
     * Testa incremento de cliques
     */
    it('deve enviar STATS_UPDATE ao incrementar cliques', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.incrementClicks();

      const statsMessage = getLastMessageOfType('STATS_UPDATE');
      expect(statsMessage).toBeDefined();
      expect(statsMessage?.payload).toHaveProperty('clickCount', 1);
    });

    /**
     * Testa incremento de teclas
     */
    it('deve enviar STATS_UPDATE ao incrementar teclas', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.incrementKeystrokes();

      const statsMessage = getLastMessageOfType('STATS_UPDATE');
      expect(statsMessage).toBeDefined();
      expect(statsMessage?.payload).toHaveProperty('keystrokeCount', 1);
    });

    /**
     * Testa incremento de scrolls
     */
    it('deve enviar STATS_UPDATE ao incrementar scrolls', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.incrementScrolls();

      const statsMessage = getLastMessageOfType('STATS_UPDATE');
      expect(statsMessage).toBeDefined();
      expect(statsMessage?.payload).toHaveProperty('scrollCount', 1);
    });

    /**
     * Testa incremento de formulários
     */
    it('deve enviar STATS_UPDATE ao incrementar formulários', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.incrementForms();

      const statsMessage = getLastMessageOfType('STATS_UPDATE');
      expect(statsMessage).toBeDefined();
      expect(statsMessage?.payload).toHaveProperty('formsInteracted', 1);
    });

    /**
     * Testa múltiplas atualizações de estatísticas em sequência
     */
    it('deve enviar múltiplas STATS_UPDATE em sequência', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      // Simula múltiplas interações
      stateManager.incrementClicks();
      stateManager.incrementClicks();
      stateManager.incrementKeystrokes();
      stateManager.incrementScrolls();

      // Verifica que todas as mensagens foram enviadas
      const statsMessages = getMessagesByType('STATS_UPDATE');
      expect(statsMessages.length).toBe(4);

      // Verifica valores finais
      const state = stateManager.getState();
      expect(state.stats.clickCount).toBe(2);
      expect(state.stats.keystrokeCount).toBe(1);
      expect(state.stats.scrollCount).toBe(1);
    });

    /**
     * Testa atualização parcial de estatísticas
     */
    it('deve enviar apenas campos atualizados em STATS_UPDATE', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      // Atualiza apenas clickCount
      stateManager.updateStats({ clickCount: 10 });

      const statsMessage = getLastMessageOfType('STATS_UPDATE');
      expect(statsMessage?.payload).toEqual({ clickCount: 10 });
      expect(statsMessage?.payload).not.toHaveProperty('keystrokeCount');
    });
  });

  // ==========================================================================
  // Testes de NAVIGATION_UPDATE
  // ==========================================================================

  describe('Message Passing: NAVIGATION_UPDATE', () => {
    /**
     * Testa que navegações são enviadas via message passing
     * Requisito 3.1: Registrar URL com timestamp relativo ao início do vídeo
     */
    it('deve enviar NAVIGATION_UPDATE quando navegação é adicionada', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.addNavigation({
        url: 'https://example.com/page1',
        type: 'link-click',
        htmlHash: 'a'.repeat(64),
      });

      const navMessage = getLastMessageOfType('NAVIGATION_UPDATE');
      expect(navMessage).toBeDefined();
      expect(navMessage?.payload.fullUrl).toBe('https://example.com/page1');
      expect(navMessage?.payload.type).toBe('link-click');
      expect(navMessage?.payload.htmlHash).toBe('a'.repeat(64));
    });

    /**
     * Testa que timestamp relativo é calculado corretamente
     */
    it('deve incluir timestamp relativo correto em NAVIGATION_UPDATE', async () => {
      const startTime = Date.now();
      stateManager.startRecording(startTime);
      vi.clearAllMocks();

      const navigationTime = startTime + 5000; // 5 segundos após início
      stateManager.addNavigation({
        url: 'https://example.com',
        type: 'link-click',
        htmlHash: 'b'.repeat(64),
        timestamp: navigationTime,
      });

      const navMessage = getLastMessageOfType('NAVIGATION_UPDATE');
      expect(navMessage?.payload.videoTimestamp).toBe(5000);
      expect(navMessage?.payload.formattedTime).toBe('00:05');
    });

    /**
     * Testa diferentes tipos de navegação
     */
    it('deve enviar NAVIGATION_UPDATE com tipo correto para cada navegação', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      const navigationTypes = [
        'initial',
        'link-click',
        'form-submit',
        'history-back',
        'history-forward',
        'redirect',
      ] as const;

      for (const type of navigationTypes) {
        stateManager.addNavigation({
          url: `https://example.com/${type}`,
          type,
          htmlHash: 'c'.repeat(64),
        });
      }

      const navMessages = getMessagesByType('NAVIGATION_UPDATE');
      expect(navMessages.length).toBe(6);

      navigationTypes.forEach((type, index) => {
        expect(navMessages[index]?.payload.type).toBe(type);
      });
    });

    /**
     * Testa truncamento de URLs longas
     * Requisito 3.5: Truncar URLs longas com ellipsis
     */
    it('deve truncar URLs longas em NAVIGATION_UPDATE', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      const longUrl = 'https://example.com/' + 'a'.repeat(100);
      stateManager.addNavigation({
        url: longUrl,
        type: 'link-click',
        htmlHash: 'd'.repeat(64),
      });

      const navMessage = getLastMessageOfType('NAVIGATION_UPDATE');
      expect(navMessage?.payload.url.length).toBeLessThanOrEqual(50);
      expect(navMessage?.payload.url.endsWith('...')).toBe(true);
      expect(navMessage?.payload.fullUrl).toBe(longUrl);
    });

    /**
     * Testa que hash SHA-256 é preservado
     * Requisito 3.6: Armazenar hash SHA-256 do HTML capturado
     */
    it('deve preservar hash SHA-256 em NAVIGATION_UPDATE', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      const expectedHash = 'abcdef0123456789'.repeat(4); // 64 caracteres
      stateManager.addNavigation({
        url: 'https://example.com',
        type: 'link-click',
        htmlHash: expectedHash,
      });

      const navMessage = getLastMessageOfType('NAVIGATION_UPDATE');
      expect(navMessage?.payload.htmlHash).toBe(expectedHash);
    });

    /**
     * Testa múltiplas navegações em sequência
     */
    it('deve enviar múltiplas NAVIGATION_UPDATE em ordem cronológica', async () => {
      const startTime = Date.now();
      stateManager.startRecording(startTime);
      vi.clearAllMocks();

      // Adiciona navegações com timestamps crescentes
      for (let i = 1; i <= 5; i++) {
        stateManager.addNavigation({
          url: `https://example.com/page${i}`,
          type: 'link-click',
          htmlHash: 'e'.repeat(64),
          timestamp: startTime + i * 1000,
        });
      }

      const navMessages = getMessagesByType('NAVIGATION_UPDATE');
      expect(navMessages.length).toBe(5);

      // Verifica ordem cronológica
      for (let i = 0; i < navMessages.length; i++) {
        expect(navMessages[i]?.payload.videoTimestamp).toBe((i + 1) * 1000);
      }
    });
  });

  // ==========================================================================
  // Testes de RECORDING_STATE_UPDATE
  // ==========================================================================

  describe('Message Passing: RECORDING_STATE_UPDATE', () => {
    /**
     * Testa que estado é enviado ao iniciar gravação
     */
    it('deve enviar RECORDING_STATE_UPDATE ao iniciar gravação', async () => {
      stateManager.startRecording();

      const stateMessage = getLastMessageOfType('RECORDING_STATE_UPDATE');
      expect(stateMessage).toBeDefined();
      expect(stateMessage?.payload.status).toBe('recording');
      expect(stateMessage?.payload.startTime).toBeGreaterThan(0);
    });

    /**
     * Testa que estado é enviado ao parar gravação
     */
    it('deve enviar RECORDING_STATE_UPDATE ao parar gravação', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.stopRecording();

      const stateMessage = getLastMessageOfType('RECORDING_STATE_UPDATE');
      expect(stateMessage).toBeDefined();
      expect(stateMessage?.payload.status).toBe('stopping');
    });

    /**
     * Testa que estado é enviado ao completar gravação
     */
    it('deve enviar RECORDING_STATE_UPDATE ao completar gravação', async () => {
      stateManager.startRecording();
      stateManager.stopRecording();
      vi.clearAllMocks();

      stateManager.completeRecording();

      const stateMessage = getLastMessageOfType('RECORDING_STATE_UPDATE');
      expect(stateMessage).toBeDefined();
      expect(stateMessage?.payload.status).toBe('stopped');
    });

    /**
     * Testa que estado é enviado ao resetar
     */
    it('deve enviar RECORDING_STATE_UPDATE ao resetar', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.reset();

      const stateMessage = getLastMessageOfType('RECORDING_STATE_UPDATE');
      expect(stateMessage).toBeDefined();
      expect(stateMessage?.payload.status).toBe('idle');
    });

    /**
     * Testa que estado inclui estatísticas atualizadas
     */
    it('deve incluir estatísticas no RECORDING_STATE_UPDATE', async () => {
      stateManager.startRecording();
      stateManager.incrementClicks();
      stateManager.incrementClicks();
      stateManager.incrementKeystrokes();
      vi.clearAllMocks();

      // Força broadcast do estado completo
      stateManager.stopRecording();

      const stateMessage = getLastMessageOfType('RECORDING_STATE_UPDATE');
      expect(stateMessage?.payload.stats.clickCount).toBe(2);
      expect(stateMessage?.payload.stats.keystrokeCount).toBe(1);
    });

    /**
     * Testa que estado inclui histórico de navegação
     */
    it('deve incluir histórico de navegação no RECORDING_STATE_UPDATE', async () => {
      stateManager.startRecording();
      stateManager.addNavigation({
        url: 'https://example.com/page1',
        type: 'link-click',
        htmlHash: 'f'.repeat(64),
      });
      stateManager.addNavigation({
        url: 'https://example.com/page2',
        type: 'form-submit',
        htmlHash: 'g'.repeat(64),
      });
      vi.clearAllMocks();

      stateManager.stopRecording();

      const stateMessage = getLastMessageOfType('RECORDING_STATE_UPDATE');
      expect(stateMessage?.payload.navigationHistory.length).toBe(2);
    });

    /**
     * Testa que estado inclui contexto forense
     */
    it('deve incluir contexto forense no RECORDING_STATE_UPDATE', async () => {
      stateManager.startRecording();
      stateManager.setForensicContext({
        location: 'São Paulo, Brasil',
        connectionType: 'Wi-Fi',
        device: 'Chrome 120 / Windows 11',
        startedAt: new Date().toISOString(),
      });

      const stateMessage = getLastMessageOfType('RECORDING_STATE_UPDATE');
      expect(stateMessage?.payload.forensicContext).toBeDefined();
      expect(stateMessage?.payload.forensicContext?.location).toBe('São Paulo, Brasil');
      expect(stateMessage?.payload.forensicContext?.connectionType).toBe('Wi-Fi');
    });

    /**
     * Testa que estado inclui alertas
     */
    it('deve incluir alertas no RECORDING_STATE_UPDATE', async () => {
      stateManager.startRecording();
      stateManager.addAlert('warning', 'Restam 5 minutos de gravação');
      vi.clearAllMocks();

      stateManager.stopRecording();

      const stateMessage = getLastMessageOfType('RECORDING_STATE_UPDATE');
      expect(stateMessage?.payload.alerts.length).toBeGreaterThan(0);
      expect(stateMessage?.payload.alerts[0]?.message).toBe('Restam 5 minutos de gravação');
    });
  });

  // ==========================================================================
  // Testes de ALERT
  // ==========================================================================

  describe('Message Passing: ALERT', () => {
    /**
     * Testa que alertas são enviados via message passing
     */
    it('deve enviar ALERT quando alerta é adicionado', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.addAlert('warning', 'Teste de alerta');

      const alertMessage = getLastMessageOfType('ALERT');
      expect(alertMessage).toBeDefined();
      expect(alertMessage?.payload.type).toBe('warning');
      expect(alertMessage?.payload.message).toBe('Teste de alerta');
    });

    /**
     * Testa diferentes tipos de alerta
     */
    it('deve enviar ALERT com tipo correto', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.addAlert('info', 'Informação');
      stateManager.addAlert('warning', 'Aviso');
      stateManager.addAlert('error', 'Erro');

      const alertMessages = getMessagesByType('ALERT');
      expect(alertMessages.length).toBe(3);
      expect(alertMessages[0]?.payload.type).toBe('info');
      expect(alertMessages[1]?.payload.type).toBe('warning');
      expect(alertMessages[2]?.payload.type).toBe('error');
    });

    /**
     * Testa que alertas têm ID único
     */
    it('deve gerar ID único para cada ALERT', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.addAlert('info', 'Alerta 1');
      stateManager.addAlert('info', 'Alerta 2');

      const alertMessages = getMessagesByType('ALERT');
      expect(alertMessages[0]?.payload.id).not.toBe(alertMessages[1]?.payload.id);
    });
  });

  // ==========================================================================
  // Testes de UPLOAD_PROGRESS
  // ==========================================================================

  describe('Message Passing: UPLOAD_PROGRESS', () => {
    /**
     * Testa que progresso de upload é enviado via message passing
     */
    it('deve enviar UPLOAD_PROGRESS quando progresso é atualizado', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.updateUploadProgress({
        chunksUploaded: 2,
        chunksTotal: 10,
        bytesUploaded: 10485760, // 10MB
        bytesTotal: 52428800, // 50MB
        status: 'uploading',
      });

      const uploadMessage = getLastMessageOfType('UPLOAD_PROGRESS');
      expect(uploadMessage).toBeDefined();
      expect(uploadMessage?.payload.chunksUploaded).toBe(2);
      expect(uploadMessage?.payload.chunksTotal).toBe(10);
      expect(uploadMessage?.payload.status).toBe('uploading');
    });

    /**
     * Testa atualização de status de upload
     */
    it('deve enviar UPLOAD_PROGRESS ao mudar status', async () => {
      stateManager.startRecording();
      vi.clearAllMocks();

      stateManager.setUploadStatus('uploading');
      let uploadMessage = getLastMessageOfType('UPLOAD_PROGRESS');
      expect(uploadMessage?.payload.status).toBe('uploading');

      stateManager.setUploadStatus('completing');
      uploadMessage = getLastMessageOfType('UPLOAD_PROGRESS');
      expect(uploadMessage?.payload.status).toBe('completing');

      stateManager.setUploadStatus('completed');
      uploadMessage = getLastMessageOfType('UPLOAD_PROGRESS');
      expect(uploadMessage?.payload.status).toBe('completed');
    });
  });

  // ==========================================================================
  // Testes de SidePanelHandler
  // ==========================================================================

  describe('SidePanelHandler: Comunicação com Side Panel', () => {
    /**
     * Testa abertura do Side Panel
     */
    it('deve abrir Side Panel para a janela especificada', async () => {
      await sidePanelHandler.open(123);

      expect(mockSidePanelOpen).toHaveBeenCalledWith({ windowId: 123 });
      expect(sidePanelHandler.getIsOpen()).toBe(true);
      expect(sidePanelHandler.getCurrentWindowId()).toBe(123);
    });

    /**
     * Testa fechamento do Side Panel
     */
    it('deve fechar Side Panel e limpar estado', async () => {
      await sidePanelHandler.open(123);
      await sidePanelHandler.close();

      expect(sidePanelHandler.getIsOpen()).toBe(false);
      expect(sidePanelHandler.getCurrentWindowId()).toBeNull();
    });

    /**
     * Testa envio de mensagem genérica
     */
    it('deve enviar mensagem para Side Panel via sendMessage', async () => {
      const message: SidePanelMessage = {
        type: 'STATS_UPDATE',
        payload: { clickCount: 5 },
      };

      await sidePanelHandler.sendMessage(message);

      expect(mockSendMessage).toHaveBeenCalledWith(message);
    });

    /**
     * Testa envio de atualização de estado
     */
    it('deve enviar RECORDING_STATE_UPDATE via sendRecordingStateUpdate', async () => {
      const state: RecordingState = {
        status: 'recording',
        startTime: Date.now(),
        elapsedMs: 5000,
        maxDurationMs: 1800000,
        stats: {
          pagesVisited: 1,
          clickCount: 0,
          keystrokeCount: 0,
          scrollCount: 0,
          formsInteracted: 0,
        },
        navigationHistory: [],
        forensicContext: null,
        alerts: [],
        uploadProgress: {
          chunksUploaded: 0,
          chunksTotal: 0,
          bytesUploaded: 0,
          bytesTotal: 0,
          status: 'idle',
        },
      };

      await sidePanelHandler.sendRecordingStateUpdate(state);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'RECORDING_STATE_UPDATE',
        payload: state,
      });
    });

    /**
     * Testa envio de atualização de estatísticas
     */
    it('deve enviar STATS_UPDATE via sendStatsUpdate', async () => {
      const stats: Partial<InteractionStats> = {
        clickCount: 10,
        keystrokeCount: 5,
      };

      await sidePanelHandler.sendStatsUpdate(stats);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'STATS_UPDATE',
        payload: stats,
      });
    });

    /**
     * Testa envio de atualização de navegação
     */
    it('deve enviar NAVIGATION_UPDATE via sendNavigationUpdate', async () => {
      const entry: NavigationEntry = {
        videoTimestamp: 5000,
        formattedTime: '00:05',
        url: 'https://example.com',
        fullUrl: 'https://example.com',
        type: 'link-click',
        htmlHash: 'h'.repeat(64),
      };

      await sidePanelHandler.sendNavigationUpdate(entry);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATION_UPDATE',
        payload: entry,
      });
    });

    /**
     * Testa envio de alerta
     */
    it('deve enviar ALERT via sendAlert', async () => {
      const alert: Alert = {
        id: 'alert-1',
        type: 'warning',
        message: 'Restam 5 minutos',
        timestamp: Date.now(),
      };

      await sidePanelHandler.sendAlert(alert);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'ALERT',
        payload: alert,
      });
    });

    /**
     * Testa envio de progresso de upload
     */
    it('deve enviar UPLOAD_PROGRESS via sendUploadProgress', async () => {
      const progress: UploadProgress = {
        chunksUploaded: 5,
        chunksTotal: 10,
        bytesUploaded: 26214400,
        bytesTotal: 52428800,
        status: 'uploading',
      };

      await sidePanelHandler.sendUploadProgress(progress);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'UPLOAD_PROGRESS',
        payload: progress,
      });
    });
  });

  // ==========================================================================
  // Testes de Integração Completa
  // ==========================================================================

  describe('Integração Completa: Fluxo de Gravação', () => {
    /**
     * Testa fluxo completo de gravação com todas as mensagens
     */
    it('deve enviar todas as mensagens durante fluxo de gravação', async () => {
      // 1. Inicia gravação
      stateManager.startRecording();
      expect(getLastMessageOfType('RECORDING_STATE_UPDATE')?.payload.status).toBe('recording');

      // 2. Simula interações
      stateManager.incrementClicks();
      stateManager.incrementKeystrokes();
      expect(getMessagesByType('STATS_UPDATE').length).toBeGreaterThan(0);

      // 3. Simula navegação
      stateManager.addNavigation({
        url: 'https://example.com/page1',
        type: 'link-click',
        htmlHash: 'i'.repeat(64),
      });
      expect(getMessagesByType('NAVIGATION_UPDATE').length).toBe(1);

      // 4. Simula alerta de tempo
      stateManager.addAlert('warning', 'Restam 5 minutos');
      expect(getMessagesByType('ALERT').length).toBe(1);

      // 5. Simula progresso de upload
      stateManager.updateUploadProgress({
        chunksUploaded: 1,
        chunksTotal: 5,
        status: 'uploading',
      });
      expect(getMessagesByType('UPLOAD_PROGRESS').length).toBe(1);

      // 6. Para gravação
      stateManager.stopRecording();
      expect(getLastMessageOfType('RECORDING_STATE_UPDATE')?.payload.status).toBe('stopping');

      // 7. Completa gravação
      stateManager.completeRecording();
      expect(getLastMessageOfType('RECORDING_STATE_UPDATE')?.payload.status).toBe('stopped');
    });

    /**
     * Testa que mensagens não são enviadas quando autoBroadcast está desabilitado
     */
    it('não deve enviar mensagens quando autoBroadcast está desabilitado', async () => {
      const silentManager = new RecordingStateManager({ autoBroadcast: false });
      vi.clearAllMocks();

      silentManager.startRecording();
      silentManager.incrementClicks();
      silentManager.addNavigation({
        url: 'https://example.com',
        type: 'link-click',
        htmlHash: 'j'.repeat(64),
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    /**
     * Testa resiliência quando Side Panel não está conectado
     */
    it('deve continuar funcionando mesmo se Side Panel não estiver conectado', async () => {
      // Simula erro de conexão
      mockSendMessage.mockRejectedValueOnce(new Error('Could not establish connection'));

      // Não deve lançar erro
      await expect(sidePanelHandler.sendMessage({
        type: 'STATS_UPDATE',
        payload: { clickCount: 1 },
      })).resolves.not.toThrow();
    });
  });
});
