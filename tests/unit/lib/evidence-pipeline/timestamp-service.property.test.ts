/**
 * Testes de Propriedade para TimestampService
 *
 * Valida a robustez do serviço de timestamp, incluindo:
 * - Retentativas com backoff (simulado)
 * - Fallback para NTP
 * - Integridade do retorno (Merkle Root preservado)
 *
 * @module TimestampServicePropertyTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { TimestampService } from '../../../../src/lib/evidence-pipeline/timestamp-service';
import type { APIClient } from '../../../../src/background/api-client';

// Mock do crypto-helper
vi.mock('../../../../src/lib/evidence-pipeline/crypto-helper', () => ({
  calcularHashSHA256: vi.fn(async (data: string) => `hash-of-${data.substring(0, 20)}`),
}));

// Mock do ApiClient
const mockPost = vi.fn();
const mockGet = vi.fn();
const mockApiClient = {
  post: mockPost,
  get: mockGet,
} as unknown as APIClient;

describe('TimestampService - Property Tests', () => {
  let service: TimestampService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new TimestampService(mockApiClient); // Injeção de dependência para teste
    
    // Mock do delay para não demorar nos testes
    (service as any).delay = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 10: Timestamp com Merkle Root Correto (Cenário Sucesso ICP-Brasil)
   */
  it('Property 10: deve retornar timestamp ICP-Brasil válido quando API responde sucesso', async () => {
    // Gera timestamps como inteiros e converte para Date para evitar Date(NaN)
    const validTimestamp = fc.integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 a 2030-12-31
      .map(ts => new Date(ts));
    
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10 }), // merkleRoot
        validTimestamp, // appliedAt - apenas datas válidas
        async (merkleRoot, date) => {
          mockPost.mockClear(); // Limpar histórico de chamadas anterior
          
          // Setup: API retorna sucesso imediato
          mockPost.mockResolvedValueOnce({
            success: true,
            data: {
              token: 'bW9jay10b2tlbg==', // mock-token base64
              tokenHash: 'mock-token-hash',
              appliedAt: date.toISOString(),
              tsa: 'SERPRO',
              accuracy: 100
            }
          });

          const result = await service.requestTimestamp(merkleRoot);

          expect(result.type).toBe('ICP_BRASIL');
          expect(result.merkleRoot).toBe(merkleRoot);
          expect(result.tsa).toBe('SERPRO');
          expect(result.appliedAt).toBe(date.toISOString());
          expect(result.warning).toBeUndefined();
          expect(mockPost).toHaveBeenCalledTimes(1);
        }
      )
    );
  });

  /**
   * Property 12 & 13: Retry e Fallback
   * Simula falhas consecutivas e verifica fallback para NTP
   */
  it('Property 12 & 13: deve tentar retry e fazer fallback para NTP se falhar', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10 }), // merkleRoot
        async (merkleRoot) => {
          vi.clearAllMocks();

          // Configura mockPost para falhar 3 vezes (retry)
          mockPost.mockRejectedValue(new Error('API Down'));

          // Configura mockGet (NTP) para sucesso
          mockGet.mockResolvedValueOnce({
            success: true,
            data: {
              timestamp: new Date().toISOString(),
              accuracy: 50,
              source: 'br.pool.ntp.org'
            }
          });

          const result = await service.requestTimestamp(merkleRoot);

          // Deve ter tentado 3 vezes o POST (initial + 2 retries = 3 attempts total according to implementation loop)
          // Na implementação: for (attempt=0; attempt < 3) => 3 chamadas
          expect(mockPost).toHaveBeenCalledTimes(3);
          
          // Deve ter chamado NTP
          expect(mockGet).toHaveBeenCalledWith('/time/ntp');
          
          // Resultado deve ser Fallback
          expect(result.type).toBe('NTP_LOCAL');
          expect(result.merkleRoot).toBe(merkleRoot);
          expect(result.warning).toBeDefined();
        }
      )
    );
  });
  
  /**
   * Property: Fallback para Local Time (Worst Case)
   */
  it('Property: deve fazer fallback para tempo local se ICP e NTP falharem', async () => {
      await fc.assert(
          fc.asyncProperty(
               fc.string({ minLength: 10 }),
               async (merkleRoot) => {
                   vi.clearAllMocks();
                   // Falha completa
                   mockPost.mockRejectedValue(new Error('ICP Fail'));
                   mockGet.mockRejectedValue(new Error('NTP Fail'));
                   
                   const result = await service.requestTimestamp(merkleRoot);
                   
                   expect(result.type).toBe('NTP_LOCAL');
                   expect(result.tsa).toBe('LOCAL');
                   expect(result.warning).toContain('Relógio local não confiável');
               }
          )
      );
  });
});
