import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { EvidencePipelineImpl } from '../../../../src/lib/evidence-pipeline/evidence-pipeline';
import { 
  StorageConfig, 
  TimestampResult, 
  BlockchainResult
} from '../../../../src/lib/evidence-pipeline/types';
import { ProgressTracker } from '../../../../src/lib/evidence-pipeline/progress-tracker';

// Mocks
const mockCaptureStrategy = {
  type: 'screenshot',
  execute: vi.fn(),
  cancel: vi.fn(),
  isCapturing: vi.fn().mockReturnValue(false)
};

const mockTimestampService = {
  requestTimestamp: vi.fn()
};

const mockUploadService = {
  upload: vi.fn(),
  cancel: vi.fn(),
  isUploading: vi.fn().mockReturnValue(false)
};

const mockBlockchainService = {
  register: vi.fn(),
  checkStatus: vi.fn()
};

const mockAPIClient = {
  post: vi.fn().mockResolvedValue({ success: true, data: { status: 'PROCESSING' } })
};

// Mock getAPIClient
vi.mock('../../../../src/background/api-client', () => ({
  getAPIClient: vi.fn(() => mockAPIClient),
  APIClient: vi.fn()
}));

// Setup helper
function setupPipeline() {
  const progressTracker = new ProgressTracker();
  const pipeline = new EvidencePipelineImpl(
    { create: () => mockCaptureStrategy } as any,
    mockTimestampService as any,
    mockUploadService as any,
    progressTracker
  );
  
  // Inject services directly to bypass private access restriction for testing
  (pipeline as any).blockchainService = mockBlockchainService;

  return { pipeline, progressTracker };
}

describe('EvidencePipeline Certification Properties', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Property 24: Timestamp included in CertificationResult', async () => {
    // Gera timestamps como inteiros e converte para Date para evitar Date(NaN)
    const validTimestamp = fc.integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 a 2030-12-31
      .map(ts => new Date(ts));
    
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(5, 10, 20),
        validTimestamp,
        async (evidenceId, retentionYears, timestampDate) => {
          vi.clearAllMocks();
          const { pipeline } = setupPipeline();
          
          const storageConfig: StorageConfig = {
            storageClass: 'STANDARD',
            retentionYears: retentionYears as any
          };

          const mockTimestampResult: TimestampResult = {
            type: 'ICP_BRASIL',
            tokenHash: 'mock-token-hash',
            appliedAt: timestampDate.toISOString(),
            tsa: 'SERPRO',
            merkleRoot: 'mock-merkle-root',
            token: new ArrayBuffer(8)
          };
          
          // Inject timestamp result
          (pipeline as any).timestampResult = mockTimestampResult;

          // Mock blockchain success
          const mockBlockchainResult: BlockchainResult = {
            success: true,
            status: 'completed',
            proof: {
              txHashPolygon: '0x123',
              registeredAt: new Date().toISOString()
            }
          };
          mockBlockchainService.register.mockResolvedValue(mockBlockchainResult);
          
          // Mock API approve success
          mockAPIClient.post.mockResolvedValue({ success: true });

          const result = await pipeline.approve(evidenceId, storageConfig);

          expect(result.status).toBe('CERTIFIED');
          expect(result.timestamp).toEqual(mockTimestampResult);
          expect(result.blockchain).toEqual(mockBlockchainResult);
          expect(result.evidenceId).toBe(evidenceId);
          expect(mockAPIClient.post).toHaveBeenCalledWith(
            `/evidence/${evidenceId}/approve`, 
            { confirm: true }
          );
        }
      )
    );
  });

  it('Property 25: Structure of CertificationResult is correct', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(5, 10, 20),
        async (evidenceId, retentionYears) => {
            vi.clearAllMocks();
            const { pipeline } = setupPipeline();
            
            const storageConfig: StorageConfig = {
                storageClass: 'STANDARD',
                retentionYears: retentionYears as any
            };

            const mockTimestampResult: TimestampResult = {
                type: 'NTP_LOCAL', // Fallback scenario
                tokenHash: 'mock-token-hash-fallback',
                appliedAt: new Date().toISOString(),
                tsa: 'LOCAL',
                merkleRoot: 'mock-merkle-fallback'
            };
            (pipeline as any).timestampResult = mockTimestampResult;

            const mockBlockchainResult: BlockchainResult = {
                success: true,
                status: 'completed',
                proof: {
                  txHashArbitrum: '0xabc',
                  registeredAt: new Date().toISOString()
                }
            };
            mockBlockchainService.register.mockResolvedValue(mockBlockchainResult);

            const result = await pipeline.approve(evidenceId, storageConfig);

            // Verify structure keys
            expect(result).toHaveProperty('evidenceId');
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('blockchain');
            expect(result).toHaveProperty('retention');
            
            // Verify types
            expect(typeof result.evidenceId).toBe('string');
            expect(['CERTIFIED', 'PARTIAL', 'FAILED']).toContain(result.status);
            expect(result.retention.years).toBe(retentionYears);
            expect(new Date(result.retention.expiresAt).getTime()).toBeGreaterThan(Date.now());
        }
      )
    );
  });

  it('Should throw error if timestamp result is missing', async () => {
      const { pipeline } = setupPipeline();
      const evidenceId = 'test-id';
      const storageConfig: StorageConfig = { storageClass: 'STANDARD', retentionYears: 5 };

      // Ensure timestampResult is null
      (pipeline as any).timestampResult = null;
      
      // Mock blockchain registration but fail certificate step due to missing timestamp
      mockBlockchainService.register.mockResolvedValue({ success: true, status: 'completed' });

      await expect(pipeline.approve(evidenceId, storageConfig))
        .rejects.toThrow('Dados de timestamp não disponíveis');
  });

});
