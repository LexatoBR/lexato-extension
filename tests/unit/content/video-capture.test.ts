/**
 * Testes unitários para VideoCapture
 *
 * Testa captura de vídeo da aba ativa, controles de gravação,
 * finalização automática e cálculo de hash.
 *
 * @see Requirements 7.1-7.10, 19.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoCapture } from '@content/video-capture';
import { AuditLogger } from '@lib/audit-logger';

// Mock do MediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor(
    _stream: MediaStream,
    _options?: MediaRecorderOptions
  ) {}

  start(_timeslice?: number): void {
    this.state = 'recording';
    // Simular dados disponíveis
    setTimeout(() => {
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob(['test'], { type: 'video/webm' }) });
      }
    }, 10);
  }

  stop(): void {
    this.state = 'inactive';
    setTimeout(() => {
      if (this.onstop) {
        this.onstop();
      }
    }, 10);
  }

  // NOTA: pause() e resume() foram removidos como parte do redesign.
  // A remoção de pause/resume garante integridade temporal da evidência.

  static isTypeSupported(_mimeType: string): boolean {
    return true;
  }
}


// Mock do MediaStream
class MockMediaStream {
  private tracks: MediaStreamTrack[] = [];

  constructor() {
    this.tracks = [
      {
        stop: vi.fn(),
        kind: 'video',
        id: 'mock-track',
        enabled: true,
        muted: false,
        readyState: 'live',
        label: 'mock-video-track',
      } as unknown as MediaStreamTrack,
    ];
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks;
  }

  getAudioTracks(): MediaStreamTrack[] {
    return [];
  }
}

// Configurar mocks globais
vi.stubGlobal('MediaRecorder', MockMediaRecorder);

describe('VideoCapture', () => {
  let logger: AuditLogger;
  let videoCapture: VideoCapture;
  let mockStream: MockMediaStream;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = new AuditLogger();
    videoCapture = new VideoCapture(logger);
    mockStream = new MockMediaStream();
  });

  afterEach(() => {
    videoCapture.reset();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('deve criar instância com configuração padrão', () => {
      const config = videoCapture.getConfig();
      expect(config.maxDurationMs).toBe(30 * 60 * 1000); // 30 minutos
      expect(config.format).toBe('webm');
      expect(config.videoBitrate).toBe(2500000);
      expect(config.frameRate).toBe(30);
    });

    it('deve aceitar configuração customizada', () => {
      const customCapture = new VideoCapture(logger, {
        videoBitrate: 5000000,
        frameRate: 60,
      });
      const config = customCapture.getConfig();
      expect(config.videoBitrate).toBe(5000000);
      expect(config.frameRate).toBe(60);
    });
  });

  describe('getState', () => {
    it('deve retornar idle quando não há gravação', () => {
      expect(videoCapture.getState()).toBe('idle');
    });
  });

  describe('isRecording', () => {
    it('deve retornar false quando não está gravando', () => {
      expect(videoCapture.isRecording()).toBe(false);
    });
  });

  // NOTA: Testes de isPaused() foram removidos como parte do redesign.
  // A remoção de pause/resume garante integridade temporal da evidência.

  describe('getElapsedTime', () => {
    it('deve retornar 0 quando não há gravação', () => {
      expect(videoCapture.getElapsedTime()).toBe(0);
    });
  });

  describe('getRemainingTime', () => {
    it('deve retornar tempo máximo quando não há gravação', () => {
      const config = videoCapture.getConfig();
      expect(videoCapture.getRemainingTime()).toBe(config.maxDurationMs);
    });
  });

  describe('start', () => {
    it('deve iniciar gravação com stream fornecido', async () => {
      const result = await videoCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
      });

      expect(result.success).toBe(true);
      expect(videoCapture.getState()).toBe('recording');
      expect(videoCapture.isRecording()).toBe(true);
    });

    it('deve retornar erro se gravação já está em andamento', async () => {
      // Iniciar primeira gravação
      await videoCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
      });

      // Tentar iniciar segunda gravação
      const result = await videoCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('já em andamento');
    });

    it('deve chamar callback de progresso', async () => {
      const progressUpdates: Array<{ state: string; message: string }> = [];

      await videoCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
        onProgress: (progress) => {
          progressUpdates.push({ state: progress.state, message: progress.message });
        },
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('stop', () => {
    it('deve retornar erro se não há gravação em andamento', async () => {
      const result = await videoCapture.stop();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Nenhuma gravação');
    });

    it('deve parar gravação e retornar resultado', async () => {
      // Usar timers reais para este teste específico
      vi.useRealTimers();

      // Iniciar gravação
      await videoCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
      });

      // Aguardar um pouco
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Parar gravação
      const result = await videoCapture.stop();

      expect(result.success).toBe(true);
      expect(result.videoBlob).toBeDefined();
      expect(result.videoHash).toBeDefined();

      // Restaurar fake timers
      vi.useFakeTimers();
    });
  });


  // NOTA: Testes de pause() e resume() foram removidos como parte do redesign.
  // A remoção de pause/resume garante integridade temporal da evidência.

  describe('cancel', () => {
    it('deve cancelar gravação em andamento', async () => {
      // Iniciar gravação
      await videoCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
      });

      // Cancelar
      videoCapture.cancel();

      expect(videoCapture.getState()).toBe('idle');
    });

    it('não deve fazer nada se não há gravação', () => {
      // Não deve lançar erro
      expect(() => videoCapture.cancel()).not.toThrow();
    });
  });

  describe('reset', () => {
    it('deve resetar estado para idle', async () => {
      // Iniciar gravação
      await videoCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
      });

      // Resetar
      videoCapture.reset();

      expect(videoCapture.getState()).toBe('idle');
      expect(videoCapture.getElapsedTime()).toBe(0);
    });
  });


  describe('collectHtml', () => {
    it('deve coletar HTML da página', () => {
      const html = videoCapture.collectHtml();
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html).toContain('<html');
    });
  });

  describe('collectMetadata', () => {
    it('deve coletar metadados da captura de vídeo', () => {
      const metadata = videoCapture.collectMetadata(1000000, 60000, false);

      expect(metadata.url).toBe(window.location.href);
      expect(metadata.title).toBe(document.title);
      expect(metadata.timestamp).toBeDefined();
      expect(metadata.userAgent).toBe(navigator.userAgent);
      expect(metadata.recordingDurationMs).toBe(60000);
      expect(metadata.videoFormat).toBe('webm');
      expect(metadata.fileSizeBytes).toBe(1000000);
      expect(metadata.autoFinalized).toBe(false);
    });

    it('deve incluir timestamps de início e fim', () => {
      const metadata = videoCapture.collectMetadata(500000, 30000, true);

      expect(metadata.startTimestamp).toBeDefined();
      expect(metadata.endTimestamp).toBeDefined();
      expect(metadata.autoFinalized).toBe(true);
    });
  });

  describe('finalização automática', () => {
    it('deve chamar callback de auto-finalização ao atingir limite', async () => {
      const autoFinalizeCallback = vi.fn();

      // Criar captura com duração máxima curta para teste
      const shortCapture = new VideoCapture(logger, {
        maxDurationMs: 2000, // 2 segundos
      });

      await shortCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
        onAutoFinalize: autoFinalizeCallback,
      });

      // Avançar tempo além do limite
      vi.advanceTimersByTime(3000);

      expect(autoFinalizeCallback).toHaveBeenCalledWith('max_duration');
    });
  });

  describe('avisos de tempo', () => {
    it('deve emitir avisos de tempo restante', async () => {
      const progressUpdates: Array<{ timeWarning?: string }> = [];

      // Criar captura com duração de 6 minutos para teste
      const shortCapture = new VideoCapture(logger, {
        maxDurationMs: 6 * 60 * 1000, // 6 minutos
      });

      await shortCapture.start({
        mediaStream: mockStream as unknown as MediaStream,
        onProgress: (progress) => {
          if (progress.timeWarning) {
            progressUpdates.push({ timeWarning: progress.timeWarning });
          }
        },
      });

      // Avançar para 1 minuto restante (5 minutos decorridos)
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Verificar se houve aviso de 1 minuto
      const hasOneMinWarning = progressUpdates.some((p) => p.timeWarning === '1min');
      expect(hasOneMinWarning).toBe(true);
    });
  });
});

describe('VideoCapture - tempo decorrido', () => {
  let logger: AuditLogger;
  let videoCapture: VideoCapture;
  let mockStream: MockMediaStream;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = new AuditLogger();
    videoCapture = new VideoCapture(logger);
    mockStream = new MockMediaStream();
  });

  afterEach(() => {
    videoCapture.reset();
    vi.useRealTimers();
  });

  it('deve calcular tempo decorrido corretamente', async () => {
    await videoCapture.start({
      mediaStream: mockStream as unknown as MediaStream,
    });

    // Avançar 10 segundos
    vi.advanceTimersByTime(10000);

    const elapsed = videoCapture.getElapsedTime();
    expect(elapsed).toBeGreaterThanOrEqual(10000);
  });

  it('deve calcular tempo restante corretamente', async () => {
    await videoCapture.start({
      mediaStream: mockStream as unknown as MediaStream,
    });

    const config = videoCapture.getConfig();

    // Avançar 10 segundos
    vi.advanceTimersByTime(10000);

    const remaining = videoCapture.getRemainingTime();
    expect(remaining).toBeLessThanOrEqual(config.maxDurationMs - 10000);
  });

  // NOTA: Teste de pausa de contagem de tempo foi removido como parte do redesign.
  // A remoção de pause/resume garante integridade temporal da evidência.
});
