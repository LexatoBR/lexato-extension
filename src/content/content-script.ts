/**
 * Content Script da Extensão Chrome Lexato
 *
 * Injetado em todas as páginas para captura e lockdown.
 * Configurado no manifest com matches: '<all_urls>' e run_at: 'document_idle'.
 *
 * Requisitos atendidos:
 * - 2.5: Content scripts injetados em todas as páginas
 * - 5.x: Modo Lockdown (implementado em tarefas futuras)
 * - 6.x: Captura de Screenshot (implementado em tarefas futuras)
 * - 9.x: Coleta de Metadados (implementado em tarefas futuras)
 *
 * @see https://developer.chrome.com/docs/extensions/mv3/content_scripts/
 */

import { AuditLogger } from '../lib/audit-logger';
import { ScreenshotCapture } from './screenshot-capture';
import { LockdownSecurityManager } from './lockdown-manager';
import { initSentry, captureException } from '../lib/sentry';
import { getInteractionTracker, createFreshTracker } from './interaction-tracker';

// ============================================================================
// Marcador Global de Carregamento
// ============================================================================

/**
 * Marcador global para indicar que o content script está carregado
 * Usado pelo service worker para verificar disponibilidade
 */
declare global {
  interface Window {
    __LEXATO_CONTENT_SCRIPT_LOADED__: boolean;
  }
}

// Marcar que o content script está carregado
window.__LEXATO_CONTENT_SCRIPT_LOADED__ = true;

// Inicializa Sentry para o content script
initSentry({
  context: 'content-script',
  additionalTags: {
    url: window.location.href,
    domain: window.location.hostname,
  },
});

// Log apenas em desenvolvimento (removido em produção pelo bundler)

// ============================================================================
// Instâncias Globais
// ============================================================================

/**
 * Logger para auditoria
 */
let logger: AuditLogger | null = null;

/**
 * Instância do capturador de screenshots
 */
let screenshotCapture: ScreenshotCapture | null = null;

/**
 * Instância global do LockdownSecurityManager para captura de vídeo
 * Separada do screenshot para permitir uso independente
 */
let globalLockdownManager: LockdownSecurityManager | null = null;

/**
 * Obtém ou cria logger
 */
function getLogger(correlationId?: string): AuditLogger {
  if (!logger || correlationId) {
    logger = new AuditLogger(correlationId);
  }
  return logger;
}

/**
 * Obtém ou cria instância do ScreenshotCapture
 */
function getScreenshotCapture(): ScreenshotCapture {
  screenshotCapture ??= new ScreenshotCapture(getLogger());
  return screenshotCapture;
}

// ============================================================================
// Tipos
// ============================================================================

/**
 * Tipos de mensagens suportadas pelo Content Script
 */
type ContentMessageType =
  | 'PING'
  | 'GET_PAGE_INFO'
  | 'VERIFY_PAGE_LOADED'
  | 'ACTIVATE_LOCKDOWN'
  | 'DEACTIVATE_LOCKDOWN'
  | 'START_SCREENSHOT'
  | 'START_VIDEO'
  | 'START_CAPTURE'
  | 'START_PISA'
  | 'STOP_CAPTURE'
  | 'CANCEL_CAPTURE'
  | 'CAPTURE_CLEANUP';

/**
 * Estrutura de mensagem recebida
 */
interface ContentMessage {
  type: ContentMessageType;
  payload?: unknown;
  correlationId?: string;
  timeout?: number;
}

/**
 * Estrutura de resposta padrão
 */
interface ContentResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Informações da página atual
 */
interface PageInfo {
  url: string;
  title: string;
  readyState: DocumentReadyState;
  timestamp: string;
  viewport: {
    width: number;
    height: number;
  };
  scrollPosition: {
    x: number;
    y: number;
  };
  documentHeight: number;
}

/**
 * Status de carregamento da página
 */
interface PageLoadStatus {
  readyState: DocumentReadyState;
  imagesLoaded: boolean;
  fontsLoaded: boolean;
  imageCount: number;
  loadedImageCount: number;
}

// ============================================================================
// Handler de Mensagens
// ============================================================================

