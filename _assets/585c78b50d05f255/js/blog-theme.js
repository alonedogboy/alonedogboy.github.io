(() => {
  'use strict';

  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let transition;
  let reveal;
  let changing = false;
  let transitionTimer;

  const resolvedTheme = () => {
    const selected = root.dataset.theme;
    return selected === 'dark' || (selected !== 'light' && mediaQuery.matches) ? 'dark' : 'light';
  };

  const animateThemeChange = point => {
    if (reducedMotion.matches) return;
    const isDark = resolvedTheme() === 'dark';
    root.style.setProperty('--blog-theme-transition-color', isDark
      ? 'rgb(15 23 28 / 88%)'
      : 'rgb(255 255 255 / 88%)');
    root.style.setProperty('--blog-theme-x', point.x + 'px');
    root.style.setProperty('--blog-theme-y', point.y + 'px');
    root.classList.remove('theme-transitioning');
    void root.offsetWidth;
    root.classList.add('theme-transitioning');
    clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 760);
  };

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button[onclick]');
    const mode = button?.getAttribute('onclick')?.match(/^\s*setColorScheme\(['"](light|dark|auto)['"]\)\s*;?\s*$/)?.[1];
    if (!mode || typeof window.setColorScheme !== 'function') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const popup = button.closest('.dropdown-menu');
    const trigger = popup?.id && [...document.querySelectorAll('summary[aria-controls]')]
      .find(element => element.getAttribute('aria-controls') === popup.id);
    const menu = button.closest('details') || trigger?.closest('details');
    const origin = trigger || menu?.querySelector('summary') || button;
    const bounds = origin.getBoundingClientRect();
    const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const target = mode === 'auto' ? (mediaQuery.matches ? 'dark' : 'light') : mode;
    if (menu) menu.open = false;
    origin.focus({ preventScroll: true });
    transition?.skipTransition();
    reveal?.cancel();
    root.classList.remove('blog-theme-revealing', 'theme-transitioning');
    clearTimeout(transitionTimer);
    const apply = () => {
      changing = true;
      try { window.setColorScheme(mode); } finally { changing = false; }
    };
    if (reducedMotion.matches || target === resolvedTheme()) { apply(); return; }
    if (!document.startViewTransition) { apply(); animateThemeChange(point); return; }
    root.classList.add('blog-theme-revealing');
    const current = document.startViewTransition(apply);
    transition = current;
    current.ready.then(() => {
      if (transition !== current || reducedMotion.matches) { current.skipTransition(); return; }
      const radius = Math.hypot(Math.max(point.x, innerWidth - point.x), Math.max(point.y, innerHeight - point.y));
      reveal = root.animate([
        { clipPath: `circle(0px at ${point.x}px ${point.y}px)` },
        { clipPath: `circle(${radius}px at ${point.x}px ${point.y}px)` }
      ], { duration: innerWidth <= 768 ? 380 : 560, easing: 'cubic-bezier(.22, 1, .36, 1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {}).finally(() => {
      current.finished.catch(() => {}).finally(() => {
        if (transition !== current) return;
        root.classList.remove('blog-theme-revealing');
        transition = null;
        reveal = null;
      });
    });
  }, { capture: true });

  let previousTheme = resolvedTheme();
  let initialized = false;
  document.addEventListener('stellar:color-scheme-change', () => {
    const theme = resolvedTheme();
    if (initialized && !changing && theme !== previousTheme) {
      animateThemeChange({ x: innerWidth / 2, y: innerHeight / 2 });
    }
    previousTheme = theme;
    initialized = true;
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    transition?.skipTransition();
    reveal?.cancel();
    root.classList.remove('blog-theme-revealing', 'theme-transitioning');
    clearTimeout(transitionTimer);
  });
})();
