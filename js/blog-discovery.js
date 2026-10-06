(() => {
  'use strict';

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let catalogPromise;
  let popup;
  let activeLink;
  let description;
  let previewTimer;
  let mapCleanup = () => {};
  function pathKey(value) {
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin ? decodeURIComponent(url.pathname).replace(/index\.html$/, '') : null;
    } catch { return null; }
  }
  function readCatalog() {
    if (!catalogPromise) {
      const source = document.querySelector('meta[name="blog-discovery"]')?.content;
      if (!source) return Promise.reject(new Error('文章目录不可用'));
      catalogPromise = fetch(source).then(response => {
        if (!response.ok) throw new Error('文章目录不可用');
        return response.json();
      }).then(data => {
        if (!Array.isArray(data.articles)) throw new Error('文章目录不可用');
        return data.articles.filter(article => typeof article.title === 'string' && typeof article.path === 'string'
          && pathKey(article.path) && Array.isArray(article.categories) && Array.isArray(article.tags));
      }).catch(error => { catalogPromise = null; throw error; });
    }
    return catalogPromise;
  }
  function closePreview() {
    clearTimeout(previewTimer);
    popup?.remove();
    popup = null;
    if (activeLink) {
      if (description === null) activeLink.removeAttribute('aria-describedby');
      else if (description !== undefined) activeLink.setAttribute('aria-describedby', description);
    }
    activeLink = null;
    description = undefined;
  }
  async function showPreview(link) {
    try {
      const articles = await readCatalog();
      if (activeLink !== link || !link.isConnected) return;
      const article = articles.find(item => pathKey(item.path) === pathKey(link.href));
      if (!article) { closePreview(); return; }
      popup = document.createElement('aside');
      popup.id = 'blog-link-preview';
      popup.className = 'blog-link-preview';
      popup.setAttribute('role', 'tooltip');
      popup.innerHTML = '<span class="blog-overline"></span><strong class="blog-preview-title"></strong><p class="blog-preview-summary"></p><span class="blog-preview-meta"></span>';
      popup.querySelector('.blog-overline').textContent = article.categories[0] || '站内笔记';
      popup.querySelector('strong').textContent = article.title;
      popup.querySelector('p').textContent = article.summary;
      popup.querySelector('.blog-preview-meta').textContent = article.encrypted ? '需密码 · ' + article.date : '约 ' + article.minutes + ' 分钟 · ' + article.date;
      description = link.getAttribute('aria-describedby');
      link.setAttribute('aria-describedby', [description, popup.id].filter(Boolean).join(' '));
      document.body.append(popup);
      const bounds = link.getBoundingClientRect();
      const size = popup.getBoundingClientRect();
      const left = Math.max(12, Math.min(innerWidth - size.width - 12, bounds.left));
      const top = bounds.bottom + size.height + 12 < innerHeight ? bounds.bottom + 10 : Math.max(12, bounds.top - size.height - 10);
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
      popup.classList.add('is-visible');
    } catch { if (activeLink === link) closePreview(); }
  }
  function queuePreview(event) {
    if (event.type === 'pointerover' && (!finePointer.matches || event.pointerType === 'touch')) return;
    const link = event.target.closest?.('article.md-text.content a[href]');
    if (!link || link.closest('#blog-article-map, pre') || link.classList.contains('headerlink')) return;
    const url = new URL(link.href);
    if (!pathKey(url.href) || url.pathname === location.pathname) return;
    if (activeLink === link) return;
    closePreview();
    activeLink = link;
    previewTimer = setTimeout(() => { void showPreview(link); }, event.type === 'focusin' ? 60 : 220);
  }
  document.addEventListener('pointerover', queuePreview, { passive: true });
  document.addEventListener('focusin', queuePreview);
  for (const type of ['pointerout', 'focusout']) document.addEventListener(type, event => {
    if (activeLink?.contains(event.target) && !activeLink.contains(event.relatedTarget)) closePreview();
  });
  window.addEventListener('scroll', closePreview, { passive: true });
  window.addEventListener('resize', closePreview);
  window.addEventListener('blur', closePreview);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closePreview(); });
  document.addEventListener('click', closePreview, { capture: true });
  finePointer.addEventListener('change', closePreview);

  function visitedPaths() {
    try {
      const entries = JSON.parse(localStorage.getItem('uuhu.readingTrail.v1') || '[]');
      return new Set(Array.isArray(entries) ? entries.filter(entry => typeof entry?.path === 'string').map(entry => entry.path) : []);
    } catch { return new Set(); }
  }
  async function mountMap() {
    mapCleanup();
    mapCleanup = () => {};
    const root = document.getElementById('blog-article-map');
    if (!root) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    mapCleanup = () => controller.abort();
    root.setAttribute('aria-busy', 'true');
    try {
      const articles = await readCatalog();
      if (controller.signal.aborted || !root.isConnected) return;
      const groups = [...new Set(articles.map(article => article.categories[0] || '其他记录'))];
      const read = visitedPaths();
      const toolbar = document.createElement('div');
      toolbar.className = 'blog-map-toolbar';
      toolbar.innerHTML = '<label class="blog-map-search"><span>查找文章</span><input type="search" placeholder="标题、主题或标签" autocomplete="off"></label>'
        + '<div class="blog-map-view" role="group" aria-label="文章展示方式"><button type="button" data-view="map">主题路线</button><button type="button" data-view="list">全部文章</button></div>';
      const filters = document.createElement('div');
      filters.className = 'blog-map-filters';
      filters.setAttribute('role', 'group');
      filters.setAttribute('aria-label', '按主题筛选文章');
      for (const name of ['全部', ...groups]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.category = name;
        button.textContent = name + ' · ' + (name === '全部' ? articles.length : articles.filter(article => (article.categories[0] || '其他记录') === name).length);
        filters.append(button);
      }
      const canvas = document.createElement('div');
      canvas.className = 'blog-map-canvas';
      const routes = [];
      groups.forEach((name, groupIndex) => {
        const groupArticles = articles.filter(article => (article.categories[0] || '其他记录') === name);
        const route = document.createElement('section');
        route.className = 'blog-map-route';
        route.dataset.category = name;
        route.setAttribute('aria-labelledby', 'blog-map-route-' + groupIndex);
        route.innerHTML = '<header class="blog-map-route-header"><span class="blog-map-route-number" aria-hidden="true">' + String(groupIndex + 1).padStart(2, '0') + '</span>'
          + '<div><h3 id="blog-map-route-' + groupIndex + '"></h3><span class="blog-map-route-topics"></span></div><span class="blog-map-route-total"></span></header>'
          + '<ol class="blog-map-stations"></ol><button type="button" class="blog-map-expand" aria-expanded="false"></button>';
        route.querySelector('h3').textContent = name;
        const tags = new Map();
        for (const article of groupArticles) for (const tag of article.tags) tags.set(tag, (tags.get(tag) || 0) + 1);
        route.querySelector('.blog-map-route-topics').textContent = [...tags].sort((first, second) => second[1] - first[1])
          .slice(0, 3).map(([tag]) => tag).join(' / ') || '日常积累与实践';
        const nodes = groupArticles.map(article => {
          const station = document.createElement('li');
          const link = document.createElement('a');
          link.className = 'blog-map-node';
          link.href = article.path;
          link.innerHTML = '<span class="blog-map-node-title"></span><span class="blog-map-node-meta"></span><span class="blog-map-node-arrow" aria-hidden="true">↗</span>';
          link.querySelector('.blog-map-node-title').textContent = article.title;
          link.querySelector('.blog-map-node-meta').textContent = article.date.replaceAll('-', '.')
            + (article.encrypted ? ' · 需密码' : ' · 约 ' + article.minutes + ' 分钟');
          if (read.has(pathKey(article.path))) {
            link.classList.add('is-read');
            const marker = document.createElement('span');
            marker.className = 'blog-map-read';
            marker.textContent = '已读';
            link.querySelector('.blog-map-node-meta').append(' · ', marker);
          }
          station.append(link);
          route.querySelector('ol').append(station);
          return { article, station };
        });
        canvas.append(route);
        routes.push({ name, route, nodes, expand: route.querySelector('.blog-map-expand') });
      });
      const empty = document.createElement('div');
      empty.className = 'blog-map-empty';
      empty.innerHTML = '<p>没有找到这篇笔记。</p><button type="button">清除筛选，重新看看</button>';
      const results = root.querySelector('.blog-map-results');
      const count = results.querySelector('.blog-map-count');
      const originalCount = count.textContent;
      const summary = document.createElement('div');
      summary.className = 'blog-map-summary';
      summary.innerHTML = '<span class="blog-map-legend"><span aria-hidden="true">○</span> 未读 <span aria-hidden="true">●</span> 已读</span>';
      summary.prepend(count);
      root.querySelector('.blog-map-intro').after(toolbar, filters, summary, canvas, empty);
      const entries = new Map([...results.querySelectorAll('li')].map(entry => [pathKey(entry.querySelector('a').href), entry]));
      const markers = [];
      for (const [path, entry] of entries) {
        if (read.has(path)) {
          const marker = document.createElement('span');
          marker.className = 'blog-map-read';
          marker.textContent = '已读';
          entry.querySelector('a').append(marker);
          markers.push(marker);
        }
      }
      let category = '全部';
      let view = 'map';
      const expanded = new Set();
      function render() {
        const query = toolbar.querySelector('input').value.trim().normalize('NFKC').toLowerCase();
        let total = 0;
        let routeCount = 0;
        for (const { name, route, nodes, expand } of routes) {
          const matches = nodes.filter(({ article }) => (category === '全部' || name === category)
            && [article.title, ...article.categories, ...article.tags].join(' ').normalize('NFKC').toLowerCase().includes(query));
          const visible = new Set(matches);
          const showAll = expanded.has(name) || category !== '全部' || !!query;
          let displayed = 0;
          for (const node of nodes) {
            const matched = visible.has(node);
            const entry = entries.get(pathKey(node.article.path));
            if (entry) entry.hidden = !matched;
            node.station.hidden = !matched || (!showAll && displayed >= 3);
            if (matched) displayed++;
          }
          total += matches.length;
          route.hidden = !matches.length;
          route.classList.toggle('is-expanded', showAll);
          if (matches.length) routeCount++;
          route.querySelector('.blog-map-route-total').textContent = matches.length + ' 篇';
          expand.hidden = matches.length <= 3 || category !== '全部' || !!query;
          expand.textContent = expanded.has(name) ? '收起路线 ↑' : '还有 ' + (matches.length - 3) + ' 篇，展开路线 ↓';
          expand.setAttribute('aria-expanded', String(expanded.has(name)));
        }
        for (const button of filters.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.category === category));
        for (const button of toolbar.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
        canvas.hidden = view !== 'map' || !total;
        results.hidden = view !== 'list' || !total;
        empty.hidden = !!total;
        summary.querySelector('.blog-map-legend').hidden = view !== 'map';
        canvas.classList.toggle('is-single-route', routeCount === 1);
        count.textContent = total ? total + ' 篇文章' + (view === 'map' ? ' · ' + routeCount + ' 条主题路线' : ' · 按发布时间排序') : '没有匹配的文章';
      }
      root.addEventListener('click', event => {
        const selection = event.target.closest('button[data-category]');
        const toggle = event.target.closest('button[data-view]');
        const expand = event.target.closest('.blog-map-expand');
        if (selection) { category = selection.dataset.category; render(); }
        if (toggle) { view = toggle.dataset.view; render(); }
        if (expand) {
          const route = expand.closest('.blog-map-route');
          const name = route.dataset.category;
          if (expanded.has(name)) {
            expanded.delete(name);
            if (route.getBoundingClientRect().top < 0) route.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
          } else expanded.add(name);
          render();
        }
      }, options);
      empty.querySelector('button').addEventListener('click', () => {
        category = '全部';
        toolbar.querySelector('input').value = '';
        render();
        toolbar.querySelector('input').focus();
      }, options);
      toolbar.querySelector('input').addEventListener('input', render, options);
      mapCleanup = () => {
        controller.abort();
        results.prepend(count);
        count.textContent = originalCount;
        results.hidden = false;
        for (const entry of entries.values()) entry.hidden = false;
        for (const marker of markers) marker.remove();
        for (const element of [toolbar, filters, summary, canvas, empty]) element.remove();
        root.classList.remove('is-ready');
        root.removeAttribute('aria-busy');
      };
      render();
      root.classList.add('is-ready');
    } catch {
      if (!controller.signal.aborted && root.isConnected) {
        const notice = document.createElement('p');
        notice.className = 'blog-map-hint';
        notice.textContent = '主题路线暂时未能载入，可以继续使用下面的文章列表。';
        root.querySelector('.blog-map-intro').after(notice);
        mapCleanup = () => { controller.abort(); notice.remove(); };
      }
    } finally { if (!controller.signal.aborted && root.isConnected) root.removeAttribute('aria-busy'); }
  }
  document.addEventListener('stellar:navigation-complete', () => { closePreview(); void mountMap(); });
  void mountMap();
})();
