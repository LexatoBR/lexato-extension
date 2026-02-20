/**
 * Testes unitários para Retry Handler
 *
 * Testa backoff exponencial, jitter e configurações por serviço
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RetryHandler,
  MaxRetriesExceededError,
  withRetry,
} from '@lib/retry-handler';

describe('RetryHandler', () => {
  let handler: RetryHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new RetryHandler('default');
  });

  describe('constructor', () => {
    it('deve usar configuração padrão para tipo default', () => {
      const config = handler.getConfig();
      expect(config.maxAttempts).toBe(3);
      expect(config.jitterFactor).toBe(0.3);
    });

    it('deve usar configuração específica para ICP-Brasil', () => {
      const icpHandler = new RetryHandler('icp-brasil');
      const config = icpHandler.getConfig();
      expect(config.maxAttempts).toBe(3);
      expect(config.initialDelayMs).toBe(2000);
    });

    it('deve usar configuração específica para blockchain', () => {
      const blockchainHandler = new RetryHandler('blockchain');
      const config = blockchainHandler.getConfig();
      expect(config.maxAttempts).toBe(5);
    });

    it('deve aceitar configuração customizada', () => {
      const customHandler = new RetryHandler({
        maxAttempts: 10,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        backoffFactor: 3,
        jitterFactor: 0.2,
      });
      const config = customHandler.getConfig();
      expect(config.maxAttempts).toBe(10);
      expect(config.backoffFactor).toBe(3);
    });
  });

  describe('calculateDelay', () => {
    it('deve calcular delay com backoff exponencial', () => {
      const noJitterHandler = new RetryHandler({
        initialDelayMs: 1000,
        backoffFactor: 2,
        jitterFactor: 0, // Sem jitter para teste determinístico
        maxDelayMs: 100000,
        maxAttempts: 5,
      });

      expect(noJitterHandler.calculateDelay(0)).toBe(1000); // 1000 * 2^0
      expect(noJitterHandler.calculateDelay(1)).toBe(2000); // 1000 * 2^1
      expect(noJitterHandler.calculateDelay(2)).toBe(4000); // 1000 * 2^2
    });

    it('deve respeitar maxDelayMs', () => {
      const cappedHandler = new RetryHandler({
        initialDelayMs: 1000,
        backoffFactor: 2,
        jitterFactor: 0,
        maxDelayMs: 3000,
        maxAttempts: 5,
      });

      expect(cappedHandler.calculateDelay(5)).toBe(3000); // Capped
    });

    it('deve aplicar jitter dentro do range esperado', () => {
      const jitterHandler = new RetryHandler({
        initialDelayMs: 1000,
        backoffFactor: 1,
        jitterFactor: 0.3,
        maxDelayMs: 10000,
        maxAttempts: 5,
      });

      // Com jitter de 30%, delay deve estar entre 700 e 1300
      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        delays.push(jitterHandler.calculateDelay(0));
      }

      const min = Math.min(...delays);
      const max = Math.max(...delays);

      expect(min).toBeGreaterThanOrEqual(700);
      expect(max).toBeLessThanOrEqual(1300);
    });
  });

  describe('execute', () => {
    it('deve retornar resultado em caso de sucesso', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await handler.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('deve fazer retry em caso de erro retryable', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');

      const fastHandler = new RetryHandler({
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffFactor: 1,
        jitterFactor: 0,
      });

      const result = await fastHandler.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('deve lançar MaxRetriesExceededError após esgotar tentativas', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('network error'));

      const fastHandler = new RetryHandler({
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffFactor: 1,
        jitterFactor: 0,
      });

      await expect(fastHandler.execute(fn)).rejects.toThrow(MaxRetriesExceededError);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('deve chamar callback onRetry', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const fastHandler = new RetryHandler({
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffFactor: 1,
        jitterFactor: 0,
      });

      await fastHandler.execute(fn, onRetry);
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          maxAttempts: 3,
        })
      );
    });

    it('não deve fazer retry para erro não-retryable', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('validation error'));

      const fastHandler = new RetryHandler({
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffFactor: 1,
        jitterFactor: 0,
      });

      await expect(fastHandler.execute(fn)).rejects.toThrow('validation error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('deve fazer retry para erro 500', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockResolvedValue('success');

      const fastHandler = new RetryHandler({
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffFactor: 1,
        jitterFactor: 0,
      });

      const result = await fastHandler.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('deve fazer retry para erro 429 (rate limit)', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValue('success');

      const fastHandler = new RetryHandler({
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffFactor: 1,
        jitterFactor: 0,
      });

      const result = await fastHandler.execute(fn);
      expect(result).toBe('success');
    });
  });

  describe('executeWithResult', () => {
    it('deve retornar resultado detalhado em caso de sucesso', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await handler.executeWithResult(fn);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalDelayMs).toBe(0);
    });

    it('deve retornar resultado detalhado em caso de falha', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('network error'));

      const fastHandler = new RetryHandler({
        maxAttempts: 2,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffFactor: 1,
        jitterFactor: 0,
      });

      const result = await fastHandler.executeWithResult(fn);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(2);
    });

    it('deve incluir totalDelayMs após retries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');

      const fastHandler = new RetryHandler({
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffFactor: 1,
        jitterFactor: 0,
      });

      const result = await fastHandler.executeWithResult(fn);

      expect(result.success).toBe(true);
      expect(result.totalDelayMs).toBeGreaterThan(0);
    });
  });
});

describe('withRetry', () => {
  it('deve funcionar como atalho para RetryHandler', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
  });

  it('deve aceitar tipo de serviço', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, 'blockchain');
    expect(result).toBe('success');
  });

  it('deve aceitar configuração customizada', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxAttempts: 5 });
    expect(result).toBe('success');
  });
});

describe('MaxRetriesExceededError', () => {
  it('deve ter mensagem em português', () => {
    const lastError = new Error('test');
    const error = new MaxRetriesExceededError(3, lastError);
    expect(error.message).toContain('Máximo de 3 tentativas');
  });

  it('deve incluir último erro', () => {
    const lastError = new Error('original error');
    const error = new MaxRetriesExceededError(3, lastError);
    expect(error.lastError).toBe(lastError);
    expect(error.attempts).toBe(3);
  });

  it('deve ter nome correto', () => {
    const error = new MaxRetriesExceededError(3, new Error('test'));
    expect(error.name).toBe('MaxRetriesExceededError');
  });
});
