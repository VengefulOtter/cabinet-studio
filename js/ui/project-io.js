/* ═══════════════════════════════════════════════════════════════════════════
   Cabinet Studio — Project I/O and export flow (js/ui/project-io.js)

   · localStorage autosave (key cabinetStudio.project.v1)
   · save / open project JSON files, new project, sample kitchen
   · the Plans & export tab: plan-set options, PDF/DXF/DWG generation through
     CS.export.exports (the only export API the UI is allowed to call).

   Everything runs locally; downloads are Blobs + anchor clicks, so this works
   from file:// in every current browser.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var doc = root.document;

  var AUTOSAVE_KEY = 'cabinetStudio.project.v1';
  var initialized = false;
  var autosaveTimer = null;
  var storageOk = true;
  var storageWarningShown = false;
  var lastExports = { pdf: null, dxf: null, dwg: null };
  var busyKind = null;
  var localOptions = {
    includeCutList: true,
    includeSchedules: true,
    includeCover: true,
    includeNotes: true,
    componentScope: 'all',
    dxfVersion: 'r2000'
  };

  var PAGE_LABEL = { letter: 'Letter', tabloid: 'Tabloid', a4: 'A4', a3: 'A3' };
  var PAGE_DIMS = {
    letter: '8½ × 11 in', tabloid: '11 × 17 in', a4: '210 × 297 mm', a3: '297 × 420 mm'
  };
  var DWG_LABEL = { r2000: 'R2000', r2018: 'R2018', r12: 'R12' };

  function app() { return CS.ui.app; }
  function el(tag, props, children) { return CS.ui.app.el(tag, props, children); }
  function icon(name, cls) { return CS.ui.app.icon(name, cls); }
  function clear(node) { return CS.ui.app.clear(node); }
  function state() { return CS.ui.app.state; }

  /* ───────────────────────────── Small helpers ───────────────────────────── */

  function util() {
    return (CS.core && CS.core.util) || CS.util || null;
  }

  function slugify(text) {
    var u = util();
    if (u && typeof u.slug === 'function') {
      try {
        var s = u.slug(text);
        if (s) return s;
      } catch (err) { /* fall through */ }
    }
    return String(text || 'cabinet-project')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cabinet-project';
  }

  function todayIso() {
    var d = new Date();
    var util = CS.core && CS.core.util;
    if (util && typeof util.formatDate === 'function') {
      // util.formatDate is for display; ISO is safer for the plan-set date field.
    }
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (Math.round((bytes / 1024) * 10) / 10) + ' KB';
    return (Math.round((bytes / (1024 * 1024)) * 10) / 10) + ' MB';
  }

  function downloadBlob(blob, filename) {
    if (!blob || !filename) return false;
    var u = util();
    if (u && typeof u.downloadBlob === 'function') {
      try {
        var result = u.downloadBlob(filename, blob);
        if (!result || result.ok !== false) return true;
      } catch (err) { /* fall through to the anchor path */ }
    }
    try {
      var url = root.URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      doc.body.appendChild(a);
      a.click();
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        try { root.URL.revokeObjectURL(url); } catch (err2) { /* ignore */ }
      }, 1500);
      return true;
    } catch (err) {
      return false;
    }
  }

  function pagesOf(result) {
    if (!result) return null;
    if (Array.isArray(result.pages)) return result.pages.length;
    if (isFinite(result.pages)) return result.pages;
    if (isFinite(result.pageCount)) return result.pageCount;
    return null;
  }

  function ensureExtension(filename, ext) {
    var name = String(filename || '').trim();
    if (!name) name = 'cabinet-project';
    var lower = name.toLowerCase();
    if (lower.slice(-ext.length - 1) === '.' + ext) return name;
    return name.replace(/\.[a-z0-9]{1,5}$/i, '') + '.' + ext;
  }

  /* ───────────────────────────── localStorage ───────────────────────────── */

  function readStorage() {
    try {
      if (!root.localStorage) { storageOk = false; return null; }
      return root.localStorage.getItem(AUTOSAVE_KEY);
    } catch (err) {
      storageOk = false;
      return null;
    }
  }

  function writeStorage(json) {
    try {
      if (!root.localStorage) throw new Error('localStorage is not available');
      root.localStorage.setItem(AUTOSAVE_KEY, json);
      storageOk = true;
      return true;
    } catch (err) {
      storageOk = false;
      if (!storageWarningShown) {
        storageWarningShown = true;
        if (CS.ui.app && CS.ui.app.toast) {
          CS.ui.app.toast('This browser is not letting Cabinet Studio save locally. Use “Save” to download a JSON copy.', {
            title: 'Autosave unavailable', type: 'warning', timeout: 8000
          });
        }
      }
      return false;
    }
  }

  /* ───────────────────────────── Project lifecycle ───────────────────────────── */

  /** Called by the app during boot: restore the browser copy, else the sample kitchen. */
  function loadInitialProject() {
    var raw = readStorage();
    if (raw) {
      try {
        var core = CS.core && CS.core.project;
        var result = core && typeof core.deserialize === 'function'
          ? core.deserialize(raw)
          : { project: JSON.parse(raw), errors: [] };
        if (result && result.project) {
          var invalid = [];
          if (core && typeof core.validateProjectShape === 'function') {
            try { invalid = core.validateProjectShape(result.project) || []; } catch (err) { invalid = []; }
          }
          if (invalid.length && !(result.project.cabinets && result.project.cabinets.length)) {
            throw new Error(invalid[0]);
          }
          return { project: result.project, origin: 'storage', errors: result.errors || [] };
        }
        throw new Error('Saved project could not be read');
      } catch (err) {
        // Corrupt or incompatible autosave: keep the owner on their feet with the sample.
        try { root.localStorage.removeItem(AUTOSAVE_KEY); } catch (err2) { /* ignore */ }
        if (CS.ui.app && CS.ui.app.toast) {
          CS.ui.app.toast('The project saved in this browser could not be read, so the sample kitchen was opened instead.', {
            title: 'Saved project unreadable', type: 'warning', timeout: 8000
          });
        }
      }
    }
    return createSampleOrNew('sample');
  }

  function createSampleOrNew(origin) {
    var core = CS.core && CS.core.project;
    var project = null;
    var actualOrigin = origin;
    try {
      if (origin === 'sample' && core && typeof core.createSampleProject === 'function') {
        project = core.createSampleProject();
      }
      if (!project && core && typeof core.createDefaultProject === 'function') {
        project = core.createDefaultProject();
        actualOrigin = 'new';
      }
    } catch (err) {
      CS.ui.app.reportError('The project factory failed', err);
    }
    if (!project) {
      // Last-resort structural project so the UI can still boot and report clearly.
      project = {
        schemaVersion: 1, id: 'prj-1', name: 'Cabinet project', client: '', notes: '',
        units: 'imperial', pageSize: 'letter', orientation: 'landscape',
        settings: {}, cabinets: []
      };
      actualOrigin = 'new';
    }
    return { project: project, origin: actualOrigin, errors: [] };
  }

  function serializeProject(project) {
    var core = CS.core && CS.core.project;
    if (core && typeof core.serialize === 'function') {
      try { return core.serialize(project); } catch (err) { /* fall through */ }
    }
    return JSON.stringify(project, null, 2);
  }

  function suggestedJsonFilename() {
    var project = state().project || {};
    var base = slugify(project.name || 'cabinet-project');
    return base + '.cabinet-studio.json';
  }

  /** Header Save: download a portable JSON copy of the project. */
  function saveJsonDownload() {
    var project = state().project;
    if (!project) return;
    try {
      var json = serializeProject(project);
      var blob = new root.Blob([json], { type: 'application/json' });
      var filename = suggestedJsonFilename();
      var ok = downloadBlob(blob, filename);
      if (ok) {
        CS.ui.app.toast(filename + ' · ' + formatBytes(json.length), {
          title: 'Project file saved', type: 'success', timeout: 4500
        });
        // A JSON save is a real save: reflect it in the header state.
        CS.ui.app.setSaveState('saved', 'Saved');
      } else {
        CS.ui.app.toast('The browser blocked the download. Try again, or check the download settings.', {
          title: 'Could not save the file', type: 'error', timeout: 7000
        });
      }
    } catch (err) {
      CS.ui.app.reportError('Could not serialise the project', err);
      CS.ui.app.toast('Project could not be saved: ' + (err && err.message ? err.message : String(err)), {
        title: 'Save failed', type: 'error'
      });
    }
  }

  /** Header Open: load a project JSON file chosen by the owner. */
  function openFile() {
    var input = doc.getElementById('file-input');
    if (!input) return;
    input.value = '';
    input.click();
  }

  function bindFileInput() {
    var input = doc.getElementById('file-input');
    if (!input) return;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        CS.ui.app.toast('That file is larger than 25 MB — it does not look like a Cabinet Studio project.', {
          title: 'File too large', type: 'error'
        });
        input.value = '';
        return;
      }
      var reader = new root.FileReader();
      reader.onload = function () {
        try {
          var text = String(reader.result || '');
          var core = CS.core && CS.core.project;
          var result = core && typeof core.deserialize === 'function'
            ? core.deserialize(text)
            : { project: JSON.parse(text), errors: [] };
          if (!result || !result.project) {
            throw new Error((result && result.errors && result.errors[0]) || 'This is not a Cabinet Studio project file.');
          }
          var errors = result.errors || [];
          CS.ui.app.confirm({
            title: 'Open “' + file.name + '”?',
            message: 'This replaces the project currently open. ' +
              (state().project && state().project.cabinets ? 'It has ' + state().project.cabinets.length + ' cabinets. ' : '') +
              'Save a JSON copy first if you may want the current one back.',
            note: errors.length ? 'The file loaded with ' + errors.length + ' note' + (errors.length === 1 ? '' : 's') + '; they will be normalised.' : '',
            confirmLabel: 'Open project'
          }).then(function (confirmed) {
            if (!confirmed) return;
            CS.ui.app.setProject(result.project, { origin: 'file' });
            var openedCabinets = (state().project && state().project.cabinets) || [];
            if (openedCabinets.length && CS.ui.guided && typeof CS.ui.guided.showOverview === 'function') {
              CS.ui.guided.showOverview();
            }
            CS.ui.app.toast(file.name, {
              title: 'Project opened',
              detail: (result.project.cabinets ? result.project.cabinets.length + ' cabinets' : 'Empty project') + ' · ' + (result.project.name || 'Untitled')
            });
          });
        } catch (err) {
          CS.ui.app.toast((err && err.message ? err.message : String(err)) + ' — choose a project JSON saved by Cabinet Studio.', {
            title: 'That file could not be opened', type: 'error', timeout: 8000
          });
        }
      };
      reader.onerror = function () {
        CS.ui.app.toast('The browser could not read that file.', { title: 'File read failed', type: 'error' });
      };
      reader.readAsText(file);
    });
  }

  function confirmReplace(opts) {
    return CS.ui.app.confirm({
      title: opts.title,
      message: opts.message,
      note: 'The current project will be replaced. Its autosaved copy in this browser is overwritten — download a JSON copy first if you need it.',
      confirmLabel: opts.confirmLabel,
      danger: true
    });
  }

  function newProject() {
    confirmReplace({
      title: 'Start a new project?',
      message: 'A fresh project starts empty: first we set up the space, then you design the first cabinet in the guided flow.',
      confirmLabel: 'New project'
    }).then(function (confirmed) {
      if (!confirmed) return;
      var core = CS.core && CS.core.project;
      var project = null;
      if (core && typeof core.createEmptyProject === 'function') {
        project = core.createEmptyProject('Kitchen project');
      } else if (core && typeof core.createDefaultProject === 'function') {
        project = core.createDefaultProject();
      }
      if (!project) {
        CS.ui.app.toast('The project factory is not available yet.', { title: 'Cannot start a project', type: 'error' });
        return;
      }
      // setProject preserves an explicitly empty project and opens the guided
      // wizard at Step 1 (no phantom seeded cabinet, no extra mutation).
      CS.ui.app.setProject(project, { origin: 'new' });
      CS.ui.app.toast('New project. Step 1: set up the space.', { title: 'New project', type: 'success', timeout: 3500 });
    });
  }

  function sampleProject() {
    confirmReplace({
      title: 'Open the sample kitchen?',
      message: 'This replaces the current project with the six-cabinet sample kitchen.',
      confirmLabel: 'Open sample'
    }).then(function (confirmed) {
      if (!confirmed) return;
      var created = createSampleOrNew('sample');
      CS.ui.app.setProject(created.project, { origin: created.origin });
      if (CS.ui.guided && typeof CS.ui.guided.showOverview === 'function') CS.ui.guided.showOverview();
      CS.ui.app.toast('Sample kitchen loaded — the run overview shows the whole kitchen.', { title: 'Sample project', type: 'success' });
    });
  }

  /* ───────────────────────────── Autosave ───────────────────────────── */

  function scheduleAutosave(delay) {
    if (!state().project) return;
    CS.ui.app.setSaveState('saving', 'Saving…');
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveToBrowser, delay === undefined ? 550 : delay);
  }

  function saveToBrowser() {
    autosaveTimer = null;
    var project = state().project;
    if (!project) return;
    var json = '';
    try {
      json = serializeProject(project);
    } catch (err) {
      CS.ui.app.setSaveState('error', 'Not saved');
      return;
    }
    if (writeStorage(json)) {
      state().autosavedAt = Date.now();
      CS.ui.app.setSaveState('saved', 'Saved ' + CS.ui.app.formatClock(Date.now()));
    } else {
      CS.ui.app.setSaveState('error', 'Not saved');
    }
  }

  /* ───────────────────────────── Plans & export ───────────────────────────── */

  function resolveData() {
    return state().resolved || null;
  }

  function exportApi() {
    return CS.export && CS.export.exports && typeof CS.export.exports === 'object' ? CS.export.exports : null;
  }

  function capabilities() {
    var api = exportApi();
    if (!api) return { pdf: false, dxf: false, dwg: false };
    if (typeof api.capabilities === 'function') {
      try {
        var caps = api.capabilities();
        if (caps && typeof caps === 'object') return caps;
      } catch (err) { /* fall through */ }
    }
    return {
      pdf: typeof api.buildPdf === 'function',
      dxf: typeof api.buildDxf === 'function',
      dwg: typeof api.buildDwg === 'function'
    };
  }

  function buildPdfOptions() {
    var project = state().project || {};
    var settings = project.settings || {};
    var api = exportApi();
    var resolved = resolveData();
    var base = {};
    if (api && typeof api.pdfOptions === 'function') {
      try { base = api.pdfOptions(resolved, {}) || {}; } catch (err) { base = {}; }
    }
    return Object.assign({}, base, {
      pageSize: project.pageSize || 'letter',
      orientation: project.orientation || 'landscape',
      includeCover: localOptions.includeCover,
      includeCutList: localOptions.includeCutList,
      includeNesting: settings.includeSheetLayout !== false,
      includeSchedules: localOptions.includeSchedules,
      includeAssembly: settings.includeAssembly !== false,
      includeComponents: settings.includeComponentDrawings !== false && localOptions.componentScope !== 'none',
      includeNotes: localOptions.includeNotes,
      componentScope: localOptions.componentScope,
      date: settings.date || todayIso(),
      title: project.name || null
    });
  }

  function exportFilename(kind, result, project) {
    var api = exportApi();
    if (result && result.filename) return ensureExtension(result.filename, kind);
    if (api && typeof api.suggestedFilenames === 'function') {
      try {
        var suggested = api.suggestedFilenames(resolveData());
        if (suggested) {
          var keyed = typeof suggested === 'string' ? suggested : (suggested[kind] || suggested[kind.toUpperCase()] || suggested.project);
          if (typeof keyed === 'string') return ensureExtension(keyed, kind);
        }
      } catch (err) { /* ignore */ }
    }
    var base = slugify(project && project.name);
    return base + (kind === 'pdf' ? '-plan-set' : '-cad') + '.' + kind;
  }

  function setBusyKind(kind) {
    busyKind = kind;
    CS.ui.app.setBusy(kind ? 'Building ' + kind.toUpperCase() + '…' : null);
  }

  function recordExport(kind, info) {
    lastExports[kind] = Object.assign({ at: Date.now(), kind: kind }, info);
  }

  /**
   * Generate one export, download it, and record the outcome.
   * Runs after a short timeout so the busy state actually paints.
   */
  function runExport(kind) {
    if (busyKind) return;
    var resolved = resolveData();
    var project = state().project;
    var api = exportApi();
    if (!project) return;
    if (!resolved) {
      CS.ui.app.toast('The project is still being resolved. Try again in a moment.', { title: 'Not ready yet', type: 'warning' });
      return;
    }
    if (!api) {
      CS.ui.app.toast('The export module has not loaded yet.', { title: 'Export unavailable', type: 'error' });
      return;
    }

    setBusyKind(kind);
    renderExportTab({ keepFocus: true });

    setTimeout(function () {
      try {
        var result;
        var blob;
        var filename;
        if (kind === 'pdf') {
          if (typeof api.buildPdf !== 'function' && typeof api.downloadPdf !== 'function') {
            throw new Error('CS.export.exports.buildPdf is missing.');
          }
          if (typeof api.buildPdf === 'function') {
            result = api.buildPdf(resolved, buildPdfOptions());
            if (!result || !result.blob) throw new Error('The PDF builder returned no document.');
            filename = exportFilename('pdf', result, project);
            downloadBlob(result.blob, filename);
            recordExport('pdf', {
              filename: filename,
              pages: pagesOf(result),
              bytes: result.blob.size || null,
              warnings: result.warnings || []
            });
          } else {
            result = api.downloadPdf(resolved, buildPdfOptions()) || {};
            filename = exportFilename('pdf', result, project);
            recordExport('pdf', { filename: filename, pages: result.pageCount || null, bytes: null, warnings: result.warnings || [] });
          }
        } else if (kind === 'dxf') {
          if (typeof api.buildDxf !== 'function' && typeof api.downloadDxf !== 'function') {
            throw new Error('CS.export.exports.buildDxf is missing.');
          }
          if (typeof api.buildDxf === 'function') {
            result = api.buildDxf(resolved, { mode: 'all', dxfVersion: localOptions.dxfVersion });
            if (!result || !result.text) throw new Error('The DXF builder returned no drawing.');
            filename = exportFilename('dxf', result, project);
            blob = new root.Blob([result.text], { type: 'application/dxf' });
            downloadBlob(blob, filename);
            recordExport('dxf', { filename: filename, bytes: result.text.length, warnings: result.warnings || [] });
          } else {
            result = api.downloadDxf(resolved, { mode: 'all', dxfVersion: localOptions.dxfVersion }) || {};
            filename = exportFilename('dxf', result, project);
            recordExport('dxf', { filename: filename, bytes: null, warnings: result.warnings || [] });
          }
        } else if (kind === 'dwg') {
          if (typeof api.buildDwg !== 'function' && typeof api.downloadDwg !== 'function') {
            throw new Error('CS.export.exports.buildDwg is missing.');
          }
          var dwgVersion = (project.settings && project.settings.dwgVersion) || 'r2000';
          if (typeof api.buildDwg === 'function') {
            result = api.buildDwg(resolved, { mode: 'all', dwgVersion: dwgVersion });
            if (!result || !result.bytes) throw new Error('The DWG builder returned no drawing.');
            filename = exportFilename('dwg', result, project);
            blob = new root.Blob([result.bytes], { type: 'application/acad' });
            downloadBlob(blob, filename);
            var dwgWarnings = (result.warnings || []).slice();
            (result.skipped || []).forEach(function (item) { dwgWarnings.push('Skipped: ' + (item && (item.message || item.type) || item)); });
            (result.downgraded || []).forEach(function (item) { dwgWarnings.push('Downgraded: ' + (item && (item.message || item.type) || item)); });
            recordExport('dwg', {
              filename: filename,
              bytes: result.bytes.byteLength || result.bytes.length || null,
              warnings: dwgWarnings,
              version: dwgVersion
            });
          } else {
            result = api.downloadDwg(resolved, { mode: 'all', dwgVersion: dwgVersion }) || {};
            filename = exportFilename('dwg', result, project);
            recordExport('dwg', { filename: filename, bytes: null, warnings: result.warnings || [], version: dwgVersion });
          }
        }
        setBusyKind(null);
        renderExportTab({ keepFocus: true });
        var info = lastExports[kind];
        var warnings = info && Array.isArray(info.warnings) ? info.warnings : [];
        CS.ui.app.toast(info.filename, {
          title: kind.toUpperCase() + ' exported',
          detail: (info.pages ? info.pages + ' pages · ' : '') + (info.bytes ? formatBytes(info.bytes) : 'download started') +
            (warnings.length ? ' · ' + warnings.length + ' warning' + (warnings.length === 1 ? '' : 's') : ''),
          type: warnings.length ? 'warning' : 'success',
          timeout: 6000
        });
      } catch (err) {
        setBusyKind(null);
        var message = err && err.message ? err.message : String(err);
        recordExport(kind, { error: message, filename: null });
        renderExportTab({ keepFocus: true });
        if (root.console && typeof root.console.error === 'function') {
          root.console.error('[Cabinet Studio] ' + kind.toUpperCase() + ' export failed', err);
        }
        CS.ui.app.toast(message, { title: kind.toUpperCase() + ' export failed', type: 'error', timeout: 9000 });
      }
    }, 70);
  }

  /* ── Plans page DOM builders ── */

  function choiceGroup(opts) {
    var grid = el('div', { className: 'choice-grid' + (opts.columns === 2 ? ' is-2' : opts.columns === 3 ? ' is-3' : '') });
    (opts.values || []).forEach(function (value) {
      var inputId = 'exp-' + opts.name + '-' + value.id;
      var checked = opts.get() === value.id;
      var input = el('input', {
        attrs: { type: 'radio', name: opts.name, value: value.id, id: inputId, 'aria-label': value.label },
        on: {
          change: function () {
            if (input.checked) opts.onChange(value.id);
          }
        }
      });
      input.checked = checked;
      var choice = el('label', { className: 'choice', attrs: { for: inputId } }, [
        input,
        el('span', { className: 'choice-label', text: value.label }),
        value.sub ? el('span', { className: 'choice-sub', text: value.sub }) : null
      ]);
      grid.appendChild(choice);
    });
    return grid;
  }

  function checkRow(opts) {
    var inputId = 'exp-' + opts.name;
    var input = el('input', {
      attrs: { type: 'checkbox', id: inputId },
      on: {
        change: function () { opts.onChange(input.checked); }
      }
    });
    input.checked = !!opts.get();
    return el('label', { className: 'check-row', attrs: { for: inputId } }, [
      input,
      el('span', null, [el('span', { text: opts.label }), opts.hint ? el('small', { text: opts.hint }) : null])
    ]);
  }

  function optionCard(opts) {
    var card = el('section', { className: 'option-card' });
    card.appendChild(el('div', { className: 'option-card-head' }, [
      el('h2', { className: 'option-card-title' }, [opts.icon ? icon(opts.icon) : null, el('span', { text: opts.title })])
    ]));
    var body = el('div', { className: 'option-card-body' });
    (opts.children || []).forEach(function (child) { if (child) body.appendChild(child); });
    card.appendChild(body);
    return card;
  }

  function summaryRow(label, count, included, opts) {
    return el('div', { className: 'plan-summary-row' + (included ? '' : ' is-off') }, [
      icon(included ? 'check' : 'minus'),
      el('span', { text: label }),
      el('span', { className: 'num', text: count === null || count === undefined ? (included ? 'included' : 'off') : String(count) })
    ]);
  }

  function countData(resolved) {
    var totals = (resolved && resolved.cutList && resolved.cutList.totals) || {};
    var models = (resolved && Array.isArray(resolved.cabinets)) ? resolved.cabinets : [];
    var steps = models.reduce(function (n, m) { return n + (m && Array.isArray(m.assembly) ? m.assembly.length : 0); }, 0);
    var hardware = Array.isArray(resolved && resolved.hardware) ? resolved.hardware.length : 0;
    var fronts = Array.isArray(resolved && resolved.frontSchedule) ? resolved.frontSchedule.length : 0;
    var sheets = 0;
    if (Array.isArray(resolved && resolved.sheetLayouts)) {
      resolved.sheetLayouts.forEach(function (l) { sheets += Array.isArray(l.sheets) ? l.sheets.length : 0; });
    }
    return {
      cabinets: models.length,
      parts: totals.partCount || 0,
      uniqueParts: totals.uniqueParts || 0,
      sheets: totals.sheetCount || sheets,
      steps: steps,
      hardware: hardware,
      fronts: fronts
    };
  }

  function buildExportCard(kind, opts) {
    var card = el('article', { className: 'export-card' + (opts.primary ? ' is-primary' : ''), dataset: { exportKind: kind } });
    card.appendChild(el('div', { className: 'export-card-head' }, [
      el('div', { className: 'export-icon' }, icon(opts.icon)),
      el('div', { className: 'grow' }, [
        el('div', { className: 'export-title', text: opts.title }),
        el('div', { className: 'export-desc', text: opts.desc })
      ])
    ]));
    var meta = el('div', { className: 'export-meta' });
    (opts.meta || []).forEach(function (m) {
      if (m) meta.appendChild(el('span', { className: 'meta-chip' + (m.accent ? ' is-olive' : ''), text: m.label }));
    });
    card.appendChild(meta);

    var info = lastExports[kind];
    var ready = opts.ready;
    var buttonLabel = opts.buttonLabel;
    var btn = el('button', {
      className: 'btn ' + (opts.primary ? 'btn-primary' : 'btn-secondary'), type: 'button', dataset: { exportButton: kind },
      attrs: { disabled: !ready || !!busyKind ? '' : null },
      on: { click: function () { runExport(kind); } }
    }, [icon('download'), el('span', { text: buttonLabel })]);
    if (!ready) btn.disabled = true;
    if (busyKind) btn.disabled = true;

    var stateText;
    if (!ready) {
      stateText = el('span', { className: 'export-state is-error' }, [icon('alert'), el('span', { text: opts.disabledReason || 'Not ready' })]);
    } else if (busyKind === kind) {
      stateText = el('span', { className: 'export-state' }, [el('span', { className: 'spinner', style: { width: '12px', height: '12px' } }, icon('spinner')), el('span', { text: 'Generating…' })]);
    } else if (info && info.error) {
      stateText = el('span', { className: 'export-state is-error' }, [icon('alert'), el('span', { text: 'Last attempt failed' })]);
    } else if (info) {
      stateText = el('span', { className: 'export-state' }, [icon('check'), el('span', { text: 'Exported ' + CS.ui.app.formatClock(info.at) })]);
    } else {
      stateText = el('span', { className: 'export-state' }, [icon('info'), el('span', { text: opts.idleText || 'Ready to generate' })]);
    }
    card.appendChild(el('div', { className: 'export-actions' }, [btn, stateText]));

    if (info) {
      var last = el('div', { className: 'export-last' });
      if (info.error) {
        last.classList.add('is-error');
        last.appendChild(el('strong', { text: 'Error' }));
        last.appendChild(el('span', { text: info.error }));
      } else {
        last.appendChild(el('strong', { text: info.filename || 'Downloaded' }));
        var bits = [];
        if (info.pages) bits.push(info.pages + ' pages');
        if (info.bytes) bits.push(formatBytes(info.bytes));
        if (info.version) bits.push(DWG_LABEL[info.version] || info.version);
        bits.push(CS.ui.app.formatDateTime(info.at));
        last.appendChild(el('span', { text: bits.join(' · ') }));
        var warns = Array.isArray(info.warnings) ? info.warnings : [];
        if (warns.length) {
          var excerpt = warns.slice(0, 2).map(function (w) {
            var text = typeof w === 'string' ? w : (w && (w.message || w.title)) || '';
            return text.length > 150 ? text.slice(0, 150) + '…' : text;
          }).filter(Boolean).join(' · ');
          last.appendChild(el('span', {
            style: { color: 'var(--amber-deep)' },
            text: warns.length + ' note' + (warns.length === 1 ? '' : 's') + ': ' + excerpt
          }));
        }
      }
      card.appendChild(last);
    }

    if (busyKind === kind) {
      card.classList.add('is-busy');
      card.appendChild(el('div', { className: 'export-card-progress' }, [
        el('span', { className: 'spinner' }, icon('spinner')),
        el('span', { text: 'Building ' + kind.toUpperCase() + '…' })
      ]));
    }
    return card;
  }

  /**
   * Render the Plans & export tab. Registered as the tab renderer.
   * opts.keepFocus keeps keyboard focus on the same control across a re-render.
   */
  function renderExportTab(opts) {
    opts = opts || {};
    var body = doc.getElementById('plans-body');
    var actionsHost = doc.getElementById('plans-actions');
    if (!body) return;
    var active = doc.activeElement;
    var focusId = opts.keepFocus !== false && active && active.id ? active.id : null;
    var scrollTop = body.scrollTop;
    clear(body);
    if (actionsHost) clear(actionsHost);

    var project = state().project;
    if (!project) {
      body.appendChild(CS.ui.app.emptyState({ icon: 'plans', title: 'No project open', text: 'Open the sample kitchen or start a new project from the project menu.' }));
      return;
    }
    var api = exportApi();
    var resolved = resolveData();
    var cabinets = project.cabinets || [];
    var counts = resolved ? countData(resolved) : null;

    if (actionsHost) {
      if (counts) {
        actionsHost.appendChild(el('span', { className: 'meta-chip is-olive', text: counts.cabinets + ' cabinets' }));
        actionsHost.appendChild(el('span', { className: 'meta-chip', text: counts.parts + ' parts' }));
        actionsHost.appendChild(el('span', { className: 'meta-chip', text: counts.sheets + ' sheets' }));
      }
      actionsHost.appendChild(el('button', {
        className: 'btn btn-secondary btn-sm', type: 'button',
        on: { click: function () { if (CS.ui.inspector && CS.ui.inspector.openProjectEditor) CS.ui.inspector.openProjectEditor(); } }
      }, [icon('sliders'), el('span', { text: 'Project details' })]));
    }

    if (!cabinets.length) {
      body.appendChild(CS.ui.app.emptyState({
        icon: 'plans',
        title: 'Nothing to export yet',
        text: 'Add at least one cabinet in Design, or open the sample kitchen to see a complete plan set.',
        actions: [
          el('button', { className: 'btn btn-primary btn-sm', type: 'button', text: 'Add a base cabinet', on: { click: function () { CS.ui.app.addCabinet('base'); } } }),
          el('button', { className: 'btn btn-secondary btn-sm', type: 'button', text: 'Go to Design', on: { click: function () { CS.ui.app.switchTab('design'); } } })
        ]
      }));
      return;
    }

    if (!resolved) {
      var missingEngine = !(CS.engine && typeof CS.engine.resolveProject === 'function');
      body.appendChild(CS.ui.app.moduleNote(missingEngine ? {
        title: 'Exports need the cabinet engine',
        message: 'The PDF, DXF and DWG builders all work from the resolved project. The engine has not loaded yet — your project still saves normally.',
        missing: ['CS.engine.resolveProject'],
        files: ['js/engine/index.js']
      } : {
        title: 'Resolving the project before export',
        message: 'The plan set appears as soon as the engine finishes. This normally takes a moment.',
        files: []
      }));
    }

    var layout = el('div', { className: 'plans-layout' });

    /* ── Left: options ── */
    var left = el('div', { className: 'export-options' });
    var settings = project.settings || {};

    left.appendChild(optionCard({
      title: 'Page & orientation', icon: 'plans',
      children: [
        choiceGroup({
          name: 'pageSize', values: [
            { id: 'letter', label: 'Letter', sub: PAGE_DIMS.letter },
            { id: 'tabloid', label: 'Tabloid', sub: PAGE_DIMS.tabloid },
            { id: 'a4', label: 'A4', sub: PAGE_DIMS.a4 },
            { id: 'a3', label: 'A3', sub: PAGE_DIMS.a3 }
          ],
          get: function () { return project.pageSize || 'letter'; },
          onChange: function (value) { setProjectSetting('pageSize', value, 'page-size'); }
        }),
        el('div', { style: { height: '10px' } }),
        choiceGroup({
          name: 'orientation', columns: 2, values: [
            { id: 'landscape', label: 'Landscape', sub: 'Wider than tall' },
            { id: 'portrait', label: 'Portrait', sub: 'Taller than wide' }
          ],
          get: function () { return project.orientation || 'landscape'; },
          onChange: function (value) { setProjectSetting('orientation', value, 'orientation'); }
        })
      ]
    }));

    var contentsChildren = [
      checkRow({
        name: 'includeCover', label: 'Cover & cabinet schedule',
        hint: 'Project, shop, sheet index and warnings summary.',
        get: function () { return localOptions.includeCover; },
        onChange: function (value) { localOptions.includeCover = value; renderExportTab({ keepFocus: true }); }
      }),
      el('div', { className: 'plan-summary-row', style: { padding: '5px 0', border: '0' } }, [
        icon('check'),
        el('span', { text: 'Cabinet drawings (front, sections, isometric)' }),
        el('span', { className: 'num', text: counts ? counts.cabinets + ' sheets' : 'included' })
      ]),
      checkRow({
        name: 'includeComponents', label: 'Component drawings',
        hint: 'Per-part drawings with machining and dimensions.',
        get: function () { return settings.includeComponentDrawings !== false; },
        onChange: function (value) { setProjectSetting('settings.includeComponentDrawings', value, 'include-components'); }
      }),
      el('div', { className: 'field', style: { paddingLeft: '22px', marginTop: '-2px' } }, [
        el('label', { className: 'field-label', attrs: { for: 'exp-componentScope' } }, [el('span', { text: 'Component drawing scope' })]),
        (function () {
          var select = el('select', {
            className: 'select', id: 'exp-componentScope',
            on: { change: function () { localOptions.componentScope = select.value; renderExportTab({ keepFocus: true }); } }
          });
          [['all', 'Every part record (one drawing each)'], ['unique', 'One drawing per unique part type'], ['none', 'No component drawings']].forEach(function (pair) {
            var opt = el('option', { text: pair[1] });
            opt.value = pair[0];
            if (localOptions.componentScope === pair[0]) opt.selected = true;
            select.appendChild(opt);
          });
          select.disabled = settings.includeComponentDrawings === false;
          return select;
        })()
      ]),
      checkRow({
        name: 'includeCutList', label: 'Cut list',
        hint: 'Grouped by material with quantities, grain and edgeband.',
        get: function () { return localOptions.includeCutList; },
        onChange: function (value) { localOptions.includeCutList = value; renderExportTab({ keepFocus: true }); }
      }),
      checkRow({
        name: 'includeNesting', label: 'Sheet layout & nesting',
        hint: 'Stock sheets with part placements and yield.',
        get: function () { return settings.includeSheetLayout !== false; },
        onChange: function (value) { setProjectSetting('settings.includeSheetLayout', value, 'include-nesting'); }
      }),
      checkRow({
        name: 'includeSchedules', label: 'Door & drawer + hardware schedules',
        hint: 'Front sizes, hinge sides, pulls and hardware counts.',
        get: function () { return localOptions.includeSchedules; },
        onChange: function (value) { localOptions.includeSchedules = value; renderExportTab({ keepFocus: true }); }
      }),
      checkRow({
        name: 'includeAssembly', label: 'Assembly order',
        hint: 'Numbered steps with illustrations, tools and QC checks.',
        get: function () { return settings.includeAssembly !== false; },
        onChange: function (value) { setProjectSetting('settings.includeAssembly', value, 'include-assembly'); }
      }),
      checkRow({
        name: 'includeNotes', label: 'Notes, checks & sign-off',
        hint: 'Validation results, design notes and a sign-off area.',
        get: function () { return localOptions.includeNotes; },
        onChange: function (value) { localOptions.includeNotes = value; renderExportTab({ keepFocus: true }); }
      })
    ];
    var contentsCard = optionCard({ title: 'Plan-set contents', icon: 'cutlist', children: contentsChildren });
    left.appendChild(contentsCard);

    left.appendChild(optionCard({
      title: 'CAD formats', icon: 'cad',
      children: [
        el('div', { className: 'option-grid-2' }, [
          el('div', { className: 'field' }, [
            el('label', { className: 'field-label', attrs: { for: 'exp-dxfVersion' } }, [el('span', { text: 'DXF version' })]),
            (function () {
              var select = el('select', {
                className: 'select', id: 'exp-dxfVersion',
                on: { change: function () { localOptions.dxfVersion = select.value; renderExportTab({ keepFocus: true }); } }
              });
              [['r2000', 'AutoCAD R2000 (AC1015)'], ['r12', 'AutoCAD R12 (AC1009)']].forEach(function (pair) {
                var opt = el('option', { text: pair[1] });
                opt.value = pair[0];
                if (localOptions.dxfVersion === pair[0]) opt.selected = true;
                select.appendChild(opt);
              });
              return select;
            })()
          ]),
          el('div', { className: 'field' }, [
            el('label', { className: 'field-label', attrs: { for: 'exp-dwgVersion' } }, [el('span', { text: 'DWG version' })]),
            (function () {
              var current = settings.dwgVersion || 'r2000';
              var select = el('select', {
                className: 'select', id: 'exp-dwgVersion',
                on: { change: function () { setProjectSetting('settings.dwgVersion', select.value, 'dwg-version'); } }
              });
              [['r2000', 'AutoCAD R2000 (default)'], ['r2018', 'AutoCAD R2018'], ['r12', 'AutoCAD R12']].forEach(function (pair) {
                var opt = el('option', { text: pair[1] });
                opt.value = pair[0];
                if (current === pair[0]) opt.selected = true;
                select.appendChild(opt);
              });
              return select;
            })()
          ])
        ]),
        el('div', { className: 'export-help', style: { marginTop: '9px' } }, [
          icon('info'),
          el('span', { text: 'CAD exports are model-space millimetres at 1:1 on named layers — CS-OUTLINE, CS-HOLES, CS-GROOVES, CS-PARTS, CS-DIM, CS-SHEET and CS-NEST.' })
        ])
      ]
    }));

    // Plan-set summary
    var summary = el('div', { className: 'plan-summary' });
    summary.appendChild(el('div', { className: 'plan-summary-head', style: { padding: '9px 13px', borderBottom: '1px solid var(--line-soft)', background: 'var(--panel-2)', fontSize: '11px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }, text: 'Plan-set summary' }));
    var summaryList = el('div', { className: 'plan-summary-list' });
    var componentCount = null;
    if (counts) {
      if (localOptions.componentScope === 'unique') componentCount = counts.uniqueParts;
      else if (localOptions.componentScope === 'none') componentCount = 0;
      else componentCount = counts.parts;
    }
    summaryList.appendChild(summaryRow('Cover & cabinet schedule', null, localOptions.includeCover));
    summaryList.appendChild(summaryRow('Cabinet sheets', counts ? counts.cabinets : null, true));
    var scopeLabel = localOptions.componentScope === 'all' ? 'every part' : localOptions.componentScope === 'unique' ? 'unique parts' : 'off';
    summaryList.appendChild(summaryRow('Component drawings · ' + scopeLabel, componentCount, settings.includeComponentDrawings !== false && localOptions.componentScope !== 'none'));
    summaryList.appendChild(summaryRow('Cut list', counts ? counts.parts + ' parts' : null, localOptions.includeCutList));
    summaryList.appendChild(summaryRow('Sheet layout', counts ? counts.sheets + ' sheets' : null, settings.includeSheetLayout !== false));
    summaryList.appendChild(summaryRow('Door & drawer schedule', counts ? counts.fronts + ' fronts' : null, localOptions.includeSchedules));
    summaryList.appendChild(summaryRow('Hardware schedule', counts ? counts.hardware + ' items' : null, localOptions.includeSchedules));
    summaryList.appendChild(summaryRow('Assembly order', counts ? counts.steps + ' steps' : null, settings.includeAssembly !== false));
    summaryList.appendChild(summaryRow('Notes & sign-off', null, localOptions.includeNotes));
    summary.appendChild(summaryList);
    summary.appendChild(el('div', { className: 'plan-summary-foot', text: 'Everything is generated locally in this browser — no server, no upload.' }));
    left.insertBefore(summary, contentsCard);
    layout.appendChild(left);

    /* ── Right: export cards ── */
    var right = el('div', { className: 'export-cards' });
    if (!api) {
      right.appendChild(CS.ui.app.moduleNote({
        title: 'Export module not loaded',
        message: 'The unified export API (js/export/exports.js) has not loaded yet. Project saving and the rest of the app still work.',
        missing: ['CS.export.exports'],
        files: ['js/export/exports.js']
      }));
    }
    var caps = capabilities();
    var baseReady = !!api && !!resolved;
    var ready = baseReady;
    var disabledReason = !api ? 'Export module not loaded' : !resolved ? 'Waiting for the engine' : '';
    var pdfReady = baseReady && caps.pdf !== false;
    var dxfReady = baseReady && caps.dxf !== false;
    var dwgReady = baseReady && caps.dwg !== false;

    if (ready) {
      right.appendChild(el('div', { className: 'banner', style: { marginBottom: '0' } }, [
        icon('check'),
        el('span', { text: 'Ready — ' + PAGE_LABEL[project.pageSize || 'letter'] + ' ' + (project.orientation || 'landscape') + ' · ' + (project.units === 'metric' ? 'metric' : 'imperial') + ' labels · ' + (counts ? counts.cabinets : 0) + ' cabinets' })
      ]));
    }

    right.appendChild(buildExportCard('pdf', {
      primary: true,
      icon: 'pdf',
      title: 'PDF plan set',
      desc: 'The complete shop set: cover, cabinet drawings, component drawings with machining, cut list, nesting, schedules and assembly order. Vector, selectable text.',
      buttonLabel: 'Download PDF plan set',
      meta: [
        { label: PAGE_LABEL[project.pageSize || 'letter'], accent: false },
        { label: project.orientation || 'landscape', accent: false },
        { label: CS.ui.app.unitLabel() + ' dimensions', accent: false },
        localOptions.componentScope === 'none' ? { label: 'no component sheets' } : { label: localOptions.componentScope === 'unique' ? 'component drawings · unique parts' : 'component drawings · every part', accent: true }
      ],
      ready: pdfReady,
      disabledReason: (caps.pdf === false ? 'PDF module not loaded' : disabledReason),
      idleText: 'Ready to generate'
    }));

    right.appendChild(buildExportCard('dxf', {
      icon: 'cad',
      title: 'DXF drawing',
      desc: 'Open CAD exchange file with every part at 1:1, holes, grooves, nesting and cabinet views on named layers.',
      buttonLabel: 'Download DXF',
      meta: [
        { label: localOptions.dxfVersion === 'r12' ? 'R12 (AC1009)' : 'R2000 (AC1015)' },
        { label: 'model space · mm' }
      ],
      ready: dxfReady,
      disabledReason: (caps.dxf === false ? 'CAD module not loaded' : disabledReason),
      idleText: 'Ready to generate'
    }));

    right.appendChild(buildExportCard('dwg', {
      icon: 'cad',
      title: 'DWG drawing',
      desc: 'AutoCAD-native drawing for the CNC shop, written locally. The DWG is audited before download and any notes are shown.',
      buttonLabel: 'Download DWG',
      meta: [
        { label: DWG_LABEL[(project.settings && project.settings.dwgVersion) || 'r2000'] + ' DWG' },
        { label: 'model space · mm' }
      ],
      ready: dwgReady,
      disabledReason: (caps.dwg === false ? 'DWG module not loaded' : disabledReason),
      idleText: 'Ready to generate'
    }));

    right.appendChild(el('div', { className: 'export-help' }, [
      icon('info'),
      el('span', { text: 'PDF, DXF and DWG are built from the same resolved cabinet data as the screen. If a check fails, the export still runs but the warnings are reported here — never silently dropped.' })
    ]));
    layout.appendChild(right);
    body.appendChild(layout);

    body.scrollTop = scrollTop;
    if (focusId) {
      var target = doc.getElementById(focusId);
      if (target) {
        try { target.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
      }
    }
  }

  function setProjectSetting(path, value, reason) {
    CS.ui.app.mutate(function (project) {
      var parts = path.split('.');
      var cursor = project;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = value;
    }, { source: 'project-io', structural: false, reason: reason });
    // The project settings are part of the plan set: re-render immediately so
    // the summary and the option state stay in step.
    renderExportTab({ keepFocus: true });
  }

  /* ───────────────────────────── Init ───────────────────────────── */

  function init() {
    if (initialized) return;
    initialized = true;
    bindFileInput();
    CS.ui.app.registerTab('plans', renderExportTab);
    CS.ui.app.on('change', function (payload) {
      if (!payload) return;
      // The app mutation already says "dirty"; this turns it into an autosave.
      scheduleAutosave();
      if (state().activeTab === 'plans' && busyKind === null) state().tabDirty.plans = true;
    });
    CS.ui.app.on('project', function () {
      lastExports = { pdf: null, dxf: null, dwg: null };
      scheduleAutosave(80);
    });
    CS.ui.app.on('resolved', function () {
      if (state().activeTab === 'plans') state().tabDirty.plans = true;
    });
  }

  CS.ui.projectIO = {
    init: init,
    loadInitialProject: loadInitialProject,
    saveJsonDownload: saveJsonDownload,
    openFile: openFile,
    newProject: newProject,
    sampleProject: sampleProject,
    renderExportTab: renderExportTab,
    runExport: runExport,
    getLastExports: function () { return lastExports; },
    capabilities: capabilities,
    autosaveKey: AUTOSAVE_KEY,
    storageStatus: function () { return storageOk; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
