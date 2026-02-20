/**
 * Content Script do Overlay de Captura
 *
 * Gerencia a injeção e controle do overlay de captura na página.
 * 
 * IMPORTANTE: Para captura de vídeo, a página deve mostrar APENAS o conteúdo real.
 * A UI de preparação forense e controles ficam no Side Panel (fora da área capturada).
 * 
 * Suporta dois modos:
 * - Screenshot: Overlay simples com progresso (na página)
 * - Vídeo: Sem overlay na página - tudo no Side Panel (Requisitos 1.1-1.7)
 *
 * @module OverlayContentScript
 */

import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import CaptureOverlay, { CaptureOverlayProps, OVERLAY_Z_INDEX, IsolationPhase } from '../overlay/CaptureOverlay';
import TabClosureModal from '../overlay/TabClosureModal';

// ============================================================================
// Constantes
// ============================================================================

const OVERLAY_HOST_ID = 'lexato-overlay-host';

// ============================================================================
// Tipos
// ============================================================================

// Modos do overlay:
// - idle: Nenhum overlay visível
// - recording: Gravação de vídeo ativa (SEM overlay na página - tudo no Side Panel)
// - screenshot: Captura de screenshot (overlay simples na página)
type OverlayMode = 'idle' | 'recording' | 'screenshot';

/** Tipos de mensagens recebidas do background */
interface OverlayMessage {
  type: string;
  payload?: {
    type?: string;
    percent?: number;
    message?: string;
    timeWarning?: '5min' | '1min' | '30sec';
    isolationPhase?: IsolationPhase;
    disabledExtensionsCount?: number;
    phase?: IsolationPhase;
    count?: number;
  };
  message?: string;
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Container do Overlay que gerencia estado e comunicação com background
 * 
 * IMPORTANTE: Para captura de vídeo, NÃO mostramos overlay na página.
 * A preparação forense e controles ficam no Side Panel.
 * A página deve mostrar apenas o conteúdo real que será capturado.
 */
const OverlayContainer: React.FC = () => {
  // Estado principal
  const [mode, setMode] = useState<OverlayMode>('idle');
  const [visible, setVisible] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);

  // Props do CaptureOverlay (apenas para screenshot)
  const [captureProps, setCaptureProps] = useState<CaptureOverlayProps>({
    captureType: 'screenshot',
    progress: 0,
    elapsedTime: 0,
    statusMessage: '',
    isRecording: false,
  });

  // Timer de gravação (apenas para referência interna)
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // ============================================================================
  // Handlers
  // ============================================================================

