#!/usr/bin/env node
/**
 * Script de Diagnóstico para Erro "document is not defined"
 *
 * Este script analisa o bundle do service worker usando source maps
 * para identificar a linha exata do código fonte que causa o erro.
 *
 * Funcionalidades:
 * 1. Mapeia linha do bundle minificado para código fonte original
 * 2. Analisa padrões de acesso a document no bundle
 * 3. Identifica dependências que podem acessar document em runtime
 *
 * @example
 * ```bash
 * node scripts/diagnose-document-error.cjs 123841
 * ```
 *
 * @author Lexato
 * @since 2026-01-18
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const CONFIG = {
  distDir: path.join(__dirname, '..', 'dist'),
  assetsDir: path.join(__dirname, '..', 'dist', 'assets'),
  // Busca o service worker principal (não o loader)
  serviceWorkerPattern: /^service-worker-[a-zA-Z0-9]+\.js$/,
  sourceMapPattern: /^service-worker-[a-zA-Z0-9]+\.js\.map$/,
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Encontra arquivos no diretório dist/assets
 * @param {RegExp} pattern - Padrão para buscar
 * @returns {string|null} Caminho do arquivo ou null
 */
function findFile(pattern) {
  // Primeiro tenta em dist/assets (onde o Vite coloca os bundles)
  if (fs.existsSync(CONFIG.assetsDir)) {
    const files = fs.readdirSync(CONFIG.assetsDir);
    const file = files.find(f => pattern.test(f));
    if (file) return path.join(CONFIG.assetsDir, file);
  }
  
  // Fallback para dist/
  if (fs.existsSync(CONFIG.distDir)) {
    const files = fs.readdirSync(CONFIG.distDir);
    const file = files.find(f => pattern.test(f));
    if (file) return path.join(CONFIG.distDir, file);
  }
  
  return null;
}

/**
 * Decodifica VLQ (Variable Length Quantity) usado em source maps
 * @param {string} encoded - String VLQ codificada
 * @returns {number[]} Array de números decodificados
 */
function decodeVLQ(encoded) {
  const charToInt = {};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((char, i) => {
    charToInt[char] = i;
  });

  const result = [];
  let shift = 0;
  let value = 0;

  for (const char of encoded) {
    const integer = charToInt[char];
    if (integer === undefined) continue;

    const hasContinuationBit = integer & 32;
    value += (integer & 31) << shift;

    if (hasContinuationBit) {
      shift += 5;
    } else {
      const shouldNegate = value & 1;
      value >>= 1;
      result.push(shouldNegate ? -value : value);
      value = 0;
      shift = 0;
    }
  }

  return result;
}

/**
 * Parseia source map e retorna mapeamentos
 * @param {object} sourceMap - Objeto source map
 * @returns {Map<number, object>} Mapa de linha gerada para info de origem
 */
function parseSourceMap(sourceMap) {
  const mappings = new Map();
  const lines = sourceMap.mappings.split(';');

  let generatedLine = 0;
  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;

  for (const line of lines) {
    generatedLine++;
    let generatedColumn = 0;

    if (!line) continue;

    const segments = line.split(',');
    for (const segment of segments) {
      const decoded = decodeVLQ(segment);
      if (decoded.length === 0) continue;

      generatedColumn += decoded[0];

      if (decoded.length >= 4) {
        sourceIndex += decoded[1];
        sourceLine += decoded[2];
        sourceColumn += decoded[3];

        // Armazena o primeiro mapeamento de cada linha gerada
        if (!mappings.has(generatedLine)) {
          mappings.set(generatedLine, {
            generatedLine,
            generatedColumn,
            sourceIndex,
            sourceLine: sourceLine + 1, // 1-indexed
            sourceColumn,
            source: sourceMap.sources[sourceIndex],
          });
        }
      }
    }
  }

  return mappings;
}

/**
 * Encontra a posição original no código fonte
 * @param {object} sourceMap - Objeto source map
 * @param {number} line - Linha no código gerado
 * @param {number} column - Coluna no código gerado (opcional)
 * @returns {object|null} Informações da posição original
 */
