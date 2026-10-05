(() => {
  'use strict';

  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  let transitionTimer;

  const resolvedTheme = () => {
    const selected = root.dataset.theme;
    return selected === 'dark' || (selected !== 'light' && mediaQuery.matches) ? 'dark' : 'light';
  };

  const animateThemeChange = () => {
    const isDark = resolvedTheme() === 'dark';
    root.style.setProperty('--blog-theme-transition-color', isDark
      ? 'rgb(15 23 28 / 88%)'
      : 'rgb(255 255 255 / 88%)');
    root.style.setProperty('--blog-theme-x', '50%');
    root.style.setProperty('--blog-theme-y', '42%');
    root.classList.remove('theme-transitioning');
    void root.offsetWidth;
    root.classList.add('theme-transitioning');
    clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 760);
  };

  new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'data-theme')) animateThemeChange();
  }).observe(root, {attributes: true});
})();
