/**
 * Injetor do Processing Overlay no Content Script
 *
 * Gerencia a injeção e controle do ProcessingOverlay na página capturada.
 * Recebe mensagens do background script para mostrar/atualizar/esconder o overlay.
 *
 * Fluxo:
 * 1. OVERLAY_SHOW: Injeta o overlay na página
 * 2. OVERLAY_UPDATE_STATE: Atualiza progresso e status das etapas
 * 3. OVERLAY_ERROR: Exibe erro com opção de retry
 * 4. OVERLAY_COMPLETE: Remove overlay (preview é aberto pelo background)
 *
 * @module ProcessingOverlayInjector
 * @see Requirements 1: Processing Overlay Post-Capture
 * @see Requirements 1.6: WHEN all steps complete, close overlay and open preview page
 * @see Requirements 4.1: AFTER processing completes, open new tab with preview page
 */

import React, { useEffect, useState, useCallback } from 'react';
import { createRoot, Root } from 'react-dom/client';
import ProcessingOverlay, {
  PROCESSING_OVERLAY_Z_INDEX,
  DEFAULT_PROCESSING_STEPS,
  type ProcessingStep,
  type ProcessingError,
} from '../overlay/processing-overlay';

// ============================================================================
// Constantes
// ============================================================================

/** ID do elemento host do overlay */
const PROCESSING_OVERLAY_HOST_ID = 'lexato-processing-overlay-host';

/** Tempo de animação de saída em ms */
const EXIT_ANIMATION_DURATION_MS = 300;

// ============================================================================
// Tipos de Mensagens
// ============================================================================

/**
 * Tipos de mensagens do overlay de processamento
 */
type ProcessingOverlayMessageType =
  | 'OVERLAY_SHOW'
  | 'OVERLAY_HIDE'
  | 'OVERLAY_UPDATE_STATE'
  | 'OVERLAY_ERROR'
  | 'OVERLAY_RETRY_REQUESTED'
  | 'OVERLAY_COMPLETE';

/**
 * Estrutura base de mensagem do overlay
 */
interface ProcessingOverlayMessage {
  type: ProcessingOverlayMessageType;
  target: 'overlay';
  evidenceId: string;
  data?: {
    evidenceId?: string;
    steps?: ProcessingStep[];
    progress?: number;
    error?: ProcessingError | null;
    previewUrl?: string;
  };
}

// ============================================================================
// Estado Global
// ============================================================================

/** Root do React para o overlay */
let overlayRoot: Root | null = null;

/** Elemento host do overlay */
let overlayHost: HTMLDivElement | null = null;

/** Estado atual do overlay */
interface OverlayState {
  visible: boolean;
  evidenceId: string;
  steps: ProcessingStep[];
  progress: number;
  error: ProcessingError | null;
}

let currentState: OverlayState = {
  visible: false,
  evidenceId: '',
  steps: [...DEFAULT_PROCESSING_STEPS],
  progress: 10, // Captura já concluída
  error: null,
};

// ============================================================================
// Componente Container
// ============================================================================

/**
 * Container do Processing Overlay
 *
 * Gerencia o estado e renderização do overlay de processamento.
 * Recebe atualizações via eventos customizados do window.
 */
function ProcessingOverlayContainer(): React.ReactElement | null {
  const [state, setState] = useState<OverlayState>(currentState);

  /**
   * Handler para retry solicitado pelo usuário
   * Envia mensagem para o background script
   */
  const handleRetry = useCallback(() => {
    chrome.runtime.sendMessage({
      type: 'OVERLAY_RETRY_REQUESTED',
      target: 'overlay',
      evidenceId: state.evidenceId,
    }).catch(() => {
      // Ignora se não houver listener
    });
  }, [state.evidenceId]);

  /**
   * Listener para atualizações de estado via eventos customizados
   */
  useEffect(() => {
    const handleStateUpdate = (event: CustomEvent<OverlayState>) => {
      setState(event.detail);
    };

    window.addEventListener(
      'lexato-processing-overlay-update',
      handleStateUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        'lexato-processing-overlay-update',
        handleStateUpdate as EventListener
      );
    };
  }, []);

  // Não renderizar se não estiver visível
  if (!state.visible) {
    return null;
  }

  return (
    <ProcessingOverlay
      evidenceId={state.evidenceId}
      steps={state.steps}
      progress={state.progress}
      error={state.error}
      onRetry={handleRetry}
      visible={state.visible}
    />
  );
}

