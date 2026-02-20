#!/usr/bin/env node
/**
 * Script de Análise de Referências a 'document' no Bundle
 *
 * Analisa o service worker bundle para identificar onde 'document' é acessado
 * sem guards apropriados (typeof document !== 'undefined').
 *
 * @example
 * ```bash
 * node scripts/analyze-document-refs.js
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
  serviceWorkerPattern: /service-worker.*\.js$/,
  contextLinesBack: 3,
  snippetMaxLength: 100,
  contextMaxLength: 200,
  moduleSearchRadius: { before: 5000, after: 1000 },
};

/**
 * Collectors que requerem DOM e não devem estar no service worker
 * @type {string[]}
 */
const DOM_REQUIRED_COLLECTORS = [
  'SSLCollector',
  'PageResourcesCollector',
  'CanvasFingerprintCollector',
  'WebGLFingerprintCollector',
  'FontsCollector',
];

// ============================================================================
// PADRÕES DE DETECÇÃO
// ============================================================================

/** Padrões que indicam guards de segurança */
const SAFE_GUARD_PATTERNS = [
  /typeof\s+document\s*[!=]==?\s*['"]undefined['"]/,
  /typeof\s+document\s*[!=]==?\s*"undefined"/,
  /document\s*[!=]==?\s*undefined/,
  /typeof\s+window\s*[!=]==?\s*['"]undefined['"]/,
];

/**
 * Cria padrões perigosos de acesso ao document
 * @returns {RegExp[]}
 */
function createDangerousPatterns() {
  const documentMembers = [
    'createElement', 'querySelector', 'querySelectorAll', 'getElementById', 'getElementsBy',
    'body', 'head', 'documentElement', 'activeElement', 'forms', 'images', 'links', 'scripts',
    'fonts', 'cookie', 'title', 'URL', 'domain', 'referrer', 'readyState', 'visibilityState', 'hidden',
    'createElementNS', 'createDocumentFragment', 'createTextNode', 'createComment',
    'styleSheets', 'implementation', 'doctype', 'characterSet', 'contentType', 'designMode',
    'fullscreenElement', 'exitFullscreen', 'pointerLockElement', 'exitPointerLock',
    'write', 'writeln', 'open', 'close', 'clear', 'execCommand',
  ];

  return [
    new RegExp(`\\bdocument\\.(${documentMembers.join('|')})\\b`, 'g'),
    /\bdocument\s*=/g,
    /\(\s*document\s*[,)]/g,
    /\{\s*\w+\s*\}\s*=\s*document\b/g,
  ];
}

// ============================================================================
// FUNÇÕES DE ANÁLISE
// ============================================================================

/**
 * Encontra o arquivo do service worker no diretório dist
 * @returns {string} Caminho completo do arquivo service worker
 */
function findServiceWorkerFile() {
  if (!fs.existsSync(CONFIG.distDir)) {
    console.error('❌ Diretório dist/ não encontrado. Execute npm run build primeiro.');
    process.exit(1);
  }

  const files = fs.readdirSync(CONFIG.distDir);
  const swFile = files.find(f => CONFIG.serviceWorkerPattern.test(f));

  if (!swFile) {
    console.error('❌ Arquivo service-worker*.js não encontrado em dist/');
    process.exit(1);
  }

  return path.join(CONFIG.distDir, swFile);
}

/**
 * Verifica se o contexto possui guard de segurança
 * @param {string} context - Contexto de código a verificar
 * @returns {boolean}
 */
function hasGuardInContext(context) {
  return SAFE_GUARD_PATTERNS.some(pattern => pattern.test(context));
}

/**
 * Extrai snippet formatado da linha
 * @param {string} line - Linha de código
 * @returns {string}
 */
function extractSnippet(line) {
  return line.trim().substring(0, CONFIG.snippetMaxLength);
}

/**
 * Analisa o código em busca de referências a document sem guards
 * @param {string} code - Código fonte a analisar
 * @returns {Array<{line: number, column: number, snippet: string, pattern: string, context: string}>}
 */
function analyzeDocumentReferences(code) {
  const results = [];
  const lines = code.split('\n');
  const dangerousPatterns = createDangerousPatterns();

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    if (!/\bdocument\b/.test(line)) return;

    const contextStart = Math.max(0, index - CONFIG.contextLinesBack);
    const context = lines.slice(contextStart, index + 1).join('\n');

    if (hasGuardInContext(context)) return;

    const snippet = extractSnippet(line);

    // Verifica qual padrão perigoso foi encontrado
    for (const pattern of dangerousPatterns) {
      pattern.lastIndex = 0; // Reset regex state
      if (pattern.test(line)) {
        results.push({
          line: lineNum,
          column: line.indexOf('document'),
          snippet,
          pattern: pattern.source.substring(0, 50),
          context: context.substring(0, CONFIG.contextMaxLength),
        });
        return;
      }
    }

    // Referência genérica a document
    results.push({
      line: lineNum,
      column: line.indexOf('document'),
      snippet,
      pattern: 'generic document reference',
      context: context.substring(0, CONFIG.contextMaxLength),
    });
  });

  return results;
}

