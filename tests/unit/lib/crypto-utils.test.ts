/**
 * Testes unitários para CryptoUtils
 *
 * Testa funções de hash SHA-256, geração de nonces e conversões
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CryptoUtils, InvalidInputError } from '@lib/crypto-utils';

describe('CryptoUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hash', () => {
    it('deve calcular hash SHA-256 de uma string', async () => {
      const result = await CryptoUtils.hash('test');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64); // SHA-256 = 64 caracteres hex
      expect(result).toMatch(/^[0-9a-f]+$/); // lowercase hex
    });

    it('deve calcular hash SHA-256 de um objeto', async () => {
      const obj = { name: 'test', value: 123 };
      const result = await CryptoUtils.hash(obj);
      expect(result).toBeDefined();
      expect(result.length).toBe(64);
    });

    it('deve ordenar chaves do objeto antes de calcular hash', async () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };
      const hash1 = await CryptoUtils.hash(obj1);
      const hash2 = await CryptoUtils.hash(obj2);
      expect(hash1).toBe(hash2);
    });

    it('deve lançar InvalidInputError para null', async () => {
      await expect(CryptoUtils.hash(null as unknown as string)).rejects.toThrow(InvalidInputError);
    });

    it('deve lançar InvalidInputError para undefined', async () => {
      await expect(CryptoUtils.hash(undefined as unknown as string)).rejects.toThrow(InvalidInputError);
    });

    it('deve retornar hash em lowercase', async () => {
      const result = await CryptoUtils.hash('TEST');
      expect(result).toBe(result.toLowerCase());
    });
  });

  describe('hashBuffer', () => {
    it('deve calcular hash de Uint8Array', async () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5]);
      const result = await CryptoUtils.hashBuffer(buffer);
      expect(result).toBeDefined();
      expect(result.length).toBe(64);
    });

    it('deve calcular hash de ArrayBuffer', async () => {
      const buffer = new ArrayBuffer(8);
      const result = await CryptoUtils.hashBuffer(buffer);
      expect(result).toBeDefined();
      expect(result.length).toBe(64);
    });

    it('deve lançar InvalidInputError para null', async () => {
      await expect(CryptoUtils.hashBuffer(null as unknown as Uint8Array)).rejects.toThrow(InvalidInputError);
    });
  });

  describe('generateNonce', () => {
    it('deve gerar nonce com tamanho padrão (16 bytes)', () => {
      const nonce = CryptoUtils.generateNonce();
      expect(nonce).toBeInstanceOf(Uint8Array);
      expect(nonce.length).toBe(16);
    });

    it('deve gerar nonce com tamanho customizado', () => {
      const nonce = CryptoUtils.generateNonce(32);
      expect(nonce.length).toBe(32);
    });

    it('deve lançar erro para tamanho menor que 16 bytes', () => {
      expect(() => CryptoUtils.generateNonce(8)).toThrow('mínimo 16 bytes');
    });

    it('deve gerar nonces diferentes a cada chamada', () => {
      const nonce1 = CryptoUtils.generateNonce();
      const nonce2 = CryptoUtils.generateNonce();
      expect(CryptoUtils.arrayToHex(nonce1)).not.toBe(CryptoUtils.arrayToHex(nonce2));
    });
  });

  describe('arrayToHex', () => {
    it('deve converter Uint8Array para hex', () => {
      const array = new Uint8Array([0, 15, 255]);
      const hex = CryptoUtils.arrayToHex(array);
      expect(hex).toBe('000fff');
    });

    it('deve retornar string vazia para array vazio', () => {
      const array = new Uint8Array([]);
      const hex = CryptoUtils.arrayToHex(array);
      expect(hex).toBe('');
    });
  });

  describe('hexToArray', () => {
    it('deve converter hex para Uint8Array', () => {
      const hex = '000fff';
      const array = CryptoUtils.hexToArray(hex);
      expect(array).toEqual(new Uint8Array([0, 15, 255]));
    });

    it('deve lançar erro para hex com tamanho ímpar', () => {
      expect(() => CryptoUtils.hexToArray('0ff')).toThrow('tamanho par');
    });

    it('deve lançar erro para caracteres inválidos', () => {
      expect(() => CryptoUtils.hexToArray('gg')).toThrow('caracteres inválidos');
    });

    it('deve aceitar hex em uppercase', () => {
      const array = CryptoUtils.hexToArray('FF');
      expect(array).toEqual(new Uint8Array([255]));
    });
  });

  describe('arrayBufferToBase64', () => {
    it('deve converter ArrayBuffer para Base64', () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer; // "Hello"
      const base64 = CryptoUtils.arrayBufferToBase64(buffer);
      expect(base64).toBe('SGVsbG8=');
    });
  });

  describe('base64ToArrayBuffer', () => {
    it('deve converter Base64 para ArrayBuffer', () => {
      const base64 = 'SGVsbG8='; // "Hello"
      const buffer = CryptoUtils.base64ToArrayBuffer(base64);
      const array = new Uint8Array(buffer);
      expect(array).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });
  });

  describe('uint8ArrayToBase64', () => {
    it('deve converter Uint8Array para Base64', () => {
      const array = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const base64 = CryptoUtils.uint8ArrayToBase64(array);
      expect(base64).toBe('SGVsbG8=');
    });
  });

  describe('base64ToUint8Array', () => {
    it('deve converter Base64 para Uint8Array', () => {
      const base64 = 'SGVsbG8='; // "Hello"
      const array = CryptoUtils.base64ToUint8Array(base64);
      expect(array).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });
  });

  describe('stringifyOrdered', () => {
    it('deve ordenar chaves do objeto', () => {
      const obj = { c: 3, a: 1, b: 2 };
      const json = CryptoUtils.stringifyOrdered(obj);
      expect(json).toBe('{"a":1,"b":2,"c":3}');
    });

    it('deve ordenar chaves recursivamente', () => {
      const obj = { b: { d: 4, c: 3 }, a: 1 };
      const json = CryptoUtils.stringifyOrdered(obj);
      expect(json).toBe('{"a":1,"b":{"c":3,"d":4}}');
    });

    it('deve manter arrays na ordem original', () => {
      const obj = { arr: [3, 1, 2] };
      const json = CryptoUtils.stringifyOrdered(obj);
      expect(json).toBe('{"arr":[3,1,2]}');
    });
  });

  describe('round-trip conversions', () => {
    it('hex round-trip deve preservar dados', () => {
      const original = new Uint8Array([0, 127, 255, 1, 254]);
      const hex = CryptoUtils.arrayToHex(original);
      const restored = CryptoUtils.hexToArray(hex);
      expect(restored).toEqual(original);
    });

    it('base64 round-trip deve preservar dados', () => {
      const original = new Uint8Array([0, 127, 255, 1, 254]);
      const base64 = CryptoUtils.uint8ArrayToBase64(original);
      const restored = CryptoUtils.base64ToUint8Array(base64);
      expect(restored).toEqual(original);
    });
  });
});