// ============================================================================
// Funções de Gerenciamento do Overlay
// ============================================================================

/**
 * Cria o elemento host do overlay no DOM
 */
function createOverlayHost(): HTMLDivElement {
  // Verificar se já existe
  const existing = document.getElementById(PROCESSING_OVERLAY_HOST_ID);
  if (existing) {
    return existing as HTMLDivElement;
  }

  const host = document.createElement('div');
  host.id = PROCESSING_OVERLAY_HOST_ID;
  host.style.position = 'fixed';
  host.style.zIndex = PROCESSING_OVERLAY_Z_INDEX.toString();
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.pointerEvents = 'none';

  document.body.appendChild(host);

  return host;
}

/**
 * Injeta o overlay na página
 *
 * @param evidenceId - ID da evidência sendo processada
 * @param steps - Etapas de processamento
 * @param progress - Progresso inicial
 */
function injectOverlay(
  evidenceId: string,
  steps: ProcessingStep[],
  progress: number
): void {
  // Criar host se não existir
  overlayHost ??= createOverlayHost();

  // Criar Shadow DOM para isolamento de estilos
  let shadowRoot = overlayHost.shadowRoot;
  shadowRoot ??= overlayHost.attachShadow({ mode: 'open' });

  // Criar container para o React
  let rootContainer = shadowRoot.querySelector('#processing-overlay-root');
  if (!rootContainer) {
    rootContainer = document.createElement('div');
    rootContainer.id = 'processing-overlay-root';
    shadowRoot.appendChild(rootContainer);
  }

  // Atualizar estado
  currentState = {
    visible: true,
    evidenceId,
    steps,
    progress,
    error: null,
  };

  // Criar ou atualizar root do React
  overlayRoot ??= createRoot(rootContainer);

  overlayRoot.render(<ProcessingOverlayContainer />);

  // Disparar evento de atualização
  dispatchStateUpdate();

  // eslint-disable-next-line no-console
  console.info('[ProcessingOverlay] Overlay injetado', {
    evidenceId,
    progress,
  });
}

/**
 * Atualiza o estado do overlay
 *
 * @param steps - Etapas atualizadas
 * @param progress - Progresso atualizado
 * @param error - Erro (se houver)
 */
function updateOverlayState(
  steps: ProcessingStep[],
  progress: number,
  error: ProcessingError | null
): void {
  currentState = {
    ...currentState,
    steps,
    progress,
    error,
  };

  dispatchStateUpdate();
}

/**
 * Remove o overlay da página
 *
 * @param animate - Se deve animar a saída
 */
function removeOverlay(animate = true): void {
  if (animate) {
    // Primeiro esconder com animação
    currentState = {
      ...currentState,
      visible: false,
    };
    dispatchStateUpdate();

    // Depois remover do DOM
    setTimeout(() => {
      cleanupOverlay();
    }, EXIT_ANIMATION_DURATION_MS);
  } else {
    cleanupOverlay();
  }
}

/**
 * Limpa o overlay do DOM
 */
function cleanupOverlay(): void {
  if (overlayRoot) {
    overlayRoot.unmount();
    overlayRoot = null;
  }

  if (overlayHost) {
    overlayHost.remove();
    overlayHost = null;
  }

  currentState = {
    visible: false,
    evidenceId: '',
    steps: [...DEFAULT_PROCESSING_STEPS],
    progress: 10,
    error: null,
  };

  // eslint-disable-next-line no-console
  console.info('[ProcessingOverlay] Overlay removido');
}

