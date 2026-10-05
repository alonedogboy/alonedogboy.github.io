export function isCloudflareScript(script, baseURI) {
  const source = script.getAttribute('src');
  if (!source || script.textContent.trim()) return false;
  try {
    const url = new URL(source, baseURI);
    return (url.protocol === 'https:' && url.hostname === 'static.cloudflareinsights.com'
      && !url.port && /^\/beacon\.min\.js(?:\/v[a-f\d]+)?$/.test(url.pathname))
      || (url.origin === new URL(baseURI).origin
        && /^\/cdn-cgi\/scripts\/[a-f\d]+\/cloudflare-static\/email-decode\.min\.js$/.test(url.pathname));
  } catch { return false; }
}

export function prepareCloudflareDocument(documentRef) {
  for (const script of documentRef.querySelectorAll('script[src]:not([data-stellar-script])')) {
    if (isCloudflareScript(script, location.href)) script.setAttribute('data-stellar-script', 'cloudflare');
  }
}

export function isCaseNormalizedRedirect(requested, responseURL) {
  try {
    const target = new URL(responseURL);
    return target.origin === requested.origin && target.search === requested.search
      && target.pathname.toLowerCase() === requested.pathname.toLowerCase();
  } catch { return false; }
}

function decodeEmail(value) {
  if (!/^(?:[a-f\d]{2}){2,}$/i.test(value)) return null;
  const mask = parseInt(value.slice(0, 2), 16);
  const bytes = Uint8Array.from(value.slice(2).match(/.{2}/g), byte => parseInt(byte, 16) ^ mask);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}

export function decodeCloudflareEmails(root) {
  for (const link of root.querySelectorAll('a[href*="/cdn-cgi/l/email-protection#"]')) {
    let url;
    try { url = new URL(link.getAttribute('href'), location.href); } catch { continue; }
    if (url.origin !== location.origin || url.pathname !== '/cdn-cgi/l/email-protection') continue;
    const email = decodeEmail(url.hash.slice(1));
    if (email !== null) link.setAttribute('href', 'mailto:' + email);
  }
  for (const span of root.querySelectorAll('.__cf_email__[data-cfemail]')) {
    const email = decodeEmail(span.getAttribute('data-cfemail'));
    if (email !== null) span.replaceWith(document.createTextNode(email));
  }
}
