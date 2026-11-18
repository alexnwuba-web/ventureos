/* @ds-bundle: {"format":4,"namespace":"VentureOS","components":[{"name":"Emblem"},{"name":"Button"},{"name":"DataTag"},{"name":"PillarBadge"},{"name":"PaperCard"},{"name":"FloatingScene"},{"name":"Ticker"},{"name":"ThreadDivider"},{"name":"ProgrammeCard"},{"name":"EventCard"}]} */
/* VentureOS — small vanilla helpers for the brand's motion. No dependencies; safe to inline. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The Gate: 20 warp threads in an arch, a doorway at the foot. Same geometry as the logo files. */
  function gateLines() {
    var w = 120, h = 150, step = 6, r = w / 2, doorR = 15, doorTop = 88, out = [];
    for (var i = 0; i < w / step; i++) {
      var x = step / 2 + i * step, dx = Math.abs(x - r);
      if (dx >= r) continue;
      var top = r - Math.sqrt(r * r - dx * dx), bottom = h;
      if (dx < doorR) bottom = doorTop + (doorR - Math.sqrt(doorR * doorR - dx * dx)) - 6;
      if (bottom - top > 2) out.push({ x: x, a: top + 1.6, b: bottom - 1.6, i: i });
    }
    return out;
  }

  /* Emblem(el, {size, night, drawn, breathing, light, pillars}) — renders the mark into el. */
  function Emblem(el, o) {
    o = o || {};
    var lines = gateLines(), size = o.size || 120;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-4 -4 128 158');
    svg.setAttribute('width', size); svg.setAttribute('height', Math.round(size * 158 / 128));
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'VentureOS');
    var acc = {}; var idx = lines.map(function (l) { return l.i; });
    if (o.pillars !== false) { acc[idx[3]] = 'is-make'; acc[idx[Math.floor(idx.length / 2) - 3]] = 'is-grow'; acc[idx[idx.length - 4]] = 'is-create'; }
    lines.forEach(function (l, n) {
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', l.x); ln.setAttribute('x2', l.x); ln.setAttribute('y1', l.a); ln.setAttribute('y2', l.b);
      if (acc[l.i]) ln.setAttribute('class', acc[l.i]);
      ln.style.setProperty('--len', (l.b - l.a).toFixed(1));
      ln.style.setProperty('--i', n);
      svg.appendChild(ln);
    });
    if (o.light) { /* the brass light rising in the doorway */
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', 60); c.setAttribute('cy', 128); c.setAttribute('r', 7.5); c.setAttribute('class', 'vos-emblem__light');
      svg.appendChild(c);
    }
    el.classList.add('vos-emblem');
    if (o.night) el.classList.add('on-night');
    if (o.drawn && !reduce) el.classList.add('is-drawn');
    if (o.breathing && !reduce) el.classList.add('is-breathing');
    if (o.light && reduce) el.classList.add('is-drawn');
    el.innerHTML = ''; el.appendChild(svg);
    return el;
  }

  /* FloatingScene(scene) — pointer tilts the stage; layers drift on their own (CSS). */
  function FloatingScene(scene, o) {
    o = o || {}; var stage = scene.querySelector('.vos-scene__stage'); if (!stage || reduce) return scene;
    var max = o.max || 6;
    scene.addEventListener('pointermove', function (e) {
      var r = scene.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty('--rx', (px * max).toFixed(2)); stage.style.setProperty('--ry', (-py * max).toFixed(2));
    });
    scene.addEventListener('pointerleave', function () { stage.style.setProperty('--rx', 0); stage.style.setProperty('--ry', 0); });
    return scene;
  }

  /* reveal(root) — .vos-reveal elements fade up as they enter the viewport. */
  function reveal(root) {
    var els = (root || document).querySelectorAll('.vos-reveal');
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { threshold: 0.15 });
    els.forEach(function (e, i) { e.style.transitionDelay = (i % 6) * 70 + 'ms'; io.observe(e); });
  }

  /* Ticker(el) — duplicates the track's items so the loop is seamless. */
  function Ticker(el) {
    var track = el.querySelector('.vos-ticker__track'); if (!track || track.dataset.doubled) return el;
    track.innerHTML += track.innerHTML; track.dataset.doubled = '1'; return el;
  }

  /* ThreadDivider(el, n) — a row of warp threads; pillar colours woven in. */
  function ThreadDivider(el, n) {
    n = n || 48; var html = '';
    for (var i = 0; i < n; i++) {
      var h = 35 + 65 * Math.abs(Math.sin(i / 5.3)) * (0.6 + 0.4 * Math.abs(Math.cos(i / 2.1)));
      var c = i % 17 === 3 ? ' class="is-make"' : i % 17 === 9 ? ' class="is-grow"' : i % 17 === 14 ? ' class="is-create"' : '';
      html += '<i' + c + ' style="--h:' + h.toFixed(0) + '"></i>';
    }
    el.classList.add('vos-threads'); el.innerHTML = html; return el;
  }

  window.VentureOS = { Emblem: Emblem, FloatingScene: FloatingScene, Ticker: Ticker, ThreadDivider: ThreadDivider, reveal: reveal, gateLines: gateLines,
    /* Static components are CSS classes; listed here so tools can find them. */
    Button: 'vos-btn', DataTag: 'vos-tag', PillarBadge: 'vos-badge', PaperCard: 'vos-card', ProgrammeCard: 'vos-card', EventCard: 'vos-card' };
})();

/* Page start-up: wire the brand components the templates mark with data attributes. */
document.addEventListener('DOMContentLoaded', function () {
  var V = window.VentureOS;
  document.querySelectorAll('[data-emblem]').forEach(function (el) {
    var o = {}; try { o = JSON.parse(el.getAttribute('data-emblem') || '{}'); } catch (e) {}
    V.Emblem(el, o);
  });
  document.querySelectorAll('[data-scene]').forEach(function (el) {
    if (window.matchMedia('(min-width: 900px)').matches) V.FloatingScene(el, { max: 7 });
  });
  document.querySelectorAll('.vos-ticker').forEach(function (el) { V.Ticker(el); });
  document.querySelectorAll('[data-threads]').forEach(function (el) { V.ThreadDivider(el, Number(el.getAttribute('data-threads')) || 56); });
  V.reveal(document);
});
