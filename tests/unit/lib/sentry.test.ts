/**
 * Testes unitários para a configuração do Sentry
 *
 * Verifica a inicialização com BrowserClient/Scope isolados
 * conforme documentação oficial para extensões de navegador.
 *
 * @module SentryTest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock das classes do Sentry
const mockScope = {
  setClient: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
};

const mockClient = {
  init: vi.fn(),
};

vi.mock('@sentry/browser', () => ({
  BrowserClient: vi.fn(() => mockClient),
  Scope: vi.fn(() => mockScope),
  defaultStackParser: {},
  getDefaultIntegrations: vi.fn(() => [
    { name: 'BrowserApiErrors' },
    { name: 'Breadcrumbs' },
    { name: 'GlobalHandlers' },
    { name: 'LinkedErrors' },
    { name: 'Dedupe' },
  ]),
  makeFetchTransport: vi.fn(),
}));

// Mock do chrome runtime
global.chrome = {
  runtime: {
    getManifest: vi.fn(() => ({
      version: '1.0.0',
      manifest_version: 3,
      permissions: ['storage', 'tabs'],
    })),
    id: 'test-extension-id',
  },
} as any;

describe('Sentry Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state
    vi.resetModules();
    // Limpa variáveis de ambiente
    (import.meta as any).env = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initSentry', () => {
    it('deve inicializar o Sentry quando DSN está configurado', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, isSentryInitialized } = await import('@lib/sentry');

      const result = initSentry({
        context: 'service-worker',
      });

      expect(result).toBe(true);
      expect(isSentryInitialized()).toBe(true);
      expect(mockClient.init).toHaveBeenCalled();
      expect(mockScope.setClient).toHaveBeenCalledWith(mockClient);
    });

    it('deve retornar true mesmo quando chamado múltiplas vezes (idempotente)', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry } = await import('@lib/sentry');

      // Primeira chamada inicializa
      const result1 = initSentry({ context: 'popup' });
      expect(result1).toBe(true);

      // Segunda chamada também retorna true (já inicializado ou reinicializa)
      const result2 = initSentry({ context: 'sidepanel' });
      expect(result2).toBe(true);
    });

    it('deve configurar tags de contexto', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry } = await import('@lib/sentry');

      initSentry({
        context: 'sidepanel',
        additionalTags: {
          custom: 'tag',
        },
      });

      expect(mockScope.setTag).toHaveBeenCalledWith('context', 'sidepanel');
      expect(mockScope.setTag).toHaveBeenCalledWith('extension_id', 'test-extension-id');
      expect(mockScope.setTag).toHaveBeenCalledWith('custom', 'tag');
    });

    it('deve configurar usuário se fornecido', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry } = await import('@lib/sentry');

      initSentry({
        context: 'service-worker',
        userId: 'user-123',
      });

      expect(mockScope.setUser).toHaveBeenCalledWith({ id: 'user-123' });
    });

    it('deve configurar contexto da extensão', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry } = await import('@lib/sentry');

      initSentry({
        context: 'content-script',
      });

      expect(mockScope.setContext).toHaveBeenCalledWith('extension', {
        manifest_version: 3,
        context: 'content-script',
      });
    });
  });

  describe('captureException', () => {
    it('deve capturar exceção através do scope', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, captureException } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      const error = new Error('Test error');
      captureException(error);

      expect(mockScope.captureException).toHaveBeenCalledWith(error);
    });

    it('deve adicionar contexto adicional antes de capturar', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, captureException } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };

      captureException(error, context);

      expect(mockScope.setContext).toHaveBeenCalledWith('additional', context);
      expect(mockScope.captureException).toHaveBeenCalledWith(error);
    });

    it('não deve lançar erro se Sentry não inicializado', async () => {
      (import.meta as any).env = {
        DEV: true,
      };

      const { captureException } = await import('@lib/sentry');

      expect(() => {
        captureException(new Error('Test'));
      }).not.toThrow();
    });
  });

  describe('captureMessage', () => {
    it('deve capturar mensagem com nível e contexto', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, captureMessage } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      captureMessage('Test message', 'warning', { extra: 'data' });

      expect(mockScope.setContext).toHaveBeenCalledWith('additional', { extra: 'data' });
      expect(mockScope.captureMessage).toHaveBeenCalledWith('Test message', 'warning');
    });

    it('deve usar nível "info" por padrão', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, captureMessage } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      captureMessage('Test message');

      expect(mockScope.captureMessage).toHaveBeenCalledWith('Test message', 'info');
    });
  });

  describe('addBreadcrumb', () => {
    it('deve adicionar breadcrumb através do scope', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, addBreadcrumb } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      const breadcrumb = {
        category: 'navigation',
        message: 'User navigated',
        level: 'info' as const,
        data: { from: '/home', to: '/profile' },
      };

      addBreadcrumb(breadcrumb);

      expect(mockScope.addBreadcrumb).toHaveBeenCalledWith(breadcrumb);
    });

    it('não deve lançar erro se Sentry não inicializado', async () => {
      (import.meta as any).env = {
        DEV: true,
      };

      const { addBreadcrumb } = await import('@lib/sentry');

      expect(() => {
        addBreadcrumb({ message: 'Test' });
      }).not.toThrow();
    });
  });

  describe('setUser', () => {
    it('deve definir usuário no scope', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, setUser } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      setUser(user);

      expect(mockScope.setUser).toHaveBeenCalledWith(user);
    });

    it('deve limpar usuário quando null', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, setUser } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      setUser(null);

      expect(mockScope.setUser).toHaveBeenCalledWith(null);
    });
  });

  describe('setTags', () => {
    it('deve definir múltiplas tags no scope', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, setTags } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      // Limpa mocks anteriores do init
      mockScope.setTag.mockClear();

      const tags = {
        environment: 'test',
        version: '1.0.0',
        feature: 'capture',
      };

      setTags(tags);

      expect(mockScope.setTag).toHaveBeenCalledTimes(3);
      expect(mockScope.setTag).toHaveBeenCalledWith('environment', 'test');
      expect(mockScope.setTag).toHaveBeenCalledWith('version', '1.0.0');
      expect(mockScope.setTag).toHaveBeenCalledWith('feature', 'capture');
    });
  });

  describe('withSentry', () => {
    it('deve executar função e retornar resultado em caso de sucesso', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, withSentry } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      const fn = vi.fn().mockResolvedValue('success');

      const result = await withSentry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
      expect(mockScope.captureException).not.toHaveBeenCalled();
    });

    it('deve capturar erro e relançar', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, withSentry } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(withSentry(fn, { context: 'test' })).rejects.toThrow(error);

      expect(mockScope.captureException).toHaveBeenCalledWith(error);
    });
  });

  describe('clearSentryContext', () => {
    it('deve limpar usuário do scope', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, clearSentryContext } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      // Limpa mock anterior
      mockScope.setUser.mockClear();

      clearSentryContext();

      expect(mockScope.setUser).toHaveBeenCalledWith(null);
    });
  });

  describe('isSentryInitialized', () => {
    it('deve retornar false antes de inicializar', async () => {
      (import.meta as any).env = {
        DEV: true,
      };

      const { isSentryInitialized } = await import('@lib/sentry');

      expect(isSentryInitialized()).toBe(false);
    });

    it('deve retornar true após inicializar', async () => {
      (import.meta as any).env = {
        VITE_SENTRY_DSN: 'https://test@sentry.io/123',
        VITE_ENV: 'staging',
      };

      const { initSentry, isSentryInitialized } = await import('@lib/sentry');
      initSentry({ context: 'popup' });

      expect(isSentryInitialized()).toBe(true);
    });
  });
});
