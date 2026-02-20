/**
 * Componente principal do Side Panel
 *
 * Gerencia a exibição dos controles de gravação de vídeo fora da área capturada.
 * O Side Panel tem largura fixa de 320px e fica posicionado à direita (Requisito 1.5).
 *
 * Funcionalidades:
 * - Exibe estado da gravação (timer, progresso)
 * - Exibe estatísticas em tempo real (cliques, teclas, scrolls)
 * - Exibe histórico de navegação com timestamps
 * - Exibe contexto forense (localização, conexão, dispositivo)
 * - Controles: Concluir, Cancelar
 *
 * @module SidePanel
 * @requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { RecordingState, SidePanelMessage } from './types';
import type { FinalizationPhase, FinalizationProgressMessage } from '../background/video-capture-handler';
import { SidePanelVariations } from './SidePanelVariations';
import { UnifiedCaptureProgress, type UnifiedProgressStep } from './components/capture/UnifiedCaptureProgress';
import { loggers } from '../lib/logger';

// =============================================================================
// Ícones SVG inline (para evitar dependências externas)
// =============================================================================

// Ícones removidos (agora usam UnifiedCaptureProgress)

// =============================================================================
// Constantes e Tipos
// =============================================================================

/**
 * Fases da preparação forense
 */
interface PreparationPhase {
  id: string;
  label: string;
  steps: { id: string; label: string }[];
}

const PREPARATION_PHASES: PreparationPhase[] = [
  {
    id: 'isolation',
    label: 'Isolamento do Ambiente',
    steps: [
      { id: 'isolate-env', label: 'Isolando ambiente de captura...' },
      { id: 'disable-ext', label: 'Desativando extensões de terceiros...' },
    ],
  },
  {
    id: 'preservation',
    label: 'Preservação da Cena',
    steps: [
      { id: 'preserve-state', label: 'Preservando estado da página...' },
      { id: 'dom-snapshot', label: 'Capturando snapshot do DOM...' },
    ],
  },
  {
    id: 'metadata',
    label: 'Coleta de Metadados',
    steps: [
      { id: 'network-meta', label: 'Coletando metadados de rede...' },
      { id: 'geo-server', label: 'Verificando geolocalização...' },
    ],
  },
  {
    id: 'integrity',
    label: 'Verificação de Integridade',
    steps: [
      { id: 'conn-integrity', label: 'Verificando integridade da conexão...' },
      { id: 'calc-hashes', label: 'Calculando hashes iniciais...' },
    ],
  },
];

/** Timeout de 1 minuto para preparação */
const PREPARATION_TIMEOUT_MS = 60000;

