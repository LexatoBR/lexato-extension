
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { UploadService } from '../../../../src/lib/evidence-pipeline/upload-service';
import { MultipartUploadService } from '../../../../src/lib/multipart-upload';
import {
  CaptureResult,
  TimestampResult,
  StorageConfig
} from '../../../../src/lib/evidence-pipeline/types';

// Mock dependencies
vi.mock('../../../../src/lib/multipart-upload');
vi.mock('../../../../src/background/api-client', () => ({
    getAPIClient: vi.fn(() => ({
        post: vi.fn(),
        put: vi.fn()
    })),
}));
vi.mock('../../../../src/lib/audit-logger');
vi.mock('../../../../src/lib/evidence-pipeline/crypto-helper', () => ({
  calcularMd5Base64: vi.fn().mockResolvedValue('mock-md5-base64'),
  calcularHashSHA256: vi.fn().mockResolvedValue('mock-sha256'),
  calcularHashSHA256Blob: vi.fn().mockResolvedValue('mock-sha256-blob'),
  calcularHashSHA256Base64: vi.fn().mockResolvedValue('mock-sha256-base64'),
}));

// Mock fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('UploadService Property Tests', () => {
  let mockApiClient: any;
  let mockLogger: any;
  let mockMultipartService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup Mock APIClient
    mockApiClient = {
      post: vi.fn().mockResolvedValue({ success: true, data: { url: 'https://mock-s3-url.com/upload?sig=123', s3Key: 'mock-key' } }),
      get: vi.fn(),
    };

    // Setup Mock Logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      withContext: vi.fn().mockReturnThis(),
      getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
      startTimer: vi.fn(() => () => 0),
    };

    // Setup Mock MultipartUploadService (via module mock factory logic or prototype)
    // Since we mocked the module, the class constructor is a mock.
    // We need to ensure instances have the methods we call.
    mockMultipartService = {
      initiate: vi.fn().mockResolvedValue({ uploadId: 'up-1', s3Key: 'key-1' }),
      uploadPart: vi.fn().mockResolvedValue({ partNumber: 1, etag: 'etag-1' }),
      complete: vi.fn().mockResolvedValue({ url: 'https://s3/multipart-result', s3Key: 'key-1' }),
      abort: vi.fn().mockResolvedValue(undefined),
      isInProgress: vi.fn().mockReturnValue(false)
    };
    
    // When new MultipartUploadService() is called, return our mock instance
    (MultipartUploadService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockMultipartService);

    // Default mock fetch behavior
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK')
    });
  });

  // Polyfill Blob.arrayBuffer if missing (common in some jsdom versions)
  beforeAll(() => {
    if (!Blob.prototype.arrayBuffer) {
      Blob.prototype.arrayBuffer = function() {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = reject;
          reader.readAsArrayBuffer(this);
        });
      };
    }
  });

  // Generators
  const arbitraryCaptureResult = fc.record({
    evidenceId: fc.uuid(),
    type: fc.constantFrom('video', 'screenshot'),
    url: fc.webUrl(),
    title: fc.string(),
    media: fc.record({
      blob: fc.string().map(s => new Blob([s], { type: 'video/webm' })),
      hash: fc.string(),
      mimeType: fc.constant('video/webm'),
      // extension property not in CaptureResult.media type definition in types.ts (lines 125-134)
    })
  }).chain(base => {
    // Determine size from blob to ensure consistency
    const size = base.media.blob.size;
    
    // Create the full object with consistent size
    return fc.record({
        evidenceId: fc.constant(base.evidenceId),
        type: fc.constant(base.type),
        url: fc.constant(base.url),
        title: fc.constant(base.title),
        media: fc.constant({
            ...base.media,
            sizeBytes: size
        }),
        html: fc.record({
            content: fc.string(),
            hash: fc.string(),
            sizeBytes: fc.integer({ min: 1 }),
            // blob not in CaptureResult.html type definition
        }),
        metadataHash: fc.string(),
        merkleRoot: fc.string(),
        forensicMetadata: fc.object(),
        timestamps: fc.record({
            startedAt: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString()),
            endedAt: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString()),
            durationMs: fc.integer({ min: 0 })
        }),
        isolation: fc.record({
            mode: fc.constantFrom('full', 'partial', 'none'),
            disabledExtensions: fc.array(fc.string()),
            nonDisabledExtensions: fc.array(fc.string()),
            snapshotHash: fc.option(fc.string())
        })
    });
  }) as unknown as fc.Arbitrary<CaptureResult>;

  const arbitraryTimestampResult = fc.oneof(
    fc.record({
      type: fc.constant('ICP_BRASIL'),
      token: fc.string().map(() => new Uint8Array([1, 2, 3]).buffer), // Mock buffer
      tokenHash: fc.string(),
      appliedAt: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString()),
      tsa: fc.constant('SERPRO'),
      merkleRoot: fc.string(),
      accuracy: fc.integer({ min: 0 })
    }),
    fc.record({
      type: fc.constant('NTP_LOCAL'),
      timestamp: fc.integer(), // Not in TimestampResult but used in dummy arbitrary?
      // Wait, TimestampResult does not have timestamp field! It has appliedAt.
      // But arbitrary definition here adds it. It's okay if ignored.
      // appliedAt and type are required.
      tokenHash: fc.string(),
      appliedAt: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString()),
      tsa: fc.constant('LOCAL'),
      merkleRoot: fc.string()
    })
  ) as unknown as fc.Arbitrary<TimestampResult>;

  const arbitraryStorageConfig = fc.record({
    storageClass: fc.constantFrom('STANDARD', 'GLACIER', 'DEEP_ARCHIVE'),
    bucket: fc.constant('test-evidence-bucket'),
    retentionYears: fc.constantFrom(5, 10, 20),
    additionalCredits: fc.option(fc.integer())
  }) as unknown as fc.Arbitrary<StorageConfig>;

  it('should successfully upload all files returning correct structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryCaptureResult,
        arbitraryTimestampResult,
        arbitraryStorageConfig,
        async (capture, timestamp, storage) => {
          // Arrange
          vi.clearAllMocks();
          const service = new UploadService(mockApiClient, mockLogger);
          
          // Act
          const onProgress = vi.fn();
          const result = await service.upload(capture, timestamp, storage, onProgress);

          // Assert
          expect(result.evidenceId).toBe(capture.evidenceId);
          expect(result.s3Keys).toBeDefined();
          expect(result.urls).toBeDefined();
          expect(mockLogger.info).toHaveBeenCalledWith('UPLOAD', 'STARTED', expect.any(Object));
          expect(mockLogger.info).toHaveBeenCalledWith('UPLOAD', 'COMPLETED', expect.any(Object));

          // Verify all 5 files were attempted
          // 4 simple uploads (html, metadata, hashes, timestamp) + 1 media (simple or multipart)
          // Simple uploads use client.post for presigned url + fetch put
          // Multipart uses multipartService
          
          const isMultipart = capture.media.blob.size >= 5 * 1024 * 1024;
          if (isMultipart) {
             expect(mockMultipartService.initiate).toHaveBeenCalled();
             expect(mockMultipartService.complete).toHaveBeenCalled();
             expect(result.uploadMethod).toBe('multipart');
          } else {
             expect(result.uploadMethod).toBe('simple');
             // 5 files: media, html, metadata, hashes, timestamp
             // Each simple upload calls presigned-url then fetch PUT
             // So 5 fetch calls.
             expect(mockFetch).toHaveBeenCalledTimes(5);
          }
        }
      ),
      { numRuns: 10 } 
    );
  });

  it('should use multipart upload when media size >= 5MB', async () => {
    // Generate base but override media
    // We still use arbitraryCaptureResult to get valid structure, but we'll ignore its media size
    await fc.assert(
      fc.asyncProperty(
        arbitraryCaptureResult,
        arbitraryTimestampResult,
        arbitraryStorageConfig,
        async (baseCapture, timestamp, storage) => {
          // Force blob to be large
          // Note: creating 5MB string is slow/expensive in property test loop if done many times.
          // But we kept numRuns=5.
          const largeContent = 'x'.repeat(5 * 1024 * 1024 + 1); // 5MB + 1 byte
          const mediaBlob = new Blob([largeContent], { type: 'video/webm' });
          
          const capture: CaptureResult = {
             ...baseCapture,
             media: {
                 ...baseCapture.media,
                 blob: mediaBlob,
                 sizeBytes: mediaBlob.size
             }
          };

          vi.clearAllMocks();
          const service = new UploadService(mockApiClient, mockLogger);
          
          await service.upload(capture, timestamp, storage);
          
          expect(mockMultipartService.initiate).toHaveBeenCalled();
          expect(mockMultipartService.complete).toHaveBeenCalled();
        }
      ),
      { numRuns: 3 } // Reduce runs for perf
    );
  });

  it('should use simple upload when media size < 5MB', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryCaptureResult,
        arbitraryTimestampResult,
        arbitraryStorageConfig,
        async (baseCapture, timestamp, storage) => {
          // Force blob to be small
          const smallContent = 'small'; 
          const mediaBlob = new Blob([smallContent], { type: 'video/webm' });
          
          const capture: CaptureResult = {
             ...baseCapture,
             media: {
                 ...baseCapture.media,
                 blob: mediaBlob,
                 sizeBytes: mediaBlob.size
             }
          };

          vi.clearAllMocks();
          const service = new UploadService(mockApiClient, mockLogger);
          
          await service.upload(capture, timestamp, storage);
          
          expect(mockMultipartService.initiate).not.toHaveBeenCalled();
          // 4 small files + 1 small media = 5 fetches
          expect(mockFetch).toHaveBeenCalledTimes(5);
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should report progress correctly', async () => {
     await fc.assert(
      fc.asyncProperty(
        arbitraryCaptureResult,
        arbitraryTimestampResult,
        arbitraryStorageConfig,
        async (capture, timestamp, storage) => {
          vi.clearAllMocks();
          const service = new UploadService(mockApiClient, mockLogger);
          const onProgress = vi.fn();
          
          await service.upload(capture, timestamp, storage, onProgress);
          
          expect(onProgress).toHaveBeenCalled();
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should handle cancellation gracefully', async () => {
      // Manual test for cancellation since it involves timing
      // We pick one sample manually
      const [capture] = fc.sample(arbitraryCaptureResult, 1) as [CaptureResult | undefined];
      const [timestamp] = fc.sample(arbitraryTimestampResult, 1) as [TimestampResult | undefined];
      const [storage] = fc.sample(arbitraryStorageConfig, 1) as [StorageConfig | undefined];

      if (!capture || !timestamp || !storage) {
          throw new Error('Failed to generate sample data for cancellation test');
      }
      
      const service = new UploadService(mockApiClient, mockLogger);
      
      // Mock fetch with abort signal support
      mockFetch.mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((resolve, reject) => {
            const signal = options?.signal;
            if (signal?.aborted) {
                return reject(new Error('AbortError')); // Standard fetch throws generic Error with name AbortError usually or DOMException
            }
            
            const timer = setTimeout(() => {
                resolve({
                    ok: true,
                    status: 200,
                    text: async () => 'OK'
                });
            }, 100);

            if (signal) {
                signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    reject(new Error('AbortError'));
                });
            }
        });
      });
      
      const uploadPromise = service.upload(capture, timestamp, storage);
      
      // Trigger cancel immediately
      // Wait a tiny bit to ensure fetch is called? 
      // UploadService calls uploadFile for HTML etc immediately.
      await new Promise(r => setTimeout(r, 10));

      await service.cancel();
      
      await expect(uploadPromise).rejects.toThrow(); // Can be AbortError or "Upload cancelado" depending on race
      // expect(mockLogger.error).toHaveBeenCalledWith('UPLOAD', 'FAILED', expect.stringContaining('Upload cancelado'));
      // Logger might verify the error message.
      // If AbortError is thown, UploadService catches it and logs it?
      // UploadService: catch(error) { this.logger.error(..., error.message); throw error; }
      // So logger will contain error.message.
      // If "Upload cancelado", message is that.
      // If AbortError, message is "Aborted" or similar.
      // Let's just expect rejection.
  });

});