/**
 * Listener de mensagens do Service Worker
 * Processa todas as mensagens de forma assíncrona
 */
chrome.runtime.onMessage.addListener(
  (
    message: ContentMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ContentResponse) => void
  ) => {
    // Log de debug para mensagens recebidas (usar warn para evitar lint error)
    if (process.env['NODE_ENV'] === 'development') {
      console.warn('[ContentScript] Mensagem recebida', {
        type: message.type,
        correlationId: message.correlationId,
      });
    }

    handleMessage(message)
      .then(sendResponse)
      .catch((error) => {
        console.error('[ContentScript] Erro ao processar mensagem', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          type: message.type,
        });
        captureException(error, {
          context: 'message_handler',
          messageType: message.type
        });
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      });

    // Retornar true para indicar resposta assíncrona
    return true;
  }
);

// ============================================================================
// Processamento de Mensagens
// ============================================================================

/**
 * Processa mensagens recebidas do Service Worker
 *
 * @param message - Mensagem recebida
 * @returns Resposta da operação
 */
async function handleMessage(message: ContentMessage): Promise<ContentResponse> {
  switch (message.type) {
    case 'PING':
      return { success: true, data: 'PONG' };

    case 'GET_PAGE_INFO':
      return {
        success: true,
        data: getPageInfo(),
      };

    case 'VERIFY_PAGE_LOADED':
      return {
        success: true,
        data: await verifyPageLoaded(message.timeout),
      };

    case 'ACTIVATE_LOCKDOWN': {
      // Ativar lockdown para captura de vídeo
      // Cria nova instância do LockdownSecurityManager
      try {
        // Se já existe um lockdown ativo, retornar sucesso
        if (globalLockdownManager?.isLockdownActive()) {
          getLogger().info('LOCKDOWN', 'ALREADY_ACTIVE_FROM_MESSAGE', {});
          return {
            success: true,
            data: { alreadyActive: true },
          };
        }

        // Criar nova instância e ativar
        globalLockdownManager = new LockdownSecurityManager(getLogger());
        const result = await globalLockdownManager.activate();

        if (result.success) {
          getLogger().info('LOCKDOWN', 'ACTIVATED_FROM_MESSAGE', {
            protections: result.protections,
          });
          return {
            success: true,
            data: {
              protections: result.protections,
              baselineSnapshot: result.baselineSnapshot,
            },
          };
        } else {
          getLogger().error('LOCKDOWN', 'ACTIVATION_FAILED_FROM_MESSAGE', {
            error: result.error,
          });
          return {
            success: false,
            error: result.error ?? 'Falha ao ativar lockdown',
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        getLogger().error('LOCKDOWN', 'ACTIVATION_EXCEPTION', { error: errorMessage });
        return {
          success: false,
          error: errorMessage,
        };
      }
    }

    case 'DEACTIVATE_LOCKDOWN': {
      // Desativar lockdown no content script
      // Verificar primeiro o lockdown global (usado por vídeo)
      if (globalLockdownManager?.isLockdownActive()) {
        const result = globalLockdownManager.deactivate();
        getLogger().info('LOCKDOWN', 'GLOBAL_DEACTIVATED_FROM_MESSAGE', {
          violations: result.totalViolations,
        });
        globalLockdownManager = null;
        return {
          success: true,
          data: {
            violations: result.totalViolations,
            protections: result.protections,
          },
        };
      }

      // Verificar também o lockdown do screenshot
      const capture = getScreenshotCapture();
      const lockdownManager = capture.getLockdownManager();

      if (lockdownManager?.isLockdownActive()) {
        const result = lockdownManager.deactivate();
        getLogger().info('LOCKDOWN', 'SCREENSHOT_DEACTIVATED_FROM_MESSAGE', {
          violations: result.totalViolations,
        });
        return {
          success: true,
          data: {
            violations: result.totalViolations,
            protections: result.protections,
          },
        };
      }

      return {
        success: true,
        data: {
          message: 'Lockdown not active',
        },
      };
    }

    // NOTA: CANCEL_CAPTURE está definido abaixo (linha 477)
    // para evitar duplicação de código

    case 'START_SCREENSHOT': {
      // Iniciar captura de screenshot full-page
      const capture = getScreenshotCapture();
      
      if (capture.isInProgress()) {
        return {
          success: false,
          error: 'Captura já em andamento',
        };
      }

      getLogger().info('CAPTURE', 'SCREENSHOT_START_REQUEST', {
        url: window.location.href,
      });
      
      // Executar captura de forma assíncrona
      const result = await capture.capture({
        onProgress: (progress) => {
          // Enviar progresso para o service worker
          // Usar .catch() para evitar UNHANDLED_REJECTION quando não há listener
          chrome.runtime.sendMessage({
            type: 'CAPTURE_PROGRESS',
            payload: progress,
          }).catch(() => {
            // Ignora se não houver listener
          });
        },
      });

      if (result.success) {
        getLogger().info('CAPTURE', 'SCREENSHOT_SUCCESS', {
          width: result.width,
          height: result.height,
          durationMs: result.durationMs,
        });
        return {
          success: true,
          data: {
            imageData: result.imageData,
            imageHash: result.imageHash,
            htmlContent: result.htmlContent,
            htmlHash: result.htmlHash,
            metadata: result.metadata,
            metadataHash: result.metadataHash,
            width: result.width,
            height: result.height,
            durationMs: result.durationMs,
          },
        };
      } else {
        console.error('[ContentScript] Falha na captura:', result.error);
        return {
          success: false,
          error: result.error ?? 'Falha ao capturar screenshot',
        };
      }
    }

    case 'START_VIDEO':
    case 'START_CAPTURE': {
      // Iniciar preparação forense para captura de vídeo
      // O overlay de preparação forense é gerenciado pelo SidePanel
      // Aqui apenas confirmamos que o content-script está pronto
      const videoPayload = message.payload as { type?: string } | undefined;

      getLogger().info('CAPTURE', 'VIDEO_CAPTURE_START_REQUEST', {
        url: window.location.href,
        captureType: videoPayload?.type ?? 'video',
        correlationId: message.correlationId,
      });

      // Iniciar rastreamento de interações do usuário
      // O InteractionTracker enviará estatísticas para o Service Worker
      const tracker = getInteractionTracker({ sendToServiceWorker: true });
      tracker.start();
      tracker.incrementPagesVisited(); // Página inicial conta como visitada

      getLogger().info('CAPTURE', 'INTERACTION_TRACKER_STARTED', {
        url: window.location.href,
        correlationId: message.correlationId,
      });

      // Notificar service-worker que content-script está pronto para captura
      chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_READY_FOR_CAPTURE',
        payload: {
          url: window.location.href,
          title: document.title,
          readyState: document.readyState,
          timestamp: new Date().toISOString(),
        },
      }).catch(() => {
        // Ignorar erro de envio - pode não ter listener
      });

      return {
        success: true,
        data: {
          status: 'ready',
          pageInfo: getPageInfo(),
        },
      };
    }

    case 'START_PISA': {
      // Iniciar processo PISA (Preservação, Integridade, Segurança, Autenticidade)
      const pisaPayload = message.payload as { captureType?: string } | undefined;
      const captureType = pisaPayload?.captureType ?? 'screenshot';
      
      getLogger().info('CAPTURE', 'PISA_START_REQUEST', {
        captureType,
        url: window.location.href,
        correlationId: message.correlationId,
      });

      if (captureType === 'screenshot') {
        // Usar captura de screenshot
        const capture = getScreenshotCapture();
        
        if (capture.isInProgress()) {
          console.warn('[ContentScript] Captura já em andamento, abortando');
          return {
            success: false,
            error: 'Captura já em andamento',
          };
        }

        const captureStartTime = Date.now();
        
        const result = await capture.capture({
          onProgress: (progress) => {
            chrome.runtime.sendMessage({
              type: 'CAPTURE_PROGRESS',
              payload: progress,
            }).catch(() => {
              // Ignora se não houver listener
            });
          },
        });

        const captureDuration = Date.now() - captureStartTime;
        getLogger().info('CAPTURE', 'PISA_CAPTURE_RESULT', {
          success: result.success,
          error: result.error,
          durationMs: captureDuration,
          hasImageData: !!result.imageData,
        });

        if (result.success) {
          return {
            success: true,
            data: {
              status: 'completed',
              imageData: result.imageData,
              imageHash: result.imageHash,
              htmlContent: result.htmlContent,
              htmlHash: result.htmlHash,
              metadata: result.metadata,
              metadataHash: result.metadataHash,
              pageInfo: getPageInfo(),
            },
          };
        } else {
          console.error('[ContentScript] Captura falhou:', result.error);
          return {
            success: false,
            error: result.error ?? 'Falha na captura PISA',
          };
        }
      }

      // Fallback para outros tipos
      return {
        success: true,
        data: {
          status: 'started',
          pageInfo: getPageInfo(),
        },
      };
    }

    case 'STOP_CAPTURE': {
      // Parar captura em andamento
      getLogger().info('CAPTURE', 'STOP_REQUEST', {});

      // Parar rastreamento de interações
      const trackerStop = getInteractionTracker();
      trackerStop.stop();
      getLogger().info('CAPTURE', 'INTERACTION_TRACKER_STOPPED', {});

      const capture = getScreenshotCapture();
      capture.cancel();
      return {
        success: true,
        data: { status: 'stopped' },
      };
    }

    case 'CANCEL_CAPTURE': {
      // Cancelar captura em andamento
      getLogger().info('CAPTURE', 'CANCEL_REQUEST', {});

      // Parar rastreamento de interações
      const trackerCancel = getInteractionTracker();
      trackerCancel.stop();
      getLogger().info('CAPTURE', 'INTERACTION_TRACKER_STOPPED', {});

      const capture = getScreenshotCapture();
      capture.cancel();
      return {
        success: true,
        data: { status: 'cancelled' },
      };
    }

    case 'CAPTURE_CLEANUP': {
      // Limpar recursos após captura (screenshot ou vídeo)
      // Este handler é chamado pelo PostCaptureProcessor após upload completo
      getLogger().info('CAPTURE', 'CLEANUP_REQUEST', {});

      // Limpar screenshot capture se ativo
      const capture = getScreenshotCapture();
      if (capture.isCapturing) {
        capture.cleanup();
      }

      // Desativar lockdown se ainda estiver ativo
      const lockdownManager = capture.getLockdownManager();
      if (lockdownManager?.isLockdownActive()) {
        const result = lockdownManager.deactivate();
        getLogger().info('LOCKDOWN', 'DEACTIVATED_IN_CLEANUP', {
          violations: result.totalViolations,
        });
      }

      return {
        success: true,
        data: {
          status: 'cleaned',
          message: 'Recursos limpos e lockdown desativado',
        },
      };
    }

    default:
      return {
        success: false,
        error: `Tipo de mensagem desconhecido: ${message.type}`,
      };
  }
}

