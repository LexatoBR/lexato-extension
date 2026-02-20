/**
 * PrimaryButton - Botão principal com efeito de faísca na borda
 *
 * Componente reutilizável para ações principais em toda a extensão.
 * Design baseado no modelo #3 (Spark Border) + hover do #20 (Premium Minimal).
 *
 * @module PrimaryButton
 */

import React from 'react';
import './PrimaryButton.css';

interface PrimaryButtonProps {
  /** Texto do botão */
  children: React.ReactNode;
  /** Callback ao clicar */
  onClick?: () => void;
  /** Desabilita o botão */
  disabled?: boolean;
  /** Tipo do botão (submit, button, reset) */
  type?: 'button' | 'submit' | 'reset';
  /** Classe CSS adicional */
  className?: string;
  /** Largura total (100%) */
  fullWidth?: boolean;
  /** Estado de carregamento */
  loading?: boolean;
  /** Exibir seta animada (padrão: true) */
  showArrow?: boolean;
}

/**
 * Ícone de seta para direita
 */
function ArrowIcon(): React.ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/**
 * Botão principal com efeito de faísca percorrendo a borda.
 * Usado para ações de destaque como "Continuar", "Confirmar", etc.
 */
export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  className = '',
  fullWidth = false,
  loading = false,
  showArrow = true,
}: PrimaryButtonProps): React.ReactElement {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={`primary-button ${fullWidth ? 'primary-button--full' : ''} ${isDisabled ? 'primary-button--disabled' : ''} ${className}`}
      onClick={onClick}
      disabled={isDisabled}
    >
      <span className="primary-button__bg" />
      <span className="primary-button__hover-bg" />
      {!isDisabled && <span className="primary-button__spark" />}
      <span className="primary-button__text">
        {loading ? (
          <span className="primary-button__loader" />
        ) : (
          <>
            {children}
            {showArrow && (
              <span className="primary-button__arrow">
                <ArrowIcon />
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}

export default PrimaryButton;
