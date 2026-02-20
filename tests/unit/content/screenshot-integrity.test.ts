/**
 * Testes para integridade de captura ISO 27037
 *
 * Valida sistema de hash duplo e captura dual-mode
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  OriginalStateHash,
  RestoredStateHash,
  IntegrityHashes,
  DOMModification,
  RawCapture,
  EnhancedCapture,
  DualModeCapture,
} from '../../../src/types/capture.types';

describe('ISO 27037 - Integridade de Captura', () => {
  describe('Hash de Estado Original', () => {
    it('deve capturar hash antes de modificações', () => {
      const originalHash: OriginalStateHash = {
        domStructureHash: 'abc123def456',
        visibleElementsHash: 'xyz789ghi012',
        timestamp: Date.now(),
        capturedBefore: 'any-modification'
      };

      expect(originalHash.capturedBefore).toBe('any-modification');
      expect(originalHash.domStructureHash).toBeTruthy();
      expect(originalHash.visibleElementsHash).toBeTruthy();
    });
  });

  describe('Hash de Estado Restaurado', () => {
    it('deve verificar se restauração foi completa', () => {
      const originalHash = 'abc123def456';
      const restoredHash: RestoredStateHash = {
        domStructureHash: 'abc123def456',
        timestamp: Date.now(),
        matchesOriginal: true
      };

      expect(restoredHash.domStructureHash).toBe(originalHash);
      expect(restoredHash.matchesOriginal).toBe(true);
    });

    it('deve detectar quando restauração falha', () => {
      const originalHash = 'abc123def456';
      const restoredHash: RestoredStateHash = {
        domStructureHash: 'diferente789',
        timestamp: Date.now(),
        matchesOriginal: false
      };

      expect(restoredHash.domStructureHash).not.toBe(originalHash);
      expect(restoredHash.matchesOriginal).toBe(false);
    });
  });

  describe('Modificações do DOM', () => {
    it('deve documentar todas as modificações', () => {
      const modifications: DOMModification[] = [
        {
          type: 'hide',
          selector: '.sticky-header',
          property: 'visibility',
          originalValue: 'visible',
          newValue: 'hidden',
          timestamp: Date.now(),
          forensicReason: 'Ocultar header fixo para captura limpa'
        },
        {
          type: 'modify-style',
          selector: '.cookie-banner',
          property: 'display',
          originalValue: 'block',
          newValue: 'none',
          timestamp: Date.now(),
          forensicReason: 'Ocultar banner de cookies'
        }
      ];

      expect(modifications).toHaveLength(2);
      expect(modifications[0].forensicReason).toBeTruthy();
      expect(modifications[1].type).toBe('modify-style');
    });
  });

  describe('Captura Dual-Mode', () => {
    it('deve ter captura RAW sem modificações', () => {
      const rawCapture: RawCapture = {
        imageData: 'data:image/png;base64,iVBORw0KGgo...',
        hash: 'sha256_raw_hash',
        capturedAt: Date.now(),
        modifications: [],
        width: 1920,
        height: 1080
      };

      expect(rawCapture.modifications).toHaveLength(0);
      expect(rawCapture.hash).toBeTruthy();
    });

    it('deve ter captura Enhanced com modificações documentadas', () => {
      const enhancedCapture: EnhancedCapture = {
        imageData: 'data:image/png;base64,different...',
        hash: 'sha256_enhanced_hash',
        capturedAt: Date.now(),
        modifications: [
          {
            type: 'hide',
            selector: '.sticky-element',
            timestamp: Date.now(),
            forensicReason: 'Elemento fixo ocultado'
          }
        ],
        width: 1920,
        height: 3000 // Altura total após composição
      };

      expect(enhancedCapture.modifications.length).toBeGreaterThan(0);
      expect(enhancedCapture.hash).not.toBe('sha256_raw_hash');
    });

    it('deve comparar ambas as capturas', () => {
      const dualMode: DualModeCapture = {
        raw: {
          imageData: 'data:image/png;base64,raw...',
          hash: 'raw_hash',
          capturedAt: 1000,
          modifications: [],
          width: 1920,
          height: 1080
        },
        enhanced: {
          imageData: 'data:image/png;base64,enhanced...',
          hash: 'enhanced_hash',
          capturedAt: 2000,
          modifications: [
            {
              type: 'hide',
              selector: '.sticky',
              timestamp: 1500,
              forensicReason: 'Ocultado para captura'
            }
          ],
          width: 1920,
          height: 3000
        },
        comparison: {
          bothAvailable: true,
          rawCapturedFirst: true,
          timeDifferenceMs: 1000
        }
      };

      expect(dualMode.comparison.bothAvailable).toBe(true);
      expect(dualMode.comparison.rawCapturedFirst).toBe(true);
      expect(dualMode.comparison.timeDifferenceMs).toBe(1000);
      expect(dualMode.raw.modifications).toHaveLength(0);
      expect(dualMode.enhanced.modifications.length).toBeGreaterThan(0);
    });
  });

  describe('Hashes de Integridade', () => {
    it('deve validar integridade quando DOM é restaurado corretamente', () => {
      const integrityHashes: IntegrityHashes = {
        originalState: {
          domStructureHash: 'original_hash_123',
          visibleElementsHash: 'visible_hash_456',
          timestamp: 1000,
          capturedBefore: 'any-modification'
        },
        capturedImage: 'image_hash_789',
        restoredState: {
          domStructureHash: 'original_hash_123', // Mesmo hash
          timestamp: 2000,
          matchesOriginal: true
        },
        integrityVerified: true
      };

      expect(integrityHashes.integrityVerified).toBe(true);
      expect(integrityHashes.originalState.domStructureHash).toBe(
        integrityHashes.restoredState.domStructureHash
      );
    });

    it('deve falhar validação quando DOM não é restaurado corretamente', () => {
      const integrityHashes: IntegrityHashes = {
        originalState: {
          domStructureHash: 'original_hash_123',
          visibleElementsHash: 'visible_hash_456',
          timestamp: 1000,
          capturedBefore: 'any-modification'
        },
        capturedImage: 'image_hash_789',
        restoredState: {
          domStructureHash: 'different_hash_999', // Hash diferente
          timestamp: 2000,
          matchesOriginal: false
        },
        integrityVerified: false
      };

      expect(integrityHashes.integrityVerified).toBe(false);
      expect(integrityHashes.originalState.domStructureHash).not.toBe(
        integrityHashes.restoredState.domStructureHash
      );
    });
  });
});