function findOriginalPosition(sourceMap, line, column = 0) {
  const mappings = parseSourceMap(sourceMap);
  
  // Busca a linha exata ou a mais próxima
  let closest = null;
  let closestDiff = Infinity;

  for (const [genLine, mapping] of mappings) {
    const diff = Math.abs(genLine - line);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = mapping;
    }
    if (genLine === line) {
      return mapping;
    }
  }

  return closest;
}

/**
 * Analisa o contexto ao redor de uma posição no bundle
 * @param {string} code - Código do bundle
 * @param {number} line - Número da linha
 * @param {number} contextLines - Linhas de contexto
 * @returns {object} Contexto da linha
 */
function analyzeContext(code, line, contextLines = 5) {
  const lines = code.split('\n');
  const startLine = Math.max(0, line - contextLines - 1);
  const endLine = Math.min(lines.length, line + contextLines);

  const context = [];
  for (let i = startLine; i < endLine; i++) {
    const lineNum = i + 1;
    const lineContent = lines[i] || '';
    const marker = lineNum === line ? '>>> ' : '    ';
    
    // Trunca linhas muito longas
    const truncated = lineContent.length > 200 
      ? lineContent.substring(0, 200) + '...' 
      : lineContent;
    
    context.push(`${marker}${lineNum}: ${truncated}`);
  }

  return {
    lines: context,
    targetLine: lines[line - 1] || '',
    hasDocument: /\bdocument\b/.test(lines[line - 1] || ''),
  };
}

/**
 * Busca padrões específicos no bundle que podem causar o erro
 * @param {string} code - Código do bundle
 * @returns {object[]} Lista de padrões encontrados
 */
function findProblematicPatterns(code) {
  const patterns = [
    // Axios XSRF token handling
    { name: 'Axios XSRF', regex: /xsrf|csrf/gi },
    // Axios cookie handling
    { name: 'Axios Cookie', regex: /document\.cookie/gi },
    // Direct document access
    { name: 'document.createElement', regex: /document\.createElement/gi },
    { name: 'document.querySelector', regex: /document\.querySelector/gi },
    { name: 'document.body', regex: /document\.body/gi },
    { name: 'document.head', regex: /document\.head/gi },
    // Window access
    { name: 'window.document', regex: /window\.document/gi },
  ];

  const results = [];
  const lines = code.split('\n');

  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.regex.source, 'gi');
    
    lines.forEach((line, index) => {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        results.push({
          pattern: pattern.name,
          line: index + 1,
          snippet: line.substring(0, 150),
        });
      }
    });
  }

  return results;
}

/**
 * Analisa dependências que podem acessar document
 * @param {string} code - Código do bundle
 * @returns {object} Análise de dependências
 */
function analyzeDependencies(code) {
  const deps = {
    axios: {
      found: /axios/i.test(code),
      xsrfConfig: /withXSRFToken|xsrfCookieName|xsrfHeaderName/i.test(code),
      cookieAccess: /document\.cookie/i.test(code),
    },
    recordrtc: {
      found: /RecordRTC|MediaRecorder/i.test(code),
    },
    forensicCollectors: {
      sslCollector: /SSLCollector/i.test(code),
      pageResourcesCollector: /PageResourcesCollector/i.test(code),
      canvasFingerprint: /CanvasFingerprintCollector/i.test(code),
      webglFingerprint: /WebGLFingerprintCollector/i.test(code),
      fontsCollector: /FontsCollector/i.test(code),
    },
  };

  return deps;
}

