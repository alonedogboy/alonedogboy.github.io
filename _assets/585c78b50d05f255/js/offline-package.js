const allowedTags = new Set('A ABBR B BLOCKQUOTE BR CAPTION CODE COL COLGROUP DD DEL DETAILS DIV EM FIGCAPTION FIGURE H1 H2 H3 H4 H5 H6 HR I IMG KBD LI MARK OL P PRE S SECTION SMALL SPAN STRONG SUB SUMMARY SUP TABLE TBODY TD TH THEAD TR U UL DL DT'.split(' '));
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const maxImageBytes = 5 * 1024 * 1024;
const maxTotalBytes = 20 * 1024 * 1024;

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function pathKey(value, base) {
  try {
    const url = new URL(value, base);
    return decodeURIComponent(url.pathname).replace(/index\.html$/, '').replace(/\/?$/, '/');
  } catch { return null; }
}

function safeURL(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function extractArticle(html, metadata, base, parseHTML) {
  const page = parseHTML(html);
  const article = page.querySelector('article.md-text.content');
  if (metadata.encrypted || page.querySelector('#hbeData, #hexo-blog-encrypt, #hbePass')) throw new Error('加密文章不能加入离线包');
  if (!article || page.body?.dataset.pageLayout !== 'post') throw new Error('文章正文不可用，请刷新后重试');
  article.querySelectorAll('script, style, link, meta, base, iframe, object, embed, template, noscript, form, svg, canvas, .blog-bookmark, .blog-reader-tools, .headerlink').forEach(element => element.remove());
  article.querySelectorAll('video, audio').forEach(element => {
    const link = page.createElement('a');
    const url = safeURL(element.getAttribute('src') || element.querySelector('source')?.getAttribute('src'), base);
    link.textContent = '音视频需联网查看';
    if (url) link.href = url;
    element.replaceWith(link);
  });
  const images = [];
  for (const element of [...article.querySelectorAll('*')]) {
    if (element.tagName === 'INPUT' && element.getAttribute('type') === 'checkbox') {
      element.replaceWith(page.createTextNode(element.hasAttribute('checked') ? '☑ ' : '☐ '));
      continue;
    }
    if (!allowedTags.has(element.tagName)) { element.replaceWith(...element.childNodes); continue; }
    const imageSource = element.tagName === 'IMG' ? element.getAttribute('data-src') || element.getAttribute('src') : null;
    const href = element.tagName === 'A' ? element.getAttribute('href') : null;
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const global = ['id', 'title', 'lang', 'dir', 'class'].includes(name);
      const numeric = ['colspan', 'rowspan', 'start', 'width', 'height'].includes(name) && /^\d{1,4}$/.test(attribute.value);
      if (!global && !numeric && !(element.tagName === 'IMG' && name === 'alt') && !(element.tagName === 'DETAILS' && name === 'open')) element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'A' && href) {
      const url = safeURL(href, base);
      if (url) { element.href = url; element.rel = 'noopener noreferrer'; }
    }
    if (element.tagName === 'IMG') {
      const inline = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(imageSource || '') && imageSource.length < maxImageBytes;
      const url = inline ? imageSource : safeURL(imageSource, base);
      element.removeAttribute('class');
      images.push({ element, url: url && !url.startsWith('mailto:') ? url : null });
    }
  }
  return { ...metadata, url: base, element: article, images };
}

export async function fetchLimited(url, { signal, fetcher = fetch, maxBytes = 3 * 1024 * 1024, timeout = 12000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('读取超时，请稍后重试')), timeout);
  try {
    const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!response.ok || response.type === 'opaque') throw new Error('资源读取失败（' + response.status + '）');
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('资源超过大小限制');
    const reader = response.body?.getReader();
    let blob;
    if (reader) {
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          controller.signal.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxBytes) throw new Error('资源超过大小限制');
          chunks.push(chunk.value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      blob = new Blob(chunks, { type: response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '' });
    } else {
      blob = await response.blob();
      if (blob.size > maxBytes) throw new Error('资源超过大小限制');
    }
    controller.signal.throwIfAborted();
    return { blob, url: response.url || url };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

