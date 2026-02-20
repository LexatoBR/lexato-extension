import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { EvidencePipelineImpl } from '../../../../src/lib/evidence-pipeline/evidence-pipeline';
vi.mock('../../../../src/lib/evidence-pipeline/timestamp-service');
vi.mock('../../../../src/lib/evidence-pipeline/upload-service');
vi.mock('../../../../src/lib/evidence-pipeline/progress-tracker');
vi.mock('../../../../src/lib/evidence-pipeline/error-handler');
vi.mock('../../../../src/background/api-client', () => ({
    getAPIClient: vi.fn(() => ({
        post: vi.fn(),
        get: vi.fn()
    }))
}));
// Stub global chrome object
global.chrome = {
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() }
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  tabs: {
      create: vi.fn().mockResolvedValue({ id: 123 })
  },
  runtime: {
      getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`)
  }
} as any;

describe('EvidencePipeline Timeout Properties', () => {

  // Helper to setup pipeline per run
  const setupPipeline = () => {
    vi.clearAllMocks();
    const pipeline = new EvidencePipelineImpl();
    const progressTrackerMock = {
        update: vi.fn(),
        get: vi.fn(),
        track: vi.fn(),
        start: vi.fn(),
        complete: vi.fn()
    };
    // @ts-ignore - Injetando mock para testes
    pipeline.progressTracker = progressTrackerMock;
    return { pipeline, progressTrackerMock };
  };

  it('should transition to EXPIRED status when expire() is called', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (evidenceId) => {
        const { pipeline } = setupPipeline();

        // Arrange
        // @ts-ignore
        pipeline.currentEvidenceId = evidenceId;

        // Act
        await pipeline.expire(evidenceId);

        // Assert
        // @ts-ignore
        expect(pipeline.progressTracker.update).toHaveBeenCalledWith(
          evidenceId,
          expect.objectContaining({
            status: 'EXPIRED',
            phaseName: 'preview'
          })
        );
      })
    );
  });

  it('should schedule alarms when opening preview', async () => {
      await fc.assert(
          fc.asyncProperty(fc.uuid(), async (evidenceId) => {
            const { pipeline } = setupPipeline();

            // Act
            await pipeline.openPreview(evidenceId);

            // Assert
            expect(chrome.alarms.create).toHaveBeenCalledTimes(3);
            expect(chrome.tabs.create).toHaveBeenCalled();
          })
      );
  });

  it('should transition to DISCARDED status when discard() is called', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (evidenceId) => {
        const { pipeline } = setupPipeline();
        
        // Arrange
        // @ts-ignore
        pipeline.currentEvidenceId = evidenceId;

        // Act
        await pipeline.discard(evidenceId);

        // Assert
        // @ts-ignore
        expect(pipeline.progressTracker.update).toHaveBeenCalledWith(
          evidenceId,
          expect.objectContaining({
            status: 'DISCARDED',
            phaseName: 'preview'
          })
        );
        // @ts-ignore
        expect(pipeline.currentEvidenceId).toBeNull();
      })
    );
  });

});