// ============================================================================
// Funções de Coleta de Informações
// ============================================================================

/**
 * Coleta informações básicas da página atual
 *
 * @returns Informações da página
 */
function getPageInfo(): PageInfo {
  return {
    url: window.location.href,
    title: document.title,
    readyState: document.readyState,
    timestamp: new Date().toISOString(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scrollPosition: {
      x: window.scrollX,
      y: window.scrollY,
    },
    documentHeight: Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    ),
  };
}

/**
 * Verifica se a página está completamente carregada
 * Aguarda imagens e fontes carregarem
 *
 * @param timeout - Timeout máximo em ms (padrão: 30000)
 * @returns Status de carregamento
 */
async function verifyPageLoaded(timeout = 30000): Promise<PageLoadStatus> {
  const startTime = Date.now();

  // Aguardar document.readyState === 'complete'
  if (document.readyState !== 'complete') {
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (document.readyState === 'complete' || Date.now() - startTime > timeout) {
          resolve();
        } else {
          requestAnimationFrame(checkReady);
        }
      };
      checkReady();
    });
  }

  // Verificar imagens
  const images = Array.from(document.images);
  const imageCount = images.length;

  // Aguardar imagens carregarem
  const imagePromises = images.map((img) => {
    if (img.complete) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => resolve(false), timeout - (Date.now() - startTime));

      img.addEventListener('load', () => {
        clearTimeout(timeoutId);
        resolve(true);
      });

      img.addEventListener('error', () => {
        clearTimeout(timeoutId);
        resolve(false);
      });
    });
  });

  const imageResults = await Promise.all(imagePromises);
  const loadedImageCount = imageResults.filter(Boolean).length;
  const imagesLoaded = loadedImageCount === imageCount;

  // Verificar fontes
  let fontsLoaded = true;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout - (Date.now() - startTime))
      ),
    ]);
    fontsLoaded = true;
  } catch {
    fontsLoaded = false;
  }

  return {
    readyState: document.readyState,
    imagesLoaded,
    fontsLoaded,
    imageCount,
    loadedImageCount,
  };
}

