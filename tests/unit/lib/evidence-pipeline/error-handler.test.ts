/**
 * Testes unitários e property tests para ErrorHandler do Pipeline de Evidências
 *
 * Testa o tratador de erros que converte exceções em PipelineError estruturado
 * com código, fase e flag de recuperabilidade.
 *
 * **Validates: Requirements 1.6, 11.1, 11.8**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ErrorHandler, errorHandler } from '@lib/evidence-pipeline/error-handler';
import type {
  PipelineError,
  PipelineErrorCode,
  PipelineProgress,
} from '@lib/evidence-pipeline/types';

// ============================================================================
// Constantes para testes
// ============================================================================

/**
 * Todos os códigos de erro válidos do pipeline
 */
const ALL_ERROR_CODES: PipelineErrorCode[] = [
  // Erros de captura
  'CAPTURE_TAB_ACCESS_DENIED',
  'CAPTURE_URL_BLOCKED',
  'CAPTURE_TIMEOUT',
  'CAPTURE_ISOLATION_FAILED',
  'CAPTURE_MEDIA_ERROR',
  // Erros de timestamp
  'TIMESTAMP_SERPRO_ERROR',
  'TIMESTAMP_INVALID_RESPONSE',
  // Erros de upload
  'UPLOAD_PRESIGNED_URL_FAILED',
  'UPLOAD_S3_ERROR',
  'UPLOAD_TIMEOUT',
  'UPLOAD_INTEGRITY_MISMATCH',
  // Erros de preview
  'PREVIEW_EXPIRED',
  'PREVIEW_DISCARDED',
  // Erros de blockchain
  'BLOCKCHAIN_POLYGON_FAILED',
  'BLOCKCHAIN_ARBITRUM_FAILED',
  'BLOCKCHAIN_BOTH_FAILED',
  // Erros gerais
  'AUTH_REQUIRED',
  'INSUFFICIENT_CREDITS',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
];


/**
 * Códigos de erro recuperáveis (permitem retry)
 * Conforme design.md - Tratamento de Erros
 */
const RECOVERABLE_CODES: PipelineErrorCode[] = [
  'CAPTURE_TIMEOUT',
  'CAPTURE_ISOLATION_FAILED',
  'TIMESTAMP_SERPRO_ERROR',
  'UPLOAD_PRESIGNED_URL_FAILED',
  'UPLOAD_S3_ERROR',
  'UPLOAD_TIMEOUT',
  'BLOCKCHAIN_ARBITRUM_FAILED',
  'NETWORK_ERROR',
];

/**
 * Códigos de erro não recuperáveis (fatais)
 */
const NON_RECOVERABLE_CODES: PipelineErrorCode[] = ALL_ERROR_CODES.filter(
  (code) => !RECOVERABLE_CODES.includes(code)
);

/**
 * Nomes de fase válidos do pipeline
 */
const VALID_PHASE_NAMES: PipelineProgress['phaseName'][] = [
  'capture',
  'timestamp',
  'upload',
  'preview',
  'blockchain',
  'certificate',
];

// ============================================================================
// Testes Unitários
// ============================================================================

