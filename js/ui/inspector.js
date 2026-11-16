/* ═══════════════════════════════════════════════════════════════════════════
   Cabinet Studio — Inspector (js/ui/inspector.js)

   Two modes:
     · Cabinet — every field of the selected cabinet, grouped in collapsible
       sections, with unit-aware length fields, standard-size presets, materials
       and construction pickers.
     · Project — metadata, shop defaults, sheet goods, plan-set options.

   The inspector writes complete CABINET objects (contract §4) and never
   re-implements engine geometry. Derived readouts (interior size, front sizes)
   come from the resolved engine output when it is available.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var doc = root.document;

  var OPEN_STATE = {
    cabinet: {
      identity: true,
      dimensions: true,
      construction: true,
      front: true,
      faceFrame: false,
      toeKick: false,
      interior: false,
      hardware: false,
      finish: false
    },
    project: {
      identity: true,
      defaults: true,
      sheet: false,
      planSet: false
    }
  };

  var initialized = false;
  var host = null;
  var renderQueued = false;
  var sectionSummaryNodes = Object.create(null);
  var sectionDisableNodes = Object.create(null);
  var previewModel = null;
  var lastCabinetId = null;
  var uidCounter = 0;
  // Re-entrancy guard: a field's blur/change handler can fire while the
  // inspector is being rebuilt (removing a focused control dispatches blur).
  // That nested render must wait until the outer rebuild has finished.
  var rendering = false;
  var renderAgain = false;
  var pendingRenderOpts = null;

  /* ───────────────────────────── Option labels (fallbacks) ─────────────────────────────
     The technique catalogue is the source of truth for names, but the UI must
     still render pickers (and remain usable) while the catalogue file is being
     written. These fallbacks mirror the required option ids in contract §5. */
  var OPTION_FALLBACKS = {
    constructionSystem: {
      frameless: 'Frameless (European)',
      faceframe: 'Face frame'
    },
    carcassJoinery: {
      confirmat: 'Confirmat screws',
      'pocket-screw': 'Pocket screws',
      'dado-screw': 'Dado + screws',
      dowel: 'Dowels',
      biscuit: 'Biscuits',
      'butt-screw': 'Butt joint + screws'
    },
    backStyle: {
      applied: 'Applied back',
      rabbet: 'Rabbeted back',
      dado: 'Dadoed back',
      none: 'No back'
    },
    toeKickStyle: {
      'separate-platform': 'Separate platform',
      'notched-sides': 'Notched side panels',
      'legs-levelers': 'Legs / levelers',
      'flush-base': 'Flush base',
      none: 'No toe kick'
    },
    shelfSystem: {
      'adjustable-pins-32': 'Adjustable · 32 mm system',
      'adjustable-pins-custom': 'Adjustable · custom pitch',
      'fixed-dado': 'Fixed shelves (dado)',
      none: 'No shelves'
    },
    doorStyle: {
      slab: 'Slab',
      shaker: 'Shaker',
      'raised-panel': 'Raised panel',
      beadboard: 'Beadboard',
      glass: 'Glass',
      'mullion-glass': 'Mullioned glass'
    },
    doorJoinery: {
      'cope-stick': 'Cope & stick',
      mitered: 'Mitered frame',
      dowel: 'Dowel frame',
      domino: 'Domino frame'
    },
    doorOverlay: {
      full: 'Full overlay',
      inset: 'Inset'
    },
    hingeType: {
      'euro-cup': 'Euro cup',
      butt: 'Butt hinge'
    },
    drawerFrontStyle: {
      slab: 'Slab',
      shaker: 'Shaker',
      'raised-panel': 'Raised panel'
    },
    drawerJoinery: {
      dovetail: 'Dovetail',
      'box-joint': 'Box joint',
      'butt-screw': 'Butt + screws',
      dado: 'Dado'
    },
    drawerBottom: {
      dado: 'Dado',
      rabbet: 'Rabbet'
    },
    drawerSlide: {
      undermount: 'Undermount',
      'side-mount': 'Side-mount',
      'center-mount': 'Center-mount'
    },
    faceFrameJoinery: {
      'pocket-screw': 'Pocket screws',
      biscuit: 'Biscuits',
      dowel: 'Dowels',
      'mortise-tenon': 'Mortise & tenon'
    },
    edgeBanding: {
      'pvc-0.5': 'PVC · 0.5 mm',
      'pvc-2': 'PVC · 2 mm',
      'wood-tape': 'Wood tape',
      none: 'No edgeband'
    },
    finish: {
      paint: 'Paint',
      lacquer: 'Lacquer',
      'water-poly': 'Water-based poly',
      'hardwax-oil': 'Hardwax oil',
      'stain-lacquer': 'Stain + lacquer'
    }
  };

  var MATERIAL_FALLBACKS = {
    'ply-birch-18': { name: 'Baltic birch plywood', short: '½" → ¾" ply', thickness: 18, category: 'sheet' },
    'ply-birch-12': { name: 'Baltic birch plywood', short: '½" ply', thickness: 12, category: 'sheet' },
    'ply-birch-6': { name: 'Baltic birch plywood', short: '¼" ply', thickness: 6, category: 'sheet' },
    'ply-veneer-18': { name: 'Veneer-core plywood', thickness: 18, category: 'sheet' },
    'mdf-18': { name: 'MDF', thickness: 18, category: 'panel' },
    'mdf-12': { name: 'MDF', thickness: 12, category: 'panel' },
    'mdf-6': { name: 'MDF', thickness: 6, category: 'panel' },
    'melamine-18': { name: 'Melamine-faced particleboard', thickness: 18, category: 'sheet' },
    'particleboard-18': { name: 'Particleboard', thickness: 18, category: 'sheet' },
    'hardwood-poplar': { name: 'Poplar', thickness: 19, category: 'solid' },
    'hardwood-maple': { name: 'Hard maple', thickness: 19, category: 'solid' },
    'hardwood-oak': { name: 'White oak', thickness: 19, category: 'solid' }
  };

  var MATERIAL_GROUP_LABEL = { sheet: 'Sheet goods', solid: 'Solid timber', panel: 'Panels' };
  var PAGE_SIZES = [
    { id: 'letter', label: 'Letter', sub: '8½ × 11' },
    { id: 'tabloid', label: 'Tabloid', sub: '11 × 17' },
    { id: 'a4', label: 'A4', sub: '210 × 297' },
    { id: 'a3', label: 'A3', sub: '297 × 420' }
  ];
  var PULL_FINISHES = ['brushed nickel', 'matte black', 'polished chrome', 'brass', 'oil-rubbed bronze', 'stainless'];
  var SHEENS = [{ id: 'matte', label: 'Matte' }, { id: 'satin', label: 'Satin' }, { id: 'semi-gloss', label: 'Semi-gloss' }, { id: 'gloss', label: 'Gloss' }];
  var DWG_VERSIONS = [
    { id: 'r2000', label: 'R2000 (default)' },
    { id: 'r2018', label: 'R2018' },
    { id: 'r12', label: 'R12' }
  ];

  /* ───────────────────────────── Small helpers ───────────────────────────── */

  function app() { return CS.ui.app; }

  function el(tag, props, children) { return CS.ui.app.el(tag, props, children); }
  function icon(name, cls) { return CS.ui.app.icon(name, cls); }
  function clear(node) { return CS.ui.app.clear(node); }

  function getCabinet() {
    return CS.ui.app.getSelectedCabinet();
  }

  function getModel() {
    return CS.ui.app.getSelectedModel();
  }

  function getProject() {
    return CS.ui.app.state.project;
  }

  function unitSuffix() {
    return CS.ui.app.unitSuffix();
  }

  function fmt(mm, opts) { return CS.ui.app.fmt(mm, opts); }
  function fmtShort(mm) { return CS.ui.app.fmtShort(mm); }
  function unitLabel() { return CS.ui.app.unitLabel(); }

  function nextFieldId() {
    uidCounter += 1;
    return 'insp-f' + uidCounter;
  }

  function setDeep(obj, path, value) {
    var parts = path.split('.');
    var cursor = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  }

  function getDeep(obj, path) {
    var parts = path.split('.');
    var cursor = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cursor === null || cursor === undefined) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  function mkId(prefix) { return prefix + '-' + (++uidCounter); }

  /* ───────────────────────────── Option / material data ───────────────────────────── */

  function catalogue() {
    var data = CS.data && CS.data.techniques;
    return data && typeof data === 'object' ? data : null;
  }

  /** Ordered option ids for a catalogue group (engine.optionIds first, then data, then fallbacks). */
  function optionValues(group) {
    var ids = [];
    var engine = CS.engine && CS.engine.optionIds;
    if (engine) {
      var raw = engine[group];
      if (Array.isArray(raw)) ids = raw.slice();
      else if (typeof root.Set !== 'undefined' && raw instanceof root.Set) ids = Array.from(raw);
      else if (raw && typeof raw === 'object') ids = Object.keys(raw);
    }
    if (!ids.length) {
      var cat = catalogue();
      var opts = cat && cat.options && cat.options[group];
      if (Array.isArray(opts)) ids = opts.map(function (o) { return o && o.id; }).filter(Boolean);
    }
    if (!ids.length) ids = Object.keys(OPTION_FALLBACKS[group] || {});
    // Preserve declared order, drop duplicates.
    var seen = Object.create(null);
    return ids.filter(function (id) {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function optionLabel(group, id) {
    if (!id) return '—';
    var cat = catalogue();
    var list = cat && cat.options && cat.options[group];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === id && list[i].name) return list[i].name;
      }
    }
    var fallback = OPTION_FALLBACKS[group] && OPTION_FALLBACKS[group][id];
    if (fallback) return fallback;
    return String(id).replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function materialList() {
    var out = [];
    var cat = catalogue();
    var materials = cat && cat.materials;
    if (Array.isArray(materials) && materials.length) {
      materials.forEach(function (m) {
        if (!m || !m.id) return;
        var label = m.name || m.shortName || m.id;
        if (m.thickness && !/[0-9]/.test(label)) label += '';
        out.push({
          value: m.id,
          label: label,
          group: MATERIAL_GROUP_LABEL[m.category] || 'Materials',
          thickness: m.thickness,
          category: m.category
        });
      });
      return out;
    }
    Object.keys(MATERIAL_FALLBACKS).forEach(function (id) {
      var m = MATERIAL_FALLBACKS[id];
      out.push({
        value: id,
        label: m.name,
        group: MATERIAL_GROUP_LABEL[m.category] || 'Materials',
        thickness: m.thickness,
        category: m.category
      });
    });
    return out;
  }

  function materialMeta(id) {
    var cat = catalogue();
    var materials = cat && cat.materials;
    if (Array.isArray(materials)) {
      for (var i = 0; i < materials.length; i++) {
        if (materials[i] && materials[i].id === id) return materials[i];
      }
    }
    return MATERIAL_FALLBACKS[id] || null;
  }

  function materialLabel(id) {
    var meta = materialMeta(id);
    if (!meta) return id ? String(id) : '—';
    return meta.name || meta.shortName || id;
  }

  function pullOptions() {
    var out = [];
    var cat = catalogue();
    var hardware = cat && cat.hardware;
    if (Array.isArray(hardware)) {
      hardware.forEach(function (h) {
        if (!h || !h.id) return;
        if (h.category && !/pull|handle/i.test(h.category)) return;
        out.push({ value: h.id, label: h.name || h.id });
      });
    }
    if (!out.length) {
      out = [
        { value: 'bar-128', label: 'Bar pull · 128 mm' },
        { value: 'pull-knob-32', label: 'Knob · 32 mm' }
      ];
    }
    return out;
  }

  function currentStandardTable() {
    var cat = catalogue();
    var standards = cat && cat.standards;
    return standards || null;
  }

  function standardDims(type) {
    var core = CS.core && CS.core.project;
    if (core && core.PRESETS && core.PRESETS[type]) {
      try {
        var preset = core.PRESETS[type];
        if (isFinite(preset.width) && isFinite(preset.height) && isFinite(preset.depth)) return preset;
      } catch (err) { /* fall through */ }
    }
    var table = currentStandardTable();
    var dims = table && table.dims && table.dims[type];
    if (dims && isFinite(dims.height) && isFinite(dims.depth)) return dims;
    if (type === 'wall') return { width: 762, height: 762, depth: 304.8 };
    if (type === 'tall') return { width: 609.6, height: 2133.6, depth: 609.6 };
    if (type === 'pantry') return { width: 609.6, height: 2133.6, depth: 304.8 };
    return { width: 762, height: 876.3, depth: 609.6 };
  }

  function standardWidths() {
    var core = CS.core && CS.core.project;
    if (core && Array.isArray(core.STANDARD_WIDTHS) && core.STANDARD_WIDTHS.length) return core.STANDARD_WIDTHS.slice();
    var table = currentStandardTable();
    var widths = table && table.dims && table.dims.standardWidths;
    if (Array.isArray(widths) && widths.length) return widths;
    return [457.2, 609.6, 762, 914.4];
  }

  /** Height presets for the selected cabinet type (from the core project presets). */
  function heightPresets(type) {
    var core = CS.core && CS.core.project;
    if (type === 'wall' && core && Array.isArray(core.WALL_HEIGHTS)) return core.WALL_HEIGHTS;
    if ((type === 'tall' || type === 'pantry') && core && Array.isArray(core.TALL_HEIGHTS)) return core.TALL_HEIGHTS;
    var dims = standardDims(type);
    if (type === 'base') return [dims.height, 914.4, 812.8];
    return [dims.height];
  }

  /* ───────────────────────────── Mutations ───────────────────────────── */

  /**
   * Set a cabinet field. opts.structural rebuilds the panel (field visibility
   * changes), opts.refreshRail keeps the cabinet-list dimensions live.
   */
  function setCabinetField(path, value, opts) {
    opts = opts || {};
    var cabinet = getCabinet();
    if (!cabinet) return;
    var cabId = cabinet.id;
    var changed = CS.ui.app.mutate(function (project) {
      var target = null;
      for (var i = 0; i < project.cabinets.length; i++) {
        if (project.cabinets[i].id === cabId) { target = project.cabinets[i]; break; }
      }
      if (!target) return false;
      setDeep(target, path, value);
    }, {
      source: 'inspector',
      cabinetId: cabId,
      structural: !!opts.structural,
      reason: opts.reason || 'field'
    });
    if (!changed) return;
    if (opts.structural) {
      render({ rebuild: true, focusPath: opts.focusPath || path });
    } else {
      updateSummaries();
      if (opts.refreshRail) CS.ui.app.renderRail();
    }
  }

  function setProjectField(path, value, opts) {
    opts = opts || {};
    var changed = CS.ui.app.mutate(function (project) {
      setDeep(project, path, value);
    }, {
      source: 'inspector',
      structural: false,
      reason: opts.reason || 'project-field'
    });
    if (!changed) return;
    if (opts.refreshHeader) CS.ui.app.renderHeader();
    if (opts.structural) render({ rebuild: true, focusPath: path });
    else updateSummaries();
  }

  function updateCabinet(path, value, opts) { setCabinetField(path, value, opts); }

  /* ───────────────────────────── Reusable field controls ───────────────────────────── */

  /** Wrap a control with a label + hint + inline validation area. */
  function fieldWrap(opts, control) {
    var id = nextFieldId();
    var labelText = opts.label || '';
    var label = el('label', { className: 'field-label', attrs: { for: id } });
    label.appendChild(el('span', { text: labelText }));
    if (opts.labelNote) label.appendChild(el('span', { className: 'field-label-note', text: opts.labelNote }));
    var wrap = el('div', { className: 'field' + (opts.className ? ' ' + opts.className : ''), dataset: opts.path ? { fieldPath: opts.path } : null });
    wrap.appendChild(label);
    var controlWrap = control;
    if (control.tagName === 'INPUT' || control.tagName === 'SELECT' || control.tagName === 'TEXTAREA') {
      if (!control.id) control.id = id;
      label.htmlFor = control.id;
      if (opts.unit && control.tagName === 'INPUT') {
        controlWrap = el('div', { className: 'input-wrap' }, [
          control,
          el('span', { className: 'input-unit', text: unitSuffix() })
        ]);
      }
    } else {
      // Composite control: label is advisory, use aria-label on the control group.
      label.removeAttribute('for');
      controlWrap.setAttribute('role', 'group');
      controlWrap.setAttribute('aria-label', labelText);
    }
    wrap.appendChild(controlWrap);
    if (opts.hint) wrap.appendChild(el('div', { className: 'field-hint', text: opts.hint }));
    if (opts.errorNode) wrap.appendChild(opts.errorNode);
    if (control.__errorSlot === undefined) {
      control.__errorSlot = el('div', { className: 'field-error', hidden: true });
      control.__fieldWrap = wrap;
    }
    return wrap;
  }

  function showFieldError(control, message) {
    if (!control) return;
    var wrap = control.__fieldWrap || control.closest('.field, .input-wrap');
    var slot = control.__errorSlot;
    if (!slot) {
      slot = el('div', { className: 'field-error', hidden: true });
      if (wrap) wrap.appendChild(slot);
      control.__errorSlot = slot;
    }
    if (message) {
      clear(slot);
      slot.appendChild(icon('alert'));
      slot.appendChild(el('span', { text: message }));
      slot.hidden = false;
      var inputWrap = control.closest('.input-wrap') || control;
      if (inputWrap && inputWrap.classList) inputWrap.classList.add('is-invalid');
      if (control.closest && control.closest('.field')) control.closest('.field').classList.add('is-invalid');
    } else {
      slot.hidden = true;
      slot.textContent = '';
      var iw = control.closest('.input-wrap') || control;
      if (iw && iw.classList) iw.classList.remove('is-invalid');
      if (control.closest && control.closest('.field')) control.closest('.field').classList.remove('is-invalid');
    }
  }

  /**
   * Unit-aware length field. Values are millimetres inside the model; the
   * input displays project units and parses either notation (CS.units.parse).
   */
  function lengthField(opts) {
    var value = opts.get();
    var input = el('input', {
      className: 'input',
      attrs: {
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': opts.label || 'Length'
      }
    });
    input.value = fmt(value, { trim: true });
    input.disabled = !!opts.disabled;
    var lastGood = value;

    function validate(mm) {
      if (mm === null || mm === undefined || !isFinite(mm)) {
        showFieldError(input, 'Enter a length, e.g. ' + (unitLabel() === 'in' ? '34 1/2"' : '876 mm'));
        return false;
      }
      if (isFinite(opts.min) && mm < opts.min) {
        showFieldError(input, 'Minimum ' + fmt(opts.min));
        return false;
      }
      if (isFinite(opts.max) && mm > opts.max) {
        showFieldError(input, 'Maximum ' + fmt(opts.max));
        return false;
      }
      showFieldError(input, '');
      return true;
    }

    input.addEventListener('input', function () {
      var mm = CS.ui.app.parseLength(input.value);
      if (mm === null) {
        showFieldError(input, 'Not a length I can read — try 34 1/2" or 876 mm');
        return;
      }
      if (!validate(mm)) return;
      lastGood = mm;
      opts.onChange(mm);
    });
    input.addEventListener('focus', function () {
      try { input.select(); } catch (err) { /* ignore */ }
    });
    input.addEventListener('blur', function () {
      if (!input.isConnected) return; // removed by an inspector rebuild
      var mm = CS.ui.app.parseLength(input.value);
      if (mm === null) mm = lastGood;
      input.value = fmt(mm, { trim: true });
      validate(mm);
    });
    input.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') { evt.preventDefault(); input.blur(); }
      if (evt.key === 'Escape') {
        input.value = fmt(lastGood, { trim: true });
        showFieldError(input, '');
        input.blur();
      }
    });
    var wrap = fieldWrap(opts, input);
    var errorSlot = controlErrorSlot(input);
    if (opts.hint || opts.errorNode) {
      // fieldWrap already appended hint; nothing else required.
    }
    if (errorSlot && errorSlot.parentNode !== wrap) wrap.appendChild(errorSlot);
    return wrap;
  }

  function controlErrorSlot(control) {
    if (!control) return null;
    if (!control.__errorSlot) control.__errorSlot = el('div', { className: 'field-error', hidden: true });
    return control.__errorSlot;
  }

  /** Integer / decimal field without units (counts, pins, kerf are separate). */
  function numberField(opts) {
    var input = el('input', {
      className: 'input',
      attrs: {
        type: 'text', inputmode: opts.integer === false ? 'decimal' : 'numeric',
        autocomplete: 'off', spellcheck: 'false',
        'aria-label': opts.label || 'Number'
      }
    });
    var current = opts.get();
    input.value = current === null || current === undefined ? '' : String(current);
    input.disabled = !!opts.disabled;

    function commit() {
      var raw = String(input.value).trim().replace(',', '.');
      if (raw === '') { showFieldError(input, 'Enter a number'); return false; }
      var n = Number(raw);
      if (!isFinite(n)) { showFieldError(input, 'Enter a number'); return false; }
      if (opts.integer !== false) n = Math.round(n);
      if (isFinite(opts.min) && n < opts.min) { showFieldError(input, 'Minimum ' + opts.min); return false; }
      if (isFinite(opts.max) && n > opts.max) { showFieldError(input, 'Maximum ' + opts.max); return false; }
      showFieldError(input, '');
      opts.onChange(n);
      return true;
    }
    input.addEventListener('input', function () {
      if (!input.isConnected) return;
      var raw = String(input.value).trim().replace(',', '.');
      if (raw === '') return;
      var n = Number(raw);
      if (!isFinite(n)) { showFieldError(input, 'Enter a number'); return; }
      if (opts.allowLive === true) {
        if (opts.integer !== false) n = Math.round(n);
        if ((!isFinite(opts.min) || n >= opts.min) && (!isFinite(opts.max) || n <= opts.max)) {
          showFieldError(input, '');
          opts.onChange(n);
        }
      }
    });
    input.addEventListener('focus', function () { try { input.select(); } catch (err) { /* ignore */ } });
    input.addEventListener('blur', function () {
      if (!input.isConnected) return; // removed by an inspector rebuild
      if (!commit()) input.value = String(opts.get() === null || opts.get() === undefined ? '' : opts.get());
      else input.value = String(opts.get());
    });
    input.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') { evt.preventDefault(); input.blur(); }
      if (evt.key === 'Escape') {
        input.value = String(opts.get() === null || opts.get() === undefined ? '' : opts.get());
        showFieldError(input, '');
        input.blur();
      }
    });
    var wrap = fieldWrap(opts, input);
    var slot = controlErrorSlot(input);
    if (slot && slot.parentNode !== wrap) wrap.appendChild(slot);
    return wrap;
  }

  function textField(opts) {
    var input = el('input', {
      className: 'input',
      attrs: { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: opts.placeholder || '' },
      on: {
        input: function () { if (input.isConnected) opts.onChange(input.value); },
        change: function () { if (input.isConnected) opts.onChange(input.value); }
      }
    });
    input.value = opts.get() === null || opts.get() === undefined ? '' : String(opts.get());
    input.disabled = !!opts.disabled;
    if (opts.maxLength) input.setAttribute('maxlength', String(opts.maxLength));
    var wrap = fieldWrap(opts, input);
    var slot = controlErrorSlot(input);
    if (slot && slot.parentNode !== wrap) wrap.appendChild(slot);
    return wrap;
  }

  function textAreaField(opts) {
    var input = el('textarea', {
      className: 'textarea',
      attrs: { rows: opts.rows || 3, placeholder: opts.placeholder || '', spellcheck: 'false' },
      on: {
        input: function () { if (input.isConnected) opts.onChange(input.value); },
        change: function () { if (input.isConnected) opts.onChange(input.value); }
      }
    });
    input.value = opts.get() === null || opts.get() === undefined ? '' : String(opts.get());
    input.disabled = !!opts.disabled;
    var wrap = fieldWrap(opts, input);
    var slot = controlErrorSlot(input);
    if (slot && slot.parentNode !== wrap) wrap.appendChild(slot);
    return wrap;
  }

  /**
   * Select from [{value,label,group?}]. `opts.values` may also be a list of ids.
   */
  function selectField(opts) {
    var values = opts.values || [];
    var select = el('select', {
      className: 'select',
      attrs: { 'aria-label': opts.label || 'Select' },
      on: {
        change: function () {
          if (!select.isConnected) return;
          opts.onChange(select.value);
        }
      }
    });
    var current = String(opts.get() === null || opts.get() === undefined ? '' : opts.get());
    var groups = Object.create(null);
    var order = [];
    var flat = [];
    values.forEach(function (v) {
      var item = typeof v === 'string' ? { value: v, label: optionLabel(opts.optionGroup || '', v) } : v;
      if (!item || item.value === undefined || item.value === null) return;
      flat.push(item);
      if (item.group) {
        if (!groups[item.group]) { groups[item.group] = []; order.push(item.group); }
        groups[item.group].push(item);
      }
    });
    function addOption(parent, item) {
      var opt = el('option', { text: item.label === undefined ? String(item.value) : item.label });
      opt.value = String(item.value);
      if (String(item.value) === current) opt.selected = true;
      parent.appendChild(opt);
    }
    var hasGroups = order.length > 0 && flat.some(function (i) { return i.group; });
    if (hasGroups) {
      var ungrouped = flat.filter(function (i) { return !i.group; });
      ungrouped.forEach(function (item) { addOption(select, item); });
      order.forEach(function (groupName) {
        var og = el('optgroup', { attrs: { label: groupName } });
        groups[groupName].forEach(function (item) { addOption(og, item); });
        select.appendChild(og);
      });
    } else {
      flat.forEach(function (item) { addOption(select, item); });
    }
    // Keep an unknown current value visible instead of silently changing it.
    var present = flat.some(function (item) { return String(item.value) === current; });
    if (!present && current) {
      var opt = el('option', { text: current + ' (custom)' });
      opt.value = current;
      opt.selected = true;
      select.insertBefore(opt, select.firstChild);
    }
    select.disabled = !!opts.disabled;
    var wrap = fieldWrap(opts, select);
    var slot = controlErrorSlot(select);
    if (slot && slot.parentNode !== wrap) wrap.appendChild(slot);
    return wrap;
  }

  function optionSelectField(group, opts) {
    var ids = optionValues(group);
    var values = ids.map(function (id) {
      var cat = catalogue();
      var summary = '';
      if (cat && cat.options && Array.isArray(cat.options[group])) {
        for (var i = 0; i < cat.options[group].length; i++) {
          if (cat.options[group][i] && cat.options[group][i].id === id) {
            summary = cat.options[group][i].summary || '';
            break;
          }
        }
      }
      return { value: id, label: optionLabel(group, id), group: opts.groupLabels ? opts.groupLabels(id) : undefined, summary: summary };
    });
    return selectField(Object.assign({}, opts, { values: values, optionGroup: group }));
  }

  function segmentedField(opts) {
    var group = el('div', {
      className: 'segmented' + (opts.wrap ? ' is-wrap' : ''),
      attrs: { role: 'group', 'aria-label': opts.label || 'Choose one' }
    });
    var current = opts.get();
    (opts.values || []).forEach(function (v) {
      var isActive = v.value === current;
      var btn = el('button', {
        className: 'segmented-btn', type: 'button',
        attrs: { 'aria-pressed': isActive ? 'true' : 'false', title: v.title || v.label },
        on: {
          click: function () {
            if (v.value === opts.get()) return;
            opts.onChange(v.value);
          }
        }
      });
      if (v.icon) btn.appendChild(icon(v.icon));
      btn.appendChild(el('span', { text: v.label }));
      group.appendChild(btn);
    });
    if (opts.disabled) group.setAttribute('aria-disabled', 'true');
    var wrap = fieldWrap(opts, group);
    if (opts.disabled) wrap.classList.add('is-disabled-control');
    return wrap;
  }

  function checkField(opts) {
    var input = el('input', {
      attrs: { type: 'checkbox' },
      on: { change: function () { if (input.isConnected) opts.onChange(input.checked); } }
    });
    input.checked = !!opts.get();
    input.disabled = !!opts.disabled;
    var label = el('label', { className: 'check-row' + (opts.disabled ? ' is-disabled' : '') }, [
      input,
      el('span', null, [
        el('span', { text: opts.label }),
        opts.hint ? el('small', { text: opts.hint }) : null
      ])
    ]);
    var wrap = el('div', { className: 'field', dataset: opts.path ? { fieldPath: opts.path } : null });
    wrap.appendChild(label);
    return wrap;
  }

  function colorField(opts) {
    var input = el('input', {
      className: 'input',
      attrs: { type: 'color', 'aria-label': opts.label || 'Colour' },
      on: { input: function () { if (input.isConnected) opts.onChange(input.value); } }
    });
    input.value = opts.get() || '#f2ede3';
    input.style.padding = '3px';
    input.style.height = '30px';
    input.style.maxWidth = '84px';
    input.style.cursor = 'pointer';
    input.disabled = !!opts.disabled;
    var wrap = fieldWrap(opts, input);
    var slot = controlErrorSlot(input);
    if (slot && slot.parentNode !== wrap) wrap.appendChild(slot);
    return wrap;
  }

  function hintRow(text) { return el('div', { className: 'field-hint', text: text }); }

  /** Row of preset chips applying a value. */
  function presetRow(opts) {
    var row = el('div', { className: 'inline-presets', attrs: { role: 'group', 'aria-label': opts.label || 'Presets' } });
    var current = opts.get();
    (opts.presets || []).forEach(function (preset) {
      var isActive = Math.abs(current - preset.value) < 0.05;
      row.appendChild(el('button', {
        className: 'preset-chip' + (isActive ? ' is-active' : ''), type: 'button',
        attrs: { title: preset.title || preset.label },
        text: preset.label,
        on: { click: function () { opts.onChange(preset.value); } }
      }));
    });
    return row;
  }

  /* ───────────────────────────── Section shell ───────────────────────────── */

  function section(opts) {
    var mode = opts.mode || 'cabinet';
    var stateMap = OPEN_STATE[mode] || OPEN_STATE.cabinet;
    var isOpen = stateMap[opts.id] !== undefined ? stateMap[opts.id] : !!opts.defaultOpen;
    var bodyId = mkId('insp-section');
    var head = el('button', {
      className: 'insp-section-head', type: 'button',
      attrs: { 'aria-expanded': isOpen ? 'true' : 'false', 'aria-controls': bodyId },
      on: {
        click: function () {
          var open = head.getAttribute('aria-expanded') === 'true';
          head.setAttribute('aria-expanded', open ? 'false' : 'true');
          body.hidden = open;
          body.classList.toggle('is-collapsed', open);
          stateMap[opts.id] = !open;
        }
      }
    }, [
      icon('chevron-down'),
      el('span', { className: 'insp-section-title', text: opts.title }),
      el('span', { className: 'insp-section-summary', text: opts.summary || '' })
    ]);
    if (opts.disabled) head.title = opts.disabledNote || 'Not used by the current construction';
    var body = el('div', {
      className: 'insp-section-body' + (isOpen ? '' : ' is-collapsed'),
      attrs: { id: bodyId }
    });
    if (opts.note) {
      body.appendChild(el('div', { className: 'insp-section-note', text: opts.note }));
    }
    CS.ui.app.appendChildren(body, opts.children || []);
    body.hidden = !isOpen;
    var sec = el('div', { className: 'insp-section' + (opts.disabled ? ' is-disabled' : ''), attrs: { 'data-section': opts.id } }, [head, body]);
    if (opts.summary !== undefined) sectionSummaryNodes[opts.id] = head.querySelector('.insp-section-summary');
    if (opts.disabled) sectionDisableNodes[opts.id] = sec;
    return sec;
  }

  function sectionSummary(id, text) {
    var node = sectionSummaryNodes[id];
    if (node) node.textContent = text;
  }

  /* ───────────────────────────── Cabinet summaries ───────────────────────────── */

  function typeLabel(type) {
    return CS.ui.app.CABINET_TYPE_LABEL[type] || 'Cabinet';
  }

  function frontSummary(cabinet) {
    var front = cabinet.front || {};
    var type = front.type || 'doors';
    if (type === 'open') return 'Open · no fronts';
    if (type === 'doors') {
      var count = (front.doors && front.doors.count) || 1;
      return count + ' ' + optionLabel('doorStyle', front.doors && front.doors.style).toLowerCase() + (count === 1 ? ' door' : ' doors');
    }
    if (type === 'drawer-stack') {
      var dcount = (front.drawers && front.drawers.count) || 1;
      return dcount + ' ' + optionLabel('drawerFrontStyle', front.drawers && front.drawers.style).toLowerCase() + (dcount === 1 ? ' drawer' : ' drawers');
    }
    if (type === 'door-drawer') {
      var below = (front.combined && front.combined.doorsBelow) || 2;
      return 'Drawer + ' + below + (below === 1 ? ' door' : ' doors');
    }
    return type;
  }

  function cabinetSummaryFor(id, cabinet) {
    if (!cabinet) return '';
    switch (id) {
      case 'identity':
        return (cabinet.tag || '') + ' · ' + typeLabel(cabinet.type);
      case 'dimensions':
        return fmtShort(cabinet.width) + ' × ' + fmtShort(cabinet.height) + ' × ' + fmtShort(cabinet.depth);
      case 'construction': {
        var c = cabinet.construction || {};
        return optionLabel('constructionSystem', c.system) + ' · ' + (materialLabel(c.carcassMaterial) || '');
      }
      case 'front':
        return frontSummary(cabinet);
      case 'faceFrame': {
        var ff = cabinet.faceFrame || {};
        return (ff.stileWidth ? fmtShort(ff.stileWidth) + ' stiles' : 'Face frame') + ' · ' + optionLabel('faceFrameJoinery', ff.joinery);
      }
      case 'toeKick': {
        var tk = cabinet.toeKick || {};
        if (!tk.style || tk.style === 'none') return 'No toe kick';
        return optionLabel('toeKickStyle', tk.style) + ' · ' + fmtShort(tk.height);
      }
      case 'interior': {
        var interior = cabinet.interior || {};
        return (interior.adjustableShelves || 0) + ' adjustable · ' + (interior.fixedShelves || 0) + ' fixed';
      }
      case 'hardware': {
        var hw = cabinet.hardware || {};
        var pull = pullOptions().filter(function (p) { return p.value === (hw.pull && hw.pull.id); })[0];
        return (pull ? pull.label : 'Pull') + (hw.pull && hw.pull.finish ? ' · ' + hw.pull.finish : '');
      }
      case 'finish': {
        var fin = cabinet.finish || {};
        return optionLabel('finish', fin.id) + (fin.sheen ? ' · ' + fin.sheen : '');
      }
      default:
        return '';
    }
  }

  function projectSummaryFor(id) {
    var project = getProject();
    if (!project) return '';
    switch (id) {
      case 'identity':
        return [project.client, project.name].filter(Boolean).join(' · ') || 'Untitled';
      case 'defaults': {
        var s = project.settings || {};
        return materialLabel(s.defaultCarcassMaterial) + ' · ' + optionLabel('finish', s.defaultFinish);
      }
      case 'sheet': {
        var st = project.settings || {};
        return fmtShort(st.sheetWidth) + ' × ' + fmtShort(st.sheetHeight) + ' sheet · ' + fmt(fmtKerf(st.sheetKerf)) + ' kerf';
      }
      case 'planSet': {
        var settings = project.settings || {};
        var on = 0;
        if (settings.includeSheetLayout !== false) on++;
        if (settings.includeAssembly !== false) on++;
        if (settings.includeComponentDrawings !== false) on++;
        return on + ' of 3 drawing sections';
      }
      default:
        return '';
    }
  }

  function fmtKerf(v) { return isFinite(v) ? v : 0; }

  function updateSummaries() {
    var mode = CS.ui.app.state.inspectorMode;
    var cabinet = getCabinet();
    if (mode === 'cabinet' && cabinet) {
      Object.keys(OPEN_STATE.cabinet).forEach(function (id) {
        sectionSummary(id, cabinetSummaryFor(id, cabinet));
      });
    } else {
      Object.keys(OPEN_STATE.project).forEach(function (id) {
        sectionSummary(id, projectSummaryFor(id));
      });
    }
  }

  /* ───────────────────────────── Cabinet fields ───────────────────────────── */

  function buildIdentitySection(cabinet) {
    var typeValue = cabinet.type || 'base';
    var typeField = segmentedField({
      label: 'Cabinet type',
      path: 'type',
      values: [
        { value: 'base', label: 'Base', title: 'Base cabinet — floor standing, toe kick' },
        { value: 'wall', label: 'Wall', title: 'Wall cabinet — hangs on the wall' },
        { value: 'tall', label: 'Tall', title: 'Tall cabinet — floor to ceiling run' },
        { value: 'pantry', label: 'Pantry', title: 'Pantry / utility tall cabinet' }
      ],
      get: function () { return typeValue; },
      onChange: function (next) {
        var cabinetNow = getCabinet();
        if (!cabinetNow) return;
        // A type change carries sensible defaults for the type-specific sections.
        CS.ui.app.mutate(function (project) {
          var target = findCabinet(project, cabinetNow.id);
          if (!target) return false;
          target.type = next;
          if (!target.toeKick || typeof target.toeKick !== 'object') target.toeKick = {};
          if (next === 'wall') {
            target.toeKick.style = 'none';
          } else if (!target.toeKick.style || target.toeKick.style === 'none') {
            target.toeKick.style = 'separate-platform';
          }
          if (!target.hardware || typeof target.hardware !== 'object') target.hardware = {};
          target.hardware.hangingRail = next !== 'base';
          // Apply standard dimensions when the cabinet still carries the old type's standard.
          var oldStd = standardDims(typeValue);
          if (target.height === oldStd.height) {
            var newStd = standardDims(next);
            target.height = newStd.height;
            if (target.depth === oldStd.depth) target.depth = newStd.depth;
          }
        }, { source: 'inspector', cabinetId: cabinetNow.id, structural: true, reason: 'type' });
        render({ rebuild: true, focusPath: 'type' });
        CS.ui.app.renderRail();
      }
    });

    var tagField = textField({
      label: 'Tag',
      path: 'tag',
      labelNote: 'used in part numbers',
      maxLength: 8,
      get: function () { return cabinet.tag || ''; },
      onChange: function (value) {
        var cleaned = String(value || '').replace(/\s+/g, '').toUpperCase().slice(0, 8);
        setCabinetField('tag', cleaned, { refreshRail: true });
      }
    });
    var nameField = textField({
      label: 'Name',
      path: 'name',
      placeholder: 'e.g. Base — sink',
      get: function () { return cabinet.name || ''; },
      onChange: function (value) { setCabinetField('name', value, { refreshRail: true }); }
    });

    var notes = textAreaField({
      label: 'Cabinet notes',
      path: 'notes',
      rows: 2,
      placeholder: 'Shop notes for this cabinet (visible on the plan set)',
      get: function () { return cabinet.notes || ''; },
      onChange: function (value) { setCabinetField('notes', value); }
    });

    return section({
      id: 'identity',
      title: 'Cabinet',
      summary: cabinetSummaryFor('identity', cabinet),
      children: [
        el('div', { className: 'field-row' }, [tagField, nameField]),
        typeField,
        notes
      ]
    });
  }

  function findCabinet(project, id) {
    if (!project || !Array.isArray(project.cabinets)) return null;
    for (var i = 0; i < project.cabinets.length; i++) {
      if (project.cabinets[i].id === id) return project.cabinets[i];
    }
    return null;
  }

  function buildDimensionsSection(cabinet) {
    var type = cabinet.type || 'base';
    var std = standardDims(type);
    var model = getModel();
    var dims = model && model.dims ? model.dims : null;

    var widthPresets = standardWidths().slice(0, 8).map(function (w) {
      return { value: w, label: fmtShort(w), title: 'Standard width ' + fmt(w) };
    });
    var widthField = lengthField({
      label: 'Width',
      path: 'width',
      unit: true,
      min: 120,
      max: 1800,
      get: function () { return getCabinet().width; },
      onChange: function (mm) { setCabinetField('width', mm, { refreshRail: true }); }
    });
    var heightField = lengthField({
      label: 'Height',
      path: 'height',
      unit: true,
      min: 100,
      max: 2600,
      labelNote: type === 'base' || type === 'tall' ? 'includes toe kick' : 'bottom to top',
      get: function () { return getCabinet().height; },
      onChange: function (mm) { setCabinetField('height', mm, { refreshRail: true }); }
    });
    var depthField = lengthField({
      label: 'Depth',
      path: 'depth',
      unit: true,
      min: 100,
      max: 1000,
      labelNote: 'excluding fronts',
      get: function () { return getCabinet().depth; },
      onChange: function (mm) { setCabinetField('depth', mm, { refreshRail: true }); }
    });

    var widthRow = el('div', null, [
      widthField,
      presetRow({
        label: 'Standard widths',
        presets: widthPresets,
        get: function () { return getCabinet().width; },
        onChange: function (mm) { setCabinetField('width', mm, { refreshRail: true }); render({ rebuild: true, focusPath: 'width' }); }
      })
    ]);

    var heightDepthRow = el('div', { className: 'field-row' }, [heightField, depthField]);
    var heightPresetValues = heightPresets(type).map(function (mm) {
      return { value: mm, label: fmt(mm), title: 'Standard height ' + fmt(mm) };
    });
    var heightPresetRow = presetRow({
      label: 'Standard heights',
      presets: heightPresetValues,
      get: function () { return getCabinet().height; },
      onChange: function (mm) {
        setCabinetField('height', mm, { refreshRail: true });
        render({ rebuild: true, focusPath: 'height' });
      }
    });
    var stdRow = el('div', { className: 'inline-presets' }, [
      el('button', {
        className: 'preset-chip', type: 'button',
        title: 'Restore the standard ' + typeLabel(type).toLowerCase() + ' size',
        text: 'Standard size',
        on: {
          click: function () {
            var cabinetNow = getCabinet();
            if (!cabinetNow) return;
            var standard = standardDims(cabinetNow.type || 'base');
            var curWidth = cabinetNow.width;
            CS.ui.app.mutate(function (project) {
              var target = findCabinet(project, cabinetNow.id);
              if (!target) return false;
              target.width = curWidth;
              target.height = standard.height;
              target.depth = standard.depth;
            }, { source: 'inspector', cabinetId: cabinetNow.id, structural: false, reason: 'standard-size' });
            render({ rebuild: true, focusPath: 'height' });
            CS.ui.app.renderRail();
          }
        }
      }),
      el('button', {
        className: 'preset-chip', type: 'button',
        title: 'Make the depth the standard ' + typeLabel(type).toLowerCase() + ' depth',
        text: 'Depth ' + fmt(std.depth),
        on: {
          click: function () {
            setCabinetField('depth', std.depth, { refreshRail: true });
            render({ rebuild: true, focusPath: 'depth' });
          }
        }
      })
    ]);

    var readout = buildDimensionReadout(dims, cabinet);

    return section({
      id: 'dimensions',
      title: 'Dimensions',
      summary: cabinetSummaryFor('dimensions', cabinet),
      children: [
        widthRow,
        heightDepthRow,
        heightPresetRow,
        stdRow,
        readout
      ]
    });
  }

  function buildDimensionReadout(dims, cabinet) {
    var wrap = el('div', { className: 'dim-readout', dataset: { dimReadout: '1' } });
    if (!dims) {
      wrap.appendChild(el('div', { className: 'dim-readout-note', text: 'Derived interior dimensions appear once the engine resolves this cabinet.' }));
      return wrap;
    }
    function cell(label, value) {
      return el('div', { className: 'dim-readout-cell' }, [
        el('span', { className: 'dim-readout-label', text: label }),
        el('span', { className: 'dim-readout-value', text: value })
      ]);
    }
    var cells = [
      cell('Interior width', fmt(dims.interiorWidth)),
      cell('Interior height', fmt(dims.interiorHeight)),
      cell('Front height', fmt(dims.frontHeight))
    ];
    if (isFinite(dims.toeKickHeight) && dims.toeKickHeight > 0) cells.push(cell('Toe kick', fmt(dims.toeKickHeight)));
    if (isFinite(dims.carcassDepth)) cells.push(cell('Carcass depth', fmt(dims.carcassDepth)));
    cells.forEach(function (c) { wrap.appendChild(c); });
    return wrap;
  }

  function buildConstructionSection(cabinet) {
    var c = cabinet.construction || {};
    var material = materialMeta(c.carcassMaterial);
    var materialThickness = material && isFinite(material.thickness) ? material.thickness : null;
    var derivedThickness = isFinite(c.carcassThickness) ? c.carcassThickness : materialThickness;
    var thicknessIsOverride = materialThickness !== null && isFinite(c.carcassThickness) &&
      Math.abs(c.carcassThickness - materialThickness) > 0.01;

    var system = segmentedField({
      label: 'Construction system',
      path: 'construction.system',
      values: [
        { value: 'frameless', label: 'Frameless', title: 'European 32 mm system — full-overlay fronts' },
        { value: 'faceframe', label: 'Face frame', title: 'Face frame applied to the carcass front' }
      ],
      get: function () { return (getCabinet().construction || {}).system || 'frameless'; },
      onChange: function (value) {
        setCabinetField('construction.system', value, { structural: true, focusPath: 'construction.system', reason: 'construction-system' });
      }
    });

    var materialField = selectField({
      label: 'Carcass material',
      path: 'construction.carcassMaterial',
      values: materialList(),
      get: function () { return (getCabinet().construction || {}).carcassMaterial; },
      onChange: function (value) {
        setCabinetField('construction.carcassMaterial', value, { refreshRail: true });
        var meta = materialMeta(value);
        if (meta && isFinite(meta.thickness)) {
          // Match the carcass thickness to the material (the explicit override stays available).
          setCabinetField('construction.carcassThickness', meta.thickness);
        }
        render({ rebuild: true, focusPath: 'construction.carcassMaterial' });
      }
    });

    var thicknessField = lengthField({
      label: 'Carcass thickness',
      path: 'construction.carcassThickness',
      unit: true,
      min: 6,
      max: 30,
      hint: materialThickness !== null
        ? (thicknessIsOverride ? 'Overridden — material is ' + fmt(materialThickness) : 'Matches the selected material.')
        : 'Never thicker than half the dado depth.',
      get: function () { return (getCabinet().construction || {}).carcassThickness; },
      onChange: function (mm) { setCabinetField('construction.carcassThickness', mm); }
    });

    var joinery = optionSelectField('carcassJoinery', {
      label: 'Carcass joinery',
      path: 'construction.joinery',
      get: function () { return (getCabinet().construction || {}).joinery; },
      onChange: function (value) { setCabinetField('construction.joinery', value); render({ rebuild: true, focusPath: 'construction.joinery' }); }
    });

    var backStyle = optionSelectField('backStyle', {
      label: 'Back style',
      path: 'construction.backStyle',
      get: function () { return (getCabinet().construction || {}).backStyle; },
      onChange: function (value) { setCabinetField('construction.backStyle', value, { structural: true, focusPath: 'construction.backStyle' }); }
    });

    var backMaterial = selectField({
      label: 'Back material',
      path: 'construction.backMaterial',
      values: materialList(),
      get: function () { return (getCabinet().construction || {}).backMaterial; },
      onChange: function (value) {
        setCabinetField('construction.backMaterial', value);
        var meta = materialMeta(value);
        if (meta && isFinite(meta.thickness)) setCabinetField('construction.backThickness', meta.thickness);
        render({ rebuild: true, focusPath: 'construction.backMaterial' });
      }
    });

    var backThickness = lengthField({
      label: 'Back thickness',
      path: 'construction.backThickness',
      unit: true, min: 3, max: 20,
      get: function () { return (getCabinet().construction || {}).backThickness; },
      onChange: function (mm) { setCabinetField('construction.backThickness', mm); }
    });

    var backRecess = lengthField({
      label: 'Back recess',
      path: 'construction.backRecess',
      unit: true, min: 0, max: 40,
      hint: 'Set the applied back in from the rear edge.',
      get: function () { return (getCabinet().construction || {}).backRecess; },
      onChange: function (mm) { setCabinetField('construction.backRecess', mm); }
    });

    var dadoDepth = lengthField({
      label: 'Dado depth',
      path: 'construction.dadoDepth',
      unit: true, min: 1, max: 15,
      get: function () { return (getCabinet().construction || {}).dadoDepth; },
      onChange: function (mm) { setCabinetField('construction.dadoDepth', mm); }
    });

    var shelfSystem = optionSelectField('shelfSystem', {
      label: 'Shelf system',
      path: 'construction.shelfSystem',
      get: function () { return (getCabinet().construction || {}).shelfSystem; },
      onChange: function (value) { setCabinetField('construction.shelfSystem', value, { structural: true, focusPath: 'construction.shelfSystem' }); }
    });

    var pinDiameter = lengthField({
      label: 'Pin diameter',
      path: 'construction.shelfPinDiameter',
      unit: true, min: 3, max: 8,
      get: function () { return (getCabinet().construction || {}).shelfPinDiameter; },
      onChange: function (mm) { setCabinetField('construction.shelfPinDiameter', mm); }
    });

    var pinSpacing = lengthField({
      label: 'Pin pitch',
      path: 'construction.shelfPinSpacing',
      unit: true, min: 16, max: 100,
      get: function () { return (getCabinet().construction || {}).shelfPinSpacing; },
      onChange: function (mm) { setCabinetField('construction.shelfPinSpacing', mm); }
    });

    var pinSetback = lengthField({
      label: 'Pin front setback',
      path: 'construction.shelfPinFrontSetback',
      unit: true, min: 10, max: 80,
      get: function () { return (getCabinet().construction || {}).shelfPinFrontSetback; },
      onChange: function (mm) { setCabinetField('construction.shelfPinFrontSetback', mm); }
    });

    var edgeband = optionSelectField('edgeBanding', {
      label: 'Carcass edgeband',
      path: 'construction.edgeBanding',
      get: function () { return (getCabinet().construction || {}).edgeBanding; },
      onChange: function (value) { setCabinetField('construction.edgeBanding', value); }
    });

    var children = [
      system,
      materialField,
      thicknessField,
      joinery,
      el('div', { className: 'divider' }),
      el('div', { className: 'field-row' }, [backStyle, backMaterial]),
      el('div', { className: 'field-row' }, [backThickness, backRecess]),
      dadoDepth,
      shelfSystem
    ];
    if ((c.shelfSystem || 'adjustable-pins-32').indexOf('adjustable') >= 0) {
      children.push(el('div', { className: 'field-row-3' }, [pinDiameter, pinSpacing, pinSetback]));
    }
    children.push(edgeband);

    return section({
      id: 'construction',
      title: 'Construction',
      summary: cabinetSummaryFor('construction', cabinet),
      children: children
    });
  }

  function buildFaceFrameSection(cabinet) {
    var c = cabinet.construction || {};
    var ff = cabinet.faceFrame || {};
    var disabled = c.system !== 'faceframe';
    var standard = currentStandardTable();
    var ffStd = standard && standard.faceFrame;
    var stileStd = ffStd && isFinite(ffStd.stileWidth) ? ffStd.stileWidth : 57.15;

    var material = selectField({
      label: 'Frame material',
      path: 'faceFrame.material',
      values: materialList(),
      get: function () { return (getCabinet().faceFrame || {}).material; },
      onChange: function (value) { setCabinetField('faceFrame.material', value); }
    });
    var thickness = lengthField({
      label: 'Frame thickness', path: 'faceFrame.thickness', unit: true, min: 10, max: 30,
      get: function () { return (getCabinet().faceFrame || {}).thickness; },
      onChange: function (mm) { setCabinetField('faceFrame.thickness', mm); }
    });
    var stile = lengthField({
      label: 'Stile width', path: 'faceFrame.stileWidth', unit: true, min: 20, max: 120,
      get: function () { return (getCabinet().faceFrame || {}).stileWidth; },
      onChange: function (mm) { setCabinetField('faceFrame.stileWidth', mm); }
    });
    var topRail = lengthField({
      label: 'Top rail', path: 'faceFrame.topRailWidth', unit: true, min: 20, max: 150,
      get: function () { return (getCabinet().faceFrame || {}).topRailWidth; },
      onChange: function (mm) { setCabinetField('faceFrame.topRailWidth', mm); }
    });
    var bottomRail = lengthField({
      label: 'Bottom rail', path: 'faceFrame.bottomRailWidth', unit: true, min: 20, max: 150,
      get: function () { return (getCabinet().faceFrame || {}).bottomRailWidth; },
      onChange: function (mm) { setCabinetField('faceFrame.bottomRailWidth', mm); }
    });
    var midRail = lengthField({
      label: 'Mid rail', path: 'faceFrame.midRailWidth', unit: true, min: 20, max: 150,
      get: function () { return (getCabinet().faceFrame || {}).midRailWidth; },
      onChange: function (mm) { setCabinetField('faceFrame.midRailWidth', mm); }
    });
    var joinery = optionSelectField('faceFrameJoinery', {
      label: 'Frame joinery', path: 'faceFrame.joinery',
      get: function () { return (getCabinet().faceFrame || {}).joinery; },
      onChange: function (value) { setCabinetField('faceFrame.joinery', value); }
    });
    var stilePresets = presetRow({
      label: 'Stile presets',
      presets: [
        { value: 44.45, label: '1¾"' },
        { value: 57.15, label: '2¼"' },
        { value: 63.5, label: '2½"' },
        { value: 76.2, label: '3"' }
      ],
      get: function () { return (getCabinet().faceFrame || {}).stileWidth || stileStd; },
      onChange: function (mm) { setCabinetField('faceFrame.stileWidth', mm); render({ rebuild: true, focusPath: 'faceFrame.stileWidth' }); }
    });

    return section({
      id: 'faceFrame',
      title: 'Face frame',
      summary: cabinetSummaryFor('faceFrame', cabinet),
      disabled: disabled,
      disabledNote: 'Set the construction system to Face frame first.',
      note: disabled ? 'Face frames are only used by face-frame cabinets. Switch the construction system to edit these values.' : null,
      children: [
        el('div', { className: 'field-row' }, [material, thickness]),
        stile,
        stilePresets,
        el('div', { className: 'field-row-3' }, [topRail, bottomRail, midRail]),
        joinery
      ]
    });
  }

  function buildToeKickSection(cabinet) {
    var tk = cabinet.toeKick || {};
    var disabled = cabinet.type === 'wall';

    var style = optionSelectField('toeKickStyle', {
      label: 'Toe kick style', path: 'toeKick.style',
      get: function () { return (getCabinet().toeKick || {}).style; },
      onChange: function (value) { setCabinetField('toeKick.style', value, { structural: true, focusPath: 'toeKick.style' }); }
    });
    var height = lengthField({
      label: 'Toe kick height', path: 'toeKick.height', unit: true, min: 50, max: 250,
      get: function () { return (getCabinet().toeKick || {}).height; },
      onChange: function (mm) { setCabinetField('toeKick.height', mm, { refreshRail: true }); }
    });
    var setback = lengthField({
      label: 'Setback', path: 'toeKick.setback', unit: true, min: 0, max: 200,
      hint: 'Platform set back from the cabinet front.',
      get: function () { return (getCabinet().toeKick || {}).setback; },
      onChange: function (mm) { setCabinetField('toeKick.setback', mm); }
    });
    var material = selectField({
      label: 'Toe kick material', path: 'toeKick.material', values: materialList(),
      get: function () { return (getCabinet().toeKick || {}).material; },
      onChange: function (value) { setCabinetField('toeKick.material', value); }
    });
    var finishedFace = checkField({
      label: 'Finished face', path: 'toeKick.finishedFace',
      hint: 'Show a finished face on the platform front.',
      get: function () { return !!(getCabinet().toeKick || {}).finishedFace; },
      onChange: function (value) { setCabinetField('toeKick.finishedFace', value); }
    });
    var heightPresets = presetRow({
      label: 'Toe kick height presets',
      presets: [
        { value: 101.6, label: '4"', title: 'Standard kitchen toe kick (101.6 mm)' },
        { value: 127, label: '5"' },
        { value: 76.2, label: '3"' }
      ],
      get: function () { return (getCabinet().toeKick || {}).height; },
      onChange: function (mm) { setCabinetField('toeKick.height', mm, { refreshRail: true }); render({ rebuild: true, focusPath: 'toeKick.height' }); }
    });

    return section({
      id: 'toeKick',
      title: 'Toe kick',
      summary: cabinetSummaryFor('toeKick', cabinet),
      disabled: disabled,
      disabledNote: 'Wall cabinets have no toe kick.',
      note: disabled ? 'Wall cabinets hang above the counter — toe kick settings are not used. Switch the cabinet type to edit them.' : null,
      children: [
        style,
        el('div', { className: 'field-row' }, [height, setback]),
        heightPresets,
        el('div', { className: 'field-row' }, [material, finishedFace])
      ]
    });
  }

  function buildInteriorSection(cabinet) {
    var interior = cabinet.interior || {};
    var adj = numberField({
      label: 'Adjustable shelves', path: 'interior.adjustableShelves', integer: true, min: 0, max: 8,
      get: function () { return (getCabinet().interior || {}).adjustableShelves; },
      onChange: function (value) { setCabinetField('interior.adjustableShelves', value); render({ rebuild: true, focusPath: 'interior.adjustableShelves' }); }
    });
    var fixed = numberField({
      label: 'Fixed shelves', path: 'interior.fixedShelves', integer: true, min: 0, max: 6,
      get: function () { return (getCabinet().interior || {}).fixedShelves; },
      onChange: function (value) { setCabinetField('interior.fixedShelves', value); render({ rebuild: true, focusPath: 'interior.fixedShelves' }); }
    });
    var shelfThickness = lengthField({
      label: 'Shelf thickness', path: 'interior.shelfThickness', unit: true, min: 10, max: 30,
      get: function () { return (getCabinet().interior || {}).shelfThickness; },
      onChange: function (mm) { setCabinetField('interior.shelfThickness', mm); }
    });
    var shelfMaterial = selectField({
      label: 'Shelf material', path: 'interior.shelfMaterial', values: materialList(),
      get: function () { return (getCabinet().interior || {}).shelfMaterial; },
      onChange: function (value) {
        setCabinetField('interior.shelfMaterial', value);
        var meta = materialMeta(value);
        if (meta && isFinite(meta.thickness)) setCabinetField('interior.shelfThickness', meta.thickness);
        render({ rebuild: true, focusPath: 'interior.shelfMaterial' });
      }
    });
    var shelfSetback = lengthField({
      label: 'Shelf front setback', path: 'interior.shelfFrontSetback', unit: true, min: 0, max: 100,
      get: function () { return (getCabinet().interior || {}).shelfFrontSetback; },
      onChange: function (mm) { setCabinetField('interior.shelfFrontSetback', mm); }
    });
    var shelfEdgeband = optionSelectField('edgeBanding', {
      label: 'Shelf edgeband', path: 'interior.shelfEdgeband',
      get: function () { return (getCabinet().interior || {}).shelfEdgeband; },
      onChange: function (value) { setCabinetField('interior.shelfEdgeband', value); }
    });
    return section({
      id: 'interior',
      title: 'Interior',
      summary: cabinetSummaryFor('interior', cabinet),
      children: [
        el('div', { className: 'field-row' }, [adj, fixed]),
        el('div', { className: 'field-row' }, [shelfThickness, shelfMaterial]),
        shelfSetback,
        shelfEdgeband,
        el('div', { className: 'field-hint', text: 'Shelf span over 900 mm should be checked for sag before you cut. Vertical dividers are not used in this version.' })
      ]
    });
  }

  function buildFrontSection(cabinet) {
    var front = cabinet.front || {};
    var frontType = front.type || 'doors';

    var typeField = segmentedField({
      label: 'Front type',
      path: 'front.type',
      values: [
        { value: 'doors', label: 'Doors', title: 'One or two doors' },
        { value: 'drawer-stack', label: 'Drawers', title: 'Stack of drawer fronts' },
        { value: 'door-drawer', label: 'Door + drawer', title: 'Drawer at the top, doors below' },
        { value: 'open', label: 'Open', title: 'No fronts' }
      ],
      get: function () { return (getCabinet().front || {}).type || 'doors'; },
      onChange: function (value) {
        setCabinetField('front.type', value, { structural: true, focusPath: 'front.type', reason: 'front-type' });
      }
    });

    var children = [typeField];

    if (frontType === 'doors' || frontType === 'door-drawer') {
      children.push(buildDoorFields(cabinet, frontType === 'door-drawer'));
    }
    if (frontType === 'drawer-stack' || frontType === 'door-drawer') {
      children.push(buildDrawerFields(cabinet, frontType === 'door-drawer'));
    }
    if (frontType === 'open') {
      children.push(el('div', { className: 'insp-section-note', text: 'Open cabinet — no doors or drawer fronts. Useful for a shelf unit or a niche.' }));
    }

    var reveal = lengthField({
      label: 'Reveal / gap', path: 'front.reveal', unit: true, min: 0, max: 12,
      hint: 'Gap at outside edges and between fronts.',
      get: function () { return (getCabinet().front || {}).reveal; },
      onChange: function (mm) { setCabinetField('front.reveal', mm); }
    });
    children.push(el('div', { className: 'divider' }));
    children.push(reveal);

    return section({
      id: 'front',
      title: 'Fronts',
      summary: cabinetSummaryFor('front', cabinet),
      children: children
    });
  }

  function buildDoorFields(cabinet, isCombined) {
    var doors = (cabinet.front || {}).doors || {};
    var style = doors.style || 'shaker';

    var count = numberField({
      label: 'Door count', path: 'front.doors.count', integer: true, min: 1, max: 4, labelNote: 'per cabinet',
      get: function () { return ((getCabinet().front || {}).doors || {}).count; },
      onChange: function (value) { setCabinetField('front.doors.count', value, { refreshRail: true }); render({ rebuild: true, focusPath: 'front.doors.count' }); }
    });
    var doorStyle = optionSelectField('doorStyle', {
      label: 'Door style', path: 'front.doors.style',
      get: function () { return ((getCabinet().front || {}).doors || {}).style; },
      onChange: function (value) { setCabinetField('front.doors.style', value, { structural: true, focusPath: 'front.doors.style' }); }
    });
    var material = selectField({
      label: 'Door material', path: 'front.doors.material', values: materialList(),
      get: function () { return ((getCabinet().front || {}).doors || {}).material; },
      onChange: function (value) { setCabinetField('front.doors.material', value); }
    });
    var thickness = lengthField({
      label: 'Door thickness', path: 'front.doors.thickness', unit: true, min: 12, max: 30,
      get: function () { return ((getCabinet().front || {}).doors || {}).thickness; },
      onChange: function (mm) { setCabinetField('front.doors.thickness', mm); }
    });
    var overlay = segmentedField({
      label: 'Overlay', path: 'front.doors.overlay',
      values: [
        { value: 'full', label: 'Full overlay', title: 'Door covers the cabinet face' },
        { value: 'inset', label: 'Inset', title: 'Door sits inside the face frame / carcass opening' }
      ],
      get: function () { return ((getCabinet().front || {}).doors || {}).overlay || 'full'; },
      onChange: function (value) { setCabinetField('front.doors.overlay', value, { structural: true, focusPath: 'front.doors.overlay' }); }
    });
    var stile = lengthField({
      label: 'Door stile width', path: 'front.doors.stileWidth', unit: true, min: 20, max: 120,
      get: function () { return ((getCabinet().front || {}).doors || {}).stileWidth; },
      onChange: function (mm) { setCabinetField('front.doors.stileWidth', mm); }
    });
    var rail = lengthField({
      label: 'Door rail width', path: 'front.doors.railWidth', unit: true, min: 20, max: 150,
      get: function () { return ((getCabinet().front || {}).doors || {}).railWidth; },
      onChange: function (mm) { setCabinetField('front.doors.railWidth', mm); }
    });
    var joinery = optionSelectField('doorJoinery', {
      label: 'Door joinery', path: 'front.doors.doorJoinery',
      get: function () { return ((getCabinet().front || {}).doors || {}).doorJoinery; },
      onChange: function (value) { setCabinetField('front.doors.doorJoinery', value); }
    });
    var stiffeners = presetRow({
      label: 'Door stile presets',
      presets: [
        { value: 44.45, label: '1¾"' },
        { value: 57.15, label: '2¼"' },
        { value: 63.5, label: '2½"' }
      ],
      get: function () { return ((getCabinet().front || {}).doors || {}).stileWidth || 57.15; },
      onChange: function (mm) {
        setCabinetField('front.doors.stileWidth', mm);
        setCabinetField('front.doors.railWidth', mm);
        render({ rebuild: true, focusPath: 'front.doors.stileWidth' });
      }
    });

    var children = [
      el('div', { className: 'sub-card' }, [
        el('div', { className: 'sub-card-head' }, [icon('door'), el('span', { text: isCombined ? 'Doors below' : 'Doors' })]),
        el('div', { className: 'field-row' }, [count, doorStyle]),
        el('div', { className: 'field-row' }, [material, thickness]),
        overlay,
        el('div', { className: 'field-row' }, [stile, rail]),
        stiffeners,
        joinery
      ])
    ];

    var frameStyles = ['shaker', 'raised-panel', 'beadboard', 'glass', 'mullion-glass'];
    if (frameStyles.indexOf(style) >= 0) {
      var panelMaterial = selectField({
        label: 'Panel material', path: 'front.doors.panelMaterial', values: materialList(),
        get: function () { return ((getCabinet().front || {}).doors || {}).panelMaterial; },
        onChange: function (value) { setCabinetField('front.doors.panelMaterial', value); }
      });
      var panelThickness = lengthField({
        label: 'Panel thickness', path: 'front.doors.panelThickness', unit: true, min: 3, max: 25,
        get: function () { return ((getCabinet().front || {}).doors || {}).panelThickness; },
        onChange: function (mm) { setCabinetField('front.doors.panelThickness', mm); }
      });
      var panelStyle = selectField({
        label: 'Panel style', path: 'front.doors.panelStyle',
        values: [
          { value: 'recessed', label: 'Recessed (shaker)' },
          { value: 'raised', label: 'Raised' },
          { value: 'flat', label: 'Flat' },
          { value: 'beadboard', label: 'Beadboard' },
          { value: 'glass', label: 'Glass' }
        ],
        get: function () { return ((getCabinet().front || {}).doors || {}).panelStyle; },
        onChange: function (value) { setCabinetField('front.doors.panelStyle', value, { structural: true, focusPath: 'front.doors.panelStyle' }); }
      });
      var isGlass = style === 'glass' || style === 'mullion-glass' || panelStyle === 'glass';
      var glassThickness = isGlass ? lengthField({
        label: 'Glass thickness', path: 'front.doors.glassThickness', unit: true, min: 2, max: 8,
        get: function () { return ((getCabinet().front || {}).doors || {}).glassThickness; },
        onChange: function (mm) { setCabinetField('front.doors.glassThickness', mm); }
      }) : null;
      var beadSpacing = style === 'beadboard' ? lengthField({
        label: 'Bead spacing', path: 'front.doors.beadSpacing', unit: true, min: 20, max: 150,
        get: function () { return ((getCabinet().front || {}).doors || {}).beadSpacing; },
        onChange: function (mm) { setCabinetField('front.doors.beadSpacing', mm); }
      }) : null;
      var muntins = isGlass ? numberField({
        label: 'Vertical muntins', path: 'front.doors.muntins', integer: true, min: 0, max: 6,
        get: function () { return ((getCabinet().front || {}).doors || {}).muntins; },
        onChange: function (value) { setCabinetField('front.doors.muntins', value); }
      }) : null;
      children.push(el('div', { className: 'sub-card' }, [
        el('div', { className: 'sub-card-head' }, [icon('panel'), el('span', { text: 'Frame & panel' })]),
        el('div', { className: 'field-row' }, [panelMaterial, panelThickness]),
        panelStyle,
        isGlass ? el('div', { className: 'field-row' }, [glassThickness, muntins]) : null,
        beadSpacing
      ]));
    }

    var hingeType = optionSelectField('hingeType', {
      label: 'Hinge type', path: 'front.doors.hingeType',
      get: function () { return ((getCabinet().front || {}).doors || {}).hingeType; },
      onChange: function (value) { setCabinetField('front.doors.hingeType', value); }
    });
    var hingeCount = selectField({
      label: 'Hinges per door', path: 'front.doors.hingeCount',
      values: [
        { value: 'auto', label: 'Auto (by door height)' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
        { value: '4', label: '4' },
        { value: '5', label: '5' },
        { value: '6', label: '6' }
      ],
      get: function () { return String(((getCabinet().front || {}).doors || {}).hingeCount || 'auto'); },
      onChange: function (value) { setCabinetField('front.doors.hingeCount', value === 'auto' ? 'auto' : parseInt(value, 10)); }
    });
    var hingeSide = selectField({
      label: 'Hinge side', path: 'front.doors.hingeSide',
      values: [
        { value: 'auto', label: 'Auto (left leaf / right leaf)' },
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' }
      ],
      get: function () { return ((getCabinet().front || {}).doors || {}).hingeSide || 'auto'; },
      onChange: function (value) { setCabinetField('front.doors.hingeSide', value); }
    });
    children.push(el('div', { className: 'sub-card' }, [
      el('div', { className: 'sub-card-head' }, [icon('hinge'), el('span', { text: 'Hinging' })]),
      el('div', { className: 'field-row' }, [hingeType, hingeCount]),
      hingeSide,
      el('div', { className: 'field-hint', text: '35 mm cup hinge: cup centre ' + fmtShort(22.5) + ' from the hinge edge.' })
    ]));

    return children;
  }

  function buildDrawerFields(cabinet, isCombined) {
    var drawers = (cabinet.front || {}).drawers || {};
    var front = cabinet.front || {};
    var isAuto = drawers.heights === null || drawers.heights === undefined || !Array.isArray(drawers.heights);

    var count = numberField({
      label: 'Drawer count', path: 'front.drawers.count', integer: true, min: 1, max: 6, labelNote: 'fronts',
      get: function () { return ((getCabinet().front || {}).drawers || {}).count; },
      onChange: function (value) {
        var cabinetNow = getCabinet();
        if (!cabinetNow) return;
        var nextCount = Math.max(1, Math.min(6, value));
        CS.ui.app.mutate(function (project) {
          var target = findCabinet(project, cabinetNow.id);
          if (!target) return false;
          if (!target.front) target.front = {};
          if (!target.front.drawers) target.front.drawers = {};
          var dr = target.front.drawers;
          dr.count = nextCount;
          if (Array.isArray(dr.heights)) {
            var ideal = suggestHeights(target);
            var heights = [];
            for (var i = 0; i < nextCount; i++) heights.push(dr.heights[i] || ideal[i] || 177.8);
            dr.heights = heights;
          }
        }, { source: 'inspector', cabinetId: cabinetNow.id, structural: false, reason: 'drawer-count' });
        render({ rebuild: true, focusPath: 'front.drawers.count' });
        CS.ui.app.renderRail();
      }
    });
    var style = optionSelectField('drawerFrontStyle', {
      label: 'Front style', path: 'front.drawers.style',
      get: function () { return ((getCabinet().front || {}).drawers || {}).style; },
      onChange: function (value) { setCabinetField('front.drawers.style', value, { structural: true, focusPath: 'front.drawers.style' }); }
    });
    var material = selectField({
      label: 'Front material', path: 'front.drawers.material', values: materialList(),
      get: function () { return ((getCabinet().front || {}).drawers || {}).material; },
      onChange: function (value) { setCabinetField('front.drawers.material', value); }
    });
    var thickness = lengthField({
      label: 'Front thickness', path: 'front.drawers.thickness', unit: true, min: 12, max: 30,
      get: function () { return ((getCabinet().front || {}).drawers || {}).thickness; },
      onChange: function (mm) { setCabinetField('front.drawers.thickness', mm); }
    });
    var boxMaterial = selectField({
      label: 'Box material', path: 'front.drawers.boxMaterial', values: materialList(),
      get: function () { return ((getCabinet().front || {}).drawers || {}).boxMaterial; },
      onChange: function (value) {
        setCabinetField('front.drawers.boxMaterial', value);
        var meta = materialMeta(value);
        if (meta && isFinite(meta.thickness)) setCabinetField('front.drawers.boxSideThickness', meta.thickness);
        render({ rebuild: true, focusPath: 'front.drawers.boxMaterial' });
      }
    });
    var boxJoinery = optionSelectField('drawerJoinery', {
      label: 'Box joinery', path: 'front.drawers.boxJoinery',
      get: function () { return ((getCabinet().front || {}).drawers || {}).boxJoinery; },
      onChange: function (value) { setCabinetField('front.drawers.boxJoinery', value); }
    });
    var boxSide = lengthField({
      label: 'Box side thickness', path: 'front.drawers.boxSideThickness', unit: true, min: 8, max: 20,
      get: function () { return ((getCabinet().front || {}).drawers || {}).boxSideThickness; },
      onChange: function (mm) { setCabinetField('front.drawers.boxSideThickness', mm); }
    });
    var boxBottom = lengthField({
      label: 'Box bottom thickness', path: 'front.drawers.boxBottomThickness', unit: true, min: 3, max: 15,
      get: function () { return ((getCabinet().front || {}).drawers || {}).boxBottomThickness; },
      onChange: function (mm) { setCabinetField('front.drawers.boxBottomThickness', mm); }
    });
    var boxBottomJoinery = selectField({
      label: 'Bottom joinery', path: 'front.drawers.boxBottomJoinery',
      values: [
        { value: 'dado', label: 'Dado' },
        { value: 'rabbet', label: 'Rabbet' }
      ],
      get: function () { return ((getCabinet().front || {}).drawers || {}).boxBottomJoinery; },
      onChange: function (value) { setCabinetField('front.drawers.boxBottomJoinery', value); }
    });
    var slide = optionSelectField('drawerSlide', {
      label: 'Drawer slide', path: 'front.drawers.slide',
      get: function () { return ((getCabinet().front || {}).drawers || {}).slide; },
      onChange: function (value) { setCabinetField('front.drawers.slide', value); render({ rebuild: true, focusPath: 'front.drawers.slide' }); }
    });
    var boxHeightAllowance = lengthField({
      label: 'Box height allowance', path: 'front.drawers.boxHeightAllowance', unit: true, min: 0, max: 80,
      hint: 'Front height minus allowance = box height.',
      get: function () { return ((getCabinet().front || {}).drawers || {}).boxHeightAllowance; },
      onChange: function (mm) { setCabinetField('front.drawers.boxHeightAllowance', mm); }
    });

    var autoHeightsField = checkField({
      label: 'Automatic drawer heights', path: 'front.drawers.auto',
      hint: 'Distribute the opening automatically (recommended while laying out).',
      get: function () { return isAuto; },
      onChange: function (value) {
        var cabinetNow = getCabinet();
        if (!cabinetNow) return;
        CS.ui.app.mutate(function (project) {
          var target = findCabinet(project, cabinetNow.id);
          if (!target || !target.front || !target.front.drawers) return false;
          if (value) {
            target.front.drawers.heights = null;
          } else {
            var ideal = suggestHeights(target);
            var n = target.front.drawers.count || 3;
            var heights = [];
            for (var i = 0; i < n; i++) heights.push(ideal[i] || 177.8);
            target.front.drawers.heights = heights;
          }
        }, { source: 'inspector', cabinetId: cabinetNow.id, structural: true, reason: 'drawer-heights' });
        render({ rebuild: true, focusPath: 'front.drawers.auto' });
      }
    });

    var heightFields = [];
    if (!isAuto) {
      var heights = drawers.heights || [];
      var n = Math.max(1, Math.min(6, drawers.count || heights.length || 3));
      for (var i = 0; i < n; i++) {
        (function (index) {
          var hf = lengthField({
            label: 'Front ' + (index + 1) + ' height',
            path: 'front.drawers.heights.' + index,
            unit: true, min: 60, max: 600,
            get: function () {
              var dr = (getCabinet().front || {}).drawers || {};
              return Array.isArray(dr.heights) ? dr.heights[index] : null;
            },
            onChange: function (mm) {
              var cabinetNow = getCabinet();
              if (!cabinetNow) return;
              CS.ui.app.mutate(function (project) {
                var target = findCabinet(project, cabinetNow.id);
                if (!target || !target.front || !target.front.drawers) return false;
                var dr = target.front.drawers;
                if (!Array.isArray(dr.heights)) dr.heights = suggestHeights(target);
                while (dr.heights.length < index + 1) dr.heights.push(177.8);
                dr.heights[index] = mm;
              }, { source: 'inspector', cabinetId: cabinetNow.id, structural: false, reason: 'drawer-heights' });
            }
          });
          heightFields.push(hf);
        })(i);
      }
    }

    var combinedFields = isCombined ? el('div', { className: 'sub-card' }, [
      el('div', { className: 'sub-card-head' }, [icon('drawer'), el('span', { text: 'Combined front layout' })]),
      el('div', { className: 'field-row' }, [
        lengthField({
          label: 'Top drawer height', path: 'front.combined.drawerHeight', unit: true, min: 60, max: 400,
          get: function () { return ((getCabinet().front || {}).combined || {}).drawerHeight; },
          onChange: function (mm) { setCabinetField('front.combined.drawerHeight', mm); }
        }),
        numberField({
          label: 'Doors below', path: 'front.combined.doorsBelow', integer: true, min: 1, max: 2,
          get: function () { return ((getCabinet().front || {}).combined || {}).doorsBelow; },
          onChange: function (value) { setCabinetField('front.combined.doorsBelow', value); render({ rebuild: true, focusPath: 'front.combined.doorsBelow' }); }
        })
      ])
    ]) : null;

    return [
      el('div', { className: 'sub-card' }, [
        el('div', { className: 'sub-card-head' }, [icon('drawer'), el('span', { text: isCombined ? 'Drawer above' : 'Drawer stack' })]),
        el('div', { className: 'field-row' }, [count, style]),
        el('div', { className: 'field-row' }, [material, thickness]),
        autoHeightsField
      ]),
      heightFields.length ? el('div', { className: 'sub-card' }, [
        el('div', { className: 'sub-card-head' }, [icon('ruler'), el('span', { text: 'Front heights' })]),
        el('div', { className: isAuto ? 'field-row' : '' }, heightFields)
      ]) : null,
      el('div', { className: 'sub-card' }, [
        el('div', { className: 'sub-card-head' }, [icon('box'), el('span', { text: 'Drawer boxes & slides' })]),
        el('div', { className: 'field-row' }, [boxMaterial, boxJoinery]),
        el('div', { className: 'field-row' }, [boxSide, boxBottom]),
        el('div', { className: 'field-row' }, [boxBottomJoinery, boxHeightAllowance]),
        slide
      ]),
      combinedFields
    ];
  }

  function suggestHeights(target) {
    if (CS.engine && typeof CS.engine.suggestDrawerHeights === 'function') {
      try {
        var heights = CS.engine.suggestDrawerHeights(target);
        if (Array.isArray(heights) && heights.length) return heights;
      } catch (err) { /* fall through */ }
    }
    var count = (target.front && target.front.drawers && target.front.drawers.count) || 3;
    var frontHeight = (target.height || 876.3) - ((target.toeKick && target.toeKick.height) || 101.6);
    var region = Math.max(200, frontHeight - ((target.front && target.front.reveal) || 3) * (count + 1));
    var top = Math.min(180, region * 0.25);
    var rest = (region - top) / Math.max(1, count - 1);
    var out = [];
    for (var i = 0; i < count; i++) out.push(i === 0 && count > 1 ? top : Math.max(90, rest));
    return out;
  }

  function buildHardwareSection(cabinet) {
    var hw = cabinet.hardware || {};
    var pull = hw.pull || {};
    var pullField = selectField({
      label: 'Pull', path: 'hardware.pull.id', values: pullOptions(),
      get: function () { return ((getCabinet().hardware || {}).pull || {}).id; },
      onChange: function (value) { setCabinetField('hardware.pull.id', value); }
    });
    var finish = selectField({
      label: 'Pull finish', path: 'hardware.pull.finish',
      values: PULL_FINISHES.map(function (f) { return { value: f, label: f.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) }; }),
      get: function () { return ((getCabinet().hardware || {}).pull || {}).finish; },
      onChange: function (value) { setCabinetField('hardware.pull.finish', value); }
    });
    var softClose = checkField({
      label: 'Soft-close slides & hinges', path: 'hardware.softClose',
      get: function () { return !!(getCabinet().hardware || {}).softClose; },
      onChange: function (value) { setCabinetField('hardware.softClose', value); }
    });
    var bumpers = checkField({
      label: 'Door bumpers', path: 'hardware.doorBumpers',
      get: function () { return !!(getCabinet().hardware || {}).doorBumpers; },
      onChange: function (value) { setCabinetField('hardware.doorBumpers', value); }
    });
    var pins = checkField({
      label: 'Shelf pins included', path: 'hardware.shelfPins',
      get: function () { return !!(getCabinet().hardware || {}).shelfPins; },
      onChange: function (value) { setCabinetField('hardware.shelfPins', value); }
    });
    var rail = checkField({
      label: 'Hanging rail', path: 'hardware.hangingRail',
      hint: 'Wall and tall cabinets get a rail for mounting.',
      get: function () { return !!(getCabinet().hardware || {}).hangingRail; },
      onChange: function (value) { setCabinetField('hardware.hangingRail', value); }
    });
    return section({
      id: 'hardware',
      title: 'Hardware',
      summary: cabinetSummaryFor('hardware', cabinet),
      children: [
        el('div', { className: 'hw-row' }, [pullField, finish]),
        softClose,
        bumpers,
        pins,
        rail
      ]
    });
  }

  function buildFinishSection(cabinet) {
    var finish = cabinet.finish || {};
    var finishId = optionSelectField('finish', {
      label: 'Finish', path: 'finish.id',
      get: function () { return (getCabinet().finish || {}).id; },
      onChange: function (value) { setCabinetField('finish.id', value); }
    });
    var color = colorField({
      label: 'Colour', path: 'finish.color',
      get: function () { return (getCabinet().finish || {}).color; },
      onChange: function (value) { setCabinetField('finish.color', value); }
    });
    var sheen = selectField({
      label: 'Sheen', path: 'finish.sheen', values: SHEENS,
      get: function () { return (getCabinet().finish || {}).sheen; },
      onChange: function (value) { setCabinetField('finish.sheen', value); }
    });
    return section({
      id: 'finish',
      title: 'Finish',
      summary: cabinetSummaryFor('finish', cabinet),
      children: [
        el('div', { className: 'field-row' }, [finishId, sheen]),
        color
      ]
    });
  }

  function renderCabinetInspector(cabinet) {
    var frag = doc.createDocumentFragment();
    frag.appendChild(buildIdentitySection(cabinet));
    frag.appendChild(buildDimensionsSection(cabinet));
    frag.appendChild(buildConstructionSection(cabinet));
    frag.appendChild(buildFaceFrameSection(cabinet));
    frag.appendChild(buildToeKickSection(cabinet));
    frag.appendChild(buildInteriorSection(cabinet));
    frag.appendChild(buildFrontSection(cabinet));
    frag.appendChild(buildHardwareSection(cabinet));
    frag.appendChild(buildFinishSection(cabinet));
    return frag;
  }

  /* ───────────────────────────── Project fields ───────────────────────────── */

  function buildProjectFields(opts) {
    opts = opts || {};
    var project = getProject();
    if (!project) return doc.createDocumentFragment();
    var settings = project.settings || {};
    var frag = doc.createDocumentFragment();

    var identity = [
      textField({
        label: 'Project name', path: 'name',
        get: function () { return getProject().name; },
        onChange: function (value) { setProjectField('name', value, { refreshHeader: true }); }
      }),
      textField({
        label: 'Client', path: 'client',
        placeholder: 'Client or job name',
        get: function () { return getProject().client || ''; },
        onChange: function (value) { setProjectField('client', value); }
      }),
      textAreaField({
        label: 'Project notes', path: 'notes', rows: 3,
        placeholder: 'Site notes, finish notes, anything the shop should remember',
        get: function () { return getProject().notes || ''; },
        onChange: function (value) { setProjectField('notes', value); }
      }),
      textField({
        label: 'Shop name', path: 'settings.shopName',
        placeholder: 'Appears on the plan set title block',
        get: function () { return getSettings().shopName || ''; },
        onChange: function (value) { setProjectField('settings.shopName', value); }
      })
    ];
    if (opts.dense) identity = [el('div', { className: 'field-row' }, [identity[0], identity[1]]), identity[2], identity[3]];

    frag.appendChild(opts.dense
      ? el('div', { className: 'modal-section' }, [el('div', { className: 'modal-section-title', text: 'Project' })].concat(identity))
      : section({ id: 'identity', mode: 'project', title: 'Project', summary: projectSummaryFor('identity'), children: identity }));

    var defaultsChildren = [
      materialRow('Default carcass material', 'settings.defaultCarcassMaterial'),
      el('div', { className: 'field-row' }, [
        materialSelectField('settings.defaultFaceFrameMaterial', 'Default face frame material'),
        materialSelectField('settings.defaultDoorMaterial', 'Default door material')
      ]),
      el('div', { className: 'field-row' }, [
        materialSelectField('settings.defaultDrawerMaterial', 'Default drawer box material'),
        optionSelectField('finish', {
          label: 'Default finish', path: 'settings.defaultFinish',
          get: function () { return getSettings().defaultFinish; },
          onChange: function (value) { setProjectField('settings.defaultFinish', value); }
        })
      ]),
      optionSelectField('edgeBanding', {
        label: 'Default edgeband', path: 'settings.edgeBanding',
        get: function () { return getSettings().edgeBanding; },
        onChange: function (value) { setProjectField('settings.edgeBanding', value); }
      }),
      el('div', { className: 'field-hint', text: 'Defaults apply to new cabinets. Existing cabinets keep their own materials.' })
    ];
    frag.appendChild(opts.dense
      ? el('div', { className: 'modal-section' }, [el('div', { className: 'modal-section-title', text: 'Shop defaults' })].concat(defaultsChildren))
      : section({ id: 'defaults', mode: 'project', title: 'Shop defaults', summary: projectSummaryFor('defaults'), children: defaultsChildren }));

    var sheetChildren = [
      el('div', { className: 'field-row' }, [
        lengthField({
          label: 'Sheet width', path: 'settings.sheetWidth', unit: true, min: 600, max: 3000,
          hint: 'Nominal 4 × 8 ft (1220 × 2440 mm) for most sheet goods.',
          get: function () { return getSettings().sheetWidth; },
          onChange: function (mm) { setProjectField('settings.sheetWidth', mm); }
        }),
        lengthField({
          label: 'Sheet height', path: 'settings.sheetHeight', unit: true, min: 600, max: 3000,
          get: function () { return getSettings().sheetHeight; },
          onChange: function (mm) { setProjectField('settings.sheetHeight', mm); }
        })
      ]),
      el('div', { className: 'field-row' }, [
        lengthField({
          label: 'Trim per edge', path: 'settings.sheetTrim', unit: true, min: 0, max: 50,
          get: function () { return getSettings().sheetTrim; },
          onChange: function (mm) { setProjectField('settings.sheetTrim', mm); }
        }),
        lengthField({
          label: 'Kerf', path: 'settings.sheetKerf', unit: true, min: 0, max: 10,
          get: function () { return getSettings().sheetKerf; },
          onChange: function (mm) { setProjectField('settings.sheetKerf', mm); }
        })
      ])
    ];
    frag.appendChild(opts.dense
      ? el('div', { className: 'modal-section' }, [el('div', { className: 'modal-section-title', text: 'Sheet goods' })].concat(sheetChildren))
      : section({ id: 'sheet', mode: 'project', title: 'Sheet goods', summary: projectSummaryFor('sheet'), children: sheetChildren }));

    var planChildren = [
      el('div', { className: 'field-row' }, [
        selectField({
          label: 'Page size', path: 'pageSize',
          values: PAGE_SIZES.map(function (p) { return { value: p.id, label: p.label + ' · ' + p.sub }; }),
          get: function () { return getProject().pageSize || 'letter'; },
          onChange: function (value) { setProjectField('pageSize', value); }
        }),
        segmentedField({
          label: 'Orientation', path: 'orientation',
          values: [{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }],
          get: function () { return getProject().orientation || 'landscape'; },
          onChange: function (value) { setProjectField('orientation', value); }
        })
      ]),
      el('div', { className: 'field-row' }, [
        textField({
          label: 'Plan-set date', path: 'settings.date',
          get: function () { return getSettings().date || ''; },
          onChange: function (value) { setProjectField('settings.date', value); }
        }),
        selectField({
          label: 'DWG version', path: 'settings.dwgVersion',
          values: DWG_VERSIONS,
          get: function () { return getSettings().dwgVersion || 'r2000'; },
          onChange: function (value) { setProjectField('settings.dwgVersion', value); }
        })
      ]),
      checkField({
        label: 'Include component drawings in the PDF', path: 'settings.includeComponentDrawings',
        hint: 'Per-part drawings with machining.',
        get: function () { return getSettings().includeComponentDrawings !== false; },
        onChange: function (value) { setProjectField('settings.includeComponentDrawings', value); }
      }),
      checkField({
        label: 'Include sheet layout', path: 'settings.includeSheetLayout',
        hint: 'Nesting diagrams in the PDF.',
        get: function () { return getSettings().includeSheetLayout !== false; },
        onChange: function (value) { setProjectField('settings.includeSheetLayout', value); }
      }),
      checkField({
        label: 'Include assembly order', path: 'settings.includeAssembly',
        hint: 'Step-by-step build pages in the PDF.',
        get: function () { return getSettings().includeAssembly !== false; },
        onChange: function (value) { setProjectField('settings.includeAssembly', value); }
      })
    ];
    frag.appendChild(opts.dense
      ? el('div', { className: 'modal-section' }, [el('div', { className: 'modal-section-title', text: 'Plan set' })].concat(planChildren))
      : section({ id: 'planSet', mode: 'project', title: 'Plan set', summary: projectSummaryFor('planSet'), children: planChildren }));

    return frag;
  }

  function getSettings() {
    var project = getProject();
    return (project && project.settings) || {};
  }

  function materialSelectField(path, label) {
    return selectField({
      label: label, path: path, values: materialList(),
      get: function () { return getDeep(getProject(), path); },
      onChange: function (value) {
        setProjectField(path, value);
        render({ rebuild: true, focusPath: path });
      }
    });
  }

  function materialRow(label, path) {
    return materialSelectField(path, label);
  }

  function buildUnitsField() {
    return segmentedField({
      label: 'Units', path: 'units',
      values: [{ value: 'imperial', label: 'Imperial' }, { value: 'metric', label: 'Metric' }],
      get: function () { return getProject().units === 'metric' ? 'metric' : 'imperial'; },
      onChange: function (value) { CS.ui.app.setUnits(value); render({ rebuild: true }); }
    });
  }

  function renderProjectInspector() {
    var project = getProject();
    var frag = doc.createDocumentFragment();
    if (!project) return frag;
    frag.appendChild(el('div', { className: 'insp-section-note', style: { margin: '10px 12px' }, text: 'Project settings. Select a cabinet in the rail to edit it.' }));
    frag.appendChild(section({
      id: 'identity', mode: 'project', title: 'Project', summary: projectSummaryFor('identity'),
      children: [
        textField({
          label: 'Project name', path: 'name',
          get: function () { return getProject().name; },
          onChange: function (value) { setProjectField('name', value, { refreshHeader: true }); }
        }),
        el('div', { className: 'field-row' }, [
          textField({
            label: 'Client', path: 'client',
            get: function () { return getProject().client || ''; },
            onChange: function (value) { setProjectField('client', value); }
          }),
          textField({
            label: 'Shop name', path: 'settings.shopName',
            get: function () { return getSettings().shopName || ''; },
            onChange: function (value) { setProjectField('settings.shopName', value); }
          })
        ]),
        buildUnitsField(),
        textAreaField({
          label: 'Project notes', path: 'notes', rows: 3,
          get: function () { return getProject().notes || ''; },
          onChange: function (value) { setProjectField('notes', value); }
        })
      ]
    }));
    frag.appendChild(section({
      id: 'defaults', mode: 'project', title: 'Shop defaults', summary: projectSummaryFor('defaults'),
      children: [
        materialRow('Default carcass material', 'settings.defaultCarcassMaterial'),
        materialRow('Default face frame material', 'settings.defaultFaceFrameMaterial'),
        materialRow('Default door material', 'settings.defaultDoorMaterial'),
        materialRow('Default drawer box material', 'settings.defaultDrawerMaterial'),
        el('div', { className: 'field-row' }, [
          optionSelectField('finish', {
            label: 'Default finish', path: 'settings.defaultFinish',
            get: function () { return getSettings().defaultFinish; },
            onChange: function (value) { setProjectField('settings.defaultFinish', value); }
          }),
          optionSelectField('edgeBanding', {
            label: 'Default edgeband', path: 'settings.edgeBanding',
            get: function () { return getSettings().edgeBanding; },
            onChange: function (value) { setProjectField('settings.edgeBanding', value); }
          })
        ])
      ]
    }));
    var sheetChildren = [
      el('div', { className: 'field-row' }, [
        lengthField({
          label: 'Sheet width', path: 'settings.sheetWidth', unit: true, min: 600, max: 3000,
          hint: 'Nominal 4 × 8 ft (1220 × 2440 mm) for most sheet goods.',
          get: function () { return getSettings().sheetWidth; },
          onChange: function (mm) { setProjectField('settings.sheetWidth', mm); }
        }),
        lengthField({
          label: 'Sheet height', path: 'settings.sheetHeight', unit: true, min: 600, max: 3000,
          get: function () { return getSettings().sheetHeight; },
          onChange: function (mm) { setProjectField('settings.sheetHeight', mm); }
        })
      ]),
      el('div', { className: 'field-row' }, [
        lengthField({
          label: 'Trim per edge', path: 'settings.sheetTrim', unit: true, min: 0, max: 50,
          get: function () { return getSettings().sheetTrim; },
          onChange: function (mm) { setProjectField('settings.sheetTrim', mm); }
        }),
        lengthField({
          label: 'Kerf', path: 'settings.sheetKerf', unit: true, min: 0, max: 10,
          get: function () { return getSettings().sheetKerf; },
          onChange: function (mm) { setProjectField('settings.sheetKerf', mm); }
        })
      ])
    ];
    frag.appendChild(section({ id: 'sheet', mode: 'project', title: 'Sheet goods', summary: projectSummaryFor('sheet'), children: sheetChildren }));
    frag.appendChild(section({
      id: 'planSet', mode: 'project', title: 'Plan set', summary: projectSummaryFor('planSet'),
      children: [
        el('div', { className: 'field-row' }, [
          selectField({
            label: 'Page size', path: 'pageSize',
            values: PAGE_SIZES.map(function (p) { return { value: p.id, label: p.label + ' · ' + p.sub }; }),
            get: function () { return getProject().pageSize || 'letter'; },
            onChange: function (value) { setProjectField('pageSize', value); }
          }),
          segmentedField({
            label: 'Orientation', path: 'orientation',
            values: [{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }],
            get: function () { return getProject().orientation || 'landscape'; },
            onChange: function (value) { setProjectField('orientation', value); }
          })
        ]),
        el('div', { className: 'field-row' }, [
          textField({
            label: 'Plan-set date', path: 'settings.date',
            get: function () { return getSettings().date || ''; },
            onChange: function (value) { setProjectField('settings.date', value); }
          }),
          selectField({
            label: 'DWG version', path: 'settings.dwgVersion', values: DWG_VERSIONS,
            get: function () { return getSettings().dwgVersion || 'r2000'; },
            onChange: function (value) { setProjectField('settings.dwgVersion', value); }
          })
        ]),
        checkField({
          label: 'Include component drawings in the PDF', path: 'settings.includeComponentDrawings',
          get: function () { return getSettings().includeComponentDrawings !== false; },
          onChange: function (value) { setProjectField('settings.includeComponentDrawings', value); }
        }),
        checkField({
          label: 'Include sheet layout', path: 'settings.includeSheetLayout',
          get: function () { return getSettings().includeSheetLayout !== false; },
          onChange: function (value) { setProjectField('settings.includeSheetLayout', value); }
        }),
        checkField({
          label: 'Include assembly order', path: 'settings.includeAssembly',
          get: function () { return getSettings().includeAssembly !== false; },
          onChange: function (value) { setProjectField('settings.includeAssembly', value); }
        })
      ]
    }));
    return frag;
  }

  /* ───────────────────────────── Inspector render ───────────────────────────── */

  function render(opts) {
    opts = opts || {};
    if (rendering) {
      // Queue exactly one follow-up render; the outer render finishes first.
      renderAgain = true;
      pendingRenderOpts = opts;
      return;
    }
    rendering = true;
    try {
      renderInternal(opts);
    } finally {
      rendering = false;
    }
    if (renderAgain) {
      renderAgain = false;
      var nextOpts = pendingRenderOpts || {};
      pendingRenderOpts = null;
      var run = function () { render(nextOpts); };
      if (root.requestAnimationFrame) root.requestAnimationFrame(run);
      else setTimeout(run, 16);
    }
  }

  function renderInternal(opts) {
    if (!host) return;
    var cabinet = getCabinet();
    var project = getProject();
    if (!project) return;

    var mode = CS.ui.app.state.inspectorMode;
    if (mode === 'cabinet' && !cabinet) mode = 'project';
    if (mode === 'project') CS.ui.app.state.inspectorMode = 'project';

    // Collect sections in a fresh document fragment; keep scroll position.
    var oldBody = host.querySelector('.inspector-body');
    var scrollTop = oldBody ? oldBody.scrollTop : 0;

    sectionSummaryNodes = Object.create(null);
    sectionDisableNodes = Object.create(null);

    var titleWrap;
    var subWrap;
    var head = el('div', { className: 'inspector-head' });
    var headTop = el('div', { className: 'inspector-head-top' });

    if (mode === 'cabinet' && cabinet) {
      titleWrap = el('div', { className: 'inspector-title' }, [
        el('span', { text: 'Cabinet' }),
        el('span', { className: 'cabinet-tag', text: cabinet.tag || '' })
      ]);
      subWrap = el('div', { className: 'inspector-sub', text: typeLabel(cabinet.type) + ' · ' + (cabinet.name || '') });
    } else {
      titleWrap = el('div', { className: 'inspector-title' }, [el('span', { text: 'Project' })]);
      subWrap = el('div', { className: 'inspector-sub', text: (project.name || 'Untitled') + (project.client ? ' · ' + project.client : '') });
    }

    var switchWrap = el('div', { className: 'mode-switch', attrs: { role: 'group', 'aria-label': 'Inspector mode' } }, [
      el('button', {
        className: 'mode-btn', type: 'button', text: 'Cabinet',
        attrs: { 'aria-pressed': mode === 'cabinet' ? 'true' : 'false', title: cabinet ? 'Edit the selected cabinet' : 'Select a cabinet first' },
        on: { click: function () { if (!getCabinet()) return; CS.ui.app.state.inspectorMode = 'cabinet'; render({ rebuild: true }); } }
      }),
      el('button', {
        className: 'mode-btn', type: 'button', text: 'Project',
        attrs: { 'aria-pressed': mode === 'project' ? 'true' : 'false', title: 'Project metadata and plan defaults' },
        on: { click: function () { CS.ui.app.state.inspectorMode = 'project'; render({ rebuild: true }); } }
      })
    ]);
    if (!cabinet) switchWrap.querySelector('.mode-btn').disabled = true;

    headTop.appendChild(titleWrap);
    headTop.appendChild(switchWrap);
    head.appendChild(headTop);
    head.appendChild(subWrap);

    var body = el('div', { className: 'inspector-body' });
    if (mode === 'cabinet' && cabinet) body.appendChild(renderCabinetInspector(cabinet));
    else body.appendChild(renderProjectInspector());

    var foot = el('div', { className: 'insp-foot' }, [
      icon('info'),
      el('span', { text: mode === 'cabinet' ? 'Changes re-resolve instantly and autosave in this browser.' : 'Project settings apply to new cabinets and the plan set.' })
    ]);

    clear(host);
    host.appendChild(head);
    host.appendChild(body);
    host.appendChild(foot);
    body.scrollTop = scrollTop;
    lastCabinetId = cabinet ? cabinet.id : null;

    if (opts.focusPath) {
      var target = body.querySelector('[data-field-path="' + CS.ui.app.cssEscape(opts.focusPath) + '"]');
      if (target) {
        var focusable = target.querySelector('input, select, textarea, button');
        if (focusable) {
          try {
            focusable.focus({ preventScroll: false });
            if (focusable.select && focusable.tagName === 'INPUT') focusable.select();
          } catch (err) { /* ignore */ }
        }
      }
    }
  }

  function queueRender(rebuild) {
    if (renderQueued) return;
    renderQueued = true;
    var run = function () { renderQueued = false; render({ rebuild: rebuild }); };
    if (root.requestAnimationFrame) root.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  /* ───────────────────────────── Project editor dialog ───────────────────────────── */

  function openProjectEditor() {
    var body = el('div', null, buildProjectFields({ dense: true }));
    var doneBtn = el('button', {
      className: 'btn btn-primary', type: 'button', text: 'Done',
      on: { click: function () { CS.ui.app.closeModal(true); } }
    });
    CS.ui.app.openModal({
      title: 'Project details',
      sub: 'Everything on this page feeds the plan set and the shop defaults.',
      size: 'wide',
      children: body,
      footer: [
        el('span', { className: 'foot-note', text: 'Changes are applied live and saved in this browser automatically.' }),
        el('button', {
          className: 'btn btn-secondary', type: 'button', text: 'Save a copy…',
          on: { click: function () { if (CS.ui.projectIO && CS.ui.projectIO.saveJsonDownload) CS.ui.projectIO.saveJsonDownload(); } }
        }),
        doneBtn
      ]
    });
  }

  /* ───────────────────────────── Init ───────────────────────────── */

  function init() {
    if (initialized) return;
    initialized = true;
    host = doc.getElementById('inspector');
    if (!host) return;

    CS.ui.app.on('change', function (payload) {
      if (!payload) return;
      if (payload.source === 'inspector' || payload.source === 'units') return;
      queueRender(true);
    });
    CS.ui.app.on('resolved', function () {
      updateDerivedReadouts();
    });
    CS.ui.app.on('select', function () {
      // Reset section open state when moving between cabinets so the most
      // important sections are open again.
      OPEN_STATE.cabinet = {
        identity: true, dimensions: true, construction: true, front: true,
        faceFrame: false, toeKick: false, interior: false, hardware: false, finish: false
      };
    });
  }

  function updateDerivedReadouts() {
    if (!host || CS.ui.app.state.inspectorMode !== 'cabinet') return;
    var model = getModel();
    var node = host.querySelector('[data-dim-readout]');
    if (!node || !model || !model.dims) return;
    var dims = model.dims;
    clear(node);
    function cell(label, value) {
      return el('div', { className: 'dim-readout-cell' }, [
        el('span', { className: 'dim-readout-label', text: label }),
        el('span', { className: 'dim-readout-value', text: value })
      ]);
    }
    node.appendChild(cell('Interior width', fmt(dims.interiorWidth)));
    node.appendChild(cell('Interior height', fmt(dims.interiorHeight)));
    node.appendChild(cell('Front height', fmt(dims.frontHeight)));
    if (isFinite(dims.toeKickHeight) && dims.toeKickHeight > 0) node.appendChild(cell('Toe kick', fmt(dims.toeKickHeight)));
    if (isFinite(dims.carcassDepth)) node.appendChild(cell('Carcass depth', fmt(dims.carcassDepth)));
    updateSummaries();
    // Keep the header subtitle in sync with tag/name edits.
    var sub = host.querySelector('.inspector-sub');
    var cabinet = getCabinet();
    if (sub && cabinet) sub.textContent = typeLabel(cabinet.type) + ' · ' + (cabinet.name || '');
  }

  CS.ui.inspector = {
    init: init,
    render: render,
    openProjectEditor: openProjectEditor,
    updateSummary: updateSummaries,
    optionValues: optionValues,
    optionLabel: optionLabel,
    materialList: materialList
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
