
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { EvidencePipelineImpl } from '../../../../src/lib/evidence-pipeline/evidence-pipeline';

// Mocks
const mockCaptureStrategy = {
  execute: vi.fn(),
  isCapturing: vi.fn().mockReturnValue(false)
};

vi.mock('../../../../src/lib/evidence-pipeline/capture-strategy', () => ({
  createCaptureStrategy: vi.fn(() => mockCaptureStrategy)
}));

const mockTimestampService = {
  requestTimestamp: vi.fn()
};

vi.mock('../../../../src/lib/evidence-pipeline/timestamp-service', () => {
    return {
        TimestampService: vi.fn().mockImplementation(() => mockTimestampService)
    };
});

const mockUploadService = {
  upload: vi.fn()
};

vi.mock('../../../../src/lib/evidence-pipeline/upload-service', () => {
    return {
        UploadService: vi.fn().mockImplementation(() => mockUploadService)
    };
});

const mockProgressTracker = {
  update: vi.fn(),
  onProgress: vi.fn(),
  get: vi.fn()
};

vi.mock('../../../../src/lib/evidence-pipeline/progress-tracker', () => {
    return {
        ProgressTracker: vi.fn().mockImplementation(() => mockProgressTracker)
    };
});

const mockErrorHandler = {
  handle: vi.fn(),
  onError: vi.fn(),
  inferErrorCode: vi.fn()
};

vi.mock('../../../../src/lib/evidence-pipeline/error-handler', () => {
    return {
        ErrorHandler: vi.fn().mockImplementation(() => mockErrorHandler)
    };
});

// Mock Chrome Storage
const mockChromeStorage = {
    local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined)
    }
};
global.chrome = {
    storage: mockChromeStorage,
    runtime: { getURL: (p: string) => p },
    tabs: { create: vi.fn().mockResolvedValue({id: 1}) }
} as unknown as typeof chrome;


describe('EvidencePipeline Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default behaviors
    mockCaptureStrategy.execute.mockImplementation(async (config) => ({
      evidenceId: 'mock-uuid',
      type: config.type,
      media: { sizeBytes: 1000, hash: 'h1', blob: new Blob(['']) },
      html: { sizeBytes: 500, hash: 'h2', content: '' },
      metadataHash: 'h3',
      merkleRoot: 'mock-root',
      timestamps: { startedAt: '', endedAt: '', durationMs: 0 },
      isolation: { mode: 'full', disabledExtensions: [], nonDisabledExtensions: [] }
    }));

    mockTimestampService.requestTimestamp.mockResolvedValue({
      type: 'ICP_BRASIL',
      tokenHash: 'th',
      appliedAt: new Date().toISOString(),
      tsa: 'SERPRO',
      merkleRoot: 'mock-root'
    });

    mockUploadService.upload.mockResolvedValue({
       evidenceId: 'mock-uuid',
       urls: { media: 'u1', html: 'u2', metadata: 'u3', hashes: 'u4', timestamp: 'u5' },
       s3Keys: { media: 'k1', html: 'k2', metadata: 'k3', hashes: 'k4', timestamp: 'k5'},
       uploadMethod: 'simple',
       stats: { totalBytes: 1500, durationMs: 100 }
    });
  });

  // Property 2: Sequência de Status por Fase
  it('should follow correct status sequence: Capture -> Timestamp -> Upload', async () => {
      // Arbitrary config
      const arbitraryConfig = fc.record({
         tabId: fc.integer({min: 1}),
         windowId: fc.integer({min: 1}),
         type: fc.constantFrom('video', 'screenshot'),
         storageConfig: fc.record({
             storageClass: fc.constant('STANDARD'),
             retentionYears: fc.constant(5)
         })
      });

      await fc.assert(
        fc.asyncProperty(arbitraryConfig, async (config) => {
           vi.clearAllMocks();
           const pipeline = new EvidencePipelineImpl();
           
           // Track status updates
           const statusUpdates: string[] = [];
           mockProgressTracker.update.mockImplementation((_id: string, p: { status?: string } | undefined) => {
               if (p?.status) statusUpdates.push(p.status);
           });

           // 1. Capture
           const captureResult = await pipeline.startCapture(config as any);
           expect(mockCaptureStrategy.execute).toHaveBeenCalled();
           
           // 2. Timestamp
           const timestampResult = await pipeline.applyTimestamp(captureResult.merkleRoot);
           expect(mockTimestampService.requestTimestamp).toHaveBeenCalledWith(captureResult.merkleRoot);

           // 3. Upload
           await pipeline.uploadToS3(captureResult, timestampResult);
           expect(mockUploadService.upload).toHaveBeenCalled();

           // Verification
           // Sequence check: CAPTURED -> TIMESTAMPING -> TIMESTAMPED -> UPLOADING -> UPLOADED
           // Note: startCapture updates status via 'onStrategyProgress' AND final 'CAPTURED'.
           // activeStrategy.execute in valid implementation calls progress callback.
           // Our mock strategy logic above doesn't call the callback unless we make it.
           // But 'startCapture' calls 'CAPTURED' at the end.
           
           // 'applyTimestamp' calls 'TIMESTAMPING' then 'TIMESTAMPED' (or fallback)
           
           // 'uploadToS3' calls 'UPLOADING' then 'UPLOADED'
           
           const expectedSequence = ['CAPTURED', 'TIMESTAMPING', 'TIMESTAMPED', 'UPLOADING', 'UPLOADED'];
           const filteredUpdates = statusUpdates.filter(s => expectedSequence.includes(s));
           
           // Remove duplicates (ProgressTracker might be called multiple times with same status but different percent)
           // Effectively, we want to see the transition order.
           const uniqueTransitions = filteredUpdates.filter((val, idx, arr) => idx === 0 || val !== arr[idx - 1]);
           
           expect(uniqueTransitions).toEqual(expectedSequence);
        })
      );
  });

  // Property 6: UUID v4 Válido
  it('should generate valid UUIDs for evidence', async () => {
      // Actually usually UUID is generated inside CaptureStrategy.
      // But EvidencePipeline relies on it.
      // Let's modify the mock to return a random UUID derived from fc if we want to test pass-through.
      // But here we are testing the pipeline logic.
      // The pipeline uses the UUID from the result.
      // We verified UUID usage in ProgressTracker update.
      
      const arbitraryUuid = fc.uuid();
      
      await fc.assert(
          fc.asyncProperty(arbitraryUuid, async (uuid) => {
             vi.clearAllMocks();
             mockCaptureStrategy.execute.mockResolvedValueOnce({
                 evidenceId: uuid,
                 // ... other fields
                 media: { sizeBytes: 0 },
                 html: { sizeBytes: 0 },
                 timestamps: {}
             });

             const pipeline = new EvidencePipelineImpl();
             const result = await pipeline.startCapture({ type: 'screenshot' } as any);
             
             expect(result.evidenceId).toBe(uuid);
             expect(mockProgressTracker.update).toHaveBeenCalledWith(uuid, expect.anything());
          })
      );
  });
});