// ============================================================================
// Inicialização
// ============================================================================

/**
 * Verifica se há uma gravação de vídeo em andamento e inicia o InteractionTracker
 * Isso é necessário porque quando o usuário navega para outra página durante a gravação,
 * um novo content script é carregado e o tracker precisa ser reiniciado.
 */
async function checkAndStartTrackingIfRecording(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_RECORDING_STATUS' });

    if (response?.success && response.data?.isRecording) {
      // Há uma gravação em andamento - criar novo tracker para esta página
      // Usar createFreshTracker para garantir estado limpo em cada página
      const tracker = createFreshTracker({ sendToServiceWorker: true });

      tracker.start();
      // Não incrementar pagesVisited aqui - será feito pelo Service Worker
      // ao receber PAGE_VISITED_DURING_RECORDING

      getLogger().info('CAPTURE', 'INTERACTION_TRACKER_AUTO_STARTED', {
        url: window.location.href,
        reason: 'navigation_during_recording',
      });

      // Notificar Service Worker sobre nova página (para timeline de navegação)
      // O Service Worker irá incrementar pagesVisited e atualizar o Side Panel
      chrome.runtime.sendMessage({
        type: 'PAGE_VISITED_DURING_RECORDING',
        payload: {
          url: window.location.href,
          title: document.title,
          timestamp: Date.now(),
        },
      }).catch(() => {
        // Ignorar erro de envio
      });
    }
  } catch {
    // Ignorar erros silenciosamente (extensão pode não estar pronta)
  }
}

