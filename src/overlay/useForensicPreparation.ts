/**
 * Hook de Preparação Forense
 *
 * Gerencia o estado e execução das etapas de preparação forense
 * antes de iniciar a gravação de vídeo.
 *
 * @module useForensicPreparation
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ForensicPhase, ForensicStep } from './ForensicPreparationOverlay';

// ============================================================================
// Tipos
// ============================================================================

export interface UseForensicPreparationOptions {
  /** Callback quando preparação completar */
  onComplete?: () => void;
  /** Callback quando countdown terminar */
  onCountdownComplete?: () => void;
  /** Callback em caso de erro */
  onError?: (error: string) => void;
}

export interface UseForensicPreparationReturn {
  /** Fases de preparação */
  phases: ForensicPhase[];
  /** Índice da fase atual */
  currentPhaseIndex: number;
  /** Índice da etapa atual */
  currentStepIndex: number;
  /** Countdown (3, 2, 1, 0) */
  countdown: number;
  /** Se preparação está completa */
  isComplete: boolean;
  /** Se está em execução */
  isRunning: boolean;
  /** Mensagem de erro */
  errorMessage: string | null;
  /** Inicia preparação */
  start: () => void;
  /** Cancela preparação */
  cancel: () => void;
  /** Atualiza status de uma etapa (para uso externo) */
  updateStepStatus: (phaseId: string, stepId: string, status: ForensicStep['status']) => void;
}

// ============================================================================
// Definição das Fases e Etapas
// ============================================================================

/**
 * Cria estrutura inicial das fases de preparação forense
 */
function createInitialPhases(): ForensicPhase[] {
  return [
    {
      id: 'isolation',
      title: 'Isolamento do Ambiente',
      icon: 'shield',
      status: 'pending',
      steps: [
        { id: 'isolate-env', label: 'Isolando ambiente de captura...', status: 'pending' },
        { id: 'disable-ext', label: 'Desativando extensões de terceiros...', status: 'pending' },
        { id: 'perimeter', label: 'Estabelecendo perímetro forense...', status: 'pending' },
      ],
    },
    {
      id: 'preservation',
      title: 'Preservação da Cena',
      icon: 'document',
      status: 'pending',
      steps: [
        { id: 'preserve-state', label: 'Preservando estado original da página...', status: 'pending' },
        { id: 'dom-snapshot', label: 'Registrando snapshot do DOM...', status: 'pending' },
        { id: 'html-custody', label: 'Capturando HTML inicial para cadeia de custódia...', status: 'pending' },
      ],
    },
    {
      id: 'metadata',
      title: 'Coleta de Metadados',
      icon: 'network',
      status: 'pending',
      steps: [
        { id: 'network-meta', label: 'Coletando metadados de rede (DNS, SSL, WHOIS)...', status: 'pending' },
        { id: 'ssl-cert', label: 'Registrando certificado SSL do servidor...', status: 'pending' },
        { id: 'geo-server', label: 'Obtendo geolocalização do servidor...', status: 'pending' },
        { id: 'http-headers', label: 'Capturando headers HTTP...', status: 'pending' },
      ],
    },
    {
      id: 'integrity',
      title: 'Verificação de Integridade',
      icon: 'lock',
      status: 'pending',
      steps: [
        { id: 'conn-integrity', label: 'Verificando integridade da conexão...', status: 'pending' },
        { id: 'validate-certs', label: 'Validando certificados de segurança...', status: 'pending' },
        { id: 'calc-hashes', label: 'Calculando hashes de verificação...', status: 'pending' },
      ],
    },
    {
      id: 'recorder',
      title: 'Preparação do Gravador',
      icon: 'video',
      status: 'pending',
      steps: [
        { id: 'init-recorder', label: 'Inicializando gravador forense...', status: 'pending' },
        { id: 'config-codec', label: 'Configurando codec de alta fidelidade...', status: 'pending' },
        { id: 'chunk-system', label: 'Preparando sistema de chunks com hash encadeado...', status: 'pending' },
      ],
    },
    {
      id: 'timestamp',
      title: 'Sincronização Temporal',
      icon: 'clock',
      status: 'pending',
      steps: [
        { id: 'ntp-sync', label: 'Sincronizando com servidor de tempo NTP...', status: 'pending' },
        { id: 'icp-brasil', label: 'Preparando carimbo de tempo ICP-Brasil...', status: 'pending' },
      ],
    },
  ];
}

// ============================================================================
// Tempos de Simulação (ms)
// ============================================================================

/**
 * Tempos de execução simulados para cada etapa
 * Tempos aumentados para permitir leitura pelo usuário
 * Em produção, esses tempos serão substituídos pela execução real
 */
const STEP_DURATIONS: Record<string, number> = {
  // Fase 1: Isolamento
  'isolate-env': 1200,
  'disable-ext': 1500,
  'perimeter': 1000,
  // Fase 2: Preservação
  'preserve-state': 1100,
  'dom-snapshot': 1300,
  'html-custody': 1200,
  // Fase 3: Metadados
  'network-meta': 1600,
  'ssl-cert': 1200,
  'geo-server': 1400,
  'http-headers': 1000,
  // Fase 4: Integridade
  'conn-integrity': 1100,
  'validate-certs': 1200,
  'calc-hashes': 1300,
  // Fase 5: Gravador
  'init-recorder': 1200,
  'config-codec': 1000,
  'chunk-system': 1100,
  // Fase 6: Timestamp
  'ntp-sync': 1300,
  'icp-brasil': 1200,
};

