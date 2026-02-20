/**
 * Wizard de Captura - Tela Única (Side Panel)
 *
 * Layout unificado:
 * 1. Título grande + seletor de tipo com descrição contextual
 * 2. Instruções em área scrollável (habilita botão ao rolar até o final)
 * 3. Checkbox de termos + botão de iniciar
 *
 * O container pai (extension-content-no-tabs) gerencia o scroll externo.
 * As instruções têm maxHeight com scroll interno próprio.
 *
 * Fluxos condicionais mantidos como telas separadas:
 * - Consentimento de geolocalização
 * - Créditos insuficientes
 * - URL bloqueada
 *
 * @module CaptureWizard
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useCapture } from '../../../hooks/useCapture';
import { useCredits } from '../../../../hooks/useCredits';
import { useCurrentTab } from '../../../hooks/useCurrentTab';
import { useGeolocationConsent } from '../../../hooks/useGeolocationConsent';
import { useAuth } from '../../../hooks/useAuth';
import { useI18n } from '../../../../lib/i18n';
import { CaptureTypeCompact } from './CaptureTypeCompact';
import { InstructionsScrollable } from './InstructionsScrollable';
import { StepGeolocationConsent } from './StepGeolocationConsent';
import { StepNoCredits } from './StepNoCredits';
import { BlockedUrlWarning } from './BlockedUrlWarning';
import { AlertBanner } from '../../../../components/shared/AlertBanner';
import { PageDescriptionHeader } from '../../../../components/shared/PageDescriptionHeader';
import { PrimaryButton } from '../../../../components/shared/PrimaryButton';
import { CameraIcon } from '../../../../components/shared/icons';
import {
  preflightVideoPermissions,
  preflightScreenshotPermissions,
  notifyServiceWorkerPermissionsGranted,
} from '../../../../lib/permissions/permission-preflight';
import type { CaptureType, StorageType } from '../../../../types/capture.types';
import type { IsolationPreview } from '../../../../types/isolation.types';

/**
 * Componente principal do Wizard de Captura - Tela Única
 */
