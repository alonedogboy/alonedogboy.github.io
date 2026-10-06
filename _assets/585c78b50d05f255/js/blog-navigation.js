import { mount as mountNavigation } from './runtime/extensions/partial-navigation.js';
import { decodeCloudflareEmails } from './blog-hosting.js';
import { createRouteTrace } from './blog-route.js';

export function mount(root, context) {
  decodeCloudflareEmails(document);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const route = createRouteTrace({ signal: context.signal, reducedMotion });
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
      || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.relList.contains('external')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(context.manifest.root)
      || (!url.pathname.endsWith('/') && !/\.html$/.test(url.pathname))) return;
    link.setAttribute('data-stellar-navigation', '');
    if (url.pathname !== location.pathname || url.search !== location.search) route.start();
    const dialog = link.closest('#site-search-dialog');
    if (dialog?.open) dialog.querySelector('[data-shell-action="close-search"]')?.click();
  }, { capture: true, signal: context.signal });
  window.addEventListener('popstate', () => {
    const current = new URL(JSON.parse(document.getElementById('stellar-navigation-config').textContent).url);
    if (current.pathname !== location.pathname || current.search !== location.search) route.start();
  }, { signal: context.signal });
  document.addEventListener('stellar:navigation-complete', route.finish, { signal: context.signal });
  function animate(element, keyframes, duration) {
    if (!element || reducedMotion.matches || !element.animate) return Promise.resolve();
    const animation = element.animate(keyframes, { duration, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'both' });
    animations.add(animation);
    return animation.finished.catch(() => {}).finally(() => { animation.cancel(); animations.delete(animation); });
  }
  function syncSearch() {
    const navigation = JSON.parse(document.getElementById('stellar-navigation-config').textContent);
    document.querySelectorAll('#leftbar-region [data-shell-action="open-search"]').forEach((button, index) => {
      for (const name of [...button.getAttributeNames()]) if (name.startsWith('data-search-')) button.removeAttribute(name);
      for (const [name, value] of Object.entries(navigation.search?.[index] || {})) button.setAttribute(name, value);
    });
  }
  const runtime = {
    ...context.runtime,
    async unmountPage() {
      await animate(document.getElementById('main'), [{ opacity: 1 }, { opacity: 0 }], 100);
      await context.runtime.unmountPage();
    },
    async mountPage(manifest) {
      syncSearch();
      decodeCloudflareEmails(document);
      const main = document.getElementById('main');
      void animate(main, [{ opacity: 0 }, { opacity: 1 }], 220);
      void animate(main?.querySelector('.post-list, article.md-text.content'), [{ transform: 'translateY(8px)' }, { transform: 'translateY(0)' }], 260);
      await context.runtime.mountPage(manifest);
    }
  };
  const cleanup = mountNavigation(root, { ...context, runtime });
  const observer = new MutationObserver(records => {
    for (const record of records) for (const element of record.addedNodes) {
      if (element.nodeType === 1 && element.matches('.navigation-loading')) {
        element.setAttribute('aria-label', '页面载入中');
        if (!route.active()) route.start();
      }
    }
  });
  observer.observe(document.body, { childList: true });
  return () => { cleanup?.(); route.clear(); observer.disconnect(); for (const animation of animations) animation.cancel(); };
}
