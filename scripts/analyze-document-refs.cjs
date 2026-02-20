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

/**
 * Encontra o arquivo do service worker no dist/assets
 */
function findServiceWorkerFile() {
  const assetsDir = path.join(CONFIG.distDir, 'assets');
  
  if (!fs.existsSync(assetsDir)) {
    console.error('❌ Diretório dist/assets não encontrado. Execute npm run build primeiro.');
    process.exit(1);
  }

  const files = fs.readdirSync(assetsDir);
  const swFile = files.find(f => CONFIG.serviceWorkerPattern.test(f));
  
  if (!swFile) {
    console.error('❌ Arquivo service-worker*.js não encontrado em dist/assets/');
    process.exit(1);
  }

  return path.join(assetsDir, swFile);
}

/**
 * Analisa o código em busca de referências a document
 */
function analyzeDocumentReferences(code, filename) {
  const results = [];
  const lines = code.split('\n');
  
  // Padrões perigosos (acesso direto a document sem guard)
  const dangerousPatterns = [
    // Acesso direto a propriedades/métodos de document
    /\bdocument\.(createElement|querySelector|querySelectorAll|getElementById|getElementsBy|body|head|documentElement|fonts|cookie|title|URL|domain|referrer|readyState|visibilityState|hidden|activeElement|forms|images|links|scripts|styleSheets|implementation|doctype|characterSet|contentType|designMode|dir|lastModified|location|defaultView|currentScript|fullscreenElement|pointerLockElement|scrollingElement|timeline|adoptedStyleSheets|pictureInPictureElement|featurePolicy|fragmentDirective|rootElement|compatMode|embeds|plugins|anchors|applets|all|children|firstElementChild|lastElementChild|childElementCount|prepend|append|replaceChildren|getSelection|hasFocus|exitFullscreen|exitPointerLock|exitPictureInPicture|getAnimations|createAttribute|createAttributeNS|createCDATASection|createComment|createDocumentFragment|createElementNS|createEvent|createExpression|createNSResolver|createNodeIterator|createProcessingInstruction|createRange|createTextNode|createTreeWalker|evaluate|execCommand|queryCommandEnabled|queryCommandIndeterm|queryCommandState|queryCommandSupported|queryCommandValue|write|writeln|open|close|clear|captureEvents|releaseEvents|caretRangeFromPoint|elementFromPoint|elementsFromPoint|getBoxQuads|convertQuadFromNode|convertRectFromNode|convertPointFromNode|scroll|scrollBy|scrollTo)\b/g,
    // Atribuição a document
    /\bdocument\s*=/g,
    // document como argumento
    /\(\s*document\s*[,)]/g,
    // Desestruturação de document
    /\{\s*\w+\s*\}\s*=\s*document\b/g,
  ];

  // Padrões seguros (guards)
  const safePatterns = [
    /typeof\s+document\s*[!=]==?\s*['"]undefined['"]/,
    /typeof\s+document\s*[!=]==?\s*"undefined"/,
    /document\s*[!=]==?\s*undefined/,
    /typeof\s+window\s*[!=]==?\s*['"]undefined['"]/,
  ];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Verifica se a linha tem referência a document
    if (/\bdocument\b/.test(line)) {
      // Verifica se tem guard na mesma linha ou nas 3 linhas anteriores
      const contextStart = Math.max(0, index - 3);
      const context = lines.slice(contextStart, index + 1).join('\n');
      
      const hasSafeGuard = safePatterns.some(pattern => pattern.test(context));
      
      if (!hasSafeGuard) {
        // Extrai o trecho relevante (até 100 chars)
        const snippet = line.trim().substring(0, 100);
        
        // Verifica qual padrão perigoso foi encontrado
        for (const pattern of dangerousPatterns) {
          if (pattern.test(line)) {
            results.push({
              line: lineNum,
              column: line.indexOf('document'),
              snippet,
              pattern: pattern.source.substring(0, 50),
              context: context.substring(0, 200),
            });
            break;
          }
        }
        
        // Se não encontrou padrão específico mas tem document
        if (!results.find(r => r.line === lineNum)) {
          results.push({
            line: lineNum,
            column: line.indexOf('document'),
            snippet,
            pattern: 'generic document reference',
            context: context.substring(0, 200),
          });
        }
      }
    }
  });

  return results;
}

/**
 * Tenta identificar o módulo de origem baseado em comentários ou padrões
 */
function identifySourceModule(code, position) {
  // Procura por comentários de source map ou nomes de módulos próximos
  const searchStart = Math.max(0, position - 5000);
  const searchEnd = Math.min(code.length, position + 1000);
  const context = code.substring(searchStart, searchEnd);
  
  // Padrões comuns em código minificado que indicam módulo
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

// Main
console.log('🔍 Analisando bundle do Service Worker...\n');

const swFile = findServiceWorkerFile();
console.log(`📄 Arquivo: ${path.basename(swFile)}\n`);

const code = fs.readFileSync(swFile, 'utf-8');
console.log(`📊 Tamanho: ${(code.length / 1024).toFixed(2)} KB\n`);

const results = analyzeDocumentReferences(code, swFile);

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

// Análise adicional: busca por imports problemáticos
console.log('\n🔎 Analisando imports de collectors DOM-required...\n');

const domCollectors = [
  'SSLCollector',
  'PageResourcesCollector', 
  'CanvasFingerprintCollector',
  'WebGLFingerprintCollector',
  'FontsCollector',
];

domCollectors.forEach(collector => {
  const regex = new RegExp(`\\b${collector}\\b`, 'g');
  const matches = code.match(regex);
  if (matches) {
    console.log(`⚠️  ${collector}: ${matches.length} referência(s) encontrada(s)`);
  } else {
    console.log(`✅ ${collector}: não encontrado no bundle`);
  }
});

console.log('\n📋 Análise concluída.');
