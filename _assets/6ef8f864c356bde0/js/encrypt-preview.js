(() => {
  'use strict';

  const preview = document.querySelector('[data-encrypt-preview]');
  if (!preview) return;

  const locked = preview.querySelector('[data-preview-lock]');
  const unlocked = preview.querySelector('[data-preview-unlocked]');
  const input = preview.querySelector('[data-preview-password]');
  const submit = preview.querySelector('[data-preview-submit]');

  function unlockPreview() {
    if (!locked || !unlocked) return;
    locked.hidden = true;
    unlocked.hidden = false;
  }

  submit?.addEventListener('click', unlockPreview);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      unlockPreview();
    }
  });
})();
