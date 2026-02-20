/**
 * Hook para progresso suave com incremento automático
 *
 * Garante que o usuário SEMPRE veja movimento no progresso,
 * mesmo durante operações que não reportam progresso granular.
 *
 * Funciona criando um "progresso falso" que avança lentamente
 * em direção ao alvo, nunca deixando o usuário sem feedback visual.
 *
 * @module useSmoothProgress
 */

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Configuração do progresso suave
 */
interface SmoothProgressConfig {
  /** Velocidade do progresso automático (% por segundo) */
  autoProgressSpeed?: number;
  /** Percentual máximo do progresso automático (não ultrapassar) */
  autoProgressMax?: number;
  /** Habilitar progresso automático */
  enableAutoProgress?: boolean;
  /** Duração mínima da animação em ms */
  minAnimationDuration?: number;
  /** Duração máxima da animação em ms */
  maxAnimationDuration?: number;
}

/**
 * Hook de progresso suave com incremento automático
 *
 * Características:
 * - Anima suavemente entre valores de progresso
 * - Avança automaticamente quando parado (progresso falso)
 * - Nunca regride
 * - Respeita limites máximos por etapa
 *
 * @param targetPercent - Percentual alvo (0-100)
 * @param config - Configuração do progresso
 * @returns Objeto com percentual animado e funções de controle
 */
export function useSmoothProgress(
  targetPercent: number,
  config: SmoothProgressConfig = {}
): {
  /** Percentual atual animado */
  percent: number;
  /** Define novo alvo imediatamente */
  setTarget: (value: number) => void;
  /** Reseta o progresso para 0 */
  reset: () => void;
} {
  const {
    autoProgressSpeed = 3, // 3% por segundo - mais rápido para feedback contínuo
    autoProgressMax = 85, // Não passar de 85% no automático
    enableAutoProgress = true,
    minAnimationDuration = 300, // Animações mais rápidas
    maxAnimationDuration = 2000, // Máximo menor para resposta mais ágil
  } = config;

  const [currentPercent, setCurrentPercent] = useState(0);
  const internalTargetRef = useRef(targetPercent);

  const animationRef = useRef<number | undefined>(undefined);
  const autoProgressRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(Date.now());
  const isAnimatingRef = useRef(false);

  /**
   * Função de easing (ease-in-out)
   * Suave no início e no fim
   */
  const easeInOutQuad = (t: number): number => {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  };

  /**
   * Anima o progresso para o alvo
   */
  const animateToTarget = useCallback((target: number, currentValue: number) => {
    // Cancelar animações anteriores
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (autoProgressRef.current) {
      cancelAnimationFrame(autoProgressRef.current);
    }

    isAnimatingRef.current = true;
    const startValue = currentValue;
    const difference = Math.abs(target - startValue);

    // Calcular duração baseada na diferença
    const duration = Math.min(
      maxAnimationDuration,
      Math.max(minAnimationDuration, difference * 100)
    );

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Aplicar easing
      const easedProgress = easeInOutQuad(progress);

      // Calcular novo valor
      const newValue = Math.round(
        startValue + (target - startValue) * easedProgress
      );

      setCurrentPercent(newValue);
      lastUpdateRef.current = Date.now();

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        // Iniciar progresso automático se habilitado
        if (enableAutoProgress && newValue < autoProgressMax && newValue < 100) {
          startAutoProgress();
        }
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [enableAutoProgress, autoProgressMax, minAnimationDuration, maxAnimationDuration]);

  /**
   * Inicia o progresso automático (falso)
   */
  const startAutoProgress = useCallback(() => {
    if (autoProgressRef.current) {
      cancelAnimationFrame(autoProgressRef.current);
    }

    const autoAnimate = () => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateRef.current;

      // Se passou muito tempo sem atualização real, avançar automaticamente
      // Reduzir delay para 200ms para resposta mais rápida
      if (timeSinceLastUpdate > 200 && !isAnimatingRef.current) {
        setCurrentPercent(prev => {
          // Calcular incremento baseado na velocidade
          // Usar 20fps para movimento mais suave
          const increment = autoProgressSpeed / 20;
          const next = prev + increment;

          // Respeitar limites
          const maxAllowed = Math.min(autoProgressMax, internalTargetRef.current - 1);
          const newValue = Math.min(next, maxAllowed, 99);

          // Parar se chegamos ao limite
          if (newValue >= maxAllowed || newValue >= 99) {
            return prev;
          }

          return Math.round(newValue * 10) / 10; // Arredondar para 1 casa decimal
        });
      }

      autoProgressRef.current = requestAnimationFrame(autoAnimate);
    };

    // Iniciar progresso automático mais rapidamente
    setTimeout(() => {
      autoProgressRef.current = requestAnimationFrame(autoAnimate);
    }, 300); // Reduzir de 1000ms para 300ms
  }, [autoProgressSpeed, autoProgressMax]);

  /**
   * Para o progresso automático
   */
  const stopAutoProgress = useCallback(() => {
    if (autoProgressRef.current) {
      cancelAnimationFrame(autoProgressRef.current);
      autoProgressRef.current = undefined;
    }
  }, []);

  /**
   * Define novo alvo
   */
  const setTarget = useCallback((value: number) => {
    const clampedValue = Math.min(100, Math.max(0, value));
    internalTargetRef.current = clampedValue;

    // Só animar se o novo valor for maior (nunca regredir)
    setCurrentPercent(prev => {
      if (clampedValue > prev) {
        stopAutoProgress();
        animateToTarget(clampedValue, prev);
      }
      return prev;
    });
  }, [animateToTarget, stopAutoProgress]);

  /**
   * Reseta o progresso
   */
  const reset = useCallback(() => {
    stopAutoProgress();
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setCurrentPercent(0);
    internalTargetRef.current = 0;
    lastUpdateRef.current = Date.now();
    isAnimatingRef.current = false;
  }, [stopAutoProgress]);

  // Efeito para mudanças no targetPercent externo
  useEffect(() => {
    setTarget(targetPercent);
  }, [targetPercent, setTarget]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (autoProgressRef.current) {
        cancelAnimationFrame(autoProgressRef.current);
      }
    };
  }, []);

  return {
    percent: currentPercent,
    setTarget,
    reset,
  };
}

/**
 * Hook para progresso por etapas com sub-progresso
 *
 * Útil para operações com múltiplas etapas onde cada uma
 * tem seu próprio progresso interno.
 *
 * @param stages - Array com as etapas e seus pesos
 * @param currentStage - Índice da etapa atual
 * @param stageProgress - Progresso dentro da etapa atual (0-100)
 * @returns Percentual total calculado
 */
export function useStageProgress(
  stages: Array<{ name: string; weight: number }>,
  currentStage: number,
  stageProgress: number
): number {
  const [totalProgress, setTotalProgress] = useState(0);

  useEffect(() => {
    // Calcular peso total
    const totalWeight = stages.reduce((sum, stage) => sum + stage.weight, 0);

    // Calcular progresso das etapas completas
    let completedWeight = 0;
    for (let i = 0; i < currentStage && i < stages.length; i++) {
      completedWeight += stages[i]?.weight ?? 0;
    }

    // Adicionar progresso da etapa atual
    const currentStageWeight = stages[currentStage]?.weight ?? 0;
    const currentWeight = (currentStageWeight * stageProgress) / 100;

    // Calcular percentual total
    const total = ((completedWeight + currentWeight) / totalWeight) * 100;
    setTotalProgress(Math.round(total));
  }, [stages, currentStage, stageProgress]);

  return totalProgress;
}