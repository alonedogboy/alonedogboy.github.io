document.currentScript.stellarMount = function(root, context) {
  const timeline = root.querySelector('.ds-twikoo');
  if (!timeline || !timeline.dataset.api) return;
  const limit = Math.max(1, Math.min(5, parseInt(timeline.getAttribute('limit'), 10) || 5));
  timeline.removeAttribute('data-comments-ready');
  timeline.replaceChildren();

  fetch(timeline.dataset.api, {
    signal: context.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'GET_RECENT_COMMENTS',
      envId: timeline.dataset.api,
      pageSize: limit,
      includeReply: timeline.getAttribute('hide') !== 'reply'
    })
  }).then(response => {
    if (!response.ok) throw new Error('Unable to load recent comments');
    return response.json();
  }).then(result => {
    context.signal.throwIfAborted();
    const comments = Array.isArray(result.data) ? result.data : [];
    const fragment = document.createDocumentFragment();
    for (const comment of comments.slice(0, limit)) {
      if (!comment || typeof comment.commentText !== 'string' || !comment.commentText.trim()) continue;
      let url;
      try { url = new URL(comment.url || '/', location.href); } catch { continue; }
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (url.origin === location.origin || ['uuhu.de', 'www.uuhu.de'].includes(url.hostname)) {
        url = new URL(url.pathname + url.search, location.origin);
      }
      url.hash = typeof comment.id === 'string' ? comment.id : '';
      const node = document.createElement('div');
      node.className = 'timenode';
      node.setAttribute('index', String(fragment.childElementCount));
      const header = document.createElement('div');
      header.className = 'header';
      const author = document.createElement('div');
      author.className = 'user-info';
      author.textContent = typeof comment.nick === 'string' ? comment.nick : '访客';
      header.append(author);
      const date = new Date(comment.created);
      if (Number.isFinite(date.getTime())) {
        const time = document.createElement('time');
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleString('zh-CN', {
          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
        });
        header.append(time);
      }
      const body = document.createElement('a');
      body.className = 'body';
      body.href = url.href;
      const text = comment.commentText.trim();
      body.textContent = text.length > 50 ? text.slice(0, 50) + '…' : text;
      node.append(header, body);
      fragment.append(node);
    }
    if (!fragment.childElementCount) return;
    timeline.append(fragment);
    timeline.setAttribute('data-comments-ready', '');
  }).catch(() => {});
};
