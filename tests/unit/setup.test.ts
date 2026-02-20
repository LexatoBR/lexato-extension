import { describe, it, expect } from 'vitest';
import { chromeMock } from '../setup';

/**
 * Testes de verificação da configuração do ambiente de testes
 */
describe('Configuração do Ambiente de Testes', () => {
  it('deve ter o mock do Chrome disponível', () => {
    expect(chrome).toBeDefined();
    expect(chrome.runtime).toBeDefined();
    expect(chrome.storage).toBeDefined();
    expect(chrome.tabs).toBeDefined();
  });

  it('deve retornar versão do manifest', () => {
    const manifest = chrome.runtime.getManifest();
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.name).toBe('Lexato - Provas Digitais');
  });

  it('deve ter o mock do crypto disponível', () => {
    expect(crypto).toBeDefined();
    expect(crypto.subtle).toBeDefined();
    expect(crypto.getRandomValues).toBeDefined();
  });

  it('deve gerar valores aleatórios', () => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    
    // Verificar que pelo menos alguns valores foram preenchidos
    const hasNonZero = array.some((v) => v !== 0);
    expect(hasNonZero).toBe(true);
  });

  it('deve ter chromeMock exportado corretamente', () => {
    expect(chromeMock).toBeDefined();
    expect(chromeMock.runtime.getManifest).toBeDefined();
  });
});