async function dataURL(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return 'data:' + blob.type + ';base64,' + btoa(binary);
}

export async function inlineImages(articles, { include = true, signal, fetcher = fetch, onProgress = () => {} } = {}) {
  const images = articles.flatMap(article => article.images);
  const pending = new Map();
  let bytes = 0;
  let cursor = 0;
  let complete = 0;
  let embedded = 0;
  let omitted = 0;
  async function loadImage(url) {
    if (!url || !include) return null;
    if (!pending.has(url)) {
      if (pending.size >= 80) return null;
      pending.set(url, (async () => {
        if (url.startsWith('data:')) {
          const size = Math.ceil(url.slice(url.indexOf(',') + 1).replace(/\s/g, '').length * .75);
          if (bytes + size > maxTotalBytes) return null;
          bytes += size;
          return url;
        }
        const { blob } = await fetchLimited(url, { signal, fetcher, maxBytes: maxImageBytes, timeout: 8000 });
        if (!imageTypes.has(blob.type) || bytes + blob.size > maxTotalBytes) return null;
        bytes += blob.size;
        return dataURL(blob);
      })().catch(error => { if (signal?.aborted) throw error; return null; }));
    }
    return pending.get(url);
  }
  async function worker() {
    while (cursor < images.length) {
      signal?.throwIfAborted();
      const { element, url } = images[cursor++];
      const source = await loadImage(url);
      signal?.throwIfAborted();
      if (source) { element.setAttribute('src', source); embedded++; }
      else {
        const link = element.ownerDocument.createElement('a');
        link.className = 'offline-image-link';
        link.textContent = (element.getAttribute('alt') || '配图') + ' · 图片未收录';
        if (url && !url.startsWith('data:')) { link.href = url; link.rel = 'noopener noreferrer'; }
        element.replaceWith(link);
        omitted++;
      }
      onProgress(++complete, images.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, images.length) }, worker));
  return { embedded, omitted, bytes };
}

function offlineReader() {
  const articles = [...document.querySelectorAll('main > article')];
  const links = [...document.querySelectorAll('[data-offline-article]')];
  const select = document.querySelector('#offline-picker');
  const outline = document.querySelector('#offline-outline');
  let fontSize = 18;
  function show(id, scroll = true) {
    const article = document.getElementById(id);
    if (!articles.includes(article)) return;
    for (const entry of articles) entry.hidden = entry !== article;
    for (const link of links) {
      if (link.dataset.offlineArticle === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    select.value = id;
    document.title = article.querySelector('h1').textContent + ' · 离线阅读';
    outline.replaceChildren();
    for (const heading of article.querySelectorAll('.offline-body :is(h2, h3)')) {
      const link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent;
      link.className = heading.tagName === 'H3' ? 'is-child' : '';
      outline.append(link);
    }
    outline.closest('details').hidden = !outline.children.length;
    if (scroll) window.scrollTo({ top: 0 });
  }
  function followHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    const article = target?.closest('main > article');
    if (article) {
      show(article.id, false);
      target.scrollIntoView();
    }
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const article = document.getElementById(id)?.closest('main > article');
    if (!article) return;
    event.preventDefault();
    if (location.hash === '#' + id) followHash();
    else location.hash = id;
  });
  select.addEventListener('change', () => { location.hash = select.value; });
  document.querySelector('#offline-theme').addEventListener('click', event => {
    const dark = getComputedStyle(document.documentElement).colorScheme === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    event.currentTarget.textContent = dark ? '深色' : '浅色';
  });
  for (const button of document.querySelectorAll('[data-font-step]')) button.addEventListener('click', () => {
    fontSize = Math.max(15, Math.min(24, fontSize + Number(button.dataset.fontStep)));
    document.documentElement.style.setProperty('--reader-font-size', fontSize + 'px');
    document.querySelector('#offline-font-status').textContent = fontSize + 'px';
  });
  document.querySelector('#offline-focus').addEventListener('click', event => {
    const active = document.body.classList.toggle('is-focused');
    event.currentTarget.textContent = active ? '退出专注' : '专注';
    event.currentTarget.setAttribute('aria-pressed', String(active));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('is-focused')) document.querySelector('#offline-focus').click();
  });
  window.addEventListener('hashchange', followHash);
  show(articles[0].id, false);
  followHash();
}

