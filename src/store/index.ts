/**
 * Módulo de State Management da Extensão Lexato
 *
 * Exporta stores Zustand para gerenciamento de estado global.
 *
 * Requisitos atendidos:
 * - 14.1: Utilizar Zustand para gerenciamento de estado global
 * - 14.2: Persistir configurações em chrome.storage.local
 * - 14.3: Sincronizar entre popup e service worker
 * - 14.4: Manter estado de usuário autenticado e capturas
 * - 14.5: Notificar componentes sobre mudanças de estado
 * - 14.6: Recuperar estado após reinício do service worker
 * - 14.7: Manter consistência entre múltiplas instâncias
 *
 * @module Store
 */

// Auth Store
export { useAuthStore, initAuthStorageListener } from './auth-store';

// Capture Store
export { useCaptureStore, initCaptureListeners } from './capture-store';
export type { CaptureProgress } from './capture-store';

// Settings Store
export { useSettingsStore, initSettingsStorageListener } from './settings-store';
export type { ExtensionSettings, CaptureQuality } from './settings-store';

// Consent Store
export {
  useConsentStore,
  selectHasConsented,
  selectHasAnyOptional,
  selectOptionalFields,
} from './consent-store';

// Geolocation Preferences Store
export {
  useGeolocationPreferences,
  selectChoiceLabel,
  selectHasPreference,
  selectFormattedLastChange,
} from './geolocation-preferences';
export type { GeolocationChoice } from './geolocation-preferences';

// Chrome Storage Adapter
export {
  chromeStorageSyncAdapter,
  chromeStorageLocalAdapter,
  createStorageChangeListener,
} from './chrome-storage-adapter';

/**
 * Inicializa todos os stores e listeners
 *
 * Deve ser chamado no início da aplicação (popup/options)
 *
 * @returns Função de cleanup para remover listeners
 */
export async function initializeStores(): Promise<() => void> {
  const { useAuthStore } = await import('./auth-store');
  const { useCaptureStore } = await import('./capture-store');
  const { useSettingsStore } = await import('./settings-store');
  const { useConsentStore } = await import('./consent-store');
  const { useGeolocationPreferences } = await import('./geolocation-preferences');
  const { initAuthStorageListener } = await import('./auth-store');
  const { initCaptureListeners } = await import('./capture-store');
  const { initSettingsStorageListener } = await import('./settings-store');

  // Carregar estados iniciais
  // Nota: Consent e Geolocation stores usam persist middleware com hidratação automática
  await Promise.all([
    useAuthStore.getState().loadAuthState(),
    useCaptureStore.getState().loadCaptureState(),
    useSettingsStore.getState().loadSettings(),
  ]);

  // Aguardar hidratação dos stores com persist
  // Os stores de consent e geolocation hidratam automaticamente via persist middleware
  await Promise.race([
    new Promise<void>((resolve) => {
      const checkHydration = () => {
        if (useConsentStore.getState().isHydrated && useGeolocationPreferences.getState().isHydrated) {
          resolve();
        }
      };
      checkHydration();
      const unsubConsent = useConsentStore.subscribe((state) => {
        if (state.isHydrated) {
          checkHydration();
          unsubConsent();
        }
      });
      const unsubGeo = useGeolocationPreferences.subscribe((state) => {
        if (state.isHydrated) {
          checkHydration();
          unsubGeo();
        }
      });
    }),
    // Timeout de 2 segundos para não bloquear indefinidamente
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);

  // Inicializar listeners
  const cleanupAuth = initAuthStorageListener();
  const cleanupCapture = initCaptureListeners();
  const cleanupSettings = initSettingsStorageListener();

  // Retornar função de cleanup
  return () => {
    cleanupAuth();
    cleanupCapture();
    cleanupSettings();
  };
}

/**
 * Carrega estados iniciais dos stores (versão síncrona para uso em componentes)
 */
export function loadInitialStates(): void {
  import('./auth-store').then(({ useAuthStore }) => {
    useAuthStore.getState().loadAuthState();
  });

  import('./capture-store').then(({ useCaptureStore }) => {
    useCaptureStore.getState().loadCaptureState();
  });

  import('./settings-store').then(({ useSettingsStore }) => {
    useSettingsStore.getState().loadSettings();
  });
}