describe('ErrorHandler - Pipeline de Evidências', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ErrorHandler();
  });

  afterEach(() => {
    handler.unsubscribeAll();
  });

  describe('Criação e Inicialização', () => {
    it('deve criar instância do ErrorHandler', () => {
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(ErrorHandler);
    });

    it('deve exportar instância singleton', () => {
      expect(errorHandler).toBeDefined();
      expect(errorHandler).toBeInstanceOf(ErrorHandler);
    });
  });


  describe('handle()', () => {
    it('deve converter Error em PipelineError estruturado', () => {
      const error = new Error('Network error occurred');
      const result = handler.handle(error, 'upload');

      expect(result).toBeDefined();
      expect(result.code).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.phase).toBe('upload');
      expect(typeof result.recoverable).toBe('boolean');
    });

    it('deve converter string em PipelineError', () => {
      const result = handler.handle('Timeout exceeded', 'capture');

      expect(result).toBeDefined();
      expect(result.code).toBe('CAPTURE_TIMEOUT');
      expect(result.phase).toBe('capture');
    });

    it('deve preservar PipelineError existente', () => {
      const existingError: PipelineError = {
        code: 'UPLOAD_S3_ERROR',
        message: 'Erro no armazenamento',
        phase: 'upload',
        recoverable: true,
      };

      const result = handler.handle(existingError, 'upload');

      expect(result).toEqual(existingError);
    });

    it('deve incluir detalhes com mensagem original', () => {
      const error = new Error('Original error message');
      const result = handler.handle(error, 'capture');

      expect(result.details).toBeDefined();
      expect(result.details?.['originalMessage']).toBe('Original error message');
    });

    it('deve emitir evento para listeners', () => {
      const listener = vi.fn();
      handler.subscribe(listener);

      const error = new Error('Test error');
      handler.handle(error, 'upload');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'upload',
        })
      );
    });
  });


  describe('inferErrorCode()', () => {
    describe('Erros de Captura (phase: capture)', () => {
      it('deve inferir CAPTURE_TAB_ACCESS_DENIED para erros de acesso', () => {
        expect(handler.inferErrorCode('Access denied to tab', 'capture')).toBe('CAPTURE_TAB_ACCESS_DENIED');
        expect(handler.inferErrorCode('Permission denied', 'capture')).toBe('CAPTURE_TAB_ACCESS_DENIED');
      });

      it('deve inferir CAPTURE_URL_BLOCKED para URLs bloqueadas', () => {
        expect(handler.inferErrorCode('URL blocked', 'capture')).toBe('CAPTURE_URL_BLOCKED');
        expect(handler.inferErrorCode('Cannot capture chrome:// pages', 'capture')).toBe('CAPTURE_URL_BLOCKED');
        expect(handler.inferErrorCode('chrome-extension:// not allowed', 'capture')).toBe('CAPTURE_URL_BLOCKED');
      });

      it('deve inferir CAPTURE_TIMEOUT para timeout', () => {
        expect(handler.inferErrorCode('Capture timeout', 'capture')).toBe('CAPTURE_TIMEOUT');
        expect(handler.inferErrorCode('Operation timed out', 'capture')).toBe('CAPTURE_TIMEOUT');
      });

      it('deve inferir CAPTURE_ISOLATION_FAILED para erros de isolamento', () => {
        expect(handler.inferErrorCode('Isolation failed', 'capture')).toBe('CAPTURE_ISOLATION_FAILED');
        expect(handler.inferErrorCode('Failed to disable extension', 'capture')).toBe('CAPTURE_ISOLATION_FAILED');
      });

      it('deve inferir CAPTURE_MEDIA_ERROR para erros de mídia', () => {
        expect(handler.inferErrorCode('Media error', 'capture')).toBe('CAPTURE_MEDIA_ERROR');
        expect(handler.inferErrorCode('Stream error occurred', 'capture')).toBe('CAPTURE_MEDIA_ERROR');
        expect(handler.inferErrorCode('MediaRecorder failed', 'capture')).toBe('CAPTURE_MEDIA_ERROR');
      });
    });

    describe('Erros de Timestamp (phase: timestamp)', () => {
      it('deve inferir TIMESTAMP_SERPRO_ERROR para erros do SERPRO', () => {
        expect(handler.inferErrorCode('SERPRO service unavailable', 'timestamp')).toBe('TIMESTAMP_SERPRO_ERROR');
        expect(handler.inferErrorCode('TSA error', 'timestamp')).toBe('TIMESTAMP_SERPRO_ERROR');
      });

      it('deve inferir TIMESTAMP_INVALID_RESPONSE para respostas inválidas', () => {
        expect(handler.inferErrorCode('Invalid response from server', 'timestamp')).toBe('TIMESTAMP_INVALID_RESPONSE');
      });
    });


    describe('Erros de Upload (phase: upload)', () => {
      it('deve inferir UPLOAD_PRESIGNED_URL_FAILED para erros de URL assinada', () => {
        expect(handler.inferErrorCode('Failed to get presigned URL', 'upload')).toBe('UPLOAD_PRESIGNED_URL_FAILED');
        expect(handler.inferErrorCode('Signed URL error', 'upload')).toBe('UPLOAD_PRESIGNED_URL_FAILED');
      });

      it('deve inferir UPLOAD_TIMEOUT para timeout de upload', () => {
        expect(handler.inferErrorCode('Upload timeout', 'upload')).toBe('UPLOAD_TIMEOUT');
        expect(handler.inferErrorCode('Request timed out', 'upload')).toBe('UPLOAD_TIMEOUT');
      });

      it('deve inferir UPLOAD_INTEGRITY_MISMATCH para erros de integridade', () => {
        expect(handler.inferErrorCode('Integrity check failed', 'upload')).toBe('UPLOAD_INTEGRITY_MISMATCH');
        expect(handler.inferErrorCode('Hash mismatch', 'upload')).toBe('UPLOAD_INTEGRITY_MISMATCH');
        expect(handler.inferErrorCode('Checksum error', 'upload')).toBe('UPLOAD_INTEGRITY_MISMATCH');
      });

      it('deve inferir UPLOAD_S3_ERROR para erros de S3', () => {
        expect(handler.inferErrorCode('S3 error occurred', 'upload')).toBe('UPLOAD_S3_ERROR');
        expect(handler.inferErrorCode('AWS storage failed', 'upload')).toBe('UPLOAD_S3_ERROR');
      });
    });

    describe('Erros de Preview (phase: preview)', () => {
      it('deve inferir PREVIEW_EXPIRED para timeout', () => {
        expect(handler.inferErrorCode('Preview expired', 'preview')).toBe('PREVIEW_EXPIRED');
        expect(handler.inferErrorCode('Approval timeout', 'preview')).toBe('PREVIEW_EXPIRED');
      });

      it('deve inferir PREVIEW_DISCARDED para descarte', () => {
        expect(handler.inferErrorCode('Evidence discarded', 'preview')).toBe('PREVIEW_DISCARDED');
        expect(handler.inferErrorCode('User cancelled', 'preview')).toBe('PREVIEW_DISCARDED');
      });
    });

    describe('Erros de Blockchain (phase: blockchain)', () => {
      it('deve inferir BLOCKCHAIN_POLYGON_FAILED para erros do Polygon', () => {
        expect(handler.inferErrorCode('Polygon transaction failed', 'blockchain')).toBe('BLOCKCHAIN_POLYGON_FAILED');
      });

      it('deve inferir BLOCKCHAIN_ARBITRUM_FAILED para erros do Arbitrum', () => {
        expect(handler.inferErrorCode('Arbitrum transaction failed', 'blockchain')).toBe('BLOCKCHAIN_ARBITRUM_FAILED');
      });
    });


    describe('Erros Gerais (qualquer fase)', () => {
      it('deve inferir AUTH_REQUIRED para erros de autenticação', () => {
        expect(handler.inferErrorCode('Authentication required', 'upload')).toBe('AUTH_REQUIRED');
        expect(handler.inferErrorCode('401 Unauthorized', 'capture')).toBe('AUTH_REQUIRED');
      });

      it('deve inferir INSUFFICIENT_CREDITS para erros de créditos', () => {
        expect(handler.inferErrorCode('Insufficient credits', 'preview')).toBe('INSUFFICIENT_CREDITS');
        expect(handler.inferErrorCode('Saldo insuficiente', 'blockchain')).toBe('INSUFFICIENT_CREDITS');
      });

      it('deve inferir NETWORK_ERROR para erros de rede', () => {
        expect(handler.inferErrorCode('Network error', 'upload')).toBe('NETWORK_ERROR');
        expect(handler.inferErrorCode('Failed to fetch', 'timestamp')).toBe('NETWORK_ERROR');
        expect(handler.inferErrorCode('Connection refused', 'blockchain')).toBe('NETWORK_ERROR');
      });

      it('deve inferir UNKNOWN_ERROR para erros não reconhecidos', () => {
        expect(handler.inferErrorCode('Something went wrong', 'capture')).toBe('UNKNOWN_ERROR');
        expect(handler.inferErrorCode('Unexpected error', 'upload')).toBe('UNKNOWN_ERROR');
      });
    });
  });

  describe('isRecoverable()', () => {
    it('deve retornar true para códigos recuperáveis', () => {
      RECOVERABLE_CODES.forEach((code) => {
        expect(handler.isRecoverable(code)).toBe(true);
      });
    });

    it('deve retornar false para códigos não recuperáveis', () => {
      NON_RECOVERABLE_CODES.forEach((code) => {
        expect(handler.isRecoverable(code)).toBe(false);
      });
    });
  });


  describe('subscribe() e listeners', () => {
    it('deve notificar listener em cada handle()', () => {
      const listener = vi.fn();
      handler.subscribe(listener);

      handler.handle(new Error('Test error'), 'capture');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('deve notificar múltiplos listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      handler.subscribe(listener1);
      handler.subscribe(listener2);

      handler.handle(new Error('Test error'), 'upload');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('deve permitir remover listener via unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = handler.subscribe(listener);

      handler.handle(new Error('First error'), 'capture');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      handler.handle(new Error('Second error'), 'upload');
      expect(listener).toHaveBeenCalledTimes(1); // Não deve ter sido chamado novamente
    });

    it('deve remover todos os listeners com unsubscribeAll', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      handler.subscribe(listener1);
      handler.subscribe(listener2);

      handler.unsubscribeAll();

      handler.handle(new Error('Test error'), 'capture');
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('deve continuar funcionando se listener lançar erro', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Erro no listener');
      });
      const normalListener = vi.fn();

      handler.subscribe(errorListener);
      handler.subscribe(normalListener);

      // Não deve lançar erro
      expect(() => {
        handler.handle(new Error('Test error'), 'capture');
      }).not.toThrow();

      // Listener normal deve ter sido chamado
      expect(normalListener).toHaveBeenCalled();
    });
  });


  describe('Tradução de Mensagens para PT-BR', () => {
    it('deve traduzir mensagens de erro comuns para PT-BR', () => {
      const testCases = [
        { input: 'Access denied', expected: 'Acesso negado à aba' },
        { input: 'Permission denied', expected: 'Permissão negada' },
        { input: 'Timeout occurred', expected: 'Tempo limite excedido' },
        { input: 'Network error', expected: 'Erro de conexão' },
        { input: 'Failed to fetch', expected: 'Falha na requisição' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = handler.handle(new Error(input), 'capture');
        expect(result.message).toBe(expected);
      });
    });

    it('deve usar mensagem padrão do código quando não há tradução específica', () => {
      const result = handler.handle(new Error('Some random error'), 'capture');
      // Deve usar mensagem padrão de UNKNOWN_ERROR
      expect(result.message).toBeDefined();
      expect(result.message.length).toBeGreaterThan(0);
    });
  });
});


