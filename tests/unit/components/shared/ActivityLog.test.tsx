/**
 * Testes unitários para ActivityLog
 *
 * Verifica:
 * - Renderização de atividades com timestamps relativos
 * - Ícones por tipo de atividade
 * - Última sincronização no header
 * - Link "Ver histórico completo"
 * - Estado vazio
 * - Limite de atividades exibidas
 *
 * @see Requirements 22.1-22.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ActivityLog,
  ActivityItem,
  ActivityType,
  formatRelativeTime,
} from '../../../../src/components/shared/ActivityLog';

/**
 * Cria uma data relativa ao momento atual
 */
function createRelativeDate(offsetMs: number): Date {
  return new Date(Date.now() - offsetMs);
}

/**
 * Constantes de tempo em milissegundos
 */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Dados de teste para atividades
 */
const mockActivities: ActivityItem[] = [
  {
    id: '1',
    type: 'capture',
    message: 'Screenshot capturado',
    timestamp: createRelativeDate(2 * MINUTE),
  },
  {
    id: '2',
    type: 'sync',
    message: 'Dados sincronizados',
    timestamp: createRelativeDate(10 * MINUTE),
  },
  {
    id: '3',
    type: 'login',
    message: 'Login realizado',
    timestamp: createRelativeDate(1 * HOUR),
  },
  {
    id: '4',
    type: 'upload',
    message: 'Upload concluído',
    timestamp: createRelativeDate(2 * HOUR),
  },
  {
    id: '5',
    type: 'verify',
    message: 'Verificação blockchain',
    timestamp: createRelativeDate(1 * DAY),
  },
];

