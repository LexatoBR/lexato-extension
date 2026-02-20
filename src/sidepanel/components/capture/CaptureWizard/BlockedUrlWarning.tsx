/**
 * BlockedUrlWarning - Aviso de URL bloqueada para captura (Side Panel)
 *
 * Exibe mensagem informativa quando a URL atual não pode ser capturada.
 * Usado no CaptureWizard para informar o usuário sobre restrições.
 *
 * Migrado de popup/components/CaptureWizard/BlockedUrlWarning.tsx para sidepanel.
 *
 * @module BlockedUrlWarning
 */

import React from 'react';
import { AlertBanner } from '../../../../components/shared/AlertBanner';

/** Props do componente BlockedUrlWarning */
export interface BlockedUrlWarningProps {
  /** Motivo do bloqueio (vem de verificarUrlBloqueada) */
  motivo?: string;
}

/**
 * Componente de aviso para URLs bloqueadas
 */
export function BlockedUrlWarning({ motivo }: BlockedUrlWarningProps): React.ReactElement {
  return (
    <AlertBanner
      type="warning"
      title="Captura não disponível"
      message={motivo ?? 'Esta página não pode ser capturada'}
      hint="Navegue para uma página web comum para iniciar uma captura."
    />
  );
}

export default BlockedUrlWarning;