// ============================================================================
// Property-Based Tests (fast-check)
// ============================================================================

/**
 * Geradores customizados para property-based testing
 */

/**
 * Gerador de PipelineErrorCode válido
 */
const errorCodeArb: fc.Arbitrary<PipelineErrorCode> = fc.constantFrom(...ALL_ERROR_CODES);

/**
 * Gerador de phaseName válido
 */
const phaseNameArb: fc.Arbitrary<PipelineProgress['phaseName']> = fc.constantFrom(...VALID_PHASE_NAMES);

/**
 * Gerador de mensagem de erro não vazia
 */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 500 });

/**
 * Gerador de Error com mensagem aleatória
 */
const errorArb = errorMessageArb.map((msg) => new Error(msg));

/**
 * Gerador de erro como string
 */
const stringErrorArb = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Gerador de objeto com propriedade message
 */
const objectErrorArb = fc.record({
  message: fc.string({ minLength: 1, maxLength: 200 }),
});


describe('ErrorHandler - Property-Based Tests', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ErrorHandler();
  });

  afterEach(() => {
    handler.unsubscribeAll();
  });

  /**
   * Property 4: Estrutura de Erro
   *
   * **Validates: Requirements 1.6, 11.1, 11.8**
   *
   * *Para qualquer* erro emitido pelo pipeline, o PipelineError SHALL conter:
   * - code: PipelineErrorCode válido
   * - message: string não vazia em PT-BR
   * - phase: phaseName correspondente à fase onde ocorreu
   * - recoverable: booleano consistente com o código de erro
   */
  describe('Property 4: Estrutura de Erro', () => {
    it('code SHALL ser PipelineErrorCode válido para qualquer erro processado', () => {
      fc.assert(
        fc.property(
          errorArb,
          phaseNameArb,
          (error, phase) => {
            const result = handler.handle(error, phase);

            // code deve ser um dos códigos válidos
            expect(result.code).toBeDefined();
            expect(typeof result.code).toBe('string');
            expect(ALL_ERROR_CODES).toContain(result.code);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('code SHALL ser PipelineErrorCode válido para erros string', () => {
      fc.assert(
        fc.property(
          stringErrorArb,
          phaseNameArb,
          (errorMsg, phase) => {
            const result = handler.handle(errorMsg, phase);

            // code deve ser um dos códigos válidos
            expect(result.code).toBeDefined();
            expect(ALL_ERROR_CODES).toContain(result.code);
          }
        ),
        { numRuns: 100 }
      );
    });


    it('code SHALL ser PipelineErrorCode válido para erros objeto', () => {
      fc.assert(
        fc.property(
          objectErrorArb,
          phaseNameArb,
          (errorObj, phase) => {
            const result = handler.handle(errorObj, phase);

            // code deve ser um dos códigos válidos
            expect(result.code).toBeDefined();
            expect(ALL_ERROR_CODES).toContain(result.code);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('message SHALL ser string não vazia para qualquer erro processado', () => {
      fc.assert(
        fc.property(
          errorArb,
          phaseNameArb,
          (error, phase) => {
            const result = handler.handle(error, phase);

            // message deve ser string não vazia
            expect(result.message).toBeDefined();
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('message SHALL ser string não vazia para erros string', () => {
      fc.assert(
        fc.property(
          stringErrorArb,
          phaseNameArb,
          (errorMsg, phase) => {
            const result = handler.handle(errorMsg, phase);

            // message deve ser string não vazia
            expect(result.message).toBeDefined();
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });


    it('phase SHALL corresponder à fase fornecida para qualquer erro', () => {
      fc.assert(
        fc.property(
          errorArb,
          phaseNameArb,
          (error, phase) => {
            const result = handler.handle(error, phase);

            // phase deve ser igual à fase fornecida
            expect(result.phase).toBeDefined();
            expect(typeof result.phase).toBe('string');
            expect(result.phase).toBe(phase);
            expect(VALID_PHASE_NAMES).toContain(result.phase);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('phase SHALL ser phaseName válido para qualquer combinação de erro e fase', () => {
      fc.assert(
        fc.property(
          fc.oneof(errorArb, stringErrorArb, objectErrorArb),
          phaseNameArb,
          (error, phase) => {
            const result = handler.handle(error, phase);

            // phase deve ser um dos nomes de fase válidos
            expect(result.phase).toBeDefined();
            expect(VALID_PHASE_NAMES).toContain(result.phase);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('recoverable SHALL ser booleano para qualquer erro processado', () => {
      fc.assert(
        fc.property(
          errorArb,
          phaseNameArb,
          (error, phase) => {
            const result = handler.handle(error, phase);

            // recoverable deve ser booleano
            expect(result.recoverable).toBeDefined();
            expect(typeof result.recoverable).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });


    it('recoverable SHALL ser consistente com o código de erro', () => {
      fc.assert(
        fc.property(
          errorArb,
          phaseNameArb,
          (error, phase) => {
            const result = handler.handle(error, phase);

            // recoverable deve ser consistente com o código
            const expectedRecoverable = RECOVERABLE_CODES.includes(result.code);
            expect(result.recoverable).toBe(expectedRecoverable);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('recoverable SHALL ser true apenas para códigos recuperáveis', () => {
      fc.assert(
        fc.property(
          errorCodeArb,
          (code) => {
            const isRecoverable = handler.isRecoverable(code);

            if (RECOVERABLE_CODES.includes(code)) {
              expect(isRecoverable).toBe(true);
            } else {
              expect(isRecoverable).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('estrutura completa SHALL ser válida para qualquer tipo de erro', () => {
      fc.assert(
        fc.property(
          fc.oneof(errorArb, stringErrorArb, objectErrorArb),
          phaseNameArb,
          (error, phase) => {
            const result = handler.handle(error, phase);

            // Validar estrutura completa do PipelineError
            // code: PipelineErrorCode válido
            expect(result.code).toBeDefined();
            expect(typeof result.code).toBe('string');
            expect(ALL_ERROR_CODES).toContain(result.code);

            // message: string não vazia
            expect(result.message).toBeDefined();
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);

            // phase: phaseName válido
            expect(result.phase).toBeDefined();
            expect(typeof result.phase).toBe('string');
            expect(result.phase).toBe(phase);
            expect(VALID_PHASE_NAMES).toContain(result.phase);

            // recoverable: booleano consistente
            expect(result.recoverable).toBeDefined();
            expect(typeof result.recoverable).toBe('boolean');
            expect(result.recoverable).toBe(RECOVERABLE_CODES.includes(result.code));
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Consistência de isRecoverable()', () => {
    it('isRecoverable() SHALL retornar resultado consistente para mesmo código', () => {
      fc.assert(
        fc.property(
          errorCodeArb,
          fc.integer({ min: 1, max: 10 }),
          (code, repetitions) => {
            // Chamar múltiplas vezes deve retornar mesmo resultado
            const results: boolean[] = [];
            for (let i = 0; i < repetitions; i++) {
              results.push(handler.isRecoverable(code));
            }

            // Todos os resultados devem ser iguais
            const firstResult = results[0];
            expect(results.every((r) => r === firstResult)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('códigos recuperáveis SHALL sempre retornar true', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...RECOVERABLE_CODES),
          (code) => {
            expect(handler.isRecoverable(code)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('códigos não recuperáveis SHALL sempre retornar false', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...NON_RECOVERABLE_CODES),
          (code) => {
            expect(handler.isRecoverable(code)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Inferência de Código por Fase', () => {
    it('inferErrorCode() SHALL retornar código válido para qualquer mensagem e fase', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          phaseNameArb,
          (message, phase) => {
            const code = handler.inferErrorCode(message, phase);

            // Código deve ser válido
            expect(code).toBeDefined();
            expect(typeof code).toBe('string');
            expect(ALL_ERROR_CODES).toContain(code);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('inferErrorCode() SHALL ser determinístico para mesma entrada', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          phaseNameArb,
          fc.integer({ min: 2, max: 5 }),
          (message, phase, repetitions) => {
            const results: PipelineErrorCode[] = [];
            for (let i = 0; i < repetitions; i++) {
              results.push(handler.inferErrorCode(message, phase));
            }

            // Todos os resultados devem ser iguais
            const firstResult = results[0];
            expect(results.every((r) => r === firstResult)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Emissão de Eventos', () => {
    it('handle() SHALL emitir evento para todos os listeners registrados', () => {
      fc.assert(
        fc.property(
          errorArb,
          phaseNameArb,
          fc.integer({ min: 1, max: 5 }),
          (error, phase, listenerCount) => {
            const newHandler = new ErrorHandler();
            const listeners = Array.from({ length: listenerCount }, () => vi.fn());

            listeners.forEach((listener) => newHandler.subscribe(listener));

            newHandler.handle(error, phase);

            // Todos os listeners devem ter sido chamados exatamente uma vez
            listeners.forEach((listener) => {
              expect(listener).toHaveBeenCalledTimes(1);
            });

            newHandler.unsubscribeAll();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('evento emitido SHALL conter estrutura válida de PipelineError', () => {
      fc.assert(
        fc.property(
          errorArb,
          phaseNameArb,
          (error, phase) => {
            const newHandler = new ErrorHandler();
            let emittedError: PipelineError | null = null;

            newHandler.subscribe((err) => {
              emittedError = err;
            });

            newHandler.handle(error, phase);

            // Evento deve ter sido emitido
            expect(emittedError).not.toBeNull();

            // Estrutura deve ser válida
            expect(ALL_ERROR_CODES).toContain(emittedError!.code);
            expect(emittedError!.message.length).toBeGreaterThan(0);
            expect(emittedError!.phase).toBe(phase);
            expect(typeof emittedError!.recoverable).toBe('boolean');

            newHandler.unsubscribeAll();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