export function buildPackage(articles, css, { siteTitle = '文一刀', now = new Date(), stats = {} } = {}) {
  if (!articles.length || articles.length > 10 || articles.some(article => article.encrypted)) throw new Error('请选择 1—10 篇公开文章');
  const indexes = new Map(articles.map((article, index) => [pathKey(article.url, article.url), 'offline-article-' + index]));
  const sections = articles.map((article, index) => {
    const prefix = 'offline-article-' + index;
    article.element.querySelectorAll('[id]').forEach(element => {
      const original = element.id;
      element.id = prefix + '-' + original;
    });
    article.element.querySelectorAll('h2:not([id]), h3:not([id])').forEach((heading, headingIndex) => { heading.id = prefix + '-heading-' + headingIndex; });
    article.element.querySelectorAll('a[href]').forEach(link => {
      const url = new URL(link.getAttribute('href'), article.url);
      const target = url.origin === new URL(article.url).origin && indexes.get(pathKey(url.href, article.url));
      if (target) {
        let hash;
        try { hash = decodeURIComponent(url.hash.slice(1)); } catch { hash = ''; }
        link.setAttribute('href', '#' + (hash ? target + '-' + hash : target));
      } else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    });
    return '<article id="' + prefix + '"><header><span class="offline-eyebrow">' + escapeHTML(article.categories?.[0] || '阅读笔记') + '</span>'
      + '<h1>' + escapeHTML(article.title) + '</h1><p class="offline-meta">' + escapeHTML(article.date) + (article.minutes ? ' · 约 ' + article.minutes + ' 分钟' : '')
      + ' · <a href="' + escapeHTML(article.url) + '" target="_blank" rel="noopener noreferrer">查看原文 ↗</a></p></header>'
      + '<div class="offline-body">' + article.element.innerHTML + '</div></article>';
  });
  const options = articles.map((article, index) => '<option value="offline-article-' + index + '">' + escapeHTML(article.title) + '</option>').join('');
  const links = articles.map((article, index) => '<a href="#offline-article-' + index + '" data-offline-article="offline-article-' + index + '"><small>' + String(index + 1).padStart(2, '0') + '</small><span>' + escapeHTML(article.title) + '</span></a>').join('');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; connect-src \'none\'">'
    + '<title>' + escapeHTML(siteTitle) + ' · 离线阅读</title><style>' + css.replace(/<\/style/gi, '<\\/style') + '</style></head><body>'
    + '<header class="offline-bar"><strong>' + escapeHTML(siteTitle) + '<span>离线阅读包</span></strong><div class="offline-controls">'
    + '<button id="offline-focus" aria-pressed="false">专注</button><button id="offline-theme">切换明暗</button>'
    + '<button data-font-step="-1" aria-label="缩小字号">A−</button><output id="offline-font-status" aria-live="polite">18px</output><button data-font-step="1" aria-label="放大字号">A＋</button></div></header>'
    + '<div class="offline-layout"><aside class="offline-library"><span class="offline-eyebrow">本次带走 · ' + articles.length + ' 篇</span><nav aria-label="离线文章">' + links + '</nav>'
    + '<details><summary>本篇目录</summary><nav id="offline-outline" aria-label="本篇目录"></nav></details>'
    + '<p class="offline-note">制作于 ' + escapeHTML(now.toISOString().slice(0, 10)) + '。这是文章快照，重新下载可更新内容。'
    + (stats.omitted ? ' ' + stats.omitted + ' 张图片未收录，可联网打开原图链接。' : '') + ' 视频、互动组件与外链需联网访问。</p></aside>'
    + '<label class="offline-mobile-picker">切换文章<select id="offline-picker">' + options + '</select></label><main>' + sections.join('') + '</main></div>'
    + '<script>(' + offlineReader.toString() + ')();</script></body></html>';
}
