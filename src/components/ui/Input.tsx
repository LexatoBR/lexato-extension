/**
 * Componente Input do Design System Lexato
 *
 * Campo de entrada reutilizável com efeito glassmorphism,
 * suporte a ícone e estados de validação.
 *
 * @see Requirements 5.1-5.5
 */

import React from 'react';

/**
 * Props do componente Input
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Tipo do input */
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'number';
  /** Ícone à esquerda do input */
  icon?: React.ReactNode;
  /** Mensagem de erro (ativa estado de erro) */
  error?: string;
  /** Label do campo */
  label?: string;
  /** Texto de ajuda abaixo do input */
  helperText?: string;
}

/**
 * Campo de entrada do Design System Lexato
 *
 * Características:
 * - Background glass com borda sutil
 * - Estados: focus (borda verde, glow), error (borda vermelha)
 * - Suporte a ícone à esquerda
 * - Placeholder com cor rgba(255, 255, 255, 0.2)
 *
 * @example
 * ```tsx
 * // Input básico
 * <Input placeholder="Digite seu e-mail" />
 *
 * // Input com ícone
 * <Input
 *   icon={<SearchIcon />}
 *   placeholder="Buscar..."
 * />
 *
 * // Input com erro
 * <Input
 *   error="E-mail inválido"
 *   placeholder="Digite seu e-mail"
 * />
 *
 * // Input com label e helper text
 * <Input
 *   label="E-mail"
 *   helperText="Usaremos para enviar notificações"
 *   placeholder="seu@email.com"
 * />
 * ```
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      type = 'text',
      icon,
      error,
      label,
      helperText,
      disabled = false,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    // Gerar ID único (sempre chamado para manter ordem dos hooks)
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText && !error ? `${inputId}-helper` : undefined;

    const hasError = Boolean(error);

    // Classes do wrapper
    const wrapperClasses = [
      // Base glass effect
      'flex items-center gap-3',
      'h-12 px-4',
      'bg-glass-bgLight backdrop-blur-[10px]',
      'border rounded-lg',
      'transition-all duration-smooth ease-out',
      // Estado normal
      !hasError && !disabled && 'border-glass-border',
      // Estado de erro
      hasError && 'border-status-error shadow-[0_0_15px_rgba(239,83,80,0.1)]',
      // Estado desabilitado
      disabled && 'opacity-50 cursor-not-allowed',
      // Focus-within (aplicado via grupo)
      'focus-within:bg-[rgba(255,255,255,0.06)]',
      !hasError && 'focus-within:border-glass-borderActive focus-within:shadow-[0_0_25px_rgba(0,222,165,0.1)]',
    ]
      .filter(Boolean)
      .join(' ');

    // Classes do input
    const inputClasses = [
      'flex-1 bg-transparent border-none outline-none',
      'text-text-primary text-md',
      'placeholder:text-text-placeholder',
      // Focus-visible para acessibilidade (navegação por teclado)
      'focus-visible:outline-none',
      disabled && 'cursor-not-allowed',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // Classes do ícone
    const iconClasses = [
      'flex-shrink-0 w-5 h-5',
      'text-text-muted',
      'transition-colors duration-slow',
      // Muda cor no focus (via grupo)
      'group-focus-within:text-primary',
      hasError && 'text-status-error group-focus-within:text-status-error',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="flex flex-col gap-1.5">
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}

        {/* Input wrapper com efeito glass */}
        <div className={`group ${wrapperClasses}`}>
          {/* Ícone à esquerda */}
          {icon && (
            <span className={iconClasses} aria-hidden="true">
              {icon}
            </span>
          )}

          {/* Campo de entrada */}
          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={errorId ?? helperId}
            className={inputClasses}
            {...props}
          />
        </div>

        {/* Mensagem de erro */}
        {error && (
          <span
            id={errorId}
            role="alert"
            className="text-xs text-status-error"
          >
            {error}
          </span>
        )}

        {/* Texto de ajuda (apenas se não houver erro) */}
        {helperText && !error && (
          <span
            id={helperId}
            className="text-xs text-text-tertiary"
          >
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