/**
 * Notifica que o content script foi carregado
 */
function notifyLoaded(): void {
  // Log de inicialização (usar warn para evitar lint error)
  if (process.env['NODE_ENV'] === 'development') {
    console.warn('[ContentScript] Lexato content script carregado', {
      url: window.location.href,
      readyState: document.readyState,
      timestamp: new Date().toISOString(),
    });
  }

  // Verificar se há gravação em andamento e iniciar tracker se necessário
  void checkAndStartTrackingIfRecording();
}

// ============================================================================
// Detecção de Navegação em SPA (Single Page Application)
// ============================================================================

/**
 * Última URL visitada para evitar duplicatas em atualizações rápidas
 */
let lastUrl = window.location.href;

/**
 * Manipula mudança de URL (SPA ou History API)
 */
function handleUrlChange(): void {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    
    // Log para debug
    if (process.env['NODE_ENV'] === 'development') {
      console.warn('[ContentScript] Mudança de URL detectada (SPA)', {
        from: lastUrl,
        to: currentUrl
      });
    }
    
    // Verificar se deve rastrear a nova "página"
    void checkAndStartTrackingIfRecording();
  }
}

/**
 * Configura listeners para detecção de navegação SPA
 */
function setupSpaNavigationDetection(): void {
  // 1. Listener para popstate (voltar/avançar no navegador)
  window.addEventListener('popstate', handleUrlChange);
  
  // 2. Monkey-patch para pushState
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    const result = originalPushState.apply(this, args);
    handleUrlChange();
    return result;
  };
  
  // 3. Monkey-patch para replaceState
  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    const result = originalReplaceState.apply(this, args);
    handleUrlChange();
    return result;
  };
}

// Inicializar detecção SPA
setupSpaNavigationDetection();

// Executar notificação ao carregar
notifyLoaded();

// ============================================================================
// Exports para Testes
// ============================================================================

export { handleMessage, getPageInfo, verifyPageLoaded };
export type { ContentMessage, ContentResponse, PageInfo, PageLoadStatus };
