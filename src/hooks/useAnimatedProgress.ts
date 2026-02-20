/**
 * Hook para animar progresso de forma fluida
 *
 * Interpola suavemente entre valores de percentual,
 * incrementando 1% por vez com easing para transições naturais.
 *
 * IMPORTANTE: O progresso NUNCA regride - apenas avança para frente.
 *
 * @module useAnimatedProgress
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Cache global de progresso máximo por captureId
 * Persiste entre remontagens do componente
 */
const globalMaxProgress = new Map<string, number>();

/**
 * Obtém o progresso máximo global
 */
export function getGlobalMaxProgress(captureId = 'default'): number {
  return globalMaxProgress.get(captureId) ?? 0;
}

/**
 * Reseta o progresso máximo global (usar apenas no início de nova captura)
 */
export function resetGlobalMaxProgress(captureId = 'default'): void {
  globalMaxProgress.delete(captureId);
}

/**
 * Hook de progresso animado
 *
 * O progresso NUNCA diminui - apenas avança para frente.
 * Se um valor menor for recebido, ele é ignorado.
 * Usa cache global para persistir entre remontagens.
 *
 * @param targetPercent - Percentual alvo (0-100)
 * @param duration - Duração da animação em ms (padrão: calculado dinamicamente)
 * @param captureId - ID da captura para isolamento do cache (padrão: 'default')
 * @returns Percentual atual animado
 */
export function useAnimatedProgress(
  targetPercent: number,
  duration?: number,
  captureId = 'default'
): number {
  // Inicializar com o máximo global para persistir entre remontagens
  const [currentPercent, setCurrentPercent] = useState<number>(() => {
    return globalMaxProgress.get(captureId) ?? 0;
  });
  const animationRef = useRef<number | undefined>(undefined);
  const startPercentRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Cancelar animação anterior
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Validar percentual alvo
    const rawTarget = Math.min(100, Math.max(0, targetPercent));

    // Obter máximo global (persiste entre remontagens)
    const globalMax = globalMaxProgress.get(captureId) ?? 0;

    // REGRA CRÍTICA: Progresso NUNCA regride
    // Usar o maior entre: alvo, máximo global e atual
    const target = Math.max(rawTarget, globalMax, currentPercent);

    // Atualizar o máximo global
    if (target > globalMax) {
      globalMaxProgress.set(captureId, target);
    }

    // Se já estamos no alvo ou acima, não animar
    if (currentPercent >= target) {
      return;
    }

    // Calcular duração baseada na diferença
    const difference = target - currentPercent;
    // Duração mínima de 500ms, máxima de 3000ms
    // Para diferenças pequenas (1-5%): ~500-750ms
    // Para diferenças médias (5-20%): ~750-1500ms
    // Para diferenças grandes (20%+): ~1500-3000ms
    const baseDuration = Math.min(3000, Math.max(500, difference * 75));
    const calculatedDuration = duration ?? baseDuration;

    // Guardar valores iniciais
    startPercentRef.current = currentPercent;
    startTimeRef.current = performance.now();

    /**
     * Função de easing (ease-out quad)
     * Começa rápido e desacelera no final
     */
    const easeOutQuad = (t: number): number => {
      return t * (2 - t);
    };

    /**
     * Frame de animação
     */
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / calculatedDuration, 1);

      // Aplicar easing
      const easedProgress = easeOutQuad(progress);

      // Calcular novo percentual (sempre para frente)
      const newPercent = Math.round(
        startPercentRef.current +
        (target - startPercentRef.current) * easedProgress
      );

      // Garantir que nunca regride (usar máximo global também)
      setCurrentPercent(prev => {
        const maxValue = Math.max(prev, newPercent, globalMaxProgress.get(captureId) ?? 0);
        // Atualizar global se necessário
        if (maxValue > (globalMaxProgress.get(captureId) ?? 0)) {
          globalMaxProgress.set(captureId, maxValue);
        }
        return maxValue;
      });

      // Continuar animação se não chegamos ao fim
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    // Iniciar animação
    animationRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetPercent, captureId]); // Não incluir currentPercent nas deps para evitar loop

  return currentPercent;
}

/**
 * Hook de progresso animado com incrementos discretos
 *
 * Incrementa 1% por vez em intervalos regulares para
 * uma sensação mais "mecânica" e previsível.
 *
 * IMPORTANTE: O progresso NUNCA regride - apenas avança para frente.
 * Usa cache global para persistir entre remontagens.
 *
 * @param targetPercent - Percentual alvo (0-100)
 * @param incrementDelay - Delay entre incrementos em ms (padrão: 75ms)
 * @param captureId - ID da captura para isolamento do cache (padrão: 'default')
 * @returns Percentual atual animado
 */
export function useSteppedProgress(
  targetPercent: number,
  incrementDelay = 75,
  captureId = 'default'
): number {
  // Inicializar com o máximo global para persistir entre remontagens
  const [currentPercent, setCurrentPercent] = useState<number>(() => {
    return globalMaxProgress.get(captureId) ?? 0;
  });
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    // Cancelar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Validar percentual alvo
    const rawTarget = Math.min(100, Math.max(0, targetPercent));

    // Obter máximo global (persiste entre remontagens)
    const globalMax = globalMaxProgress.get(captureId) ?? 0;

    // REGRA CRÍTICA: Progresso NUNCA regride
    // Usar o maior entre: alvo, máximo global e atual
    const target = Math.max(rawTarget, globalMax, currentPercent);

    // Atualizar o máximo global
    if (target > globalMax) {
      globalMaxProgress.set(captureId, target);
    }

    // Se já estamos no alvo ou acima, não animar
    if (currentPercent >= target) {
      return;
    }

    // Criar intervalo para incrementar (apenas para frente)
    intervalRef.current = setInterval(() => {
      setCurrentPercent(prev => {
        const next = prev + 1;
        const currentGlobalMax = globalMaxProgress.get(captureId) ?? 0;

        // Parar quando atingir o alvo
        if (next >= target) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          // Atualizar global
          if (target > currentGlobalMax) {
            globalMaxProgress.set(captureId, target);
          }
          return target;
        }

        // Atualizar global se necessário
        if (next > currentGlobalMax) {
          globalMaxProgress.set(captureId, next);
        }

        return next;
      });
    }, incrementDelay);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [targetPercent, incrementDelay, captureId]); // Não incluir currentPercent nas deps

  return currentPercent;
}