/**
 * Store de Preferências de Geolocalização
 *
 * Gerencia preferências do usuário para coleta de geolocalização precisa
 * durante capturas. Permite "Lembrar minha escolha" para evitar prompts
 * repetitivos.
 *
 * Persistido em chrome.storage.sync para sincronização entre dispositivos.
 *
 * @requirements 6.10
 * @module GeolocationPreferencesStore
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { subscribeWithSelector } from 'zustand/middleware';
import { chromeStorageSyncAdapter } from './chrome-storage-adapter';

/** Chave de armazenamento no chrome.storage.sync */
const STORAGE_KEY = 'lexato-geolocation-prefs';

/**
 * Opções de preferência de geolocalização
 *
 * - 'always-allow': Sempre permitir geolocalização precisa
 * - 'always-deny': Sempre usar apenas geolocalização aproximada (IP)
 * - 'ask-every-time': Perguntar a cada captura
 */
export type GeolocationChoice = 'always-allow' | 'always-deny' | 'ask-every-time';

/**
 * Estado do store de preferências de geolocalização
 */
interface GeolocationPreferencesState {
  /** Escolha atual do usuário */
  choice: GeolocationChoice;

  /** Timestamp ISO 8601 da última alteração de preferência */
  lastPromptTimestamp: string | null;

  /** Se o store foi hidratado do storage */
  isHydrated: boolean;
}

/**
 * Ações do store de preferências de geolocalização
 */
interface GeolocationPreferencesActions {
  /**
   * Define a escolha de geolocalização
   *
   * @param choice - Nova preferência
   */
  setChoice: (choice: GeolocationChoice) => void;

  /**
   * Reseta preferência para 'ask-every-time'
   */
  resetChoice: () => void;

  /**
   * Verifica se deve mostrar prompt de geolocalização
   *
   * @returns true se choice é 'ask-every-time'
   */
  shouldShowPrompt: () => boolean;

  /**
   * Verifica se geolocalização precisa está habilitada
   *
   * @returns true se choice é 'always-allow'
   */
  isGeolocationEnabled: () => boolean;

  /**
   * Marca store como hidratado
   */
  setHydrated: (hydrated: boolean) => void;
}

/**
 * Tipo completo do store
 */
type GeolocationPreferencesStore = GeolocationPreferencesState & GeolocationPreferencesActions;

/**
 * Estado inicial
 */
const initialState: GeolocationPreferencesState = {
  choice: 'ask-every-time',
  lastPromptTimestamp: null,
  isHydrated: false,
};

/**
 * Store de preferências de geolocalização Zustand
 *
 * Funcionalidades:
 * - Gerencia preferência de geolocalização do usuário
 * - Persiste em chrome.storage.sync
 * - Sincroniza entre dispositivos do usuário
 * - Registra timestamp de cada alteração
 *
 * @example
 * ```typescript
 * // No componente React
 * const { choice, setChoice, shouldShowPrompt } = useGeolocationPreferences();
 *
 * // Verificar se deve mostrar prompt
 * if (shouldShowPrompt()) {
 *   // Mostrar PreCaptureScreen
 * }
 *
 * // Salvar escolha com "Lembrar"
 * setChoice('always-allow');
 * ```
 */
export const useGeolocationPreferences = create<GeolocationPreferencesStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

        setChoice: (choice) => {
          set({
            choice,
            lastPromptTimestamp: new Date().toISOString(),
          });
        },

        resetChoice: () => {
          set({
            choice: 'ask-every-time',
            lastPromptTimestamp: null,
          });
        },

        shouldShowPrompt: () => {
          const { choice } = get();
          return choice === 'ask-every-time';
        },

        isGeolocationEnabled: () => {
          const { choice } = get();
          return choice === 'always-allow';
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
          choice: state.choice,
          lastPromptTimestamp: state.lastPromptTimestamp,
        }),
      }
    )
  )
);

/**
 * Seletor para obter label da escolha atual
 */
export const selectChoiceLabel = (state: GeolocationPreferencesStore): string => {
  const labels: Record<GeolocationChoice, string> = {
    'always-allow': 'Sempre permitir localização precisa',
    'always-deny': 'Usar apenas localização aproximada (IP)',
    'ask-every-time': 'Perguntar a cada captura',
  };
  return labels[state.choice];
};

/**
 * Seletor para verificar se preferência foi definida
 */
export const selectHasPreference = (state: GeolocationPreferencesStore): boolean => {
  return state.lastPromptTimestamp !== null;
};

/**
 * Formata data da última alteração para exibição
 */
export const selectFormattedLastChange = (state: GeolocationPreferencesStore): string | null => {
  if (!state.lastPromptTimestamp) {
    return null;
  }

  try {
    const date = new Date(state.lastPromptTimestamp);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
};

export default useGeolocationPreferences;
