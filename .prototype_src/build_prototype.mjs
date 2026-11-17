import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const templatePath = resolve(__dirname, 'template_shell.html');
const imagesPath = resolve(__dirname, 'images_data.js');
const articlesPath = resolve(__dirname, 'articles_data.js');
const outputPath = resolve(rootDir, 'index.html');
const distDir = resolve(rootDir, 'dist');

const SITE_URL = (process.env.SITE_URL || 'https://caramelizedcuda.github.io').replace(/\/+$/, '');
const SITE_NAME = 'Caramelized Notes · 焦糖笔记';
const SITE_TITLE = 'Caramelized Notes · 焦糖笔记 — CaramelizedCUDA';
const SITE_DESCRIPTION =
  '焦糖笔记：CaramelizedCUDA 的个人技术博客。记录系统与桌面端排障、架构与工具拆解，以及案头阅读与随笔。';
const SITE_COVER_KEY = 'windowStudy';
// 发布日期没有时分，按东八区零点计
const POST_TIMEZONE = '+08:00';

const IMAGES_PLACEHOLDER = '/* __INJECT_IMAGES_DATA__ */';
const ARTICLES_PLACEHOLDER = '/* __INJECT_ARTICLES_DATA__ */';
const HEAD_META_PLACEHOLDER = '<!-- __INJECT_HEAD_META__ -->';

const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="16" fill="#c86446"/>' +
  '<text x="32" y="44" text-anchor="middle" font-size="34" font-weight="700" fill="#fcfaf6" ' +
  'font-family="\'Songti SC\',\'STSong\',\'Noto Serif SC\',\'SimSun\',serif">焦</text>' +
  '</svg>';

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function escapeInlineScript(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cdata(str) {
  return '<![CDATA[' + String(str).replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
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

function postSlug(postId) {
  return String(postId).replace(/^post-/, '');
}

function postPath(post) {
  return `/posts/${encodeURIComponent(postSlug(post.id))}/`;
}

function postDateIso(dateStr) {
  return `${dateStr}T00:00:00${POST_TIMEZONE}`;
}

/** 在隔离函数里求值两份数据文件，拿到结构化的文章与图片数据（不触碰 DOM）。 */
function evaluateData(imagesCode, articlesCode) {
  const factory = new Function(
    `${imagesCode}\n${articlesCode}\nreturn { IMAGES, BLOG_POSTS, MICRO_LOGS: typeof MICRO_LOGS === 'undefined' ? [] : MICRO_LOGS };`
  );
  const data = factory();
  if (!Array.isArray(data.BLOG_POSTS) || data.BLOG_POSTS.length === 0) {
    throw new Error('BLOG_POSTS is empty or not an array');
  }
  const seenSlugs = new Set();
  for (const post of data.BLOG_POSTS) {
    for (const field of ['id', 'title', 'date']) {
      if (!post[field]) throw new Error(`Post is missing required field "${field}": ${JSON.stringify(post.id)}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) throw new Error(`Bad date for ${post.id}: ${post.date}`);
    if (post.updated && !/^\d{4}-\d{2}-\d{2}$/.test(post.updated)) {
      throw new Error(`Bad updated date for ${post.id}: ${post.updated}`);
    }
    if (post.coverFit !== undefined && post.coverFit !== 'cover' && post.coverFit !== 'contain') {
      throw new Error(`Bad coverFit for ${post.id}: ${JSON.stringify(post.coverFit)}`);
    }
    if (post.coverBg !== undefined && (typeof post.coverBg !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(post.coverBg))) {
      throw new Error(`Bad coverBg for ${post.id}: ${JSON.stringify(post.coverBg)}`);
    }
    const slug = postSlug(post.id);
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Post slug must be [a-z0-9-]: ${slug}`);
    if (seenSlugs.has(slug)) throw new Error(`Duplicate post slug: ${slug}`);
    seenSlugs.add(slug);
  }
  return data;
}

/**
 * 把 images_data.js 中的 base64 data URI 拆成独立文件。
 * 返回改写后的源码（data URI → /assets/img/...），以及 data URI → 路径 的映射。
 */
function externalizeImages(imagesCode) {
  const files = [];
  const uriToPath = new Map();
  const keyToPath = {};
  const rewritten = imagesCode.replace(
    /(\w+)(\s*:\s*)"data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)"/g,
    (match, key, sep, ext, b64) => {
      const bytes = Buffer.from(b64, 'base64');
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
      const normalizedExt = ext === 'jpeg' ? 'jpg' : ext;
      const path = `/assets/img/${key}.${hash}.${normalizedExt}`;
      files.push({ path, bytes });
      uriToPath.set(`data:image/${ext};base64,${b64}`, path);
      keyToPath[key] = path;
      return `${key}${sep}"${path}"`;
    }
  );
  if (files.length === 0) throw new Error('No base64 images found in images_data.js');
  return { rewritten, files, uriToPath, keyToPath };
}

function renderHeadMeta(page, assets) {
  const imagePath = page.image ? assets.uriToPath.get(page.image) : null;
  const imageUrl = imagePath ? SITE_URL + imagePath : null;
  const lines = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(page.url)}" />`,
    `<link rel="icon" type="image/svg+xml" href="${escapeHtml(assets.faviconHref)}" />`,
    `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE_NAME)}" href="${escapeHtml(assets.rssHref)}" />`,
    `<meta name="theme-color" content="#f6f3ec" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="zh_CN" />`,
    `<meta property="og:type" content="${page.type}" />`,
    `<meta property="og:title" content="${escapeHtml(page.ogTitle || page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(page.url)}" />`
  ];
  if (imageUrl) {
    lines.push(`<meta property="og:image" content="${escapeHtml(imageUrl)}" />`);
    lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  } else {
    lines.push(`<meta name="twitter:card" content="summary" />`);
  }
  if (page.published) lines.push(`<meta property="article:published_time" content="${page.published}" />`);
  if (page.modified) lines.push(`<meta property="article:modified_time" content="${page.modified}" />`);
  for (const tag of page.tags || []) {
    lines.push(`<meta property="article:tag" content="${escapeHtml(tag)}" />`);
  }
  return lines.join('\n  ');
}

function buildPages(data, images) {
  const pages = [
    {
      file: 'index.html',
      route: '/',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      url: SITE_URL + '/',
      type: 'website',
      image: images[SITE_COVER_KEY]
    },
    {
      file: 'archive/index.html',
      route: '/archive/',
      title: '文章归档 — 焦糖笔记',
      description: '焦糖笔记的全部文章：系统与桌面端排障、架构与工具、设计与随笔。',
      url: SITE_URL + '/archive/',
      type: 'website',
      image: images[SITE_COVER_KEY]
    }
  ];
  for (const post of data.BLOG_POSTS) {
    pages.push({
      file: `posts/${postSlug(post.id)}/index.html`,
      route: postPath(post),
      postId: post.id,
      title: `${post.title} — 焦糖笔记`,
      ogTitle: post.title,
      description: post.summary || post.subtitle || SITE_DESCRIPTION,
      url: SITE_URL + postPath(post),
      type: 'article',
      image: post.cover,
      published: postDateIso(post.date),
      modified: post.updated ? postDateIso(post.updated) : null,
      tags: post.tags || []
    });
  }
  return pages;
}

function sectionsToHtml(post) {
  return (post.sections || [])
    .map((sec) => {
      const body = String(sec.html || '')
        .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, '')
        .replace(/\s+class="[^"]*"/g, '');
      return `<h2>${escapeHtml(sec.heading)}</h2>\n${body.trim()}`;
    })
    .join('\n');
}

