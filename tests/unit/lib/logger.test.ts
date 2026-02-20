/**
 * Testes unitários para o sistema de logging
 *
 * @module LoggerTest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock do módulo sentry
vi.mock('@lib/sentry', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  isSentryInitialized: vi.fn(() => true),
}));

import { loggers, createLogger } from '@lib/logger';
import * as sentry from '@lib/sentry';

describe('Logger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleGroupSpy: ReturnType<typeof vi.spyOn>;
  let consoleGroupEndSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock console methods
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    // Mock environment
    (import.meta as any).env = {
      DEV: true,
      VITE_ENV: 'development',
      MODE: 'development',
    };
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleGroupSpy.mockRestore();
    consoleGroupEndSpy.mockRestore();
  });

  describe('logger padrão', () => {
    it('deve logar mensagens de debug em desenvolvimento', () => {
      const customLogger = createLogger({ minLevel: 'debug' });
      customLogger.debug('Mensagem de debug');

      expect(consoleDebugSpy).toHaveBeenCalledWith('Mensagem de debug');
    });

    it('deve logar mensagens de info', () => {
      const customLogger = createLogger({ minLevel: 'info' });
      customLogger.info('Mensagem informativa');

      expect(consoleInfoSpy).toHaveBeenCalledWith('Mensagem informativa');
    });

    it('deve logar mensagens de warning', () => {
      const customLogger = createLogger({ minLevel: 'warn' });
      customLogger.warn('Mensagem de aviso');

      expect(consoleWarnSpy).toHaveBeenCalledWith('Mensagem de aviso');
    });

    it('deve logar mensagens de erro', () => {
      const customLogger = createLogger({ minLevel: 'error' });
      customLogger.error('Mensagem de erro');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Mensagem de erro');
    });
  });

  describe('integração com Sentry', () => {
    it('deve adicionar breadcrumb no info', () => {
      const customLogger = createLogger({ minLevel: 'info' });
      customLogger.info('Teste breadcrumb', { userId: '123' });

      expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'log',
        message: 'Teste breadcrumb',
        level: 'info',
        data: { userId: '123' },
      });
    });

    it('deve capturar exceção no error', () => {
      const customLogger = createLogger({ minLevel: 'error' });
      const error = new Error('Erro de teste');

      customLogger.error('Falha na operação', error, { context: 'test' });

      expect(sentry.captureException).toHaveBeenCalledWith(error, {
        message: 'Falha na operação',
        context: 'test',
      });
    });

    it('deve enviar mensagem de warning ao Sentry', () => {
      const customLogger = createLogger({ minLevel: 'warn' });
      customLogger.warn('Aviso importante');

      expect(sentry.captureMessage).toHaveBeenCalledWith(
        'Aviso importante',
        'warning',
        undefined
      );
    });
  });

  describe('sanitização de dados sensíveis', () => {
    it('deve sanitizar campos sensíveis no contexto', () => {
      const customLogger = createLogger({ minLevel: 'info' });
      customLogger.info('Login', {
        email: 'user@test.com',
        password: 'secret123',
        accessToken: 'abc123',
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith('Login', {
        email: 'user@test.com',
        password: '[REDACTED]',
        accessToken: '[REDACTED]',
      });
    });

    it('deve sanitizar campos aninhados', () => {
      const customLogger = createLogger({ minLevel: 'info' });
      customLogger.info('Request', {
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
        },
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith('Request', {
        headers: {
          authorization: '[REDACTED]',
          'content-type': 'application/json',
        },
      });
    });
  });

  describe('prefixos', () => {
    it('deve adicionar prefixo às mensagens', () => {
      const prefixedLogger = createLogger({ prefix: '[Test]', minLevel: 'info' });
      prefixedLogger.info('Mensagem com prefixo');

      expect(consoleInfoSpy).toHaveBeenCalledWith('[Test] Mensagem com prefixo');
    });

    it('deve combinar prefixos com withPrefix', () => {
      const baseLogger = createLogger({ prefix: '[Base]', minLevel: 'info' });
      const childLogger = baseLogger.withPrefix('[Child]');
      childLogger.info('Mensagem');

      expect(consoleInfoSpy).toHaveBeenCalledWith('[Base] [Child] Mensagem');
    });
  });

  describe('níveis de log', () => {
    it('não deve logar debug quando minLevel é info', () => {
      const customLogger = createLogger({ minLevel: 'info' });
      customLogger.debug('Debug ignorado');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('deve logar error mesmo quando minLevel é warn', () => {
      const customLogger = createLogger({ minLevel: 'warn' });
      customLogger.error('Erro crítico');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('deve permitir mudar nível com withMinLevel', () => {
      const customLogger = createLogger({ minLevel: 'error' });
      const verboseLogger = customLogger.withMinLevel('debug');
      verboseLogger.debug('Debug habilitado');

      expect(consoleDebugSpy).toHaveBeenCalled();
    });
  });

  describe('time', () => {
    it('deve medir tempo de operação bem-sucedida', async () => {
      const customLogger = createLogger({ minLevel: 'debug' });
      const result = await customLogger.time('operação', async () => {
        return 'sucesso';
      });

      expect(result).toBe('sucesso');
      expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance',
          level: 'info',
        })
      );
    });

    it('deve capturar erro e relançar em operação falha', async () => {
      const customLogger = createLogger({ minLevel: 'error' });
      const error = new Error('Operação falhou');

      await expect(
        customLogger.time('operação', async () => {
          throw error;
        })
      ).rejects.toThrow(error);

      expect(sentry.captureException).toHaveBeenCalled();
    });
  });

  describe('loggers pré-configurados', () => {
    it('deve ter logger para service worker', () => {
      expect(loggers.serviceWorker).toBeDefined();
    });

    it('deve ter logger para content script', () => {
      expect(loggers.contentScript).toBeDefined();
    });

    it('deve ter logger para popup', () => {
      expect(loggers.popup).toBeDefined();
    });

    it('deve ter logger para upload', () => {
      expect(loggers.upload).toBeDefined();
    });
  });

  describe('group', () => {
    it('deve agrupar logs em desenvolvimento', () => {
      const customLogger = createLogger({ minLevel: 'info' });
      customLogger.group('Grupo de teste', () => {
        customLogger.info('Log dentro do grupo');
      });

      expect(consoleGroupSpy).toHaveBeenCalledWith('Grupo de teste');
      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });
  });

  describe('modo silencioso', () => {
    it('não deve logar quando silent está ativado', () => {
      const silentLogger = createLogger({ silent: true });
      silentLogger.info('Esta mensagem não deve aparecer');
      silentLogger.error('Este erro também não');

      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
