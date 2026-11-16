/* ═══════════════════════════════════════════════════════════════════════════
   Cabinet Studio — UI shell (js/ui/app.js)

   Owns the application state, the tab router, the header, the cabinet rail,
   the live-warnings panel, dialogs, toasts and the re-resolve pipeline.
   Every other UI module registers a renderer for its tab through
   CS.ui.app.registerTab() and reads shared state through CS.ui.app.state.

   Classic script (no modules). Everything hangs off the single CS namespace.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var doc = root.document;

  var TABS = ['design', 'cutlist', 'assembly', 'plans', 'library'];
  var TAB_LABELS = {
    design: 'Design',
    cutlist: 'Cut list',
    assembly: 'Assembly',
    plans: 'Plans & export',
    library: 'Technique library'
  };
  var CABINET_TYPE_LABEL = {
    base: 'Base cabinet',
    wall: 'Wall cabinet',
    tall: 'Tall cabinet',
    pantry: 'Pantry cabinet'
  };
  var CABINET_TAG_PREFIX = { base: 'B', wall: 'W', tall: 'T', pantry: 'P' };
  var SEVERITY_RANK = { error: 0, warning: 1, info: 2 };

  /* ─────────────────────────── State ─────────────────────────── */

  var state = {
    booted: false,
    project: null,
    projectOrigin: 'sample',        // sample | new | file | storage
    designMode: 'guided',            // guided (overview/wizard) | advanced editor
    activeTab: 'design',
    selectedCabinetId: null,
    inspectorMode: 'cabinet',        // cabinet | project
    resolved: null,
    resolveState: 'idle',            // idle | pending | ready | error | unavailable
    resolveError: null,
    resolveWarnings: [],
    dirty: false,
    saveState: 'idle',               // idle | saving | saved | dirty | error
    saveStateText: 'Not saved yet',
    autosavedAt: null,
    preview: { view: 'front', showDims: true, showLabels: true, showPartNumbers: false, zoom: 1 },
    openSections: {},
    warningsCollapsed: false,
    busy: null,
    tabDirty: {},
    lastResolveMs: 0
  };

  var listeners = Object.create(null);
  var tabRenderers = Object.create(null);
  var resolveTimer = null;
  var toastTimers = [];
  var currentModal = null;
  var modalReturnFocus = null;
  var projectMenuOpen = false;

  /* ─────────────────────────── Tiny DOM helpers ─────────────────────────── */

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /**
   * Create an element. props: {className, text, htmlIsSafe:false, attrs:{}, dataset:{},
   * style:{}, on:{click:fn}}. children: node|string|array (strings become text nodes).
   */
  function el(tag, props, children) {
    var node = doc.createElement(tag);
    props = props || {};
    if (props.className) node.className = props.className;
    if (props.id) node.id = props.id;
    if (props.type) node.setAttribute('type', props.type);
    if (props.role) node.setAttribute('role', props.role);
    if (props.title) node.setAttribute('title', props.title);
    if (props.href) node.setAttribute('href', props.href);
    if (props.placeholder) node.setAttribute('placeholder', props.placeholder);
    if (props.disabled !== undefined && props.disabled !== null) node.disabled = !!props.disabled;
    if (props.value !== undefined && props.value !== null) {
      if ('value' in node) node.value = props.value;
      node.setAttribute('value', String(props.value));
    }
    if (props.checked !== undefined) node.checked = !!props.checked;
    if (props.attrs) {
      Object.keys(props.attrs).forEach(function (k) {
        var v = props.attrs[k];
        if (v === null || v === undefined || v === false) return;
        node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    if (props.dataset) {
      Object.keys(props.dataset).forEach(function (k) { node.dataset[k] = String(props.dataset[k]); });
    }
    if (props.style) {
      Object.keys(props.style).forEach(function (k) { node.style[k] = props.style[k]; });
    }
    if (props.on) {
      Object.keys(props.on).forEach(function (evt) { node.addEventListener(evt, props.on[evt]); });
    }
    if (props.text !== undefined && props.text !== null) node.textContent = String(props.text);
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children === undefined || children === null) return node;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) { appendChildren(node, child); return; }
      if (typeof child === 'number' || typeof child === 'boolean') {
        node.appendChild(doc.createTextNode(String(child)));
        return;
      }
      node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
    });
    return node;
  }

  function frag(children) {
    var f = doc.createDocumentFragment();
    appendChildren(f, children);
    return f;
  }

  /**
   * Remove every child. Use the DOM's atomic replaceChildren when available:
   * the old removeChild loop could throw NotFoundError when a blur/change
   * handler (e.g. an inspector field committing on detach) moved a node while
   * the loop was still running.
   */
  function clear(node) {
    if (!node) return node;
    if (typeof node.replaceChildren === 'function') {
      node.replaceChildren();
      return node;
    }
    while (node.firstChild) {
      // Defensive fallback: a re-entrant handler may have moved the child.
      var child = node.firstChild;
      if (child.parentNode !== node) break;
      node.removeChild(child);
    }
    return node;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** Inline icon from the sprite. */
  function icon(name, className) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon' + (className ? ' ' + className : ''));
    svg.setAttribute('aria-hidden', 'true');
    var use = doc.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeCall(fn, fallback) {
    try { return fn(); } catch (err) { return fallback; }
  }

  /**
   * The core util module is exposed as CS.util (with CS.core.util as a
   * compatibility alias in the contract). Use whichever exists.
   */
  function util() {
    return (CS.core && CS.core.util) || CS.util || null;
  }

  /* ─────────────────────────── Formatting (CS.units only) ─────────────────────────── */

  function unit() {
    return (state.project && state.project.units) === 'metric' ? 'metric' : 'imperial';
  }

  function unitLabel() {
    return unit() === 'metric' ? 'mm' : 'in';
  }

  /**
   * Format a millimetre length for display in the project's units.
   * All visible lengths in the UI go through this (or the variants below).
   */
  function fmt(mm, opts) {
    if (mm === null || mm === undefined || isNaN(mm)) return '—';
    var u = CS.core && CS.core.units;
    if (u && typeof u.format === 'function') {
      try { return u.format(mm, unit(), opts || { trim: true }); } catch (err) { /* fall through */ }
    }
    return Math.round(mm * 10) / 10 + ' ' + unitLabel();
  }

  function fmtDim(mm) {
    if (mm === null || mm === undefined || isNaN(mm)) return '—';
    var u = CS.core && CS.core.units;
    if (u && typeof u.formatDim === 'function') {
      try { return u.formatDim(mm, unit()); } catch (err) { /* fall through */ }
    }
    return fmt(mm);
  }

  function fmtShort(mm) {
    if (mm === null || mm === undefined || isNaN(mm)) return '—';
    var u = CS.core && CS.core.units;
    if (u && typeof u.formatLengthShort === 'function') {
      try { return u.formatLengthShort(mm, unit()); } catch (err) { /* fall through */ }
    }
    return fmt(mm);
  }

  function fmtM2(m2) {
    if (m2 === null || m2 === undefined || isNaN(m2)) return '—';
    return (Math.round(m2 * 100) / 100).toFixed(2) + ' m²';
  }

  function fmtPct(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return (Math.round(value * 10) / 10) + '%';
  }

  function fmtCount(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return String(n);
  }

  function parseLength(text) {
    var u = CS.core && CS.core.units;
    if (u && typeof u.parse === 'function') {
      try { return u.parse(text, unit()); } catch (err) { return null; }
    }
    var n = parseFloat(String(text).replace(',', '.'));
    return isNaN(n) ? null : (unit() === 'metric' ? n : n * 25.4);
  }

  function formatDateTime(dateLike) {
    var d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (isNaN(d.getTime())) return '—';
    var u = util();
    if (u && typeof u.formatDate === 'function') {
      try {
        var out = u.formatDate(d);
        if (out) return String(out);
      } catch (err) { /* fall through */ }
    }
    try {
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (err2) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function formatClock(dateLike) {
    var d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      return d.toISOString().slice(11, 16);
    }
  }

  /* ─────────────────────────── Pub / sub ─────────────────────────── */

  function on(event, fn) {
    if (typeof fn !== 'function') return function () {};
    (listeners[event] || (listeners[event] = [])).push(fn);
    return function off() { off(event, fn); };
  }

  function off(event, fn) {
    var list = listeners[event];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  function emit(event, payload) {
    var list = listeners[event];
    if (!list || !list.length) return;
    list.slice().forEach(function (fn) {
      try { fn(payload); }
      catch (err) {
        // A consumer bug must not break the shell; surface it honestly.
        reportError('UI listener for "' + event + '" failed', err);
      }
    });
  }

  function reportError(label, err) {
    // Errors are real failures: keep them visible on the console and to the owner.
    if (root.console && typeof root.console.error === 'function') {
      root.console.error('[Cabinet Studio] ' + label, err);
    }
    if (state.booted) {
      toast(label, { title: 'Something went wrong', type: 'error', detail: err && err.message ? err.message : String(err) });
    }
  }

  /* ─────────────────────────── Toasts ─────────────────────────── */

  function toast(message, opts) {
    opts = opts || {};
    var host = $('#toast-stack');
    if (!host) return;
    var type = opts.type || 'info';
    var iconName = type === 'error' ? 'alert' : type === 'success' ? 'check' : type === 'warning' ? 'alert' : 'info';
    var closeBtn = el('button', {
      className: 'toast-close', type: 'button', attrs: { 'aria-label': 'Dismiss notification' },
      on: { click: function () { dismissToast(node); } }
    }, icon('x'));
    var node = el('div', {
      className: 'toast is-' + type,
      attrs: { role: type === 'error' ? 'alert' : 'status' }
    }, [
      icon(iconName),
      el('div', { className: 'toast-text' }, [
        opts.title ? el('div', { className: 'toast-title', text: opts.title }) : null,
        el('div', { className: message }),
        opts.detail ? el('div', { className: 'toast-detail', text: opts.detail }) : null
      ]),
      closeBtn
    ]);
    function dismissToast(n) {
      if (!n || !n.parentNode) return;
      n.classList.add('is-out');
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 180);
    }
    host.appendChild(node);
    while (host.children.length > 4) host.removeChild(host.firstChild);
    var timeout = opts.timeout !== undefined ? opts.timeout : (type === 'error' ? 8000 : 4500);
    if (timeout > 0) {
      var timer = setTimeout(function () { dismissToast(node); }, timeout);
      toastTimers.push(timer);
      node.addEventListener('mouseenter', function () { clearTimeout(timer); });
    }
    return node;
  }

  /* ─────────────────────────── Modal ─────────────────────────── */

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * Open a modal. Returns {node, body, foot, close}.
   * Only one modal is open at a time; the previous one is closed first.
   */
  function openModal(opts) {
    opts = opts || {};
    var host = $('#modal-host');
    if (!host) return null;
    closeModal(false);

    var head = el('div', { className: 'modal-head' }, [
      el('div', { className: 'modal-head-text' }, [
        el('h2', { className: 'modal-title', text: opts.title || '' }),
        opts.sub ? el('p', { className: 'modal-sub', text: opts.sub }) : null
      ]),
      el('button', {
        className: 'modal-close', type: 'button', attrs: { 'aria-label': 'Close dialog' },
        on: { click: function () { closeModal(true); } }
      }, icon('x'))
    ]);

    var body = el('div', { className: 'modal-body' });
    appendChildren(body, opts.children || opts.body);
    var foot = null;
    if (opts.footer) {
      foot = el('div', { className: 'modal-foot' });
      appendChildren(foot, opts.footer);
    }

    var modal = el('div', {
      className: 'modal' + (opts.size === 'small' ? ' is-small' : opts.size === 'wide' ? ' is-wide' : ''),
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': '' }
    }, [head, body, foot]);

    host.appendChild(modal);
    host.hidden = false;
    modalReturnFocus = doc.activeElement;
    currentModal = { node: modal, host: host, onClose: opts.onClose };

    // Focus the first useful control, else the dialog itself.
    var first = modal.querySelector('input:not([type="hidden"]), select, textarea, button.btn-primary, button.btn-danger, button');
    if (first) {
      try { first.focus(); } catch (err) { /* ignore */ }
    } else {
      modal.setAttribute('tabindex', '-1');
      modal.focus();
    }

    doc.addEventListener('keydown', onModalKeydown, true);
    host.addEventListener('mousedown', onHostMousedown);
    return { node: modal, body: body, foot: foot, close: function (restore) { closeModal(restore !== false); } };
  }

  function onHostMousedown(evt) {
    if (evt.target && evt.target.id === 'modal-host' && currentModal) closeModal(true);
  }

  function onModalKeydown(evt) {
    if (!currentModal) return;
    if (evt.key === 'Escape') {
      evt.preventDefault();
      closeModal(true);
      return;
    }
    if (evt.key !== 'Tab') return;
    var focusables = $$(FOCUSABLE, currentModal.node).filter(function (n) {
      return n.offsetParent !== null || n === doc.activeElement;
    });
    if (!focusables.length) { evt.preventDefault(); return; }
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (evt.shiftKey && doc.activeElement === first) { evt.preventDefault(); last.focus(); }
    else if (!evt.shiftKey && doc.activeElement === last) { evt.preventDefault(); first.focus(); }
  }

  function closeModal(restoreFocus) {
    if (!currentModal) return;
    var modal = currentModal;
    currentModal = null;
    if (modal.node.parentNode) modal.node.parentNode.removeChild(modal.node);
    modal.host.hidden = true;
    doc.removeEventListener('keydown', onModalKeydown, true);
    modal.host.removeEventListener('mousedown', onHostMousedown);
    if (modal.onClose) safeCall(function () { modal.onClose(); });
    if (restoreFocus !== false && modalReturnFocus && modalReturnFocus.focus) {
      try { modalReturnFocus.focus(); } catch (err) { /* ignore */ }
    }
    modalReturnFocus = null;
  }

  function isModalOpen() { return !!currentModal; }

  /** Promise-based confirmation dialog. */
  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      var cancelBtn = el('button', {
        className: 'btn btn-secondary', type: 'button', text: opts.cancelLabel || 'Cancel',
        on: { click: function () { finish(false); closeModal(true); } }
      });
      var okBtn = el('button', {
        className: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'), type: 'button',
        text: opts.confirmLabel || 'Continue',
        on: { click: function () { finish(true); closeModal(true); } }
      });
      openModal({
        title: opts.title || 'Are you sure?',
        size: 'small',
        sub: opts.sub,
        children: [
          opts.danger ? el('div', { className: 'row-10' }, [
            el('span', { className: 'confirm-icon' }, icon('alert')),
            el('div', { className: 'danger-text', text: opts.message || '' })
          ]) : el('p', { style: { margin: '0 0 2px', color: 'var(--ink-2)', lineHeight: '1.55' }, text: opts.message || '' }),
          opts.note ? el('p', { className: 'field-hint', style: { marginTop: '9px' }, text: opts.note }) : null
        ],
        footer: [
          el('span', { className: 'foot-note', text: opts.footNote || '' }),
          cancelBtn, okBtn
        ],
        onClose: function () { finish(false); }
      });
    });
  }

  /* ─────────────────────────── Module readiness helpers ─────────────────────────── */

  /** Resolve a dotted path against the CS global (safe). */
  function resolvePath(path) {
    var parts = path.split('.');
    var cursor = path.charAt(0) === 'C' ? root : root;
    for (var i = 0; i < parts.length; i++) {
      if (cursor === null || cursor === undefined) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  /** Check a list of dotted API paths; returns {ok, missing:[path...]}. */
  function requireFeature(paths) {
    var missing = [];
    (Array.isArray(paths) ? paths : [paths]).forEach(function (path) {
      var value = resolveFeature(path);
      if (value === undefined || value === null || value === false) missing.push(path);
    });
    return { ok: missing.length === 0, missing: missing };
  }

  var FEATURE_FILES = {
    'CS.units.format': 'js/core/units.js',
    'CS.units.parse': 'js/core/units.js',
    'CS.util.escapeHtml': 'js/core/util.js',
    'CS.core.project.createDefaultProject': 'js/core/project.js',
    'CS.core.project.serialize': 'js/core/project.js',
    'CS.data.techniques': 'js/data/techniques.js',
    'CS.engine.resolveProject': 'js/engine/index.js',
    'CS.engine.resolveCabinet': 'js/engine/index.js',
    'CS.draw.render.render': 'js/draw/render.js',
    'CS.draw.canvas.createBackend': 'js/draw/canvas.js',
    'CS.draw.views.cabinetFront': 'js/draw/views.js',
    'CS.export.exports.buildPdf': 'js/export/exports.js',
    'CS.export.exports.buildDxf': 'js/export/exports.js',
    'CS.export.exports.buildDwg': 'js/export/exports.js'
  };

  /** Resolve a dotted path against the CS global or the CS.util namespace. */
  function resolveFeature(path) {
    if (path.indexOf('CS.util.') === 0) {
      var t = util();
      return t ? resolvePathOn(t, path.slice('CS.util.'.length).split('.')) : undefined;
    }
    return resolvePath(path);
  }

  function resolvePathOn(obj, parts) {
    var cursor = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cursor === null || cursor === undefined) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  function filesForMissing(missing) {
    var files = [];
    (missing || []).forEach(function (path) {
      var file = FEATURE_FILES[path];
      if (file && files.indexOf(file) < 0) files.push(file);
    });
    return files;
  }

  /** A consistent, calm "this module has not loaded yet" block. */
  function moduleNote(opts) {
    opts = opts || {};
    var files = opts.files || filesForMissing(opts.missing || []);
    var wrap = el('div', { className: 'module-note' + (opts.variant === 'error' ? ' is-error' : '') }, [
      icon(opts.variant === 'error' ? 'alert' : 'info'),
      el('div', { className: 'grow' }, [
        el('div', { className: 'module-note-title', text: opts.title || 'Module not loaded' }),
        el('p', { className: 'module-note-text', text: opts.message || 'This part of Cabinet Studio is still being built. The rest of the app keeps working.' }),
        files.length ? el('ul', { className: 'module-note-list' }, files.map(function (file) {
          return el('li', { className: 'module-note-text' }, el('code', { text: file }));
        })) : null,
        opts.actions ? el('div', { className: 'module-note-actions' }, opts.actions) : null
      ])
    ]);
    return wrap;
  }

  function emptyState(opts) {
    opts = opts || {};
    return el('div', { className: 'empty' }, [
      el('div', { className: 'empty-icon' }, icon(opts.icon || 'box')),
      el('div', { className: 'empty-title', text: opts.title || 'Nothing here yet' }),
      opts.text ? el('p', { className: 'empty-text', text: opts.text }) : null,
      opts.actions ? el('div', { className: 'empty-actions' }, opts.actions) : null
    ]);
  }

  /* ─────────────────────────── Units helpers for field suffixes ─────────────────────────── */

  function unitSuffix() { return unitLabel(); }

  /* ─────────────────────────── Boot ─────────────────────────── */

  var REQUIRED_APIS = [
    'CS.units.format',
    'CS.units.parse',
    'CS.units.formatLengthShort',
    'CS.util.escapeHtml',
    'CS.util.downloadBlob',
    'CS.core.project.createDefaultProject',
    'CS.core.project.serialize',
    'CS.core.project.deserialize'
  ];

  // Only these files are fatal if the browser failed to load them. Missing
  // engine/draw/export modules degrade gracefully (the app shows honest
  // "module not loaded" states instead of a blank page).
  var FATAL_FILES = {
    'js/core/units.js': true,
    'js/core/util.js': true,
    'js/core/project.js': true,
    'js/ui/app.js': true,
    'js/ui/inspector.js': true,
    'js/ui/preview.js': true,
    'js/ui/tables.js': true,
    'js/ui/library.js': true,
    'js/ui/project-io.js': true
  };

  /** Check that the app can boot at all. Returns {ok, missing, files}. */
  function bootAudit() {
    var missing = [];
    var loadErrors = Array.isArray(root.__csLoadErrors) ? root.__csLoadErrors : [];
    loadErrors.forEach(function (file) {
      if (FATAL_FILES[file] && missing.indexOf(file) < 0) missing.push(file);
    });
    REQUIRED_APIS.forEach(function (path) {
      var value = resolveFeature(path);
      if (!value) {
        var file = FEATURE_FILES[path] || null;
        if (file && missing.indexOf(file) < 0) missing.push(file);
        else if (missing.indexOf(path) < 0) missing.push(path);
      }
    });
    var uiModules = ['app', 'inspector', 'preview', 'tables', 'library', 'guided', 'projectIO'];
    uiModules.forEach(function (name) {
      if (!CS.ui || !CS.ui[name] || typeof CS.ui[name].init !== 'function') {
        var file = 'js/ui/' + (name === 'projectIO' ? 'project-io' : name) + '.js';
        if (missing.indexOf(file) < 0) missing.push(file);
      }
    });
    return { ok: missing.length === 0, missing: missing };
  }

  /** Show a clear failure state on the boot screen instead of a blank page. */
  function showBootFailure(missing, detail) {
    var boot = $('#boot');
    var status = $('#boot-status');
    var errorBox = $('#boot-error');
    if (!boot || !errorBox) return;
    boot.classList.remove('is-hidden');
    if (status) status.hidden = true;
    errorBox.hidden = false;
    clear(errorBox);
    errorBox.appendChild(el('h3', { text: 'Cabinet Studio could not start' }));
    if (detail) errorBox.appendChild(el('p', { text: detail }));
    if (missing && missing.length) {
      errorBox.appendChild(el('p', { text: 'These files or modules did not load:' }));
      errorBox.appendChild(el('ul', null, missing.map(function (item) {
        return el('li', null, el('code', { text: item }));
      })));
    }
    errorBox.appendChild(el('p', {
      style: { marginTop: '8px', color: 'inherit' },
      text: 'Every file must stay next to cabinet-studio.html. Reload after fixing the folder.'
    }));
    errorBox.appendChild(el('button', {
      className: 'btn btn-primary', type: 'button', text: 'Reload',
      on: { click: function () { root.location.reload(); } }
    }));
  }

  /* ─────────────────────────── Project helpers ─────────────────────────── */

  function normalizeProject(project) {
    if (!project) return null;
    var coreProject = CS.core && CS.core.project;
    if (coreProject && typeof coreProject.normalizeProject === 'function') {
      try {
        var result = coreProject.normalizeProject(project);
        if (result && result.project) {
          state.resolveWarnings = result.warnings || [];
          return result.project;
        }
        if (result && result.cabinets) return result;
      } catch (err) {
        reportError('Could not normalise the project', err);
      }
    }
    // Minimal structural guards so the UI never renders garbage.
    if (!Array.isArray(project.cabinets)) project.cabinets = [];
    if (!project.settings || typeof project.settings !== 'object') project.settings = {};
    if (!project.units) project.units = 'imperial';
    if (!project.name) project.name = 'Cabinet project';
    return project;
  }

  function getSelectedCabinet() {
    if (!state.project) return null;
    var cabinets = state.project.cabinets || [];
    for (var i = 0; i < cabinets.length; i++) {
      if (cabinets[i].id === state.selectedCabinetId) return cabinets[i];
    }
    return null;
  }

  function getSelectedModel() {
    if (!state.resolved || !Array.isArray(state.resolved.cabinets)) return null;
    for (var i = 0; i < state.resolved.cabinets.length; i++) {
      var model = state.resolved.cabinets[i];
      var cfg = model && model.config ? model.config : model;
      if (cfg && cfg.id === state.selectedCabinetId) return model;
    }
    return null;
  }

  function getSelectedConfig() {
    var cab = getSelectedCabinet();
    return cab;
  }

  function uidFor(prefix, list) {
    var existing = (list || []).map(function (item) { return typeof item === 'string' ? item : item && item.id; }).filter(Boolean);
    var t = util();
    if (t && typeof t.uid === 'function') {
      try { return t.uid(prefix, existing); } catch (err) { /* fall through */ }
    }
    var n = existing.length + 1;
    while (existing.indexOf(prefix + '-' + n) >= 0) n++;
    return prefix + '-' + n;
  }

  function uniqueTag(type) {
    var core = CS.core && CS.core.project;
    if (core && typeof core.nextTag === 'function' && state.project) {
      try { return core.nextTag(state.project, type); } catch (err) { /* fall through */ }
    }
    var prefix = CABINET_TAG_PREFIX[type] || 'C';
    var used = Object.create(null);
    (state.project && state.project.cabinets || []).forEach(function (cab) {
      if (cab && cab.tag) used[String(cab.tag)] = true;
    });
    var max = 0;
    Object.keys(used).forEach(function (tag) {
      var m = tag.match(new RegExp('^' + prefix + '(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var next = max + 1;
    while (used[prefix + next]) next++;
    return prefix + next;
  }

  function suggestDims(type) {
    var engine = CS.engine || {};
    if (typeof engine.suggestCabinetDimensions === 'function') {
      try {
        var dims = engine.suggestCabinetDimensions(type);
        if (dims && isFinite(dims.width) && isFinite(dims.height) && isFinite(dims.depth)) return dims;
      } catch (err) { /* fall through */ }
    }
    var standards = CS.data && CS.data.techniques && CS.data.techniques.standards;
    var table = standards && standards.dims && standards.dims[type];
    if (table && isFinite(table.height) && isFinite(table.depth)) {
      return {
        width: 762,
        height: table.height,
        depth: table.depth
      };
    }
    // Contract §12 defaults (mm), used only while the engine is unavailable.
    if (type === 'wall') return { width: 762, height: 762, depth: 304.8 };
    if (type === 'tall') return { width: 609.6, height: 2133.6, depth: 609.6 };
    if (type === 'pantry') return { width: 609.6, height: 2133.6, depth: 609.6 };
    return { width: 762, height: 876.3, depth: 609.6 };
  }

  /**
   * Build a full cabinet config (schema v1) for a new cabinet.
   * If the engine exposes an applyDefaults/create helper we use it, so the UI
   * always writes the same full objects the engine resolves. The literal
   * fallback below is the contract §4 shape with §12 defaults.
   */
  function buildCabinetConfig(type) {
    var project = state.project || {};
    var settings = project.settings || {};
    var dims = suggestDims(type);
    var isWall = type === 'wall';
    var cfg = {
      id: '',
      tag: '',
      name: CABINET_TYPE_LABEL[type] || 'Cabinet',
      type: type,
      width: dims.width,
      height: dims.height,
      depth: dims.depth,
      construction: {
        system: 'frameless',
        carcassMaterial: settings.defaultCarcassMaterial || 'ply-birch-18',
        carcassThickness: 18,
        joinery: 'confirmat',
        backStyle: 'rabbet',
        backMaterial: 'ply-birch-6',
        backThickness: 6,
        backRecess: 12,
        dadoDepth: 6,
        shelfSystem: 'adjustable-pins-32',
        shelfPinDiameter: 5,
        shelfPinSpacing: 32,
        shelfPinFrontSetback: 37,
        edgeBanding: settings.edgeBanding || 'pvc-0.5'
      },
      faceFrame: {
        material: settings.defaultFaceFrameMaterial || 'hardwood-poplar',
        thickness: 19,
        stileWidth: 57.15,
        topRailWidth: 57.15,
        bottomRailWidth: 57.15,
        midRailWidth: 57.15,
        joinery: 'pocket-screw'
      },
      toeKick: {
        style: isWall ? 'none' : 'separate-platform',
        height: 101.6,
        setback: 76.2,
        material: 'ply-birch-18',
        finishedFace: true
      },
      interior: {
        adjustableShelves: 1,
        fixedShelves: isWall ? 1 : 1,
        shelfThickness: 18,
        shelfMaterial: 'ply-birch-18',
        shelfFrontSetback: 10,
        shelfEdgeband: 'pvc-2',
        dividers: 0
      },
      front: {
        type: 'doors',
        reveal: 3,
        doors: {
          count: 2, style: 'shaker',
          material: settings.defaultDoorMaterial || 'hardwood-maple',
          thickness: 19, overlay: 'full',
          stileWidth: 57.15, railWidth: 57.15,
          doorJoinery: 'cope-stick',
          panelMaterial: 'ply-birch-6', panelThickness: 6.35,
          panelStyle: 'recessed',
          glassThickness: 3, beadSpacing: 57.15, muntins: 0,
          hingeType: 'euro-cup', hingeCount: 'auto', hingeSide: 'auto'
        },
        drawers: {
          count: 3, style: 'slab',
          material: settings.defaultDrawerMaterial || 'hardwood-maple',
          thickness: 19, heights: null,
          boxMaterial: settings.defaultDrawerMaterial || 'ply-birch-12',
          boxJoinery: 'dovetail',
          boxSideThickness: 12.7, boxBottomThickness: 6.35,
          boxBottomJoinery: 'dado', boxHeightAllowance: 25,
          slide: 'undermount', slideLength: null,
          boxWidthClearance: null, boxDepthClearance: null
        },
        combined: { drawerHeight: 177.8, doorsBelow: 2 }
      },
      hardware: {
        pull: { id: 'bar-128', finish: 'brushed nickel', placement: 'auto' },
        softClose: true,
        doorBumpers: true,
        shelfPins: true,
        hangingRail: !isWall ? false : true
      },
      finish: { id: settings.defaultFinish || 'paint', color: '#f2ede3', sheen: 'satin' },
      notes: ''
    };
    if (type === 'wall') {
      cfg.front.doors.count = 2;
      cfg.front.doors.hingeSide = 'auto';
    }
    if (type === 'tall' || type === 'pantry') {
      cfg.front.type = 'doors';
      cfg.front.doors.count = 2;
    }

    // Prefer the engine's own defaults pipeline when it exists.
    var defaults = CS.engine && CS.engine.defaults;
    if (defaults) {
      var candidate = null;
      try {
        if (typeof defaults.applyDefaults === 'function') {
          var applied = defaults.applyDefaults(cfg);
          candidate = applied && applied.construction ? applied : cfg;
        } else if (typeof defaults.createCabinet === 'function') {
          candidate = defaults.createCabinet(type);
        } else if (typeof defaults.cabinet === 'function') {
          candidate = defaults.cabinet(type);
        } else if (typeof defaults.defaultCabinet === 'function') {
          candidate = defaults.defaultCabinet(type);
        }
      } catch (err) { candidate = null; }
      if (candidate && typeof candidate === 'object' && candidate.construction) {
        // Keep the identity/type fields the UI chose.
        candidate.id = candidate.id || '';
        candidate.type = type;
        candidate.width = isFinite(candidate.width) ? candidate.width : dims.width;
        candidate.height = isFinite(candidate.height) ? candidate.height : dims.height;
        candidate.depth = isFinite(candidate.depth) ? candidate.depth : dims.depth;
        return candidate;
      }
    }
    return cfg;
  }

  /** Add a new cabinet of the given type to the project (optional field overrides). */
  function addCabinet(type, overrides) {
    if (!state.project) return null;
    type = CABINET_TYPE_LABEL[type] ? type : 'base';
    var cfg = null;
    var core = CS.core && CS.core.project;
    mutate(function (project) {
      if (core && typeof core.addCabinet === 'function') {
        cfg = core.addCabinet(project, type, overrides || {});
      } else {
        cfg = buildCabinetConfig(type);
        cfg.id = uidFor('cab', project.cabinets);
        cfg.tag = uniqueTag(type);
        project.cabinets.push(cfg);
      }
      if (cfg && !(overrides && overrides.__skipProjectDefaults)) applyProjectDefaults(cfg);
    }, { source: 'cabinet', structural: true, reason: 'add' });
    if (!cfg) return null;
    selectCabinet(cfg.id, { skipResolve: true });
    renderRail({ focusId: cfg.id });
    toast((cfg.tag || '') + ' ' + (cfg.name || 'cabinet') + ' added', {
      title: 'Cabinet added', type: 'success', timeout: 2600
    });
    return cfg;
  }

  /** Apply the project's shop defaults to a freshly created cabinet. */
  function applyProjectDefaults(cabinet) {
    if (!cabinet) return;
    var settings = (state.project && state.project.settings) || {};
    try {
      if (!cabinet.construction) cabinet.construction = {};
      if (settings.defaultCarcassMaterial) cabinet.construction.carcassMaterial = settings.defaultCarcassMaterial;
      if (settings.edgeBanding) cabinet.construction.edgeBanding = settings.edgeBanding;
      if (!cabinet.faceFrame) cabinet.faceFrame = {};
      if (settings.defaultFaceFrameMaterial) cabinet.faceFrame.material = settings.defaultFaceFrameMaterial;
      if (!cabinet.front) cabinet.front = {};
      if (!cabinet.front.doors) cabinet.front.doors = {};
      if (settings.defaultDoorMaterial) cabinet.front.doors.material = settings.defaultDoorMaterial;
      if (!cabinet.front.drawers) cabinet.front.drawers = {};
      if (settings.defaultDrawerMaterial) {
        cabinet.front.drawers.material = settings.defaultDoorMaterial || cabinet.front.drawers.material;
        cabinet.front.drawers.boxMaterial = settings.defaultDrawerMaterial;
      }
      if (!cabinet.finish) cabinet.finish = {};
      if (settings.defaultFinish) cabinet.finish.id = settings.defaultFinish;
    } catch (err) {
      // Non-fatal: defaults are a convenience, not a requirement.
      safeCall(function () { /* ignore */ });
    }
  }

  /** Deep clone through the core util module (JSON fallback keeps the UI safe). */
  function deepClone(value) {
    var t = util();
    if (t && typeof t.deepClone === 'function') {
      try { return t.deepClone(value); } catch (err) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  /** Add a complete cabinet config (already resolved from presets) to the project. */
  function addCabinetFromConfig(config) {
    if (!state.project || !config) return null;
    var added = null;
    mutate(function (project) {
      var cfg = deepClone(config);
      if (!cfg.id) cfg.id = uidFor('cab', project.cabinets);
      if (!cfg.tag) cfg.tag = uniqueTag(cfg.type);
      project.cabinets.push(cfg);
      added = cfg;
    }, { source: 'cabinet', structural: true, reason: 'add-config' });
    if (!added) return null;
    selectCabinet(added.id, { skipResolve: true });
    renderRail({ focusId: added.id });
    return added;
  }

  /** Replace an existing cabinet with a complete config, keeping its id. */
  function replaceCabinetFromConfig(config) {
    if (!state.project || !config || !config.id) return null;
    var updated = null;
    mutate(function (project) {
      for (var i = 0; i < project.cabinets.length; i++) {
        if (project.cabinets[i].id === config.id) {
          var cfg = deepClone(config);
          project.cabinets[i] = cfg;
          updated = cfg;
          break;
        }
      }
    }, { source: 'cabinet', structural: true, reason: 'replace-config' });
    return updated;
  }

  function duplicateSelectedCabinet() {
    var cabinet = getSelectedCabinet();
    if (!cabinet) return;
    var copy = null;
    var core = CS.core && CS.core.project;
    mutate(function (project) {
      if (core && typeof core.duplicateCabinet === 'function') {
        copy = core.duplicateCabinet(project, cabinet.id);
      } else {
        var clone = deepClone(cabinet);
        var idx = project.cabinets.indexOf(cabinet);
        clone.id = uidFor('cab', project.cabinets);
        clone.tag = uniqueTag(cabinet.type);
        clone.name = (cabinet.name || CABINET_TYPE_LABEL[cabinet.type] || 'Cabinet') + ' copy';
        project.cabinets.splice(idx + 1, 0, clone);
        copy = clone;
      }
    }, { source: 'cabinet', structural: true, reason: 'duplicate' });
    if (!copy) return;
    selectCabinet(copy.id, { skipResolve: true });
    renderRail({ focusId: copy.id });
    toast('Duplicated as ' + (copy.tag || 'cabinet'), {
      title: 'Cabinet duplicated', type: 'success', timeout: 2600
    });
  }

  function deleteSelectedCabinet() {
    var cabinet = getSelectedCabinet();
    if (!cabinet || !state.project) return;
    var cabinetCount = (state.project.cabinets || []).length;
    if (cabinetCount <= 1) {
      toast('A project needs at least one cabinet. Add another cabinet first, or start a new project.', {
        title: 'Keep one cabinet', type: 'warning', timeout: 6000
      });
      return;
    }
    confirm({
      title: 'Delete ' + (cabinet.tag || 'cabinet') + '?',
      message: '“' + (cabinet.name || CABINET_TYPE_LABEL[cabinet.type] || 'Cabinet') + '” and all of its parts, machining and assembly steps will be removed from this project.',
      note: 'The project in your browser is updated immediately. Save a JSON copy first if you might want it back.',
      confirmLabel: 'Delete cabinet',
      danger: true
    }).then(function (confirmed) {
      if (!confirmed || !state.project) return;
      var idx = state.project.cabinets.indexOf(cabinet);
      var core = CS.core && CS.core.project;
      mutate(function (project) {
        if (core && typeof core.removeCabinet === 'function') {
          core.removeCabinet(project, cabinet.id);
        } else {
          var i = project.cabinets.indexOf(cabinet);
          project.cabinets.splice(i, 1);
        }
      }, { source: 'cabinet', structural: true, reason: 'delete' });
      var remaining = state.project.cabinets;
      var next = remaining[Math.max(0, Math.min(idx, remaining.length - 1))];
      selectCabinet(next ? next.id : null, { skipResolve: true });
      renderRail({ focusId: next ? next.id : null });
      toast((cabinet.tag || 'Cabinet') + ' deleted', { title: 'Cabinet deleted', type: 'info', timeout: 3200 });
    });
  }

  function moveSelectedCabinet(delta) {
    var cabinet = getSelectedCabinet();
    if (!cabinet || !state.project) return;
    var cabinets = state.project.cabinets;
    var idx = cabinets.indexOf(cabinet);
    var target = idx + delta;
    if (target < 0 || target >= cabinets.length) return;
    mutate(function (project) {
      var cabs = project.cabinets;
      var from = cabs.indexOf(cabinet);
      var to = from + delta;
      var moved = cabs.splice(from, 1)[0];
      cabs.splice(to, 0, moved);
    }, { source: 'cabinet', structural: true, reason: 'reorder' });
    renderRail({ focusId: cabinet.id, moveFocus: delta < 0 ? 'up' : 'down' });
    scheduleResolve(0);
  }

  /**
   * Apply an in-place mutation to the project. `mutator(project)` may return
   * false to abort. Marks the project dirty, emits change, re-resolves.
   */
  function mutate(mutator, opts) {
    opts = opts || {};
    if (!state.project) return false;
    var before = null;
    try {
      before = JSON.stringify(state.project);
    } catch (err) { before = null; }
    var result;
    try {
      result = mutator(state.project);
    } catch (err) {
      reportError('Could not apply the change', err);
      return false;
    }
    if (result === false) return false;
    var after = null;
    try { after = JSON.stringify(state.project); } catch (err2) { after = null; }
    if (before !== null && after !== null && before === after) return false;
    state.dirty = true;
    setSaveState('dirty', 'Unsaved');
    var payload = {
      source: opts.source || 'unknown',
      structural: !!opts.structural,
      cabinetId: opts.cabinetId !== undefined ? opts.cabinetId : state.selectedCabinetId,
      reason: opts.reason || ''
    };
    emit('change', payload);
    updateProjectIdentity();
    renderStatus();
    if (payload.structural) {
      renderTabCounts();
      renderRail();
    }
    scheduleResolve(opts.immediateResolve ? 0 : undefined);
    return true;
  }

  /* ─────────────────────────── Re-resolve pipeline ─────────────────────────── */

  function scheduleResolve(delay) {
    if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
    var engine = CS.engine;
    if (!engine || typeof engine.resolveProject !== 'function') {
      state.resolveState = 'unavailable';
      state.resolved = null;
      renderStatus();
      emit('resolved', { resolved: null, state: 'unavailable' });
      renderWarnings();
      renderTabCounts();
      markTabDirty('design');
      return;
    }
    if (state.resolveState === 'ready') state.resolveState = 'pending';
    renderStatus();
    if (state.activeTab === 'design' && state.resolved) {
      var overlay = $('#preview-overlay');
      if (overlay) overlay.hidden = false;
    }
    var wait = delay === undefined ? 140 : delay;
    resolveTimer = setTimeout(function () {
      resolveTimer = null;
      resolveNow();
    }, wait);
  }

  function resolveNow() {
    var engine = CS.engine;
    if (!state.project) return;
    if (!engine || typeof engine.resolveProject !== 'function') {
      state.resolveState = 'unavailable';
      state.resolved = null;
      state.resolveError = null;
      renderStatus();
      emit('resolved', { resolved: null, state: 'unavailable' });
      renderWarnings();
      return;
    }
    var started = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
    var resolved = null;
    var error = null;
    try {
      resolved = engine.resolveProject(state.project);
    } catch (err) {
      error = err;
    }
    var ended = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
    state.lastResolveMs = Math.round(ended - started);
    if (error) {
      state.resolveState = 'error';
      state.resolveError = error;
      state.resolved = null;
      reportError('The cabinet engine could not resolve this project', error);
    } else {
      state.resolveState = 'ready';
      state.resolveError = null;
      state.resolved = resolved && resolved.project ? resolved : resolved;
      state.resolved = state.resolved || null;
    }
    var overlay = $('#preview-overlay');
    if (overlay) overlay.hidden = true;
    renderStatus();
    renderWarnings();
    renderRail();
    renderTabCounts();
    updateProjectIdentity();
    emit('resolved', {
      resolved: state.resolved,
      state: state.resolveState,
      error: state.resolveError
    });
    if (state.activeTab !== 'design') {
      state.tabDirty[state.activeTab] = true;
      renderTab(state.activeTab);
    } else {
      state.tabDirty.design = false;
    }
  }

  /* ─────────────────────────── Project loading / saving ─────────────────────────── */

  function setProject(project, opts) {
    opts = opts || {};
    if (!project) return;
    var wasEmpty = !(project.cabinets && project.cabinets.length);
    var normalized = normalizeProject(deepClone(project));
    if (wasEmpty) normalized.cabinets = [];
    state.project = normalized;
    state.projectOrigin = opts.origin || state.projectOrigin || 'file';
    state.dirty = !!opts.dirty;
    state.lastExports = {};
    if (wasEmpty) {
      state.selectedCabinetId = null;
    } else if (opts.selectId && cabinetById(normalized, opts.selectId)) {
      state.selectedCabinetId = opts.selectId;
    } else if (!cabinetById(normalized, state.selectedCabinetId)) {
      state.selectedCabinetId = normalized.cabinets && normalized.cabinets.length ? normalized.cabinets[0].id : null;
    }
    state.inspectorMode = state.selectedCabinetId ? 'cabinet' : 'project';
    state.resolved = null;
    state.resolveState = 'idle';
    state.preview.zoom = 1;
    state.openSections = {};
    if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
    emit('project', { project: state.project, origin: state.projectOrigin });
    updateProjectIdentity();
    renderHeader();
    renderRail({ focusId: state.selectedCabinetId });
    renderWarnings();
    renderTabCounts();
    if (CS.ui.inspector && CS.ui.inspector.render) CS.ui.inspector.render({ rebuild: true });
    if (CS.ui.preview && CS.ui.preview.refresh) CS.ui.preview.refresh({ force: true });
    if (state.activeTab !== 'design') renderTab(state.activeTab, { force: true });
    scheduleResolve(0);
    setSaveState(state.dirty ? 'dirty' : 'saved', state.dirty ? 'Unsaved' : 'Saved');
    if (wasEmpty) {
      // Empty project (new, restored or opened from JSON): set up the space in
      // the wizard. project.space is honoured by the Step 1 defaults.
      switchTab('design');
      if (CS.ui.guided && typeof CS.ui.guided.startNewProject === 'function') {
        CS.ui.guided.startNewProject();
      }
    }
  }

  function cabinetById(project, id) {
    if (!project || !Array.isArray(project.cabinets) || !id) return null;
    for (var i = 0; i < project.cabinets.length; i++) {
      if (project.cabinets[i].id === id) return project.cabinets[i];
    }
    return null;
  }

  function setUnits(nextUnit) {
    if (!state.project || (nextUnit !== 'imperial' && nextUnit !== 'metric')) return;
    if (state.project.units === nextUnit) return;
    mutate(function (project) {
      project.units = nextUnit;
    }, { source: 'units', structural: false, reason: 'units', immediateResolve: false });
    // Units only change display; skip a full re-resolve, refresh the display modules.
    if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
    state.resolveState = state.resolved ? 'ready' : state.resolveState;
    renderHeader();
    renderRail();
    renderWarnings();
    renderTabCounts();
    if (CS.ui.inspector && CS.ui.inspector.render) CS.ui.inspector.render({ rebuild: true });
    if (CS.ui.preview && CS.ui.preview.refresh) CS.ui.preview.refresh({ force: true });
    if (state.activeTab !== 'design') renderTab(state.activeTab, { force: true });
    renderStatus();
  }

  function selectCabinet(id, opts) {
    opts = opts || {};
    if (state.selectedCabinetId === id && !opts.force) {
      if (!opts.skipResolve && !state.resolved) scheduleResolve(0);
      return;
    }
    state.selectedCabinetId = id;
    state.inspectorMode = id ? 'cabinet' : 'project';
    renderHeader();
    renderRail({ focusId: id });
    emit('select', { cabinetId: id });
    if (CS.ui.inspector && CS.ui.inspector.render) CS.ui.inspector.render({ rebuild: true });
    if (CS.ui.preview && CS.ui.preview.refresh) CS.ui.preview.refresh({ force: true });
    renderWarnings();
    if (state.activeTab === 'assembly') renderTab('assembly', { force: true });
    if (!opts.skipResolve && !state.resolved) scheduleResolve(0);
  }

  function setSaveState(kind, text) {
    state.saveState = kind;
    state.saveStateText = text || (kind === 'saved' ? 'Saved' : kind === 'saving' ? 'Saving…' : kind === 'error' ? 'Not saved' : 'Unsaved');
    var node = $('#save-state');
    var label = $('#save-state-text');
    if (node) {
      node.dataset.state = kind;
      var titleMap = {
        saved: 'Saved in this browser · click Save for a JSON copy',
        saving: 'Saving in this browser…',
        dirty: 'Changes not yet saved in this browser',
        error: 'Autosave failed — save a JSON copy',
        idle: 'Projects are saved in this browser automatically'
      };
      node.title = titleMap[kind] || titleMap.idle;
    }
    if (label) label.textContent = state.saveStateText;
  }

  /* ─────────────────────────── Design mode (guided / advanced) ─────────────────────────── */

  /**
   * Switch the Design tab between the guided flow (run overview + wizard) and
   * the full three-pane Advanced editor. Both DOMs stay in the page; only one
   * is visible at a time and the panel carries data-design-mode for tests.
   */
  function setDesignMode(mode, opts) {
    opts = opts || {};
    mode = mode === 'advanced' ? 'advanced' : 'guided';
    if (!opts.force && state.designMode === mode) {
      if (mode === 'guided' && CS.ui.guided && CS.ui.guided.render) CS.ui.guided.render();
      return;
    }
    state.designMode = mode;
    syncDesignModeDom();
    if (mode === 'advanced') {
      if (CS.ui.inspector && CS.ui.inspector.render) {
        try { CS.ui.inspector.render({ rebuild: true }); } catch (err) { reportError('The advanced inspector could not render', err); }
      }
      renderRail();
      renderWarnings();
      if (CS.ui.preview && CS.ui.preview.refresh) {
        var refresh = function () { CS.ui.preview.refresh({ force: true }); };
        if (root.requestAnimationFrame) root.requestAnimationFrame(refresh);
        else setTimeout(refresh, 20);
      }
    } else if (CS.ui.guided && typeof CS.ui.guided.render === 'function') {
      CS.ui.guided.render();
    }
    renderStatus();
    emit('designMode', { mode: mode });
  }

  /** Toggle the guided / advanced DOM without rendering content. */
  function syncDesignModeDom() {
    var guidedRoot = doc.getElementById('guided-root');
    var grid = doc.getElementById('design-grid');
    var advancedBar = doc.getElementById('advanced-bar');
    var panel = doc.getElementById('panel-design');
    var advanced = state.designMode === 'advanced';
    if (guidedRoot) guidedRoot.hidden = advanced;
    if (grid) grid.hidden = !advanced;
    if (advancedBar) advancedBar.hidden = !advanced;
    if (panel) panel.setAttribute('data-design-mode', advanced ? 'advanced' : 'guided');
  }

  /* ─────────────────────────── Render: header + status ─────────────────────────── */

  function updateProjectIdentity() {
    if (!state.project) return;
    var nameNode = $('#project-name');
    var metaNode = $('#project-meta');
    var count = (state.project.cabinets || []).length;
    var originLabel = {
      sample: 'Sample project',
      new: 'New project',
      file: 'Opened from file',
      storage: 'Restored from this browser'
    }[state.projectOrigin] || 'Project';
    if (nameNode) nameNode.textContent = state.project.name || 'Cabinet project';
    if (metaNode) {
      metaNode.textContent = count + (count === 1 ? ' cabinet' : ' cabinets') + (state.projectOrigin === 'sample' ? ' · sample' : '');
    }
    var title = (state.project.name || 'Cabinet project') + ' — Cabinet Studio';
    if (doc.title !== title) doc.title = title;
  }

  function renderHeader() {
    updateProjectIdentity();
    renderSaveState();
    renderUnits();
    renderTabCounts();
    renderStatus();
    renderRailFoot();
  }

  function renderSaveState() {
    var node = $('#save-state');
    if (node) node.dataset.state = state.saveState || 'idle';
    var text = $('#save-state-text');
    if (text) text.textContent = state.saveStateText || 'Saved';
    var titleMap = {
      saved: 'Saved in this browser · use Save for a JSON copy',
      saving: 'Saving in this browser…',
      dirty: 'Changes not yet saved in this browser',
      error: 'Autosave failed — save a JSON copy',
      idle: 'Projects are saved in this browser automatically'
    };
    if (node) node.title = titleMap[state.saveState] || titleMap.idle;
  }

  function renderUnits() {
    var current = unit();
    $$('.units-btn').forEach(function (btn) {
      var pressed = btn.dataset.units === current;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
  }

  function renderTabCounts() {
    var cabinets = (state.project && state.project.cabinets) || [];
    setTabCount('design', cabinets.length);
    var resolved = state.resolved;
    if (resolved && resolved.cutList && resolved.cutList.totals) {
      setTabCount('cutlist', resolved.cutList.totals.sheetCount || 0);
    } else {
      setTabCount('cutlist', null);
    }
    var model = getSelectedModel();
    var steps = model && Array.isArray(model.assembly) ? model.assembly.length : 0;
    setTabCount('assembly', steps || null);
  }

  function setTabCount(tab, value) {
    var node = $('#tab-count-' + tab);
    if (!node) return;
    if (value === null || value === undefined || value === 0) {
      node.textContent = '';
      node.classList.remove('has-value');
    } else {
      node.textContent = String(value);
      node.classList.add('has-value');
    }
  }

  function countWarnings() {
    var counts = { error: 0, warning: 0, info: 0 };
    var warnings = state.resolved && Array.isArray(state.resolved.warnings) ? state.resolved.warnings : [];
    warnings.forEach(function (w) {
      if (counts[w.severity] !== undefined) counts[w.severity]++;
    });
    return counts;
  }

  function renderStatus() {
    var host = $('#tabbar-status');
    if (!host) return;
    if (state.designMode === 'guided' && state.activeTab === 'design') {
      host.hidden = true;
      clear(host);
      return;
    }
    host.hidden = false;
    clear(host);
    host.className = 'tabbar-status';
    var counts = countWarnings();
    var cabinets = (state.project && state.project.cabinets || []).length;
    if (state.busy) {
      host.classList.add('is-busy');
      host.appendChild(el('span', { className: 'spinner', style: { width: '12px', height: '12px' } }, icon('spinner')));
      host.appendChild(el('span', { text: state.busy }));
      return;
    }
    if (state.resolveState === 'error') {
      host.classList.add('is-error');
      host.appendChild(icon('alert'));
      host.appendChild(el('span', { text: 'Engine error — the drawings could not be resolved' }));
      return;
    }
    if (state.resolveState === 'unavailable') {
      host.appendChild(icon('alert'));
      host.appendChild(el('span', { text: 'Engine module not loaded — previews are unavailable' }));
      return;
    }
    if (state.resolveState === 'pending' || state.resolveState === 'idle') {
      host.classList.add('is-busy');
      host.appendChild(el('span', { className: 'spinner', style: { width: '12px', height: '12px' } }, icon('spinner')));
      host.appendChild(el('span', { text: 'Resolving parts and machining…' }));
      return;
    }
    if (counts.error > 0) {
      host.classList.add('is-error');
      host.appendChild(icon('alert'));
      host.appendChild(el('span', {
        text: counts.error + (counts.error === 1 ? ' error' : ' errors') + ' · ' + cabinets + ' cabinets'
      }));
      return;
    }
    host.appendChild(icon('check'));
    var txt = cabinets + (cabinets === 1 ? ' cabinet' : ' cabinets');
    if (state.resolved && state.resolved.stats) {
      var s = state.resolved.stats;
      if (isFinite(s.partCount)) txt += ' · ' + s.partCount + ' parts';
      if (isFinite(s.sheetCount)) txt += ' · ' + s.sheetCount + (s.sheetCount === 1 ? ' sheet' : ' sheets');
    }
    if (counts.warning > 0) txt += ' · ' + counts.warning + (counts.warning === 1 ? ' warning' : ' warnings');
    host.appendChild(el('span', { text: txt }));
  }

  function setBusy(label) {
    state.busy = label ? String(label) : null;
    renderStatus();
    var btn = $('#btn-export-shortcut');
    if (btn) btn.disabled = !!label;
  }

  function clearBusy() {
    state.busy = null;
    renderStatus();
    var btn = $('#btn-export-shortcut');
    if (btn) btn.disabled = false;
  }

  /* ─────────────────────────── Render: cabinet rail ─────────────────────────── */

  function renderRail(opts) {
    opts = opts || {};
    var host = $('#cabinet-list');
    if (!host) return;
    var active = doc.activeElement;
    var hadFocusInside = host.contains(active);
    clear(host);
    var cabinets = (state.project && state.project.cabinets) || [];
    var countNode = $('#rail-count');
    if (countNode) countNode.textContent = String(cabinets.length);

    if (!cabinets.length) {
      host.appendChild(el('div', { className: 'rail-empty' }, [
        el('strong', { text: 'No cabinets yet' }),
        el('span', { text: 'Add a base, wall or tall cabinet to start designing.' })
      ]));
    } else {
      cabinets.forEach(function (cabinet, index) {
        host.appendChild(renderCabinetCard(cabinet, index, cabinets.length));
      });
    }
    renderRailFoot();

    if (hadFocusInside) {
      var target = null;
      if (opts.focusId) {
        target = host.querySelector('[data-cabinet-id="' + cssEscape(opts.focusId) + '"] .cabinet-select-overlay');
      }
      if (opts.moveFocus === 'up') {
        var selectedCard = host.querySelector('.cabinet-card.is-selected');
        var prev = selectedCard && selectedCard.previousElementSibling;
        target = prev ? prev.querySelector('.cabinet-select-overlay') : null;
      } else if (opts.moveFocus === 'down') {
        var selCard = host.querySelector('.cabinet-card.is-selected');
        var nextCard = selCard && selCard.nextElementSibling;
        target = nextCard ? nextCard.querySelector('.cabinet-select-overlay') : null;
      }
      if (!target && opts.focusId) {
        target = host.querySelector('[data-cabinet-id="' + cssEscape(opts.focusId) + '"] .cabinet-select-overlay');
      }
      if (target) {
        try { target.focus(); } catch (err) { /* ignore */ }
      } else if (active && active.classList && active.classList.contains('cabinet-select-overlay')) {
        var fallback = host.querySelector('.cabinet-card.is-selected .cabinet-select-overlay') || host.querySelector('.cabinet-select-overlay');
        if (fallback) try { fallback.focus(); } catch (err2) { /* ignore */ }
      }
    }
  }

  function cssEscape(value) {
    if (root.CSS && typeof root.CSS.escape === 'function') return root.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function renderCabinetCard(cabinet, index, total) {
    var model = null;
    if (state.resolved && Array.isArray(state.resolved.cabinets)) {
      for (var i = 0; i < state.resolved.cabinets.length; i++) {
        var m = state.resolved.cabinets[i];
        var cfg = m && m.config ? m.config : m;
        if (cfg && cfg.id === cabinet.id) { model = m; break; }
      }
    }
    var dims = '';
    try {
      dims = fmtShort(cabinet.width) + ' \u00d7 ' + fmtShort(cabinet.height) + ' \u00d7 ' + fmtShort(cabinet.depth);
      // Metric short formatting omits the unit; make the row unambiguous once.
      if (unit() === 'metric') dims += ' ' + unitLabel();
    } catch (err) { dims = ''; }
    if (model && model.frontLayout) {
      var doors = (model.frontLayout.doors || []).length;
      var drawers = (model.frontLayout.drawerFronts || []).length;
      var frontBits = [];
      if (doors) frontBits.push(doors + (doors === 1 ? ' door' : ' doors'));
      if (drawers) frontBits.push(drawers + (drawers === 1 ? ' drawer' : ' drawers'));
      if (frontBits.length) dims += ' \u00b7 ' + frontBits.join(' + ');
    }
    var warnings = model && Array.isArray(model.warnings) ? model.warnings : [];
    var errors = warnings.filter(function (w) { return w.severity === 'error'; }).length;
    var warns = warnings.length - errors;
    var badge = null;
    if (errors > 0) badge = el('span', { className: 'cabinet-warn is-error', title: errors + ' error' + (errors === 1 ? '' : 's'), text: String(errors) });
    else if (warns > 0) badge = el('span', { className: 'cabinet-warn', title: warns + ' warning' + (warns === 1 ? '' : 's'), text: String(warns) });

    var typeLetter = (cabinet.type || 'base').charAt(0).toUpperCase();
    var isSelected = cabinet.id === state.selectedCabinetId;
    var card = el('div', {
      className: 'cabinet-card' + (isSelected ? ' is-selected' : ''),
      role: 'listitem',
      dataset: { cabinetId: cabinet.id }
    });

    // The overlay button covers the card so the whole row is one accessible
    // target; the action buttons sit above it in their own layer.
    var selectOverlay = el('button', {
      className: 'cabinet-select-overlay',
      type: 'button',
      attrs: {
        'aria-pressed': isSelected ? 'true' : 'false',
        'aria-label': 'Select ' + (cabinet.tag || 'cabinet') + ': ' + (cabinet.name || CABINET_TYPE_LABEL[cabinet.type] || 'Cabinet')
      },
      on: { click: function () { selectCabinet(cabinet.id); } }
    });

    appendChildren(card, [
      el('span', { className: 'cabinet-type', text: typeLetter, attrs: { title: CABINET_TYPE_LABEL[cabinet.type] || 'Cabinet' } }),
      el('span', { className: 'cabinet-main' }, [
        el('span', { className: 'cabinet-row1' }, [
          el('span', { className: 'cabinet-name', text: cabinet.name || CABINET_TYPE_LABEL[cabinet.type] || 'Cabinet' }),
          el('span', { className: 'cabinet-tag', text: cabinet.tag || '\u2014' })
        ]),
        el('span', { className: 'cabinet-dims', text: dims })
      ]),
      el('span', { className: 'cabinet-aside' }, badge),
      selectOverlay,
      el('div', { className: 'cabinet-actions' }, [
        el('button', {
          className: 'btn btn-quiet', type: 'button', title: 'Duplicate cabinet',
          attrs: { 'aria-label': 'Duplicate ' + (cabinet.tag || 'cabinet') },
          on: { click: function (evt) { evt.stopPropagation(); selectCabinet(cabinet.id, { skipResolve: true }); duplicateSelectedCabinet(); } }
        }, icon('copy')),
        el('button', {
          className: 'btn btn-quiet', type: 'button', title: 'Move up',
          attrs: { 'aria-label': 'Move ' + (cabinet.tag || 'cabinet') + ' up', disabled: index === 0 },
          on: { click: function (evt) { evt.stopPropagation(); selectCabinet(cabinet.id, { skipResolve: true }); moveSelectedCabinet(-1); } }
        }, icon('up')),
        el('button', {
          className: 'btn btn-quiet', type: 'button', title: 'Move down',
          attrs: { 'aria-label': 'Move ' + (cabinet.tag || 'cabinet') + ' down', disabled: index === total - 1 },
          on: { click: function (evt) { evt.stopPropagation(); selectCabinet(cabinet.id, { skipResolve: true }); moveSelectedCabinet(1); } }
        }, icon('down')),
        el('button', {
          className: 'btn btn-quiet', type: 'button', title: 'Delete cabinet',
          attrs: { 'aria-label': 'Delete ' + (cabinet.tag || 'cabinet') },
          on: { click: function (evt) { evt.stopPropagation(); selectCabinet(cabinet.id, { skipResolve: true }); deleteSelectedCabinet(); } }
        }, icon('trash'))
      ])
    ]);
    return card;
  }

  function renderRailFoot() {
    var host = $('#rail-foot');
    if (!host) return;
    clear(host);
    host.appendChild(el('button', {
      className: 'btn btn-quiet', type: 'button',
      on: { click: function () { if (CS.ui.inspector && CS.ui.inspector.openProjectEditor) CS.ui.inspector.openProjectEditor(); } }
    }, [icon('sliders'), el('span', { text: 'Project details' })]));
    var note = state.projectOrigin === 'sample'
      ? 'Sample kitchen — edit anything, then save your own project.'
      : 'Autosaved in this browser. Use Save for a portable JSON copy.';
    host.appendChild(el('div', { className: 'rail-foot-note', text: note }));
  }

  /* ─────────────────────────── Render: warnings panel ─────────────────────────── */

  function renderWarnings() {
    var host = $('#warnings-panel');
    if (!host) return;
    clear(host);
    var counts = countWarnings();
    var warnings = state.resolved && Array.isArray(state.resolved.warnings) ? state.resolved.warnings : [];
    // Selected cabinet first, then project-level, then the rest.
    var selectedId = state.selectedCabinetId;
    var ordered = warnings.slice().sort(function (a, b) {
      var sa = (SEVERITY_RANK[a.severity] !== undefined ? SEVERITY_RANK[a.severity] : 3);
      var sb = (SEVERITY_RANK[b.severity] !== undefined ? SEVERITY_RANK[b.severity] : 3);
      if (sa !== sb) return sa - sb;
      var aSel = a.cabinetId === selectedId ? 0 : (a.cabinetId ? 1 : 2);
      var bSel = b.cabinetId === selectedId ? 0 : (b.cabinetId ? 1 : 2);
      return aSel - bSel;
    });
    var isCollapsed = state.warningsCollapsed && warnings.length > 0;
    host.classList.toggle('is-empty', warnings.length === 0);
    host.classList.toggle('is-collapsed', isCollapsed);

    var head = el('button', {
      className: 'warnings-head', type: 'button',
      attrs: { 'aria-expanded': isCollapsed ? 'false' : 'true' },
      on: {
        click: function () {
          state.warningsCollapsed = !state.warningsCollapsed;
          renderWarnings();
        }
      }
    }, [
      icon(warnings.length ? 'alert' : 'check'),
      el('span', { className: 'warnings-title', text: 'Checks' }),
      el('span', { className: 'warnings-counts' }, warnings.length ? [
        counts.error ? el('span', { className: 'count-chip is-error', text: counts.error + ' error' + (counts.error === 1 ? '' : 's') }) : null,
        counts.warning ? el('span', { className: 'count-chip is-warning', text: counts.warning + ' warning' + (counts.warning === 1 ? '' : 's') }) : null,
        counts.info ? el('span', { className: 'count-chip is-info', text: counts.info }) : null
      ] : [
        el('span', { className: 'count-chip is-ok', text: 'All clear' })
      ]),
      icon('chevron-down', 'warnings-head-chevron')
    ]);
    host.appendChild(head);

    if (!warnings.length) {
      var emptyText;
      if (state.resolveState === 'unavailable') {
        emptyText = 'The engine module has not loaded, so checks cannot run yet.';
        host.appendChild(el('div', { className: 'warnings-empty' }, [
          icon('info'),
          el('span', null, [el('strong', { text: 'Checks unavailable. ' }), el('small', { text: emptyText })])
        ]));
        return;
      }
      if (state.resolveState === 'pending' || state.resolveState === 'idle') {
        host.appendChild(el('div', { className: 'warnings-empty' }, [
          icon('info'),
          el('span', null, [el('strong', { text: 'Checking the design…' })])
        ]));
        return;
      }
      if (state.resolveState === 'error') {
        host.appendChild(el('div', { className: 'warnings-empty' }, [
          icon('alert'),
          el('span', null, [el('strong', { text: 'Could not run checks. ' }), el('small', { text: 'The engine reported an error — see the console for the detail.' })])
        ]));
        return;
      }
      host.appendChild(el('div', { className: 'warnings-empty' }, [
        icon('check'),
        el('span', null, [
          el('strong', { text: 'No issues found. ' }),
          el('small', { text: 'Dimensions, reveals, slides and shelf spans check out.' })
        ])
      ]));
      return;
    }

    var list = el('div', { className: 'warnings-list' });
    ordered.forEach(function (warning) {
      var sev = warning.severity || 'warning';
      var item = el('div', { className: 'warning-item is-' + sev }, [
        icon(sev === 'error' ? 'alert' : sev === 'info' ? 'info' : 'alert'),
        el('div', { className: 'warning-main' }, [
          el('div', { className: 'warning-title', text: warning.title || 'Check this' }),
          el('div', { className: 'warning-message', text: warning.message || '' }),
          warning.fix ? el('div', { className: 'warning-fix', text: warning.fix }) : null
        ]),
        el('div', { className: 'warning-side' }, [
          warning.cabinetTag ? el('span', { className: 'warning-tag', text: warning.cabinetTag }) : null,
          warning.cabinetId && warning.cabinetId !== state.selectedCabinetId
            ? el('button', {
              className: 'warning-jump', type: 'button', text: 'Go to ' + (warning.cabinetTag || 'cabinet'),
              on: { click: function () { switchTab('design'); selectCabinet(warning.cabinetId); } }
            })
            : null
        ])
      ]);
      list.appendChild(item);
    });
    host.appendChild(list);
  }

  /* ─────────────────────────── Tabs / router ─────────────────────────── */

  function registerTab(tab, renderFn) {
    if (TABS.indexOf(tab) < 0 || typeof renderFn !== 'function') return;
    tabRenderers[tab] = renderFn;
  }

  function activateTab(tab) {
    if (TABS.indexOf(tab) < 0) tab = 'design';
    if (state.activeTab === tab && state.booted) {
      // Re-clicking the active tab re-renders it (useful if a module was late).
      renderTab(tab, { force: true });
      return;
    }
    state.activeTab = tab;
    $$('.tab').forEach(function (node) {
      var isActive = node.dataset.tab === tab;
      node.classList.toggle('is-active', isActive);
      node.setAttribute('aria-selected', isActive ? 'true' : 'false');
      node.tabIndex = isActive ? 0 : -1;
    });
    $$('.tab-panel').forEach(function (panel) {
      var isActive = panel.dataset.panel === tab;
      panel.hidden = !isActive;
      panel.classList.toggle('is-active', isActive);
    });
    emit('tab', { tab: tab });
    renderTab(tab);
    if (tab === 'design' && state.designMode === 'advanced' && CS.ui.preview && CS.ui.preview.refresh) {
      var pv = function () { CS.ui.preview.refresh({ force: true }); };
      if (root.requestAnimationFrame) root.requestAnimationFrame(pv);
      else setTimeout(pv, 20);
    }
    renderStatus();
  }

  function switchTab(tab, opts) {
    if (TABS.indexOf(tab) < 0) return;
    if (!state.booted) { state.activeTab = tab; return; }
    if (root.location && root.location.hash !== '#' + tab) {
      // Prefer the hash so a reload lands on the same tab.
      try { root.location.hash = '#' + tab; } catch (err) { activateTab(tab); }
      if (state.activeTab !== tab) activateTab(tab);
    } else {
      activateTab(tab);
    }
    if (opts && opts.focusPanel) {
      var panel = doc.getElementById('panel-' + tab);
      if (panel) {
        var heading = panel.querySelector('.page-title, .rail-title');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          try { heading.focus({ preventScroll: true }); } catch (err2) { /* ignore */ }
        }
      }
    }
  }

  function renderTab(tab, opts) {
    opts = opts || {};
    var renderer = tabRenderers[tab];
    var panel = doc.getElementById('panel-' + tab);
    if (!panel) return;
    if (!renderer) {
      // A module that owns this tab has not registered (not loaded yet).
      var body = panel.querySelector('.page-body') || panel.querySelector('.design-center');
      if (tab === 'design') return;
      if (!body) return;
      clear(body);
      body.appendChild(moduleNote({
        title: TAB_LABELS[tab] + ' is not ready yet',
        message: 'The UI module that renders this tab has not loaded. The rest of the app keeps working.',
        files: ['js/ui/' + (tab === 'cutlist' || tab === 'assembly' ? 'tables' : tab === 'plans' ? 'project-io' : tab) + '.js']
      }));
      return;
    }
    try {
      renderer({ force: !!opts.force, tab: tab, state: state });
      state.tabDirty[tab] = false;
    } catch (err) {
      reportError('The ' + TAB_LABELS[tab] + ' tab could not render', err);
      var bodyEl = panel.querySelector('.page-body') || panel.querySelector('.design-center');
      if (bodyEl && tab !== 'design') {
        clear(bodyEl);
        bodyEl.appendChild(moduleNote({
          variant: 'error',
          title: 'This tab could not render',
          message: (err && err.message) || 'An unexpected error occurred while building this view. Your project data is intact.',
          files: [],
          actions: [el('button', {
            className: 'btn btn-secondary btn-sm', type: 'button', text: 'Try again',
            on: { click: function () { renderTab(tab, { force: true }); } }
          })]
        }));
      }
    }
  }

  function markTabDirty(tab) { state.tabDirty[tab] = true; }

  function setupTabs() {
    $$('.tab').forEach(function (node) {
      node.addEventListener('click', function (evt) {
        var tab = node.dataset.tab;
        if (TABS.indexOf(tab) < 0) return;
        // Let the anchor set the hash naturally, then make sure the panel matches.
        evt.preventDefault();
        switchTab(tab, { focusPanel: false });
      });
      node.addEventListener('keydown', function (evt) {
        var idx = TABS.indexOf(node.dataset.tab);
        var next = null;
        if (evt.key === 'ArrowRight') next = (idx + 1) % TABS.length;
        else if (evt.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
        else if (evt.key === 'Home') next = 0;
        else if (evt.key === 'End') next = TABS.length - 1;
        if (next === null) return;
        evt.preventDefault();
        var target = $$('.tab')[next];
        if (target) {
          switchTab(target.dataset.tab);
          target.focus();
        }
      });
      node.addEventListener('auxclick', function (evt) { if (evt.button === 1) evt.preventDefault(); });
    });

    // The brand link goes to Design without adding a stray history entry.
    var brand = $('.brand');
    if (brand) {
      brand.addEventListener('click', function (evt) {
        if (state.booted) { evt.preventDefault(); switchTab('design'); }
      });
    }
  }

  /* ─────────────────────────── Header interactions ─────────────────────────── */

  function setupHeader() {
    var unitsWrap = $('.units-switch');
    if (unitsWrap) {
      unitsWrap.addEventListener('click', function (evt) {
        var btn = evt.target.closest('.units-btn');
        if (!btn) return;
        setUnits(btn.dataset.units);
      });
    }

    var saveBtn = $('#btn-save');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      if (CS.ui.projectIO && CS.ui.projectIO.saveJsonDownload) CS.ui.projectIO.saveJsonDownload();
    });
    var openBtn = $('#btn-open');
    if (openBtn) openBtn.addEventListener('click', function () {
      if (CS.ui.projectIO && CS.ui.projectIO.openFile) CS.ui.projectIO.openFile();
    });
    var newBtn = $('#btn-new');
    if (newBtn) newBtn.addEventListener('click', function () {
      if (CS.ui.projectIO && CS.ui.projectIO.newProject) CS.ui.projectIO.newProject();
    });
    var exportBtn = $('#btn-export-shortcut');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      switchTab('plans');
    });
    var backGuided = $('#back-to-guided');
    if (backGuided) backGuided.addEventListener('click', function () {
      if (CS.ui.guided && typeof CS.ui.guided.resumeFromAdvanced === 'function') {
        CS.ui.guided.resumeFromAdvanced();
      } else {
        setDesignMode('guided');
        if (CS.ui.guided && CS.ui.guided.showOverview) CS.ui.guided.showOverview();
      }
    });

    var trigger = $('#project-trigger');
    if (trigger) {
      trigger.addEventListener('click', function (evt) {
        evt.stopPropagation();
        toggleProjectMenu();
      });
    }
    var menu = $('#project-menu');
    if (menu) {
      menu.addEventListener('click', function (evt) {
        var btn = evt.target.closest('[data-project-action]');
        if (!btn) return;
        var action = btn.dataset.projectAction;
        closeProjectMenu();
        if (action === 'details') {
          if (CS.ui.inspector && CS.ui.inspector.openProjectEditor) CS.ui.inspector.openProjectEditor();
        } else if (action === 'new') {
          if (CS.ui.projectIO && CS.ui.projectIO.newProject) CS.ui.projectIO.newProject();
        } else if (action === 'sample') {
          if (CS.ui.projectIO && CS.ui.projectIO.sampleProject) CS.ui.projectIO.sampleProject();
        } else if (action === 'open') {
          if (CS.ui.projectIO && CS.ui.projectIO.openFile) CS.ui.projectIO.openFile();
        } else if (action === 'save') {
          if (CS.ui.projectIO && CS.ui.projectIO.saveJsonDownload) CS.ui.projectIO.saveJsonDownload();
        } else if (action === 'about') {
          openAbout();
        }
      });
    }
    doc.addEventListener('click', function (evt) {
      if (!projectMenuOpen) return;
      if (menu && (menu.contains(evt.target) || (trigger && trigger.contains(evt.target)))) return;
      closeProjectMenu();
    });
  }

  function toggleProjectMenu() {
    var menu = $('#project-menu');
    var trigger = $('#project-trigger');
    if (!menu || !trigger) return;
    projectMenuOpen = !projectMenuOpen;
    menu.hidden = !projectMenuOpen;
    trigger.setAttribute('aria-expanded', projectMenuOpen ? 'true' : 'false');
    if (projectMenuOpen) {
      var first = menu.querySelector('.menu-item');
      if (first) try { first.focus(); } catch (err) { /* ignore */ }
    }
  }

  function closeProjectMenu() {
    var menu = $('#project-menu');
    var trigger = $('#project-trigger');
    projectMenuOpen = false;
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function openAbout() {
    var body = el('div', { className: 'about-licence' });
    body.appendChild(el('p', { text: 'Cabinet Studio' }));
    body.appendChild(el('p', { text: 'Copyright \u00a9 2026 VengefulOtter.' }));
    body.appendChild(el('p', { text: 'This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3 only.' }));
    body.appendChild(el('p', { text: 'This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.' }));
    body.appendChild(el('p', { text: 'You should have received a copy of the GNU General Public License along with this program. If not, see https://www.gnu.org/licenses/.' }));
    body.appendChild(el('p', { text: 'The complete source is the files in this folder. Third-party components and their licences are listed in THIRD_PARTY_NOTICES.md; jsPDF and nasjidwg are MIT-licensed, and the PDF MD5 helper is a clean-room replacement.' }));
    openModal({
      title: 'About & licence',
      sub: 'GPL-3.0-only',
      size: 'small',
      body: body,
      footer: [el('button', { className: 'btn btn-secondary', type: 'button', on: { click: function () { closeModal(true); } } }, 'Close')]
    });
  }

  function setupRail() {
    var addBase = $('#btn-add-base');
    if (addBase) addBase.addEventListener('click', function () { addCabinet('base'); });
    var addWall = $('#btn-add-wall');
    if (addWall) addWall.addEventListener('click', function () { addCabinet('wall'); });
    var addTall = $('#btn-add-tall');
    if (addTall) addTall.addEventListener('click', function () { addCabinet('tall'); });
  }

  /* ─────────────────────────── Keyboard shortcuts ─────────────────────────── */

  function setupKeyboard() {
    doc.addEventListener('keydown', function (evt) {
      var mod = evt.metaKey || evt.ctrlKey;
      if (!mod) {
        if (evt.key === 'Escape') {
          if (projectMenuOpen) { closeProjectMenu(); return; }
        }
        return;
      }
      if (evt.key.toLowerCase() === 's') {
        // Ctrl/Cmd+S saves a JSON copy (the browser autosave is separate).
        evt.preventDefault();
        if (CS.ui.projectIO && CS.ui.projectIO.saveJsonDownload) CS.ui.projectIO.saveJsonDownload();
      } else if (evt.key.toLowerCase() === 'e' && !evt.shiftKey) {
        evt.preventDefault();
        switchTab('plans');
      }
    });
  }

  /* ─────────────────────────── Boot ─────────────────────────── */

  function init() {
    if (state.booted) return true;
    var audit = bootAudit();
    if (!audit.ok) {
      showBootFailure(audit.missing);
      return false;
    }
    var loadErrors = root.__csLoadErrors || [];
    // Load the initial project (localStorage → sample → empty project).
    var project = null;
    var origin = 'sample';
    try {
      if (CS.ui.projectIO && typeof CS.ui.projectIO.loadInitialProject === 'function') {
        var loaded = CS.ui.projectIO.loadInitialProject();
        if (loaded && loaded.project) { project = loaded.project; origin = loaded.origin || 'storage'; }
      }
    } catch (err) {
      reportError('The saved project could not be read', err);
    }
    if (!project) {
      try {
        if (typeof CS.core.project.createSampleProject === 'function') {
          project = CS.core.project.createSampleProject();
          origin = 'sample';
        } else {
          project = CS.core.project.createDefaultProject();
          origin = 'new';
        }
      } catch (err) {
        showBootFailure(loadErrors, 'The project factory failed: ' + (err && err.message ? err.message : String(err)));
        return false;
      }
    }
    if (!project) {
      showBootFailure(loadErrors, 'No project could be created. js/core/project.js may be incomplete.');
      return false;
    }

    var initialEmpty = !(project.cabinets && project.cabinets.length);
    state.project = normalizeProject(deepClone(project));
    if (initialEmpty) state.project.cabinets = [];
    state.projectOrigin = origin;
    var cabinets = state.project.cabinets || [];
    state.selectedCabinetId = cabinets.length ? cabinets[0].id : null;
    var initialTab = readTabFromHash();
    state.activeTab = null;

    setupTabs();
    setupHeader();
    setupRail();
    setupKeyboard();
    setupGlobalErrorTrap();
    setupBeforeUnload();

    // Sub-modules (each loaded after app.js by cabinet-studio.html).
    initModule('inspector');
    initModule('preview');
    initModule('tables');
    initModule('library');
    initModule('guided');
    initModule('projectIO');

    state.booted = true;
    // Be honest about persistence: a restored project is saved; a fresh
    // sample/new project has not been written to the browser yet.
    if (origin === 'storage' || origin === 'file') setSaveState('saved', 'Saved');
    else setSaveState('idle', 'Not saved yet');
    renderHeader();
    renderRail({ focusId: state.selectedCabinetId });
    renderWarnings();
    renderStatus();
    updateProjectIdentity();
    if (CS.ui.inspector && CS.ui.inspector.render) CS.ui.inspector.render({ rebuild: true });
    activateTab(initialTab);
    if (CS.ui.preview && CS.ui.preview.refresh) CS.ui.preview.refresh({ force: true });
    syncDesignModeDom();
    if (CS.ui.guided && typeof CS.ui.guided.render === 'function') CS.ui.guided.render();
    if (initialEmpty) {
      // An explicitly empty project is restored/opened straight into the
      // guided wizard at Step 1 — never a phantom seeded cabinet.
      activateTab('design');
      if (CS.ui.guided && typeof CS.ui.guided.startNewProject === 'function') {
        CS.ui.guided.startNewProject();
      }
    }
    scheduleResolve(0);
    emit('boot', { project: state.project });
    return true;
  }

  function initModule(name) {
    var mod = CS.ui && CS.ui[name];
    if (mod && typeof mod.init === 'function') {
      try { mod.init(); }
      catch (err) { reportError('The ' + name + ' UI module failed to start', err); }
    }
  }

  function readTabFromHash() {
    var hash = (root.location && root.location.hash || '').replace(/^#/, '');
    return TABS.indexOf(hash) >= 0 ? hash : 'design';
  }

  function setupGlobalErrorTrap() {
    root.addEventListener('error', function (evt) {
      if (!state.booted) return;
      var msg = evt && evt.message ? evt.message : 'Unknown error';
      // Errors are real: keep them on the console, and tell the owner.
      if (root.console && typeof root.console.error === 'function') {
        root.console.error('[Cabinet Studio] Uncaught error:', evt.error || msg);
      }
      toast('An unexpected error occurred. Your project data is still safe in this browser.', {
        title: 'Something went wrong', type: 'error', detail: msg, timeout: 8000
      });
    });
    root.addEventListener('unhandledrejection', function (evt) {
      if (!state.booted) return;
      var reason = evt && evt.reason ? evt.reason : 'Unknown rejection';
      if (root.console && typeof root.console.error === 'function') {
        root.console.error('[Cabinet Studio] Unhandled promise rejection:', reason);
      }
      toast('An unexpected error occurred. Save a JSON copy if you are mid-edit.', {
        title: 'Something went wrong', type: 'error',
        detail: reason && reason.message ? reason.message : String(reason), timeout: 8000
      });
    });
    root.addEventListener('hashchange', function () {
      if (!state.booted) return;
      var tab = readTabFromHash();
      if (tab !== state.activeTab) activateTab(tab);
    });
  }

  function setupBeforeUnload() {
    root.addEventListener('beforeunload', function (evt) {
      if (state.saveState === 'dirty' || state.saveState === 'error') {
        evt.preventDefault();
        evt.returnValue = '';
        return '';
      }
    });
  }

  /* ─────────────────────────── Public API ─────────────────────────── */

  CS.ui = CS.ui || {};
  CS.ui.app = {
    state: state,
    TABS: TABS,
    TAB_LABELS: TAB_LABELS,
    CABINET_TYPE_LABEL: CABINET_TYPE_LABEL,
    init: init,
    bootAudit: bootAudit,
    showBootFailure: showBootFailure,
    on: on,
    off: off,
    emit: emit,
    toast: toast,
    confirm: confirm,
    openModal: openModal,
    closeModal: closeModal,
    isModalOpen: isModalOpen,
    el: el,
    frag: frag,
    clear: clear,
    icon: icon,
    esc: esc,
    appendChildren: appendChildren,
    requireFeature: requireFeature,
    filesForMissing: filesForMissing,
    moduleNote: moduleNote,
    emptyState: emptyState,
    formatDateTime: formatDateTime,
    formatClock: formatClock,
    // formatting wrappers (always through CS.units)
    fmt: fmt,
    fmtDim: fmtDim,
    fmtShort: fmtShort,
    fmtM2: fmtM2,
    fmtPct: fmtPct,
    fmtCount: fmtCount,
    parseLength: parseLength,
    unit: unit,
    unitLabel: unitLabel,
    unitSuffix: unitSuffix,
    // project mutations
    mutate: mutate,
    setProject: setProject,
    normalizeProject: normalizeProject,
    selectCabinet: selectCabinet,
    getSelectedCabinet: getSelectedCabinet,
    getSelectedConfig: getSelectedConfig,
    getSelectedModel: getSelectedModel,
    addCabinet: addCabinet,
    duplicateSelectedCabinet: duplicateSelectedCabinet,
    deleteSelectedCabinet: deleteSelectedCabinet,
    moveSelectedCabinet: moveSelectedCabinet,
    buildCabinetConfig: buildCabinetConfig,
    uniqueTag: uniqueTag,
    uidFor: uidFor,
    deepClone: deepClone,
    // design mode + guided integration
    setDesignMode: setDesignMode,
    syncDesignModeDom: syncDesignModeDom,
    addCabinetFromConfig: addCabinetFromConfig,
    replaceCabinetFromConfig: replaceCabinetFromConfig,
    // rendering
    registerTab: registerTab,
    switchTab: switchTab,
    activateTab: activateTab,
    renderTab: renderTab,
    markTabDirty: markTabDirty,
    renderHeader: renderHeader,
    renderRail: renderRail,
    renderRailFoot: renderRailFoot,
    renderWarnings: renderWarnings,
    renderStatus: renderStatus,
    renderTabCounts: renderTabCounts,
    updateProjectIdentity: updateProjectIdentity,
    setSaveState: setSaveState,
    setBusy: setBusy,
    clearBusy: clearBusy,
    scheduleResolve: scheduleResolve,
    resolveNow: resolveNow,
    setUnits: setUnits,
    countWarnings: countWarnings,
    cabinetById: cabinetById,
    reportError: reportError,
    safeCall: safeCall,
    cssEscape: cssEscape
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
