/**
 * GDTTools 单 HTML 打包脚本
 *
 * 自动扫描 index.html 中所有 <link>/<script>/<img> 引用，
 * 将本地 CSS、JS、图片内联为单个自包含 HTML 文件。
 *
 * 用法:
 *   node build.js                       默认打包（CDN 保留，需联网看图标）
 *   node build.js --offline             全离线（CDN 也下载内联）
 *   node build.js --input other.html    指定入口（默认 index.html）
 *   node build.js --output dist.html    指定输出（默认 GDTTools-standalone.html）
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = __dirname;

// ── 命令行参数解析 ──────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name, defaultVal) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}

const OFFLINE = args.includes('--offline');
const INPUT = getArg('--input', 'index.html');
const OUTPUT = getArg('--output', 'release/GDTTools-standalone.html');

// ── MIME 类型映射 ───────────────────────────────────────────
const MIME_MAP = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

function getMime(filePath) {
  return MIME_MAP[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ── 工具函数 ────────────────────────────────────────────────
function isRemote(href) {
  return /^https?:\/\//i.test(href);
}

function sizeKB(buf) {
  return (Buffer.byteLength(buf) / 1024).toFixed(1);
}

/**
 * 通过 https/http 下载远程资源，返回 Buffer
 * 支持自动跟随最多 5 次 302 重定向
 */
