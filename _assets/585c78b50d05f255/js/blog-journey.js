(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'uuhu.paragraphBookmarks.v1';
  let cleanup = () => {};
  function readBookmarks() {
    try {
      const entries = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(entries) ? entries.filter(entry => entry && typeof entry.path === 'string'
        && typeof entry.key === 'string' && Number.isInteger(entry.index) && entry.index >= 0
        && Number.isFinite(entry.progress) && entry.progress >= 0 && entry.progress <= 1
        && Number.isFinite(entry.updatedAt)).slice(0, 60) : [];
    } catch { return []; }
  }
  function fingerprint(value) {
    let hash = 2166136261;
    for (const character of value) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
    return (hash >>> 0).toString(36);
  }
  function mount() {
    cleanup();
    cleanup = () => {};
    const article = document.querySelector('article.md-text.content');
    if (!article || document.body.dataset.pageLayout !== 'post') return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const path = decodeURI(location.pathname).replace(/index\.html$/, '');
    let blocks = [];
    let positions = [];
    let bar;
    let bookmark;
    let storageError = false;
    let frame;
    let saveTimer;
    let highlightTimer;
    let landingTimer;
    let landing;
    let landingReady = false;
    let highlighted;
    let originalTabIndex;
    let intent = false;
    let latest;

    function showStatus() {
      if (!bar) return;
      bar.querySelector('.blog-bookmark-status').textContent = storageError ? '浏览器无法保存书签'
        : bookmark ? (bookmark.manual ? '已固定在 ' : '自动记到 ') + Math.round(bookmark.progress * 100) + '%'
          : '随阅读自动记录 · 本机保存';
      bar.querySelector('.blog-bookmark-go').hidden = !bookmark;
      bar.querySelector('.blog-bookmark-clear').hidden = !bookmark;
      bar.classList.toggle('has-bookmark', !!bookmark);
    }
    function save() {
      if (!latest || !intent) return;
      const entries = [latest, ...readBookmarks().filter(entry => entry.path !== path)].slice(0, 60);
      try {
        localStorage.setItem(storageKey, JSON.stringify(entries));
        bookmark = latest;
        storageError = false;
      } catch { storageError = true; }
      latest = null;
      showStatus();
    }
    function measure() {
      positions = blocks.map(block => block.getBoundingClientRect().top + scrollY);
    }
    function currentPosition() {
      if (!blocks.length) return;
      const bounds = article.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -bounds.top / Math.max(1, bounds.height - innerHeight)));
      const line = scrollY + Math.max(100, (bar?.getBoundingClientRect().height || 0) + 32) + 4;
      let lower = 0;
      let upper = positions.length - 1;
      while (lower < upper) {
        const middle = Math.ceil((lower + upper) / 2);
        if (positions[middle] <= line) lower = middle;
        else upper = middle - 1;
      }
      return { path, key: blocks[lower].dataset.blogParagraphKey, index: lower, progress, updatedAt: Date.now() };
    }
    function update() {
      frame = null;
      if (!article.isConnected || article.querySelector('#hbePass') || !blocks.length) return;
      if (intent && !bookmark?.manual) {
        latest = currentPosition();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 700);
      }
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    function stopLanding() {
      clearTimeout(landingTimer);
      landing = null;
      landingReady = false;
    }
    function landingPosition(target) {
      const offset = Math.max(100, (bar?.getBoundingClientRect().height || 0) + 32);
      return Math.max(0, target.getBoundingClientRect().top + scrollY - offset);
    }
    function alignLanding() {
      if (!landingReady || !landing?.isConnected) return;
      const top = landingPosition(landing);
      if (Math.abs(scrollY - top) > 3) window.scrollTo({ top, behavior: 'instant' });
    }
    function jumpTo(target) {
      stopLanding();
      landing = target;
      window.scrollTo({ top: landingPosition(target), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      landingTimer = setTimeout(() => { landingReady = true; alignLanding(); }, reducedMotion.matches ? 0 : 600);
    }
    function markIntent(event) {
      if (event.type === 'keydown' && (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)
        || event.target.closest?.('input, textarea, select, [contenteditable="true"]'))) return;
      stopLanding();
      intent = true;
    }
    function clearHighlight() {
      if (!highlighted) return;
      highlighted.classList.remove('blog-paragraph-target');
      if (originalTabIndex === null) highlighted.removeAttribute('tabindex');
      else highlighted.setAttribute('tabindex', originalTabIndex);
      highlighted = null;
    }
    for (const event of ['wheel', 'touchmove', 'keydown']) window.addEventListener(event, markIntent, { ...options, passive: true });
    window.addEventListener('scroll', schedule, { ...options, passive: true });
    window.addEventListener('resize', () => { measure(); schedule(); }, options);
    window.addEventListener('pagehide', save, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); }, options);
    document.addEventListener('click', event => {
      if (!bar || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href^="#"]');
      if (!link || link.hasAttribute('download') || link.target && link.target !== '_self'
        || !article.contains(link) && !link.closest('#data-toc')) return;
      let target;
      try { target = document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1))); } catch { return; }
      if (!target || !article.contains(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelector('.site-dock button[aria-label="Close rightbar"]')?.click();
      intent = true;
      jumpTo(target);
      history.pushState(history.state, '', link.getAttribute('href'));
    }, { ...options, capture: true });

    function build() {
      save();
      clearTimeout(saveTimer);
      clearTimeout(highlightTimer);
      stopLanding();
      clearHighlight();
      bar?.remove();
      bar = null;
      blocks = [];
      latest = null;
      intent = false;
      if (article.querySelector('#hbePass')) return;
      const duplicates = new Map();
      blocks = [...article.querySelectorAll('p, h2, h3, h4, pre, blockquote, ul, ol, table, figure')]
        .filter(block => block.textContent.trim() && block.getClientRects().length && !block.parentElement.closest('pre, blockquote, li, td, th, figure')
          && !block.closest('.hbe-input, .hbe-lock'));
      blocks.forEach(block => {
        const hash = fingerprint(block.tagName + ':' + block.textContent.replace(/\s+/g, ' ').trim().slice(0, 256));
        const occurrence = duplicates.get(hash) || 0;
        duplicates.set(hash, occurrence + 1);
        block.dataset.blogParagraphKey = hash + '-' + occurrence;
      });
      if (!blocks.length) return;
      bookmark = readBookmarks().find(entry => entry.path === path);
      bar = document.createElement('aside');
      bar.className = 'blog-bookmark';
      bar.setAttribute('aria-label', '段落书签');
      bar.innerHTML = '<div class="blog-bookmark-caption"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>'
        + '<span><strong>段落书签</strong><span class="blog-bookmark-status" role="status"></span></span></div>'
        + '<div class="blog-bookmark-actions"><button type="button" class="blog-bookmark-go">回到书签 <span aria-hidden="true">↘</span></button>'
        + '<button type="button" class="blog-bookmark-save" title="固定当前段落，后续滚动不会改变这个书签">记住这里</button>'
        + '<button type="button" class="blog-bookmark-clear" aria-label="清除段落书签" title="清除书签，恢复自动记录">×</button></div>';
      article.prepend(bar);
      bar.querySelector('.blog-bookmark-save').addEventListener('click', () => {
        measure();
        intent = true;
        clearTimeout(saveTimer);
        latest = { ...currentPosition(), manual: true };
        save();
      }, options);
      bar.querySelector('.blog-bookmark-go').addEventListener('click', () => {
        if (!bookmark) return;
        const target = blocks.find(block => block.dataset.blogParagraphKey === bookmark.key) || blocks[Math.min(bookmark.index, blocks.length - 1)];
        clearTimeout(highlightTimer);
        clearHighlight();
        highlighted = target;
        originalTabIndex = target.getAttribute('tabindex');
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        jumpTo(target);
        target.classList.add('blog-paragraph-target');
        highlightTimer = setTimeout(clearHighlight, 1800);
      }, options);
      bar.querySelector('.blog-bookmark-clear').addEventListener('click', () => {
        clearTimeout(saveTimer);
        latest = null;
        intent = false;
        try {
          localStorage.setItem(storageKey, JSON.stringify(readBookmarks().filter(entry => entry.path !== path)));
          bookmark = null;
          storageError = false;
        } catch { storageError = true; }
        showStatus();
      }, options);
      showStatus();
      measure();
      update();
    }
    const observer = new ResizeObserver(() => { measure(); alignLanding(); schedule(); });
    observer.observe(article);
    window.addEventListener('hexo-blog-decrypt', build, options);
    build();
    cleanup = () => {
      save();
      controller.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(saveTimer);
      clearTimeout(highlightTimer);
      stopLanding();
      clearHighlight();
      bar?.remove();
    };
  }
  mount();
  document.addEventListener('stellar:navigation-complete', mount);
})();
