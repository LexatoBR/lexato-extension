/**
 * Store de Consentimento LGPD/GDPR
 *
 * Gerencia configurações de consentimento do usuário para coleta de dados
 * opcionais (fingerprints, geolocalização precisa).
 *
 * Persistido em chrome.storage.sync para sincronização entre dispositivos.
 *
 * @requirements 4.6, 4.7
 * @module ConsentStore
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { subscribeWithSelector } from 'zustand/middleware';
import { chromeStorageSyncAdapter } from './chrome-storage-adapter';
import {
  type ForensicConsentConfig,
  DEFAULT_CONSENT_CONFIG,
} from '../types/forensic-metadata.types';

/** Chave de armazenamento no chrome.storage.sync */
const STORAGE_KEY = 'lexato-consent';

/** Versão atual do schema de consentimento */
const CONSENT_VERSION = '1.0';

/**
 * Estado do store de consentimento
 */
interface ConsentStoreState {
  /** Configuração atual de consentimento */
  config: ForensicConsentConfig;

  /** Timestamp ISO 8601 do último consentimento */
  consentTimestamp: string | null;

  /** Versão do schema de consentimento */
  consentVersion: string;

  /** Se o store foi hidratado do storage */
  isHydrated: boolean;
}

/**
 * Ações do store de consentimento
 */
interface ConsentStoreActions {
  /**
   * Atualiza configuração de consentimento
   *
   * Atualiza apenas os campos opcionais fornecidos.
   * Campos sempre coletados não podem ser alterados.
   *
   * @param updates - Campos opcionais a atualizar
   */
  setConfig: (updates: Partial<Pick<ForensicConsentConfig,
    | 'collectBrowserGeolocation'
    | 'collectCanvasFingerprint'
    | 'collectWebGLFingerprint'
    | 'collectFontsFingerprint'
  >>) => void;

  /**
   * Habilita todos os campos opcionais
   */
  acceptAll: () => void;

  /**
   * Desabilita todos os campos opcionais
   */
  denyAll: () => void;

  /**
   * Reseta consentimento para valores padrão
   */
  resetConsent: () => void;

  /**
   * Marca store como hidratado
   */
  setHydrated: (hydrated: boolean) => void;
}

/**
 * Tipo completo do store
 */
type ConsentStore = ConsentStoreState & ConsentStoreActions;

/**
 * Estado inicial
 */
const initialState: ConsentStoreState = {
  config: DEFAULT_CONSENT_CONFIG,
  consentTimestamp: null,
  consentVersion: CONSENT_VERSION,
  isHydrated: false,
};

/**
 * Store de consentimento Zustand
 *
 * Funcionalidades:
 * - Gerencia configuração de consentimento LGPD/GDPR
 * - Persiste em chrome.storage.sync
 * - Sincroniza entre dispositivos do usuário
 * - Registra timestamp de cada alteração
 *
 * @example
 * ```typescript
 * // No componente React
 * const { config, setConfig, acceptAll } = useConsentStore();
 *
 * // Habilitar geolocalização precisa
 * setConfig({ collectBrowserGeolocation: true });
 *
 * // Aceitar todos os opcionais
 * acceptAll();
 * ```
 */
export const useConsentStore = create<ConsentStore>()(
  subscribeWithSelector(
    persist(
      (set, _get) => ({
        ...initialState,

        setConfig: (updates) => {
          set((state) => ({
            config: {
              ...state.config,
              ...updates,
            },
            consentTimestamp: new Date().toISOString(),
            consentVersion: CONSENT_VERSION,
          }));
        },

        acceptAll: () => {
          set({
            config: {
              ...DEFAULT_CONSENT_CONFIG,
              collectBrowserGeolocation: true,
              collectCanvasFingerprint: true,
              collectWebGLFingerprint: true,
              collectFontsFingerprint: true,
            },
            consentTimestamp: new Date().toISOString(),
            consentVersion: CONSENT_VERSION,
          });
        },

        denyAll: () => {
          set({
            config: DEFAULT_CONSENT_CONFIG,
            consentTimestamp: new Date().toISOString(),
            consentVersion: CONSENT_VERSION,
          });
        },

        resetConsent: () => {
          set({
            config: DEFAULT_CONSENT_CONFIG,
            consentTimestamp: null,
            consentVersion: CONSENT_VERSION,
          });
        },

        setHydrated: (hydrated) => {
          set({ isHydrated: hydrated });
        },
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => chromeStorageSyncAdapter),
        onRehydrateStorage: () => (state) => {
          state?.setHydrated(true);
        },
        partialize: (state) => ({
          config: state.config,
          consentTimestamp: state.consentTimestamp,
          consentVersion: state.consentVersion,
        }),
      }
    )
  )
);

/**
 * Seletor para verificar se usuário já deu consentimento
 */
export const selectHasConsented = (state: ConsentStore): boolean => {
  return state.consentTimestamp !== null;
};

/**
 * Seletor para verificar se algum opcional está habilitado
 */
export const selectHasAnyOptional = (state: ConsentStore): boolean => {
  const { config } = state;
  return (
    config.collectBrowserGeolocation ||
    config.collectCanvasFingerprint ||
    config.collectWebGLFingerprint ||
    config.collectFontsFingerprint
  );
};

/**
 * Seletor para obter apenas campos opcionais
 */
export const selectOptionalFields = (state: ConsentStore) => ({
  collectBrowserGeolocation: state.config.collectBrowserGeolocation,
  collectCanvasFingerprint: state.config.collectCanvasFingerprint,
  collectWebGLFingerprint: state.config.collectWebGLFingerprint,
  collectFontsFingerprint: state.config.collectFontsFingerprint,
});

export default useConsentStore;
