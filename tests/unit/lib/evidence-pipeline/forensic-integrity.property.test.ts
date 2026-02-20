import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { EvidencePipelineImpl } from '../../../../src/lib/evidence-pipeline/evidence-pipeline';
import { 
  CaptureConfig, 
  CaptureResult, 
  TimestampResult 
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

const mockBlockchainService = {
  register: vi.fn(),
  checkStatus: vi.fn()
};

// Mock Capture Factory
vi.mock('../../../../src/lib/evidence-pipeline/capture-strategy', () => ({
  createCaptureStrategy: vi.fn(() => mockCaptureStrategy),
  CaptureStrategy: vi.fn()
}));

const mockUploadService = {
  upload: vi.fn(),
  cancel: vi.fn(),
  isUploading: vi.fn().mockReturnValue(false)
};

// Setup helper
function setupPipeline() {
  const progressTracker = new ProgressTracker();
  const pipeline = new EvidencePipelineImpl(
    mockTimestampService as any,
    mockUploadService as any,
    mockBlockchainService as any,
    progressTracker
  );
  return { pipeline };
}

describe('EvidencePipeline Forensic Integrity', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Property 26: Integridy of Evidence Data throughout pipeline', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(), // data
        fc.string(), // hash
        async (dataContent, dataHash) => {
          vi.clearAllMocks();
          const { pipeline } = setupPipeline();

          const mockCaptureResult: CaptureResult = {
            evidenceId: 'test-id',
            type: 'screenshot',
            url: 'http://example.com',
            title: 'Test',
            media: {
                blob: new Blob([dataContent]),
                hash: dataHash,
                mimeType: 'image/png',
                sizeBytes: 123
            },
            html: {
                content: '<html></html>',
                hash: 'html-hash',
                sizeBytes: 10
            },
            forensicMetadata: {} as any,
            metadataHash: 'meta-hash',
            merkleRoot: 'merkle-root',
            timestamps: {
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
                durationMs: 100
            },
            isolation: {
                mode: 'full',
                disabledExtensions: [],
                nonDisabledExtensions: []
            }
          };

          // deep clone to verify mutation later
          const originalResult = JSON.parse(JSON.stringify(mockCaptureResult));
          // Blob doesn't survive JSON stringify well in some envs but for validation of structure/hash strings it's fine.
          // Getting explicit hash check is better.

          // 1. Capture
          mockCaptureStrategy.execute.mockResolvedValue(mockCaptureResult);
          const captureRes = await pipeline.startCapture({
            type: 'screenshot',
            url: 'http://example.com',
            tabId: 1,
            windowId: 1,
            storageConfig: { storageClass: 'STANDARD', retentionYears: 5 }
          } as CaptureConfig);
          
          expect(captureRes.media.hash).toBe(dataHash);
          expect(captureRes.merkleRoot).toBe('merkle-root');

          // 2. Timestamp
          mockTimestampService.requestTimestamp.mockResolvedValue({
              type: 'ICP_BRASIL',
              tokenHash: 'token-hash',
              appliedAt: new Date().toISOString(),
              tsa: 'SERPRO',
              merkleRoot: 'merkle-root' 
          });

          await pipeline.applyTimestamp('merkle-root');

          // 3. Upload
          // Verify that upload receives the EXACT result
          mockUploadService.upload.mockResolvedValue({} as any);
          
          await pipeline.uploadToS3(captureRes, {} as TimestampResult);

          expect(mockUploadService.upload).toHaveBeenCalledTimes(1);
          const uploadedResult = mockUploadService.upload.mock.calls[0]?.[0];

          // Verifica que o resultado foi passado para upload
          expect(uploadedResult).toBeDefined();

          // Strict equality check for critical forensic fields
          expect(uploadedResult.media.hash).toBe(originalResult.media.hash);
          expect(uploadedResult.media.hash).toBe(dataHash);
          expect(uploadedResult.merkleRoot).toBe(originalResult.merkleRoot);
          
          // Verify no mutation of the object (if passed by reference)
          expect(captureRes.media.hash).toBe(dataHash);
        }
      )
    );
  });
});
