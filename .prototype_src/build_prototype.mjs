import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const templatePath = resolve(__dirname, 'template_shell.html');
const imagesPath = resolve(__dirname, 'images_data.js');
const articlesPath = resolve(__dirname, 'articles_data.js');
const outputPath = resolve(rootDir, 'index.html');
const distDir = resolve(rootDir, 'dist');

const IMAGES_PLACEHOLDER = '/* __INJECT_IMAGES_DATA__ */';
const ARTICLES_PLACEHOLDER = '/* __INJECT_ARTICLES_DATA__ */';

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function escapeInlineScript(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

function injectOnce(source, placeholder, payload, label) {
  const firstIdx = source.indexOf(placeholder);
  if (firstIdx === -1) {
    throw new Error(`Missing placeholder ${placeholder} for ${label}`);
  }
  if (source.lastIndexOf(placeholder) !== firstIdx) {
    throw new Error(`Duplicate placeholder ${placeholder} found for ${label}`);
  }
  return source.replace(placeholder, () => payload);
}

function validateGeneratedHtml(html) {
  if (html.charCodeAt(0) === 0xfeff) {
    throw new Error('Generated HTML unexpectedly starts with UTF-8 BOM');
  }

  const remainingInject = html.match(/__INJECT_[A-Z0-9_]*__|__INJECT_/g);
  if (remainingInject) {
    throw new Error(`Found unreplaced placeholder(s): ${remainingInject.join(', ')}`);
  }

  const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scriptMatches.length === 0) {
    throw new Error('No <script> block found in generated HTML');
  }
  for (let i = 0; i < scriptMatches.length; i++) {
    const code = scriptMatches[i][1];
    try {
      // Syntax-check each inline script block without executing DOM side effects
      new Function(code);
    } catch (err) {
      throw new Error(`JS syntax error in <script> block #${i + 1}: ${err.message}`);
    }
  }

  const requiredPostIds = ['post-spawn-enoent', 'post-rust-sync-bugs', 'post-macos-sandbox'];
  for (const id of requiredPostIds) {
    if (!html.includes(`id: '${id}'`) && !html.includes(`id: "${id}"`)) {
      throw new Error(`Missing post entry for id: ${id}`);
    }
  }

  for (const token of ['Caramelized Notes', '焦糖笔记']) {
    if (!html.includes(token)) {
      throw new Error(`Missing site brand token: ${token}`);
    }
  }

  const forbiddenTokens = [
    '焦糖算子',
    '因果接缝标本',
    '左文右标本对照流',
    '画作归呼吸，短记归日常',
    '独立承载二次元光影',
  ];
  for (const forbidden of forbiddenTokens) {
    if (html.includes(forbidden)) {
      throw new Error(`Found forbidden copy token in generated HTML: ${forbidden}`);
    }
  }

  const strayAppleMatch = html.replace(/-apple-system/g, '').match(/apple/i);
  if (strayAppleMatch !== null) {
    throw new Error(`Found unexpected "apple" token in generated HTML: ${strayAppleMatch[0]}`);
  }

  const themeBlocks = [
    { name: 'warm (:root)', pattern: /:root\s*\{[\s\S]*?--bg-page:\s*#f6f3ec[\s\S]*?\}/ },
    { name: 'night', pattern: /\[data-theme="night"\]\s*\{[\s\S]*?--bg-page:\s*#121110[\s\S]*?\}/ },
    { name: 'daylight', pattern: /\[data-theme="daylight"\]\s*\{[\s\S]*?--bg-page:\s*#f5f5f7[\s\S]*?\}/ },
  ];
  for (const theme of themeBlocks) {
    const match = html.match(theme.pattern);
    if (!match || match[0].trim().length === 0) {
      throw new Error(`Missing or empty CSS theme block: ${theme.name}`);
    }
  }

  return scriptMatches.length;
}

function main() {
  const withDist = process.argv.slice(2).includes('--dist');
  const template = stripBom(readFileSync(templatePath, 'utf8'));
  const imagesData = escapeInlineScript(stripBom(readFileSync(imagesPath, 'utf8')).trimEnd());
  const articlesData = escapeInlineScript(stripBom(readFileSync(articlesPath, 'utf8')).trimEnd());

  let output = injectOnce(template, IMAGES_PLACEHOLDER, imagesData, 'images_data.js');
  output = injectOnce(output, ARTICLES_PLACEHOLDER, articlesData, 'articles_data.js');
  output = stripBom(output);

  const scriptCount = validateGeneratedHtml(output);
  writeFileSync(outputPath, output, 'utf8');

  if (withDist) {
    mkdirSync(distDir, { recursive: true });
    writeFileSync(resolve(distDir, 'index.html'), output, 'utf8');
    writeFileSync(resolve(distDir, '.nojekyll'), '', 'utf8');
  }

  const bytes = Buffer.byteLength(output, 'utf8');
  console.log(
    `[build_prototype] Built ${outputPath}${withDist ? ` + ${resolve(distDir, 'index.html')} + ${resolve(distDir, '.nojekyll')}` : ''} (${bytes} bytes, UTF-8 no BOM, ${scriptCount} validated <script> block)`
  );
}

main();
