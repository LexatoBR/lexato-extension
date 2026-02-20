/**
 * Testes unitários para Circuit Breaker
 *
 * Testa estados, transições e proteção contra falhas em cascata
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
} from '@lib/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.clearAllMocks();
    breaker = new CircuitBreaker({ serviceName: 'test-service' });
  });

  describe('constructor', () => {
    it('deve iniciar no estado CLOSED', () => {
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('deve usar configuração padrão', () => {
      const stats = breaker.getStats();
      expect(stats.config.failureThreshold).toBe(5);
    });

    it('deve detectar tipo de serviço ICP-Brasil', () => {
      const icpBreaker = new CircuitBreaker({ serviceName: 'icp-brasil-tsa' });
      const stats = icpBreaker.getStats();
      expect(stats.config.resetTimeoutMs).toBe(5 * 60 * 1000); // 5 minutos
    });

    it('deve detectar tipo de serviço blockchain', () => {
      const blockchainBreaker = new CircuitBreaker({ serviceName: 'polygon-rpc' });
      const stats = blockchainBreaker.getStats();
      expect(stats.config.resetTimeoutMs).toBe(1 * 60 * 1000); // 1 minuto
    });

    it('deve aceitar configuração customizada', () => {
      const customBreaker = new CircuitBreaker({
        serviceName: 'custom',
        failureThreshold: 3,
        resetTimeoutMs: 10000,
      });
      const stats = customBreaker.getStats();
      expect(stats.config.failureThreshold).toBe(3);
      expect(stats.config.resetTimeoutMs).toBe(10000);
    });
  });

  describe('canExecute', () => {
    it('deve permitir execução quando CLOSED', () => {
      expect(breaker.canExecute()).toBe(true);
    });

    it('deve lançar CircuitOpenError quando OPEN', () => {
      breaker.forceOpen();
      expect(() => breaker.canExecute()).toThrow(CircuitOpenError);
    });
  });

  describe('recordSuccess', () => {
    it('deve incrementar contador de sucesso', () => {
      breaker.recordSuccess();
      const stats = breaker.getStats();
      expect(stats.successCount).toBe(1);
    });

    it('deve resetar contador de falhas em CLOSED', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('recordFailure', () => {
    it('deve incrementar contador de falhas', () => {
      breaker.recordFailure();
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(1);
    });

    it('deve abrir circuito após atingir threshold', () => {
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('OPEN');
    });

    it('deve registrar lastFailureTime', () => {
      breaker.recordFailure();
      const stats = breaker.getStats();
      expect(stats.lastFailureTime).not.toBeNull();
    });
  });

  describe('transições de estado', () => {
    it('CLOSED → OPEN após threshold de falhas', () => {
      expect(breaker.getState()).toBe('CLOSED');
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('OPEN');
    });

    it('HALF_OPEN → CLOSED após sucesso', () => {
      // Configurar breaker com timeout curto para teste
      const testBreaker = new CircuitBreaker({
        serviceName: 'test',
        resetTimeoutMs: 1, // 1ms para teste rápido
        failureThreshold: 3, // Threshold explícito para teste
      });

      // Abrir circuito (3 falhas para atingir threshold)
      for (let i = 0; i < 3; i++) {
        testBreaker.recordFailure();
      }
      expect(testBreaker.getState()).toBe('OPEN');

      // Aguardar timeout e verificar transição para HALF_OPEN
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(testBreaker.getState()).toBe('HALF_OPEN');

          // Sucesso deve fechar
          testBreaker.recordSuccess();
          expect(testBreaker.getState()).toBe('CLOSED');
          resolve();
        }, 10);
      });
    });

    it('HALF_OPEN → OPEN após falha', async () => {
      vi.useFakeTimers();
      
      const testBreaker = new CircuitBreaker({
        serviceName: 'test',
        resetTimeoutMs: 100,
        failureThreshold: 3,
      });

      // Abrir circuito (3 falhas para atingir threshold)
      for (let i = 0; i < 3; i++) {
        testBreaker.recordFailure();
      }
      expect(testBreaker.getState()).toBe('OPEN');

      // Avançar tempo para transição OPEN → HALF_OPEN
      vi.advanceTimersByTime(100);
      expect(testBreaker.getState()).toBe('HALF_OPEN');

      // Falha em HALF_OPEN deve reabrir circuito
      testBreaker.recordFailure();
      expect(testBreaker.getState()).toBe('OPEN');
      
      vi.useRealTimers();
    });
  });

  describe('execute', () => {
    it('deve executar função quando CLOSED', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('deve registrar sucesso após execução bem-sucedida', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      await breaker.execute(fn);
      const stats = breaker.getStats();
      expect(stats.successCount).toBe(1);
    });

    it('deve registrar falha após execução com erro', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(1);
    });

    it('deve lançar CircuitOpenError quando OPEN', async () => {
      breaker.forceOpen();
      const fn = vi.fn().mockResolvedValue('success');
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('deve resetar para estado inicial', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();
      breaker.reset();

      const stats = breaker.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('forceOpen/forceClose', () => {
    it('forceOpen deve abrir circuito', () => {
      breaker.forceOpen();
      expect(breaker.getState()).toBe('OPEN');
    });

    it('forceClose deve fechar circuito', () => {
      breaker.forceOpen();
      breaker.forceClose();
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('getStats', () => {
    it('deve retornar estatísticas completas', () => {
      breaker.recordSuccess();
      breaker.recordFailure();

      const stats = breaker.getStats();
      expect(stats.serviceName).toBe('test-service');
      expect(stats.state).toBe('CLOSED');
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(1); // Mantém contagem de falhas
      expect(stats.config).toBeDefined();
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  describe('getBreaker', () => {
    it('deve criar novo breaker se não existir', () => {
      const breaker = registry.getBreaker('service-a');
      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('deve retornar mesmo breaker para mesmo serviço', () => {
      const breaker1 = registry.getBreaker('service-a');
      const breaker2 = registry.getBreaker('service-a');
      expect(breaker1).toBe(breaker2);
    });

    it('deve criar breakers diferentes para serviços diferentes', () => {
      const breaker1 = registry.getBreaker('service-a');
      const breaker2 = registry.getBreaker('service-b');
      expect(breaker1).not.toBe(breaker2);
    });
  });

  describe('getAllStats', () => {
    it('deve retornar estatísticas de todos os breakers', () => {
      registry.getBreaker('service-a');
      registry.getBreaker('service-b');

      const stats = registry.getAllStats();
      expect(stats).toHaveLength(2);
    });
  });

  describe('resetAll', () => {
    it('deve resetar todos os breakers', () => {
      const breaker1 = registry.getBreaker('service-a');
      const breaker2 = registry.getBreaker('service-b');

      breaker1.recordFailure();
      breaker2.recordFailure();

      registry.resetAll();

      expect(breaker1.getStats().failureCount).toBe(0);
      expect(breaker2.getStats().failureCount).toBe(0);
    });
  });
});

describe('CircuitOpenError', () => {
  it('deve ter mensagem em português', () => {
    const error = new CircuitOpenError('test-service');
    expect(error.message).toContain('temporariamente indisponível');
    expect(error.message).toContain('test-service');
  });

  it('deve ter nome correto', () => {
    const error = new CircuitOpenError('test');
    expect(error.name).toBe('CircuitOpenError');
  });
});