export function CaptureWizard(): React.ReactElement {
  const { startCapture, isCapturing, error: captureError } = useCapture();
  const { credits, getStorageCost } = useCredits();
  const { podeCapturar, verificacaoUrl, isLoading: isLoadingTab } = useCurrentTab();
  const { validateSession } = useAuth();
  const { t } = useI18n();

  const {
    shouldShowPreCapture: shouldShowGeoConsent,
    handleAllow: handleGeoAllow,
    handleDeny: handleGeoDeny,
    isLoading: isGeoLoading,
    checkConsent: checkGeoConsent,
    resetFlow: resetGeoFlow,
  } = useGeolocationConsent();

  // Estado do wizard
  const [captureType, setCaptureType] = useState<CaptureType | null>(null);
  const [storageType] = useState<StorageType>('standard');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [hasReadInstructions, setHasReadInstructions] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Fluxos condicionais
  const [showGeolocationConsent, setShowGeolocationConsent] = useState(false);
  const [showNoCredits, setShowNoCredits] = useState(false);
  const [geolocationProcessed, setGeolocationProcessed] = useState(false);

  // Preview de isolamento
  const [isolationPreview, setIsolationPreview] = useState<IsolationPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);

  /** Carrega preview de isolamento ao montar */
  useEffect(() => {
    const loadIsolationPreview = async () => {
      try {
        setIsLoadingPreview(true);
        const response = await chrome.runtime.sendMessage({ type: 'PREVIEW_ISOLATION' });
        if (response?.success && response.data) {
          setIsolationPreview(response.data as IsolationPreview);
        }
      } catch (err) {
        console.error('[CaptureWizard] Erro ao carregar preview de isolamento:', err);
      } finally {
        setIsLoadingPreview(false);
      }
    };
    loadIsolationPreview();
  }, []);

  /** Reseta estado quando muda o tipo de captura */
  useEffect(() => {
    setHasReadInstructions(false);
    setAcceptedTerms(false);
  }, [captureType]);

  /** Botão habilitado: tipo + instruções lidas + termos aceitos */
  const canStart = captureType !== null
    && hasReadInstructions
    && acceptedTerms
    && !isCapturing
    && !isStarting;

  const displayError = localError ?? captureError;

  /** Inicia a captura */
  const handleStartCapture = useCallback(async () => {
    setLocalError(null);

    // Validar sessão ANTES de qualquer operação de captura
    // Evita que o erro de sessão expirada apareça no final do processo
    const sessionValid = await validateSession();
    if (!sessionValid) {
      // validateSession já limpa o estado e redireciona para login
      return;
    }

    if (!captureType) {
      setLocalError('Selecione um tipo de captura');
      return;
    }

    if (!hasReadInstructions || !acceptedTerms) {
      setLocalError('Leia todas as instruções e aceite os termos de uso');
      return;
    }

    const cost = getStorageCost(storageType);
    if (credits < cost) {
      setShowNoCredits(true);
      return;
    }

    if (!geolocationProcessed) {
      await checkGeoConsent();
      if (shouldShowGeoConsent) {
        setShowGeolocationConsent(true);
        return;
      }
      setGeolocationProcessed(true);
    }

    setIsStarting(true);
    try {
      // Solicitar permissões opcionais ANTES de iniciar a captura
      // Deve ocorrer dentro do handler de clique (user gesture obrigatório)
      const preflightResult = captureType === 'video'
        ? await preflightVideoPermissions()
        : await preflightScreenshotPermissions();

      if (!preflightResult.allGranted) {
        const negadas = preflightResult.denied.join(', ');
        setLocalError(`Permissões necessárias foram recusadas: ${negadas}. Autorize para continuar.`);
        setIsStarting(false);
        return;
      }

      // Notificar o Service Worker sobre permissões concedidas
      await notifyServiceWorkerPermissionsGranted(preflightResult.granted);

      await startCapture(captureType, storageType);
    } catch (err) {
      console.error('[CaptureWizard] Erro ao iniciar captura:', err);
      setLocalError(err instanceof Error ? err.message : 'Erro ao iniciar captura');
    } finally {
      setIsStarting(false);
    }
  }, [
    captureType, hasReadInstructions, acceptedTerms, storageType,
    credits, getStorageCost, geolocationProcessed,
    checkGeoConsent, shouldShowGeoConsent, startCapture, validateSession,
  ]);

  /** Inicia captura após consentimento de geolocalização */
  const proceedWithCapture = useCallback(async () => {
    if (!captureType) {
      return;
    }
    setIsStarting(true);
    try {
      // Solicitar permissões opcionais ANTES de iniciar a captura
      const preflightResult = captureType === 'video'
        ? await preflightVideoPermissions()
        : await preflightScreenshotPermissions();

      if (!preflightResult.allGranted) {
        const negadas = preflightResult.denied.join(', ');
        setLocalError(`Permissões necessárias foram recusadas: ${negadas}. Autorize para continuar.`);
        setIsStarting(false);
        return;
      }

      await notifyServiceWorkerPermissionsGranted(preflightResult.granted);

      await startCapture(captureType, storageType);
    } catch (err) {
      console.error('[CaptureWizard] Erro ao iniciar captura:', err);
      setLocalError(err instanceof Error ? err.message : 'Erro ao iniciar captura');
    } finally {
      setIsStarting(false);
    }
  }, [captureType, storageType, startCapture]);

  const handleGeoAllowAndContinue = useCallback(async (remember: boolean) => {
    await handleGeoAllow(remember);
    setShowGeolocationConsent(false);
    setGeolocationProcessed(true);
    await proceedWithCapture();
  }, [handleGeoAllow, proceedWithCapture]);

  const handleGeoDenyAndContinue = useCallback((remember: boolean) => {
    handleGeoDeny(remember);
    setShowGeolocationConsent(false);
    setGeolocationProcessed(true);
    proceedWithCapture();
  }, [handleGeoDeny, proceedWithCapture]);

  const handleBackFromNoCredits = useCallback(() => {
    setShowNoCredits(false);
  }, []);

  const handleBackFromGeo = useCallback(() => {
    setShowGeolocationConsent(false);
    resetGeoFlow();
  }, [resetGeoFlow]);

  // ========================================================================
  // Telas condicionais
  // ========================================================================

  if (!isLoadingTab && !podeCapturar) {
    return (
      <div style={containerStyle}>
        <BlockedUrlWarning {...(verificacaoUrl.motivo ? { motivo: verificacaoUrl.motivo } : {})} />
      </div>
    );
  }

  if (showNoCredits) {
    return (
      <div style={containerStyle}>
        <StepNoCredits credits={credits} onBack={handleBackFromNoCredits} />
      </div>
    );
  }

  if (showGeolocationConsent) {
    return (
      <div style={containerStyle}>
        <StepGeolocationConsent
          onAllow={handleGeoAllowAndContinue}
          onDeny={handleGeoDenyAndContinue}
          isLoading={isGeoLoading}
        />
        <button
          type="button"
          onClick={handleBackFromGeo}
          disabled={isGeoLoading}
          style={backButtonStyle(isGeoLoading)}
        >
          Voltar
        </button>
      </div>
    );
  }

  // ========================================================================
  // Tela principal unificada
  // ========================================================================

  return (
    <div style={containerStyle}>
      {/* Título padrão da página */}
      <PageDescriptionHeader
        title={t.capture.title}
        subtitle={t.capture.subtitle}
        icon={<CameraIcon size={20} />}
      />

      {/* Erro */}
      {displayError && (
        <AlertBanner type="error" title="Erro" message={displayError} />
      )}

      {/* 1. Seletor de tipo com descrição */}
      <CaptureTypeCompact
        value={captureType}
        onChange={setCaptureType}
        disabled={isCapturing || isStarting}
      />

      {/* 2. Instruções scrolláveis (aparece após selecionar tipo) */}
      {captureType && (
        <InstructionsScrollable
          captureType={captureType}
          storageType={storageType}
          isolationPreview={isolationPreview}
          isLoadingPreview={isLoadingPreview}
          onReadComplete={setHasReadInstructions}
          hasRead={hasReadInstructions}
        />
      )}

      {/* 3. Rodapé: checkbox + botão (aparece após selecionar tipo) */}
      {captureType && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {/* Checkbox de aceite */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              cursor: hasReadInstructions ? 'pointer' : 'not-allowed',
              opacity: hasReadInstructions ? 1 : 0.4,
              transition: 'opacity 0.3s ease',
            }}
          >
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              disabled={!hasReadInstructions}
              style={{
                width: '16px',
                height: '16px',
                marginTop: '2px',
                accentColor: 'var(--green-bright)',
                cursor: hasReadInstructions ? 'pointer' : 'not-allowed',
              }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Li e compreendi as instruções e aceito os{' '}
              <a
                href="https://lexato.com.br/termos-de-uso"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--green-bright)', textDecoration: 'none', fontWeight: 500 }}
                onClick={(e) => e.stopPropagation()}
              >
                Termos de Uso
              </a>
            </span>
          </label>

          {/* Botão de iniciar */}
          <PrimaryButton
            onClick={handleStartCapture}
            disabled={!canStart}
            loading={isStarting}
            fullWidth
            showArrow={false}
          >
            Iniciar Captura
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

/** Estilo do container principal */
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  gap: '14px',
};

/** Estilo do botão voltar */
function backButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px',
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary)',
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    textDecoration: 'underline',
    alignSelf: 'center',
  };
}

export default CaptureWizard;
