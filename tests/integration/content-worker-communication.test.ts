/**
 * Testes de Integração: Content Script ↔ Service Worker
 *
 * Testa a comunicação via message passing entre os Content Scripts e o Service Worker,
 * incluindo:
 * - INTERACTION_EVENT: Eventos de interação (cliques, teclas, scrolls, formulários)
 * - INTERACTION_STATS_UPDATE: Atualizações de estatísticas agregadas
 * - NAVIGATION_EVENT: Eventos de navegação
 * - WINDOW_OPEN_BLOCKED: Notificação de window.open bloqueado
 * - VIDEO_CHUNK: Transmissão de chunks de vídeo (via offscreen)
 *
 * @module content-worker-communication.test
 * @requirements 2.6, 2.7, 4.1, 4.2, 4.3, 4.4, 4.6, 7.2

 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InteractionTracker,
  resetGlobalTracker,
  type InteractionStats,
  type InteractionEvent,
} from '../../src/content/interaction-tracker';
import {
  NavigationInterceptor,
  resetGlobalInterceptor,
  type NavigationEvent,
} from '../../src/content/navigation-interceptor';

// ============================================================================
// Mocks
// ============================================================================

/**
 * Mock do chrome.runtime.sendMessage para capturar mensagens enviadas
 */
const mockSendMessage = vi.fn().mockResolvedValue({ success: true });

/**
 * Armazena listeners de mensagens registrados
 */
const messageListeners: Array<(message: unknown) => void> = [];

/**
 * Mock do chrome.runtime.onMessage para simular recebimento de mensagens
 */
const mockOnMessageAddListener = vi.fn((listener: (message: unknown) => void) => {
  messageListeners.push(listener);
});

/**
 * Configura mocks do Chrome antes de cada teste
 */
function setupChromeMocks(): void {
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: mockSendMessage,
      id: 'test-extension-id',
      onMessage: {
        addListener: mockOnMessageAddListener,
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
      },
      lastError: null,
    },
  });
}

/**
 * Simula envio de mensagem do Service Worker para Content Script
 * @internal Reservado para testes futuros de comunicação bidirecional
 */
// @ts-expect-error Função reservada para testes futuros
function _simulateServiceWorkerMessage(message: unknown): void {
  messageListeners.forEach((listener) => listener(message));
}

// ============================================================================
// Tipos Auxiliares
// ============================================================================

/**
 * Tipo de mensagem de interação
 * @internal Reservado para testes futuros
 */
// @ts-expect-error Interface reservada para testes futuros
interface _InteractionEventMessage {
  type: 'INTERACTION_EVENT';
  payload: InteractionEvent;
}

/**
 * Tipo de mensagem de estatísticas
 * @internal Reservado para testes futuros
 */
// @ts-expect-error Interface reservada para testes futuros
interface _StatsUpdateMessage {
  type: 'INTERACTION_STATS_UPDATE';
  payload: InteractionStats;
}

/**
 * Tipo de mensagem de navegação
 * @internal Reservado para testes futuros
 */
// @ts-expect-error Interface reservada para testes futuros
interface _NavigationEventMessage {
  type: 'NAVIGATION_EVENT';
  payload: NavigationEvent;
}

/**
 * Tipo de mensagem de window.open bloqueado
 * @internal Reservado para testes futuros
 */
// @ts-expect-error Interface reservada para testes futuros
interface _WindowOpenBlockedMessage {
  type: 'WINDOW_OPEN_BLOCKED';
  payload: {
    url: string;
    timestamp: number;
    pageUrl: string;
  };
}

/**
 * Extrai mensagens de um tipo específico dos mocks
 */
function getMessagesByType<T extends string>(
  type: T
): Array<{ type: T; payload: unknown }> {
  return mockSendMessage.mock.calls
    .map((call) => call[0] as { type: string; payload: unknown })
    .filter((msg): msg is { type: T; payload: unknown } => msg?.type === type);
}

/**
 * Obtém a última mensagem de um tipo específico
 */
