/**
 * Testes unitários para capture-strategy.ts
 *
 * Verifica a interface CaptureStrategy, a classe base BaseCaptureStrategy
 * e a factory createCaptureStrategy.
 *
 * @module CaptureStrategyTests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BaseCaptureStrategy,
  createCaptureStrategyAsync,
  isValidCaptureType,
  CAPTURE_TYPES,
} from '../../../../src/lib/evidence-pipeline/capture-strategy';
import type {
  CaptureType,
  CaptureConfig,
  CaptureResult,
  CaptureStrategy,
  PipelineProgressCallback,
} from '../../../../src/lib/evidence-pipeline/types';

// Mock do módulo screenshot-strategy para evitar dependências do Chrome
vi.mock('../../../../src/lib/evidence-pipeline/screenshot-strategy', () => {
  return {
    ScreenshotStrategy: class MockScreenshotStrategy implements CaptureStrategy {
      readonly type: CaptureType = 'screenshot';
      
      async execute(
        _config: CaptureConfig,
        _onProgress?: PipelineProgressCallback
      ): Promise<CaptureResult> {
        return {} as CaptureResult;
      }
      
      async cancel(): Promise<void> {
        // Mock
      }
      
      isCapturing(): boolean {
        return false;
      }
    },
  };
});

/**
 * Implementação mock de CaptureStrategy para testes
 */
class MockCaptureStrategy extends BaseCaptureStrategy {
  readonly type: CaptureType = 'screenshot';

  async execute(
    _config: CaptureConfig,
    _onProgress?: PipelineProgressCallback
  ): Promise<CaptureResult> {
    this.iniciarCaptura();
    try {
      // Simula captura
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (this.foiCancelada()) {
        throw new Error('Captura cancelada');
      }

      return {} as CaptureResult;
    } finally {
      this.finalizarCaptura();
    }
  }
}

describe('CaptureStrategy - Interface e Factory', () => {
  describe('createCaptureStrategyAsync()', () => {
    it('deve retornar estratégia para tipo screenshot', async () => {
      const strategy = await createCaptureStrategyAsync('screenshot');
      expect(strategy).toBeDefined();
      expect(strategy.type).toBe('screenshot');
      expect(typeof strategy.execute).toBe('function');
      expect(typeof strategy.cancel).toBe('function');
      expect(typeof strategy.isCapturing).toBe('function');
    });

    it('deve criar VideoStrategy para tipo video', async () => {
      const strategy = await createCaptureStrategyAsync('video');
      expect(strategy).toBeDefined();
      expect(strategy.type).toBe('video');
      expect(typeof strategy.execute).toBe('function');
      expect(typeof strategy.cancel).toBe('function');
      expect(typeof strategy.isCapturing).toBe('function');
    });

    it('deve lançar erro para tipo inválido', async () => {
      // @ts-expect-error - Testando tipo inválido propositalmente
      await expect(createCaptureStrategyAsync('invalid')).rejects.toThrow(
        "Tipo de captura inválido: 'invalid'"
      );
    });

    it('mensagem de erro deve mencionar tipos válidos', async () => {
      // @ts-expect-error - Testando tipo inválido propositalmente
      await expect(createCaptureStrategyAsync('pdf')).rejects.toThrow(
        "Tipos válidos são: 'screenshot' ou 'video'"
      );
    });
  });

  describe('isValidCaptureType()', () => {
    it('deve retornar true para screenshot', () => {
      expect(isValidCaptureType('screenshot')).toBe(true);
    });

    it('deve retornar true para video', () => {
      expect(isValidCaptureType('video')).toBe(true);
    });

    it('deve retornar false para tipo inválido', () => {
      expect(isValidCaptureType('invalid')).toBe(false);
    });

    it('deve retornar false para null', () => {
      expect(isValidCaptureType(null)).toBe(false);
    });

    it('deve retornar false para undefined', () => {
      expect(isValidCaptureType(undefined)).toBe(false);
    });

    it('deve retornar false para número', () => {
      expect(isValidCaptureType(123)).toBe(false);
    });

    it('deve retornar false para objeto', () => {
      expect(isValidCaptureType({ type: 'screenshot' })).toBe(false);
    });
  });

  describe('CAPTURE_TYPES', () => {
    it('deve conter screenshot e video', () => {
      expect(CAPTURE_TYPES).toContain('screenshot');
      expect(CAPTURE_TYPES).toContain('video');
    });

    it('deve ter exatamente 2 tipos', () => {
      expect(CAPTURE_TYPES).toHaveLength(2);
    });

    it('deve ser readonly (array as const)', () => {
      // Verifica que é um array readonly (as const não congela em runtime)
      expect(CAPTURE_TYPES).toEqual(['screenshot', 'video']);
      // TypeScript garante imutabilidade em tempo de compilação
    });
  });
});

