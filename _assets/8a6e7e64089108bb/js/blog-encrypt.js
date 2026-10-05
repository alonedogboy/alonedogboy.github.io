const encoder = new TextEncoder();
const keySalt = encoder.encode('hexo-blog-encrypt的作者们都是大帅比!');
const ivSalt = encoder.encode('hexo-blog-encrypt是地表最强Hexo加密插件!');
const prefix = '<hbe-prefix></hbe-prefix>';

function fromHex(value) {
  if (typeof value !== 'string' || !/^(?:[a-f\d]{2})+$/i.test(value)) throw new Error('加密数据格式不正确');
  return Uint8Array.from(value.match(/.{2}/g), byte => parseInt(byte, 16));
}

export async function deriveKeys(password) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
  const parameters = { name: 'PBKDF2', hash: 'SHA-256', salt: keySalt, iterations: 1024 };
  const [decryptKey, hmacKey, iv] = await Promise.all([
    crypto.subtle.deriveKey(parameters, material, { name: 'AES-CBC', length: 256 }, true, ['decrypt']),
    crypto.subtle.deriveKey(parameters, material, { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['verify']),
    crypto.subtle.deriveBits({ ...parameters, salt: ivSalt, iterations: 512 }, material, 128)
  ]);
  return { decryptKey, hmacKey, iv };
}

export async function decodeArticle(encrypted, digest, keys) {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: keys.iv }, keys.decryptKey, fromHex(encrypted));
  const content = new TextDecoder().decode(plaintext);
  if (!content.startsWith(prefix)) throw new Error('密码不正确');
  const valid = await crypto.subtle.verify('HMAC', keys.hmacKey, fromHex(digest), encoder.encode(content));
  if (!valid) throw new Error('文章校验未通过');
  return content;
}

export function mount(root, context) {
  const box = root.querySelector('#hexo-blog-encrypt');
  const data = box?.querySelector('#hbeData');
  if (!data) return;
  const encrypted = data.textContent.trim();
  const digest = data.dataset.hmacdigest;
  const storageName = 'hexo-blog-encrypt:#' + location.pathname;
  const active = () => box.isConnected && !context.signal.aborted;
  const initialStyle = box.getAttribute('style');
  let busy = false;
  let lockedNodes;
  function forget() {
    try { localStorage.removeItem(storageName); } catch {}
  }
  function report(message) {
    if (!active()) return;
    let notice = box.querySelector('.hbe-error');
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'hbe-error';
      notice.setAttribute('role', 'alert');
      box.append(notice);
    }
    notice.textContent = message;
    box.querySelector('#hbePass')?.setAttribute('aria-invalid', 'true');
  }
  function relock() {
    if (!active()) return;
    forget();
    box.replaceChildren(...lockedNodes);
    if (initialStyle === null) box.removeAttribute('style');
    else box.setAttribute('style', initialStyle);
    box.querySelector('.hbe-error')?.remove();
    const input = box.querySelector('#hbePass');
    if (input) { input.value = ''; input.removeAttribute('aria-invalid'); input.focus(); }
    window.dispatchEvent(new Event('hexo-blog-decrypt'));
  }
  async function unlock(keys, remember) {
    const content = await decodeArticle(encrypted, digest, keys);
    if (!active()) return;
    if (remember) {
      const [decryptKey, hmacKey] = await Promise.all([
        crypto.subtle.exportKey('jwk', keys.decryptKey), crypto.subtle.exportKey('jwk', keys.hmacKey)
      ]);
      if (!active()) return;
      try {
        localStorage.setItem(storageName, JSON.stringify({ dk: decryptKey, hmk: hmacKey,
          iv: [...new Uint8Array(keys.iv)].map(byte => byte.toString(16).padStart(2, '0')).join('') }));
      } catch {}
    }
    box.querySelector('.hbe-error')?.remove();
    box.querySelector('#hbePass')?.removeAttribute('aria-invalid');
    lockedNodes = [...box.childNodes];
    const article = document.createElement('div');
    article.innerHTML = content;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hbe-button';
    button.textContent = '重新加密';
    button.addEventListener('click', relock, { signal: context.signal });
    box.style.display = 'inline';
    box.replaceChildren(article, button);
    article.querySelectorAll('script').forEach(source => {
      const script = document.createElement('script');
      for (const attribute of source.attributes) script.setAttribute(attribute.name, attribute.value);
      script.setAttribute('data-stellar-script', 'encrypted-content');
      script.textContent = source.textContent;
      source.replaceWith(script);
    });
    article.querySelectorAll('img[data-src]:not([src])').forEach(image => { image.src = image.dataset.src; });
    root.querySelectorAll('#toc-div, .toc-div-class').forEach(element => { element.style.display = 'inline'; });
    window.lazyLoadInstance?.update?.();
    window.dispatchEvent(new Event('hexo-blog-decrypt'));
  }
  async function submit(event) {
    if (event.isComposing || (event.type === 'keydown' && event.key !== 'Enter') || !box.querySelector('#hbePass') || busy) return;
    event.preventDefault();
    busy = true;
    box.setAttribute('aria-busy', 'true');
    try {
      const keys = await deriveKeys(box.querySelector('#hbePass').value);
      if (active()) await unlock(keys, true);
    } catch (error) {
      report(error.message === '文章校验未通过' ? box.dataset.whm || error.message : box.dataset.wpm || '密码不正确，请再试一次。');
    } finally {
      busy = false;
      if (active()) box.removeAttribute('aria-busy');
    }
  }
  box.addEventListener('keydown', submit, { signal: context.signal });
  box.addEventListener('submit', submit, { signal: context.signal });
  async function restore() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(storageName) || 'null'); } catch { forget(); }
    if (!stored) return;
    busy = true;
    try {
      const [decryptKey, hmacKey] = await Promise.all([
        crypto.subtle.importKey('jwk', stored.dk, { name: 'AES-CBC', length: 256 }, false, ['decrypt']),
        crypto.subtle.importKey('jwk', stored.hmk, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
      ]);
      if (active()) await unlock({ decryptKey, hmacKey, iv: fromHex(stored.iv) }, false);
    } catch { if (active()) forget(); }
    finally { busy = false; }
  }
  void restore();
}
