/* ============================================================================
 * debug.js — floating SCREEN NAVIGATOR widget for Fill-the-Jar.
 *
 * Loads only when the URL has ?debug=1 (purely additive; without it the game is
 * untouched). Gives you one small floating, draggable widget to move through the
 * game's screens:
 *     ◀ Prev   [ screen dropdown ]   Next ▶
 * Pick any screen and it renders instantly — no need to play through.
 *
 * Optional "✎ Edit layout" toggle (off by default) reveals drag/resize handles
 * + "Download Layout JSON" for alignment work. With it off, it's navigation only.
 *
 * Talks to the game via window.GameDebug:
 *   getTransform() -> {x,y,scale}   screens() -> [names]
 *   showScreen(name) -> [ {id, get(), set(box), reset()} ]   currentScreen
 * ========================================================================== */
(function () {
  'use strict';
  if (!/[?&]debug=1/.test(window.location.search)) return;

  var GD = null, assets = [], handles = [], editMode = false;
  var root, panel, body, selectEl, statusEl;

  var poll = setInterval(function () {
    if (window.GameDebug && window.GameDebug.screens) {
      clearInterval(poll);
      GD = window.GameDebug;
      buildUI();
      go(GD.currentScreen || GD.screens()[0]);
      requestAnimationFrame(syncLoop);
    }
  }, 60);

  function el(tag, css, parent) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }
  function round(n) { return Math.round(n * 100) / 100; }
  function screens() { return GD.screens(); }
  function curIndex() { return Math.max(0, screens().indexOf(GD.currentScreen)); }

  /* ---- floating widget UI ---------------------------------------------- */
  function buildUI() {
    // Layer that holds the (edit-mode) drag handles. Click-through when empty.
    root = el('div', 'position:fixed;inset:0;z-index:99998;pointer-events:none;', document.body);

    panel = el('div',
      'position:fixed;left:14px;top:14px;z-index:99999;width:248px;background:rgba(22,17,10,.94);' +
      'color:#fff;font:12px/1.45 ui-monospace,monospace;border-radius:10px;pointer-events:auto;' +
      'box-shadow:0 6px 22px rgba(0,0,0,.55);user-select:none;', document.body);

    // Draggable header
    var head = el('div',
      'display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:grab;background:rgba(255,210,122,.14);' +
      'border-radius:10px 10px 0 0;', panel);
    el('span', 'font-size:14px;', head).textContent = '🎬';
    el('span', 'font-weight:700;color:#ffd27a;flex:1;', head).textContent = 'Screen Navigator';
    var collapse = el('span', 'cursor:pointer;padding:0 4px;color:#ffd27a;', head);
    collapse.textContent = '▾';
    makeDraggable(panel, head);

    body = el('div', 'padding:10px;', panel);
    collapse.onclick = function () {
      var hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      collapse.textContent = hidden ? '▾' : '▸';
    };

    // Prev / dropdown / Next
    var nav = el('div', 'display:flex;gap:6px;align-items:center;margin-bottom:8px;', body);
    mkBtn(nav, '◀', function () { step(-1); }, 'flex:0 0 auto;');
    selectEl = el('select',
      'flex:1;min-width:0;background:#2a2218;color:#cfead0;border:1px solid #5a7a4a;border-radius:6px;' +
      'padding:5px;font:12px ui-monospace,monospace;cursor:pointer;', nav);
    screens().forEach(function (name) {
      var o = el('option', '', selectEl); o.value = name; o.textContent = name;
    });
    selectEl.onchange = function () { go(selectEl.value); };
    mkBtn(nav, '▶', function () { step(1); }, 'flex:0 0 auto;');

    statusEl = el('div', 'opacity:.7;text-align:center;margin-bottom:8px;', body);

    // Edit-layout toggle (reveals drag/resize handles + JSON export)
    var editRow = el('label', 'display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:6px;', body);
    var chk = el('input', '', editRow); chk.type = 'checkbox';
    el('span', '', editRow).textContent = '✎ Edit layout (drag / resize)';
    chk.onchange = function () { setEdit(chk.checked); };

    editBox = el('div', 'display:none;border-top:1px solid #443;padding-top:8px;margin-top:2px;', body);
    var row = el('div', 'display:flex;gap:6px;', editBox);
    mkBtn(row, '⬇ Download JSON', downloadJSON, 'flex:1;background:#39a06a;');
    mkBtn(row, 'Reset all', function () { assets.forEach(function (a) { a.reset(); }); syncAll(); renderList(); }, 'background:#a8453f;');
    listEl = el('div', 'margin-top:7px;max-height:42vh;overflow:auto;', editBox);
  }

  var editBox, listEl;

  function mkBtn(parent, label, fn, extra) {
    var b = el('button',
      'cursor:pointer;color:#fff;border:0;border-radius:6px;padding:6px 9px;font:700 11px ui-monospace,monospace;' +
      'background:#3a3228;' + (extra || ''), parent);
    b.textContent = label; b.onclick = fn; return b;
  }

  function makeDraggable(target, handle) {
    handle.addEventListener('pointerdown', function (ev) {
      if (ev.target.tagName === 'SPAN' && ev.target.textContent.length === 1 && ev.target !== handle.firstChild) {} // ignore collapse
      ev.preventDefault();
      var r = target.getBoundingClientRect(), sx = ev.clientX, sy = ev.clientY;
      handle.setPointerCapture(ev.pointerId); handle.style.cursor = 'grabbing';
      function move(e) { target.style.left = (r.left + e.clientX - sx) + 'px'; target.style.top = (r.top + e.clientY - sy) + 'px'; }
      function up() { handle.releasePointerCapture(ev.pointerId); handle.style.cursor = 'grab'; handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); }
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
  }

  /* ---- navigation ------------------------------------------------------- */
  function step(d) {
    var s = screens(), i = (curIndex() + d + s.length) % s.length;
    go(s[i]);
  }
  function go(name) {
    assets = GD.showScreen(name) || [];
    selectEl.value = GD.currentScreen || name;
    statusEl.textContent = (curIndex() + 1) + ' / ' + screens().length + '  ·  ' + (GD.currentScreen || name);
    rebuildHandles();
    if (editMode) renderList();
  }

  /* ---- edit mode (handles) --------------------------------------------- */
  function setEdit(on) {
    editMode = on;
    editBox.style.display = on ? 'block' : 'none';
    rebuildHandles();
    if (on) renderList();
  }
  function rebuildHandles() {
    clearHandles();
    if (editMode) { assets.forEach(makeHandle); syncAll(); }
  }
  function clearHandles() { handles.forEach(function (h) { h.box.remove(); }); handles = []; }

  var CORNERS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  var CURSORS = { nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize' };

  function makeHandle(asset) {
    var box = el('div', 'position:absolute;border:2px solid #ffe24a;box-sizing:border-box;pointer-events:auto;cursor:move;background:rgba(255,226,74,.08);', root);
    var label = el('div', 'position:absolute;left:-2px;top:-19px;white-space:nowrap;background:#ffe24a;color:#241a06;font:10px/1.3 ui-monospace,monospace;padding:1px 5px;border-radius:3px;', box);
    var h = { asset: asset, box: box, label: label };
    CORNERS.forEach(function (c) {
      var d = el('div', 'position:absolute;width:11px;height:11px;background:#ffe24a;border:1px solid #241a06;box-sizing:border-box;cursor:' + CURSORS[c] + ';', box);
      placeDot(d, c); addResize(d, h, c);
    });
    addDrag(box, h); handles.push(h);
  }
  function placeDot(d, c) {
    var m = '-6px';
    if (c.indexOf('n') > -1) d.style.top = m; if (c.indexOf('s') > -1) d.style.bottom = m;
    if (c.indexOf('w') > -1) d.style.left = m; if (c.indexOf('e') > -1) d.style.right = m;
    if (c === 'n' || c === 's') { d.style.left = '50%'; d.style.marginLeft = '-6px'; }
    if (c === 'e' || c === 'w') { d.style.top = '50%'; d.style.marginTop = '-6px'; }
  }
  function addDrag(box, h) {
    box.addEventListener('pointerdown', function (ev) {
      if (ev.target !== box && ev.target !== h.label) return;
      ev.preventDefault(); ev.stopPropagation(); box.setPointerCapture(ev.pointerId);
      var s = h.asset.get(), sx = ev.clientX, sy = ev.clientY, sc = GD.getTransform().scale;
      function move(e) { h.asset.set({ x: s.x + (e.clientX - sx) / sc, y: s.y + (e.clientY - sy) / sc, w: s.w, h: s.h }); syncHandle(h); updateRow(h); }
      function up() { box.releasePointerCapture(ev.pointerId); box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); }
      box.addEventListener('pointermove', move); box.addEventListener('pointerup', up);
    });
  }
  function addResize(dot, h, corner) {
    dot.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); ev.stopPropagation(); dot.setPointerCapture(ev.pointerId);
      var s = h.asset.get(), sx = ev.clientX, sy = ev.clientY, sc = GD.getTransform().scale;
      function move(e) {
        var dx = (e.clientX - sx) / sc, dy = (e.clientY - sy) / sc, b = { x: s.x, y: s.y, w: s.w, h: s.h };
        if (corner.indexOf('e') > -1) b.w = Math.max(10, s.w + dx);
        if (corner.indexOf('s') > -1) b.h = Math.max(10, s.h + dy);
        if (corner.indexOf('w') > -1) { b.w = Math.max(10, s.w - dx); b.x = s.x + (s.w - b.w); }
        if (corner.indexOf('n') > -1) { b.h = Math.max(10, s.h - dy); b.y = s.y + (s.h - b.h); }
        h.asset.set(b); syncHandle(h); updateRow(h);
      }
      function up() { dot.releasePointerCapture(ev.pointerId); dot.removeEventListener('pointermove', move); dot.removeEventListener('pointerup', up); }
      dot.addEventListener('pointermove', move); dot.addEventListener('pointerup', up);
    });
  }
  function syncHandle(h) {
    var b = h.asset.get(), t = GD.getTransform();
    h.box.style.left = (t.x + b.x * t.scale) + 'px';
    h.box.style.top = (t.y + b.y * t.scale) + 'px';
    h.box.style.width = (b.w * t.scale) + 'px';
    h.box.style.height = (b.h * t.scale) + 'px';
    h.label.textContent = h.asset.id + ' | ' + Math.round(b.x) + ',' + Math.round(b.y) + ' | ' + Math.round(b.w) + '×' + Math.round(b.h);
  }
  function syncAll() { handles.forEach(syncHandle); }
  function syncLoop() { if (editMode) syncAll(); requestAnimationFrame(syncLoop); }

  function renderList() {
    listEl.innerHTML = '';
    assets.forEach(function (a, i) {
      var b = a.get();
      var rowEl = el('div', 'display:flex;align-items:center;gap:6px;margin:2px 0;', listEl);
      rowEl.dataset.idx = i;
      var t = el('div', 'flex:1;overflow:hidden;text-overflow:ellipsis;', rowEl); t.className = 'r';
      t.textContent = a.id + '  ' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.w) + '×' + Math.round(b.h);
      mkBtn(rowEl, 'reset', function () { a.reset(); syncAll(); updateRow(handles[i]); }, 'background:#3a3228;color:#fc9;font-weight:400;');
    });
  }
  function updateRow(h) {
    var i = handles.indexOf(h); if (i < 0 || !listEl) return;
    var rowEl = listEl.querySelector('[data-idx="' + i + '"] .r');
    if (rowEl) { var b = h.asset.get(); rowEl.textContent = h.asset.id + '  ' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.w) + '×' + Math.round(b.h); }
  }

  function downloadJSON() {
    var data = { screen: GD.currentScreen, assets: assets.map(function (a) { var b = a.get(); return { id: a.id, x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }; }) };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'layout_' + (GD.currentScreen || 'screen').replace(/[^a-z0-9]+/gi, '_') + '_' + Date.now() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
})();
