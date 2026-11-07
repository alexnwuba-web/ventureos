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
