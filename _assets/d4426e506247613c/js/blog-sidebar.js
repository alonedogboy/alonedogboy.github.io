(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  function animate(element, frames, options) {
    const animation = element.animate(frames, options);
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => animations.delete(animation));
    return animation;
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button.blog-widget-more');
    const widget = button?.closest('.recent-widget');
    if (!widget) return;
    const list = widget.querySelector('.ui-collection');
    const entries = [...list.querySelectorAll('.ui-collection__item[hidden]')];
    const height = list.getBoundingClientRect().height;
    entries.forEach(entry => {
      entry.hidden = false;
    });
    button.setAttribute('aria-expanded', 'true');
    button.hidden = true;
    if (!event.detail) entries[0]?.focus({ preventScroll: true });
    if (reducedMotion.matches || !list.animate || !entries.length) return;
    const mobile = innerWidth <= 768;
    animate(list, [
      { height: height + 'px', overflow: 'hidden' },
      { height: list.getBoundingClientRect().height + 'px', overflow: 'hidden' }
    ], { duration: mobile ? 260 : 360, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    entries.forEach((entry, index) => animate(entry, [
      { opacity: 0, transform: mobile ? 'none' : 'translateX(-6px)' },
      { opacity: 1, transform: 'none' }
    ], { duration: mobile ? 180 : 220, delay: index * (mobile ? 25 : 40), fill: 'backwards', easing: 'ease-out' }));
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) for (const animation of animations) animation.cancel();
  });
})();
