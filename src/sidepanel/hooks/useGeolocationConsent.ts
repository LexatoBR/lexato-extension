/**
 * Hook de Consentimento de Geolocalização para Captura
 *
 * Gerencia o fluxo de consentimento de geolocalização antes da captura.
 * Verifica preferências salvas e determina se deve mostrar PreCaptureScreen.
 *
 * Requisitos atendidos:
 * - 6.1: Verificar preferência salva antes de iniciar captura
 * - 6.2: Se 'always-allow', solicitar geolocalização e prosseguir
 * - 6.3: Se 'always-deny', prosseguir apenas com CloudFront
 * - 6.4: Se 'ask-every-time' ou não definido, mostrar PreCaptureScreen
 * - 6.7: Salvar preferência 'always-allow' quando "Lembrar" marcado
 * - 6.8: Salvar preferência 'always-deny' quando "Lembrar" marcado
 * - 6.9: Não salvar preferência quando "Lembrar" não marcado
 *
 * @module useGeolocationConsent
 */

import { useState, useCallback } from 'react';
import { loggers } from '../../lib/logger';
import {
  useGeolocationPreferences,
  type GeolocationChoice,
} from '../../store/geolocation-preferences';
import { useConsentStore } from '../../store/consent-store';

const log = loggers.sidePanel.withPrefix('[useGeolocationConsent]');

/**
 * Estado do fluxo de consentimento
 */
export type ConsentFlowState =
  | 'checking'
  | 'show-prompt'
  | 'requesting-geolocation'
  | 'ready-with-geolocation'
  | 'ready-without-geolocation';

/**
 * Retorno do hook useGeolocationConsent
 */
export interface UseGeolocationConsentReturn {
  /** Estado atual do fluxo de consentimento */
  flowState: ConsentFlowState;
  /** Se deve mostrar o PreCaptureScreen */
  shouldShowPreCapture: boolean;
  /** Se está carregando */
  isLoading: boolean;
  /** Erro, se houver */
  error: string | null;
  /** Preferência atual de geolocalização */
  currentPreference: GeolocationChoice;
  /** Handler quando usuário permite geolocalização */
  handleAllow: (remember: boolean) => Promise<void>;
  /** Handler quando usuário nega geolocalização */
  handleDeny: (remember: boolean) => void;
  /** Inicia o fluxo de verificação de consentimento */
  checkConsent: () => Promise<void>;
  /** Reseta o estado do fluxo */
  resetFlow: () => void;
  /** Se geolocalização precisa está habilitada para esta captura */
  isGeolocationEnabled: boolean;
}

/**
 * Hook de consentimento de geolocalização
 *
 * Gerencia o fluxo completo de consentimento antes da captura:
 * 1. Verifica preferência salva
 * 2. Se necessário, mostra PreCaptureScreen
 * 3. Processa escolha do usuário
 * 4. Salva preferência se "Lembrar" marcado
 */
export function useGeolocationConsent(): UseGeolocationConsentReturn {
  const {
    choice: currentPreference,
    setChoice,
    isHydrated,
  } = useGeolocationPreferences();

  const { setConfig, config: consentConfig } = useConsentStore();

  const [flowState, setFlowState] = useState<ConsentFlowState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [isGeolocationEnabled, setIsGeolocationEnabled] = useState(false);

  const shouldShowPreCapture = flowState === 'show-prompt';
  const isLoading = flowState === 'checking' || flowState === 'requesting-geolocation';

  /**
   * Solicita geolocalização do navegador via service worker
   */
  const requestBrowserGeolocation = useCallback(async (): Promise<boolean> => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_GEOLOCATION',
      });

      if (response?.success) {
        return true;
      }

      log.warn('Geolocalização não disponível', { error: response?.error });
      return false;
    } catch (err) {
      log.error('Erro ao solicitar geolocalização', err);
      return false;
    }
  }, []);

  /**
   * Verifica preferência e determina próximo estado
   */
  const checkConsent = useCallback(async (): Promise<void> => {
    log.debug('Verificando consentimento', {
      preferência: currentPreference,
      storeHidratado: isHydrated
    });

    setError(null);
    setFlowState('checking');

    if (!isHydrated) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    switch (currentPreference) {
      case 'always-allow': {
        setFlowState('requesting-geolocation');

        const geoSuccess = await requestBrowserGeolocation();
        setIsGeolocationEnabled(geoSuccess);

        setConfig({
          ...consentConfig,
          collectBrowserGeolocation: geoSuccess,
        });

        setFlowState(geoSuccess ? 'ready-with-geolocation' : 'ready-without-geolocation');
        break;
      }

      case 'always-deny':
        setIsGeolocationEnabled(false);

        setConfig({
          ...consentConfig,
          collectBrowserGeolocation: false,
        });

        setFlowState('ready-without-geolocation');
        break;

      case 'ask-every-time':
      default:
        setFlowState('show-prompt');
        break;
    }
  }, [currentPreference, isHydrated, requestBrowserGeolocation, setConfig, consentConfig]);

  /**
   * Handler quando usuário permite geolocalização
   */
  const handleAllow = useCallback(
    async (remember: boolean): Promise<void> => {
      setError(null);
      setFlowState('requesting-geolocation');

      if (remember) {
        setChoice('always-allow');
      }

      const geoSuccess = await requestBrowserGeolocation();
      setIsGeolocationEnabled(geoSuccess);

      setConfig({
        ...consentConfig,
        collectBrowserGeolocation: geoSuccess,
      });

      if (!geoSuccess) {
        setError('Não foi possível obter localização. Continuando sem localização precisa.');
      }

      setFlowState(geoSuccess ? 'ready-with-geolocation' : 'ready-without-geolocation');
    },
    [requestBrowserGeolocation, setChoice, setConfig, consentConfig]
  );

  /**
   * Handler quando usuário nega geolocalização
   */
  const handleDeny = useCallback(
    (remember: boolean): void => {
      setError(null);

      if (remember) {
        setChoice('always-deny');
      }

      setIsGeolocationEnabled(false);

      setConfig({
        ...consentConfig,
        collectBrowserGeolocation: false,
      });

      setFlowState('ready-without-geolocation');
    },
    [setChoice, setConfig, consentConfig]
  );

  /**
   * Reseta o fluxo para permitir nova verificação
   */
  const resetFlow = useCallback((): void => {
    setFlowState('checking');
    setError(null);
    setIsGeolocationEnabled(false);
  }, []);

  return {
    flowState,
    shouldShowPreCapture,
    isLoading,
    error,
    currentPreference,
    handleAllow,
    handleDeny,
    checkConsent,
    resetFlow,
    isGeolocationEnabled,
  };
}

export default useGeolocationConsent;
