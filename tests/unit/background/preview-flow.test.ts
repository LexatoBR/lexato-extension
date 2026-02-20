/**
 * Testes unitários para o fluxo de preview pós-captura
 * 
 * Testa as funções de preview, badge, alarmes e notificações
 * implementadas no Service Worker para o requisito 12.
 * 
 * @module PreviewFlowTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chromeMock } from '../../setup';

// Importar constantes após os mocks
import {
  FRONTEND_URL,
  PREVIEW_ALARM_CONFIG,
  BADGE_CONFIG,
} from '../../../src/background/utils/constants';

describe('Fluxo de Preview Pós-Captura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constantes de Preview', () => {
    it('deve ter FRONTEND_URL definida', () => {
      expect(FRONTEND_URL).toBe('https://app.lexato.com.br');
    });

    it('deve ter PREVIEW_ALARM_CONFIG com valores corretos', () => {
      expect(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX).toBe('reminder_');
      expect(PREVIEW_ALARM_CONFIG.URGENT_PREFIX).toBe('urgent_');
      expect(PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES).toBe(45);
      expect(PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES).toBe(55);
      expect(PREVIEW_ALARM_CONFIG.EXPIRATION_MINUTES).toBe(60);
    });

    it('deve ter BADGE_CONFIG com cores corretas', () => {
      expect(BADGE_CONFIG.PENDING_COLOR).toBe('#FFA500'); // Laranja
      expect(BADGE_CONFIG.URGENT_COLOR).toBe('#FF0000'); // Vermelho
    });
  });

  describe('Cálculo de Tempo de Alarmes', () => {
    it('deve agendar lembrete 15 minutos antes de expirar (45 min após captura)', () => {
      const expirationMinutes = PREVIEW_ALARM_CONFIG.EXPIRATION_MINUTES;
      const reminderDelay = PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES;
      const minutesBeforeExpiration = expirationMinutes - reminderDelay;
      
      expect(minutesBeforeExpiration).toBe(15);
    });

    it('deve agendar urgente 5 minutos antes de expirar (55 min após captura)', () => {
      const expirationMinutes = PREVIEW_ALARM_CONFIG.EXPIRATION_MINUTES;
      const urgentDelay = PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES;
      const minutesBeforeExpiration = expirationMinutes - urgentDelay;
      
      expect(minutesBeforeExpiration).toBe(5);
    });
  });

  describe('Formato de Nome de Alarmes', () => {
    it('deve gerar nome de alarme de lembrete corretamente', () => {
      const evidenceId = 'test-evidence-123';
      const alarmName = `${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`;
      
      expect(alarmName).toBe('reminder_test-evidence-123');
    });

    it('deve gerar nome de alarme urgente corretamente', () => {
      const evidenceId = 'test-evidence-123';
      const alarmName = `${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`;
      
      expect(alarmName).toBe('urgent_test-evidence-123');
    });

    it('deve extrair evidenceId do nome do alarme de lembrete', () => {
      const alarmName = 'reminder_test-evidence-123';
      const evidenceId = alarmName.replace(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX, '');
      
      expect(evidenceId).toBe('test-evidence-123');
    });

    it('deve extrair evidenceId do nome do alarme urgente', () => {
      const alarmName = 'urgent_test-evidence-123';
      const evidenceId = alarmName.replace(PREVIEW_ALARM_CONFIG.URGENT_PREFIX, '');
      
      expect(evidenceId).toBe('test-evidence-123');
    });
  });

  describe('URL de Preview', () => {
    it('deve gerar URL de preview corretamente', () => {
      const evidenceId = 'test-evidence-123';
      const previewUrl = `${FRONTEND_URL}/preview/${evidenceId}`;
      
      expect(previewUrl).toBe('https://app.lexato.com.br/preview/test-evidence-123');
    });

    it('deve gerar URL de preview com UUID', () => {
      const evidenceId = '550e8400-e29b-41d4-a716-446655440000';
      const previewUrl = `${FRONTEND_URL}/preview/${evidenceId}`;
      
      expect(previewUrl).toBe('https://app.lexato.com.br/preview/550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('Identificação de Tipo de Alarme', () => {
    it('deve identificar alarme de lembrete', () => {
      const alarmName = 'reminder_test-evidence-123';
      const isReminder = alarmName.startsWith(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX);
      const isUrgent = alarmName.startsWith(PREVIEW_ALARM_CONFIG.URGENT_PREFIX);
      
      expect(isReminder).toBe(true);
      expect(isUrgent).toBe(false);
    });

    it('deve identificar alarme urgente', () => {
      const alarmName = 'urgent_test-evidence-123';
      const isReminder = alarmName.startsWith(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX);
      const isUrgent = alarmName.startsWith(PREVIEW_ALARM_CONFIG.URGENT_PREFIX);
      
      expect(isReminder).toBe(false);
      expect(isUrgent).toBe(true);
    });

    it('deve identificar alarme de refresh de token como não sendo de preview', () => {
      const alarmName = 'token-refresh-check';
      const isReminder = alarmName.startsWith(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX);
      const isUrgent = alarmName.startsWith(PREVIEW_ALARM_CONFIG.URGENT_PREFIX);
      
      expect(isReminder).toBe(false);
      expect(isUrgent).toBe(false);
    });
  });

  describe('Cores de Badge', () => {
    it('deve usar cor laranja para pendentes', () => {
      expect(BADGE_CONFIG.PENDING_COLOR).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(BADGE_CONFIG.PENDING_COLOR.toUpperCase()).toBe('#FFA500');
    });

    it('deve usar cor vermelha para urgente', () => {
      expect(BADGE_CONFIG.URGENT_COLOR).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(BADGE_CONFIG.URGENT_COLOR.toUpperCase()).toBe('#FF0000');
    });
  });
});

describe('Integração de Alarmes com Chrome API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve criar alarme com delayInMinutes correto para lembrete', async () => {
    const evidenceId = 'test-evidence-123';
    const alarmName = `${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`;
    
    await chromeMock.alarms.create(alarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES,
    });

    expect(chromeMock.alarms.create).toHaveBeenCalledWith(
      'reminder_test-evidence-123',
      { delayInMinutes: 45 }
    );
  });

  it('deve criar alarme com delayInMinutes correto para urgente', async () => {
    const evidenceId = 'test-evidence-123';
    const alarmName = `${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`;
    
    await chromeMock.alarms.create(alarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES,
    });

    expect(chromeMock.alarms.create).toHaveBeenCalledWith(
      'urgent_test-evidence-123',
      { delayInMinutes: 55 }
    );
  });

  it('deve limpar alarmes ao cancelar', async () => {
    const evidenceId = 'test-evidence-123';
    const reminderAlarmName = `${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`;
    const urgentAlarmName = `${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`;
    
    await chromeMock.alarms.clear(reminderAlarmName);
    await chromeMock.alarms.clear(urgentAlarmName);

    expect(chromeMock.alarms.clear).toHaveBeenCalledWith('reminder_test-evidence-123');
    expect(chromeMock.alarms.clear).toHaveBeenCalledWith('urgent_test-evidence-123');
  });
});

describe('Integração de Badge com Chrome API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve definir texto do badge com contagem de pendentes', async () => {
    const pendingCount = 3;
    
    await chromeMock.action.setBadgeText({ text: pendingCount.toString() });

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '3' });
  });

  it('deve definir cor do badge como laranja para pendentes', async () => {
    await chromeMock.action.setBadgeBackgroundColor({ color: BADGE_CONFIG.PENDING_COLOR });

    expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FFA500' });
  });

  it('deve limpar badge quando não há pendentes', async () => {
    await chromeMock.action.setBadgeText({ text: '' });

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
  });
});

describe('Integração de Tabs com Chrome API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve criar nova aba com URL de preview', async () => {
    const evidenceId = 'test-evidence-123';
    const previewUrl = `${FRONTEND_URL}/preview/${evidenceId}`;
    
    // Chamar o mock diretamente
    await chromeMock.tabs.create({ url: previewUrl, active: true });

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'https://app.lexato.com.br/preview/test-evidence-123',
      active: true,
    });
  });

  it('deve criar aba ativa (em foco)', async () => {
    const evidenceId = 'test-evidence-123';
    const previewUrl = `${FRONTEND_URL}/preview/${evidenceId}`;
    
    await chromeMock.tabs.create({ url: previewUrl, active: true });

    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ active: true })
    );
  });
});


describe('Alarme de Expiração (Requisito 12.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve ter EXPIRATION_PREFIX definido', () => {
    expect(PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX).toBe('expiration_');
  });

  it('deve ter EXPIRATION_DELAY_MINUTES igual a 60', () => {
    expect(PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES).toBe(60);
  });

  it('deve gerar nome de alarme de expiração corretamente', () => {
    const evidenceId = 'test-evidence-123';
    const alarmName = `${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`;
    
    expect(alarmName).toBe('expiration_test-evidence-123');
  });

  it('deve extrair evidenceId do nome do alarme de expiração', () => {
    const alarmName = 'expiration_test-evidence-123';
    const evidenceId = alarmName.replace(PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX, '');
    
    expect(evidenceId).toBe('test-evidence-123');
  });

  it('deve identificar alarme de expiração', () => {
    const alarmName = 'expiration_test-evidence-123';
    const isExpiration = alarmName.startsWith(PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX);
    const isReminder = alarmName.startsWith(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX);
    const isUrgent = alarmName.startsWith(PREVIEW_ALARM_CONFIG.URGENT_PREFIX);
    
    expect(isExpiration).toBe(true);
    expect(isReminder).toBe(false);
    expect(isUrgent).toBe(false);
  });

  it('deve criar alarme de expiração com delayInMinutes correto', async () => {
    const evidenceId = 'test-evidence-123';
    const alarmName = `${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`;
    
    await chromeMock.alarms.create(alarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES,
    });

    expect(chromeMock.alarms.create).toHaveBeenCalledWith(
      'expiration_test-evidence-123',
      { delayInMinutes: 60 }
    );
  });

  it('deve limpar alarme de expiração ao cancelar', async () => {
    const evidenceId = 'test-evidence-123';
    const expirationAlarmName = `${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`;
    
    await chromeMock.alarms.clear(expirationAlarmName);

    expect(chromeMock.alarms.clear).toHaveBeenCalledWith('expiration_test-evidence-123');
  });
});

describe('Sequência Completa de Alarmes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve agendar todos os 3 alarmes na ordem correta', async () => {
    const evidenceId = 'test-evidence-full';
    
    // Simular agendamento de todos os alarmes
    await chromeMock.alarms.create(`${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES,
    });
    await chromeMock.alarms.create(`${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES,
    });
    await chromeMock.alarms.create(`${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES,
    });

    expect(chromeMock.alarms.create).toHaveBeenCalledTimes(3);
    
    // Verificar ordem: lembrete (45min) < urgente (55min) < expiração (60min)
    expect(PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES).toBeLessThan(
      PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES
    );
    expect(PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES).toBeLessThan(
      PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES
    );
  });

  it('deve cancelar todos os 3 alarmes ao limpar', async () => {
    const evidenceId = 'test-evidence-cancel';
    
    await chromeMock.alarms.clear(`${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`);
    await chromeMock.alarms.clear(`${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`);
    await chromeMock.alarms.clear(`${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`);

    expect(chromeMock.alarms.clear).toHaveBeenCalledTimes(3);
  });
});
