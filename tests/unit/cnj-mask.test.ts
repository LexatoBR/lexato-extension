/**
 * Testes unitários para funções de máscara e validação CNJ
 *
 * Testa applyCnjMask e isValidCnj exportadas de CatalogModal.
 * Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos)
 *
 * Validates: Requirements 1.5
 */

import { describe, it, expect } from 'vitest';
import { applyCnjMask, isValidCnj } from '../../src/preview/CatalogModal';

// -- applyCnjMask --

describe('applyCnjMask', () => {
  it('deve retornar string vazia para entrada vazia', () => {
    expect(applyCnjMask('')).toBe('');
  });

  it('deve retornar dígitos sem máscara quando parcial (menos de 7 dígitos)', () => {
    expect(applyCnjMask('123')).toBe('123');
    expect(applyCnjMask('1234567')).toBe('1234567');
  });

  it('deve inserir hífen após o 7o dígito', () => {
    expect(applyCnjMask('12345678')).toBe('1234567-8');
  });

  it('deve inserir ponto após o 9o dígito', () => {
    expect(applyCnjMask('1234567890')).toBe('1234567-89.0');
  });

  it('deve inserir segundo ponto após o 13o dígito', () => {
    expect(applyCnjMask('12345678901234')).toBe('1234567-89.0123.4');
  });

  it('deve inserir terceiro ponto após o 14o dígito', () => {
    expect(applyCnjMask('123456789012345')).toBe('1234567-89.0123.4.5');
  });

  it('deve inserir quarto ponto após o 16o dígito', () => {
    expect(applyCnjMask('12345678901234567')).toBe('1234567-89.0123.4.56.7');
  });

  it('deve formatar número CNJ completo (20 dígitos)', () => {
    expect(applyCnjMask('12345678920241020001')).toBe('1234567-89.2024.1.02.0001');
  });

  it('deve remover caracteres não numéricos da entrada', () => {
    expect(applyCnjMask('abc123def456')).toBe('123456');
    expect(applyCnjMask('1.2.3-4')).toBe('1234');
  });

  it('deve limitar a 20 dígitos mesmo com entrada maior', () => {
    const input = '123456789012345678901234';
    const result = applyCnjMask(input);
    // 20 dígitos formatados = NNNNNNN-DD.AAAA.J.TR.OOOO
    expect(result).toBe('1234567-89.0123.4.56.7890');
  });

  it('deve lidar com entrada já formatada (re-aplicação da máscara)', () => {
    // Quando o usuário cola um número já formatado, os não-dígitos são removidos
    const formatted = '1234567-89.2024.1.02.0001';
    expect(applyCnjMask(formatted)).toBe('1234567-89.2024.1.02.0001');
  });

  it('deve lidar com entrada contendo espaços', () => {
    // Espaços são removidos como não-dígitos; 9 dígitos recebem máscara normalmente
    expect(applyCnjMask('123 456 789')).toBe('1234567-89');
  });
});

// -- isValidCnj --

describe('isValidCnj', () => {
  it('deve retornar true para string vazia (campo opcional)', () => {
    expect(isValidCnj('')).toBe(true);
  });

  it('deve retornar true para formato CNJ válido', () => {
    expect(isValidCnj('1234567-89.2024.1.02.0001')).toBe(true);
    expect(isValidCnj('0000000-00.0000.0.00.0000')).toBe(true);
    expect(isValidCnj('9999999-99.9999.9.99.9999')).toBe(true);
  });

  it('deve retornar false para número parcial', () => {
    expect(isValidCnj('1234567')).toBe(false);
    expect(isValidCnj('1234567-89')).toBe(false);
    expect(isValidCnj('1234567-89.2024')).toBe(false);
  });

  it('deve retornar false para formato incorreto (sem separadores)', () => {
    expect(isValidCnj('12345678920241020001')).toBe(false);
  });

  it('deve retornar false para formato com separadores errados', () => {
    expect(isValidCnj('1234567.89.2024.1.02.0001')).toBe(false);
    expect(isValidCnj('1234567-89-2024.1.02.0001')).toBe(false);
  });

  it('deve retornar false para texto arbitrário', () => {
    expect(isValidCnj('abc')).toBe(false);
    expect(isValidCnj('processo-123')).toBe(false);
  });
});