describe('ActivityLog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-14T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Renderização básica', () => {
    it('deve renderizar o componente com título', () => {
      render(<ActivityLog activities={mockActivities} />);

      const log = screen.getByTestId('activity-log');
      expect(log).toBeInTheDocument();
      expect(screen.getByTestId('activity-log-title')).toHaveTextContent('Atividade Recente');
    });

    it('deve ter role="region" para acessibilidade', () => {
      render(<ActivityLog activities={mockActivities} />);

      const log = screen.getByTestId('activity-log');
      expect(log).toHaveAttribute('role', 'region');
      expect(log).toHaveAttribute('aria-label', 'Atividade Recente');
    });

    it('deve aplicar className customizada', () => {
      render(<ActivityLog activities={mockActivities} className="custom-class" />);

      const log = screen.getByTestId('activity-log');
      expect(log.className).toContain('custom-class');
    });
  });

  describe('Lista de atividades', () => {
    it('deve renderizar todas as atividades (até o limite)', () => {
      render(<ActivityLog activities={mockActivities} />);

      const list = screen.getByTestId('activity-list');
      expect(list).toBeInTheDocument();

      mockActivities.forEach((activity) => {
        expect(screen.getByTestId(`activity-item-${activity.id}`)).toBeInTheDocument();
      });
    });

    it('deve limitar a 5 atividades por padrão', () => {
      const manyActivities: ActivityItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i + 1}`,
        type: 'capture' as ActivityType,
        message: `Atividade ${i + 1}`,
        timestamp: createRelativeDate(i * MINUTE),
      }));

      render(<ActivityLog activities={manyActivities} />);

      // Deve mostrar apenas 5
      expect(screen.getByTestId('activity-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('activity-item-5')).toBeInTheDocument();
      expect(screen.queryByTestId('activity-item-6')).not.toBeInTheDocument();
    });

    it('deve respeitar maxItems customizado', () => {
      render(<ActivityLog activities={mockActivities} maxItems={3} />);

      expect(screen.getByTestId('activity-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('activity-item-3')).toBeInTheDocument();
      expect(screen.queryByTestId('activity-item-4')).not.toBeInTheDocument();
    });

    it('deve exibir mensagem de cada atividade', () => {
      render(<ActivityLog activities={mockActivities} />);

      expect(screen.getByText('Screenshot capturado')).toBeInTheDocument();
      expect(screen.getByText('Dados sincronizados')).toBeInTheDocument();
      expect(screen.getByText('Login realizado')).toBeInTheDocument();
    });
  });

  describe('Estado vazio', () => {
    it('deve exibir mensagem quando não há atividades', () => {
      render(<ActivityLog activities={[]} />);

      expect(screen.getByTestId('activity-empty')).toBeInTheDocument();
      expect(screen.getByText('Nenhuma atividade recente')).toBeInTheDocument();
    });
  });

  describe('Ícones por tipo de atividade', () => {
    const activityTypes: ActivityType[] = ['capture', 'sync', 'login', 'logout', 'upload', 'verify', 'error'];

    activityTypes.forEach((type) => {
      it(`deve renderizar ícone para tipo ${type}`, () => {
        const activity: ActivityItem = {
          id: '1',
          type,
          message: `Atividade ${type}`,
          timestamp: new Date(),
        };

        render(<ActivityLog activities={[activity]} />);

        const item = screen.getByTestId('activity-item-1');
        const svg = item.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });
  });

  describe('Última sincronização', () => {
    it('deve exibir última sincronização quando fornecida', () => {
      const lastSyncTime = createRelativeDate(5 * MINUTE);
      render(<ActivityLog activities={mockActivities} lastSyncTime={lastSyncTime} />);

      const syncElement = screen.getByTestId('activity-log-sync');
      expect(syncElement).toBeInTheDocument();
      expect(syncElement).toHaveTextContent('Última sincronização: há 5 minutos');
    });

    it('não deve exibir última sincronização quando não fornecida', () => {
      render(<ActivityLog activities={mockActivities} />);

      expect(screen.queryByTestId('activity-log-sync')).not.toBeInTheDocument();
    });
  });

  describe('Link "Ver histórico completo"', () => {
    it('deve exibir link quando onViewFullHistory é fornecido', () => {
      const onViewFullHistory = vi.fn();
      render(<ActivityLog activities={mockActivities} onViewFullHistory={onViewFullHistory} />);

      const link = screen.getByTestId('activity-view-all');
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent('Ver histórico completo');
    });

    it('não deve exibir link quando onViewFullHistory não é fornecido', () => {
      render(<ActivityLog activities={mockActivities} />);

      expect(screen.queryByTestId('activity-view-all')).not.toBeInTheDocument();
    });

    it('deve chamar onViewFullHistory ao clicar no link', () => {
      const onViewFullHistory = vi.fn();
      render(<ActivityLog activities={mockActivities} onViewFullHistory={onViewFullHistory} />);

      const link = screen.getByTestId('activity-view-all');
      fireEvent.click(link);

      expect(onViewFullHistory).toHaveBeenCalledTimes(1);
    });
  });

  describe('DisplayName', () => {
    it('deve ter displayName correto', () => {
      expect(ActivityLog.displayName).toBe('ActivityLog');
    });
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-14T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deve retornar "Agora mesmo" para menos de 60 segundos', () => {
    const date = createRelativeDate(30 * SECOND);
    expect(formatRelativeTime(date)).toBe('Agora mesmo');
  });

  it('deve retornar "há 1 minuto" para 1 minuto', () => {
    const date = createRelativeDate(1 * MINUTE);
    expect(formatRelativeTime(date)).toBe('há 1 minuto');
  });

  it('deve retornar "há X minutos" para minutos', () => {
    const date = createRelativeDate(5 * MINUTE);
    expect(formatRelativeTime(date)).toBe('há 5 minutos');
  });

  it('deve retornar "há 1 hora" para 1 hora', () => {
    const date = createRelativeDate(1 * HOUR);
    expect(formatRelativeTime(date)).toBe('há 1 hora');
  });

  it('deve retornar "há X horas" para horas', () => {
    const date = createRelativeDate(3 * HOUR);
    expect(formatRelativeTime(date)).toBe('há 3 horas');
  });

  it('deve retornar "há 1 dia" para 1 dia', () => {
    const date = createRelativeDate(1 * DAY);
    expect(formatRelativeTime(date)).toBe('há 1 dia');
  });

  it('deve retornar "há X dias" para dias', () => {
    const date = createRelativeDate(3 * DAY);
    expect(formatRelativeTime(date)).toBe('há 3 dias');
  });

  it('deve retornar data formatada para mais de 7 dias', () => {
    const date = createRelativeDate(10 * DAY);
    const result = formatRelativeTime(date);
    // Deve ser no formato DD/MM
    expect(result).toMatch(/^\d{2}\/\d{2}$/);
  });
});