// ============================================================================
// Hook Principal
// ============================================================================

export function useForensicPreparation(
  options: UseForensicPreparationOptions = {}
): UseForensicPreparationReturn {
  const { onComplete, onCountdownComplete, onError } = options;

  const [phases, setPhases] = useState<ForensicPhase[]>(createInitialPhases);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cancelledRef = useRef(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Atualiza status de uma etapa específica
   */
  const updateStepStatus = useCallback(
    (phaseId: string, stepId: string, status: ForensicStep['status']) => {
      setPhases((prev) =>
        prev.map((phase) => {
          if (phase.id !== phaseId) {
            return phase;
          }
          return {
            ...phase,
            steps: phase.steps.map((step) =>
              step.id === stepId ? { ...step, status } : step
            ),
          };
        })
      );
    },
    []
  );

  /**
   * Atualiza status de uma fase
   */
  const updatePhaseStatus = useCallback(
    (phaseId: string, status: ForensicPhase['status']) => {
      setPhases((prev) =>
        prev.map((phase) =>
          phase.id === phaseId ? { ...phase, status } : phase
        )
      );
    },
    []
  );

  /**
   * Executa uma etapa (simulação + chamada real ao background)
   */
  const executeStep = useCallback(
    async (phaseId: string, step: ForensicStep): Promise<boolean> => {
      if (cancelledRef.current) {
        return false;
      }

      // Marcar como running
      updateStepStatus(phaseId, step.id, 'running');

      try {
        // Enviar mensagem para background executar a etapa real
        const response = await chrome.runtime.sendMessage({
          type: 'FORENSIC_PREPARATION_STEP',
          payload: { phaseId, stepId: step.id },
        });

        // Simular tempo mínimo para UX (etapas muito rápidas parecem fake)
        const minDuration = STEP_DURATIONS[step.id] ?? 300;
        await new Promise((resolve) => setTimeout(resolve, minDuration));

        if (cancelledRef.current) {
          return false;
        }

        // Verificar resposta do background
        if (response?.success === false) {
          updateStepStatus(phaseId, step.id, 'error');
          setErrorMessage(response.error ?? 'Erro na preparação');
          onError?.(response.error ?? 'Erro na preparação');
          return false;
        }

        // Marcar como completed
        updateStepStatus(phaseId, step.id, 'completed');
        return true;
      } catch {
        if (cancelledRef.current) {
          return false;
        }

        // Em caso de erro de comunicação, ainda marcar como completed
        // (a preparação visual continua, o background fará o trabalho real)
        updateStepStatus(phaseId, step.id, 'completed');
        return true;
      }
    },
    [updateStepStatus, onError]
  );

  /**
   * Executa todas as fases sequencialmente
   */
  const runPreparation = useCallback(async () => {
    cancelledRef.current = false;
    setIsRunning(true);
    setErrorMessage(null);

    const currentPhases = createInitialPhases();
    setPhases(currentPhases);

    for (let pIdx = 0; pIdx < currentPhases.length; pIdx++) {
      if (cancelledRef.current) {
        break;
      }

      const phase = currentPhases[pIdx];
      if (!phase) {
        continue;
      }

      setCurrentPhaseIndex(pIdx);
      updatePhaseStatus(phase.id, 'running');

      for (let sIdx = 0; sIdx < phase.steps.length; sIdx++) {
        if (cancelledRef.current) {
          break;
        }

        const step = phase.steps[sIdx];
        if (!step) {
          continue;
        }

        setCurrentStepIndex(sIdx);
        const success = await executeStep(phase.id, step);

        if (!success) {
          updatePhaseStatus(phase.id, 'error');
          setIsRunning(false);
          return;
        }
      }

      if (!cancelledRef.current) {
        updatePhaseStatus(phase.id, 'completed');
      }
    }

    if (cancelledRef.current) {
      setIsRunning(false);
      return;
    }

    // Preparação completa - iniciar countdown
    setIsComplete(true);
    onComplete?.();

    // Countdown 3-2-1
    setCountdown(3);
    let count = 3;

    countdownIntervalRef.current = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(0);
        setIsRunning(false);
        onCountdownComplete?.();
      }
    }, 1000);
  }, [executeStep, updatePhaseStatus, onComplete, onCountdownComplete]);

  /**
   * Inicia a preparação
   */
  const start = useCallback(() => {
    if (isRunning) {
      return;
    }
    runPreparation();
  }, [isRunning, runPreparation]);

  /**
   * Cancela a preparação
   */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setIsRunning(false);
    setCountdown(0);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Notificar background
    chrome.runtime.sendMessage({ type: 'CANCEL_CAPTURE' }).catch(() => {
      // Ignorar erro se não houver listener
    });
  }, []);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  return {
    phases,
    currentPhaseIndex,
    currentStepIndex,
    countdown,
    isComplete,
    isRunning,
    errorMessage,
    start,
    cancel,
    updateStepStatus,
  };
}

export default useForensicPreparation;
