const root = document.documentElement;
const preferenceKey = 'uuhu.readerSettings.v1';
const icons = {
  focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z"/></svg>',
  offline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5zM15 3v5h4M12 10v7m-3-3 3 3 3-3"/></svg>'
};
let cleanup = () => {};
let closePackage = () => {};
let catalogPromise;
let catalogSource;
let readerSettings = { size: 18, wide: false };
try {
  const saved = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
  if (saved && Number.isInteger(saved.size) && saved.size >= 16 && saved.size <= 24) readerSettings = { size: saved.size, wide: saved.wide === true };
} catch {}

function saveSettings() {
  try { localStorage.setItem(preferenceKey, JSON.stringify(readerSettings)); } catch {}
}

function currentPath() {
  try { return decodeURIComponent(location.pathname).replace(/index\.html$/, '').replace(/\/?$/, '/'); } catch { return location.pathname; }
}

async function readCatalog(signal) {
  const source = document.querySelector('meta[name="blog-discovery"]')?.content;
  if (!source || new URL(source, location.href).origin !== location.origin) throw new Error('文章目录不可用');
  if (!catalogPromise || source !== catalogSource) {
    catalogSource = source;
    catalogPromise = (async () => {
      const { fetchLimited } = await import('./offline-package.js');
      const { blob } = await fetchLimited(new URL(source, location.href).href, { maxBytes: 512 * 1024 });
      return JSON.parse(await blob.text());
    })().then(data => {
      if (!Array.isArray(data.articles)) throw new Error('文章目录格式不正确');
      return data.articles.filter(article => {
        if (!article || article.encrypted !== false || typeof article.title !== 'string' || typeof article.path !== 'string') return false;
        try { return new URL(article.path, location.href).origin === location.origin; } catch { return false; }
      });
    }).catch(error => { catalogPromise = null; throw error; });
  }
  const articles = await catalogPromise;
  signal.throwIfAborted();
  return articles;
}

