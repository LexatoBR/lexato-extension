/**
 * Testes unitários e property tests para ProgressTracker do Pipeline de Evidências
 *
 * Testa o gerenciador de progresso que rastreia estado de evidências,
 * emite eventos para listeners e persiste em chrome.storage.local.
 *
 * **Validates: Requirements 1.5, 10.1, 10.2, 10.8, 10.9**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ProgressTracker } from '@lib/evidence-pipeline/progress-tracker';
import type { EvidenceStatus, PipelineProgress } from '@lib/evidence-pipeline/types';

// Mock do chrome.storage.local
const mockStorage: Record<string, unknown> = {};

const mockChromeStorage = {
  local: {
    get: vi.fn((key: string) => {
      return Promise.resolve({ [key]: mockStorage[key] });
    }),
    set: vi.fn((data: Record<string, unknown>) => {
      Object.assign(mockStorage, data);
      return Promise.resolve();
    }),
    remove: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
};

// Configurar mock global do chrome
vi.stubGlobal('chrome', { storage: mockChromeStorage });

describe('ProgressTracker - Pipeline de Evidências', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    // Limpar storage mock
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    // Criar nova instância para cada teste
    tracker = new ProgressTracker();
  });

  afterEach(() => {
    tracker.unsubscribeAll();
  });

  describe('Criação e Inicialização', () => {
    it('deve criar instância do ProgressTracker', () => {
      expect(tracker).toBeDefined();
      expect(tracker).toBeInstanceOf(ProgressTracker);
    });

    it('deve inicializar com cache vazio', () => {
      const all = tracker.getAll();
      expect(all).toEqual([]);
    });

    it('deve carregar dados do storage na inicialização', async () => {
      // Preparar dados no storage
      const storedProgress: PipelineProgress = {
        evidenceId: 'test-123',
        status: 'CAPTURING',
        phase: 1,
        phaseName: 'capture',
        percent: 50,
        message: 'Capturando...',
        updatedAt: new Date().toISOString(),
      };
      mockStorage['lexato_pipeline_progress'] = { 'test-123': storedProgress };

      // Criar novo tracker e inicializar
      const newTracker = new ProgressTracker();
      await newTracker.initialize();

      const progress = newTracker.get('test-123');
      expect(progress).toEqual(storedProgress);
    });

    it('deve continuar funcionando se storage não estiver disponível', async () => {
      // Simular chrome.storage indisponível
      vi.stubGlobal('chrome', undefined);

      const newTracker = new ProgressTracker();
      await newTracker.initialize();

      // Deve funcionar sem erros
      newTracker.update('test-123', { status: 'CAPTURING' });
      const progress = newTracker.get('test-123');
      expect(progress).toBeDefined();
      expect(progress?.status).toBe('CAPTURING');

      // Restaurar mock
      vi.stubGlobal('chrome', { storage: mockChromeStorage });
    });
  });

  describe('update()', () => {
    it('deve criar progresso inicial para nova evidência', () => {
      tracker.update('evidence-001', { status: 'INITIALIZING' });

      const progress = tracker.get('evidence-001');
      expect(progress).toBeDefined();
      expect(progress?.evidenceId).toBe('evidence-001');
      expect(progress?.status).toBe('INITIALIZING');
      expect(progress?.phase).toBe(1);
      expect(progress?.phaseName).toBe('capture');
    });

    it('deve atualizar progresso existente', () => {
      tracker.update('evidence-001', { status: 'INITIALIZING' });
      tracker.update('evidence-001', { status: 'CAPTURING', percent: 25 });

      const progress = tracker.get('evidence-001');
      expect(progress?.status).toBe('CAPTURING');
      expect(progress?.percent).toBe(25);
    });

    it('deve atualizar updatedAt em cada update', async () => {
      tracker.update('evidence-001', { status: 'INITIALIZING' });
      const firstUpdate = tracker.get('evidence-001')?.updatedAt;

      // Aguardar um pouco para garantir timestamp diferente
      await new Promise((resolve) => setTimeout(resolve, 10));

      tracker.update('evidence-001', { status: 'CAPTURING' });
      const secondUpdate = tracker.get('evidence-001')?.updatedAt;

      expect(firstUpdate).toBeDefined();
      expect(secondUpdate).toBeDefined();
      expect(new Date(secondUpdate!).getTime()).toBeGreaterThan(new Date(firstUpdate!).getTime());
    });

    it('deve usar mensagem padrão quando não fornecida', () => {
      tracker.update('evidence-001', { status: 'UPLOADING' });

      const progress = tracker.get('evidence-001');
      expect(progress?.message).toBe('Enviando para armazenamento seguro...');
    });

    it('deve usar mensagem customizada quando fornecida', () => {
      tracker.update('evidence-001', {
        status: 'UPLOADING',
        message: 'Enviando arquivo 2 de 5...',
      });

      const progress = tracker.get('evidence-001');
      expect(progress?.message).toBe('Enviando arquivo 2 de 5...');
    });

    it('deve usar percentual padrão quando não fornecido', () => {
      tracker.update('evidence-001', { status: 'UPLOADED' });

      const progress = tracker.get('evidence-001');
      expect(progress?.percent).toBe(50); // Percentual padrão para UPLOADED
    });

    it('deve usar percentual customizado quando fornecido', () => {
      tracker.update('evidence-001', { status: 'UPLOADING', percent: 75 });

      const progress = tracker.get('evidence-001');
      expect(progress?.percent).toBe(75);
    });

    it('deve atualizar detalhes específicos da fase', () => {
      tracker.update('evidence-001', {
        status: 'UPLOADING',
        details: {
          bytesUploaded: 2500000,
          totalBytes: 5000000,
        },
      });

      const progress = tracker.get('evidence-001');
      expect(progress?.details?.bytesUploaded).toBe(2500000);
      expect(progress?.details?.totalBytes).toBe(5000000);
    });

    it('deve ignorar evidenceId inválido', () => {
      tracker.update('', { status: 'CAPTURING' });
      tracker.update(null as unknown as string, { status: 'CAPTURING' });

      expect(tracker.getAll()).toHaveLength(0);
    });

    it('deve persistir no chrome.storage.local', async () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });

      // Aguardar persistência assíncrona
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockChromeStorage.local.set).toHaveBeenCalled();
    });
  });

  describe('getPhaseInfo()', () => {
    const testCases: Array<{ status: EvidenceStatus; expectedPhase: number; expectedPhaseName: string }> = [
      // Fase 1: Captura
      { status: 'INITIALIZING', expectedPhase: 1, expectedPhaseName: 'capture' },
      { status: 'CAPTURING', expectedPhase: 1, expectedPhaseName: 'capture' },
      { status: 'CAPTURED', expectedPhase: 1, expectedPhaseName: 'capture' },
      { status: 'CAPTURE_FAILED', expectedPhase: 1, expectedPhaseName: 'capture' },

      // Fase 2: Timestamp
      { status: 'TIMESTAMPING', expectedPhase: 2, expectedPhaseName: 'timestamp' },
      { status: 'TIMESTAMPED', expectedPhase: 2, expectedPhaseName: 'timestamp' },
      { status: 'TIMESTAMP_FALLBACK', expectedPhase: 2, expectedPhaseName: 'timestamp' },
      { status: 'TIMESTAMP_FAILED', expectedPhase: 2, expectedPhaseName: 'timestamp' },

      // Fase 3: Upload
      { status: 'UPLOADING', expectedPhase: 3, expectedPhaseName: 'upload' },
      { status: 'UPLOADED', expectedPhase: 3, expectedPhaseName: 'upload' },
      { status: 'UPLOAD_FAILED', expectedPhase: 3, expectedPhaseName: 'upload' },

      // Fase 4: Preview
      { status: 'PENDING_REVIEW', expectedPhase: 4, expectedPhaseName: 'preview' },
      { status: 'APPROVED', expectedPhase: 4, expectedPhaseName: 'preview' },
      { status: 'DISCARDED', expectedPhase: 4, expectedPhaseName: 'preview' },
      { status: 'EXPIRED', expectedPhase: 4, expectedPhaseName: 'preview' },

      // Fase 5: Blockchain
      { status: 'REGISTERING_BLOCKCHAIN', expectedPhase: 5, expectedPhaseName: 'blockchain' },
      { status: 'BLOCKCHAIN_PARTIAL', expectedPhase: 5, expectedPhaseName: 'blockchain' },
      { status: 'BLOCKCHAIN_COMPLETE', expectedPhase: 5, expectedPhaseName: 'blockchain' },
      { status: 'BLOCKCHAIN_FAILED', expectedPhase: 5, expectedPhaseName: 'blockchain' },

      // Fase 6: Certificado
      { status: 'GENERATING_PDF', expectedPhase: 6, expectedPhaseName: 'certificate' },
      { status: 'CERTIFIED', expectedPhase: 6, expectedPhaseName: 'certificate' },
      { status: 'PDF_FAILED', expectedPhase: 6, expectedPhaseName: 'certificate' },
    ];

    testCases.forEach(({ status, expectedPhase, expectedPhaseName }) => {
      it(`deve mapear ${status} para fase ${expectedPhase} (${expectedPhaseName})`, () => {
        const phaseInfo = tracker.getPhaseInfo(status);
        expect(phaseInfo.phase).toBe(expectedPhase);
        expect(phaseInfo.phaseName).toBe(expectedPhaseName);
      });
    });

    it('deve atualizar fase automaticamente baseado no status', () => {
      tracker.update('evidence-001', { status: 'INITIALIZING' });
      expect(tracker.get('evidence-001')?.phase).toBe(1);
      expect(tracker.get('evidence-001')?.phaseName).toBe('capture');

      tracker.update('evidence-001', { status: 'TIMESTAMPING' });
      expect(tracker.get('evidence-001')?.phase).toBe(2);
      expect(tracker.get('evidence-001')?.phaseName).toBe('timestamp');

      tracker.update('evidence-001', { status: 'UPLOADING' });
      expect(tracker.get('evidence-001')?.phase).toBe(3);
      expect(tracker.get('evidence-001')?.phaseName).toBe('upload');

      tracker.update('evidence-001', { status: 'PENDING_REVIEW' });
      expect(tracker.get('evidence-001')?.phase).toBe(4);
      expect(tracker.get('evidence-001')?.phaseName).toBe('preview');

      tracker.update('evidence-001', { status: 'REGISTERING_BLOCKCHAIN' });
      expect(tracker.get('evidence-001')?.phase).toBe(5);
      expect(tracker.get('evidence-001')?.phaseName).toBe('blockchain');

      tracker.update('evidence-001', { status: 'GENERATING_PDF' });
      expect(tracker.get('evidence-001')?.phase).toBe(6);
      expect(tracker.get('evidence-001')?.phaseName).toBe('certificate');
    });
  });

  describe('get() e getAll()', () => {
    it('deve retornar null para evidência inexistente', () => {
      const progress = tracker.get('inexistente');
      expect(progress).toBeNull();
    });

    it('deve retornar progresso existente', () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });

      const progress = tracker.get('evidence-001');
      expect(progress).toBeDefined();
      expect(progress?.evidenceId).toBe('evidence-001');
    });

    it('deve retornar todos os progressos', () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });
      tracker.update('evidence-002', { status: 'UPLOADING' });
      tracker.update('evidence-003', { status: 'CERTIFIED' });

      const all = tracker.getAll();
      expect(all).toHaveLength(3);
      expect(all.map((p) => p.evidenceId)).toContain('evidence-001');
      expect(all.map((p) => p.evidenceId)).toContain('evidence-002');
      expect(all.map((p) => p.evidenceId)).toContain('evidence-003');
    });
  });

  describe('subscribe() e listeners', () => {
    it('deve notificar listener em cada update', () => {
      const listener = vi.fn();
      tracker.subscribe(listener);

      tracker.update('evidence-001', { status: 'CAPTURING' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceId: 'evidence-001',
          status: 'CAPTURING',
        })
      );
    });

    it('deve notificar múltiplos listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      tracker.subscribe(listener1);
      tracker.subscribe(listener2);

      tracker.update('evidence-001', { status: 'CAPTURING' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('deve permitir remover listener via unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = tracker.subscribe(listener);

      tracker.update('evidence-001', { status: 'CAPTURING' });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      tracker.update('evidence-001', { status: 'UPLOADING' });
      expect(listener).toHaveBeenCalledTimes(1); // Não deve ter sido chamado novamente
    });

    it('deve remover todos os listeners com unsubscribeAll', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      tracker.subscribe(listener1);
      tracker.subscribe(listener2);

      tracker.unsubscribeAll();

      tracker.update('evidence-001', { status: 'CAPTURING' });
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('deve continuar funcionando se listener lançar erro', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Erro no listener');
      });
      const normalListener = vi.fn();

      tracker.subscribe(errorListener);
      tracker.subscribe(normalListener);

      // Não deve lançar erro
      expect(() => {
        tracker.update('evidence-001', { status: 'CAPTURING' });
      }).not.toThrow();

      // Listener normal deve ter sido chamado
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('remove() e clear()', () => {
    it('deve remover progresso específico', async () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });
      tracker.update('evidence-002', { status: 'UPLOADING' });

      await tracker.remove('evidence-001');

      expect(tracker.get('evidence-001')).toBeNull();
      expect(tracker.get('evidence-002')).toBeDefined();
    });

    it('deve remover do storage ao remover progresso', async () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });
      await tracker.remove('evidence-001');

      expect(mockChromeStorage.local.set).toHaveBeenCalled();
    });

    it('deve limpar todos os progressos', async () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });
      tracker.update('evidence-002', { status: 'UPLOADING' });

      await tracker.clear();

      expect(tracker.getAll()).toHaveLength(0);
    });

    it('deve limpar storage ao limpar todos os progressos', async () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });
      await tracker.clear();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith('lexato_pipeline_progress');
    });
  });

  describe('Estrutura de PipelineProgress', () => {
    /**
     * Property 3: Estrutura de Progresso
     * Validates: Requirements 1.5, 10.1, 10.2
     *
     * Para qualquer evento de progresso emitido pelo pipeline, o PipelineProgress
     * SHALL conter todos os campos obrigatórios com valores válidos.
     */
    it('deve conter todos os campos obrigatórios', () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });

      const progress = tracker.get('evidence-001');
      expect(progress).toBeDefined();

      // Campos obrigatórios
      expect(progress?.evidenceId).toBeDefined();
      expect(typeof progress?.evidenceId).toBe('string');
      expect(progress?.evidenceId.length).toBeGreaterThan(0);

      expect(progress?.status).toBeDefined();
      expect(typeof progress?.status).toBe('string');

      expect(progress?.phase).toBeDefined();
      expect(typeof progress?.phase).toBe('number');
      expect(progress?.phase).toBeGreaterThanOrEqual(1);
      expect(progress?.phase).toBeLessThanOrEqual(6);

      expect(progress?.phaseName).toBeDefined();
      expect(['capture', 'timestamp', 'upload', 'preview', 'blockchain', 'certificate']).toContain(
        progress?.phaseName
      );

      expect(progress?.percent).toBeDefined();
      expect(typeof progress?.percent).toBe('number');
      expect(progress?.percent).toBeGreaterThanOrEqual(0);
      expect(progress?.percent).toBeLessThanOrEqual(100);

      expect(progress?.message).toBeDefined();
      expect(typeof progress?.message).toBe('string');

      expect(progress?.updatedAt).toBeDefined();
      expect(typeof progress?.updatedAt).toBe('string');
      // Deve ser ISO 8601 válido
      expect(() => new Date(progress!.updatedAt)).not.toThrow();
      expect(new Date(progress!.updatedAt).toISOString()).toBe(progress?.updatedAt);
    });

    it('deve ter updatedAt em formato ISO 8601 válido', () => {
      tracker.update('evidence-001', { status: 'CAPTURING' });

      const progress = tracker.get('evidence-001');
      const date = new Date(progress!.updatedAt);

      expect(date.toString()).not.toBe('Invalid Date');
      expect(progress?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });

  describe('Persistência Round-Trip', () => {
    /**
     * Property 5: Persistência Round-Trip
     * Validates: Requirements 1.7, 10.9
     *
     * Para qualquer estado de evidência salvo no store e persistido em
     * chrome.storage.local, recuperar o estado SHALL produzir um objeto
     * equivalente ao original.
     */
    it('deve recuperar estado equivalente após persistência', async () => {
      // Criar progresso com todos os campos
      const originalProgress: Partial<PipelineProgress> = {
        status: 'UPLOADING',
        percent: 45,
        message: 'Enviando arquivo...',
        details: {
          bytesUploaded: 2500000,
          totalBytes: 5000000,
        },
      };

      tracker.update('evidence-001', originalProgress);

      // Aguardar persistência
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Criar novo tracker e carregar do storage
      const newTracker = new ProgressTracker();
      await newTracker.initialize();

      const recoveredProgress = newTracker.get('evidence-001');

      // Verificar equivalência
      expect(recoveredProgress?.evidenceId).toBe('evidence-001');
      expect(recoveredProgress?.status).toBe('UPLOADING');
      expect(recoveredProgress?.percent).toBe(45);
      expect(recoveredProgress?.message).toBe('Enviando arquivo...');
      expect(recoveredProgress?.details?.bytesUploaded).toBe(2500000);
      expect(recoveredProgress?.details?.totalBytes).toBe(5000000);
      expect(recoveredProgress?.phase).toBe(3);
      expect(recoveredProgress?.phaseName).toBe('upload');
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
 * Gerador de UUID v4 válido
 */
const uuidV4Arb = fc.uuid().filter((uuid) => {
  // Validar formato UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // onde y é 8, 9, a ou b
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
});

/**
 * Gerador de EvidenceStatus válido
 */
const evidenceStatusArb: fc.Arbitrary<EvidenceStatus> = fc.constantFrom(
  // Fase 1: Captura
  'INITIALIZING',
  'CAPTURING',
  'CAPTURED',
  'CAPTURE_FAILED',
  // Fase 2: Timestamp
  'TIMESTAMPING',
  'TIMESTAMPED',
  'TIMESTAMP_FALLBACK',
  'TIMESTAMP_FAILED',
  // Fase 3: Upload
  'UPLOADING',
  'UPLOADED',
  'UPLOAD_FAILED',
  // Fase 4: Preview
  'PENDING_REVIEW',
  'APPROVED',
  'DISCARDED',
  'EXPIRED',
  // Fase 5: Blockchain
  'REGISTERING_BLOCKCHAIN',
  'BLOCKCHAIN_PARTIAL',
  'BLOCKCHAIN_COMPLETE',
  'BLOCKCHAIN_FAILED',
  // Fase 6: Certificado
  'GENERATING_PDF',
  'CERTIFIED',
  'PDF_FAILED'
);

/**
 * Gerador de percentual válido (0-100)
 */
const percentArb = fc.integer({ min: 0, max: 100 });

/**
 * Gerador de mensagem não vazia
 */
const messageArb = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Mapeamento de status para fase esperada
 */
const STATUS_TO_PHASE: Record<EvidenceStatus, { phase: number; phaseName: string }> = {
  // Fase 1: Captura
  INITIALIZING: { phase: 1, phaseName: 'capture' },
  CAPTURING: { phase: 1, phaseName: 'capture' },
  CAPTURED: { phase: 1, phaseName: 'capture' },
  CAPTURE_FAILED: { phase: 1, phaseName: 'capture' },
  // Fase 2: Timestamp
  TIMESTAMPING: { phase: 2, phaseName: 'timestamp' },
  TIMESTAMPED: { phase: 2, phaseName: 'timestamp' },
  TIMESTAMP_FALLBACK: { phase: 2, phaseName: 'timestamp' },
  TIMESTAMP_FAILED: { phase: 2, phaseName: 'timestamp' },
  // Fase 3: Upload
  UPLOADING: { phase: 3, phaseName: 'upload' },
  UPLOADED: { phase: 3, phaseName: 'upload' },
  UPLOAD_FAILED: { phase: 3, phaseName: 'upload' },
  // Fase 4: Preview
  PENDING_REVIEW: { phase: 4, phaseName: 'preview' },
  APPROVED: { phase: 4, phaseName: 'preview' },
  DISCARDED: { phase: 4, phaseName: 'preview' },
  EXPIRED: { phase: 4, phaseName: 'preview' },
  // Fase 5: Blockchain
  REGISTERING_BLOCKCHAIN: { phase: 5, phaseName: 'blockchain' },
  BLOCKCHAIN_PARTIAL: { phase: 5, phaseName: 'blockchain' },
  BLOCKCHAIN_COMPLETE: { phase: 5, phaseName: 'blockchain' },
  BLOCKCHAIN_FAILED: { phase: 5, phaseName: 'blockchain' },
  // Fase 6: Certificado
  GENERATING_PDF: { phase: 6, phaseName: 'certificate' },
  CERTIFIED: { phase: 6, phaseName: 'certificate' },
  PDF_FAILED: { phase: 6, phaseName: 'certificate' },
};

/**
 * Nomes de fase válidos
 */
const VALID_PHASE_NAMES = ['capture', 'timestamp', 'upload', 'preview', 'blockchain', 'certificate'];

describe('ProgressTracker - Property-Based Tests', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    tracker = new ProgressTracker();
  });

  afterEach(() => {
    tracker.unsubscribeAll();
  });

  /**
   * Property 3: Estrutura de Progresso
   *
   * **Validates: Requirements 1.5, 10.1, 10.2**
   *
   * *Para qualquer* evento de progresso emitido pelo pipeline, o PipelineProgress SHALL conter:
   * - evidenceId: string não vazia
   * - status: EvidenceStatus válido
   * - phase: número entre 1 e 6
   * - phaseName: string correspondente à fase
   * - percent: número entre 0 e 100
   * - updatedAt: string ISO 8601 válida
   */
  describe('Property 3: Estrutura de Progresso', () => {
    it('evidenceId SHALL ser string não vazia para qualquer update', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          (evidenceId, status) => {
            tracker.update(evidenceId, { status });
            const progress = tracker.get(evidenceId);

            // evidenceId deve ser string não vazia
            expect(progress).not.toBeNull();
            expect(typeof progress?.evidenceId).toBe('string');
            expect(progress?.evidenceId.length).toBeGreaterThan(0);
            expect(progress?.evidenceId).toBe(evidenceId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('status SHALL ser EvidenceStatus válido para qualquer update', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          (evidenceId, status) => {
            tracker.update(evidenceId, { status });
            const progress = tracker.get(evidenceId);

            // status deve ser um dos valores válidos de EvidenceStatus
            expect(progress).not.toBeNull();
            expect(typeof progress?.status).toBe('string');
            expect(Object.keys(STATUS_TO_PHASE)).toContain(progress?.status);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('phase SHALL ser número entre 1 e 6 para qualquer status', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          (evidenceId, status) => {
            tracker.update(evidenceId, { status });
            const progress = tracker.get(evidenceId);

            // phase deve ser número entre 1 e 6
            expect(progress).not.toBeNull();
            expect(typeof progress?.phase).toBe('number');
            expect(progress?.phase).toBeGreaterThanOrEqual(1);
            expect(progress?.phase).toBeLessThanOrEqual(6);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('phaseName SHALL corresponder à fase para qualquer status', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          (evidenceId, status) => {
            tracker.update(evidenceId, { status });
            const progress = tracker.get(evidenceId);

            // phaseName deve ser um dos valores válidos
            expect(progress).not.toBeNull();
            expect(typeof progress?.phaseName).toBe('string');
            expect(VALID_PHASE_NAMES).toContain(progress?.phaseName);

            // phaseName deve corresponder ao status
            const expectedPhaseInfo = STATUS_TO_PHASE[status];
            expect(progress?.phase).toBe(expectedPhaseInfo.phase);
            expect(progress?.phaseName).toBe(expectedPhaseInfo.phaseName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('percent SHALL ser número entre 0 e 100 para qualquer update', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          percentArb,
          (evidenceId, status, percent) => {
            tracker.update(evidenceId, { status, percent });
            const progress = tracker.get(evidenceId);

            // percent deve ser número entre 0 e 100
            expect(progress).not.toBeNull();
            expect(typeof progress?.percent).toBe('number');
            expect(progress?.percent).toBeGreaterThanOrEqual(0);
            expect(progress?.percent).toBeLessThanOrEqual(100);
            expect(progress?.percent).toBe(percent);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('percent padrão SHALL estar entre 0 e 100 quando não fornecido', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          (evidenceId, status) => {
            // Não fornece percent - deve usar valor padrão
            tracker.update(evidenceId, { status });
            const progress = tracker.get(evidenceId);

            // percent padrão deve estar entre 0 e 100
            expect(progress).not.toBeNull();
            expect(typeof progress?.percent).toBe('number');
            expect(progress?.percent).toBeGreaterThanOrEqual(0);
            expect(progress?.percent).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('updatedAt SHALL ser string ISO 8601 válida para qualquer update', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          (evidenceId, status) => {
            tracker.update(evidenceId, { status });
            const progress = tracker.get(evidenceId);

            // updatedAt deve ser string ISO 8601 válida
            expect(progress).not.toBeNull();
            expect(typeof progress?.updatedAt).toBe('string');
            expect(progress?.updatedAt.length).toBeGreaterThan(0);

            // Deve ser parseable como Date válida
            const date = new Date(progress!.updatedAt);
            expect(date.toString()).not.toBe('Invalid Date');

            // Deve estar no formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
            expect(progress?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

            // Deve ser igual ao toISOString() da data parseada
            expect(date.toISOString()).toBe(progress?.updatedAt);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('message SHALL ser string não vazia para qualquer update', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          (evidenceId, status) => {
            tracker.update(evidenceId, { status });
            const progress = tracker.get(evidenceId);

            // message deve ser string não vazia (usa mensagem padrão)
            expect(progress).not.toBeNull();
            expect(typeof progress?.message).toBe('string');
            expect(progress?.message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('message customizada SHALL ser preservada quando fornecida', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          messageArb,
          (evidenceId, status, message) => {
            tracker.update(evidenceId, { status, message });
            const progress = tracker.get(evidenceId);

            // message customizada deve ser preservada
            expect(progress).not.toBeNull();
            expect(progress?.message).toBe(message);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('estrutura completa SHALL ser válida para qualquer combinação de inputs', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          percentArb,
          messageArb,
          (evidenceId, status, percent, message) => {
            tracker.update(evidenceId, { status, percent, message });
            const progress = tracker.get(evidenceId);

            // Validar estrutura completa
            expect(progress).not.toBeNull();

            // evidenceId: string não vazia
            expect(typeof progress?.evidenceId).toBe('string');
            expect(progress?.evidenceId.length).toBeGreaterThan(0);

            // status: EvidenceStatus válido
            expect(Object.keys(STATUS_TO_PHASE)).toContain(progress?.status);

            // phase: número entre 1 e 6
            expect(progress?.phase).toBeGreaterThanOrEqual(1);
            expect(progress?.phase).toBeLessThanOrEqual(6);

            // phaseName: string correspondente à fase
            expect(VALID_PHASE_NAMES).toContain(progress?.phaseName);

            // percent: número entre 0 e 100
            expect(progress?.percent).toBeGreaterThanOrEqual(0);
            expect(progress?.percent).toBeLessThanOrEqual(100);

            // updatedAt: string ISO 8601 válida
            const date = new Date(progress!.updatedAt);
            expect(date.toString()).not.toBe('Invalid Date');
            expect(date.toISOString()).toBe(progress?.updatedAt);

            // message: string não vazia
            expect(typeof progress?.message).toBe('string');
            expect(progress?.message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3 - Consistência de Fase e PhaseName', () => {
    /**
     * **Validates: Requirements 10.1**
     *
     * Verifica que phase e phaseName são sempre consistentes entre si
     */
    it('phase e phaseName SHALL ser consistentes para todos os status', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          (evidenceId, status) => {
            tracker.update(evidenceId, { status });
            const progress = tracker.get(evidenceId);

            expect(progress).not.toBeNull();

            // Mapeamento esperado de phase para phaseName
            const phaseToName: Record<number, string> = {
              1: 'capture',
              2: 'timestamp',
              3: 'upload',
              4: 'preview',
              5: 'blockchain',
              6: 'certificate',
            };

            // phase e phaseName devem ser consistentes
            expect(phaseToName[progress!.phase]).toBe(progress?.phaseName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getPhaseInfo SHALL retornar valores consistentes para todos os status', () => {
      fc.assert(
        fc.property(
          evidenceStatusArb,
          (status) => {
            const phaseInfo = tracker.getPhaseInfo(status);

            // phase deve estar entre 1 e 6
            expect(phaseInfo.phase).toBeGreaterThanOrEqual(1);
            expect(phaseInfo.phase).toBeLessThanOrEqual(6);

            // phaseName deve ser válido
            expect(VALID_PHASE_NAMES).toContain(phaseInfo.phaseName);

            // Deve corresponder ao mapeamento esperado
            const expected = STATUS_TO_PHASE[status];
            expect(phaseInfo.phase).toBe(expected.phase);
            expect(phaseInfo.phaseName).toBe(expected.phaseName);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3 - Emissão de Eventos de Progresso', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * THE Pipeline SHALL emitir eventos de progresso via PipelineProgressCallback
     * a cada mudança de estado
     */
    it('listener SHALL receber PipelineProgress válido para qualquer update', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          evidenceStatusArb,
          percentArb,
          (evidenceId, status, percent) => {
            let receivedProgress: PipelineProgress | null = null;

            const unsubscribe = tracker.subscribe((progress) => {
              receivedProgress = progress;
            });

            tracker.update(evidenceId, { status, percent });

            // Listener deve ter recebido o progresso
            expect(receivedProgress).not.toBeNull();

            // Validar estrutura do progresso recebido (com type guard)
            if (receivedProgress !== null) {
              const progress = receivedProgress as PipelineProgress;
              expect(progress.evidenceId).toBe(evidenceId);
              expect(progress.status).toBe(status);
              expect(progress.percent).toBe(percent);
              expect(progress.phase).toBeGreaterThanOrEqual(1);
              expect(progress.phase).toBeLessThanOrEqual(6);
              expect(VALID_PHASE_NAMES).toContain(progress.phaseName);

              // updatedAt deve ser ISO 8601 válido
              const date = new Date(progress.updatedAt);
              expect(date.toString()).not.toBe('Invalid Date');
            }

            unsubscribe();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('múltiplos updates SHALL emitir eventos com estrutura válida', () => {
      fc.assert(
        fc.property(
          uuidV4Arb,
          fc.array(evidenceStatusArb, { minLength: 2, maxLength: 10 }),
          (evidenceId, statuses) => {
            const receivedProgresses: PipelineProgress[] = [];

            const unsubscribe = tracker.subscribe((progress) => {
              receivedProgresses.push(progress);
            });

            // Aplicar múltiplos updates
            for (const status of statuses) {
              tracker.update(evidenceId, { status });
            }

            // Deve ter recebido um evento para cada update
            expect(receivedProgresses.length).toBe(statuses.length);

            // Cada evento deve ter estrutura válida
            for (const progress of receivedProgresses) {
              expect(progress.evidenceId).toBe(evidenceId);
              expect(Object.keys(STATUS_TO_PHASE)).toContain(progress.status);
              expect(progress.phase).toBeGreaterThanOrEqual(1);
              expect(progress.phase).toBeLessThanOrEqual(6);
              expect(VALID_PHASE_NAMES).toContain(progress.phaseName);
              expect(progress.percent).toBeGreaterThanOrEqual(0);
              expect(progress.percent).toBeLessThanOrEqual(100);

              const date = new Date(progress.updatedAt);
              expect(date.toString()).not.toBe('Invalid Date');
            }

            unsubscribe();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
