/* ═══════════════════════════════════════════════════════════════════════════
   Cabinet Studio — Preview (js/ui/preview.js)

   Canvas preview of the selected cabinet: front elevation, side section,
   plan section and shaded isometric. Uses the shared scene builders in
   CS.draw.views and the shared renderer in CS.draw.render — no geometry is
   re-implemented here.

   Also exposes CS.ui.preview.drawScene(canvas, scene, opts): the small
   fit-to-canvas painter used by sheet nesting and assembly step illustrations.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var doc = root.document;

  var PX_PER_MM = 3.4;
  var VIEWS = [
    { id: 'front', label: 'Front', icon: 'design', title: 'Front elevation (1)' },
    { id: 'side', label: 'Side', icon: 'cutlist', title: 'Side section (2)' },
    { id: 'plan', label: 'Plan', icon: 'plans', title: 'Plan section (3)' },
    { id: 'iso', label: 'Isometric', icon: 'assembly', title: 'Isometric (4)' }
  ];
  var VIEW_LABEL = { front: 'Front elevation', side: 'Side section', plan: 'Plan section', iso: 'Isometric' };

  var els = null;
  var initialized = false;
  var resizeObserver = null;
  var paintQueued = false;
  var lastScene = null;
  var lastPaint = null;
  var lastErrorKey = '';
  var drag = null;

  function app() { return CS.ui.app; }
  function el(tag, props, children) { return CS.ui.app.el(tag, props, children); }
  function icon(name, cls) { return CS.ui.app.icon(name, cls); }
  function clear(node) { return CS.ui.app.clear(node); }

  function state() { return CS.ui.app.state; }
  function previewState() { return CS.ui.app.state.preview; }

  /* ───────────────────────────── Drawing API detection ───────────────────────────── */

  function drawStatus() {
    var draw = CS.draw;
    var canvasApi = draw && draw.canvas;
    var render = draw && draw.render;
    var views = draw && draw.views;
    var modules = {
      canvas: !!(canvasApi && typeof canvasApi.createBackend === 'function'),
      render: !!(render && (typeof render.render === 'function' || typeof render.scene === 'function')),
      // Only one view builder is strictly required; the others degrade per view.
      views: !!(views && typeof views.cabinetFront === 'function')
    };
    var missing = [];
    if (!modules.canvas) missing.push('js/draw/canvas.js');
    if (!modules.render) missing.push('js/draw/render.js');
    if (!modules.views) missing.push('js/draw/views.js');
    return { ok: modules.canvas && modules.render && modules.views, missing: missing };
  }

  function sceneBounds(scene) {
    if (scene && scene.bounds && isFinite(scene.bounds.width) && scene.bounds.height >= 0) return scene.bounds;
    if (CS.draw && CS.draw.scene && typeof CS.draw.scene.bounds === 'function') {
      try { return CS.draw.scene.bounds(scene); } catch (err) { return null; }
    }
    return null;
  }

  /**
   * Paint a scene into a canvas at a fit scale with optional zoom/pan.
   * All sizes are CSS pixels; the scene renderer works in paper millimetres
   * (the canvas backend scales paper mm to device pixels itself).
   */
  function paint(canvas, scene, opts) {
    opts = opts || {};
    var status = drawStatus();
    if (!status.ok) return false;
    if (!scene || !Array.isArray(scene.items) || !scene.items.length) return false;
    var wrap = canvas.parentElement;
    if (!wrap) return false;
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    if (!(w > 20) || !(h > 20)) return false;

    var bounds = sceneBounds(scene);
    if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return false;

    var dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    var backend;
    try {
      backend = CS.draw.canvas.createBackend(canvas, { pxPerMm: PX_PER_MM, dpr: dpr, width: w, height: h });
    } catch (err) {
      reportPaintError('createBackend', err);
      return false;
    }
    if (!backend) return false;

    // Clear the previous frame (and stay transparent so the paper grid shows).
    var ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    var paddingPx = opts.padding !== undefined ? opts.padding : 34;
    var padPaper = paddingPx / PX_PER_MM;
    var paperW = backend.paperWidth || w / PX_PER_MM;
    var paperH = backend.paperHeight || h / PX_PER_MM;
    var box = {
      x: padPaper,
      y: padPaper,
      width: Math.max(4, paperW - padPaper * 2),
      height: Math.max(4, paperH - padPaper * 2)
    };

    var zoom = isFinite(opts.zoom) && opts.zoom > 0 ? opts.zoom : 1;
    var panMmX = (opts.panX || 0) / PX_PER_MM;
    var panMmY = (opts.panY || 0) / PX_PER_MM;
    var scale;
    var x;
    var y;
    try {
      var fit = CS.draw.render.fit(scene, box, {});
      scale = fit.scale * zoom;
      x = fit.x + (fit.width - fit.width * zoom) / 2 + panMmX;
      y = fit.y + (fit.height - fit.height * zoom) / 2 + panMmY;
      if (typeof CS.draw.render.render === 'function') {
        CS.draw.render.render(scene, backend, { scale: scale, x: x, y: y });
      } else {
        // Contract §6 form (render.scene) for forward compatibility.
        CS.draw.render.scene(scene, backend, {
          scale: scale,
          offsetX: x * PX_PER_MM,
          offsetY: y * PX_PER_MM,
          paperWidth: paperW,
          paperHeight: paperH,
          clip: true
        });
      }
    } catch (err) {
      reportPaintError('render', err);
      return false;
    }
    return true;
  }

  function reportPaintError(stage, err) {
    var key = stage + ':' + (err && err.message ? err.message : String(err));
    if (root.console && typeof root.console.error === 'function') {
      root.console.error('[Cabinet Studio] Preview ' + stage + ' failed', err);
    }
    if (key === lastErrorKey) return;
    lastErrorKey = key;
    showPlaceholder({
      kind: 'error',
      title: 'The drawing could not be rendered',
      message: (err && err.message ? err.message : String(err)) + ' — the rest of the design tools keep working.'
    });
  }

  /** Public helper: fit-draw a scene into a canvas (used by tables/assembly). */
  function drawScene(canvas, scene, opts) {
    return paint(canvas, scene, Object.assign({ zoom: 1, panX: 0, panY: 0 }, opts || {}));
  }

  /* ───────────────────────────── Toolbar ───────────────────────────── */

  function buildToolbar() {
    var toolbar = els.toolbar;
    clear(toolbar);

    var viewGroup = el('div', { className: 'segmented', attrs: { role: 'group', 'aria-label': 'Drawing view' } });
    VIEWS.forEach(function (view) {
      var btn = el('button', {
        className: 'segmented-btn', type: 'button', dataset: { view: view.id },
        attrs: { 'aria-pressed': previewState().view === view.id ? 'true' : 'false', title: view.title },
        on: { click: function () { setView(view.id); } }
      }, [icon(view.icon), el('span', { text: view.label })]);
      viewGroup.appendChild(btn);
    });

    var toggles = el('div', { className: 'preview-toolbar-group', attrs: { role: 'group', 'aria-label': 'Drawing annotations' } }, [
      toggleButton('dims', 'ruler', 'Dims', 'Show dimensions and titles', previewState().showDims, function (value) {
        previewState().showDims = value; buildToolbar(); requestPaint(true);
      }),
      toggleButton('partnos', 'layers', 'Part no.', 'Show part numbers and labels', previewState().showPartNumbers, function (value) {
        previewState().showPartNumbers = value; buildToolbar(); requestPaint(true);
      })
    ]);

    var zoomGroup = el('div', { className: 'zoom-controls', attrs: { role: 'group', 'aria-label': 'Zoom' } }, [
      el('button', {
        className: 'zoom-btn', type: 'button', attrs: { 'aria-label': 'Zoom out', title: 'Zoom out (−)' },
        on: { click: function () { zoomBy(1 / 1.25); } }
      }, icon('zoom-out')),
      el('span', { className: 'zoom-level', id: 'preview-zoom', text: zoomLabel(), attrs: { 'aria-live': 'polite' } }),
      el('button', {
        className: 'zoom-btn', type: 'button', attrs: { 'aria-label': 'Zoom in', title: 'Zoom in (+)' },
        on: { click: function () { zoomBy(1.25); } }
      }, icon('zoom-in')),
      el('button', {
        className: 'zoom-btn', type: 'button', attrs: { 'aria-label': 'Fit drawing', title: 'Zoom to fit (0)' },
        on: { click: function () { resetView(); } }
      }, icon('fit'))
    ]);

    toolbar.appendChild(viewGroup);
    toolbar.appendChild(el('span', { className: 'preview-toolbar-sep' }));
    toolbar.appendChild(toggles);
    toolbar.appendChild(el('div', { className: 'preview-toolbar-group is-right' }, [
      el('span', { className: 'preview-toolbar-sep' }),
      zoomGroup
    ]));
  }

  function toggleButton(id, iconName, label, title, pressed, onChange) {
    return el('button', {
      className: 'toggle-btn', type: 'button',
      attrs: { 'aria-pressed': pressed ? 'true' : 'false', title: title },
      dataset: { toggle: id },
      on: {
        click: function () {
          var next = !(this.getAttribute('aria-pressed') === 'true');
          onChange(next);
        }
      }
    }, [icon(iconName), el('span', { className: 'toolbar-label', text: label })]);
  }

  function zoomLabel() {
    var z = previewState().zoom;
    if (Math.abs(z - 1) < 0.005) return 'Fit';
    return Math.round(z * 100) + '%';
  }

  function setView(viewId) {
    if (VIEWS.every(function (v) { return v.id !== viewId; })) return;
    previewState().view = viewId;
    resetView(false);
    buildToolbar();
    requestPaint(true);
  }

  function zoomBy(factor) {
    var next = Math.max(0.25, Math.min(8, previewState().zoom * factor));
    previewState().zoom = next;
    updateZoomLabel();
    requestPaint(false);
  }

  function resetView(doPaint) {
    previewState().zoom = 1;
    previewState().panX = 0;
    previewState().panY = 0;
    updateZoomLabel();
    if (doPaint !== false) requestPaint(false);
  }

  function updateZoomLabel() {
    var node = doc.getElementById('preview-zoom');
    if (node) node.textContent = zoomLabel();
  }

  /* ───────────────────────────── State / placeholders ───────────────────────────── */

  function showPlaceholder(opts) {
    var empty = els.empty;
    if (!empty) return;
    empty.hidden = false;
    clear(empty);
    if (opts.kind === 'module') {
      empty.appendChild(CS.ui.app.moduleNote({
        title: opts.title || 'Drawing module not loaded yet',
        message: opts.message,
        missing: opts.missing,
        files: opts.files
      }));
    } else if (opts.kind === 'error') {
      empty.appendChild(CS.ui.app.moduleNote({
        variant: 'error',
        title: opts.title || 'Drawing unavailable',
        message: opts.message,
        files: [],
        actions: [el('button', {
          className: 'btn btn-secondary btn-sm', type: 'button', text: 'Try again',
          on: { click: function () { requestPaint(true); } }
        })]
      }));
    } else if (opts.kind === 'empty') {
      empty.appendChild(CS.ui.app.emptyState(opts.emptyState || {}));
    } else if (opts.node) {
      empty.appendChild(opts.node);
    }
  }

  function hidePlaceholder() {
    if (els.empty) els.empty.hidden = true;
  }

  function showResolving() {
    showPlaceholder({
      kind: 'empty',
      emptyState: {
        icon: 'spinner',
        title: 'Resolving parts and machining…',
        text: 'The cabinet is being turned into real parts; the drawing follows in a moment.'
      }
    });
  }

  /* ───────────────────────────── Scene building ───────────────────────────── */

  function buildScene(model) {
    var views = CS.draw && CS.draw.views;
    if (!views) return null;
    var view = previewState().view;
    var opts = {
      compact: !previewState().showDims,
      partNumbers: !!previewState().showPartNumbers,
      labels: !!previewState().showPartNumbers,
      units: state().project ? state().project.units : 'imperial'
    };
    try {
      if (view === 'front' && typeof views.cabinetFront === 'function') return views.cabinetFront(model, opts);
      if (view === 'side' && typeof views.cabinetSideSection === 'function') return views.cabinetSideSection(model, opts);
      if (view === 'plan' && typeof views.cabinetPlanSection === 'function') return views.cabinetPlanSection(model, opts);
      if (view === 'iso' && typeof views.cabinetIso === 'function') return views.cabinetIso(model, opts);
      if (typeof views.cabinetFront === 'function') return views.cabinetFront(model, opts);
    } catch (err) {
      reportPaintError('build scene', err);
      return null;
    }
    return null;
  }

  /* ───────────────────────────── Paint pipeline ───────────────────────────── */

  function requestPaint(forceState) {
    if (forceState) lastPaint = null;
    if (paintQueued) return;
    paintQueued = true;
    var run = function () {
      paintQueued = false;
      refresh({ force: true });
    };
    if (root.requestAnimationFrame) root.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  /**
   * Rebuild and paint the current view. Writes a calm placeholder when the
   * cabinet or a required module is missing.
   */
  function refresh(opts) {
    opts = opts || {};
    if (!els) return;
    var wrap = els.wrap;
    if (!wrap || wrap.clientWidth < 20 || wrap.clientHeight < 20) return; // hidden tab

    var status = drawStatus();
    if (!status.ok) {
      showPlaceholder({
        kind: 'module',
        missing: status.missing,
        files: status.missing,
        title: 'Drawing module not loaded yet',
        message: 'The preview needs the drawing modules. The inspector and the rest of the app still work.'
      });
      return;
    }

    var appState = state();
    if (!appState.project) {
      showPlaceholder({ kind: 'empty', emptyState: { title: 'No project open', text: 'Open the sample kitchen or start a new project.' } });
      return;
    }
    if (!appState.project.cabinets || !appState.project.cabinets.length) {
      showPlaceholder({
        kind: 'empty',
        emptyState: {
          icon: 'design',
          title: 'No cabinets yet',
          text: 'Add a base, wall or tall cabinet to see its front, sections and isometric drawing.',
          actions: [
            el('button', { className: 'btn btn-primary btn-sm', type: 'button', text: 'Add base cabinet', on: { click: function () { CS.ui.app.addCabinet('base'); } } }),
            el('button', { className: 'btn btn-secondary btn-sm', type: 'button', text: 'Add wall cabinet', on: { click: function () { CS.ui.app.addCabinet('wall'); } } })
          ]
        }
      });
      return;
    }
    if (appState.resolveState === 'unavailable') {
      showPlaceholder({
        kind: 'module',
        missing: ['CS.engine.resolveProject'],
        files: ['js/engine/index.js'],
        title: 'Engine module not loaded yet',
        message: 'Previews need the cabinet engine to resolve the selected cabinet into parts.'
      });
      return;
    }
    if (appState.resolveState === 'error') {
      showPlaceholder({
        kind: 'error',
        title: 'The engine reported an error',
        message: 'The selected cabinet could not be resolved, so the drawing cannot be built. Your project data is intact — see the console for the engine error.'
      });
      return;
    }
    var model = CS.ui.app.getSelectedModel();
    if (!model) {
      if (appState.resolveState === 'pending' || !appState.resolved) {
        showResolving();
      } else {
        showPlaceholder({ kind: 'empty', emptyState: { icon: 'design', title: 'Select a cabinet', text: 'Choose a cabinet in the list to preview it.' } });
      }
      return;
    }

    var scene = buildScene(model);
    if (!scene) {
      showPlaceholder({
        kind: 'module',
        missing: ['CS.draw.views.cabinetFront'],
        files: ['js/draw/views.js'],
        title: 'View builder not available',
        message: 'The ' + (VIEW_LABEL[previewState().view] || 'drawing') + ' builder has not loaded yet.'
      });
      return;
    }
    lastScene = scene;
    lastPaint = function () {
      return paint(els.canvas, lastScene, {
        zoom: previewState().zoom,
        panX: previewState().panX,
        panY: previewState().panY,
        padding: previewState().view === 'iso' ? 24 : 40
      });
    };
    if (!lastPaint()) {
      showPlaceholder({
        kind: 'empty',
        emptyState: {
          icon: 'design',
          title: 'No drawing for this view',
          text: 'The ' + (VIEW_LABEL[previewState().view] || 'view') + ' scene is empty. Try another view, or check the cabinet configuration.'
        }
      });
      return;
    }
    hidePlaceholder();
    updateStatus(model);
  }

  function updateStatus(model) {
    var status = els.status;
    if (!status) return;
    clear(status);
    var cfg = model && model.config ? model.config : (CS.ui.app.getSelectedCabinet() || {});
    var view = previewState().view;
    var dims = '';
    try {
      if (isFinite(cfg.width) && isFinite(cfg.height) && isFinite(cfg.depth)) {
        dims = CS.ui.app.fmtShort(cfg.width) + ' × ' + CS.ui.app.fmtShort(cfg.height) + ' × ' + CS.ui.app.fmtShort(cfg.depth);
        if (CS.ui.app.unit() === 'metric') dims += ' ' + CS.ui.app.unitLabel();
      }
    } catch (err) { dims = ''; }
    var parts = model && Array.isArray(model.parts) ? model.parts.length : null;
    var left = el('div', { className: 'preview-status-left' }, [
      icon('ruler'),
      el('strong', { text: VIEW_LABEL[view] || view }),
      el('span', { text: dims })
    ]);
    if (parts !== null) left.appendChild(el('span', { className: 'meta-chip', text: parts + ' parts' }));
    status.appendChild(left);
    status.appendChild(el('div', {
      className: 'preview-status-right preview-hint',
      text: 'Drag to pan · scroll to zoom · double-click to fit'
    }));
  }

  /* ───────────────────────────── Interaction ───────────────────────────── */

  function bindCanvas() {
    var wrap = els.wrap;

    wrap.addEventListener('wheel', function (evt) {
      if (!state().project || state().activeTab !== 'design') return;
      // Wheel over the drawing zooms, like a CAD viewer; the design panel never scrolls.
      evt.preventDefault();
      var factor = Math.exp(-evt.deltaY * 0.0015);
      zoomAt(evt.clientX, evt.clientY, factor);
    }, { passive: false });

    wrap.addEventListener('pointerdown', function (evt) {
      if (evt.button !== 0) return;
      if (!lastScene) return;
      drag = {
        pointerId: evt.pointerId,
        startX: evt.clientX,
        startY: evt.clientY,
        panX: previewState().panX,
        panY: previewState().panY
      };
      wrap.classList.add('is-panning');
      try { wrap.setPointerCapture(evt.pointerId); } catch (err) { /* ignore */ }
    });
    wrap.addEventListener('pointermove', function (evt) {
      if (!drag || drag.pointerId !== evt.pointerId) return;
      previewState().panX = drag.panX + (evt.clientX - drag.startX);
      previewState().panY = drag.panY + (evt.clientY - drag.startY);
      if (lastPaint) lastPaint();
    });
    function endDrag(evt) {
      if (!drag) return;
      drag = null;
      wrap.classList.remove('is-panning');
      try { wrap.releasePointerCapture(evt.pointerId); } catch (err) { /* ignore */ }
    }
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);

    wrap.addEventListener('dblclick', function () { resetView(); });

    wrap.addEventListener('keydown', function (evt) {
      if (evt.key === '0' || evt.key === 'Home') { evt.preventDefault(); resetView(); }
      else if (evt.key === '+' || evt.key === '=') { evt.preventDefault(); zoomBy(1.25); }
      else if (evt.key === '-') { evt.preventDefault(); zoomBy(1 / 1.25); }
      else if (/^[1-4]$/.test(evt.key)) {
        evt.preventDefault();
        var view = VIEWS[parseInt(evt.key, 10) - 1];
        if (view) setView(view.id);
      }
    });

    if (root.ResizeObserver) {
      resizeObserver = new root.ResizeObserver(function () {
        if (lastPaint) lastPaint();
      });
      resizeObserver.observe(wrap);
    } else {
      root.addEventListener('resize', function () { if (lastPaint) lastPaint(); });
    }
  }

  function zoomAt(clientX, clientY, factor) {
    var wrap = els.wrap;
    var rect = wrap.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    var oldZoom = previewState().zoom;
    var newZoom = Math.max(0.25, Math.min(8, oldZoom * factor));
    if (Math.abs(newZoom - oldZoom) < 0.0001) return;
    var cx = clientX - rect.left;
    var cy = clientY - rect.top;
    var ratio = newZoom / oldZoom;
    var panX = previewState().panX;
    var panY = previewState().panY;
    previewState().panX = cx - w / 2 - (cx - w / 2 - panX) * ratio;
    previewState().panY = cy - h / 2 - (cy - h / 2 - panY) * ratio;
    previewState().zoom = newZoom;
    updateZoomLabel();
    if (lastPaint) lastPaint();
  }

  /* ───────────────────────────── Init ───────────────────────────── */

  function init() {
    if (initialized) return;
    initialized = true;
    els = {
      toolbar: doc.getElementById('preview-toolbar'),
      wrap: doc.getElementById('preview-canvas-wrap'),
      canvas: doc.getElementById('preview-canvas'),
      status: doc.getElementById('preview-status'),
      empty: doc.getElementById('preview-empty'),
      overlay: doc.getElementById('preview-overlay')
    };
    if (!els.wrap || !els.canvas) return;
    buildToolbar();
    bindCanvas();

    var a = CS.ui.app;
    a.on('resolved', function () { requestPaint(true); });
    a.on('select', function () { resetView(false); buildToolbar(); requestPaint(true); });
    a.on('project', function () { resetView(false); buildToolbar(); requestPaint(true); });
    a.on('change', function (payload) {
      if (payload && (payload.source === 'units' || payload.source === 'library' || payload.source === 'project-io')) {
        requestPaint(true);
      }
    });
    a.on('tab', function (payload) {
      if (payload.tab === 'design') requestPaint(true);
    });
    a.on('boot', function () { requestPaint(true); });
  }

  CS.ui.preview = {
    init: init,
    refresh: refresh,
    drawScene: drawScene,
    paint: paint,
    getLastScene: function () { return lastScene; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