async function openPackage(origin) {
  closePackage();
  const controller = new AbortController();
  const dialog = document.createElement('dialog');
  dialog.className = 'blog-offline-dialog';
  dialog.setAttribute('aria-labelledby', 'blog-offline-title');
  dialog.innerHTML = '<header><div><span class="blog-reader-caption">把文章带走</span><h2 id="blog-offline-title">离线阅读包</h2></div><button type="button" class="blog-offline-close" aria-label="关闭离线阅读包">×</button></header>'
    + '<p class="blog-offline-intro">选择文章，打包成一个 HTML 文件。下载后用浏览器打开，断网也能读。</p>'
    + '<div class="blog-offline-options"><label><input type="checkbox" checked name="offline-images">包含可读取的图片</label><span>最多 10 篇 · 公开文章</span></div>'
    + '<label class="blog-offline-search-label"><span class="visually-hidden">搜索可打包的文章</span><input type="search" class="blog-offline-search" placeholder="按标题、分类查找文章"></label>'
    + '<div class="blog-offline-list" aria-label="选择离线文章"><p>正在读取文章目录…</p></div>'
    + '<p class="blog-offline-hint">加密文章不加入离线包。视频和互动组件保留在线查看入口。</p>'
    + '<footer><span class="blog-offline-status" role="status" aria-live="polite">正在准备…</span><button type="button" class="blog-offline-generate" disabled>生成阅读包</button><a class="blog-offline-download" hidden download>下载阅读包</a></footer>';
  document.body.append(dialog);
  const list = dialog.querySelector('.blog-offline-list');
  const status = dialog.querySelector('.blog-offline-status');
  const generate = dialog.querySelector('.blog-offline-generate');
  const download = dialog.querySelector('.blog-offline-download');
  const search = dialog.querySelector('.blog-offline-search');
  const include = dialog.querySelector('[name="offline-images"]');
  const selection = new Set();
  let articles = [];
  let job;
  let blobURL;
  let busy = false;
  const options = { signal: controller.signal };
  closePackage = () => {
    controller.abort();
    job?.abort();
    if (blobURL) URL.revokeObjectURL(blobURL);
    if (dialog.open) dialog.close();
    dialog.remove();
    if (origin.isConnected) origin.focus({ preventScroll: true });
    closePackage = () => {};
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); closePackage(); }, options);
  dialog.addEventListener('close', closePackage, options);
  dialog.querySelector('.blog-offline-close').addEventListener('click', () => closePackage(), options);
  function invalidate() {
    if (blobURL) URL.revokeObjectURL(blobURL);
    blobURL = null;
    download.hidden = true;
    download.removeAttribute('href');
    generate.hidden = false;
    generate.disabled = !selection.size || busy;
    status.textContent = '已选 ' + selection.size + ' 篇';
  }
  function render() {
    list.replaceChildren();
    const keyword = search.value.trim().toLocaleLowerCase();
    const filtered = articles.filter(article => [article.title, ...(article.categories || [])].join(' ').toLocaleLowerCase().includes(keyword));
    for (const article of filtered) {
      const label = document.createElement('label');
      label.className = 'blog-offline-choice';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = article.path;
      input.checked = selection.has(article.path);
      input.disabled = busy || !input.checked && selection.size >= 10;
      const detail = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = article.title;
      const meta = document.createElement('small');
      meta.textContent = [article.date, article.categories?.[0], article.minutes ? '约 ' + article.minutes + ' 分钟' : ''].filter(Boolean).join(' · ');
      detail.append(title, meta);
      label.append(input, detail);
      list.append(label);
    }
    if (!filtered.length) { const empty = document.createElement('p'); empty.textContent = '没有找到匹配的公开文章'; list.append(empty); }
  }
  list.addEventListener('change', event => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input || busy) return;
    if (input.checked && selection.size < 10) selection.add(input.value);
    else selection.delete(input.value);
    invalidate();
    list.querySelectorAll('input').forEach(checkbox => { checkbox.disabled = !checkbox.checked && selection.size >= 10; });
  }, options);
  search.addEventListener('input', render, options);
  include.addEventListener('change', invalidate, options);
  async function load() {
    generate.disabled = true;
    try {
      articles = await readCatalog(controller.signal);
      const current = articles.find(article => {
        try { return decodeURIComponent(new URL(article.path, location.href).pathname).replace(/index\.html$/, '').replace(/\/?$/, '/') === currentPath(); } catch { return false; }
      });
      if (current) selection.add(current.path);
      render();
      invalidate();
      status.textContent += ' · ' + articles.length + ' 篇可选';
    } catch (error) {
      if (controller.signal.aborted) return;
      list.replaceChildren();
      status.textContent = error.message;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '重新读取文章';
      retry.addEventListener('click', () => { list.textContent = '正在读取文章目录…'; void load(); }, options);
      list.append(retry);
    }
  }
  generate.addEventListener('click', async () => {
    if (busy || !selection.size) return;
    busy = true;
    job = new AbortController();
    generate.disabled = true;
    search.disabled = true;
    include.disabled = true;
    render();
    dialog.setAttribute('aria-busy', 'true');
    try {
      const { extractArticle, inlineImages, buildPackage, fetchLimited, pathKey } = await import('./offline-package.js');
      const selected = articles.filter(article => selection.has(article.path));
      const snapshots = [];
      for (const article of selected) {
        job.signal.throwIfAborted();
        status.textContent = '整理文章 ' + (snapshots.length + 1) + ' / ' + selected.length;
        const url = new URL(article.path, location.origin).href;
        const result = await fetchLimited(url, { signal: job.signal });
        if (new URL(result.url).origin !== location.origin || pathKey(result.url, url)?.toLowerCase() !== pathKey(url, url)?.toLowerCase()
          || result.blob.type !== 'text/html') throw new Error('文章地址已变化，请刷新后重试');
        snapshots.push(extractArticle(await result.blob.text(), article, result.url, html => new DOMParser().parseFromString(html, 'text/html')));
      }
      const stats = await inlineImages(snapshots, { include: include.checked, signal: job.signal, onProgress: (complete, total) => { status.textContent = '整理配图 ' + complete + ' / ' + total; } });
      status.textContent = '制作阅读包…';
      const style = await fetchLimited(new URL('../css/blog-offline.css', import.meta.url).href, { signal: job.signal, maxBytes: 128 * 1024 });
      job.signal.throwIfAborted();
      const html = buildPackage(snapshots, await style.blob.text(), { siteTitle: document.querySelector('.brand-name')?.textContent.trim() || '文一刀', stats });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      if (blob.size > 40 * 1024 * 1024) throw new Error('阅读包过大，请少选几篇或关闭图片');
      job.signal.throwIfAborted();
      blobURL = URL.createObjectURL(blob);
      download.href = blobURL;
      download.download = '文一刀-离线阅读-' + new Date().toISOString().slice(0, 10) + '.html';
      download.hidden = false;
      generate.hidden = true;
      const size = blob.size < 1024 * 1024 ? Math.ceil(blob.size / 1024) + ' KB' : (blob.size / 1024 / 1024).toFixed(1) + ' MB';
      status.textContent = selected.length + ' 篇 · ' + size + (stats.omitted ? ' · ' + stats.omitted + ' 张配图未收录' : stats.embedded ? ' · 配图已收录' : ' · 正文已收录');
      download.focus();
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = job.signal.aborted ? '已取消打包' : error.message || '制作失败，请重试';
    } finally {
      busy = false;
      if (!controller.signal.aborted) {
        dialog.removeAttribute('aria-busy');
        search.disabled = false;
        include.disabled = false;
        generate.disabled = !selection.size;
        render();
      }
    }
  }, options);
  dialog.showModal();
  void load();
}