function download(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error(`Too many redirects: ${url}`));
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error(`Redirect without location: ${url}`));
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        return resolve(download(next, redirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 解码 HTML 中的路径转义（如 %20 -> 空格）
 */
function decodeHtmlPath(href) {
  try { return decodeURIComponent(href); } catch { return href; }
}

/**
 * 读取本地文件，返回 Buffer；找不到时打印警告并返回 null
 */
function readLocal(relPath) {
  const decoded = decodeHtmlPath(relPath);
  const abs = path.resolve(ROOT, decoded);
  if (!fs.existsSync(abs)) {
    console.warn(`  [WARN] 文件不存在，跳过: ${abs}`);
    return null;
  }
  return fs.readFileSync(abs);
}

/**
 * 将 Buffer 转为 base64 data URI
 */
function toDataURI(buf, mime) {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ── CSS 内部 url() 资源内联 ─────────────────────────────────
/**
 * 处理 CSS 文本中的 url(...) 引用，将本地资源转为 data URI。
 * cssDir: 该 CSS 文件所在的目录（用于解析相对路径）
 */
async function inlineCssUrls(cssText, cssDir) {
  const urlRegex = /url\(\s*['"]?(?!data:)([^'")\s]+?)['"]?\s*\)/g;
  let match;
  const replacements = [];

  while ((match = urlRegex.exec(cssText)) !== null) {
    const raw = match[0];
    const ref = match[1];
    replacements.push({ raw, ref, index: match.index });
  }

  for (const r of replacements) {
    if (isRemote(r.ref)) {
      if (OFFLINE) {
        try {
          const buf = await download(r.ref);
          const mime = getMime(r.ref);
          const dataUri = toDataURI(buf, mime);
          cssText = cssText.split(r.raw).join(`url("${dataUri}")`);
          console.log(`    [CSS-URL] 下载并内联: ${r.ref} (${sizeKB(buf)} KB)`);
        } catch (e) {
          console.warn(`    [CSS-URL][WARN] 下载失败，保留原始: ${r.ref} - ${e.message}`);
        }
      }
    } else {
      const abs = path.resolve(cssDir, decodeHtmlPath(r.ref));
      if (fs.existsSync(abs)) {
        const buf = fs.readFileSync(abs);
        const mime = getMime(abs);
        const dataUri = toDataURI(buf, mime);
        cssText = cssText.split(r.raw).join(`url("${dataUri}")`);
        console.log(`    [CSS-URL] 内联本地: ${r.ref} (${sizeKB(buf)} KB)`);
      }
    }
  }

  return cssText;
}

// ── 主流程 ──────────────────────────────────────────────────
async function build() {
  const inputPath = path.resolve(ROOT, INPUT);
  if (!fs.existsSync(inputPath)) {
    console.error(`[ERROR] 入口文件不存在: ${inputPath}`);
    process.exit(1);
  }

  console.log(`\n=== GDTTools 单 HTML 打包 ===`);
  console.log(`入口: ${inputPath}`);
  console.log(`输出: ${path.resolve(ROOT, OUTPUT)}`);
  console.log(`模式: ${OFFLINE ? '离线（CDN 也内联）' : '在线（CDN 保留）'}\n`);

  let html = fs.readFileSync(inputPath, 'utf-8');

  // ── 1. 处理 <link rel="stylesheet" href="..."> ───────────
  console.log('[1/3] 处理 CSS 引用...');
  const linkRegex = /<link\s[^>]*?rel\s*=\s*["']stylesheet["'][^>]*?>/gi;
  const linkMatches = [...html.matchAll(linkRegex)];

  for (const m of linkMatches) {
    const tag = m[0];
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];

    if (isRemote(href)) {
      if (OFFLINE) {
        try {
          console.log(`  [CDN] 下载: ${href}`);
          let cssText = (await download(href)).toString('utf-8');
          const baseUrl = href.substring(0, href.lastIndexOf('/') + 1);
          cssText = await inlineRemoteCssUrls(cssText, baseUrl);
          html = html.replace(tag, () => `<style>/* CDN: ${href} */\n${cssText}</style>`);
          console.log(`  [CDN] 内联完成 (${sizeKB(cssText)} KB)`);
        } catch (e) {
          console.warn(`  [CDN][WARN] 下载失败，保留原始链接: ${href} - ${e.message}`);
        }
      } else {
        console.log(`  [CDN] 保留: ${href}`);
      }
    } else {
      const buf = readLocal(href);
      if (buf) {
        const cssDir = path.dirname(path.resolve(ROOT, decodeHtmlPath(href)));
        let cssText = buf.toString('utf-8');
        cssText = await inlineCssUrls(cssText, cssDir);
        html = html.replace(tag, () => `<style>/* ${href} */\n${cssText}</style>`);
        console.log(`  [LOCAL] 内联: ${href} (${sizeKB(buf)} KB)`);
      }
    }
  }

  // ── 2. 处理 <script src="..."> ────────────────────────────
  console.log('\n[2/3] 处理 JS 引用...');
  const scriptRegex = /<script\s[^>]*?src\s*=\s*["']([^"']+)["'][^>]*?>\s*<\/script>/gi;
  const scriptMatches = [...html.matchAll(scriptRegex)];

  for (const m of scriptMatches) {
    const tag = m[0];
    const src = m[1];

    if (isRemote(src)) {
      if (OFFLINE) {
        try {
          console.log(`  [CDN] 下载: ${src}`);
          const jsText = (await download(src)).toString('utf-8');
          html = html.replace(tag, () => `<script>/* CDN: ${src} */\n${jsText}\n</script>`);
          console.log(`  [CDN] 内联完成 (${sizeKB(jsText)} KB)`);
        } catch (e) {
          console.warn(`  [CDN][WARN] 下载失败，保留原始链接: ${src} - ${e.message}`);
        }
      } else {
        console.log(`  [CDN] 保留: ${src}`);
      }
    } else {
      const buf = readLocal(src);
      if (buf) {
        html = html.replace(tag, () => `<script>/* ${src} */\n${buf.toString('utf-8')}\n</script>`);
        console.log(`  [LOCAL] 内联: ${src} (${sizeKB(buf)} KB)`);
      }
    }
  }

  // ── 3. 处理 <img src="..."> 及其他本地资源 ─────────────────
  console.log('\n[3/3] 处理图片引用...');
  const imgRegex = /<img\s[^>]*?src\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi;
  const imgMatches = [...html.matchAll(imgRegex)];

  for (const m of imgMatches) {
    const tag = m[0];
    const src = m[1];

    if (src.startsWith('data:')) continue;

    if (isRemote(src)) {
      if (OFFLINE) {
        try {
          console.log(`  [CDN] 下载: ${src}`);
          const buf = await download(src);
          const mime = getMime(src);
          const newTag = tag.replace(src, () => toDataURI(buf, mime));
          html = html.replace(tag, () => newTag);
          console.log(`  [CDN] 内联完成 (${sizeKB(buf)} KB)`);
        } catch (e) {
          console.warn(`  [CDN][WARN] 下载失败，保留原始链接: ${src} - ${e.message}`);
        }
      } else {
        console.log(`  [CDN] 保留: ${src}`);
      }
    } else {
      const buf = readLocal(src);
      if (buf) {
        const mime = getMime(decodeHtmlPath(src));
        const newTag = tag.replace(src, () => toDataURI(buf, mime));
        html = html.replace(tag, () => newTag);
        console.log(`  [LOCAL] 内联: ${decodeHtmlPath(src)} (${sizeKB(buf)} KB)`);
      }
    }
  }

  // ── 输出 ───────────────────────────────────────────────────
  const outputPath = path.resolve(ROOT, OUTPUT);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, html, 'utf-8');
  const outputSize = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`\n=== 打包完成 ===`);
  console.log(`输出文件: ${outputPath}`);
  console.log(`文件大小: ${outputSize} KB\n`);
}

/**
 * 处理 CDN CSS 文本中的 url() 引用（离线模式专用）
 * baseUrl: CDN CSS 文件的基准 URL，用于拼接相对路径
 */
async function inlineRemoteCssUrls(cssText, baseUrl) {
  const urlRegex = /url\(\s*['"]?(?!data:)([^'")\s]+?)['"]?\s*\)/g;
  let match;
  const replacements = new Map();

  while ((match = urlRegex.exec(cssText)) !== null) {
    const raw = match[0];
    const ref = match[1];
    if (replacements.has(raw)) continue;
    replacements.set(raw, ref);
  }

  for (const [raw, ref] of replacements) {
    const fullUrl = ref.startsWith('http') ? ref : new URL(ref, baseUrl).href;
    try {
      const buf = await download(fullUrl);
      const mime = getMime(fullUrl.split('?')[0]);
      const dataUri = toDataURI(buf, mime);
      cssText = cssText.split(raw).join(`url("${dataUri}")`);
      console.log(`    [CSS-URL] 下载并内联: ${ref} (${sizeKB(buf)} KB)`);
    } catch (e) {
      console.warn(`    [CSS-URL][WARN] 下载失败，保留原始: ${ref} - ${e.message}`);
    }
  }

  return cssText;
}

build().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