/**
 * Tenta identificar o módulo de origem baseado em comentários ou padrões
 * @param {string} code - Código fonte
 * @param {number} position - Posição aproximada no código
 * @returns {string[]}
 */
function identifySourceModule(code, position) {
  const { before, after } = CONFIG.moduleSearchRadius;
  const searchStart = Math.max(0, position - before);
  const searchEnd = Math.min(code.length, position + after);
  const context = code.substring(searchStart, searchEnd);

  const modulePatterns = [
    /\/\*\s*@module\s+(\S+)\s*\*\//g,
    /["']([^"']+(?:collector|service|handler|strategy)[^"']*)["']/gi,
    /from\s*["']([^"']+)["']/g,
  ];

  const modules = new Set();
  for (const pattern of modulePatterns) {
    let match;
    while ((match = pattern.exec(context)) !== null) {
      modules.add(match[1]);
    }
  }

  return Array.from(modules);
}

/**
 * Analisa presença de collectors DOM-required no bundle
 * @param {string} code - Código fonte
 */
function analyzeDomCollectors(code) {
  console.log('\n🔎 Analisando imports de collectors DOM-required...\n');

  DOM_REQUIRED_COLLECTORS.forEach(collector => {
    const regex = new RegExp(`\\b${collector}\\b`, 'g');
    const matches = code.match(regex);
    if (matches) {
      console.log(`⚠️  ${collector}: ${matches.length} referência(s) encontrada(s)`);
    } else {
      console.log(`✅ ${collector}: não encontrado no bundle`);
    }
  });
}

// ============================================================================
// EXECUÇÃO PRINCIPAL
// ============================================================================

function main() {
  console.log('🔍 Analisando bundle do Service Worker...\n');

  const swFile = findServiceWorkerFile();
  console.log(`📄 Arquivo: ${path.basename(swFile)}\n`);

  const code = fs.readFileSync(swFile, 'utf-8');
  console.log(`📊 Tamanho: ${(code.length / 1024).toFixed(2)} KB\n`);

  const results = analyzeDocumentReferences(code);

  if (results.length === 0) {
    console.log('✅ Nenhuma referência perigosa a "document" encontrada!\n');
  } else {
    console.log(`⚠️  Encontradas ${results.length} referências potencialmente perigosas:\n`);

    results.forEach((result, i) => {
      console.log(`--- Referência ${i + 1} ---`);
      console.log(`📍 Linha: ${result.line}, Coluna: ${result.column}`);
      console.log(`📝 Snippet: ${result.snippet}`);
      console.log(`🔍 Padrão: ${result.pattern}`);

      const possibleModules = identifySourceModule(code, result.line * 100);
      if (possibleModules.length > 0) {
        console.log(`📦 Possíveis módulos: ${possibleModules.join(', ')}`);
      }
      console.log('');
    });
  }

  analyzeDomCollectors(code);

  console.log('\n📋 Análise concluída.');
}

main();
