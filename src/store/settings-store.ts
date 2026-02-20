/**
 * Store de Configurações Zustand
 *
 * Gerencia configurações persistentes da extensão.
 *
 * Requisitos atendidos:
 * - 14.2: Persistir configurações em chrome.storage.local
 * - 14.3: Sincronizar entre popup e service worker
 *
 * @module SettingsStore
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { captureException } from '../lib/sentry';
import type { StorageType } from '../types/capture.types';

/** Chave de armazenamento */
const STORAGE_KEY = 'lexato_settings';

/** Qualidade de captura */
export type CaptureQuality = 'low' | 'medium' | 'high';

/** Configurações da extensão */
export interface ExtensionSettings {
  /** Tipo de armazenamento padrão */
  defaultStorageType: StorageType;
  /** Qualidade de captura padrão */
  captureQuality: CaptureQuality;
  /** Se notificações estão habilitadas */
  notificationsEnabled: boolean;
  /** Se deve mostrar overlay durante captura */
  showCaptureOverlay: boolean;
  /** Posição do overlay */
  overlayPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Se deve auto-fechar interface após iniciar captura (legado, mantido por compatibilidade) */
  autoClosePopup: boolean;
  /** Idioma da interface */
  language: 'pt-BR';
}

/** Configurações padrão */
const DEFAULT_SETTINGS: ExtensionSettings = {
  defaultStorageType: 'standard',
  captureQuality: 'high',
  notificationsEnabled: true,
  showCaptureOverlay: true,
  overlayPosition: 'bottom-right',
  autoClosePopup: false,
  language: 'pt-BR',
};

/** Estado do store */
interface SettingsStoreState {
  settings: ExtensionSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

/** Ações do store */
interface SettingsStoreActions {
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<ExtensionSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  setDefaultStorageType: (type: StorageType) => Promise<void>;
  setCaptureQuality: (quality: CaptureQuality) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setShowCaptureOverlay: (show: boolean) => Promise<void>;
  setOverlayPosition: (position: ExtensionSettings['overlayPosition']) => Promise<void>;
  clearError: () => void;
}

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const initialState: SettingsStoreState = {
  settings: DEFAULT_SETTINGS,
  isLoading: true,
  isSaving: false,
  error: null,
};

/**
 * Store de configurações Zustand
 */
export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    loadSettings: async (): Promise<void> => {
      try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const savedSettings = result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;

        set({
          settings: { ...DEFAULT_SETTINGS, ...savedSettings },
          isLoading: false,
        });
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { component: 'SettingsStore', operation: 'loadSettings' },
        });
        set({ isLoading: false, error: 'Erro ao carregar configurações' });
      }
    },

    updateSettings: async (updates: Partial<ExtensionSettings>): Promise<void> => {
      set({ isSaving: true, error: null });

      try {
        const { settings } = get();
        const newSettings = { ...settings, ...updates };

        await chrome.storage.local.set({ [STORAGE_KEY]: newSettings });
        set({ settings: newSettings, isSaving: false });
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { component: 'SettingsStore', operation: 'updateSettings' },
        });
        set({ isSaving: false, error: 'Erro ao salvar configurações' });
      }
    },

    resetSettings: async (): Promise<void> => {
      set({ isSaving: true, error: null });

      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
        set({ settings: DEFAULT_SETTINGS, isSaving: false });
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { component: 'SettingsStore', operation: 'resetSettings' },
        });
        set({ isSaving: false, error: 'Erro ao resetar configurações' });
      }
    },

    setDefaultStorageType: async (type: StorageType): Promise<void> => {
      await get().updateSettings({ defaultStorageType: type });
    },

    setCaptureQuality: async (quality: CaptureQuality): Promise<void> => {
      await get().updateSettings({ captureQuality: quality });
    },

    setNotificationsEnabled: async (enabled: boolean): Promise<void> => {
      await get().updateSettings({ notificationsEnabled: enabled });
    },

    setShowCaptureOverlay: async (show: boolean): Promise<void> => {
      await get().updateSettings({ showCaptureOverlay: show });
    },

    setOverlayPosition: async (position: ExtensionSettings['overlayPosition']): Promise<void> => {
      await get().updateSettings({ overlayPosition: position });
    },

    clearError: (): void => set({ error: null }),
  }))
);

/** Inicializa listener de mudanças no storage */
export function initSettingsStorageListener(): () => void {
  const handleStorageChange = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ): void => {
    try {
      if (areaName !== 'local') {
        return;
      }

      const change = changes[STORAGE_KEY];
      if (!change) {
        return;
      }

      const newSettings = change.newValue as Partial<ExtensionSettings> | undefined;
      useSettingsStore.setState({
        settings: { ...DEFAULT_SETTINGS, ...newSettings },
      });
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { component: 'SettingsStore', operation: 'storageChangeListener' },
      });
    }
  };

  chrome.storage.onChanged.addListener(handleStorageChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  };
}

export default useSettingsStore;
