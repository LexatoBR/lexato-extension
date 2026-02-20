/**
 * AlertBanner - Componente de alerta reutilizável
 *
 * Exibe mensagens de aviso, erro ou informação com estilo consistente.
 * Suporta título, mensagem principal e dica opcional.
 *
 * @module AlertBanner
 */

import React from 'react';
import { WarningIcon, ErrorIcon, InfoIcon } from './icons';

/** Tipos de alerta suportados */
export type AlertType = 'warning' | 'error' | 'info';

/** Props do componente AlertBanner */
export interface AlertBannerProps {
  /** Tipo do alerta (define cor e ícone) */
  type: AlertType;
  /** Título do alerta */
  title: string;
  /** Mensagem principal */
  message: string;
  /** Dica ou instrução adicional (opcional) */
  hint?: string;
  /** Classes CSS adicionais */
  className?: string;
}

/**
 * Configuração de estilos por tipo de alerta
 */
const ALERT_STYLES: Record<AlertType, { color: string; bgColor: string; borderColor: string }> = {
  warning: {
    color: '#FFC107',
    bgColor: 'rgba(255, 193, 7, 0.1)',
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  error: {
    color: 'var(--color-error, #EF5350)',
    bgColor: 'rgba(239, 83, 80, 0.1)',
    borderColor: 'rgba(239, 83, 80, 0.3)',
  },
  info: {
    color: 'var(--color-info, #2196F3)',
    bgColor: 'rgba(33, 150, 243, 0.1)',
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
};

/**
 * Retorna o ícone apropriado para o tipo de alerta
 */
function getAlertIcon(type: AlertType, color: string): React.ReactElement {
  const iconProps = { size: 20, style: { color, flexShrink: 0 } };

  switch (type) {
    case 'warning':
      return <WarningIcon {...iconProps} />;
    case 'error':
      return <ErrorIcon {...iconProps} />;
    case 'info':
      return <InfoIcon {...iconProps} />;
  }
}

/**
 * Componente de banner de alerta reutilizável
 */
export function AlertBanner({
  type,
  title,
  message,
  hint,
  className,
}: AlertBannerProps): React.ReactElement {
  const styles = ALERT_STYLES[type];

  return (
    <div
      className={className}
      style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: styles.bgColor,
        border: `1px solid ${styles.borderColor}`,
        color: 'var(--text-primary)',
        fontSize: '14px',
      }}
    >
      {/* Cabeçalho com ícone e título */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-2)',
        }}
      >
        {getAlertIcon(type, styles.color)}
        <span style={{ fontWeight: 600, color: styles.color }}>{title}</span>
      </div>

      {/* Mensagem principal */}
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>{message}</p>

      {/* Dica opcional */}
      {hint && (
        <p
          style={{
            margin: 'var(--space-2) 0 0',
            color: 'var(--text-tertiary)',
            fontSize: '12px',
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export default AlertBanner;