/** Estado inicial da gravação */
const INITIAL_STATE: RecordingState = {
  status: 'idle',
  startTime: 0,
  elapsedMs: 0,
  maxDurationMs: 30 * 60 * 1000, // 30 minutos
  stats: {
    pagesVisited: 0,
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

/**
 * Estado de preparação forense
 */
interface PreparationState {
  currentPhaseIndex: number;
  currentStepIndex: number;
  completedPhases: string[];
  completedSteps: string[];
  isRunning: boolean;
  error: string | null;
}

const INITIAL_PREPARATION_STATE: PreparationState = {
  currentPhaseIndex: 0,
  currentStepIndex: 0,
  completedPhases: [],
  completedSteps: [],
  isRunning: false,
  error: null,
};

/**
 * Estado de finalização da captura
 * Mostra progresso durante as fases de timestamp, upload e preview
 */
interface FinalizationState {
  isActive: boolean;
  phase: FinalizationPhase;
  percent: number;
  message: string;
}

const INITIAL_FINALIZATION_STATE: FinalizationState = {
  isActive: false,
  phase: 'stopping',
  percent: 0,
  message: '',
};

/**
 * Estado de erro do pipeline
 */
interface PipelineErrorState {
  hasError: boolean;
  code: string;
  message: string;
  phase: string;
  isRecoverable: boolean;
}

const INITIAL_ERROR_STATE: PipelineErrorState = {
  hasError: false,
  code: '',
  message: '',
  phase: '',
  isRecoverable: false,
};

/**
 * Fases de finalização com labels para exibição
 */
const FINALIZATION_PHASES: { id: FinalizationPhase; label: string }[] = [
  { id: 'stopping', label: 'Finalizando gravação' },
  { id: 'timestamp', label: 'Aplicando carimbo de tempo' },
  { id: 'upload', label: 'Enviando para o servidor' },
  { id: 'preview', label: 'Preparando visualização' },
  { id: 'complete', label: 'Captura finalizada!' },
];

// =============================================================================
// Componente Principal
// =============================================================================

/**
 * Componente SidePanel
 *
 * Componente principal que renderiza o painel de controles de gravação.
 * Recebe atualizações do Service Worker via message passing.
 */
export default function SidePanel(): React.ReactElement {
  const [recordingState, setRecordingState] = useState<RecordingState>(INITIAL_STATE);

  const [preparationState, setPreparationState] = useState<PreparationState>(INITIAL_PREPARATION_STATE);
  const [finalizationState, setFinalizationState] = useState<FinalizationState>(INITIAL_FINALIZATION_STATE);
  const [errorState, setErrorState] = useState<PipelineErrorState>(INITIAL_ERROR_STATE);
  const preparationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preparationStartedRef = useRef(false);


  /**
   * Handler para mensagens do Service Worker
   */
  const handleMessage = useCallback((message: SidePanelMessage) => {
    switch (message.type) {
      case 'RECORDING_STATE_UPDATE':
        // Quando status muda para 'recording', definir startTime se ainda não definido
        if (message.payload.status === 'recording' && message.payload.startTime === 0) {
          setRecordingState({
            ...message.payload,
            startTime: Date.now(),
          });
        } else {
          setRecordingState(message.payload);
        }
        break;

      case 'STATS_UPDATE':
        setRecordingState((prev) => ({
          ...prev,
          stats: { ...prev.stats, ...message.payload },
        }));
        break;

      case 'NAVIGATION_UPDATE':
        setRecordingState((prev) => ({
          ...prev,
          navigationHistory: [...prev.navigationHistory, message.payload],
        }));
        break;

      case 'ALERT':
        setRecordingState((prev) => ({
          ...prev,
          alerts: [...prev.alerts, message.payload],
        }));
        break;

      case 'UPLOAD_PROGRESS':
        setRecordingState((prev) => ({
          ...prev,
          uploadProgress: message.payload,
        }));
        break;

      default:
        break;
    }
  }, []);

  /**
   * Handler para mensagens de finalização
   */
  const handleFinalizationMessage = useCallback((message: FinalizationProgressMessage) => {
    const { phase, percent, message: progressMessage } = message.payload;

    // Ativar modo de finalização
    setFinalizationState({
      isActive: true,
      phase,
      percent,
      message: progressMessage,
    });

    // Se fase é 'complete', desativar após delay para mostrar sucesso
    if (phase === 'complete') {
      setTimeout(() => {
        setFinalizationState(INITIAL_FINALIZATION_STATE);
        setRecordingState(INITIAL_STATE);
      }, 2000);
    }

    // Se fase é 'error', também desativar após delay
    if (phase === 'error') {
      setTimeout(() => {
        setFinalizationState(INITIAL_FINALIZATION_STATE);
      }, 5000);
    }
  }, []);

  /**
   * Handler para mensagens de erro do pipeline
   */
  const handlePipelineError = useCallback((message: { type: 'PIPELINE_ERROR'; payload: {
    error: string;
    code?: string;
    isRecoverable?: boolean;
    phase?: string;
  } }) => {
    setErrorState({
      hasError: true,
      code: message.payload.code ?? 'UNKNOWN_ERROR',
      message: message.payload.error,
      phase: message.payload.phase ?? 'unknown',
      isRecoverable: message.payload.isRecoverable ?? false,
    });

    // Desativar estado de finalização se estava ativo
    setFinalizationState(INITIAL_FINALIZATION_STATE);
    // Resetar estado de gravação
    setRecordingState(INITIAL_STATE);
  }, []);

  /**
   * Configura listener de mensagens do Service Worker
   */
  useEffect(() => {
    const messageListener = (
      message: SidePanelMessage | FinalizationProgressMessage | { type: 'CLOSE_SIDEPANEL' } | { type: 'PIPELINE_ERROR'; payload: { error: string; code?: string; isRecoverable?: boolean; phase?: string } },
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ): boolean | void => {
      // Verificar se é mensagem para o Side Panel
      if (message && typeof message === 'object' && 'type' in message) {
        // Verificar se é mensagem para fechar o Side Panel
        if (message.type === 'CLOSE_SIDEPANEL') {
          window.close();
          return;
        }
        // Verificar se é mensagem de erro do pipeline
        if (message.type === 'PIPELINE_ERROR') {
          handlePipelineError(message as { type: 'PIPELINE_ERROR'; payload: { error: string; code?: string; isRecoverable?: boolean; phase?: string } });
          return;
        }
        // Verificar se é mensagem de finalização
        if (message.type === 'FINALIZATION_PROGRESS') {
          handleFinalizationMessage(message as FinalizationProgressMessage);
        } else {
          handleMessage(message as SidePanelMessage);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);


    // Solicitar estado atual ao conectar
    chrome.runtime.sendMessage({ type: 'SIDEPANEL_CONNECTED' }).catch(() => {
      // Erro ao notificar conexão - ignorar silenciosamente
    });

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);

    };
  }, [handleMessage, handleFinalizationMessage, handlePipelineError]);

  /**
   * Executa preparação forense quando status muda para 'preparing'
   */
  useEffect(() => {
    if (recordingState.status !== 'preparing' || preparationStartedRef.current) {
      return;
    }

    preparationStartedRef.current = true;

    // Configurar timeout de 1 minuto
    preparationTimeoutRef.current = setTimeout(() => {
      loggers.sidePanel.error('Timeout na preparação forense');
      setPreparationState((prev) => ({
        ...prev,
        isRunning: false,
        error: 'Tempo esgotado na preparação. Por favor, tente novamente.',
      }));

      chrome.runtime.sendMessage({
        type: 'FORENSIC_PREPARATION_TIMEOUT',
        payload: { reason: 'Timeout de 1 minuto excedido' },
      }).catch(() => {});
    }, PREPARATION_TIMEOUT_MS);

    // Função para executar as fases sequencialmente
    const runPreparation = async () => {
      setPreparationState((prev) => ({ ...prev, isRunning: true }));

      try {
        for (let phaseIdx = 0; phaseIdx < PREPARATION_PHASES.length; phaseIdx++) {
          const phase = PREPARATION_PHASES[phaseIdx];
          if (!phase) {
            continue;
          }

          setPreparationState((prev) => ({
            ...prev,
            currentPhaseIndex: phaseIdx,
            currentStepIndex: 0,
          }));

          for (let stepIdx = 0; stepIdx < phase.steps.length; stepIdx++) {
            const step = phase.steps[stepIdx];
            if (!step) {
              continue;
            }

            setPreparationState((prev) => ({
              ...prev,
              currentStepIndex: stepIdx,
            }));

            try {
              await chrome.runtime.sendMessage({
                type: 'FORENSIC_PREPARATION_STEP',
                payload: { phaseId: phase.id, stepId: step.id },
              });
            } catch (err) {
              // Erro ao notificar step - ignorar silenciosamente
            }

            await new Promise((r) => setTimeout(r, 800));

            setPreparationState((prev) => ({
              ...prev,
              completedSteps: [...prev.completedSteps, step.id],
            }));
          }

          setPreparationState((prev) => ({
            ...prev,
            completedPhases: [...prev.completedPhases, phase.id],
          }));
        }

        if (preparationTimeoutRef.current) {
          clearTimeout(preparationTimeoutRef.current);
          preparationTimeoutRef.current = null;
        }

        await chrome.runtime.sendMessage({
          type: 'FORENSIC_PREPARATION_COMPLETE',
          payload: { success: true },
        });

        setPreparationState((prev) => ({ ...prev, isRunning: false }));
      } catch (err) {
      loggers.sidePanel.error('Erro na preparação forense:', err as Error);
        setPreparationState((prev) => ({
          ...prev,
          isRunning: false,
          error: err instanceof Error ? err.message : 'Erro na preparação',
        }));

        chrome.runtime.sendMessage({
          type: 'FORENSIC_PREPARATION_ERROR',
          payload: { error: err instanceof Error ? err.message : 'Erro desconhecido' },
        }).catch(() => {});
      }
    };

    runPreparation();

    return () => {
      if (preparationTimeoutRef.current) {
        clearTimeout(preparationTimeoutRef.current);
        preparationTimeoutRef.current = null;
      }
    };
  }, [recordingState.status]);

  /**
   * Fallback: polling do estado de captura quando preparação terminou
   * mas o status ainda é 'preparing'.
   *
   * Após enviar FORENSIC_PREPARATION_COMPLETE, o service worker inicia
   * startVideoCaptureWithPipeline (~9s). Quando retorna, envia
   * RECORDING_STATE_UPDATE com 'recording'. Mas se essa mensagem não
   * chegar (ex: race condition, timing), este polling detecta a transição
   * consultando o estado persistido no service worker.
   */
  useEffect(() => {
    // Só ativar quando preparação terminou mas status ainda é 'preparing'
    if (recordingState.status !== 'preparing' || preparationState.isRunning) {
      return;
    }

    // Preparação terminou (isRunning=false) mas status ainda é 'preparing'
    // Isso significa que estamos aguardando o service worker iniciar a gravação

    const pollInterval = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'SIDEPANEL_CONNECTED' }).catch(() => {});
    }, 2000); // Verificar a cada 2 segundos

    // Timeout de 30s — se não transicionar, algo deu errado
    const fallbackTimeout = setTimeout(() => {
      clearInterval(pollInterval);
      loggers.sidePanel.error('Timeout aguardando transição para recording');
    }, 30000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [recordingState.status, preparationState.isRunning]);

  /**
   * Reset do estado de preparação quando status muda para não-preparing
   */
  useEffect(() => {
    if (recordingState.status !== 'preparing') {
      preparationStartedRef.current = false;
      setPreparationState(INITIAL_PREPARATION_STATE);
    }
  }, [recordingState.status]);

  /**
   * Atualiza timer a cada segundo durante gravação
   * Auto-finaliza quando atinge o tempo máximo (30 minutos)
   */
  const autoFinalizeTriggeredRef = useRef(false);

  useEffect(() => {
    if (recordingState.status !== 'recording') {
      // Resetar flag quando não está gravando
      autoFinalizeTriggeredRef.current = false;
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - recordingState.startTime;

      setRecordingState((prev) => ({
        ...prev,
        elapsedMs: elapsed,
      }));

      // Auto-finalizar ao atingir tempo máximo
      if (elapsed >= recordingState.maxDurationMs && !autoFinalizeTriggeredRef.current) {
        autoFinalizeTriggeredRef.current = true;
        chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }).catch((err) => {
          loggers.sidePanel.error('Erro ao auto-finalizar gravação:', err as Error);
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [recordingState.status, recordingState.startTime, recordingState.maxDurationMs]);

  // =========================================================================
  // Callbacks para controles de gravação (ANTES dos returns condicionais)
  // =========================================================================

  /**
   * Finaliza a gravação atual
   */
  const handleFinalize = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }).then((response) => {
      if (response && !response.success) {
        loggers.sidePanel.error('Falha ao finalizar:', new Error(response.error));
        // Se o service worker perdeu o estado, tentar via CAPTURE_STOP_VIDEO como fallback
        chrome.runtime.sendMessage({ type: 'CAPTURE_STOP_VIDEO' }).catch((fallbackErr) => {
          loggers.sidePanel.error('Fallback também falhou:', fallbackErr as Error);
        });
      }
    }).catch((err) => {
      loggers.sidePanel.error('Erro ao finalizar gravação:', err as Error);
      // Tentar fallback
      chrome.runtime.sendMessage({ type: 'CAPTURE_STOP_VIDEO' }).catch(() => {});
    });
  }, []);

  /**
   * Cancela a gravação (com confirmação)
   */
  const handleCancel = useCallback(() => {
    // eslint-disable-next-line no-alert -- Confirmação necessária antes de cancelar
    if (confirm('Deseja cancelar a gravação? Os dados serão descartados.')) {
      chrome.runtime.sendMessage({ type: 'CANCEL_RECORDING' }).catch((err) => {
        loggers.sidePanel.error('Erro ao cancelar gravação:', err as Error);
      });
    }
  }, []);

  // =========================================================================
  // Renderização: Estado de erro
  // =========================================================================
  if (errorState.hasError) {
    return (
      <UnifiedCaptureProgress
        title="Erro na Captura"
        description={errorState.message}
        phase="error"
        onCancel={() => {
            setErrorState({ ...errorState, hasError: false }); // Reset simples
            window.close();
        }}
        cancelLabel="Fechar"
      />
    );
  }


  // =========================================================================
  // Renderização: Estado idle (Inicializando)
  // =========================================================================
  // Quando iniciado em modo vídeo, este estado aparece brevemente antes
  // de transicionar para 'preparing'. Usamos o visual unificado "Inicializando".
  if (recordingState.status === 'idle') {
    return (
      <UnifiedCaptureProgress
        title="Inicializando"
        description="Preparando gravador de vídeo..."
        phase="initializing"
        onCancel={() => window.close()}
        cancelLabel="Fechar"
      />
    );
  }

  // =========================================================================
  // Renderização: Estado de preparação (Unificado)
  // =========================================================================
  if (recordingState.status === 'preparing') {
    const { currentPhaseIndex, currentStepIndex, completedPhases, completedSteps, error } = preparationState;

    if (error) {
      return (
        <UnifiedCaptureProgress
          title="Erro na Preparação"
          description={error}
          phase="error"
          onCancel={() => chrome.runtime.sendMessage({ type: 'CANCEL_RECORDING' }).catch(() => {})}
          cancelLabel="Fechar e Tentar Novamente"
        />
      );
    }

    // Mapear fases para formato unificado
    const steps: UnifiedProgressStep[] = PREPARATION_PHASES.map((phase, idx) => {
      let status: 'pending' | 'active' | 'completed' = 'pending';
      if (completedPhases.includes(phase.id)) {
        status = 'completed';
      } else if (idx === currentPhaseIndex) {
        status = 'active';
      }

      // Mapear sub-passos
      const subSteps = phase.steps.map((step, sIdx) => {
        let subStatus: 'pending' | 'active' | 'completed' = 'pending';
        if (completedSteps.includes(step.id)) {
          subStatus = 'completed';
        } else if (status === 'active' && sIdx === currentStepIndex) {
          subStatus = 'active';
        }
        return {
          id: step.id,
          label: step.label,
          status: subStatus
        };
      });

      return {
        id: phase.id,
        label: phase.label,
        status,
        subSteps
      };
    });

    return (
      <UnifiedCaptureProgress
        title="Preparação Forense"
        description="Estabelecendo ambiente seguro"
        phase="preparing"
        steps={steps}
        onCancel={() => {
            if (confirm('Deseja cancelar a preparação?')) {
              chrome.runtime.sendMessage({ type: 'CANCEL_RECORDING' }).catch(() => {});
            }
        }}
      />
    );
  }

  // =========================================================================
  // Renderização: Tela de finalização (Unificado)
  // =========================================================================
  if (finalizationState.isActive) {
    const isComplete = finalizationState.phase === 'complete';
    const isError = finalizationState.phase === 'error';

    // Mapear fases para formato unificado
    const currentPhaseIndex = FINALIZATION_PHASES.findIndex(p => p.id === finalizationState.phase);
    
    const steps: UnifiedProgressStep[] = FINALIZATION_PHASES
      .filter(p => p.id !== 'error' && p.id !== 'complete') // Remover 'complete' da lista visual se desejar, mas mantendo para status
      .map((phase, index) => {
        let status: 'pending' | 'active' | 'completed' = 'pending';
        
        if (isComplete) {
            status = 'completed';
        } else if (currentPhaseIndex > index) {
            status = 'completed';
        } else if (currentPhaseIndex === index) {
            status = 'active';
        }

        return {
            id: phase.id,
            label: phase.label,
            status
        };
      });

    return (
      <UnifiedCaptureProgress
        title={isComplete ? "Captura Finalizada!" : isError ? "Erro na Finalização" : "Finalizando Captura"}
        description={finalizationState.message || (isComplete ? "Redirecionando para visualização..." : "Processando evidência...")}
        phase={isComplete ? 'success' : isError ? 'error' : 'finalizing'}
        percent={finalizationState.percent > 0 ? finalizationState.percent : undefined}
        steps={steps}
        onCancel={isError ? () => setFinalizationState(INITIAL_FINALIZATION_STATE) : undefined}
        cancelLabel="Fechar"
      />
    );
  }

  // =========================================================================
  // Renderização: Painel de gravação ativo (Variação 9 - Split Panel)
  // =========================================================================
  return (
    <SidePanelVariations
      recordingState={recordingState}
      variation={9}
      onFinalize={handleFinalize}
      onCancel={handleCancel}
    />
  );
}
