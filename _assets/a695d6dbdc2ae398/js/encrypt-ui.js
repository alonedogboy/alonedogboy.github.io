(() => {
  'use strict';

  function enhanceEncryptBox() {
    const box = document.querySelector('#hexo-blog-encrypt');
    if (!box || box.dataset.stellarEnhanced === 'true') return;

    const input = box.querySelector('#hbePass');
    const form = input?.closest('form') || input?.parentElement;
    if (!input || !form) return;

    box.dataset.stellarEnhanced = 'true';

    const header = document.createElement('div');
    header.className = 'hbe-header';
    header.innerHTML = '<span class="hbe-lock-mark" aria-hidden="true"></span><span class="hbe-kicker">加密文章</span><span class="hbe-header-line" aria-hidden="true"></span><span class="hbe-header-note">输入密码阅读</span>';
    box.prepend(header);

    input.setAttribute('aria-label', '文章密码');
    input.setAttribute('placeholder', '输入密码');

    const field = input.parentElement;
    if (!field) return;
    field.classList.add('hbe-input');

    const submit = document.createElement('button');
    submit.className = 'hbe-submit';
    submit.type = 'button';
    submit.setAttribute('aria-label', '解锁文章');
    submit.textContent = '→';
    submit.addEventListener('click', () => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    });
    field.append(submit);
  }

  document.addEventListener('DOMContentLoaded', enhanceEncryptBox);
  document.addEventListener('hexo-blog-decrypt', enhanceEncryptBox);
})();