// ============================================================================
// EXECUÇÃO PRINCIPAL
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const targetLine = args[0] ? parseInt(args[0], 10) : null;

  console.log('🔍 Diagnóstico de Erro "document is not defined"\n');
  console.log('=' .repeat(60) + '\n');

  // 1. Encontrar arquivos
  const swFile = findFile(CONFIG.serviceWorkerPattern);
  const mapFile = findFile(CONFIG.sourceMapPattern);

  if (!swFile) {
    console.error('❌ Service worker não encontrado. Execute npm run build primeiro.');
    process.exit(1);
  }

  console.log(`📄 Service Worker: ${path.basename(swFile)}`);
  console.log(`📄 Source Map: ${mapFile ? path.basename(mapFile) : 'NÃO ENCONTRADO'}\n`);

  // 2. Ler arquivos
  const code = fs.readFileSync(swFile, 'utf-8');
  console.log(`📊 Tamanho do bundle: ${(code.length / 1024).toFixed(2)} KB`);
  console.log(`📊 Total de linhas: ${code.split('\n').length}\n`);

  // 3. Analisar dependências
  console.log('📦 Análise de Dependências:\n');
  const deps = analyzeDependencies(code);
  
  console.log('  Axios:');
  console.log(`    - Presente: ${deps.axios.found ? '✅' : '❌'}`);
  console.log(`    - Config XSRF: ${deps.axios.xsrfConfig ? '⚠️ SIM' : '✅ NÃO'}`);
  console.log(`    - Acesso a cookie: ${deps.axios.cookieAccess ? '⚠️ SIM' : '✅ NÃO'}`);
  
  console.log('\n  Collectors DOM-required:');
  Object.entries(deps.forensicCollectors).forEach(([name, found]) => {
    console.log(`    - ${name}: ${found ? '⚠️ PRESENTE' : '✅ Ausente'}`);
  });

  // 4. Buscar padrões problemáticos
  console.log('\n🔎 Padrões Problemáticos Encontrados:\n');
  const problems = findProblematicPatterns(code);
  
  if (problems.length === 0) {
    console.log('  ✅ Nenhum padrão problemático encontrado\n');
  } else {
    problems.slice(0, 20).forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.pattern}] Linha ${p.line}`);
      console.log(`     ${p.snippet.substring(0, 100)}...\n`);
    });
    if (problems.length > 20) {
      console.log(`  ... e mais ${problems.length - 20} ocorrências\n`);
    }
  }

  // 5. Se linha específica foi fornecida, analisar
  if (targetLine) {
    console.log(`\n🎯 Análise da Linha ${targetLine}:\n`);
    
    const context = analyzeContext(code, targetLine);
    console.log('  Contexto:');
    context.lines.forEach(line => console.log(`  ${line}`));
    console.log(`\n  Contém "document": ${context.hasDocument ? '⚠️ SIM' : '❌ NÃO'}`);

    // Tentar mapear para código fonte
    if (mapFile) {
      try {
        const sourceMap = JSON.parse(fs.readFileSync(mapFile, 'utf-8'));
        const original = findOriginalPosition(sourceMap, targetLine);
        
        if (original) {
          console.log('\n  📍 Posição Original:');
          console.log(`     Arquivo: ${original.source}`);
          console.log(`     Linha: ${original.sourceLine}`);
          console.log(`     Coluna: ${original.sourceColumn}`);
        }
      } catch (e) {
        console.log(`\n  ⚠️ Erro ao processar source map: ${e.message}`);
      }
    }
  }

  // 6. Sugestões
  console.log('\n💡 Sugestões de Diagnóstico:\n');
  
  if (deps.axios.cookieAccess) {
    console.log('  1. ⚠️ Axios pode estar acessando document.cookie');
    console.log('     Verificar se api-client.ts usa adapter: "fetch" e withXSRFToken: false\n');
  }

  if (Object.values(deps.forensicCollectors).some(v => v)) {
    console.log('  2. ⚠️ Collectors DOM-required encontrados no bundle');
    console.log('     Verificar se dynamic imports estão funcionando corretamente\n');
  }

  console.log('  3. Para identificar a linha exata do erro:');
  console.log('     - Abra chrome://extensions');
  console.log('     - Clique em "service worker" da extensão');
  console.log('     - Vá em Sources > service-worker-*.js');
  console.log('     - Adicione breakpoint na linha do erro');
  console.log('     - Reproduza o erro e analise o stack trace\n');

  console.log('  4. Para testar com dominio especifico:');
  console.log('     - Navegue para https://exemplo-advocacia.adv.br');
  console.log('     - Inicie captura de video');
  console.log('     - Observe o console do service worker\n');

  console.log('=' .repeat(60));
  console.log('📋 Diagnóstico concluído.');
}

main();
