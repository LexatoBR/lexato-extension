/**
 * PerformanceCollector - Coleta métricas de performance
 *
 * @module PerformanceCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { PerformanceMetrics } from '../../../types/forensic-metadata.types';

/**
 * Coletor de métricas de performance da página
 */
export class PerformanceCollector extends BaseCollector<PerformanceMetrics> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'performance', timeout);
  }

  protected async doCollect(): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {};

    // Navigation Timing
    this.collectNavigationTiming(metrics);

    // Paint Timing
    this.collectPaintTiming(metrics);

    // Largest Contentful Paint
    this.collectLCP(metrics);

    // Cumulative Layout Shift
    this.collectCLS(metrics);

    // First Input Delay (se disponível)
    this.collectFID(metrics);

    return metrics;
  }

  /**
   * Coleta métricas de navegação
   */
  private collectNavigationTiming(metrics: PerformanceMetrics): void {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;

    if (!nav) {
      return;
    }

    metrics.navigationTime = nav.duration;
    metrics.domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime;
    metrics.loadEventTime = nav.loadEventEnd - nav.startTime;
    metrics.transferSize = nav.transferSize;
    metrics.decodedBodySize = nav.decodedBodySize;
  }

  /**
   * Coleta métricas de pintura (FP, FCP)
   */
  private collectPaintTiming(metrics: PerformanceMetrics): void {
    const paintEntries = performance.getEntriesByType('paint');

    for (const entry of paintEntries) {
      if (entry.name === 'first-paint') {
        metrics.firstPaint = entry.startTime;
      }
      if (entry.name === 'first-contentful-paint') {
        metrics.firstContentfulPaint = entry.startTime;
      }
    }
  }

  /**
   * Coleta Largest Contentful Paint
   */
  private collectLCP(metrics: PerformanceMetrics): void {
    try {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      const lastEntry = lcpEntries[lcpEntries.length - 1];

      if (lastEntry) {
        const startTime = lastEntry.startTime;
        if (typeof startTime === 'number') {
          metrics.largestContentfulPaint = startTime;
        }
      }
    } catch {
      // LCP pode não estar disponível em todos os navegadores
    }
  }

  /**
   * Coleta Cumulative Layout Shift
   */
  private collectCLS(metrics: PerformanceMetrics): void {
    try {
      const layoutShiftEntries = performance.getEntriesByType('layout-shift') as unknown as Array<{
        value: number;
        hadRecentInput: boolean;
      }>;

      if (layoutShiftEntries.length > 0) {
        // Soma apenas shifts sem input recente do usuário
        const cls = layoutShiftEntries
          .filter((entry) => !entry.hadRecentInput)
          .reduce((sum, entry) => sum + entry.value, 0);

        metrics.cumulativeLayoutShift = cls;
      }
    } catch {
      // CLS pode não estar disponível
    }
  }

  /**
   * Coleta First Input Delay
   */
  private collectFID(metrics: PerformanceMetrics): void {
    try {
      const fidEntries = performance.getEntriesByType('first-input') as unknown as Array<{
        processingStart: number;
        startTime: number;
      }>;

      const firstEntry = fidEntries[0];
      if (firstEntry) {
        metrics.firstInputDelay = firstEntry.processingStart - firstEntry.startTime;
      }
    } catch {
      // FID pode não estar disponível
    }
  }
}

export default PerformanceCollector;