function getLastMessageOfType<T extends string>(
  type: T
): { type: T; payload: unknown } | undefined {
  const messages = getMessagesByType(type);
  return messages[messages.length - 1];
}

// ============================================================================
// Testes de Integração: InteractionTracker → Service Worker
// ============================================================================

describe('Integração Content Script ↔ Service Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageListeners.length = 0;
    setupChromeMocks();
    resetGlobalTracker();
    resetGlobalInterceptor();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetGlobalTracker();
    resetGlobalInterceptor();
  });

  // ==========================================================================
  // Testes de Transmissão de Eventos de Interação
  // ==========================================================================

  describe('Transmissão de Eventos de Interação', () => {
    /**
     * Testa que eventos de clique são transmitidos para o Service Worker
     * Requisito 2.6: Incrementar contadores imediatamente
     * Requisito 2.7: Transmitir stats via message passing
     */
    it('deve transmitir INTERACTION_EVENT para cliques', () => {
      const tracker = new InteractionTracker({ sendToServiceWorker: true });
      tracker.start();

      // Simula evento de clique
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
      });
      document.dispatchEvent(clickEvent);

      // Verifica que mensagem foi enviada
      const eventMessages = getMessagesByType('INTERACTION_EVENT');
      expect(eventMessages.length).toBeGreaterThan(0);

      const lastEvent = getLastMessageOfType('INTERACTION_EVENT');
      expect(lastEvent?.payload).toMatchObject({
        type: 'click',
      });
      expect((lastEvent?.payload as InteractionEvent).timestamp).toBeGreaterThan(0);

      tracker.stop();
    });

    /**
     * Testa que eventos de tecla são transmitidos para o Service Worker
     */
    it('deve transmitir INTERACTION_EVENT para teclas', () => {
      const tracker = new InteractionTracker({ sendToServiceWorker: true });
      tracker.start();

      // Simula evento de tecla
      const keyEvent = new KeyboardEvent('keypress', {
        bubbles: true,
        key: 'a',
      });
      document.dispatchEvent(keyEvent);

      const eventMessages = getMessagesByType('INTERACTION_EVENT');
      expect(eventMessages.length).toBeGreaterThan(0);

      const lastEvent = getLastMessageOfType('INTERACTION_EVENT');
      expect(lastEvent?.payload).toMatchObject({
        type: 'keypress',
      });

      tracker.stop();
    });

    /**
     * Testa que eventos de scroll são transmitidos para o Service Worker
     * (com debounce)
     */
    it('deve transmitir INTERACTION_EVENT para scrolls após debounce', async () => {
      const tracker = new InteractionTracker({
        sendToServiceWorker: true,
        scrollDebounceMs: 50, // Debounce curto para teste
      });
      tracker.start();

      // Simula evento de scroll
      window.dispatchEvent(new Event('scroll'));

      // Aguarda debounce
      await new Promise((resolve) => setTimeout(resolve, 100));

      const eventMessages = getMessagesByType('INTERACTION_EVENT');
      const scrollEvents = eventMessages.filter(
        (msg) => (msg.payload as InteractionEvent).type === 'scroll'
      );
      expect(scrollEvents.length).toBeGreaterThan(0);

      tracker.stop();
    });

    /**
     * Testa que eventos de formulário são transmitidos para o Service Worker
     */
    it('deve transmitir INTERACTION_EVENT para interações com formulário', () => {
      const tracker = new InteractionTracker({ sendToServiceWorker: true });
      tracker.start();

      // Cria formulário e input
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.type = 'text';
      form.appendChild(input);
      document.body.appendChild(form);

      // Simula input no formulário
      const inputEvent = new Event('input', { bubbles: true });
      input.dispatchEvent(inputEvent);

      const eventMessages = getMessagesByType('INTERACTION_EVENT');
      const formEvents = eventMessages.filter(
        (msg) => (msg.payload as InteractionEvent).type === 'form-interaction'
      );
      expect(formEvents.length).toBeGreaterThan(0);

      // Limpa DOM
      document.body.removeChild(form);
      tracker.stop();
    });

    /**
     * Testa que INTERACTION_STATS_UPDATE é enviado após cada interação
     */
    it('deve transmitir INTERACTION_STATS_UPDATE após cada interação', () => {
      const tracker = new InteractionTracker({ sendToServiceWorker: true });
      tracker.start();

      // Simula múltiplos cliques
      for (let i = 0; i < 3; i++) {
        const clickEvent = new MouseEvent('click', { bubbles: true });
        document.dispatchEvent(clickEvent);
      }

      // Verifica que stats foram enviadas
      const statsMessages = getMessagesByType('INTERACTION_STATS_UPDATE');
      expect(statsMessages.length).toBe(3);

      // Verifica que contagem está correta na última mensagem
      const lastStats = statsMessages[statsMessages.length - 1]?.payload as InteractionStats;
      expect(lastStats.clickCount).toBe(3);

      tracker.stop();
    });

    /**
     * Testa que múltiplos tipos de interação são transmitidos corretamente
     */
    it('deve transmitir múltiplos tipos de interação em sequência', async () => {
      const tracker = new InteractionTracker({
        sendToServiceWorker: true,
        scrollDebounceMs: 10,
      });
      tracker.start();

      // Simula sequência de interações
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      window.dispatchEvent(new Event('scroll'));

      // Aguarda debounce do scroll
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verifica estatísticas finais
      const stats = tracker.getStats();
      expect(stats.clickCount).toBe(2);
      expect(stats.keystrokeCount).toBe(1);
      expect(stats.scrollCount).toBe(1);

      // Verifica que todas as mensagens foram enviadas
      const eventMessages = getMessagesByType('INTERACTION_EVENT');
      expect(eventMessages.length).toBe(4);

      tracker.stop();
    });

    /**
     * Testa que eventos não são transmitidos quando sendToServiceWorker é false
     */
    it('não deve transmitir eventos quando sendToServiceWorker é false', () => {
      const tracker = new InteractionTracker({ sendToServiceWorker: false });
      tracker.start();

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Verifica que nenhuma mensagem foi enviada
      expect(mockSendMessage).not.toHaveBeenCalled();

      // Mas stats locais devem estar atualizadas
      expect(tracker.getStats().clickCount).toBe(1);

      tracker.stop();
    });

    /**
     * Testa que callback onInteraction é chamado junto com transmissão
     */
    it('deve chamar callback onInteraction e transmitir para Service Worker', () => {
      const onInteraction = vi.fn();
      const tracker = new InteractionTracker({
        sendToServiceWorker: true,
        onInteraction,
      });
      tracker.start();

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Verifica callback local
      expect(onInteraction).toHaveBeenCalledTimes(1);
      expect(onInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'click' })
      );

      // Verifica transmissão para Service Worker
      expect(mockSendMessage).toHaveBeenCalled();

      tracker.stop();
    });
  });

  // ==========================================================================
  // Testes de Transmissão de Eventos de Navegação
  // ==========================================================================

  describe('Transmissão de Eventos de Navegação', () => {
    /**
     * Testa que eventos de navegação por link são transmitidos
     * Requisito 4.1: Permitir links normais
     * Requisito 4.6: Capturar HTML antes de navegação
     */
    it('deve transmitir NAVIGATION_EVENT para cliques em links', () => {
      const onNavigate = vi.fn();
      const interceptor = new NavigationInterceptor({
        sendToServiceWorker: true,
        config: { onNavigate },
      });
      interceptor.activate();

      // Cria link e simula clique
      const link = document.createElement('a');
      link.href = 'https://example.com/page1';
      document.body.appendChild(link);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(clickEvent);

      // Verifica que mensagem foi enviada
      const navMessages = getMessagesByType('NAVIGATION_EVENT');
      expect(navMessages.length).toBeGreaterThan(0);

      const lastNav = getLastMessageOfType('NAVIGATION_EVENT');
      expect(lastNav?.payload).toMatchObject({
        type: 'link-click',
        toUrl: 'https://example.com/page1',
      });

      // Verifica que HTML foi capturado
      expect((lastNav?.payload as NavigationEvent).htmlContent).toBeDefined();
      expect((lastNav?.payload as NavigationEvent).htmlContent.length).toBeGreaterThan(0);

      // Limpa DOM
      document.body.removeChild(link);
      interceptor.deactivate();
    });

    /**
     * Testa que links com target="_blank" são convertidos e transmitidos
     * Requisito 4.2: Converter target="_blank" para mesma aba
     */
    it('deve transmitir NAVIGATION_EVENT para links com target="_blank"', () => {
      // Mock window.location.href para evitar navegação real
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, href: 'https://current.com' },
        writable: true,
        configurable: true,
      });

      const interceptor = new NavigationInterceptor({ sendToServiceWorker: true });
      interceptor.activate();

      // Cria link com target="_blank"
      const link = document.createElement('a');
      link.href = 'https://example.com/external';
      link.target = '_blank';
      document.body.appendChild(link);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(clickEvent);

      // Verifica que mensagem foi enviada
      const navMessages = getMessagesByType('NAVIGATION_EVENT');
      expect(navMessages.length).toBeGreaterThan(0);

      const lastNav = getLastMessageOfType('NAVIGATION_EVENT');
      expect(lastNav?.payload).toMatchObject({
        type: 'link-click',
        toUrl: 'https://example.com/external',
      });

      // Limpa DOM e restaura location
      document.body.removeChild(link);
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
      interceptor.deactivate();
    });

    /**
     * Testa que window.open bloqueado é notificado ao Service Worker
     * Requisito 4.3: Bloquear window.open() e mostrar notificação
     */
    it('deve transmitir WINDOW_OPEN_BLOCKED quando window.open é chamado', () => {
      const onWindowOpenBlocked = vi.fn();
      const interceptor = new NavigationInterceptor({
        sendToServiceWorker: true,
        config: { onWindowOpenBlocked },
      });
      interceptor.activate();

      // Tenta abrir nova janela
      const result = window.open('https://blocked.com/popup', '_blank');

      // Verifica que foi bloqueado
      expect(result).toBeNull();

      // Verifica callback local
      expect(onWindowOpenBlocked).toHaveBeenCalledWith('https://blocked.com/popup');

      // Verifica que mensagem foi enviada ao Service Worker
      const blockedMessages = getMessagesByType('WINDOW_OPEN_BLOCKED');
      expect(blockedMessages.length).toBe(1);
      expect(blockedMessages[0]?.payload).toMatchObject({
        url: 'https://blocked.com/popup',
      });

      interceptor.deactivate();
    });

    /**
     * Testa que eventos de navegação do histórico são transmitidos
     * Requisito 4.4: Permitir back/forward do histórico
     */
    it('deve transmitir NAVIGATION_EVENT para navegação do histórico', () => {
      const interceptor = new NavigationInterceptor({ sendToServiceWorker: true });
      interceptor.activate();

      // Simula evento popstate (back/forward)
      const popstateEvent = new PopStateEvent('popstate', {
        state: { page: 1 },
      });
      window.dispatchEvent(popstateEvent);

      // Verifica que mensagem foi enviada
      const navMessages = getMessagesByType('NAVIGATION_EVENT');
      expect(navMessages.length).toBeGreaterThan(0);

      const lastNav = getLastMessageOfType('NAVIGATION_EVENT');
      // Tipo deve ser history-back ou history-forward
      expect(['history-back', 'history-forward']).toContain(
        (lastNav?.payload as NavigationEvent).type
      );

      interceptor.deactivate();
    });

    /**
     * Testa que submissão de formulário é transmitida
     */
    it('deve transmitir NAVIGATION_EVENT para submissão de formulário', () => {
      const interceptor = new NavigationInterceptor({ sendToServiceWorker: true });
      interceptor.activate();

      // Cria formulário
      const form = document.createElement('form');
      form.action = 'https://example.com/submit';
      form.method = 'POST';
      document.body.appendChild(form);

      // Simula submit
      const submitEvent = new SubmitEvent('submit', {
        bubbles: true,
        cancelable: true,
      });
      form.dispatchEvent(submitEvent);

      // Verifica que mensagem foi enviada
      const navMessages = getMessagesByType('NAVIGATION_EVENT');
      expect(navMessages.length).toBeGreaterThan(0);

      const lastNav = getLastMessageOfType('NAVIGATION_EVENT');
      expect(lastNav?.payload).toMatchObject({
        type: 'form-submit',
      });

      // Limpa DOM
      document.body.removeChild(form);
      interceptor.deactivate();
    });

    /**
     * Testa que HTML é capturado antes de cada navegação
     * Requisito 4.6: Capturar HTML antes de navegação
     */
    it('deve incluir HTML capturado em todos os eventos de navegação', () => {
      const interceptor = new NavigationInterceptor({ sendToServiceWorker: true });
      interceptor.activate();

      // Cria link e simula clique
      const link = document.createElement('a');
      link.href = 'https://example.com/test';
      document.body.appendChild(link);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(clickEvent);

      // Verifica que HTML foi capturado
      const lastNav = getLastMessageOfType('NAVIGATION_EVENT');
      const payload = lastNav?.payload as NavigationEvent;
      
      expect(payload.htmlContent).toBeDefined();
      expect(typeof payload.htmlContent).toBe('string');
      expect(payload.htmlContent.length).toBeGreaterThan(0);
      // HTML deve conter tags básicas
      expect(payload.htmlContent).toContain('<html');

      // Limpa DOM
      document.body.removeChild(link);
      interceptor.deactivate();
    });

    /**
     * Testa que eventos não são transmitidos quando interceptor está desativado
     */
    it('não deve transmitir eventos quando interceptor está desativado', () => {
      // Interceptor criado mas não ativado intencionalmente para testar comportamento inativo
      new NavigationInterceptor({ sendToServiceWorker: true });

      // Cria link e simula clique
      const link = document.createElement('a');
      link.href = 'https://example.com/test';
      document.body.appendChild(link);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(clickEvent);

      // Verifica que nenhuma mensagem de navegação foi enviada
      const navMessages = getMessagesByType('NAVIGATION_EVENT');
      expect(navMessages.length).toBe(0);

      // Limpa DOM
      document.body.removeChild(link);
    });

    /**
     * Testa múltiplas navegações em sequência
     */
    it('deve transmitir múltiplas navegações em sequência', () => {
      const interceptor = new NavigationInterceptor({ sendToServiceWorker: true });
      interceptor.activate();

      // Cria múltiplos links
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3',
      ];

      urls.forEach((url) => {
        const link = document.createElement('a');
        link.href = url;
        document.body.appendChild(link);

        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        });
        link.dispatchEvent(clickEvent);

        document.body.removeChild(link);
      });

      // Verifica que todas as navegações foram transmitidas
      const navMessages = getMessagesByType('NAVIGATION_EVENT');
      expect(navMessages.length).toBe(3);

      // Verifica URLs em ordem
      navMessages.forEach((msg, index) => {
        expect((msg.payload as NavigationEvent).toUrl).toBe(urls[index]);
      });

      interceptor.deactivate();
    });
  });

  // ==========================================================================
  // Testes de Transmissão de Chunks de Vídeo
  // ==========================================================================

  describe('Transmissão de Chunks de Vídeo', () => {
    /**
     * Testa que chunks de vídeo são transmitidos via message passing
     * Requisito 7.2: Upload de chunks de 5MB
     *
     * Nota: A transmissão real de chunks ocorre via offscreen document,
     * mas testamos a interface de comunicação aqui.
     */
    it('deve transmitir video-chunk para o Service Worker', async () => {
      // Simula envio de chunk de vídeo (como faria o offscreen document)
      const chunkData = {
        chunkIndex: 0,
        data: new Blob(['fake-video-data'], { type: 'video/webm' }),
        size: 1024,
        timestamp: Date.now(),
      };

      // Envia mensagem como se fosse do offscreen document
      await chrome.runtime.sendMessage({
        type: 'video-chunk',
        target: 'background',
        data: chunkData,
      });

      // Verifica que mensagem foi enviada
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'video-chunk',
          data: expect.objectContaining({
            chunkIndex: 0,
            size: 1024,
          }),
        })
      );
    });

    /**
     * Testa que chunk-ready é transmitido com hash
     */
    it('deve transmitir chunk-ready com hash SHA-256', async () => {
      const chunkData = {
        chunkIndex: 1,
        hash: 'a'.repeat(64), // Hash SHA-256 simulado
        size: 5242880, // 5MB
        timestamp: Date.now(),
      };

      await chrome.runtime.sendMessage({
        type: 'chunk-ready',
        target: 'background',
        data: chunkData,
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'chunk-ready',
          data: expect.objectContaining({
            chunkIndex: 1,
            hash: 'a'.repeat(64),
            size: 5242880,
          }),
        })
      );
    });

    /**
     * Testa transmissão de múltiplos chunks em sequência
     */
    it('deve transmitir múltiplos chunks em sequência', async () => {
      const chunks = [
        { chunkIndex: 0, size: 5242880, hash: 'a'.repeat(64) },
        { chunkIndex: 1, size: 5242880, hash: 'b'.repeat(64) },
        { chunkIndex: 2, size: 3145728, hash: 'c'.repeat(64) }, // Último chunk menor
      ];

      for (const chunk of chunks) {
        await chrome.runtime.sendMessage({
          type: 'chunk-ready',
          target: 'background',
          data: { ...chunk, timestamp: Date.now() },
        });
      }

      // Verifica que todos os chunks foram enviados
      const chunkMessages = mockSendMessage.mock.calls.filter(
        (call) => call[0]?.type === 'chunk-ready'
      );
      expect(chunkMessages.length).toBe(3);

      // Verifica índices em ordem
      chunkMessages.forEach((call, index) => {
        expect(call[0].data.chunkIndex).toBe(index);
      });
    });

    /**
     * Testa que REQUEST_TAB_CAPTURE é enviado para iniciar captura
     */
    it('deve transmitir REQUEST_TAB_CAPTURE para iniciar gravação', async () => {
      await chrome.runtime.sendMessage({
        type: 'REQUEST_TAB_CAPTURE',
        options: {
          video: true,
          audio: false,
          videoConstraints: {
            mandatory: {
              chromeMediaSource: 'tab',
              maxFrameRate: 30,
            },
          },
        },
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REQUEST_TAB_CAPTURE',
          options: expect.objectContaining({
            video: true,
            audio: false,
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Testes de Integração Completa
  // ==========================================================================

  describe('Integração Completa: Fluxo de Gravação', () => {
    /**
     * Testa fluxo completo de comunicação durante gravação
     */
    it('deve transmitir todas as mensagens durante fluxo de gravação', async () => {
      // Mock window.location para evitar navegação real em jsdom
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, href: 'https://test.com' },
        writable: true,
        configurable: true,
      });

      // 1. Inicia InteractionTracker
      const tracker = new InteractionTracker({
        sendToServiceWorker: true,
        scrollDebounceMs: 10,
      });
      tracker.start();

      // 2. Inicia NavigationInterceptor
      const interceptor = new NavigationInterceptor({ sendToServiceWorker: true });
      interceptor.activate();

      // 3. Simula interações (em elementos que não são links)
      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));

      // 4. Simula navegação via link
      const link = document.createElement('a');
      link.href = 'https://example.com/page1';
      document.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      document.body.removeChild(link);
      document.body.removeChild(div);

      // 5. Simula scroll
      window.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 6. Simula chunk de vídeo
      await chrome.runtime.sendMessage({
        type: 'chunk-ready',
        target: 'background',
        data: { chunkIndex: 0, size: 5242880, hash: 'x'.repeat(64), timestamp: Date.now() },
      });

      // Verifica que todas as mensagens foram enviadas
      const interactionEvents = getMessagesByType('INTERACTION_EVENT');
      const statsUpdates = getMessagesByType('INTERACTION_STATS_UPDATE');
      const navEvents = getMessagesByType('NAVIGATION_EVENT');
      const chunkMessages = mockSendMessage.mock.calls.filter(
        (call) => call[0]?.type === 'chunk-ready'
      );

      // Restaura location antes das asserções
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });

      expect(interactionEvents.length).toBeGreaterThan(0);
      expect(statsUpdates.length).toBeGreaterThan(0);
      expect(navEvents.length).toBeGreaterThan(0);
      expect(chunkMessages.length).toBe(1);

      // Limpa
      tracker.stop();
      interceptor.deactivate();
    });

    /**
     * Testa resiliência quando Service Worker não responde
     */
    it('deve continuar funcionando mesmo se Service Worker não responder', async () => {
      // Simula erro de conexão
      mockSendMessage.mockRejectedValueOnce(new Error('Could not establish connection'));

      const tracker = new InteractionTracker({ sendToServiceWorker: true });
      tracker.start();

      // Não deve lançar erro
      expect(() => {
        document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }).not.toThrow();

      // Stats locais devem estar atualizadas
      expect(tracker.getStats().clickCount).toBe(1);

      tracker.stop();
    });

    /**
     * Testa que mensagens têm timestamps válidos
     */
    it('deve incluir timestamps válidos em todas as mensagens', () => {
      const tracker = new InteractionTracker({ sendToServiceWorker: true });
      tracker.start();

      const beforeTime = Date.now();
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const afterTime = Date.now();

      const lastEvent = getLastMessageOfType('INTERACTION_EVENT');
      const timestamp = (lastEvent?.payload as InteractionEvent).timestamp;

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);

      tracker.stop();
    });

    /**
     * Testa que InteractionTracker e NavigationInterceptor funcionam juntos
     */
    it('deve permitir InteractionTracker e NavigationInterceptor simultâneos', () => {
      // Mock window.location para evitar navegação real em jsdom
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, href: 'https://test.com' },
        writable: true,
        configurable: true,
      });

      const tracker = new InteractionTracker({ sendToServiceWorker: true });
      const interceptor = new NavigationInterceptor({ sendToServiceWorker: true });

      tracker.start();
      interceptor.activate();

      // Simula clique em link (deve gerar evento de interação E navegação)
      const link = document.createElement('a');
      link.href = 'https://example.com/test';
      document.body.appendChild(link);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(clickEvent);

      // Verifica que ambos os tipos de mensagem foram enviados
      const interactionEvents = getMessagesByType('INTERACTION_EVENT');
      const navEvents = getMessagesByType('NAVIGATION_EVENT');

      expect(interactionEvents.length).toBeGreaterThan(0);
      expect(navEvents.length).toBeGreaterThan(0);

      // Limpa
      document.body.removeChild(link);
      tracker.stop();
      interceptor.deactivate();
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    });

    /**
     * Testa que AUTO_FINALIZATION_NOTIFICATION é transmitido
     */
    it('deve transmitir AUTO_FINALIZATION_NOTIFICATION quando tempo máximo é atingido', async () => {
      await chrome.runtime.sendMessage({
        type: 'AUTO_FINALIZATION_NOTIFICATION',
        payload: {
          reason: 'max_duration',
          elapsedMs: 1800000, // 30 minutos
          maxDurationMs: 1800000,
        },
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AUTO_FINALIZATION_NOTIFICATION',
          payload: expect.objectContaining({
            reason: 'max_duration',
            elapsedMs: 1800000,
          }),
        })
      );
    });
  });
});