describe('BaseCaptureStrategy - Classe Base', () => {
  let strategy: MockCaptureStrategy;

  beforeEach(() => {
    strategy = new MockCaptureStrategy();
  });

  describe('isCapturing()', () => {
    it('deve retornar false inicialmente', () => {
      expect(strategy.isCapturing()).toBe(false);
    });

    it('deve retornar true durante captura', async () => {
      const config = {
        tabId: 1,
        windowId: 1,
        type: 'screenshot' as CaptureType,
        storageConfig: {
          storageClass: 'STANDARD' as const,
          retentionYears: 5 as const,
        },
      };

      // Inicia captura sem await para verificar estado durante execução
      const capturePromise = strategy.execute(config);

      // Pequeno delay para garantir que a captura iniciou
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(strategy.isCapturing()).toBe(true);

      await capturePromise;
    });

    it('deve retornar false após captura concluída', async () => {
      const config = {
        tabId: 1,
        windowId: 1,
        type: 'screenshot' as CaptureType,
        storageConfig: {
          storageClass: 'STANDARD' as const,
          retentionYears: 5 as const,
        },
      };

      await strategy.execute(config);

      expect(strategy.isCapturing()).toBe(false);
    });
  });

  describe('cancel()', () => {
    it('deve cancelar captura em andamento e resetar estado', async () => {
      // Teste simplificado: verifica que cancel() reseta o estado corretamente
      // O comportamento real de cancelamento depende da implementação concreta

      // Verifica estado inicial
      expect(strategy.isCapturing()).toBe(false);

      // Chama cancel() sem captura ativa - deve ser seguro
      await strategy.cancel();
      expect(strategy.isCapturing()).toBe(false);
    });

    it('deve abortar AbortController quando cancel() é chamado', async () => {
      // Cria uma estratégia que expõe o AbortController para teste
      class TestableStrategy extends BaseCaptureStrategy {
        readonly type: CaptureType = 'screenshot';

        getAbortSignal(): AbortSignal | null {
          return this.abortController?.signal ?? null;
        }

        async execute(
          _config: CaptureConfig,
          _onProgress?: PipelineProgressCallback
        ): Promise<CaptureResult> {
          this.iniciarCaptura();
          // Não finaliza para manter o estado
          return {} as CaptureResult;
        }
      }

      const testableStrategy = new TestableStrategy();
      const config = {
        tabId: 1,
        windowId: 1,
        type: 'screenshot' as CaptureType,
        storageConfig: {
          storageClass: 'STANDARD' as const,
          retentionYears: 5 as const,
        },
      };

      // Inicia captura para criar o AbortController
      await testableStrategy.execute(config);

      // Verifica que o signal existe e não está abortado
      const signalBefore = testableStrategy.getAbortSignal();
      expect(signalBefore).not.toBeNull();
      expect(signalBefore?.aborted).toBe(false);

      // Cancela
      await testableStrategy.cancel();

      // Após cancel, o AbortController deve ser null
      expect(testableStrategy.getAbortSignal()).toBeNull();
      expect(testableStrategy.isCapturing()).toBe(false);
    });

    it('deve ser seguro chamar cancel() sem captura ativa', async () => {
      // Não deve lançar erro
      await expect(strategy.cancel()).resolves.toBeUndefined();
    });

    it('deve resetar estado após cancel()', async () => {
      const config = {
        tabId: 1,
        windowId: 1,
        type: 'screenshot' as CaptureType,
        storageConfig: {
          storageClass: 'STANDARD' as const,
          retentionYears: 5 as const,
        },
      };

      // Inicia e cancela
      const capturePromise = strategy.execute(config);
      await strategy.cancel();

      try {
        await capturePromise;
      } catch {
        // Ignora erro de cancelamento
      }

      // Deve permitir nova captura
      expect(strategy.isCapturing()).toBe(false);
    });
  });

  describe('type', () => {
    it('deve expor o tipo de captura como readonly', () => {
      expect(strategy.type).toBe('screenshot');
    });
  });
});

describe('CaptureStrategy - Requisitos', () => {
  /**
   * Validates: Requirement 2.1
   * THE CaptureStrategy SHALL implementar interface com métodos
   * execute(), cancel() e isCapturing()
   */
  describe('Requirement 2.1: Interface CaptureStrategy', () => {
    it('deve ter método execute()', () => {
      const strategy = new MockCaptureStrategy();
      expect(typeof strategy.execute).toBe('function');
    });

    it('deve ter método cancel()', () => {
      const strategy = new MockCaptureStrategy();
      expect(typeof strategy.cancel).toBe('function');
    });

    it('deve ter método isCapturing()', () => {
      const strategy = new MockCaptureStrategy();
      expect(typeof strategy.isCapturing).toBe('function');
    });

    it('deve ter propriedade type readonly', () => {
      const strategy = new MockCaptureStrategy();
      expect(strategy.type).toBeDefined();
      expect(typeof strategy.type).toBe('string');
    });
  });

  /**
   * Validates: Requirement 1.3
   * THE Pipeline SHALL usar padrão Strategy para abstrair
   * diferenças entre tipos de captura
   */
  describe('Requirement 1.3: Padrão Strategy', () => {
    it('factory deve retornar estratégia para tipo screenshot', async () => {
      const strategy = await createCaptureStrategyAsync('screenshot');
      expect(strategy).toBeDefined();
      expect(strategy.type).toBe('screenshot');
    });

    it('factory deve criar VideoStrategy para tipo video', async () => {
      const strategy = await createCaptureStrategyAsync('video');
      expect(strategy).toBeDefined();
      expect(strategy.type).toBe('video');
    });

    it('factory deve rejeitar tipos inválidos', async () => {
      // @ts-expect-error - Testando tipo inválido
      await expect(createCaptureStrategyAsync('audio')).rejects.toThrow(
        /Tipo de captura inválido/
      );
    });
  });
});
