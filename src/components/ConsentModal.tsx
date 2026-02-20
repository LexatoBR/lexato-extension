/**
 * Componente ConsentModal - Modal de Consentimento LGPD/GDPR
 *
 * Exibe modal para consentimento granular de coleta de dados opcionais.
 * Mostra dados sempre coletados e permite escolher dados opcionais.
 *
 * Funcionalidades:
 * - Seção de dados sempre coletados (informativos)
 * - Checkboxes para dados opcionais (fingerprints)
 * - Botões: "Aceitar Selecionados", "Aceitar Todos", "Recusar Opcionais"
 *
 * @requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 * @module ConsentModal
 */

import React, { useState, useCallback } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import type { ForensicConsentConfig } from '../types/forensic-metadata.types';
import { DEFAULT_CONSENT_CONFIG } from '../types/forensic-metadata.types';

/**
 * Props do componente ConsentModal
 */
export interface ConsentModalProps {
  /**
   * Se o modal está visível
   */
  isOpen: boolean;

  /**
   * Callback quando usuário confirma seleção
   * @param config - Configuração de consentimento selecionada
   */
  onConfirm: (config: ForensicConsentConfig) => void;

  /**
   * Callback quando usuário fecha o modal sem confirmar
   */
  onClose?: () => void;

  /**
   * Configuração inicial (para edição)
   */
  initialConfig?: ForensicConsentConfig;
}

/**
 * Descrição de um campo de dados
 */
interface DataFieldDescription {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

/**
 * Ícone de check
 */
const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
  </svg>
);

/**
 * Ícone de localização
 */
const LocationIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

/**
 * Ícone de fingerprint
 */
const FingerprintIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28zM3.5 9.72c-.1 0-.2-.03-.29-.09-.23-.16-.28-.47-.12-.7.99-1.4 2.25-2.5 3.75-3.27C9.98 4.04 14 4.03 17.15 5.65c1.5.77 2.76 1.86 3.75 3.25.16.22.11.54-.12.7-.23.16-.54.11-.7-.12-.9-1.26-2.04-2.25-3.39-2.94-2.87-1.47-6.54-1.47-9.4.01-1.36.7-2.5 1.7-3.4 2.96-.08.14-.23.21-.39.21zm6.25 12.07c-.13 0-.26-.05-.35-.15-.87-.87-1.34-1.43-2.01-2.64-.69-1.23-1.05-2.73-1.05-4.34 0-2.97 2.54-5.39 5.66-5.39s5.66 2.42 5.66 5.39c0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-2.42-2.09-4.39-4.66-4.39-2.57 0-4.66 1.97-4.66 4.39 0 1.44.32 2.77.93 3.85.64 1.15 1.08 1.64 1.85 2.42.19.2.19.51 0 .71-.11.1-.24.15-.37.15zm7.17-1.85c-1.19 0-2.24-.3-3.1-.89-1.49-1.01-2.38-2.65-2.38-4.39 0-.28.22-.5.5-.5s.5.22.5.5c0 1.41.72 2.74 1.94 3.56.71.48 1.54.71 2.54.71.24 0 .64-.03 1.04-.1.27-.05.53.13.58.41.05.27-.13.53-.41.58-.57.11-1.07.12-1.21.12zM14.91 22c-.04 0-.09-.01-.13-.02-1.59-.44-2.63-1.03-3.72-2.1-1.4-1.39-2.17-3.24-2.17-5.22 0-1.62 1.38-2.94 3.08-2.94 1.7 0 3.08 1.32 3.08 2.94 0 1.07.93 1.94 2.08 1.94s2.08-.87 2.08-1.94c0-3.77-3.25-6.83-7.25-6.83-2.84 0-5.44 1.58-6.61 4.03-.39.81-.59 1.76-.59 2.8 0 .78.07 2.01.67 3.61.1.26-.03.55-.29.64-.26.1-.55-.04-.64-.29-.49-1.31-.73-2.61-.73-3.96 0-1.2.23-2.29.68-3.24 1.33-2.79 4.28-4.6 7.51-4.6 4.55 0 8.25 3.51 8.25 7.83 0 1.62-1.38 2.94-3.08 2.94s-3.08-1.32-3.08-2.94c0-1.07-.93-1.94-2.08-1.94s-2.08.87-2.08 1.94c0 1.71.66 3.31 1.87 4.51.95.94 1.86 1.46 3.27 1.85.27.07.42.35.35.61-.05.23-.26.38-.47.38z" />
  </svg>
);

/**
 * Ícone de relógio
 */
const ClockIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
  </svg>
);

/**
 * Ícone de link/URL
 */
const LinkIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
  </svg>
);

/**
 * Ícone de rede/wifi
 */
const NetworkIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" />
  </svg>
);

/**
 * Ícone de dispositivo
 */
const DeviceIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" />
  </svg>
);

/**
 * Ícone de globo/mundo
 */
const GlobeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
  </svg>
);

/**
 * Ícone de canvas/imagem
 */
const CanvasIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
  </svg>
);

/**
 * Ícone de WebGL/3D
 */
const WebGLIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z" />
  </svg>
);

/**
 * Ícone de fontes/texto
 */
const FontsIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.93 13.5h4.14L12 7.98 9.93 13.5zM20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4.05 16.5l-1.14-3H9.17l-1.12 3H5.96l5.11-13h1.86l5.11 13h-2.09z" />
  </svg>
);

/**
 * Dados sempre coletados (informativos)
 */
const ALWAYS_COLLECTED_DATA: DataFieldDescription[] = [
  {
    id: 'timestamp',
    label: 'Data e hora',
    description: 'Timestamp preciso da captura',
    icon: <ClockIcon className="w-4 h-4" />,
  },
  {
    id: 'url',
    label: 'URL da página',
    description: 'Endereço completo da página capturada',
    icon: <LinkIcon className="w-4 h-4" />,
  },
  {
    id: 'cloudfront',
    label: 'Localização aproximada',
    description: 'País e cidade baseados no seu IP',
    icon: <GlobeIcon className="w-4 h-4" />,
  },
  {
    id: 'network',
    label: 'Tipo de conexão',
    description: 'Informações básicas de rede',
    icon: <NetworkIcon className="w-4 h-4" />,
  },
  {
    id: 'device',
    label: 'Dispositivo básico',
    description: 'Sistema operacional e navegador',
    icon: <DeviceIcon className="w-4 h-4" />,
  },
];

/**
 * Dados opcionais (requerem consentimento)
 */
interface OptionalDataField extends DataFieldDescription {
  configKey: keyof Pick<
    ForensicConsentConfig,
    | 'collectBrowserGeolocation'
    | 'collectCanvasFingerprint'
    | 'collectWebGLFingerprint'
    | 'collectFontsFingerprint'
  >;
}

const OPTIONAL_DATA_FIELDS: OptionalDataField[] = [
  {
    id: 'browserGeolocation',
    configKey: 'collectBrowserGeolocation',
    label: 'Localização GPS precisa',
    description: 'Coordenadas exatas via GPS ou rede Wi-Fi',
    icon: <LocationIcon className="w-4 h-4" />,
  },
  {
    id: 'canvasFingerprint',
    configKey: 'collectCanvasFingerprint',
    label: 'Fingerprint de Canvas',
    description: 'Identificador único baseado em renderização gráfica',
    icon: <CanvasIcon className="w-4 h-4" />,
  },
  {
    id: 'webglFingerprint',
    configKey: 'collectWebGLFingerprint',
    label: 'Fingerprint de WebGL',
    description: 'Identificador baseado em capacidades 3D do dispositivo',
    icon: <WebGLIcon className="w-4 h-4" />,
  },
  {
    id: 'fontsFingerprint',
    configKey: 'collectFontsFingerprint',
    label: 'Fingerprint de Fontes',
    description: 'Identificador baseado em fontes instaladas',
    icon: <FontsIcon className="w-4 h-4" />,
  },
];

/**
 * Modal de consentimento LGPD/GDPR
 *
 * Permite ao usuário escolher quais dados opcionais serão coletados
 * durante a captura de provas digitais.
 *
 * @example
 * ```tsx
 * <ConsentModal
 *   isOpen={showConsentModal}
 *   onConfirm={(config) => {
 *     saveConsentConfig(config);
 *     setShowConsentModal(false);
 *   }}
 *   onClose={() => setShowConsentModal(false)}
 * />
 * ```
 */