/**
 * Dispara evento de atualização de estado
 */
function dispatchStateUpdate(): void {
  const event = new CustomEvent('lexato-processing-overlay-update', {
    detail: { ...currentState },
  });
  window.dispatchEvent(event);
}

// ============================================================================
// Handler de Mensagens
// ============================================================================

/**
 * Processa mensagens do background script
 *
 * @param message - Mensagem recebida
 * @returns Resposta para o background
 */
function handleMessage(message: ProcessingOverlayMessage): { success: boolean } {
  // Verificar se é mensagem para o overlay
  if (message.target !== 'overlay') {
    return { success: false };
  }

  // eslint-disable-next-line no-console
  console.info('[ProcessingOverlay] Mensagem recebida', {
    type: message.type,
    evidenceId: message.evidenceId,
  });

  switch (message.type) {
    case 'OVERLAY_SHOW': {
      const data = message.data;
      if (data) {
        injectOverlay(
          data.evidenceId ?? message.evidenceId,
          data.steps ?? [...DEFAULT_PROCESSING_STEPS],
          data.progress ?? 10
        );
      }
      return { success: true };
    }

    case 'OVERLAY_UPDATE_STATE': {
      const data = message.data;
      if (data) {
        updateOverlayState(
          data.steps ?? currentState.steps,
          data.progress ?? currentState.progress,
          data.error ?? null
        );
      }
      return { success: true };
    }

    case 'OVERLAY_ERROR': {
      const data = message.data;
      if (data?.error) {
        updateOverlayState(
          currentState.steps,
          currentState.progress,
          data.error
        );
      }
      return { success: true };
    }

    case 'OVERLAY_HIDE': {
      removeOverlay(true);
      return { success: true };
    }

    case 'OVERLAY_COMPLETE': {
      // Remover overlay - a abertura da preview page é feita pelo background
      // @see Requirements 1.6: WHEN all steps complete, close overlay and open preview page
      // @see Requirements 4.1: AFTER processing completes, open new tab with preview page
      removeOverlay(true);

      // eslint-disable-next-line no-console
      console.info('[ProcessingOverlay] Processamento completo', {
        evidenceId: message.evidenceId,
        previewUrl: message.data?.previewUrl,
      });

      return { success: true };
    }

    default:
      console.warn('[ProcessingOverlay] Tipo de mensagem desconhecido', {
        type: message.type,
      });
      return { success: false };
  }
}

// ============================================================================
// Listener de Mensagens
// ============================================================================

/**
 * Listener de mensagens do Chrome Runtime
 */
chrome.runtime.onMessage.addListener(
  (
    message: ProcessingOverlayMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { success: boolean }) => void
  ) => {
    // Verificar se é mensagem para o overlay de processamento
    if (message.target === 'overlay') {
      const response = handleMessage(message);
      sendResponse(response);
      return true; // Indica resposta assíncrona
    }

    return false;
  }
);

// ============================================================================
// Inicialização
// ============================================================================

/**
 * Marca que o injetor do processing overlay está carregado
 */
declare global {
  interface Window {
    __LEXATO_PROCESSING_OVERLAY_LOADED__: boolean;
  }
}

window.__LEXATO_PROCESSING_OVERLAY_LOADED__ = true;

// eslint-disable-next-line no-console
console.info('[ProcessingOverlay] Injetor carregado', {
  url: window.location.href,
  timestamp: new Date().toISOString(),
});

// ============================================================================
// Exports para Testes
// ============================================================================

export {
  injectOverlay,
  updateOverlayState,
  removeOverlay,
  handleMessage,
  PROCESSING_OVERLAY_HOST_ID,
};

export type { ProcessingOverlayMessage, OverlayState };
