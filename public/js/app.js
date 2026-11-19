/* Small helpers: show/hide dependent questions, warn before leaving unsaved changes, confirm risky buttons. */
(function () {
  function valueOf(name) {
    var els = document.querySelectorAll('[name="a[' + name + ']"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if ((el.type === 'radio' || el.type === 'checkbox')) { if (el.checked) return el.value; } else return el.value;
    }
    var hidden = document.querySelector('[data-answer="' + name + '"]');
    return hidden ? hidden.getAttribute('data-value') : '';
  }
  function refresh() {
    document.querySelectorAll('[data-show-key]').forEach(function (box) {
      var want = box.getAttribute('data-show-in').split('|');
      box.hidden = want.indexOf(valueOf(box.getAttribute('data-show-key'))) < 0;
    });
  }
  document.addEventListener('change', refresh);
  document.addEventListener('DOMContentLoaded', refresh);

  var dirty = false;
  document.addEventListener('input', function (e) { if (e.target.closest('form[data-guard]')) dirty = true; });
  document.addEventListener('submit', function (e) {
    dirty = false;
    var c = (e.submitter && e.submitter.getAttribute('data-confirm')) || e.target.getAttribute('data-confirm');
    if (c && !window.confirm(c)) e.preventDefault();
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // Live total for "use of funds"-style tables with a target.
  document.querySelectorAll('[data-sum-col]').forEach(function (tbl) {
    var col = tbl.getAttribute('data-sum-col'), out = tbl.parentNode.querySelector('[data-sum-out]');
    function calc() {
      var t = 0;
      tbl.querySelectorAll('input[name$="[' + col + ']"]').forEach(function (i) { var n = Number(String(i.value).replace(/[,\s]/g, '')); if (isFinite(n)) t += n; });
      if (out) out.textContent = t.toLocaleString('en-NG');
    }
    tbl.addEventListener('input', calc); calc();
  });
})();

/* Up / down arrows: up appears once you have scrolled; down hides when you reach the bottom. */
(function () {
  var up = document.querySelector('[data-scroll="top"]'), down = document.querySelector('[data-scroll="bottom"]');
  if (!up || !down) return;
  var smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function go(y) { window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' }); }
  up.addEventListener('click', function (e) { e.preventDefault(); go(0); });
  down.addEventListener('click', function (e) { e.preventDefault(); go(document.documentElement.scrollHeight); });
  function update() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    up.classList.toggle('is-hidden', y < 300);
    down.classList.toggle('is-hidden', max < 200 || y > max - 300);
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

// Partner discussion: "Everyone on this application" ticks every partner.
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.matches && t.matches('[data-everyone]')) {
    var list = t.closest('form').querySelector('[data-notify]');
    if (list) list.querySelectorAll('input[type=checkbox]').forEach(function (c) { c.checked = t.checked; });
  }
});

/*
 * Tabs: a nav[data-tabs="g"] of #links switches between [data-panel="g"] blocks, one at a time. Tabs nest (sub-tabs).
 * The address keeps the open tab (#reviews, #documents…), so links, refreshes and redirects land on the right one;
 * a link to something inside a tab (#d-…, #new-meeting) opens that tab first. Without script, everything shows.
 */
(function () {
  var navs = document.querySelectorAll('nav[data-tabs]');
  if (!navs.length) return;
  function panelsOf(g) { return Array.prototype.slice.call(document.querySelectorAll('[data-panel="' + g + '"]')); }
  function show(panel) {
    var g = panel.getAttribute('data-panel');
    panelsOf(g).forEach(function (p) { p.hidden = p !== panel; });
    document.querySelectorAll('nav[data-tabs="' + g + '"] a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + panel.id); });
  }
  function ensureDefaults() {
    navs.forEach(function (nav) {
      var g = nav.getAttribute('data-tabs'), ps = panelsOf(g);
      if (ps.length && !ps.some(function (p) { return !p.hidden; })) show(ps[0]);
      else if (ps.length && ps.filter(function (p) { return !p.hidden; }).length > 1) show(ps.filter(function (p) { return !p.hidden; })[0]);
    });
  }
  function open(id) {
    var el = id && document.getElementById(id);
    if (!el) return false;
    var chain = [], n = el;
    while (n && n !== document.body) { if (n.hasAttribute && n.hasAttribute('data-panel')) chain.unshift(n); n = n.parentNode; }
    chain.forEach(show);
    return el;
  }
  ensureDefaults();
  var first = open(decodeURIComponent(location.hash.slice(1)));
  if (first && !first.hasAttribute('data-panel') && !first.querySelector('[data-panel]')) setTimeout(function () { first.scrollIntoView({ block: 'start' }); }, 0);
  else if (first) setTimeout(function () { navs[0].scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); }, 0);

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1), el = document.getElementById(id);
    if (!el) return;
    var inTabs = a.closest('nav[data-tabs]');
    var hiddenTarget = false, n = el;
    while (n && n !== document.body) { if (n.hidden) hiddenTarget = true; n = n.parentNode; }
    if (!inTabs && !hiddenTarget) return; // ordinary in-page link
    e.preventDefault();
    open(id);
    ensureDefaults();
    history.replaceState(null, '', '#' + id);
    if (inTabs) { var top = inTabs.getBoundingClientRect().top; if (top < 0 || top > window.innerHeight * 0.6) { inTabs.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); } }
    else el.scrollIntoView({ block: 'start' });
  });
  window.addEventListener('hashchange', function () { open(decodeURIComponent(location.hash.slice(1))); ensureDefaults(); });
})();
