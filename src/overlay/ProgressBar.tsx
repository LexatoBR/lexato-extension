/**
 * Barra de Progresso do Overlay Lexato
 *
 * Exibe progresso percentual durante captura de screenshot.
 * Paleta: Verde (Caribbean #00DEA5 → Paolo Veronese #009978)
 * NUNCA usar azul como cor de destaque
 *
 * Requisitos atendidos:
 * - 1.3: Cor verde #00DEA5 (Caribbean Green) como cor de destaque
 * - 15.2: Exibir progresso percentual
 *
 * @module ProgressBar
 */

import React from 'react';

/**
 * Props do componente ProgressBar
 */
export interface ProgressBarProps {
  /** Progresso percentual (0-100) */
  percent: number;
  /** Exibir texto do percentual */
  showLabel?: boolean;
  /** Cor da barra (padrão: verde Lexato) */
  color?: 'green' | 'red' | 'success';
  /** Tamanho da barra */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Gradientes e cores disponíveis para a barra de progresso
 * Paleta Lexato: Verde (Caribbean #00DEA5, Paolo Veronese #009978, Sherwood #064033)
 * NUNCA usar azul como cor de destaque
 */
const COLORS = {
  // Gradiente verde com glow (padrão)
  green: {
    gradient: 'linear-gradient(90deg, #00DEA5, #009978)',
    glow: '0 0 12px rgba(0, 222, 165, 0.5)',
  },
  // Vermelho para erros
  red: {
    gradient: 'linear-gradient(90deg, #EF5350, #dc2626)',
    glow: '0 0 12px rgba(239, 83, 80, 0.5)',
  },
  // Verde mais escuro para sucesso
  success: {
    gradient: 'linear-gradient(90deg, #009978, #064033)',
    glow: '0 0 12px rgba(0, 153, 120, 0.5)',
  },
} as const;

/**
 * Alturas disponíveis para a barra
 */
const SIZES = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
} as const;

/**
 * Componente de barra de progresso
 *
 * Funcionalidades:
 * - Exibe progresso visual com gradiente verde (#00DEA5 → #009978)
 * - Glow effect verde para destaque
 * - Limita valores entre 0-100%
 * - Suporta diferentes cores e tamanhos
 * - Exibe label opcional com percentual
 */
export default function ProgressBar({
  percent,
  showLabel = true,
  color = 'green',
  size = 'md',
}: ProgressBarProps): React.ReactElement {
  // Limitar progresso entre 0 e 100
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const colorConfig = COLORS[color];

  return (
    <div
      style={{
        width: '100%',
      }}
      role="progressbar"
      aria-valuenow={clampedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progresso: ${Math.round(clampedPercent)}%`}
    >
      {/* Container da barra com glassmorfismo */}
      <div
        style={{
          height: SIZES[size],
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '9999px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Barra de progresso com gradiente e glow */}
        <div
          style={{
            height: '100%',
            background: colorConfig.gradient,
            borderRadius: '9999px',
            transition: 'width 0.3s ease-out',
            width: `${clampedPercent}%`,
            boxShadow: colorConfig.glow,
          }}
        />
      </div>

      {/* Label com percentual */}
      {showLabel && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '0.25rem',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: 'rgba(247, 249, 251, 0.7)',
              fontFamily: "'Fira Code', monospace",
            }}
          >
            {Math.round(clampedPercent)}%
          </span>
        </div>
      )}
    </div>
  );
}