export const ConsentModal: React.FC<ConsentModalProps> = ({
  isOpen,
  onConfirm,
  onClose,
  initialConfig,
}) => {
  // Estado local para checkboxes opcionais
  const [optionalConfig, setOptionalConfig] = useState<
    Pick<
      ForensicConsentConfig,
      | 'collectBrowserGeolocation'
      | 'collectCanvasFingerprint'
      | 'collectWebGLFingerprint'
      | 'collectFontsFingerprint'
    >
  >({
    collectBrowserGeolocation: initialConfig?.collectBrowserGeolocation ?? false,
    collectCanvasFingerprint: initialConfig?.collectCanvasFingerprint ?? false,
    collectWebGLFingerprint: initialConfig?.collectWebGLFingerprint ?? false,
    collectFontsFingerprint: initialConfig?.collectFontsFingerprint ?? false,
  });

  /**
   * Atualiza um campo opcional
   */
  const toggleOptionalField = useCallback(
    (key: keyof typeof optionalConfig) => {
      setOptionalConfig((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    []
  );

  /**
   * Aceitar selecionados
   */
  const handleAcceptSelected = useCallback(() => {
    const config: ForensicConsentConfig = {
      ...DEFAULT_CONSENT_CONFIG,
      ...optionalConfig,
    };
    onConfirm(config);
  }, [optionalConfig, onConfirm]);

  /**
   * Aceitar todos
   */
  const handleAcceptAll = useCallback(() => {
    const config: ForensicConsentConfig = {
      ...DEFAULT_CONSENT_CONFIG,
      collectBrowserGeolocation: true,
      collectCanvasFingerprint: true,
      collectWebGLFingerprint: true,
      collectFontsFingerprint: true,
    };
    onConfirm(config);
  }, [onConfirm]);

  /**
   * Recusar opcionais
   */
  const handleDenyOptional = useCallback(() => {
    onConfirm(DEFAULT_CONSENT_CONFIG);
  }, [onConfirm]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
    >
      <Card variant="default" className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[rgba(0,222,165,0.15)]">
              <FingerprintIcon className="w-5 h-5 text-primary" />
            </div>
            <h2 id="consent-modal-title" className="text-lg font-semibold text-text-primary">
              Configurar Coleta de Dados
            </h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-text-tertiary hover:text-text-primary 
                         hover:bg-glass-bgLight transition-colors"
              aria-label="Fechar modal"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
              </svg>
            </button>
          )}
        </div>

        {/* Seção: Dados sempre coletados */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-primary" />
            Dados sempre coletados
          </h3>
          <p className="text-xs text-text-tertiary mb-3">
            Estes dados são necessários para a validade jurídica da prova e são coletados automaticamente.
          </p>
          <div className="space-y-2">
            {ALWAYS_COLLECTED_DATA.map((field) => (
              <div
                key={field.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-glass-bgLight border border-glass-border"
              >
                <div className="p-1.5 rounded-md bg-[rgba(0,222,165,0.1)] text-primary">
                  {field.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{field.label}</p>
                  <p className="text-xs text-text-tertiary">{field.description}</p>
                </div>
                <CheckIcon className="w-4 h-4 text-primary shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Seção: Dados opcionais */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-secondary mb-3">
            Dados opcionais (requerem consentimento)
          </h3>
          <p className="text-xs text-text-tertiary mb-3">
            Estes dados aumentam a força probatória mas são opcionais. Você pode escolher quais permitir.
          </p>
          <div className="space-y-2">
            {OPTIONAL_DATA_FIELDS.map((field) => (
              <label
                key={field.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  optionalConfig[field.configKey]
                    ? 'bg-[rgba(0,222,165,0.05)] border-[rgba(0,222,165,0.3)]'
                    : 'bg-glass-bgLight border-glass-border hover:border-glass-borderActive'
                }`}
              >
                <input
                  type="checkbox"
                  checked={optionalConfig[field.configKey]}
                  onChange={() => toggleOptionalField(field.configKey)}
                  className="w-4 h-4 rounded border-glass-border bg-glass-bgLight 
                             text-primary focus:ring-primary focus:ring-offset-0
                             accent-primary cursor-pointer"
                />
                <div className="p-1.5 rounded-md bg-glass-bgLight text-text-secondary">
                  {field.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{field.label}</p>
                  <p className="text-xs text-text-tertiary">{field.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Botões de ação */}
        <div className="space-y-3">
          <Button
            variant="primary"
            size="lg"
            onClick={handleAcceptSelected}
            className="w-full"
          >
            Aceitar Selecionados
          </Button>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={handleAcceptAll}
              className="flex-1"
            >
              Aceitar Todos
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={handleDenyOptional}
              className="flex-1"
            >
              Recusar Opcionais
            </Button>
          </div>
        </div>

        {/* Texto de privacidade */}
        <p className="text-xs text-text-muted text-center mt-4">
          Você pode alterar estas preferências a qualquer momento nas configurações da extensão.
        </p>
      </Card>
    </div>
  );
};

ConsentModal.displayName = 'ConsentModal';

export default ConsentModal;
