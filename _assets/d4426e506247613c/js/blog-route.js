export function createRouteTrace({ signal, reducedMotion }) {
  let trace;
  let started;
  let finishTimer;
  let removeTimer;
  let timeout;

  function clear() {
    for (const timer of [finishTimer, removeTimer, timeout]) clearTimeout(timer);
    trace?.remove();
    trace = null;
  }
  function start() {
    clear();
    started = performance.now();
    trace = document.createElement('div');
    trace.className = 'blog-route-trace';
    trace.setAttribute('role', 'status');
    trace.setAttribute('aria-label', '页面载入中');
    trace.innerHTML = '<svg viewBox="0 0 240 38" fill="none" aria-hidden="true">'
      + '<g class="blog-route-contours"><path d="M2 31C36 31 43 5 79 5S116 35 151 28S196 5 238 5"/>'
      + '<path d="M2 37C38 37 44 12 79 12S117 41 153 34S197 12 238 12"/>'
      + '<path d="M2 24C35 24 42 0 78 0S114 28 149 21S195 0 238 0"/></g>'
      + '<path class="blog-route-line" pathLength="100" d="M2 31C36 31 43 5 79 5S116 35 151 28S196 5 238 5"/>'
      + '<path class="blog-route-scout" pathLength="100" d="M2 31C36 31 43 5 79 5S116 35 151 28S196 5 238 5"/></svg>';
    document.body.append(trace);
    timeout = setTimeout(clear, 16000);
  }
  function finish() {
    if (!trace) return;
    clearTimeout(finishTimer);
    finishTimer = setTimeout(() => {
      trace?.classList.add('is-complete');
      clearTimeout(timeout);
      removeTimer = setTimeout(clear, reducedMotion.matches ? 0 : 200);
    }, reducedMotion.matches ? 0 : Math.max(0, 440 - (performance.now() - started)));
  }
  signal.addEventListener('abort', clear, { once: true });
  return { start, finish, clear, active: () => !!trace };
}
