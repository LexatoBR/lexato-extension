import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { EvidencePipelineImpl } from '../../../../src/lib/evidence-pipeline/evidence-pipeline';
import { BlockchainService } from '../../../../src/lib/evidence-pipeline/blockchain-service';
import { TimestampService } from '../../../../src/lib/evidence-pipeline/timestamp-service';
import { UploadService } from '../../../../src/lib/evidence-pipeline/upload-service';
import { ProgressTracker } from '../../../../src/lib/evidence-pipeline/progress-tracker';
import { getAPIClient } from '../../../../src/background/api-client';
import type { StorageConfig, TimestampResult, BlockchainResult } from '../../../../src/lib/evidence-pipeline/types';

// Mocks
vi.mock('../../../../src/lib/evidence-pipeline/blockchain-service');
vi.mock('../../../../src/lib/evidence-pipeline/timestamp-service');
vi.mock('../../../../src/lib/evidence-pipeline/upload-service');
vi.mock('../../../../src/lib/evidence-pipeline/progress-tracker');
vi.mock('../../../../src/background/api-client');

describe('EvidencePipeline Blockchain Properties', () => {
    let pipeline: EvidencePipelineImpl;
    let blockchainServiceMock: ReturnType<typeof vi.fn> & { register: ReturnType<typeof vi.fn>, checkStatus: ReturnType<typeof vi.fn> };
    let progressTrackerMock: ReturnType<typeof vi.fn> & { update: ReturnType<typeof vi.fn>, onProgress: ReturnType<typeof vi.fn>, get: ReturnType<typeof vi.fn> };
    let timestampServiceMock: ReturnType<typeof vi.fn> & { applyTimestamp: ReturnType<typeof vi.fn> };
    let uploadServiceMock: ReturnType<typeof vi.fn> & { upload: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mock instances
        blockchainServiceMock = {
            register: vi.fn(),
            checkStatus: vi.fn()
        } as any;
        vi.mocked(BlockchainService).mockImplementation(() => blockchainServiceMock as any);

        progressTrackerMock = {
            update: vi.fn(),
            onProgress: vi.fn().mockReturnValue(() => {}),
            get: vi.fn()
        } as any;
        vi.mocked(ProgressTracker).mockImplementation(() => progressTrackerMock as any);
        
        timestampServiceMock = {
            applyTimestamp: vi.fn()
        } as any;
        vi.mocked(TimestampService).mockImplementation(() => timestampServiceMock as any);

        uploadServiceMock = {
           upload: vi.fn()
        } as any;
        vi.mocked(UploadService).mockImplementation(() => uploadServiceMock as any);

        // Mock getAPIClient
        vi.mocked(getAPIClient).mockReturnValue({
            post: vi.fn().mockResolvedValue({ success: true }),
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        } as any);

        pipeline = new EvidencePipelineImpl();
    });

    it('should transition to REGISTERING_BLOCKCHAIN and then COMPLETE upon approval', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(), // evidenceId
                fc.string(), // timestampHash
                async (evidenceId, timestampHash) => {
                    // Reset mocks for each run
                    vi.clearAllMocks();
                    
                    // Setup state needed for blockchain registration
                    // Use 'any' to bypass private access for test setup
                    (pipeline as any).currentEvidenceId = evidenceId;
                    (pipeline as any).timestampResult = {
                        tokenHash: timestampHash, // Changed from hash to tokenHash per fix
                        type: 'ICP_BRASIL',
                        appliedAt: new Date().toISOString()
                    } as TimestampResult;

                    // Mock blockchain registration success
                    const mockBlockchainResult: BlockchainResult = {
                        success: true,
                        status: 'processing',
                        proof: {
                            registeredAt: new Date().toISOString(),
                            txHashPolygon: '0x123'
                        }
                    };
                    blockchainServiceMock.register.mockResolvedValue(mockBlockchainResult);

                    const storageConfig: StorageConfig = {
                        storageClass: 'STANDARD',
                        retentionYears: 5
                    };

                    // Execute
                    await pipeline.approve(evidenceId, storageConfig);

                    // Verify
                    // 1. Check if blockchain service was called with correct args
                    expect(blockchainServiceMock.register).toHaveBeenCalledWith(evidenceId, timestampHash);

                    // 2. Check status transitions
                    // Should see update for REGISTERING_BLOCKCHAIN
                    expect(progressTrackerMock.update).toHaveBeenCalledWith(
                        evidenceId,
                        expect.objectContaining({
                            status: 'REGISTERING_BLOCKCHAIN',
                            phase: 5
                        })
                    );

                    // Should see update for BLOCKCHAIN_COMPLETE
                    expect(progressTrackerMock.update).toHaveBeenCalledWith(
                        evidenceId,
                        expect.objectContaining({
                            status: 'BLOCKCHAIN_COMPLETE',
                            phase: 5
                        })
                    );
                }
            )
        );
    });

    it('should handle blockchain registration failure gracefully', async () => {
         await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                fc.string(),
                async (evidenceId, timestampHash) => {
                    vi.clearAllMocks();
                    
                    (pipeline as any).currentEvidenceId = evidenceId;
                    (pipeline as any).timestampResult = {
                        tokenHash: timestampHash,
                        type: 'ICP_BRASIL'
                    } as TimestampResult;

                    // Mock failure
                    blockchainServiceMock.register.mockResolvedValue({
                        success: false,
                        status: 'failed',
                        error: 'Network error or credit insufficient'
                    });

                    const storageConfig: StorageConfig = {
                        storageClass: 'STANDARD',
                        retentionYears: 5
                    };

                    // Execute expects error
                    await expect(pipeline.approve(evidenceId, storageConfig)).rejects.toThrow();

                    // Verify failure status update
                    expect(progressTrackerMock.update).toHaveBeenCalledWith(
                        evidenceId,
                        expect.objectContaining({
                            status: 'BLOCKCHAIN_FAILED',
                            phase: 5
                        })
                    );
                }
            )
        );
    });
});
