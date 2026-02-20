/**
 * Passo de Consentimento de Geolocalização (Side Panel)
 *
 * Exibe o PreCaptureScreen para solicitar consentimento de geolocalização
 * antes de iniciar a captura.
 *
 * Migrado de popup/components/CaptureWizard/StepGeolocationConsent.tsx para sidepanel.
 *
 * Requisitos atendidos:
 * - 6.4: Mostrar PreCaptureScreen quando preferência é 'ask-every-time'
 * - 6.5: Exibir explicação sobre localização para validade jurídica
 * - 6.6: Exibir checkbox "Lembrar minha escolha"
 * - 6.7: Salvar 'always-allow' quando "Lembrar" marcado e permitir
 * - 6.8: Salvar 'always-deny' quando "Lembrar" marcado e negar
 * - 6.9: Não salvar preferência quando "Lembrar" não marcado
 *
 * @module StepGeolocationConsent
 */

import React from 'react';
import { PreCaptureScreen } from '../../../../components/PreCaptureScreen';

/**
 * Props do componente StepGeolocationConsent
 */
export interface StepGeolocationConsentProps {
  /** Callback quando usuário permite geolocalização */
  onAllow: (remember: boolean) => void;
  /** Callback quando usuário nega geolocalização */
  onDeny: (remember: boolean) => void;
  /** Se está carregando (solicitando permissão) */
  isLoading?: boolean;
}

/**
 * Passo de consentimento de geolocalização no wizard de captura
 */
export function StepGeolocationConsent({
  onAllow,
  onDeny,
  isLoading = false,
}: StepGeolocationConsentProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
      }}
    >
      <PreCaptureScreen
        onAllow={onAllow}
        onDeny={onDeny}
        isLoading={isLoading}
      />
    </div>
  );
}

export default StepGeolocationConsent;
