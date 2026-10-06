(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const storageKey = 'uuhu.readingTrail.v1';
  let trail = [];
  let lastArticle;
  let activeCard;
  let pointer;
  let frame;
  let returnAnimation;

  function articlePath(value) {
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin) return null;
      return decodeURIComponent(url.pathname).replace(/index\.html$/, '').replace(/\/?$/, '/');
    } catch { return null; }
  }
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) trail = stored.filter(entry => entry && typeof entry.path === 'string'
      && entry.path.startsWith('/') && entry.path.length <= 2048 && Number.isFinite(entry.readAt)).slice(0, 60);
  } catch {}

  function resetCover() {
    cancelAnimationFrame(frame);
    frame = null;
    pointer = null;
    if (!activeCard) return;
    activeCard.classList.remove('has-cover-pointer');
    for (const name of ['--blog-cover-x', '--blog-cover-y', '--blog-cover-edge']) activeCard.style.removeProperty(name);
    activeCard = null;
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || reducedMotion.matches || !finePointer.matches) return;
    const card = event.target.closest?.('.post-list .post-card:has(.post-cover)');
    if (!card) { resetCover(); return; }
    if (activeCard !== card) { resetCover(); activeCard = card; card.classList.add('has-cover-pointer'); }
    pointer = { x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!activeCard?.isConnected || !pointer) return;
      const bounds = activeCard.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(-1, Math.min(1, (pointer.x - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (pointer.y - bounds.top) / bounds.height * 2 - 1));
      activeCard.style.setProperty('--blog-cover-x', (x * 4).toFixed(2) + 'px');
      activeCard.style.setProperty('--blog-cover-y', (y * 3).toFixed(2) + 'px');
      activeCard.style.setProperty('--blog-cover-edge', (45 - x * 5).toFixed(2) + '%');
    });
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (activeCard && !activeCard.contains(event.relatedTarget)) resetCover();
  }, { passive: true });
  window.addEventListener('blur', resetCover);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetCover(); });

  function updateTrail() {
    resetCover();
    returnAnimation?.cancel();
    if (document.body.dataset.pageLayout === 'post' && document.querySelector('article.md-text.content')
      && !document.querySelector('#hbePass')) {
      const path = articlePath(location.href);
      if (path) {
        lastArticle = path;
        trail = [{ path, readAt: Date.now() }, ...trail.filter(entry => entry.path !== path)].slice(0, 60);
        try { localStorage.setItem(storageKey, JSON.stringify(trail)); } catch {}
      }
    }
    const visited = new Set(trail.map(entry => entry.path));
    for (const card of document.querySelectorAll('.post-list a.post-card[href]')) {
      const path = articlePath(card.href);
      card.classList.toggle('blog-visited', visited.has(path));
      card.classList.remove('blog-trail-current');
      card.querySelector('.blog-reading-mark')?.remove();
      if (!visited.has(path)) continue;
      const marker = document.createElement('span');
      marker.className = 'blog-reading-mark';
      marker.innerHTML = '<svg viewBox="0 0 16 18" aria-hidden="true" focusable="false"><path d="M4 2.5h8a1 1 0 0 1 1 1v11l-5-3-5 3v-11a1 1 0 0 1 1-1Z"/></svg>';
      marker.append('已读');
      marker.title = '在这个浏览器中阅读过';
      card.querySelector('.meta')?.append(marker);
      if (path !== lastArticle) continue;
      card.classList.add('blog-trail-current');
      if (!reducedMotion.matches && card.animate) {
        returnAnimation = card.animate([
          { outlineColor: 'transparent', outlineOffset: '4px' },
          { outlineColor: 'var(--theme)', outlineOffset: '2px', offset: .3 },
          { outlineColor: 'transparent', outlineOffset: '4px' }
        ], { duration: 1100, easing: 'ease-out' });
      }
    }
    if (document.querySelector('.post-list')) lastArticle = null;
  }
  document.addEventListener('stellar:navigation-complete', updateTrail);
  window.addEventListener('hexo-blog-decrypt', updateTrail);
  for (const media of [reducedMotion, finePointer]) media.addEventListener('change', () => {
    resetCover();
    if (reducedMotion.matches) returnAnimation?.cancel();
  });
  lastArticle = trail[0]?.path;
  updateTrail();
})();
