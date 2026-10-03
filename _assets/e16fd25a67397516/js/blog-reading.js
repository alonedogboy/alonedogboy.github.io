(() => {
  'use strict';

  const shell = document.querySelector('.site-shell');
  const article = document.querySelector('article.md-text.content');
  const share = document.querySelector('#share .social-wrap');
  if (!article || !share) return;

  const progress = document.createElement('div');
  progress.className = 'blog-reading-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  let pending = false;
  const updateProgress = () => {
    pending = false;
    const bounds = article.getBoundingClientRect();
    const distance = Math.max(1, bounds.height - window.innerHeight);
    const fraction = Math.max(0, Math.min(1, -bounds.top / distance));
    progress.style.transform = `scaleX(${fraction})`;
    progress.hidden = !!article.querySelector('#hbePass');
  };
  const scheduleProgress = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(updateProgress);
  };
  window.addEventListener('scroll', scheduleProgress, { passive: true });
  window.addEventListener('resize', scheduleProgress);
  window.addEventListener('hexo-blog-decrypt', scheduleProgress);
  new ResizeObserver(scheduleProgress).observe(article);
  updateProgress();

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'blog-copy-link';
  button.textContent = '复制链接';
  button.setAttribute('aria-label', '复制文章分享链接');
  const status = document.createElement('span');
  status.className = 'blog-copy-status';
  status.setAttribute('role', 'status');
  const fallback = document.createElement('input');
  fallback.className = 'blog-share-url';
  fallback.type = 'url';
  fallback.readOnly = true;
  fallback.hidden = true;
  fallback.setAttribute('aria-label', '文章分享链接，请手动复制');
  const url = new URL(window.location.pathname, 'https://www.uuhu.de').href;
  fallback.value = url;
  share.append(button, status, fallback);
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = '链接已复制';
      fallback.hidden = true;
    } catch {
      status.textContent = '请复制下方链接';
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
    }
  });
  if (shell) shell.dataset.readingTools = 'true';
})();
