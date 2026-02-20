/**
 * Hook para progresso visual consistente e previsível
 *
 * Implementa a técnica de "perceived progress" onde o progresso visual
 * flui de forma suave e consistente, independente do tempo real da operação.
 *
 * Comportamento:
 * - 0-80%: 1 segundo por 1% (80 segundos para chegar a 80%)
 * - 80-90%: 2 segundos por 1% (20 segundos para ir de 80% a 90%)
 * - 90-99%: 3-4 segundos por 1% (~30-40 segundos para ir de 90% a 99%)
 * - 99%: aguarda conclusão real
 * - 100%: quando a operação real termina
 *
 * Esta abordagem garante que o usuário sempre veja movimento no progresso,
 * evitando a sensação de "travamento" mesmo em operações mais lentas.
 *
 * @module useConsistentProgress
 */

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Configuração do progresso consistente
 */
interface ConsistentProgressConfig {
  /** Se true, inicia o progresso automaticamente */
  autoStart?: boolean;
  /** Se true, completa automaticamente quando targetPercent chega a 100 */
  autoComplete?: boolean;
}

/**
 * Retorno do hook useConsistentProgress
 */
interface ConsistentProgressResult {
  /** Percentual visual atual (0-100) */
  percent: number;
  /** Se o progresso está ativo */
  isRunning: boolean;
  /** Inicia o progresso do zero */
  start: () => void;
  /** Para o progresso no valor atual */
  pause: () => void;
  /** Completa imediatamente (salta para 100%) */
  complete: () => void;
  /** Reseta para 0% e para */
  reset: () => void;
}

/**
 * Padrão de variação para criar ritmo orgânico
 *
 * Em vez de 1s constante, alterna entre rápido (500ms) e normal (1000ms)
 * criando um fluxo mais natural e menos mecânico.
 *
 * Padrão: rápido, rápido, normal, rápido, normal, normal, rápido, normal...
 */
const VARIATION_PATTERN = [500, 500, 1000, 500, 1000, 1000, 500, 1000, 700, 500];

/**
 * Calcula o delay em ms para um determinado percentual
 *
 * Implementa variação orgânica para parecer mais natural:
 * - 0-80%: Alterna entre 500ms e 1000ms (média ~750ms)
 * - 80-90%: Alterna entre 1500ms e 2500ms (média ~2000ms)
 * - 90-99%: Alterna entre 3000ms e 4000ms (média ~3500ms)
 *
 * @param percent - Percentual atual (0-100)
 * @returns Delay em ms antes do próximo incremento
 */
function getDelayForPercent(percent: number): number {
  // Pega variação baseada no percentual (ciclo de 10)
  const patternIndex = percent % VARIATION_PATTERN.length;
  const variation = VARIATION_PATTERN[patternIndex] ?? 750;

  if (percent < 80) {
    // 0-80%: Base 500-1000ms com variação
    return variation;
  } else if (percent < 90) {
    // 80-90%: Escala 3x (1500-3000ms)
    return variation * 3;
  } else if (percent < 99) {
    // 90-99%: Escala 5x (2500-5000ms)
    return variation * 5;
  }
  // 99%: Não avança automaticamente, espera complete()
  return Infinity;
}

/**
 * Hook para progresso visual consistente e previsível
 *
 * O progresso flui de 1% em 1% com velocidades diferentes por faixa,
 * criando uma experiência de UX suave e previsível.
 *
 * @param targetPercent - Percentual alvo real (quando chega a 100, o hook pode completar)
 * @param config - Configuração opcional
 * @returns Objeto com percentual visual e funções de controle
 *
 * @example
 * ```typescript
 * const { percent, start, complete } = useConsistentProgress(realProgress);
 *
 * // O `percent` vai de 0 a 99 automaticamente
 * // Quando realProgress chegar a 100, chamar complete() salta para 100%
 *
 * useEffect(() => {
 *   if (realProgress === 100) {
 *     complete();
 *   }
 * }, [realProgress, complete]);
 * ```
 */
export function useConsistentProgress(
  targetPercent: number,
  config: ConsistentProgressConfig = {}
): ConsistentProgressResult {
  const { autoStart = true, autoComplete = true } = config;

  const [percent, setPercent] = useState(0);
  const [isRunning, setIsRunning] = useState(autoStart);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(autoStart);

  /**
   * Limpa o timer atual
   */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Agenda o próximo incremento
   */
  const scheduleNextIncrement = useCallback((currentPercent: number) => {
    clearTimer();

    // Não avançar além de 99% automaticamente
    if (currentPercent >= 99) {
      return;
    }

    const delay = getDelayForPercent(currentPercent);

    // Se delay é infinito, não agenda
    if (!isFinite(delay)) {
      return;
    }

    timerRef.current = setTimeout(() => {
      if (isRunningRef.current) {
        setPercent(prev => {
          const next = Math.min(prev + 1, 99);
          // Agendar próximo incremento
          if (next < 99) {
            scheduleNextIncrement(next);
          }
          return next;
        });
      }
    }, delay);
  }, [clearTimer]);

  /**
   * Inicia o progresso do zero
   */
  const start = useCallback(() => {
    clearTimer();
    setPercent(0);
    setIsRunning(true);
    isRunningRef.current = true;
    // Começar imediatamente com 1%
    setTimeout(() => {
      if (isRunningRef.current) {
        setPercent(1);
        scheduleNextIncrement(1);
      }
    }, 100);
  }, [clearTimer, scheduleNextIncrement]);

  /**
   * Pausa o progresso no valor atual
   */
  const pause = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    isRunningRef.current = false;
  }, [clearTimer]);

  /**
   * Completa imediatamente (salta para 100%)
   */
  const complete = useCallback(() => {
    clearTimer();
    setPercent(100);
    setIsRunning(false);
    isRunningRef.current = false;
  }, [clearTimer]);

  /**
   * Reseta para 0% e para
   */
  const reset = useCallback(() => {
    clearTimer();
    setPercent(0);
    setIsRunning(false);
    isRunningRef.current = false;
  }, [clearTimer]);

  // Efeito para iniciar automaticamente
  useEffect(() => {
    if (autoStart && isRunningRef.current && percent === 0) {
      start();
    }
  }, [autoStart, start, percent]);

  // Efeito para completar automaticamente quando target chega a 100
  useEffect(() => {
    if (autoComplete && targetPercent >= 100 && percent < 100) {
      complete();
    }
  }, [autoComplete, targetPercent, percent, complete]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    percent,
    isRunning,
    start,
    pause,
    complete,
    reset,
  };
}

/**
 * Hook para progresso por estágios com velocidade adaptativa
 *
 * Similar ao useConsistentProgress, mas permite definir velocidades
 * diferentes por estágio da operação.
 *
 * @param stage - Estágio atual da operação
 * @param isComplete - Se a operação está completa
 * @returns Percentual visual
 */
export function useAdaptiveProgress(
  stage: string,
  isComplete: boolean
): number {
  const { percent, complete, start } = useConsistentProgress(
    isComplete ? 100 : 0,
    { autoStart: true, autoComplete: true }
  );

  // Reinicia se o stage mudar para o inicial
  useEffect(() => {
    if (stage === 'initializing' && percent > 0 && !isComplete) {
      start();
    }
  }, [stage, percent, isComplete, start]);

  // Completa quando operação finaliza
  useEffect(() => {
    if (isComplete) {
      complete();
    }
  }, [isComplete, complete]);

  return percent;
}