  /**
   * Inicia timer de gravação (apenas para referência interna)
   */
  const startRecordingTimer = () => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setCaptureProps((prev) => ({ ...prev, elapsedTime: elapsed }));
    }, 1000);
  };

  /**
   * Para timer de gravação
   */
  const stopRecordingTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * Handler para parar captura (screenshot)
   */
  const handleStop = () => {
    stopRecordingTimer();
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {
      // Ignora se não houver listener
    });
  };

  /**
   * Handler para cancelar captura (screenshot)
   */
  const handleCancel = () => {
    stopRecordingTimer();
    chrome.runtime.sendMessage({ type: 'CANCEL_CAPTURE' }).catch(() => {
      // Ignora se não houver listener
    });
    setVisible(false);
    setMode('idle');
  };

  /**
   * Handler para iniciar gravação (botão manual - fallback)
   */
  const handleStart = () => {
    chrome.runtime.sendMessage({ type: 'START_VIDEO_RECORDING' }).catch(() => {
      // Ignora se não houver listener
    });
    setCaptureProps((prev) => ({ ...prev, statusMessage: 'Iniciando gravação...' }));
  };

  /**
   * Handler para modal de saída (apenas screenshot)
   */
  const handleExitWarningStop = () => {
    handleStop();
    setShowExitWarning(false);
  };

  const handleExitWarningCancel = () => {
    setShowExitWarning(false);
  };

  // ============================================================================
  // Listener de Mensagens
  // ============================================================================

  useEffect(() => {
    const messageListener = (
      message: OverlayMessage,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ) => {
      switch (message.type) {
        // Início de captura de vídeo - NÃO mostrar overlay na página
        // A preparação forense e controles ficam no Side Panel
        case 'START_CAPTURE':
          if (message.payload?.type === 'video') {
            // Para vídeo: NÃO mostrar overlay na página
            // O Side Panel cuida de tudo (preparação, controles, etc.)
            setMode('recording');
            setVisible(false); // Página limpa para captura
            startRecordingTimer();
          } else {
            // Screenshot - modo simples com overlay na página
            setVisible(true);
            setMode('screenshot');
            setCaptureProps((prev) => ({
              ...prev,
              captureType: 'screenshot',
              statusMessage: 'Capturando...',
              progress: 0,
            }));
          }
          break;

        // Gravação de vídeo iniciada (após preparação no Side Panel)
        case 'VIDEO_RECORDING_STARTED':
          setMode('recording');
          setVisible(false); // Manter página limpa
          startRecordingTimer();
          break;

        // Captura finalizada
        case 'STOP_CAPTURE':
        case 'CAPTURE_COMPLETE':
          stopRecordingTimer();
          setVisible(false);
          setShowExitWarning(false);
          setMode('idle');
          break;

        // Progresso de captura (apenas para screenshot)
        case 'CAPTURE_PROGRESS':
          if (message.payload && mode === 'screenshot') {
            const payload = message.payload;
            setCaptureProps((prev) => ({
              ...prev,
              progress: payload.percent ?? prev.progress ?? 0,
              statusMessage: payload.message ?? prev.statusMessage ?? '',
              ...(payload.timeWarning !== undefined && { timeWarning: payload.timeWarning }),
              ...(payload.isolationPhase !== undefined && { isolationPhase: payload.isolationPhase }),
              ...(payload.disabledExtensionsCount !== undefined && { disabledExtensionsCount: payload.disabledExtensionsCount }),
            }));
          }
          break;

        // Status de isolamento (apenas para screenshot)
        case 'ISOLATION_STATUS':
          if (message.payload && mode === 'screenshot') {
            const payload = message.payload;
            setCaptureProps((prev) => ({
              ...prev,
              ...(payload.phase !== undefined && { isolationPhase: payload.phase }),
              ...(payload.count !== undefined && { disabledExtensionsCount: payload.count }),
            }));
          }
          break;

        // Aviso de saída (apenas para screenshot - vídeo permite navegação)
        case 'SHOW_EXIT_WARNING':
          if (mode === 'screenshot') {
            setShowExitWarning(true);
          }
          break;

        // Notificação de aba bloqueada
        case 'TAB_BLOCKED_NOTIFICATION':
          console.warn('[Overlay] Aba bloqueada:', message.message);
          break;
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Handler de beforeunload - APENAS para screenshot
    // Para vídeo, navegação é permitida (Requisitos 4.1-4.4)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Só mostrar aviso se estiver em modo screenshot
      // Para vídeo, navegação é permitida - NÃO mostrar diálogo
      if (visible && mode === 'screenshot') {
        e.preventDefault();
        e.returnValue = '';
      }
      // Para modo 'recording' (vídeo), NÃO fazer nada - navegação é permitida
    };

    // Só adicionar beforeunload se NÃO for modo de vídeo
    if (mode !== 'recording') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopRecordingTimer();
    };
  }, [visible, mode]);

  // ============================================================================
  // Render
  // ============================================================================

  // Para vídeo: NÃO renderizar nada na página (tudo no Side Panel)
  // Para screenshot: renderizar overlay normalmente
  if (!visible && !showExitWarning) {
    return null;
  }

  return (
    <>
      {/* Modo Screenshot - overlay na página */}
      {visible && mode === 'screenshot' && (
        <CaptureOverlay
          {...captureProps}
          onStop={handleStop}
          onCancel={handleCancel}
          onStart={handleStart}
        />
      )}

      {/* Modal de Aviso de Saída (apenas para screenshot) */}
      {mode === 'screenshot' && (
        <TabClosureModal
          isOpen={showExitWarning}
          onStopAndSave={handleExitWarningStop}
          onCancel={handleExitWarningCancel}
        />
      )}
    </>
  );
};

// ============================================================================
// Injeção do Overlay
// ============================================================================

/**
 * Injeta o overlay na página
 */
function injectOverlay() {
  // Evitar múltiplas injeções
  if (document.getElementById(OVERLAY_HOST_ID)) {
    return;
  }

  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  host.style.position = 'fixed';
  host.style.zIndex = OVERLAY_Z_INDEX.toString();
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';

  document.body.appendChild(host);

  // Shadow DOM para isolamento de estilos
  const shadow = host.attachShadow({ mode: 'open' });
  const rootContainer = document.createElement('div');
  shadow.appendChild(rootContainer);

  const root = createRoot(rootContainer);
  root.render(<OverlayContainer />);
}

// Injetar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectOverlay);
} else {
  injectOverlay();
}
