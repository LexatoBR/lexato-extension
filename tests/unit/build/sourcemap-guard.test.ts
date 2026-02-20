/**
 * Testes unitários para o plugin vite-plugin-sourcemap-guard.
 *
 * Verifica o comportamento das funções de busca, remoção e verificação
 * de source maps no diretório de saída do build de produção.
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  findMapFiles,
  deleteFiles,
  executeSourcemapGuard,
  hasSentryPluginInConfig,
} from '../../../vite-plugin-sourcemap-guard';

/**
 * Cria um diretório temporário para testes
 */
async function createTempDir(): Promise<string> {
  return await fs.mkdtemp(join(tmpdir(), 'sourcemap-guard-test-'));
}

/**
 * Remove recursivamente um diretório temporário
 */
async function removeTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Cria um arquivo com conteúdo no diretório especificado
 */
async function createFile(dir: string, name: string, content = ''): Promise<string> {
  const filePath = join(dir, name);
  const fileDir = join(filePath, '..');
  await fs.mkdir(fileDir, { recursive: true });
  await fs.writeFile(filePath, content);
  return filePath;
}

describe('findMapFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('retorna array vazio quando diretório não existe', async () => {
    const result = await findMapFiles(join(tempDir, 'inexistente'));
    expect(result).toEqual([]);
  });

  it('retorna array vazio quando diretório está vazio', async () => {
    const result = await findMapFiles(tempDir);
    expect(result).toEqual([]);
  });

  it('retorna array vazio quando não há arquivos .map', async () => {
    await createFile(tempDir, 'app.js', 'console.log("ok")');
    await createFile(tempDir, 'style.css', 'body {}');

    const result = await findMapFiles(tempDir);
    expect(result).toEqual([]);
  });

  it('encontra arquivos .map na raiz do diretório', async () => {
    await createFile(tempDir, 'app.js.map', '{}');
    await createFile(tempDir, 'app.js', 'console.log("ok")');

    const result = await findMapFiles(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('app.js.map');
  });

  it('encontra arquivos .map em subdiretórios aninhados', async () => {
    await createFile(tempDir, 'assets/js/vendor.js.map', '{}');
    await createFile(tempDir, 'assets/js/app.js.map', '{}');
    await createFile(tempDir, 'assets/js/app.js', 'code');
    await createFile(tempDir, 'chunks/chunk-abc.js.map', '{}');

    const result = await findMapFiles(tempDir);
    expect(result).toHaveLength(3);
    expect(result.some((f) => f.includes('vendor.js.map'))).toBe(true);
    expect(result.some((f) => f.includes('app.js.map'))).toBe(true);
    expect(result.some((f) => f.includes('chunk-abc.js.map'))).toBe(true);
  });

  it('não confunde arquivos com .map no nome mas sem extensão .map', async () => {
    await createFile(tempDir, 'sourcemap-config.json', '{}');
    await createFile(tempDir, 'map-utils.js', 'code');

    const result = await findMapFiles(tempDir);
    expect(result).toEqual([]);
  });
});

describe('deleteFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('retorna array vazio quando lista de arquivos está vazia', async () => {
    const result = await deleteFiles([]);
    expect(result).toEqual([]);
  });

  it('deleta arquivos existentes e retorna lista dos deletados', async () => {
    const file1 = await createFile(tempDir, 'a.js.map', '{}');
    const file2 = await createFile(tempDir, 'b.js.map', '{}');

    const result = await deleteFiles([file1, file2]);
    expect(result).toHaveLength(2);

    // Confirma que os arquivos foram removidos
    await expect(fs.access(file1)).rejects.toThrow();
    await expect(fs.access(file2)).rejects.toThrow();
  });

  it('ignora arquivos que não existem sem lançar erro', async () => {
    const inexistente = join(tempDir, 'nao-existe.map');
    const result = await deleteFiles([inexistente]);
    expect(result).toEqual([]);
  });

  it('deleta apenas arquivos acessíveis e ignora os demais', async () => {
    const existente = await createFile(tempDir, 'existe.js.map', '{}');
    const inexistente = join(tempDir, 'nao-existe.js.map');

    const result = await deleteFiles([existente, inexistente]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(existente);
  });
});

describe('hasSentryPluginInConfig', () => {
  it('retorna true quando plugin Sentry está presente', () => {
    const plugins = [
      { name: 'react' },
      { name: 'sentry-vite-plugin' },
      { name: 'crx' },
    ];
    expect(hasSentryPluginInConfig(plugins)).toBe(true);
  });

  it('retorna true para variações do nome do plugin Sentry', () => {
    expect(hasSentryPluginInConfig([{ name: 'sentry-sesssions-upload' }])).toBe(true);
    expect(hasSentryPluginInConfig([{ name: 'Sentry-Vite' }])).toBe(true);
    expect(hasSentryPluginInConfig([{ name: '@sentry/vite-plugin' }])).toBe(true);
  });

  it('retorna false quando plugin Sentry não está presente', () => {
    const plugins = [
      { name: 'react' },
      { name: 'crx' },
      { name: 'tailwindcss' },
    ];
    expect(hasSentryPluginInConfig(plugins)).toBe(false);
  });

  it('retorna false para lista vazia de plugins', () => {
    expect(hasSentryPluginInConfig([])).toBe(false);
  });
});

describe('executeSourcemapGuard', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('retorna clean=true quando não há arquivos .map', async () => {
    await createFile(tempDir, 'app.js', 'code');
    await createFile(tempDir, 'manifest.json', '{}');

    const result = await executeSourcemapGuard(tempDir, true);
    expect(result.clean).toBe(true);
    expect(result.foundMapFiles).toEqual([]);
    expect(result.deletedMapFiles).toEqual([]);
    expect(result.fallbackExecuted).toBe(false);
  });

  it('retorna clean=true quando Sentry está ativo e já removeu os .map', async () => {
    // Simula cenário onde Sentry já limpou tudo
    await createFile(tempDir, 'app.js', 'code');

    const result = await executeSourcemapGuard(tempDir, true);
    expect(result.clean).toBe(true);
    expect(result.fallbackExecuted).toBe(false);
  });

  it('executa fallback e remove .map quando Sentry NÃO está configurado', async () => {
    await createFile(tempDir, 'app.js', 'code');
    await createFile(tempDir, 'app.js.map', '{"version":3}');
    await createFile(tempDir, 'assets/vendor.js.map', '{"version":3}');

    const result = await executeSourcemapGuard(tempDir, false);
    expect(result.clean).toBe(true);
    expect(result.fallbackExecuted).toBe(true);
    expect(result.deletedMapFiles).toHaveLength(2);
    expect(result.foundMapFiles).toHaveLength(2);

    // Confirma que os .map foram removidos do disco
    const remaining = await findMapFiles(tempDir);
    expect(remaining).toEqual([]);
  });

  it('NÃO executa fallback quando Sentry está ativo mas .map ainda existem', async () => {
    // Cenário anômalo: Sentry ativo mas não deletou os .map
    await createFile(tempDir, 'app.js.map', '{"version":3}');

    const result = await executeSourcemapGuard(tempDir, true);
    expect(result.clean).toBe(false);
    expect(result.fallbackExecuted).toBe(false);
    expect(result.foundMapFiles).toHaveLength(1);
  });

  it('retorna clean=true para diretório vazio', async () => {
    const result = await executeSourcemapGuard(tempDir, false);
    expect(result.clean).toBe(true);
  });

  it('retorna clean=true para diretório inexistente', async () => {
    const result = await executeSourcemapGuard(join(tempDir, 'inexistente'), false);
    expect(result.clean).toBe(true);
  });
});
