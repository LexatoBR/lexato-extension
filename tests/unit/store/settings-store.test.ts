/**
 * Testes unitários para SettingsStore
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSettingsStore, initSettingsStorageListener } from '@store/settings-store';
import type { ExtensionSettings } from '@store/settings-store';

const defaultSettings: ExtensionSettings = {
  defaultStorageType: 'standard',
  captureQuality: 'high',
  notificationsEnabled: true,
  showCaptureOverlay: true,
  overlayPosition: 'bottom-right',
  autoClosePopup: false,
  language: 'pt-BR',
};

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: defaultSettings,
      isLoading: true,
      isSaving: false,
      error: null,
    });
  });

  afterEach(() => vi.clearAllMocks());

  describe('estado inicial', () => {
    it('deve ter configurações padrão', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.defaultStorageType).toBe('standard');
      expect(state.settings.captureQuality).toBe('high');
      expect(state.settings.language).toBe('pt-BR');
    });
  });

  describe('loadSettings', () => {
    it('deve carregar configurações do storage', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() =>
        Promise.resolve({
          lexato_settings: {
            defaultStorageType: 'premium_20y',
            captureQuality: 'medium',
            notificationsEnabled: false,
          },
        })
      );

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.settings.defaultStorageType).toBe('premium_20y');
      expect(state.settings.captureQuality).toBe('medium');
      expect(state.isLoading).toBe(false);
    });

    it('deve usar valores padrão quando storage está vazio', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() => Promise.resolve({}));

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().settings).toEqual(defaultSettings);
      expect(useSettingsStore.getState().isLoading).toBe(false);
    });

    it('deve tratar erro ao carregar configurações', async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error('Storage error'));

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().error).toBe('Erro ao carregar configurações');
      expect(useSettingsStore.getState().isLoading).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('deve atualizar configurações parcialmente', async () => {
      await useSettingsStore.getState().updateSettings({
        defaultStorageType: 'premium_20y',
        notificationsEnabled: false,
      });

      const state = useSettingsStore.getState();
      expect(state.settings.defaultStorageType).toBe('premium_20y');
      expect(state.settings.notificationsEnabled).toBe(false);
      expect(state.isSaving).toBe(false);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('deve tratar erro ao salvar configurações', async () => {
      vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error('Save error'));

      await useSettingsStore.getState().updateSettings({ captureQuality: 'low' });

      expect(useSettingsStore.getState().error).toBe('Erro ao salvar configurações');
      expect(useSettingsStore.getState().isSaving).toBe(false);
    });
  });

  describe('resetSettings', () => {
    it('deve chamar storage.set com valores padrão', async () => {
      useSettingsStore.setState({
        settings: { ...defaultSettings, defaultStorageType: 'premium_20y', captureQuality: 'low' },
      });

      await useSettingsStore.getState().resetSettings();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        lexato_settings: defaultSettings,
      });
    });

    it('deve tratar erro ao resetar configurações', async () => {
      vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error('Reset error'));

      await useSettingsStore.getState().resetSettings();

      expect(useSettingsStore.getState().error).toBe('Erro ao resetar configurações');
    });
  });

  describe('setDefaultStorageType', () => {
    it('deve chamar updateSettings com tipo de armazenamento', async () => {
      await useSettingsStore.getState().setDefaultStorageType('premium_20y');

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lexato_settings: expect.objectContaining({ defaultStorageType: 'premium_20y' }),
        })
      );
    });
  });

  describe('setCaptureQuality', () => {
    it('deve chamar updateSettings com qualidade de captura', async () => {
      await useSettingsStore.getState().setCaptureQuality('low');

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lexato_settings: expect.objectContaining({ captureQuality: 'low' }),
        })
      );
    });
  });

  describe('setNotificationsEnabled', () => {
    it('deve chamar updateSettings para habilitar notificações', async () => {
      await useSettingsStore.getState().setNotificationsEnabled(true);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lexato_settings: expect.objectContaining({ notificationsEnabled: true }),
        })
      );
    });

    it('deve chamar updateSettings para desabilitar notificações', async () => {
      await useSettingsStore.getState().setNotificationsEnabled(false);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lexato_settings: expect.objectContaining({ notificationsEnabled: false }),
        })
      );
    });
  });

  describe('setShowCaptureOverlay', () => {
    it('deve chamar updateSettings com exibição do overlay', async () => {
      await useSettingsStore.getState().setShowCaptureOverlay(false);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lexato_settings: expect.objectContaining({ showCaptureOverlay: false }),
        })
      );
    });
  });

  describe('setOverlayPosition', () => {
    it('deve chamar updateSettings com posição do overlay', async () => {
      await useSettingsStore.getState().setOverlayPosition('top-left');

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lexato_settings: expect.objectContaining({ overlayPosition: 'top-left' }),
        })
      );
    });
  });

  describe('clearError', () => {
    it('deve limpar erro', () => {
      useSettingsStore.setState({ error: 'Erro de teste' });
      useSettingsStore.getState().clearError();
      expect(useSettingsStore.getState().error).toBeNull();
    });
  });

  describe('initSettingsStorageListener', () => {
    it('deve adicionar e remover listener', () => {
      const cleanup = initSettingsStorageListener();
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
      cleanup();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('deve atualizar settings quando storage muda', () => {
      initSettingsStorageListener();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_settings: {
            newValue: { defaultStorageType: 'premium_20y', captureQuality: 'low' },
            oldValue: defaultSettings,
          },
        },
        'local'
      );

      const state = useSettingsStore.getState();
      expect(state.settings.defaultStorageType).toBe('premium_20y');
      expect(state.settings.captureQuality).toBe('low');
    });

    it('deve ignorar mudanças em outras áreas de storage', () => {
      useSettingsStore.setState({ settings: defaultSettings });
      initSettingsStorageListener();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_settings: {
            newValue: { defaultStorageType: 'premium_20y' },
            oldValue: defaultSettings,
          },
        },
        'sync'
      );

      expect(useSettingsStore.getState().settings.defaultStorageType).toBe('standard');
    });

    it('deve ignorar mudanças em outras chaves', () => {
      useSettingsStore.setState({ settings: defaultSettings });
      initSettingsStorageListener();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          other_key: {
            newValue: 'value',
            oldValue: 'old',
          },
        },
        'local'
      );

      expect(useSettingsStore.getState().settings).toEqual(defaultSettings);
    });

    it('deve usar valores padrão quando newValue é undefined', () => {
      useSettingsStore.setState({
        settings: { ...defaultSettings, defaultStorageType: 'premium_20y' },
      });
      initSettingsStorageListener();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_settings: {
            newValue: undefined,
            oldValue: { defaultStorageType: 'premium_20y' },
          },
        },
        'local'
      );

      expect(useSettingsStore.getState().settings).toEqual(defaultSettings);
    });

    it('deve mesclar valores parciais com padrões', () => {
      initSettingsStorageListener();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_settings: {
            newValue: { captureQuality: 'medium' },
            oldValue: defaultSettings,
          },
        },
        'local'
      );

      const state = useSettingsStore.getState();
      expect(state.settings.captureQuality).toBe('medium');
      expect(state.settings.defaultStorageType).toBe('standard');
      expect(state.settings.notificationsEnabled).toBe(true);
    });

    it('deve tratar erro ao processar mudança de storage', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalSetState = useSettingsStore.setState;
      useSettingsStore.setState = vi.fn().mockImplementation(() => {
        throw new Error('setState error');
      });

      initSettingsStorageListener();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      // Não deve lançar erro, apenas logar
      expect(() => {
        listener(
          {
            lexato_settings: {
              newValue: { captureQuality: 'low' },
              oldValue: defaultSettings,
            },
          },
          'local'
        );
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[SettingsStore] Erro ao processar mudança de storage:',
        expect.any(Error)
      );

      // Restaurar setState original
      useSettingsStore.setState = originalSetState;
      consoleSpy.mockRestore();
    });
  });
});