function buildRss(data) {
  const posts = [...data.BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));
  const lastDate = posts.reduce((acc, p) => {
    const d = p.updated && p.updated > p.date ? p.updated : p.date;
    return d > acc ? d : acc;
  }, posts[0].date);
  const items = posts
    .map((post) => {
      const link = SITE_URL + postPath(post);
      const categories = [post.categoryLabel, ...(post.tags || [])]
        .filter(Boolean)
        .map((c) => `      <category>${escapeHtml(c)}</category>`)
        .join('\n');
      return [
        '    <item>',
        `      <title>${escapeHtml(post.title)}</title>`,
        `      <link>${escapeHtml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeHtml(link)}</guid>`,
        `      <pubDate>${new Date(postDateIso(post.date)).toUTCString()}</pubDate>`,
        `      <description>${escapeHtml(post.summary || post.subtitle || '')}</description>`,
        categories,
        `      <content:encoded>${cdata(sectionsToHtml(post))}</content:encoded>`,
        '    </item>'
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeHtml(SITE_NAME)}</title>`,
    `    <link>${SITE_URL}/</link>`,
    `    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeHtml(SITE_DESCRIPTION)}</description>`,
    '    <language>zh-CN</language>',
    `    <lastBuildDate>${new Date(postDateIso(lastDate)).toUTCString()}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');
}

