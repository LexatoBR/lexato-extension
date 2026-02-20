/**
 * Componente PreCaptureScreen - Tela de Pré-Captura para Geolocalização
 *
 * Exibe explicação sobre localização para validade jurídica e permite
 * ao usuário escolher se deseja permitir geolocalização precisa.
 *
 * Funcionalidades:
 * - Explicação sobre benefício da localização precisa
 * - Checkbox "Lembrar minha escolha"
 * - Botões "Permitir Localização" e "Continuar sem"
 *
 * @requirements 6.5, 6.6
 * @module PreCaptureScreen
 */

import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

/**
 * Props do componente PreCaptureScreen
 */
export interface PreCaptureScreenProps {
  /**
   * Callback quando usuário permite localização
   * @param remember - Se deve lembrar a escolha
   */
  onAllow: (remember: boolean) => void;

  /**
   * Callback quando usuário nega localização
   * @param remember - Se deve lembrar a escolha
   */
  onDeny: (remember: boolean) => void;

  /**
   * Se está carregando (solicitando permissão)
   */
  isLoading?: boolean;
}

/**
 * Ícone de localização
 */
const LocationIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

/**
 * Ícone de escudo/segurança
 */
const ShieldIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
  </svg>
);

/**
 * Ícone de informação
 */
const InfoIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
  </svg>
);

/**
 * Tela de pré-captura para consentimento de geolocalização
 *
 * Exibe antes de iniciar a captura quando a preferência é 'ask-every-time'.
 * Permite ao usuário decidir se quer compartilhar localização precisa
 * e opcionalmente lembrar a escolha para próximas capturas.
 *
 * @example
 * ```tsx
 * <PreCaptureScreen
 *   onAllow={(remember) => {
 *     if (remember) savePreference('always-allow');
 *     requestGeolocation();
 *   }}
 *   onDeny={(remember) => {
 *     if (remember) savePreference('always-deny');
 *     proceedWithoutGeolocation();
 *   }}
 * />
 * ```
 */
export const PreCaptureScreen: React.FC<PreCaptureScreenProps> = ({
  onAllow,
  onDeny,
  isLoading = false,
}) => {
  const [rememberChoice, setRememberChoice] = useState(false);

  /**
   * Handler para permitir localização
   */
  const handleAllow = () => {
    onAllow(rememberChoice);
  };

  /**
   * Handler para negar localização
   */
  const handleDeny = () => {
    onDeny(rememberChoice);
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 min-h-[400px]">
      <Card variant="default" className="max-w-md w-full">
        {/* Header com ícone */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-3 rounded-full bg-[rgba(0,222,165,0.15)] mb-4">
            <LocationIcon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Localização para Validade Jurídica
          </h2>
        </div>

        {/* Explicação principal */}
        <div className="space-y-4 mb-6">
          <p className="text-sm text-text-secondary text-center">
            Para fortalecer a validade jurídica da sua prova, permita acesso à sua 
            localização precisa.
          </p>

          {/* Benefícios */}
          <div className="bg-[rgba(0,222,165,0.05)] rounded-lg p-4 border border-[rgba(0,222,165,0.2)]">
            <div className="flex items-start gap-3">
              <ShieldIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">
                  Maior força probatória
                </p>
                <p className="text-xs text-text-secondary">
                  Coordenadas GPS precisas comprovam onde a captura foi realizada, 
                  aumentando a credibilidade da prova em processos judiciais.
                </p>
              </div>
            </div>
          </div>

          {/* Aviso sobre alternativa */}
          <div className="bg-glass-bgLight rounded-lg p-4 border border-glass-border">
            <div className="flex items-start gap-3">
              <InfoIcon className="w-5 h-5 text-text-tertiary shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary">
                Sem permissão, usaremos localização aproximada (cidade) baseada no seu IP. 
                A prova ainda será válida, mas com menor precisão geográfica.
              </p>
            </div>
          </div>
        </div>

        {/* Checkbox "Lembrar minha escolha" */}
        <label className="flex items-center gap-3 mb-6 cursor-pointer group">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
            className="w-4 h-4 rounded border-glass-border bg-glass-bgLight 
                       text-primary focus:ring-primary focus:ring-offset-0
                       accent-primary cursor-pointer"
            aria-describedby="remember-description"
          />
          <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
            Lembrar minha escolha para próximas capturas
          </span>
        </label>

        {/* Botões de ação */}
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={handleAllow}
            loading={isLoading}
            disabled={isLoading}
            className="w-full"
            aria-label="Permitir acesso à localização precisa"
          >
            <LocationIcon className="w-5 h-5" />
            Permitir Localização
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={handleDeny}
            disabled={isLoading}
            className="w-full"
            aria-label="Continuar sem localização precisa"
          >
            Continuar sem
          </Button>
        </div>

        {/* Texto de privacidade */}
        <p className="text-xs text-text-muted text-center mt-4">
          Sua localização é usada apenas para metadados forenses e não é 
          compartilhada com terceiros.
        </p>
      </Card>
    </div>
  );
};

PreCaptureScreen.displayName = 'PreCaptureScreen';

export default PreCaptureScreen;
