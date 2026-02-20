/**
 * Seletor de Tipo de Captura - Design Glassmorfismo
 *
 * Cards de seleção para Screenshot e Vídeo com:
 * - Layout: ícone ao lado do título na mesma linha
 * - Descrição e badges abaixo
 * - Altura fixa para consistência visual
 * - Efeito glassmorfismo e borda verde quando selecionado
 *
 * @module CaptureTypeSelector
 */

import React from 'react';
import { useI18n } from '../../lib/i18n';
import type { CaptureType } from '../../types/capture.types';

/** Props do componente CaptureTypeSelector */
interface CaptureTypeSelectorProps {
  /** Tipo de captura selecionado (null = nenhum selecionado) */
  value: CaptureType | null;
  /** Callback ao mudar seleção */
  onChange: (type: CaptureType) => void;
  /** Se está desabilitado */
  disabled?: boolean;
}

/** Configuração de cada tipo de captura */
interface CaptureTypeConfig {
  type: CaptureType;
  title: string;
  description: string;
  icon: React.ReactNode;
}

/** Altura fixa dos cards para consistência visual */
const CARD_HEIGHT = '148px';

/**
 * Ícone de Screenshot (tela/monitor)
 */
function ScreenshotIcon({ isSelected }: { isSelected: boolean }): React.ReactElement {
  return (
    <div
      style={{
        width: '44px',
        height: '44px',
        minWidth: '44px',
        borderRadius: '10px',
        background: isSelected
          ? 'linear-gradient(135deg, rgba(0, 222, 165, 0.3), rgba(0, 153, 120, 0.2))'
          : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${isSelected ? 'rgba(0, 222, 165, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isSelected ? 'var(--green-bright)' : 'var(--text-secondary)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="7" y1="8" x2="17" y2="8" />
        <line x1="7" y1="12" x2="13" y2="12" />
      </svg>
    </div>
  );
}

/**
 * Ícone de Vídeo (câmera de vídeo)
 */
function VideoIcon({ isSelected }: { isSelected: boolean }): React.ReactElement {
  return (
    <div
      style={{
        width: '44px',
        height: '44px',
        minWidth: '44px',
        borderRadius: '10px',
        background: isSelected
          ? 'linear-gradient(135deg, rgba(0, 222, 165, 0.3), rgba(0, 153, 120, 0.2))'
          : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${isSelected ? 'rgba(0, 222, 165, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isSelected ? 'var(--green-bright)' : 'var(--text-secondary)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="6" width="14" height="12" rx="2" />
        <polygon points="22 8 16 12 22 16 22 8" />
      </svg>
    </div>
  );
}

/**
 * Card de tipo de captura com glassmorfismo
 * Layout: ícone ao lado do título, descrição e badges abaixo
 * Altura fixa para consistência entre os cards
 */
function CaptureCard({
  config,
  isSelected,
  onClick,
  disabled,
}: {
  config: CaptureTypeConfig;
  isSelected: boolean;
  onClick: () => void;
  disabled: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        height: CARD_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '16px',
        borderRadius: '16px',
        border: `2px solid ${isSelected ? 'var(--green-bright)' : 'rgba(255, 255, 255, 0.08)'}`,
        background: isSelected
          ? 'rgba(0, 222, 165, 0.08)'
          : 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        textAlign: 'left',
        boxShadow: isSelected
          ? '0 0 30px rgba(0, 222, 165, 0.15), inset 0 0 0 1px rgba(0, 222, 165, 0.1)'
          : '0 4px 20px rgba(0, 0, 0, 0.2)',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isSelected) {
          e.currentTarget.style.borderColor = 'rgba(0, 222, 165, 0.4)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !isSelected) {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        }
      }}
    >
      {/* Linha superior: ícone + título */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {config.icon}
        <h3
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {config.title}
        </h3>
      </div>

      {/* Descrição */}
      <p
        style={{
          margin: 0,
          fontSize: '13px',
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
          flex: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {config.description}
      </p>
    </button>
  );
}

/**
 * Seletor de tipo de captura com design glassmorfismo
 */
export function CaptureTypeSelector({
  value,
  onChange,
  disabled = false,
}: CaptureTypeSelectorProps): React.ReactElement {
  const { t } = useI18n();

  const captureTypes: CaptureTypeConfig[] = [
    {
      type: 'screenshot',
      title: t.capture.screenshot,
      description: t.capture.screenshotDescription,
      icon: <ScreenshotIcon isSelected={value === 'screenshot'} />,
    },
    {
      type: 'video',
      title: t.capture.video,
      description: t.capture.videoDescription,
      icon: <VideoIcon isSelected={value === 'video'} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {captureTypes.map((config) => (
        <CaptureCard
          key={config.type}
          config={config}
          isSelected={value === config.type}
          onClick={() => onChange(config.type)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

export default CaptureTypeSelector;
