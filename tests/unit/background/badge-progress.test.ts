/**
 * Testes unitários para badge-progress.ts
 *
 * Testa as funções de atualização do badge da extensão durante gravação de vídeo.
 *
 * @module BadgeProgressTests
 * @see Requirements 20.1-20.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateBadgeProgress,
  blinkBadgeOnComplete,
  clearBadgeProgress,
  setBadgeError,
  getLastUpdatedPercent,
  resetBadgeState,
  BADGE_PROGRESS_COLORS,
  BADGE_PROGRESS_CONFIG,
} from '../../../src/background/badge-progress';

// Mock do chrome.action API
const mockSetBadgeText = vi.fn().mockResolvedValue(undefined);
const mockSetBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);

vi.stubGlobal('chrome', {
  action: {
    setBadgeText: mockSetBadgeText,
    setBadgeBackgroundColor: mockSetBadgeBackgroundColor,
  },
});

describe('Badge Progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetBadgeState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('updateBadgeProgress', () => {
    it('deve atualizar badge com porcentagem inicial (0%)', async () => {
      await updateBadgeProgress(0);

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '0%' });
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({
        color: BADGE_PROGRESS_COLORS.NORMAL,
      });
    });

    it('deve atualizar badge com porcentagem intermediária', async () => {
      await updateBadgeProgress(50);

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '50%' });
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({
        color: BADGE_PROGRESS_COLORS.NORMAL,
      });
    });

    it('deve usar cor de aviso quando próximo do limite (>= 80%)', async () => {
      await updateBadgeProgress(80);

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '80%' });
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({
        color: BADGE_PROGRESS_COLORS.WARNING,
      });
    });

    it('deve usar cor de aviso para 100%', async () => {
      await updateBadgeProgress(100);

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '100%' });
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({
        color: BADGE_PROGRESS_COLORS.WARNING,
      });
    });

    it('deve atualizar apenas a cada 5% de progresso', async () => {
      // Primeira atualização (0%)
      await updateBadgeProgress(0);
      expect(mockSetBadgeText).toHaveBeenCalledTimes(1);

      // Não deve atualizar para 1%, 2%, 3%, 4%
      await updateBadgeProgress(1);
      await updateBadgeProgress(2);
      await updateBadgeProgress(3);
      await updateBadgeProgress(4);
      expect(mockSetBadgeText).toHaveBeenCalledTimes(1);

      // Deve atualizar para 5%
      await updateBadgeProgress(5);
      expect(mockSetBadgeText).toHaveBeenCalledTimes(2);
      expect(mockSetBadgeText).toHaveBeenLastCalledWith({ text: '5%' });
    });

    it('deve sempre atualizar para 100%', async () => {
      await updateBadgeProgress(95);
      expect(mockSetBadgeText).toHaveBeenCalledTimes(1);

      // 100% sempre atualiza
      await updateBadgeProgress(100);
      expect(mockSetBadgeText).toHaveBeenCalledTimes(2);
      expect(mockSetBadgeText).toHaveBeenLastCalledWith({ text: '100%' });
    });

    it('deve normalizar valores fora do range 0-100', async () => {
      await updateBadgeProgress(-10);
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '0%' });

      resetBadgeState();
      vi.clearAllMocks();

      await updateBadgeProgress(150);
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '100%' });
    });

    it('deve arredondar valores decimais', async () => {
      await updateBadgeProgress(25.7);
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '26%' });
    });
  });

  describe('blinkBadgeOnComplete', () => {
    it('deve iniciar efeito de piscar', async () => {
      await blinkBadgeOnComplete();

      // Avançar tempo para primeira piscada
      await vi.advanceTimersByTimeAsync(BADGE_PROGRESS_CONFIG.BLINK_INTERVAL_MS);

      // Badge deve ter sido alternado
      expect(mockSetBadgeText).toHaveBeenCalled();
    });

    it('deve parar de piscar após duração definida', async () => {
      await blinkBadgeOnComplete();

      // Avançar tempo além da duração do piscar
      await vi.advanceTimersByTimeAsync(BADGE_PROGRESS_CONFIG.BLINK_DURATION_MS + 100);

      // Badge deve ter sido limpo
      expect(mockSetBadgeText).toHaveBeenLastCalledWith({ text: '' });
    });

    it('deve usar porcentagem final customizada', async () => {
      await blinkBadgeOnComplete(95);

      // Avançar tempo para primeira piscada (badge visível)
      await vi.advanceTimersByTimeAsync(BADGE_PROGRESS_CONFIG.BLINK_INTERVAL_MS * 2);

      // Verificar que 95% foi usado
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '95%' });
    });
  });

  describe('clearBadgeProgress', () => {
    it('deve limpar o badge', async () => {
      await updateBadgeProgress(50);
      vi.clearAllMocks();

      await clearBadgeProgress();

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('deve resetar o estado interno', async () => {
      await updateBadgeProgress(50);
      expect(getLastUpdatedPercent()).toBe(50);

      await clearBadgeProgress();
      expect(getLastUpdatedPercent()).toBe(-1);
    });

    it('deve parar piscar em andamento', async () => {
      await blinkBadgeOnComplete();
      vi.clearAllMocks();

      await clearBadgeProgress();

      // Avançar tempo - não deve haver mais piscadas
      await vi.advanceTimersByTimeAsync(BADGE_PROGRESS_CONFIG.BLINK_DURATION_MS);

      // Apenas a chamada de clearBadgeProgress
      expect(mockSetBadgeText).toHaveBeenCalledTimes(1);
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });

  describe('setBadgeError', () => {
    it('deve definir badge de erro com mensagem padrão', async () => {
      await setBadgeError();

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' });
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({
        color: BADGE_PROGRESS_COLORS.ERROR,
      });
    });

    it('deve definir badge de erro com mensagem customizada', async () => {
      await setBadgeError('ERR');

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: 'ERR' });
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({
        color: BADGE_PROGRESS_COLORS.ERROR,
      });
    });

    it('deve resetar estado interno', async () => {
      await updateBadgeProgress(50);
      expect(getLastUpdatedPercent()).toBe(50);

      await setBadgeError();
      expect(getLastUpdatedPercent()).toBe(-1);
    });
  });

  describe('getLastUpdatedPercent', () => {
    it('deve retornar -1 quando não iniciado', () => {
      expect(getLastUpdatedPercent()).toBe(-1);
    });

    it('deve retornar último valor atualizado', async () => {
      await updateBadgeProgress(25);
      expect(getLastUpdatedPercent()).toBe(25);

      await updateBadgeProgress(50);
      expect(getLastUpdatedPercent()).toBe(50);
    });
  });

  describe('resetBadgeState', () => {
    it('deve resetar estado interno', async () => {
      await updateBadgeProgress(75);
      expect(getLastUpdatedPercent()).toBe(75);

      resetBadgeState();
      expect(getLastUpdatedPercent()).toBe(-1);
    });
  });

  describe('Constantes', () => {
    it('deve ter cores corretas definidas', () => {
      expect(BADGE_PROGRESS_COLORS.NORMAL).toBe('#00DEA5');
      expect(BADGE_PROGRESS_COLORS.WARNING).toBe('#FFCA28');
      expect(BADGE_PROGRESS_COLORS.ERROR).toBe('#EF5350');
    });

    it('deve ter configuração correta', () => {
      expect(BADGE_PROGRESS_CONFIG.WARNING_THRESHOLD).toBe(80);
      expect(BADGE_PROGRESS_CONFIG.UPDATE_INTERVAL_PERCENT).toBe(5);
    });
  });
});
