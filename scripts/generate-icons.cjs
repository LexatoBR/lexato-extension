#!/usr/bin/env node

/**
 * Script para gerar ícones PNG da extensão Lexato
 * 
 * Gera ícones em múltiplos tamanhos a partir do SVG oficial do Lexato.
 * Requer: sharp (npm install sharp --save-dev)
 * 
 * Uso: node scripts/generate-icons.cjs
 */

const fs = require('fs');
const path = require('path');

// Tamanhos de ícones necessários para Chrome Extension
const ICON_SIZES = [16, 32, 48, 128];

// Diretório de saída
const OUTPUT_DIR = path.join(__dirname, '../src/assets/icons');

// Caminho para o SVG oficial do Lexato (na pasta branding)
const BRANDING_SVG_PATH = path.join(__dirname, '../../../branding/logomarcas');

/**
 * Lê o SVG oficial do Lexato da pasta branding
 * @returns {string} Conteúdo do SVG
 */
function lerSvgOficial() {
  // Procura pelo favicon.svg na pasta branding (pode ter espaço no nome)
  const arquivos = fs.readdirSync(BRANDING_SVG_PATH);
  const faviconFile = arquivos.find(f => f.includes('favicon.svg'));
  
  if (!faviconFile) {
    throw new Error('Arquivo favicon.svg não encontrado em branding/logomarcas/');
  }
  
  const svgPath = path.join(BRANDING_SVG_PATH, faviconFile);
  return fs.readFileSync(svgPath, 'utf-8');
}

/**
 * Gera ícones PNG usando sharp a partir do SVG oficial do Lexato
 */
async function generateIcons() {
  console.log('🎨 Gerando ícones da extensão Lexato...\n');

  // Garantir que o diretório existe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Ler SVG oficial do Lexato
  let iconSvg;
  try {
    iconSvg = lerSvgOficial();
    console.log('✅ SVG oficial do Lexato carregado de branding/logomarcas/');
  } catch (error) {
    console.error('❌ Erro ao carregar SVG oficial:', error.message);
    process.exit(1);
  }

  // Salvar cópia do SVG no diretório de ícones
  const svgPath = path.join(OUTPUT_DIR, 'icon.svg');
  fs.writeFileSync(svgPath, iconSvg);
  console.log(`✅ SVG copiado para: ${svgPath}`);

  // Gerar PNGs usando sharp
  try {
    const sharp = require('sharp');
    
    for (const size of ICON_SIZES) {
      const outputPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
      
      await sharp(Buffer.from(iconSvg))
        .resize(size, size)
        .png()
        .toFile(outputPath);
      
      console.log(`✅ PNG gerado: icon-${size}.png (${size}x${size})`);
    }
    
    // Copiar também para o diretório branding da extensão
    const brandingDir = path.join(__dirname, '../src/assets/branding');
    if (!fs.existsSync(brandingDir)) {
      fs.mkdirSync(brandingDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(brandingDir, 'icon.svg'), iconSvg);
    for (const size of ICON_SIZES) {
      const srcPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
      const destPath = path.join(brandingDir, `icon-${size}.png`);
      fs.copyFileSync(srcPath, destPath);
    }
    console.log('✅ Ícones copiados para src/assets/branding/');
    
    console.log('\n🎉 Todos os ícones foram gerados com sucesso!');
    console.log('   Fonte: branding/logomarcas/favicon.svg (ícone oficial Lexato)');
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('\n⚠️  Sharp não encontrado.');
      console.log('   Execute: npm install sharp --save-dev');
      console.log('   Depois: node scripts/generate-icons.cjs\n');
    } else {
      throw error;
    }
  }
}

// Executar
generateIcons().catch(console.error);