function mount() {
  cleanup();
  closePackage();
  cleanup = () => {};
  const article = document.querySelector('article.md-text.content');
  if (!article || document.body.dataset.pageLayout !== 'post') return;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const toolbar = document.createElement('div');
  toolbar.className = 'blog-reader-tools';
  toolbar.innerHTML = '<span class="blog-reader-caption">阅读工具</span><div><button type="button" class="blog-reader-enter" aria-pressed="false">' + icons.focus + '<span>专注阅读</span></button>'
    + '<button type="button" class="blog-reader-package">' + icons.offline + '<span>离线阅读包</span></button></div>';
  article.before(toolbar);
  const enter = toolbar.querySelector('.blog-reader-enter');
  const dock = document.createElement('div');
  dock.className = 'blog-focus-dock';
  dock.hidden = true;
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', '专注阅读设置');
  dock.innerHTML = '<button type="button" class="blog-focus-exit">' + icons.focus + '<span>退出专注</span></button><span class="blog-focus-divider" aria-hidden="true"></span>'
    + '<button type="button" data-reader-size="-1" aria-label="缩小阅读字号">A−</button><output aria-live="polite"></output><button type="button" data-reader-size="1" aria-label="放大阅读字号">A＋</button>'
    + '<button type="button" class="blog-focus-width" aria-pressed="false">舒展</button><button type="button" class="blog-focus-theme">明暗</button>';
  document.body.append(dock);
  let focused = false;
  let frame;
  function anchor() {
    const blocks = [...article.querySelectorAll('p, h2, h3, pre, figure, blockquote')].filter(element => !element.closest('.blog-bookmark, .hbe-input, pre code'));
    const element = blocks.find(block => block.getBoundingClientRect().bottom > 90) || article;
    return { element, top: element.getBoundingClientRect().top };
  }
  function keepPosition(change) {
    cancelAnimationFrame(frame);
    const position = anchor();
    change();
    frame = requestAnimationFrame(() => {
      if (position.element.isConnected) window.scrollBy({ top: position.element.getBoundingClientRect().top - position.top, behavior: 'instant' });
    });
  }
  function applySettings() {
    root.style.setProperty('--blog-focus-font-size', readerSettings.size + 'px');
    root.style.setProperty('--blog-focus-width', readerSettings.wide ? '900px' : '760px');
    dock.querySelector('output').textContent = readerSettings.size + 'px';
    dock.querySelector('[data-reader-size="-1"]').disabled = readerSettings.size <= 16;
    dock.querySelector('[data-reader-size="1"]').disabled = readerSettings.size >= 24;
    const width = dock.querySelector('.blog-focus-width');
    width.textContent = readerSettings.wide ? '紧凑' : '舒展';
    width.setAttribute('aria-pressed', String(readerSettings.wide));
  }
  function setFocus(active) {
    if (active && article.querySelector('#hbePass')) return;
    keepPosition(() => {
      focused = active;
      root.toggleAttribute('data-reader-focus', active);
      enter.setAttribute('aria-pressed', String(active));
      dock.hidden = !active;
      document.querySelector('[data-shell-action="dismiss-drawer"]')?.click();
    });
    if (active) dock.querySelector('.blog-focus-exit').focus({ preventScroll: true });
    else enter.focus({ preventScroll: true });
  }
  function updateLock() {
    const locked = !!article.querySelector('#hbePass');
    enter.disabled = locked;
    enter.title = locked ? '解锁文章后可进入专注阅读' : '收起侧栏与评论，Esc 退出';
    if (locked && focused) setFocus(false);
  }
  enter.addEventListener('click', () => setFocus(!focused), options);
  dock.querySelector('.blog-focus-exit').addEventListener('click', () => setFocus(false), options);
  toolbar.querySelector('.blog-reader-package').addEventListener('click', event => { void openPackage(event.currentTarget); }, options);
  for (const button of dock.querySelectorAll('[data-reader-size]')) button.addEventListener('click', () => {
    readerSettings.size = Math.max(16, Math.min(24, readerSettings.size + Number(button.dataset.readerSize)));
    keepPosition(applySettings);
    saveSettings();
  }, options);
  dock.querySelector('.blog-focus-width').addEventListener('click', () => {
    readerSettings.wide = !readerSettings.wide;
    keepPosition(applySettings);
    saveSettings();
  }, options);
  dock.querySelector('.blog-focus-theme').addEventListener('click', () => {
    const dark = root.dataset.theme === 'dark' || !root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches;
    window.setColorScheme?.(dark ? 'light' : 'dark');
  }, options);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && focused && !document.querySelector('dialog[open]')) { event.preventDefault(); setFocus(false); }
  }, options);
  window.addEventListener('hexo-blog-decrypt', updateLock, options);
  applySettings();
  updateLock();
  cleanup = () => {
    controller.abort();
    cancelAnimationFrame(frame);
    root.removeAttribute('data-reader-focus');
    root.style.removeProperty('--blog-focus-font-size');
    root.style.removeProperty('--blog-focus-width');
    toolbar.remove();
    dock.remove();
  };
}

mount();
document.addEventListener('stellar:navigation-complete', mount);
