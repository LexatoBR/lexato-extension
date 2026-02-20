/**
 * Testes unitários para Store Index
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeStores,
  loadInitialStates,
  useAuthStore,
  useCaptureStore,
  useSettingsStore,
} from '@store/index';

describe('Store Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chrome.storage.local.get).mockImplementation(() => Promise.resolve({}));
  });

  afterEach(() => vi.clearAllMocks());

  describe('exports', () => {
    it('deve exportar useAuthStore', () => {
      expect(useAuthStore).toBeDefined();
      expect(typeof useAuthStore).toBe('function');
    });

    it('deve exportar useCaptureStore', () => {
      expect(useCaptureStore).toBeDefined();
      expect(typeof useCaptureStore).toBe('function');
    });

    it('deve exportar useSettingsStore', () => {
      expect(useSettingsStore).toBeDefined();
      expect(typeof useSettingsStore).toBe('function');
    });
  });

  describe('initializeStores', () => {
    it('deve inicializar todos os stores e retornar função de cleanup', async () => {
      const cleanup = await initializeStores();

      expect(typeof cleanup).toBe('function');
      expect(chrome.storage.local.get).toHaveBeenCalled();
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();

      // Executar cleanup
      cleanup();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('deve carregar estados iniciais de todos os stores', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() =>
        Promise.resolve({
          lexato_access_token: 'token',
          lexato_refresh_token: 'refresh',
          lexato_expires_at: Date.now() + 3600000,
          lexato_obtained_at: Date.now(),
          lexato_user: { id: 'user-1', email: 'test@test.com', name: 'Test', accountType: 'individual', credits: 100, mfaEnabled: false },
          lexato_capture_state: { isCapturing: false },
          lexato_recent_captures: [],
          lexato_settings: { defaultStorageType: 'standard' },
        })
      );

      await initializeStores();

      // Verificar que os stores foram carregados
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useCaptureStore.getState().isLoadingRecent).toBe(false);
      expect(useSettingsStore.getState().isLoading).toBe(false);
    });
  });

  describe('loadInitialStates', () => {
    it('deve carregar estados de forma assíncrona', async () => {
      loadInitialStates();

      // Aguardar imports dinâmicos
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(chrome.storage.local.get).toHaveBeenCalled();
    });
  });
});
