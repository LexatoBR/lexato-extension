/**
 * Componente de Timer de Gravação
 *
 * Exibe o tempo decorrido no formato MM:SS e uma barra de progresso
 * percentual indicando quanto do tempo máximo foi utilizado.
 *
 * Este componente é reutilizável e pode ser usado independentemente
 * do VideoRecordingPanel.
 *
 * @module RecordingTimer
 * @requirements 1.2, 1.3

 */
import React from 'react';

// ============================================================================
// Funções Utilitárias
// ============================================================================

/**
 * Formata tempo em milissegundos para formato MM:SS
 *
 * @param ms - Tempo em milissegundos
 * @returns String formatada no padrão MM:SS
 * @example formatTime(65000) // "01:05"
 * @example formatTime(0) // "00:00"
 * @example formatTime(5999000) // "99:59"
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calcula porcentagem de progresso
 *
 * Retorna um valor entre 0 e 100, limitado ao máximo de 100%.
 *
 * @param elapsed - Tempo decorrido em ms
 * @param max - Tempo máximo em ms
 * @returns Porcentagem (0-100)
 * @example calculateProgress(900000, 1800000) // 50
 * @example calculateProgress(0, 1800000) // 0
 * @example calculateProgress(2000000, 1800000) // 100 (limitado)
 */
export function calculateProgress(elapsed: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(100, Math.floor((elapsed / max) * 100));
}

// ============================================================================
// Tipos
// ============================================================================

/**
 * Props do componente RecordingTimer
 */
export interface RecordingTimerProps {
  /** Tempo decorrido em milissegundos */
  elapsedMs: number;
  /** Duração máxima em milissegundos */
  maxDurationMs: number;
  /** Mostrar tempo máximo ao lado do timer (padrão: true) */
  showMaxTime?: boolean;
  /** Mostrar porcentagem abaixo da barra (padrão: true) */
  showPercentage?: boolean;
  /** Classes CSS adicionais para o container */
  className?: string;
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Componente de Timer de Gravação
 *
 * Exibe o tempo decorrido da gravação no formato MM:SS e uma barra
 * de progresso visual indicando a porcentagem do tempo máximo utilizado.
 *
 * Requisitos implementados:
 * - 1.2: Exibir timer no formato MM:SS
 * - 1.3: Exibir barra de progresso percentual
 *
 * @param props - Props do componente
 * @returns Elemento React com timer e barra de progresso
 *
 * @example
 * ```tsx
 * // Uso básico
 * <RecordingTimer
 *   elapsedMs={65000}
 *   maxDurationMs={1800000}
 * />
 *
 * // Sem mostrar tempo máximo
 * <RecordingTimer
 *   elapsedMs={65000}
 *   maxDurationMs={1800000}
 *   showMaxTime={false}
 * />
 *
 * // Com classes customizadas
 * <RecordingTimer
 *   elapsedMs={65000}
 *   maxDurationMs={1800000}
 *   className="my-custom-class"
 * />
 * ```
 */
export default function RecordingTimer({
  elapsedMs,
  maxDurationMs,
  showMaxTime = true,
  showPercentage = true,
  className = '',
}: RecordingTimerProps): React.ReactElement {
  const progress = calculateProgress(elapsedMs, maxDurationMs);
  const formattedElapsed = formatTime(elapsedMs);
  const formattedMax = formatTime(maxDurationMs);

  return (
    <div className={`bg-zinc-800 rounded-lg p-4 ${className}`.trim()}>
      {/* Timer Display */}
      <div className="text-center mb-3">
        <span
          className="text-4xl font-mono font-bold"
          role="timer"
          aria-label={`Tempo decorrido: ${formattedElapsed}`}
        >
          {formattedElapsed}
        </span>
        {showMaxTime && (
          <span className="text-zinc-500 text-sm ml-2" aria-label={`Tempo máximo: ${formattedMax}`}>
            / {formattedMax}
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-700 rounded-full h-2">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso: ${progress}%`}
        />
      </div>

      {/* Percentage Label */}
      {showPercentage && (
        <div className="text-center mt-1">
          <span className="text-xs text-zinc-500">{progress}% do tempo máximo</span>
        </div>
      )}
    </div>
  );
}