function buildSitemap(data) {
  const urls = [
    { loc: SITE_URL + '/' },
    { loc: SITE_URL + '/archive/' },
    ...data.BLOG_POSTS.map((post) => ({ loc: SITE_URL + postPath(post), lastmod: post.updated || post.date }))
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`
    ),
    '</urlset>',
    ''
  ].join('\n');
}

function validateGeneratedHtml(html, label, { expectInlineImages }) {
  if (html.charCodeAt(0) === 0xfeff) {
    throw new Error(`[${label}] Generated HTML unexpectedly starts with UTF-8 BOM`);
  }

  const remainingInject = html.match(/__INJECT_[A-Z0-9_]*__|__INJECT_/g);
  if (remainingInject) {
    throw new Error(`[${label}] Found unreplaced placeholder(s): ${remainingInject.join(', ')}`);
  }

  const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scriptMatches.length === 0) {
    throw new Error(`[${label}] No <script> block found in generated HTML`);
  }
  for (let i = 0; i < scriptMatches.length; i++) {
    const code = scriptMatches[i][1];
    try {
      // Syntax-check each inline script block without executing DOM side effects
      new Function(code);
    } catch (err) {
      throw new Error(`[${label}] JS syntax error in <script> block #${i + 1}: ${err.message}`);
    }
  }

  const requiredPostIds = ['post-spawn-enoent', 'post-rust-sync-bugs', 'post-macos-sandbox'];
  for (const id of requiredPostIds) {
    if (!html.includes(`id: '${id}'`) && !html.includes(`id: "${id}"`)) {
      throw new Error(`[${label}] Missing post entry for id: ${id}`);
    }
  }

  for (const token of ['Caramelized Notes', '焦糖笔记']) {
    if (!html.includes(token)) {
      throw new Error(`[${label}] Missing site brand token: ${token}`);
    }
  }

  const forbiddenTokens = [
    '焦糖算子',
    '因果接缝标本',
    '左文右标本对照流',
    '画作归呼吸，短记归日常',
    '独立承载二次元光影',
    '三套主题',
  ];
  for (const forbidden of forbiddenTokens) {
    if (html.includes(forbidden)) {
      throw new Error(`[${label}] Found forbidden copy token in generated HTML: ${forbidden}`);
    }
  }

  const dingbatsMatch = html.match(/[\u2715\u2726]/);
  if (dingbatsMatch !== null) {
    const codePoint = dingbatsMatch[0].codePointAt(0).toString(16).toUpperCase();
    throw new Error(`[${label}] Found Dingbats character with missing-glyph risk: U+${codePoint}`);
  }

  const strayAppleMatch = html.replace(/-apple-system/g, '').match(/apple/i);
  if (strayAppleMatch !== null) {
    throw new Error(`[${label}] Found unexpected "apple" token in generated HTML: ${strayAppleMatch[0]}`);
  }

  const themeBlocks = [
    { name: 'warm (:root)', pattern: /:root\s*\{[\s\S]*?--bg-page:\s*#f6f3ec[\s\S]*?\}/ },
    { name: 'night', pattern: /\[data-theme="night"\]\s*\{[\s\S]*?--bg-page:\s*#121110[\s\S]*?\}/ },
  ];
  for (const theme of themeBlocks) {
    const match = html.match(theme.pattern);
    if (!match || match[0].trim().length === 0) {
      throw new Error(`[${label}] Missing or empty CSS theme block: ${theme.name}`);
    }
  }
  if (/daylight/.test(html)) {
    throw new Error(`[${label}] Removed "daylight" theme is still referenced`);
  }

  for (const required of ['<title>', 'name="description"', 'property="og:title"', 'property="og:url"', 'rel="canonical"']) {
    if (!html.includes(required)) {
      throw new Error(`[${label}] Missing head meta: ${required}`);
    }
  }

  for (const token of ['drawer-head', 'drawer-body', 'drawer-foot', 'scrollRestoration', 'is-theme-switching']) {
    if (!html.includes(token)) {
      throw new Error(`[${label}] Missing regression token: ${token}`);
    }
  }

  const rssLinkCount = (html.match(/<a\b[^>]*\bdata-rss-link\b/g) || []).length;
  if (rssLinkCount < 2) {
    throw new Error(`[${label}] Expected at least 2 <a data-rss-link> elements, found ${rssLinkCount}`);
  }

  const hasInlineJpeg = /data:image\/(jpe?g|png|webp);base64,/.test(html);
  if (expectInlineImages && !hasInlineJpeg) {
    throw new Error(`[${label}] Expected inline images in self-contained preview`);
  }
  if (!expectInlineImages && hasInlineJpeg) {
    throw new Error(`[${label}] Found inline base64 images in a dist page (should be external assets)`);
  }

  return scriptMatches.length;
}

function renderPage(template, imagesPayload, articlesPayload, headMeta) {
  let output = injectOnce(template, HEAD_META_PLACEHOLDER, headMeta, 'head meta');
  output = injectOnce(output, IMAGES_PLACEHOLDER, imagesPayload, 'images_data.js');
  output = injectOnce(output, ARTICLES_PLACEHOLDER, articlesPayload, 'articles_data.js');
  return stripBom(output);
}

function writeFileEnsured(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, typeof content === 'string' ? 'utf8' : undefined);
}

function main() {
  const withDist = process.argv.slice(2).includes('--dist');
  const template = stripBom(readFileSync(templatePath, 'utf8'));
  const imagesCode = stripBom(readFileSync(imagesPath, 'utf8')).trimEnd();
  const articlesCode = stripBom(readFileSync(articlesPath, 'utf8')).trimEnd();

  const data = evaluateData(imagesCode, articlesCode);
  const extracted = externalizeImages(imagesCode);
  const assetPathsCode = `\nconst IMAGE_ASSET_PATHS = ${JSON.stringify(extracted.keyToPath)};`;
  const articlesPayload = escapeInlineScript(articlesCode);
  const pages = buildPages(data, data.IMAGES);

  // 1) 仓库根目录 index.html：自包含单文件（图片内联），双击即可本地预览
  const homePage = pages[0];
  const previewHtml = renderPage(
    template,
    escapeInlineScript(imagesCode + assetPathsCode),
    articlesPayload,
    renderHeadMeta(homePage, {
      uriToPath: extracted.uriToPath,
      faviconHref: 'data:image/svg+xml,' + encodeURIComponent(FAVICON_SVG),
      rssHref: SITE_URL + '/rss.xml'
    })
  );
  const scriptCount = validateGeneratedHtml(previewHtml, 'index.html', { expectInlineImages: true });
  writeFileSync(outputPath, previewHtml, 'utf8');

  const report = [`${outputPath} (${Buffer.byteLength(previewHtml, 'utf8')} bytes, ${scriptCount} validated <script> block)`];

  // 2) dist/：每页独立 HTML + 外置图片 + RSS / sitemap / favicon
  if (withDist) {
    rmSync(distDir, { recursive: true, force: true });
    mkdirSync(distDir, { recursive: true });

    const distImagesPayload = escapeInlineScript(extracted.rewritten + assetPathsCode);
    const distAssets = { uriToPath: extracted.uriToPath, faviconHref: '/favicon.svg', rssHref: '/rss.xml' };

    for (const file of extracted.files) {
      writeFileEnsured(resolve(distDir, '.' + file.path), file.bytes);
    }

    let pageBytes = 0;
    for (const page of pages) {
      const html = renderPage(template, distImagesPayload, articlesPayload, renderHeadMeta(page, distAssets));
      validateGeneratedHtml(html, page.file, { expectInlineImages: false });
      if (!html.includes(`<meta property="og:url" content="${escapeHtml(page.url)}" />`)) {
        throw new Error(`[${page.file}] og:url does not match ${page.url}`);
      }
      writeFileEnsured(resolve(distDir, page.file), html);
      pageBytes = Math.max(pageBytes, Buffer.byteLength(html, 'utf8'));
    }

    // GitHub Pages 对未知路径返回 404.html：给一份首页外壳，前端路由会回落到首页
    const notFoundHtml = renderPage(
      template,
      distImagesPayload,
      articlesPayload,
      renderHeadMeta({ ...homePage, title: '页面不存在 — 焦糖笔记' }, distAssets).replace(
        '<link rel="canonical"',
        '<meta name="robots" content="noindex" />\n  <link rel="canonical"'
      )
    );
    validateGeneratedHtml(notFoundHtml, '404.html', { expectInlineImages: false });
    writeFileEnsured(resolve(distDir, '404.html'), notFoundHtml);

    writeFileEnsured(resolve(distDir, 'rss.xml'), buildRss(data));
    writeFileEnsured(resolve(distDir, 'sitemap.xml'), buildSitemap(data));
    writeFileEnsured(resolve(distDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
    writeFileEnsured(resolve(distDir, 'favicon.svg'), FAVICON_SVG + '\n');
    writeFileEnsured(resolve(distDir, '.nojekyll'), '');

    report.push(
      `${distDir}: ${pages.length} pages + 404.html (largest ${pageBytes} bytes), ` +
        `${extracted.files.length} image assets, rss.xml, sitemap.xml, robots.txt, favicon.svg, .nojekyll`
    );
  }

  console.log(`[build_prototype] Built (UTF-8 no BOM)\n  - ${report.join('\n  - ')}`);
}

main();
