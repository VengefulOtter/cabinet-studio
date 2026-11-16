/**
 * Cabinet Studio — PDF plan-set composer.
 *
 * Turns a resolved project (CS.engine.resolveProject output, CONTRACT.md §4) into an
 * ordered list of sheets. Each sheet is a small draw(ctx, state) function; the export
 * driver (index.js) renders the list twice: a counting pass to learn "Sheet n of N",
 * then the real pass. All scenes come from the shared CS.draw builders — this module
 * owns page composition, titles, keys and tables, never cabinet geometry.
 *
 * Sheet order (CONTRACT.md §7):
 *   cover → cabinet schedule/sheet index → general arrangement →
 *   per-cabinet whole-cabinet sheets → per-part component drawings →
 *   cut list → sheet nesting → door/drawer schedule → hardware schedule →
 *   assembly order → notes/warnings/sign-off.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});

  /** Standard drawing scales, largest first: paper mm per model mm. */
  var STD_SCALES = [
    { scale: 1, label: '1:1' },
    { scale: 0.5, label: '1:2' },
    { scale: 0.2, label: '1:5' },
    { scale: 0.1, label: '1:10' },
    { scale: 0.05, label: '1:20' }
  ];

  var WARN_TITLES = {
    engine: 'Engine warning',
    drawing: 'Drawing module missing',
    data: 'Plan-set data missing',
    layout: 'Layout note'
  };

  // --------------------------------------------------------------------- utilities

  function page() { return CS.export.pdf.page; }
  function table() { return CS.export.pdf.tables; }

  function finite(v) { return typeof v === 'number' && isFinite(v); }

  function round1(v) { return Math.round((v || 0) * 10) / 10; }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function clean(value) {
    if (value === undefined || value === null) return '';
    return String(value);
  }

  function uniq(list) {
    var seen = {};
    return (list || []).filter(function (v) {
      var k = String(v);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  function chunk(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  function sum(list, fn) {
    var total = 0;
    (list || []).forEach(function (v) { total += fn(v) || 0; });
    return total;
  }

  /** Unit-aware formatting through the shared CS.units module. */
  function makeFormatters(project) {
    var units = CS.units || {};
    var unit = project && project.units === 'metric' ? 'metric' : 'imperial';
    function mm(v) {
      if (!finite(v)) return '—';
      if (units.formatLengthShort) return units.formatLengthShort(v, unit);
      return (Math.round(v * 10) / 10) + (unit === 'metric' ? ' mm' : '"');
    }
    function dim(v) {
      if (!finite(v)) return '—';
      if (units.formatDim) return units.formatDim(v, unit);
      return Math.round(v) + ' mm';
    }
    function dimText(v) {
      // passed to CS.draw.render so dimension text matches project units
      return dim(v);
    }
    function size(l, w, t) {
      var out = mm(l) + ' × ' + mm(w);
      if (finite(t)) out += ' × ' + mm(t);
      return out;
    }
    /** Sheet goods are called out in whole inches (48 × 96) or whole mm. */
    function sheetDim(v) {
      if (!finite(v)) return '—';
      if (units.format) {
        if (unit === 'metric') return units.format(v, 'metric', { precision: 0 });
        return units.format(v, 'imperial', { fraction: 1, suffix: true });
      }
      return Math.round(v) + (unit === 'metric' ? ' mm' : '"');
    }
    return { mm: mm, dim: dim, dimText: dimText, size: size, sheetDim: sheetDim, unit: unit, units: units };
  }

  function scaleLabel(scale) {
    if (!finite(scale) || scale <= 0) return 'NTS';
    if (scale >= 1) return '1:' + Math.round(1 / scale);
    return '1:' + Math.round(1 / scale);
  }

  /**
   * Pick the largest standard scale whose scaled scene fits inside a box.
   * Falls back to a proportional fit (labelled truthfully) when even 1:20 is too big.
   */
  function chooseStandardScale(bounds, box, padding) {
    padding = padding === undefined ? 2 : padding;
    var availW = Math.max(1, box.width - 2 * padding);
    var availH = Math.max(1, box.height - 2 * padding);
    var b = bounds || { width: 0, height: 0 };
    var i, s;
    for (i = 0; i < STD_SCALES.length; i++) {
      s = STD_SCALES[i];
      if (b.width * s.scale <= availW && b.height * s.scale <= availH) {
        return { scale: s.scale, label: s.label, fit: false };
      }
    }
    // pathological: bigger than the page at 1:20 — scale to the box and say so
    var fitScale = Math.min(availW / Math.max(b.width, 1e-6), availH / Math.max(b.height, 1e-6));
    return {
      scale: fitScale,
      label: '1:' + Math.max(21, Math.round(1 / Math.max(fitScale, 1e-6))) + ' (fit)',
      fit: true
    };
  }

  function sceneBounds(scene) {
    if (!scene || !scene.items) return null;
    if (scene.bounds && finite(scene.bounds.width)) return scene.bounds;
    if (CS.draw.scene && CS.draw.scene.bounds) return CS.draw.scene.bounds(scene);
    return null;
  }

  // ------------------------------------------------------------------ option setup

  function normalizeOptions(resolved, options) {
    options = options || {};
    var project = (resolved && resolved.project) || {};
    var settings = project.settings || {};
    var pageNames = ['letter', 'tabloid', 'a4', 'a3'];
    var pageSize = String(options.pageSize || project.pageSize || 'letter').toLowerCase();
    if (pageNames.indexOf(pageSize) < 0) pageSize = 'letter';
    var orientation = String(options.orientation || project.orientation || 'landscape').toLowerCase();
    if (orientation !== 'portrait') orientation = 'landscape';
    var scope = options.componentScope || 'unique';
    if (['all', 'unique', 'none'].indexOf(scope) < 0) scope = 'unique';
    return {
      pageSize: pageSize,
      orientation: orientation,
      includeCover: options.includeCover !== false,
      includeCutList: options.includeCutList !== false,
      includeNesting: options.includeNesting !== false,
      includeAssembly: options.includeAssembly !== false,
      includeComponents: options.includeComponents !== false,
      includeSchedules: options.includeSchedules !== false,
      includeNotes: options.includeNotes !== false,
      componentScope: scope,
      includeWholeCabinets: options.includeWholeCabinets !== false,
      date: String(options.date || settings.date || '').slice(0, 10),
      title: options.title || project.name || 'Cabinet project',
      units: project.units === 'metric' ? 'metric' : 'imperial',
      project: project
    };
  }

  // --------------------------------------------------------------------- warnings

  function makeWarnings() {
    var list = [];
    var seen = {};
    function warn(code, title, message, extra) {
      var key = code + '|' + title;
      if (seen[key]) return;
      seen[key] = true;
      var w = {
        id: code,
        severity: 'warning',
        title: title || WARN_TITLES[code] || 'Note',
        message: clean(message),
        rule: code
      };
      if (extra) {
        Object.keys(extra).forEach(function (k) { w[k] = extra[k]; });
      }
      list.push(w);
    }
    return { list: list, warn: warn };
  }

  // ------------------------------------------------------------- drawing shell

  /** Title strip + light border used to frame one view on a composite sheet. */
  function viewBox(ctx, box, title) {
    ctx.backend.rect(box.x, box.y, box.width, box.height, { pen: 'guide', widthMm: 0.13 });
    if (title) {
      ctx.backend.text(box.x + 1.4, box.y + 2.6, title, {
        sizeMm: 2.35, bold: true, baseline: 'top'
      });
      ctx.backend.line(box.x, box.y + 4.4, box.x + box.width, box.y + 4.4, { pen: 'guide', widthMm: 0.13 });
    }
  }

  /** Visible placeholder so a missing drawing module never produces a blank page. */
  function drawPlaceholder(ctx, box, label, detail) {
    ctx.backend.rect(box.x, box.y, box.width, box.height, {
      pen: 'guide', widthMm: 0.18, fill: 'light'
    });
    var cx = box.x + box.width / 2;
    var cy = box.y + box.height / 2;
    ctx.backend.text(cx, cy - 3, 'DRAWING PENDING', {
      sizeMm: 3.2, bold: true, align: 'center', baseline: 'middle'
    });
    if (label) {
      ctx.backend.text(cx, cy + 1.5, label, {
        sizeMm: 2.1, align: 'center', baseline: 'middle'
      });
    }
    if (detail) {
      var lines = page().wrapLines(ctx.backend, detail, box.width - 8, 1.9, {});
      for (var i = 0; i < lines.length && i < 4; i++) {
        ctx.backend.text(cx, cy + 5 + i * 2.6, lines[i], {
          sizeMm: 1.9, align: 'center', baseline: 'top', color: [70, 70, 70]
        });
      }
    }
  }

  /**
   * Estimate the paper-space room scene annotations need outside the geometry
   * bounds. Scene bounds are computed from anchor points, not glyph boxes, so a
   * left-aligned title anchored at the left edge can paint past the geometry. This
   * keeps every label inside its paper box.
   */
  function sceneTextMargins(scene, measure) {
    var m = { left: 0, right: 0, top: 0, bottom: 0 };
    function bump(point, halfWidth, halfHeight, align) {
      var w = Math.max(0, halfWidth || 0);
      var h = Math.max(0, halfHeight || 0);
      if (align === 'left') m.right = Math.max(m.right, w);
      else if (align === 'right') m.left = Math.max(m.left, w);
      else { m.left = Math.max(m.left, w / 2 + 1); m.right = Math.max(m.right, w / 2 + 1); }
      m.top = Math.max(m.top, h);
      m.bottom = Math.max(m.bottom, h);
    }
    (scene.items || []).forEach(function (item) {
      if (item.t === 'label') {
        var size = (CS.draw.render && CS.draw.render.textSize) ? CS.draw.render.textSize(item.size) : 2.6;
        var width = measure(item.text, size, item.bold);
        bump(item.p, width + 1, size * 1.1, item.align);
      } else if (item.t === 'balloon') {
        var s2 = (CS.draw.render && CS.draw.render.textSize) ? CS.draw.render.textSize(item.size) : 2.2;
        var r = item.r || 3.6;
        m.left = Math.max(m.left, r + 0.5); m.right = Math.max(m.right, r + 0.5);
        m.top = Math.max(m.top, r + 0.5); m.bottom = Math.max(m.bottom, r + 0.5);
        if (item.text) {
          var tw = measure(item.text, s2, false);
          m.left = Math.max(m.left, tw / 2 + 1); m.right = Math.max(m.right, tw / 2 + 1);
        }
      } else if (item.t === 'leader') {
        // leader tails run ~8 mm horizontally past the anchor plus the text
        var ls = (CS.draw.render && CS.draw.render.textSize) ? CS.draw.render.textSize(item.size) : 2.2;
        var lw = measure(item.text, ls, false) + 9;
        if (item.align === 'left') m.right = Math.max(m.right, lw);
        else m.left = Math.max(m.left, lw);
        m.top = Math.max(m.top, 2); m.bottom = Math.max(m.bottom, 3);
      } else if (item.t === 'dim') {
        // dimension text sits at paper size along the dimension line; 8 mm covers it
        m.left = Math.max(m.left, 2); m.right = Math.max(m.right, 2);
        m.top = Math.max(m.top, 3); m.bottom = Math.max(m.bottom, 3);
      }
    });
    return m;
  }

  /** Measure the paper box a scene will occupy (margin + fit maths shared by drawScene). */
  function computeSceneFit(ctx, scene, box, opts) {
    opts = opts || {};
    var padding = opts.padding === undefined ? 2.5 : opts.padding;
    var bounds = sceneBounds(scene);
    var measure = function (text, sizeMm, bold) {
      if (ctx.backend && typeof ctx.backend.measureText === 'function') {
        return ctx.backend.measureText(text, { size: sizeMm, bold: !!bold });
      }
      return String(text || '').length * sizeMm * (bold ? 0.58 : 0.54);
    };
    var margins = opts.ignoreTextMargins ? { left: 0, right: 0, top: 0, bottom: 0 } : sceneTextMargins(scene, measure);
    var effBox = {
      x: box.x + padding + margins.left,
      y: box.y + padding + margins.top,
      width: Math.max(2, box.width - 2 * padding - margins.left - margins.right),
      height: Math.max(2, box.height - 2 * padding - margins.top - margins.bottom)
    };
    var formatLength = opts.formatLength || function (v) { return String(Math.round(v)); };
    var fitInfo;
    if (opts.forceScale && opts.forceScale > 0) {
      fitInfo = { scale: opts.forceScale, label: opts.forceScaleLabel || scaleLabel(opts.forceScale), fit: !!opts.forceScaleFit };
    } else if (opts.standard) {
      fitInfo = chooseStandardScale(bounds, effBox, 0);
    } else {
      var fit = CS.draw.render.fit(scene, effBox, { padding: 0 });
      fitInfo = { scale: fit.scale, label: 'NTS', fit: true, x: fit.x, y: fit.y };
    }
    var scale = fitInfo.scale;
    var centered = opts.standard || opts.forceScale;
    return {
      bounds: bounds,
      margins: margins,
      effBox: effBox,
      fitInfo: fitInfo,
      scale: scale,
      x: centered ? effBox.x + (effBox.width - bounds.width * scale) / 2 : fitInfo.x,
      y: centered ? effBox.y + (effBox.height - bounds.height * scale) / 2 : fitInfo.y,
      formatLength: formatLength,
      padding: padding
    };
  }

  /**
   * Render a scene into a paper box.
   * @param {object} ctx page context
   * @param {object|{error:string}} scene scene or {error}
   * @param {object} box {x,y,width,height}
   * @param {object} opts {standard:boolean, forceScale:number, padding, label, caption}
   * @returns {{scale:number, label:string}}
   */
  function drawScene(ctx, scene, box, opts) {
    opts = opts || {};
    if (!scene || scene.error || !scene.items || !scene.items.length) {
      drawPlaceholder(ctx, box, opts.label || '', scene && scene.error ? scene.error : 'No drawing content was produced.');
      return { scale: 0, label: 'NTS' };
    }
    if (!sceneBounds(scene)) {
      drawPlaceholder(ctx, box, opts.label || '', 'Scene has no bounds.');
      return { scale: 0, label: 'NTS' };
    }
    var fit = computeSceneFit(ctx, scene, box, opts);
    try {
      CS.draw.render.render(scene, ctx.backend, {
        scale: fit.scale,
        x: fit.x,
        y: fit.y,
        formatLength: fit.formatLength
      });
    } catch (e) {
      drawPlaceholder(ctx, box, opts.label || '', 'Renderer error: ' + (e && e.message ? e.message : String(e)));
      return { scale: 0, label: 'NTS', error: e };
    }
    if (opts.caption) {
      ctx.backend.text(box.x + 1.5, box.y + box.height - 1.4, opts.caption, {
        sizeMm: 1.8, baseline: 'bottom', color: [80, 80, 80]
      });
    }
    if (opts.scaleNote !== false && (opts.standard || opts.forceScale)) {
      ctx.backend.text(box.x + box.width - 1.5, box.y + box.height - 1.4, 'SCALE ' + fit.fitInfo.label, {
        sizeMm: 1.8, baseline: 'bottom', align: 'right', color: [80, 80, 80]
      });
    }
    return { scale: fit.scale, label: fit.fitInfo.label, fit: !!fit.fitInfo.fit };
  }

  // ------------------------------------------------------------ scene access shim

  function makeSceneFactory(resolved, warnings, formatters) {
    var cache = {};
    var formatLength = function (v) { return formatters.dimText(v); };

    function get(cacheKey, namespace, method, args, humanName) {
      if (cacheKey in cache) return cache[cacheKey];
      var out;
      try {
        var ns = CS.draw && CS.draw[namespace];
        if (!ns || typeof ns[method] !== 'function') {
          throw new Error('CS.draw.' + namespace + '.' + method + ' is not loaded yet');
        }
        out = ns[method].apply(ns, args);
        if (!out || !Array.isArray(out.items)) throw new Error('builder returned no scene');
        if (!out.bounds && CS.draw.scene && CS.draw.scene.finalize) CS.draw.scene.finalize(out);
      } catch (e) {
        out = { error: (e && e.message) ? e.message : String(e) };
        warnings.warn('drawing', 'Drawing unavailable — ' + (humanName || method),
          'The PDF could not build "' + (humanName || (namespace + '.' + method)) + '": ' + out.error +
          '. The sheet shows a placeholder; other sheets are unaffected.');
      }
      cache[cacheKey] = out;
      return out;
    }

    return {
      formatLength: formatLength,
      view: function (method, args, humanName) {
        return get('view:' + method + ':' + (args[0] && (args[0].config ? args[0].config.id : '')), 'views', method, args, humanName);
      },
      part: function (method, part, opts, humanName) {
        return get('part:' + method + ':' + partSignature(part) + ':' + JSON.stringify(opts || {}), 'parts', method, [part, opts], humanName);
      },
      assembly: function (method, cabinetModel, step, opts, humanName) {
        return get('asm:' + method + ':' + cabinetModel.config.id + ':' + step.id, 'assembly', method, [cabinetModel, step, opts], humanName);
      },
      raw: get,
      cache: cache
    };
  }

  // ------------------------------------------------------------------ part grouping

  function r1(v) { return Math.round((v || 0) * 10) / 10; }

  function edgebandSig(part) {
    var eb = part.edgeband;
    if (!eb) return '';
    var edges = (eb.edges || []).slice().sort().join(',');
    return edges + '|' + clean(eb.materialId || eb.material || '') + '|' + round1(eb.thickness);
  }

  function machiningSig(part) {
    var list = part.machining || [];
    var parts = list.map(function (m) {
      switch (m.type) {
        case 'hole':
          return ['hole', m.face, r1(m.x), r1(m.y), r1(m.diameter), r1(m.depth), m.through ? 1 : 0, m.purpose || ''].join(',');
        case 'groove':
          return ['groove', m.face, r1(m.x1), r1(m.y1), r1(m.x2), r1(m.y2), r1(m.width), r1(m.depth), m.purpose || ''].join(',');
        case 'rabbet':
          return ['rabbet', m.face, m.edge, r1(m.width), r1(m.depth), m.purpose || ''].join(',');
        case 'notch':
          return ['notch', m.face, m.corner, r1(m.width), r1(m.height), m.purpose || ''].join(',');
        case 'drill-pattern':
          return ['pattern', m.face, r1(m.x), r1(m.y), m.rows, m.cols, r1(m.dx), r1(m.dy), r1(m.diameter), r1(m.depth), m.purpose || ''].join(',');
        default:
          return JSON.stringify(m);
      }
    });
    parts.sort();
    return parts.join(';');
  }

  function partSignature(part) {
    return [
      clean(part.key || part.name),
      clean(part.materialId || part.materialName),
      r1(part.thickness),
      r1(part.length),
      r1(part.width),
      clean(part.grain),
      edgebandSig(part),
      machiningSig(part)
    ].join('#');
  }

  function partLabel(part) { return clean(part.label || part.id || ''); }

  /** Resolve a material id to its catalogue name when the catalogue is loaded. */
  function materialDisplayName(id) {
    var key = clean(id);
    if (!key) return '—';
    try {
      var mats = (CS.data && CS.data.techniques && CS.data.techniques.materials) || [];
      for (var i = 0; i < mats.length; i++) {
        if (mats[i] && mats[i].id === key) return clean(mats[i].name || mats[i].shortName || key);
      }
    } catch (e) { /* catalogue optional */ }
    return key;
  }

  /**
   * Group parts into component drawings.
   * scope 'unique' → one drawing per identical part type across the project.
   * scope 'all'    → one drawing per part record (still grouped when the *same record*
   *                  has qty > 1, which is what "all" means in a shop set).
   */
  function componentGroups(resolved, scope, warnFn) {
    var cabinets = resolved.cabinets || [];
    var groups = [];
    var bySig = {};
    cabinets.forEach(function (cm) {
      (cm.parts || []).forEach(function (part) {
        if (!part) return;
        var sig = scope === 'unique' ? partSignature(part) : (cm.config.id + '|' + (part.id || part.key));
        var group = bySig[sig];
        if (!group) {
          group = bySig[sig] = {
            signature: sig,
            part: part,
            parts: [],
            labels: [],
            qty: 0,
            cabinetTags: [],
            index: groups.length + 1
          };
          groups.push(group);
        }
        group.parts.push(part);
        var label = partLabel(part);
        if (label && group.labels.indexOf(label) < 0) group.labels.push(label);
        group.qty += finite(part.qty) && part.qty > 0 ? part.qty : 1;
        var tag = clean(part.cabinetTag || (cm.config && cm.config.tag));
        if (tag && group.cabinetTags.indexOf(tag) < 0) group.cabinetTags.push(tag);
      });
    });
    if (!groups.length && warnFn) {
      warnFn('data', 'No parts to draw', 'The resolved project contains no parts, so the component drawing section is empty. Check the engine output.');
    }
    return groups;
  }

  // ------------------------------------------------------------ group scene helpers

  function cabinetDimsText(cm, f) {
    var dims = cm.dims || {};
    var cfg = cm.config || {};
    var w = dims.width || cfg.width;
    var h = dims.height || cfg.height;
    var d = dims.depth || cfg.depth;
    return f.mm(w) + ' W × ' + f.mm(h) + ' H × ' + f.mm(d) + ' D';
  }

  function frontSummary(cm) {
    var front = (cm.config && cm.config.front) || {};
    var label = { 'doors': 'Doors', 'drawer-stack': 'Drawer stack', 'door-drawer': 'Door + drawer', 'open': 'Open' }[front.type] || front.type || '—';
    if (front.type === 'doors') {
      label += ' · ' + (front.doors && front.doors.count === 1 ? 'single' : 'pair') + ' · ' + clean(front.doors && front.doors.style);
      if (front.doors && front.doors.overlay) label += ' · ' + front.doors.overlay;
    } else if (front.type === 'drawer-stack') {
      label += ' × ' + (front.drawers && front.drawers.count) + ' · ' + clean(front.drawers && front.drawers.style);
    } else if (front.type === 'door-drawer') {
      label += ' · ' + (front.doors && front.doors.count) + ' doors below';
    }
    return label;
  }

  function constructionSummary(cfg) {
    cfg = cfg || {};
    var cons = cfg.construction || {};
    var system = cons.system === 'faceframe' ? 'Face frame' : 'Frameless';
    return system + ' · ' + clean(cons.joinery || '') + ' · back ' + clean(cons.backStyle || '');
  }

  function sumParts(resolved) {
    return sum((resolved.cabinets || []), function (cm) { return (cm.parts || []).length; });
  }

  /**
   * The elevation-lineup builder annotates each cabinet with its tag and a small
   * type word 26 model-mm below it. At plan-set scale those two paper-size labels
   * land on top of each other, so the PDF drops the redundant type word (the cabinet
   * schedule and the tag already say what each cabinet is).
   */
  function lineupScene(state) {
    var scene = state.scenes.view('elevationLineup', [state.resolved, {
      dimensions: true,
      labels: true,
      units: state.opts.units,
      maxY: 2400
    }], 'elevation lineup');
    if (!scene || scene.error || !scene.items) return scene;
    var typeWords = { BASE: true, WALL: true, TALL: true, PANTRY: true };
    var clone = {
      items: [],
      meta: scene.meta ? Object.assign({}, scene.meta) : {},
      width: scene.width,
      height: scene.height
    };
    scene.items.forEach(function (item) {
      if (item && item.t === 'label' && typeWords[String(item.text).trim().toUpperCase()]) return;
      clone.items.push(item);
    });
    if (CS.draw.scene && CS.draw.scene.finalize) CS.draw.scene.finalize(clone);
    else clone.bounds = scene.bounds;
    return clone;
  }

  // ============================================================================
  //  SHEET BUILDERS
  // ============================================================================

  /**
   * Cover sheet: project identity, legend, warnings summary, sheet index.
   * The sheet index is only filled during the final pass (state.sheetList); the same
   * space is reserved in both passes so pagination never changes between passes.
   */
  function buildCoverSheet(state) {
    var opts = state.opts;
    var project = state.project;
    var resolved = state.resolved;
    var f = state.f;
    var warnings = state.warnings.list;
    var stats = resolved.stats || {};

    return {
      title: 'Cover & sheet index',
      subtitle: opts.project.name,
      scale: 'NTS',
      note: 'Built with Cabinet Studio',
      draw: function (ctx, renderState) {
        var body = ctx.body;
        // `wide` = full-size cover treatment (with reference elevation). The sheet
        // index itself is drawn on EVERY page size (CONTRACT §7.1) in a right-hand
        // column; only its width/typography adapts.
        var wide = body.width >= 330 && body.height >= 180;
        var rightW = clamp(body.width * 0.38, 66, 175);
        var leftW = body.width - rightW - 8;
        var x = body.x;
        var y = body.y;
        var twoColFacts = leftW >= 150;
        var twoColLegend = leftW >= 130;

        // ---- title
        ctx.text(x, y, clean(opts.title), { sizeMm: wide ? 10.5 : 8, bold: true, baseline: 'top' });
        y += (wide ? 12.5 : 10) + 1.5;
        ctx.backend.line(x, y, x + leftW, y, { pen: 'cut', widthMm: 0.5 });
        y += 3.2;
        ctx.text(x, y, 'SHOP PLAN SET', { sizeMm: wide ? 5.4 : 4.4, bold: true, baseline: 'top' });
        y += (wide ? 7.0 : 5.8);
        var subtitle = [clean(project.client || ''), clean(project.settings && project.settings.shopName || '')].filter(Boolean).join('  ·  ');
        if (subtitle) {
          ctx.text(x, y, subtitle, { sizeMm: 2.4, baseline: 'top', color: [55, 55, 55] });
          y += 4.4;
        }
        y += 2.2;

        // ---- project facts
        var facts = [
          ['Plan date', clean(opts.date) || '—'],
          ['Units', opts.units === 'metric' ? 'Metric — millimetres' : 'Imperial — inches (1/32")'],
          ['Page', page().PAGE_SIZES[opts.pageSize].name + ' · ' + opts.orientation],
          ['Cabinets', String((resolved.cabinets || []).length)],
          ['Parts', String(stats.partCount !== undefined ? stats.partCount : sumParts(resolved))],
          ['Sheet goods', f.sheetDim((project.settings || {}).sheetWidth || 1220) + ' × ' + f.sheetDim((project.settings || {}).sheetHeight || 2440)]
        ];
        if (twoColFacts) {
          var colW = leftW / 2 - 4;
          var rows = Math.ceil(facts.length / 2);
          for (var i = 0; i < facts.length; i++) {
            var col = i < rows ? 0 : 1;
            var row = i < rows ? i : i - rows;
            var fx = x + col * (colW + 8);
            var fy = y + row * 6.0;
            ctx.text(fx, fy, facts[i][0].toUpperCase(), { sizeMm: 1.7, baseline: 'top', color: [95, 95, 95] });
            var valLines = ctx.wrapLines(facts[i][1], colW, 2.25, {});
            ctx.text(fx, fy + 2.6, valLines[0], { sizeMm: 2.25, baseline: 'top', bold: true });
          }
          y += rows * 6.0 + 3.4;
        } else {
          var labelW = Math.min(30, leftW * 0.34);
          for (var fi = 0; fi < facts.length; fi++) {
            ctx.text(x, y + 1.3, facts[fi][0].toUpperCase(), { sizeMm: 1.55, baseline: 'top', color: [110, 110, 110] });
            var factLines = ctx.wrapLines(facts[fi][1], leftW - labelW, 2.05, {});
            ctx.text(x + labelW, y, factLines[0], { sizeMm: 2.05, bold: true, baseline: 'top' });
            y += 4.8;
          }
          y += 1.6;
        }

        // ---- drawing conventions
        ctx.text(x, y, 'DRAWING CONVENTIONS', { sizeMm: 1.9, bold: true, baseline: 'top', color: [70, 70, 70] });
        y += 3.8;
        var legend = [
          ['cut', 'CUT / VISIBLE EDGE', 0.35],
          ['thin', 'THIN / DETAIL', 0.18],
          ['hidden', 'HIDDEN (BEHIND SURFACE)', 0.18],
          ['center', 'CENTRE LINE', 0.18],
          ['dim', 'DIMENSION LINE — ' + (opts.units === 'metric' ? 'ALL DIMS IN MM' : 'ALL DIMS IN INCHES'), 0.18]
        ];
        var legendRows = twoColLegend ? Math.ceil(legend.length / 2) : legend.length;
        var legendH = 5.0;
        for (var l = 0; l < legend.length; l++) {
          var lx = twoColLegend ? (x + (l % 2) * (leftW / 2)) : x;
          var ly = y + (twoColLegend ? Math.floor(l / 2) : l) * legendH;
          var pen = CS.draw.render && CS.draw.render.PENS && CS.draw.render.PENS[legend[l][0]];
          var segY = ly + 2.2;
          ctx.backend.line(lx, segY, lx + 13, segY, {
            width: legend[l][2],
            dash: pen && pen.dash ? pen.dash : null,
            color: '#111111'
          });
          ctx.text(lx + 15.5, ly + 0.6, legend[l][1], { sizeMm: 1.8, baseline: 'top', color: [60, 60, 60] });
        }
        y += legendRows * legendH + 3.4;

        // ---- validation summary
        var errors = warnings.filter(function (w) { return w.severity === 'error'; }).length;
        var warns = warnings.length - errors;
        ctx.text(x, y, 'VALIDATION SUMMARY', { sizeMm: 1.9, bold: true, baseline: 'top', color: [70, 70, 70] });
        y += 3.8;
        var summary;
        if (errors + warns === 0) {
          summary = 'No engine warnings or errors — the design passed every validation rule.';
        } else {
          var bits = [];
          if (errors) bits.push(errors + (errors === 1 ? ' error' : ' errors'));
          if (warns) bits.push(warns + (warns === 1 ? ' warning' : ' warnings'));
          summary = bits.join(' and ') + '. See the notes sheet at the end of this set.';
        }
        y = ctx.paragraph(summary, x, y, leftW, { sizeMm: 2.0, lineHeight: 3.0 });
        y += 1.4;
        var shown = warnings.slice(0, wide ? 4 : 3);
        for (var w = 0; w < shown.length; w++) {
          y = ctx.paragraph('- ' + shown[w].title + ' - ' + shown[w].message, x, y, leftW, {
            sizeMm: 1.8, lineHeight: 2.7, maxLines: 2
          });
        }
        if (warnings.length > shown.length) {
          ctx.text(x, y, '+ ' + (warnings.length - shown.length) + ' more on the notes sheet', { sizeMm: 1.75, baseline: 'top', color: [70, 70, 70] });
          y += 3.0;
        }

        // ---- reference elevation: full-size covers, or any cover with room left
        var heroTop = y + 3;
        var heroBottom = body.bottom - 7;
        if (heroBottom - heroTop >= 34) {
          ctx.backend.line(x, heroTop, x + leftW, heroTop, { pen: 'guide', widthMm: 0.13 });
          ctx.text(x, heroTop + 1.3, 'RUN ELEVATION — FOR REFERENCE', { sizeMm: 1.8, bold: true, baseline: 'top', color: [70, 70, 70] });
          var heroBox = { x: x, y: heroTop + 4.6, width: leftW, height: heroBottom - heroTop - 4.6 };
          viewBox(ctx, heroBox);
          drawScene(ctx, lineupScene(state),
            { x: heroBox.x + 1.2, y: heroBox.y + 1.2, width: heroBox.width - 2.4, height: heroBox.height - 2.4 },
            { standard: true, padding: 1.2, formatLength: state.scenes.formatLength, scaleNote: false, label: 'CS.draw.views.elevationLineup' });
        }

        // ---- sheet index (right column, every page size)
        var rx = body.x + body.width - rightW;
        var ry = body.y;
        ctx.backend.line(rx - 4, body.y, rx - 4, body.bottom - 7, { pen: 'guide', widthMm: 0.13 });
        ctx.text(rx, ry, 'SHEET INDEX', { sizeMm: 1.95, bold: true, baseline: 'top', color: [70, 70, 70] });
        ry += 4.2;
        drawSheetIndex(ctx, renderState, rx, ry, rightW, body.bottom - 8, {
          size: rightW >= 150 ? 1.65 : 1.55,
          lineH: rightW >= 150 ? 3.0 : 2.75
        });

        // ---- built-with mark on every cover
        ctx.text(body.x, body.bottom - 3.2, 'Built with Cabinet Studio — a local, self-contained cabinet design and shop-drawing app. No cloud, no account.', {
          sizeMm: 1.75, baseline: 'bottom', color: [90, 90, 90]
        });
      }
    };
  }

  /**
   * Draw the list of sheets with their final numbers. In pass 1 (no sheetList yet) the
   * space is reserved but empty, so the cover paginates identically in both passes.
   */
  function drawSheetIndex(ctx, state, x, y, width, maxY, layout) {
    if (!state || !state.sheetList || !state.sheetList.length) return y;
    layout = layout || {};
    var size = layout.size || 1.7;
    var lineH = layout.lineH || 3.05;
    var list = state.sheetList;
    // Collapse runs of identical sheet titles (component pages, cut list continuations,
    // per-cabinet assembly pages) into one index line with a page range.
    var groups = [];
    list.forEach(function (item) {
      var title = clean(item.title).replace(/\s*\(continued\)$/i, '');
      var last = groups[groups.length - 1];
      if (last && last.title === title) {
        last.end = item.index;
        last.count++;
      } else {
        groups.push({ title: title, start: item.index, end: item.index, count: 1 });
      }
    });
    var cols = width >= 150 ? 2 : 1;
    var colW = width / cols;
    var perCol = Math.ceil(groups.length / cols);
    var drawn = 0;
    for (var c = 0; c < cols; c++) {
      for (var i = 0; i < perCol; i++) {
        var g = groups[c * perCol + i];
        if (!g) continue;
        var ly = y + i * lineH;
        if (ly > maxY - 3) break;
        var range = g.count > 1 ? (g.start + '–' + g.end) : String(g.start);
        var suffix = g.count > 1 ? '  (' + g.count + ')' : '';
        ctx.text(x + c * colW, ly, range.padStart(6, ' ') + '  ' + g.title + suffix, {
          sizeMm: size,
          baseline: 'top',
          color: [40, 40, 40]
        });
        drawn++;
      }
    }
    if (drawn < groups.length) {
      var restY = y + Math.min(perCol, Math.floor((maxY - y) / lineH)) * lineH;
      if (restY <= maxY - 2) {
        ctx.text(x, restY, '+ ' + (groups.length - drawn) + ' more sheets (see title block numbering)', {
          sizeMm: size, baseline: 'top', color: [110, 110, 110]
        });
      }
    }
    return y + Math.min(groups.length, perCol * cols) * lineH;
  }

  // ------------------------------------------------------------------ cabinet schedule

  function buildCabinetScheduleSheet(state) {
    var resolved = state.resolved;
    var f = state.f;
    var project = state.project;
    var rows = (resolved.cabinets || []).map(function (cm, index) {
      var cfg = cm.config || {};
      var dims = cm.dims || {};
      var eb = cfg.construction && cfg.construction.edgeBanding;
      return {
        no: String(index + 1),
        tag: clean(cfg.tag),
        name: clean(cfg.name || ''),
        type: page().cleanText((CS.core && CS.core.project && CS.core.project.TYPE_LABELS && CS.core.project.TYPE_LABELS[cfg.type]) || cfg.type || ''),
        width: f.mm(dims.width || cfg.width),
        height: f.mm(dims.height || cfg.height),
        depth: f.mm(dims.depth || cfg.depth),
        front: frontSummary(cm),
        system: constructionSummary(cfg),
        material: clean(cfg.construction && cfg.construction.carcassMaterial),
        edgeband: clean(eb),
        finish: clean(cfg.finish && cfg.finish.id),
        parts: String((cm.parts || []).length)
      };
    });
    var totalParts = sumParts(resolved);

    return {
      title: 'Cabinet schedule',
      subtitle: 'Project cabinet register',
      scale: 'NTS',
      note: 'Compare tags on the general arrangement and whole-cabinet sheets',
      draw: function (ctx) {
        var y = ctx.body.y;
        y = ctx.paragraph(
          'The schedule lists every cabinet in the run with finished dimensions, front style and construction. ' +
          'Cabinet tags are used on every sheet in this set, on part labels, and in the cut list and schedules. ' +
          'Dimensions are overall finished sizes; doors and drawer fronts overlay the cabinet face (they are not included in depth).',
          ctx.body.x, y, ctx.body.width, { sizeMm: 2.2, lineHeight: 3.3, maxLines: 4 }
        );
        y += 3.2;
        var result = table().draw(ctx, {
          title: 'Cabinet register',
          y: y,
          columns: [
            { key: 'no', title: '#', width: 0.035, align: 'right' },
            { key: 'tag', title: 'TAG', width: 0.06, bold: true },
            { key: 'name', title: 'CABINET', width: 0.20 },
            { key: 'type', title: 'TYPE', width: 0.07 },
            { key: 'width', title: 'WIDTH', width: 0.085, align: 'right' },
            { key: 'height', title: 'HEIGHT', width: 0.085, align: 'right' },
            { key: 'depth', title: 'DEPTH', width: 0.085, align: 'right' },
            { key: 'front', title: 'FRONT', width: 0.16 },
            { key: 'system', title: 'CONSTRUCTION', width: 0.13 },
            { key: 'parts', title: 'PARTS', width: 0.045, align: 'right' },
            { key: 'finish', title: 'FINISH', width: 0.045 }
          ],
          rows: rows,
          groupBy: 'type',
          groupLabel: function (type) { return type + ' cabinets'; },
          zebra: true,
          meta: { title: 'Cabinet schedule', subtitle: 'Project cabinet register', scale: 'NTS' },
          footers: [
            {
              cells: {
                no: '', tag: 'TOTAL', name: rows.length + ' cabinets', type: '', width: '', height: '', depth: '',
                front: (resolved.frontSchedule || []).length + ' fronts', system: (resolved.sheetLayouts || []).length + ' nesting groups',
                parts: String(totalParts), finish: ''
              },
              rule: true
            }
          ]
        });
        ctx.y = result.y;
        if (project.notes) {
          if (ctx.ensureRoom(20)) { /* continued */ }
          ctx.text(ctx.body.x, ctx.y + 4, 'PROJECT NOTES', { sizeMm: 2.0, bold: true, baseline: 'top', color: [70, 70, 70] });
          ctx.paragraph(project.notes, ctx.body.x, ctx.y + 7.6, ctx.body.width * 0.72, { sizeMm: 2.1, lineHeight: 3.1, maxLines: 6 });
        }
      }
    };
  }

  // -------------------------------------------------------------- general arrangement

  function buildGeneralArrangementSheet(state) {
    var resolved = state.resolved;
    var f = state.f;
    var cabinets = resolved.cabinets || [];
    return {
      title: 'General arrangement',
      subtitle: 'Elevation lineup of all cabinets',
      scale: 'VARIES',
      note: 'Overall dimensions only - see whole-cabinet sheets for internal layout',
      draw: function (ctx) {
        var y = ctx.body.y;
        ctx.text(ctx.body.x, y, 'ELEVATION LINEUP', { sizeMm: 3.4, bold: true, baseline: 'top' });
        ctx.text(ctx.body.x, y + 5.2, 'All cabinets in run order, drawn at a common scale. Tags match the cabinet schedule and part labels.', {
          sizeMm: 2.1, baseline: 'top', color: [70, 70, 70]
        });
        y += 14;

        var rows = cabinets.map(function (cm, index) {
          var cfg = cm.config || {};
          return {
            no: String(index + 1),
            tag: clean(cfg.tag),
            name: clean(cfg.name),
            dims: cabinetDimsText(cm, f),
            front: frontSummary(cm)
          };
        });
        // Reserve the register height so the drawing is sized to the space that is
        // actually left: the elevation and its table are one composed sheet.
        var estTableH = 12 + rows.length * 6.4 + 12;
        var available = ctx.body.bottom - y;
        var viewH = Math.max(60, available - estTableH - 4);
        var box = { x: ctx.body.x, y: y, width: ctx.body.width, height: viewH };
        viewBox(ctx, box);
        var sceneBox = { x: box.x + 1.5, y: box.y + 1.5, width: box.width - 3, height: box.height - 3 };
        var scene = lineupScene(state);
        drawScene(ctx, scene, sceneBox, {
          standard: true,
          padding: 2,
          label: 'CS.draw.views.elevationLineup',
          formatLength: state.scenes.formatLength,
          scaleNote: true
        });

        var ty = box.y + box.height + 4;
        table().draw(ctx, {
          x: ctx.body.x,
          y: ty,
          width: ctx.body.width,
          sizeMm: 2.0,
          headerSizeMm: 1.95,
          minRowHeight: 5.6,
          zebra: false,
          title: null,
          columns: [
            { key: 'no', title: '#', width: 0.035, align: 'right' },
            { key: 'tag', title: 'TAG', width: 0.06, bold: true },
            { key: 'name', title: 'CABINET', width: 0.30 },
            { key: 'dims', title: 'OVERALL W x H x D', width: 0.26 },
            { key: 'front', title: 'FRONT', width: 0.345 }
          ],
          rows: rows,
          meta: { title: 'General arrangement', subtitle: 'Elevation lineup of all cabinets', scale: 'VARIES' },
          footers: [{
            cells: { no: '', tag: '', name: 'Cabinets are listed in project order. Elevation is drawn at a common scale; do not scale dimensions from the page.', dims: '', front: '' },
            rule: true,
            sizeMm: 1.85
          }]
        });
        ctx.y = ctx.body.bottom;
      }
    };
  }

  // ------------------------------------------------------------- whole-cabinet sheet

  /**
   * Parts-key panel: part IDs and names, laid out in columns.
   */
  function drawPartsKeyPanel(ctx, state, cm, box) {
    ctx.backend.rect(box.x, box.y, box.width, box.height, { pen: 'guide', widthMm: 0.13 });
    ctx.backend.line(box.x, box.y + 4.6, box.x + box.width, box.y + 4.6, { pen: 'guide', widthMm: 0.13 });
    ctx.text(box.x + 1.5, box.y + 1.5, 'PARTS KEY', { sizeMm: 1.95, bold: true, baseline: 'top' });
    ctx.text(box.x + 22, box.y + 1.8, 'Part IDs match the cut list, component drawings and assembly steps.', {
      sizeMm: 1.6, baseline: 'top', color: [85, 85, 85]
    });
    var parts = cm.parts || [];
    if (!parts.length) {
      ctx.text(box.x + 2, box.y + 8, 'No parts supplied for this cabinet.', { sizeMm: 2.0, baseline: 'top', color: [90, 90, 90] });
      return;
    }
    var rows = parts.map(function (part) {
      return {
        label: partLabel(part),
        text: clean(part.name) + (part.qty > 1 ? '  x' + part.qty : '')
      };
    });
    var cols = box.width >= 150 ? 3 : 2;
    var colWidth = box.width / cols;
    var labelW = Math.min(colWidth * 0.34, 30);
    var nameW = Math.max(12, colWidth - labelW - 1.2);
    var perCol = Math.ceil(rows.length / cols);
    var top = box.y + 5.8;
    var lineH = Math.min(4.6, Math.max(2.6, (box.height - 9) / Math.max(perCol, 1)));
    for (var c = 0; c < cols; c++) {
      var colX = box.x + 1.5 + c * colWidth;
      for (var i = 0; i < perCol; i++) {
        var row = rows[c * perCol + i];
        if (!row) continue;
        var ly = top + i * lineH;
        if (ly > box.y + box.height - 2.4) break;
        var size = Math.min(1.9, Math.max(1.5, lineH - 1.1));
        ctx.text(colX, ly, fitText(ctx, row.label, labelW, size, true), { sizeMm: size, bold: true, baseline: 'top' });
        ctx.text(colX + labelW + 1.2, ly, fitText(ctx, row.text, nameW, size, false), { sizeMm: size, baseline: 'top' });
      }
    }
  }

  function buildWholeCabinetSheets(state, cm) {
    var f = state.f;
    var cfg = cm.config || {};
    var tag = clean(cfg.tag);
    var sceneOpts = { dimensions: true, labels: true, hidden: true, partNumbers: true, units: state.opts.units };
    var scenes = state.scenes;
    var sheets = [];

    sheets.push({
      title: tag + ' - whole cabinet',
      subtitle: clean(cfg.name),
      scale: 'VARIES / NTS',
      cabinetTag: tag,
      note: 'Front elevation, side section, plan section, isometric and parts key',
      draw: function (ctx) {
        var body = ctx.body;
        var y = body.y;
        // Sheet header: the construction facts the drawings do not repeat.
        ctx.text(body.x, y, cabinetDimsText(cm, f) + '  ·  ' + clean(cfg.type) + ' cabinet  ·  ' + constructionSummary(cfg) + '  ·  ' + frontSummary(cm), {
          sizeMm: 2.2, baseline: 'top', color: [55, 55, 55]
        });
        ctx.backend.line(body.x, y + 4.2, body.x + body.width, y + 4.2, { pen: 'guide', widthMm: 0.13 });
        y += 7;
        var grid = body.bottom - y;
        var gap = 3.5;

        // Row 1 is sized for the front elevation and side section at 1:10 when the
        // cabinet allows it; row 2 carries plan section, isometric and the parts key.
        var h = cfg.height || 876;
        // +16 mm covers the panel inset, drawScene padding and paper-space text margins
        var frontNeed = (h + 97) * 0.1 + 16;
        var sideNeed = (h + 125) * 0.1 + 16;
        var row1H = clamp(Math.max(frontNeed, sideNeed), grid * 0.42, grid * 0.72);
        var row2H = grid - row1H - gap;
        if (row2H < 40) { row2H = 40; row1H = grid - row2H - gap; }

        // row 1: front elevation (52%) + side section (48%)
        var frontW = (body.width - gap) * 0.52;
        var frontBox = { x: body.x, y: y, width: frontW, height: row1H };
        var sideBox = { x: body.x + frontW + gap, y: y, width: body.width - frontW - gap, height: row1H };
        var usedScales = [];
        viewBox(ctx, frontBox);
        var frontUsed = drawScene(ctx, scenes.view('cabinetFront', [cm, sceneOpts], 'front elevation'),
          { x: frontBox.x + 1.5, y: frontBox.y + 1.5, width: frontBox.width - 3, height: frontBox.height - 3 },
          { standard: true, formatLength: scenes.formatLength, label: 'CS.draw.views.cabinetFront' });
        if (frontUsed && frontUsed.label) usedScales.push(frontUsed.label);
        viewBox(ctx, sideBox);
        var sideUsed = drawScene(ctx, scenes.view('cabinetSideSection', [cm, sceneOpts], 'side section'),
          { x: sideBox.x + 1.5, y: sideBox.y + 1.5, width: sideBox.width - 3, height: sideBox.height - 3 },
          { standard: true, formatLength: scenes.formatLength, label: 'CS.draw.views.cabinetSideSection' });
        if (sideUsed && sideUsed.label) usedScales.push(sideUsed.label);

        // row 2: plan section (36%), isometric (34%), parts key (30%)
        var row2Y = y + row1H + gap;
        var planW = (body.width - 2 * gap) * 0.36;
        var isoW = (body.width - 2 * gap) * 0.34;
        var keyW = body.width - planW - isoW - 2 * gap;
        var planBox = { x: body.x, y: row2Y, width: planW, height: row2H };
        var isoBox = { x: body.x + planW + gap, y: row2Y, width: isoW, height: row2H };
        var keyBox = { x: body.x + planW + isoW + 2 * gap, y: row2Y, width: keyW, height: row2H };
        viewBox(ctx, planBox);
        var planUsed = drawScene(ctx, scenes.view('cabinetPlanSection', [cm, sceneOpts], 'plan section'),
          { x: planBox.x + 1.5, y: planBox.y + 1.5, width: planBox.width - 3, height: planBox.height - 3 },
          { standard: true, formatLength: scenes.formatLength, label: 'CS.draw.views.cabinetPlanSection' });
        if (planUsed && planUsed.label) usedScales.push(planUsed.label);
        if (ctx.current) {
          var uniqueScales = [];
          usedScales.forEach(function (label) { if (uniqueScales.indexOf(label) < 0) uniqueScales.push(label); });
          ctx.current.scale = uniqueScales.join(' / ') + ' / NTS';
        }
        viewBox(ctx, isoBox);
        var isoParts = (cm.parts || []).length;
        var isoOpts = Object.assign({}, sceneOpts, { labels: isoParts <= 18 });
        drawScene(ctx, scenes.view('cabinetIso', [cm, isoOpts], 'cabinet isometric'),
          { x: isoBox.x + 1.5, y: isoBox.y + 1.5, width: isoBox.width - 3, height: isoBox.height - 3 },
          { standard: false, formatLength: scenes.formatLength, label: 'CS.draw.views.cabinetIso', caption: isoParts > 18 ? 'Not to scale — see parts key' : 'Not to scale' });
        drawPartsKeyPanel(ctx, state, cm, keyBox);
        ctx.y = body.bottom;
      }
    });

    return sheets;
  }

  /**
   * Compact pages (letter/A4 landscape/portrait): two sheets per cabinet so views stay
   * legible. Sheet A: front + side + plan. Sheet B: isometric + parts key.
   */
  function buildCompactWholeCabinetSheets(state, cm) {
    var f = state.f;
    var cfg = cm.config || {};
    var tag = clean(cfg.tag);
    var sceneOpts = { dimensions: true, labels: true, hidden: true, partNumbers: true, units: state.opts.units };
    var scenes = state.scenes;
    var sheets = [];

    sheets.push({
      title: tag + ' - orthographic views',
      subtitle: clean(cfg.name),
      scale: 'VARIES',
      cabinetTag: tag,
      note: 'Front elevation, side section and plan section',
      draw: function (ctx) {
        var y = ctx.body.y;
        ctx.text(ctx.body.x, y, cabinetDimsText(cm, f) + '  ·  ' + constructionSummary(cfg) + '  ·  ' + frontSummary(cm), {
          sizeMm: 2.1, baseline: 'top', color: [55, 55, 55]
        });
        y += 5.5;
        var gap = 3;
        var topH = (ctx.body.bottom - y) * 0.60;
        var botH = (ctx.body.bottom - y) - topH - gap;
        var topBox = { x: ctx.body.x, y: y, width: ctx.body.width, height: topH };
        var sideBox = { x: ctx.body.x, y: y + topH + gap, width: ctx.body.width * 0.5 - gap / 2, height: botH };
        var planBox = { x: ctx.body.x + ctx.body.width * 0.5 + gap / 2, y: y + topH + gap, width: ctx.body.width * 0.5 - gap / 2, height: botH };
        var compactScales = [];
        viewBox(ctx, topBox);
        var frontUsed = drawScene(ctx, scenes.view('cabinetFront', [cm, sceneOpts], 'front elevation'),
          { x: topBox.x + 1.5, y: topBox.y + 1.5, width: topBox.width - 3, height: topBox.height - 3 },
          { standard: true, formatLength: scenes.formatLength, label: 'CS.draw.views.cabinetFront' });
        if (frontUsed && frontUsed.label) compactScales.push(frontUsed.label);
        viewBox(ctx, sideBox);
        var sideUsed = drawScene(ctx, scenes.view('cabinetSideSection', [cm, sceneOpts], 'side section'),
          { x: sideBox.x + 1.5, y: sideBox.y + 1.5, width: sideBox.width - 3, height: sideBox.height - 3 },
          { standard: true, formatLength: scenes.formatLength, label: 'CS.draw.views.cabinetSideSection' });
        if (sideUsed && sideUsed.label) compactScales.push(sideUsed.label);
        viewBox(ctx, planBox);
        var planUsed = drawScene(ctx, scenes.view('cabinetPlanSection', [cm, sceneOpts], 'plan section'),
          { x: planBox.x + 1.5, y: planBox.y + 1.5, width: planBox.width - 3, height: planBox.height - 3 },
          { standard: true, formatLength: scenes.formatLength, label: 'CS.draw.views.cabinetPlanSection' });
        if (planUsed && planUsed.label) compactScales.push(planUsed.label);
        if (ctx.current) {
          var uniqueScales = [];
          compactScales.forEach(function (label) { if (uniqueScales.indexOf(label) < 0) uniqueScales.push(label); });
          ctx.current.scale = uniqueScales.join(' / ');
        }
        ctx.y = ctx.body.bottom;
      }
    });

    sheets.push({
      title: tag + ' - isometric & parts key',
      subtitle: clean(cfg.name),
      scale: 'NTS',
      cabinetTag: tag,
      note: 'Shaded isometric and parts key',
      draw: function (ctx) {
        var y = ctx.body.y;
        ctx.text(ctx.body.x, y, 'Illustrative isometric — use the orthographic sheet for dimensions.', {
          sizeMm: 2.05, baseline: 'top', color: [55, 55, 55]
        });
        y += 5.5;
        var keyH = Math.min(62, (ctx.body.bottom - y) * 0.44);
        var isoBox = { x: ctx.body.x, y: y, width: ctx.body.width, height: ctx.body.bottom - y - keyH - 4 };
        viewBox(ctx, isoBox);
        var isoParts = (cm.parts || []).length;
        var isoOpts = Object.assign({}, sceneOpts, { labels: isoParts <= 18 });
        drawScene(ctx, scenes.view('cabinetIso', [cm, isoOpts], 'cabinet isometric'),
          { x: isoBox.x + 1.5, y: isoBox.y + 1.5, width: isoBox.width - 3, height: isoBox.height - 3 },
          { standard: false, formatLength: scenes.formatLength, label: 'CS.draw.views.cabinetIso', caption: isoParts > 18 ? 'Not to scale — see parts key' : 'Not to scale' });
        var keyY = isoBox.y + isoBox.height + 4;
        drawPartsKeyPanel(ctx, state, cm, {
          x: ctx.body.x,
          y: keyY,
          width: ctx.body.width,
          height: ctx.body.bottom - keyY
        });
        ctx.y = ctx.body.bottom;
      }
    });

    return sheets;
  }

  // -------------------------------------------------------------------- module export

  /**
   * Plan the full sheet list.
   * @param {object} resolved engine output (CONTRACT.md §4)
   * @param {object} [options] export options (CONTRACT.md §7)
   * @returns {{sheets:Array, warnings:Array, options:object, meta:object}}
   */
  function plan(resolved, options) {
    resolved = resolved || {};
    var opts = normalizeOptions(resolved, options);
    var project = resolved.project || {};
    var f = makeFormatters(project);
    var warnBox = makeWarnings();
    var state = {
      resolved: resolved,
      project: project,
      opts: opts,
      f: f,
      warnings: warnBox,
      scenes: null
    };
    state.scenes = makeSceneFactory(resolved, warnBox, f);

    // engine warnings ride along into the notes sheet and the returned warning list
    (resolved.warnings || []).forEach(function (w) {
      if (!w) return;
      warnBox.list.push({
        id: clean(w.id || 'engine-' + warnBox.list.length),
        severity: w.severity === 'error' ? 'error' : (w.severity === 'info' ? 'info' : 'warning'),
        title: clean(w.title || 'Engine warning'),
        message: clean(w.message || ''),
        cabinetTag: clean(w.cabinetTag || ''),
        rule: clean(w.rule || ''),
        fix: clean(w.fix || '')
      });
    });

    var cabinets = resolved.cabinets || [];
    var sheets = [];

    cabinets.forEach(function (cm) {
      if (!(cm.parts || []).length) {
        warnBox.warn('data', 'Cabinet ' + clean(cm.config && cm.config.tag) + ' has no parts',
          'The engine resolved cabinet ' + clean(cm.config && cm.config.tag) + ' with an empty parts list, so its component drawings, cut-list rows and assembly steps are missing. Re-resolve the project or check the engine output.');
      }
    });
    if (!cabinets.length) {
      warnBox.warn('data', 'No cabinets in project', 'The resolved project has no cabinets; the plan set contains only the cover, notes and schedules.');
    }

    // 1. cover + index
    if (opts.includeCover) sheets.push(buildCoverSheet(state));

    // 2. cabinet schedule
    if (opts.includeSchedules) sheets.push(buildCabinetScheduleSheet(state));

    // 3. general arrangement + per-cabinet whole drawings
    if (cabinets.length) {
      sheets.push(buildGeneralArrangementSheet(state));
      if (opts.includeWholeCabinets) {
        // Narrow bodies (portrait or small sheets) need the two-sheet-per-cabinet
        // layout; wide landscape bodies fit all five views on one sheet.
        var compact = pageBodySize(opts).width < 330;
        cabinets.forEach(function (cm) {
          if (compact) sheets = sheets.concat(buildCompactWholeCabinetSheets(state, cm));
          else sheets = sheets.concat(buildWholeCabinetSheets(state, cm));
        });
      }
    }

    // 4. component drawings
    if (opts.includeComponents && opts.componentScope !== 'none') {
      var groups = componentGroups(resolved, opts.componentScope, warnBox.warn);
      if (groups.length) {
        sheets = sheets.concat(buildComponentSheets(state, groups));
      }
    }

    // 5. cut list
    if (opts.includeCutList) {
      sheets = sheets.concat(buildCutListSheets(state));
    }

    // 6. nesting (solid-stock groups come back with zero sheets: nothing to nest)
    var nestable = (resolved.sheetLayouts || []).filter(function (l) { return (l.sheets || []).length > 0; });
    if (opts.includeNesting && nestable.length) {
      sheets = sheets.concat(buildNestingSheets(state));
    } else if (opts.includeNesting && !(resolved.sheetLayouts || []).length) {
      warnBox.warn('data', 'No sheet layouts', 'No nesting layouts were supplied by the engine; the nesting section is omitted.');
    }

    // 7. door & drawer schedule
    if (opts.includeSchedules) {
      sheets = sheets.concat(buildFrontScheduleSheets(state));
      // 8. hardware schedule
      sheets = sheets.concat(buildHardwareScheduleSheets(state));
    }

    // 9. assembly order
    if (opts.includeAssembly) {
      var anySteps = cabinets.some(function (cm) { return (cm.assembly || []).length; });
      if (anySteps) sheets = sheets.concat(buildAssemblySheets(state));
      else warnBox.warn('data', 'No assembly steps', 'The engine supplied no assembly sequence; the assembly section is omitted.');
    }

    // 10. notes / warnings / sign-off
    if (opts.includeNotes) sheets = sheets.concat(buildNotesSheets(state));

    sheets.forEach(function (sheet, index) { sheet.index = index + 1; });

    return {
      sheets: sheets,
      warnings: warnBox.list,
      options: opts,
      meta: {
        project: project.name,
        cabinetCount: cabinets.length,
        sheetPlanned: sheets.length
      }
    };
  }

  // ============================================================================
  //  COMPONENT DRAWINGS
  // ============================================================================

  /** Paper body size (mm) for a page configuration — mirrors page.js geometry. */
  function pageBodySize(opts) {
    var p = page();
    var sizes = p.PAGE_SIZES || {
      letter: { width: 215.9, height: 279.4 },
      tabloid: { width: 279.4, height: 431.8 },
      a4: { width: 210, height: 297 },
      a3: { width: 297, height: 420 }
    };
    var base = sizes[opts.pageSize] || sizes.letter;
    var landscape = opts.orientation !== 'portrait';
    var w = landscape ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
    var h = landscape ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
    var L = p.LAYOUT || { margin: 12, headerHeight: 9, titleBlockHeight: 22, titleBlockGap: 4 };
    return {
      width: w - 2 * L.margin,
      height: h - 2 * L.margin - L.headerHeight - 3 - L.titleBlockHeight - L.titleBlockGap
    };
  }

  /** Truncate text with an ellipsis so a single-line label always fits its column. */
  function fitText(ctx, text, widthMm, sizeMm, bold) {
    var t = clean(text);
    var measure = function (s) {
      return ctx.backend.measureText(s, { size: sizeMm, bold: !!bold });
    };
    if (measure(t) <= widthMm) return t;
    var cut = t;
    while (cut.length > 2 && measure(cut + '...') > widthMm) cut = cut.slice(0, -1);
    return cut + '...';
  }

  var EDGE_OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left', front: 'back', back: 'front' };
  var DRAWN_EDGES = { top: true, bottom: true, left: true, right: true };

  /**
   * The engine names edgeband edges physically ('front'), while CS.draw.parts labels
   * edges by their position on the drawn face ('bottom'). Map between the two using
   * the Part.view hints. Returns null when the edge cannot be mapped.
   */
  function physicalToDrawnEdge(part, physical) {
    if (!physical) return null;
    if (DRAWN_EDGES[physical]) return physical;
    var view = part.view || {};
    var up = view.up || null;
    var left = view.left || null;
    var map = {};
    if (up) {
      map[up] = 'top';
      map[EDGE_OPPOSITE[up]] = 'bottom';
    }
    if (left) {
      map[left] = 'left';
      map[EDGE_OPPOSITE[left]] = 'right';
    }
    return map[physical] || null;
  }

  function drawnToPhysicalEdge(part, drawn) {
    if (!drawn) return null;
    if (drawn === 'front' || drawn === 'back') return drawn;
    var view = part.view || {};
    var up = view.up || null;
    var left = view.left || null;
    if (drawn === 'top') return up || 'top';
    if (drawn === 'bottom') return up ? EDGE_OPPOSITE[up] : 'bottom';
    if (drawn === 'left') return left || 'left';
    if (drawn === 'right') return left ? EDGE_OPPOSITE[left] : 'right';
    return drawn;
  }

  /**
   * Present a Part to the shared draw builders in their own edge convention:
   * engine edgeband edges are physical ('front'); CS.draw.parts draws drawn-face
   * edges ('bottom'). The rest of the part is untouched (copy-on-write fields only).
   */
  function partForDraw(part) {
    var edges = (part.edgeband && part.edgeband.edges) || [];
    if (!edges.length) return part;
    var drawn = [];
    for (var i = 0; i < edges.length; i++) {
      var mapped = physicalToDrawnEdge(part, edges[i]);
      if (mapped && drawn.indexOf(mapped) < 0) drawn.push(mapped);
      else if (!mapped && DRAWN_EDGES[edges[i]]) drawn.push(edges[i]);
    }
    if (!drawn.length) return part;
    var needsRemap = drawn.length !== edges.length || drawn.some(function (e, idx) { return e !== edges[idx]; });
    if (!needsRemap) return part;
    return Object.assign({}, part, {
      edgeband: Object.assign({}, part.edgeband, { edges: drawn })
    });
  }

  function partEdgebandText(part, f) {
    var eb = part.edgeband;
    if (!eb) return 'none';
    var edges = (eb.edges || []);
    if (!edges.length) return 'none';
    var text = edges.join(', ');
    if (eb.materialId) text += ' · ' + eb.materialId;
    else if (eb.material) text += ' · ' + eb.material;
    else if (finite(eb.thickness)) text += ' · ' + eb.thickness + ' mm';
    return text;
  }

  /** Aggregate part machining into human-readable shop lines, optionally by face. */
  function machiningSummaryLines(part, f, face) {
    var rows = [];
    try {
      rows = (CS.draw.parts && CS.draw.parts.machiningRows) ? CS.draw.parts.machiningRows(part) : [];
    } catch (e) { rows = []; }
    if (face) rows = rows.filter(function (r) { return (r.face || 'A') === face; });
    if (!rows.length) return [];
    var groups = {};
    var order = [];
    rows.forEach(function (r) {
      var key = [r.feature, r.face, r.purpose, r.size, r.depth].join('|');
      if (!groups[key]) {
        groups[key] = {
          feature: r.feature, face: r.face, purpose: r.purpose,
          size: r.size, depth: r.depth, count: 0, coords: []
        };
        order.push(key);
      }
      var g = groups[key];
      g.count++;
      if (finite(r.x) && finite(r.y) && g.coords.length < 4) g.coords.push([r.x, r.y]);
    });
    return order.map(function (key) {
      var g = groups[key];
      var text = g.feature;
      if (g.size) text += ' ' + g.size;
      if (g.depth) text += ' x ' + g.depth;
      if (g.purpose) text += ' — ' + g.purpose;
      text += ' · ' + g.count + ' on face ' + (g.face || 'A');
      if (g.count <= 4 && g.coords.length) {
        text += ' @ ' + g.coords.map(function (c) {
          return '(' + f.mm(c[0]) + ', ' + f.mm(c[1]) + ')';
        }).join(' ');
      }
      return text;
    });
  }

  function hasFaceBMachining(part) {
    return (part.machining || []).some(function (m) { return (m.face || 'A') === 'B'; });
  }

  /**
   * One component drawing per unique part type. Parts machined on both faces get a
   * single drawing with face A and face B side by side (CONTRACT §7 requires both
   * faces to be shown; pairing them halves the component section and reads better).
   */
  function componentDrawingList(groups) {
    return groups.map(function (group) {
      return {
        group: group,
        faces: hasFaceBMachining(group.part) ? ['A', 'B'] : ['A']
      };
    });
  }

  function drawInfoPanel(ctx, x, y, width, entries, opts) {
    opts = opts || {};
    var size = opts.sizeMm || 1.95;
    var labelSize = opts.labelSizeMm || 1.6;
    var lineH = opts.lineHeight || 2.75;
    var labelW = opts.labelWidth || 19;
    var yMax = opts.yMax || Infinity;
    var cursor = y;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (cursor > yMax - lineH) break;
      if (entry.heading) {
        if (cursor > yMax - lineH * 2) break;
        ctx.text(x, cursor, entry.heading, { sizeMm: 1.7, bold: true, baseline: 'top', color: [70, 70, 70] });
        cursor += lineH + 0.4;
        continue;
      }
      var value = clean(entry.value);
      var lines = ctx.wrapLines(value, width - labelW, size, {});
      var rowLines = Math.min(lines.length, 4);
      if (cursor + rowLines * lineH > yMax - 1) {
        rowLines = Math.max(1, Math.floor((yMax - cursor) / lineH));
      }
      ctx.text(x, cursor + 0.35, clean(entry.label), { sizeMm: labelSize, baseline: 'top', color: [105, 105, 105] });
      for (var l = 0; l < rowLines; l++) {
        ctx.text(x + labelW, cursor + l * lineH, lines[l], { sizeMm: size, baseline: 'top' });
      }
      cursor += Math.max(1, rowLines) * lineH + 0.5;
      if (lines.length > rowLines) break;
    }
    return cursor;
  }

  /**
   * One component cell: face view (scaled), the 2x2 edge-detail group and the part
   * information panel. The shared partFace/partEdgeStrip scenes carry the geometry;
   * this function adds grouped labels, quantity, machining summary and notes.
   */
  function drawComponentCell(ctx, state, drawing, box) {
    var f = state.f;
    var opts = state.opts;
    var group = drawing.group;
    var part = group.part;
    var scenes = state.scenes;
    var faces = drawing.faces || ['A'];
    var split = faces.length > 1;

    ctx.backend.rect(box.x, box.y, box.width, box.height, { pen: 'guide', widthMm: 0.18 });
    ctx.backend.line(box.x, box.y + 0.05, box.x + box.width, box.y + 0.05, { pen: 'thin', widthMm: 0.25 });

    var wide = box.width >= 180;
    var headerH = wide ? 8.0 : 6.8;
    var labels = group.labels.slice();
    var labelText = labels.length > 4 ? labels.slice(0, 3).join(', ') + ' +' + (labels.length - 3) : labels.join(', ');
    var title = (labelText || 'PART') + '   ' + clean(part.name || part.key || '');
    title += split ? '   FACES A + B' : '   FACE ' + faces[0];
    var headerSize = wide ? 2.45 : 2.15;
    ctx.text(box.x + 1.8, box.y + 2.0, fitText(ctx, title, box.width - 34, headerSize, true), {
      sizeMm: headerSize, bold: true, baseline: 'top'
    });
    ctx.text(box.x + box.width - 1.8, box.y + 2.0, 'QTY ' + group.qty, {
      sizeMm: 2.0, bold: true, baseline: 'top', align: 'right'
    });
    var qtyLine = [];
    if (group.cabinetTags.length) qtyLine.push('Used in ' + group.cabinetTags.join(', '));
    if (labels.length > 4) qtyLine.push(labels.join(', '));
    if (qtyLine.length) {
      ctx.text(box.x + 1.8, box.y + 5.4, fitText(ctx, qtyLine.join(' · '), box.width - 4, 1.7, false), {
        sizeMm: 1.7, baseline: 'top', color: [85, 85, 85]
      });
    }
    ctx.backend.line(box.x, box.y + headerH - 0.5, box.x + box.width, box.y + headerH - 0.5, { pen: 'guide', widthMm: 0.13 });

    var content = {
      x: box.x,
      y: box.y + headerH,
      width: box.width,
      height: box.height - headerH
    };
    var infoW = content.width * (wide ? 0.36 : 0.38);
    var leftW = content.width - infoW - 2;
    var drawPart = partForDraw(part);

    // ---- face drawing(s): full height on the left; A and B side by side when paired
    var faceScenes = faces.map(function (face) {
      return scenes.part('partFace', drawPart, {
        face: face, dimensions: true, labels: false, title: false, units: opts.units
      }, 'part face');
    });
    var faceBoxes = [];
    if (split) {
      var faceGap = 2;
      var paneW = (leftW - faceGap - 3) / 2;
      faces.forEach(function (face, fi) {
        faceBoxes.push({
          x: content.x + 1.5 + fi * (paneW + faceGap),
          y: content.y + 1.5,
          width: paneW,
          height: content.height - 3
        });
      });
      // one common scale for both faces so they can be compared directly. Compute each
      // pane's margin-aware fit, then use the smaller scale (and flag a fit fallback).
      var paneFits = faceScenes.map(function (scene, fi) {
        return computeSceneFit(ctx, scene, faceBoxes[fi], {
          standard: true,
          padding: 1.2,
          formatLength: scenes.formatLength
        });
      });
      var commonScale = Math.min.apply(null, paneFits.map(function (pf) { return pf.scale; }));
      var commonFit = paneFits.some(function (pf) { return pf.fitInfo.fit; });
      var commonLabel = commonScale >= 1 ? '1:1' : '1:' + Math.max(1, Math.round(1 / commonScale)) + (commonFit ? ' (fit)' : '');
      faceBoxes.forEach(function (fb, fi) {
        drawScene(ctx, faceScenes[fi], fb, {
          standard: true,
          padding: 1.2,
          forceScale: commonScale,
          forceScaleLabel: commonLabel,
          forceScaleFit: commonFit,
          formatLength: scenes.formatLength,
          label: 'CS.draw.parts.partFace'
        });
        ctx.text(fb.x + 1.2, fb.y + 1.0, 'FACE ' + faces[fi], {
          sizeMm: 1.75, bold: true, baseline: 'top', color: [60, 60, 60]
        });
        if (fi === 0) {
          ctx.backend.line(fb.x + fb.width + 1, fb.y, fb.x + fb.width + 1, fb.y + fb.height, {
            pen: 'guide', widthMm: 0.13
          });
        }
      });
    } else {
      faceBoxes.push({ x: content.x + 1.5, y: content.y + 1.5, width: leftW - 3, height: content.height - 3 });
      drawScene(ctx, faceScenes[0], faceBoxes[0], {
        standard: true,
        padding: 1.5,
        formatLength: scenes.formatLength,
        label: 'CS.draw.parts.partFace'
      });
      ctx.text(faceBoxes[0].x + 1.2, faceBoxes[0].y + 1.0, 'FACE ' + faces[0], {
        sizeMm: 1.75, bold: true, baseline: 'top', color: [60, 60, 60]
      });
    }

    // ---- right column: information (top) + edge details (bottom, face A only)
    var rightX = content.x + leftW + 1;
    var rightW = content.width - leftW - 2;
    var infoH = content.height * (wide ? 0.55 : 0.60);
    var infoBox = {
      x: rightX,
      y: content.y + 1.5,
      width: rightW,
      height: infoH - 2
    };
    var edgeBox = {
      x: rightX,
      y: content.y + infoH + 1.5,
      width: rightW,
      height: content.height - infoH - 3
    };

    var entries = [];
    entries.push({ label: 'MATERIAL', value: clean(part.materialName || part.materialId || '—') });
    entries.push({ label: 'THICK', value: f.mm(part.thickness) + '   GRAIN ' + clean(part.grain || 'none') });
    entries.push({ label: 'SIZE L×W', value: f.mm(part.length) + ' × ' + f.mm(part.width) });
    entries.push({ label: 'EDGEBAND', value: partEdgebandText(part, f) });
    if (part.view) {
      var viewBits = [];
      if (part.view.faceA) viewBits.push('face A = ' + part.view.faceA);
      if (part.view.up) viewBits.push('top edge = ' + part.view.up);
      if (part.view.left) viewBits.push('left edge = ' + part.view.left);
      if (viewBits.length) entries.push({ label: 'ORIENT', value: viewBits.join(' · ') });
    }
    var anyMachining = false;
    faces.forEach(function (face) {
      var machining = machiningSummaryLines(part, f, face);
      if (!machining.length) return;
      anyMachining = true;
      entries.push({ heading: 'MACHINING — FACE ' + face });
      machining.forEach(function (m) { entries.push({ label: '', value: m }); });
    });
    if (!anyMachining) {
      entries.push({ heading: 'MACHINING' });
      entries.push({ value: 'None' });
    }
    var notes = (part.notes || []).filter(Boolean).slice();
    if (part.view && part.view.note) notes.unshift(part.view.note);
    if (notes.length) entries.push({ label: 'NOTES', value: notes.join(' · ') });
    if (split) {
      entries.push({ heading: 'FACE B' });
      entries.push({ value: 'Reverse face mirrored about the vertical axis; dimensions are shared with face A.' });
    }
    drawInfoPanel(ctx, infoBox.x, infoBox.y, infoBox.width, entries, {
      sizeMm: wide ? 1.9 : 1.75,
      labelSizeMm: 1.5,
      lineHeight: wide ? 2.65 : 2.5,
      labelWidth: wide ? 17 : 15,
      yMax: infoBox.y + infoBox.height
    });

    // ---- edge details: the banded edge(s) and any rabbeted edge, at 1:5
    var detailEdges = [];
    var bandedPhysical = (part.edgeband && part.edgeband.edges) || [];
    (part.machining || []).forEach(function (m) {
      if (m.type === 'rabbet' && m.edge) {
        var ph = drawnToPhysicalEdge(part, m.edge);
        if (ph && detailEdges.indexOf(ph) < 0) detailEdges.push(ph);
      }
    });
    bandedPhysical.forEach(function (edge) {
      if (detailEdges.indexOf(edge) < 0) detailEdges.push(edge);
    });
    if (!detailEdges.length) {
      detailEdges = [drawnToPhysicalEdge(part, 'top'), drawnToPhysicalEdge(part, 'bottom')].filter(Boolean);
    }
    detailEdges = detailEdges.slice(0, 2);
    var detailH = edgeBox.height / Math.max(1, detailEdges.length);
    detailEdges.forEach(function (physicalEdge, di) {
      var drawnEdge = physicalToDrawnEdge(part, physicalEdge);
      if (!drawnEdge) return;
      var detailBox = {
        x: edgeBox.x,
        y: edgeBox.y + di * detailH,
        width: edgeBox.width,
        height: detailH
      };
      var detailScene = scenes.part('partEdge', drawPart, {
        edge: drawnEdge, dimensions: true, units: opts.units
      }, 'part edge detail');
      if (detailScene && !detailScene.error) {
        var detailCopy = JSON.parse(JSON.stringify(detailScene));
        (detailCopy.items || []).forEach(function (item) {
          if (item.t === 'label' && / EDGE/.test(item.text)) {
            item.text = physicalEdge.toUpperCase() + ' EDGE' + (bandedPhysical.indexOf(physicalEdge) >= 0 ? ' - BANDED' : '');
          }
        });
        detailScene = detailCopy;
      }
      drawScene(ctx, detailScene, detailBox, {
        standard: true,
        padding: 0.6,
        formatLength: scenes.formatLength,
        label: 'CS.draw.parts.partEdge'
      });
    });
  }

  function buildComponentSheets(state, groups) {
    var drawings = componentDrawingList(groups);
    if (!drawings.length) return [];
    var body = pageBodySize(state.opts);
    var large = body.width >= 330;
    var cols = large ? 2 : 1;
    var rows = 2;
    var perPage = cols * rows;
    var gap = 3;
    var total = drawings.length;
    var sheets = [];
    var chunks = chunk(drawings, perPage);
    chunks.forEach(function (chunkDrawings, pageIndex) {
      var start = pageIndex * perPage;
      sheets.push({
        title: 'Component drawings',
        subtitle: 'Parts ' + (start + 1) + '–' + (start + chunkDrawings.length) + ' of ' + total,
        scale: 'VARIES',
        cabinetTag: 'ALL',
        note: 'Face A/B, edge details, dimensions and machining; one drawing per unique part type',
        draw: function (ctx) {
          var y = ctx.body.y;
          ctx.text(ctx.body.x, y, 'COMPONENT DRAWINGS', { sizeMm: 3.4, bold: true, baseline: 'top' });
          ctx.text(ctx.body.x + 62, y + 0.2, 'Drawings ' + (start + 1) + '–' + (start + chunkDrawings.length) + ' of ' + total + ' · one drawing per unique part type · every part number that uses it is listed', {
            sizeMm: 2.05, baseline: 'top', color: [70, 70, 70]
          });
          y += 7.5;
          var usableH = ctx.body.bottom - y;
          var cellH = (usableH - (rows - 1) * gap) / rows;
          var cellW = (ctx.body.width - (cols - 1) * gap) / cols;
          chunkDrawings.forEach(function (drawing, index) {
            var col = index % cols;
            var row = Math.floor(index / cols);
            drawComponentCell(ctx, state, drawing, {
              x: ctx.body.x + col * (cellW + gap),
              y: y + row * (cellH + gap),
              width: cellW,
              height: cellH
            });
          });
          ctx.y = ctx.body.bottom;
        }
      });
    });
    return sheets;
  }

  // ============================================================================
  //  CUT LIST
  // ============================================================================

  /** True when the engine marks this material as a nested sheet good. */
  function isSheetMaterial(sheet) {
    return !!(sheet && sheet.isSheet !== false && (sheet.isSheet === true || sheet.width > 0));
  }

  /** Human label for the sheet/goods description of a cut-list group. */
  function sheetDescription(sheet, f) {
    if (!sheet) return 'solid stock (not nested)';
    if (isSheetMaterial(sheet)) {
      return clean(sheet.label) || (f.sheetDim(sheet.width) + ' × ' + f.sheetDim(sheet.height));
    }
    return clean(sheet.label) || 'solid stock (not nested)';
  }

  function cutListRows(resolved) {
    var rows = [];
    var groups = (resolved.cutList && resolved.cutList.groups) || [];
    groups.forEach(function (group) {
      (group.rows || []).forEach(function (row) {
        rows.push({
          materialId: group.materialId || '',
          materialName: group.materialName || group.materialId || '',
          thickness: finite(row.thickness) ? row.thickness : group.thickness,
          sheet: group.sheet || {},
          labels: (row.labels && row.labels.length) ? row.labels.join(', ') : '',
          name: clean(row.name || row.key),
          qty: finite(row.qty) ? row.qty : 1,
          length: row.length,
          width: row.width,
          grain: clean(row.grain || 'none'),
          edgeband: row.edgeband ? edgebandSummary(row.edgeband) : '—',
          notes: Array.isArray(row.notes) ? row.notes.join(' · ') : clean(row.notes || '')
        });
      });
    });
    return rows;
  }

  function edgebandSummary(eb) {
    if (!eb) return '—';
    if (typeof eb === 'string') return eb;
    var edges = Array.isArray(eb.edges) ? eb.edges : [];
    var parts = [];
    if (edges.length) parts.push(edges.join('/'));
    if (eb.materialId) parts.push(eb.materialId);
    else if (finite(eb.thickness)) parts.push(eb.thickness + ' mm');
    return parts.length ? parts.join(' · ') : '—';
  }

  // ---------------------------------------------------------------- cut planning

  function optimizationOf(resolved) {
    var opt = resolved && resolved.optimization;
    if (!opt || !opt.sheetGoods) return null;
    return opt;
  }

  function optimizationMaterial(opt, layout) {
    if (!opt || !layout) return null;
    var mats = (opt.sheetGoods && opt.sheetGoods.materials) || [];
    for (var i = 0; i < mats.length; i++) {
      if (layout.materialId && mats[i].materialId === layout.materialId) return mats[i];
      if (clean(mats[i].materialName) === clean(layout.materialName)) return mats[i];
    }
    return null;
  }

  function fmtAreaM2(m2, f) {
    var v = finite(m2) ? m2 : 0;
    if (f.units && f.units.formatArea) return f.units.formatArea(v * 1e6, f.unit);
    return v.toFixed(2) + ' m²';
  }

  function fmtBoardFeet(v) {
    var n = finite(v) ? v : 0;
    return (Math.round(n * 10) / 10) + ' bf';
  }

  function objectiveLabel(objective) {
    return objective === 'leastCuts'
      ? 'Fewest saw cuts (less handling, may use more sheet)'
      : 'Fewest sheets (least material)';
  }

  /**
   * MATERIAL PLAN block for the cut-list pages (CUT-PLANNING-SPEC §5): objective,
   * sheet/yield/cut/offcut metrics, solid board feet with milling allowance,
   * purchase tables and the optimizer's boundary notes.
   */
  function drawMaterialPlanBlock(ctx, state, y) {
    var f = state.f;
    var opt = optimizationOf(state.resolved);
    if (!opt) return y;
    var body = ctx.body;
    var sg = opt.sheetGoods || {};
    var ss = opt.solidStock || {};
    var purchase = opt.purchase || {};
    var cuts = sg.cuts || {};
    var offcuts = sg.offcuts || {};

    function continueSheet() {
      ctx.continueSheet({ title: 'Cut list', subtitle: 'Grouped by material — dimensions are finished sizes', scale: 'NTS' });
      y = ctx.body.y;
    }

    // heading + objective
    ctx.text(body.x, y, 'MATERIAL PLAN', { sizeMm: 3.2, bold: true, baseline: 'top' });
    ctx.text(body.x + body.width, y + 0.4, 'Optimize for: ' + objectiveLabel(opt.objective), {
      sizeMm: 2.0, align: 'right', baseline: 'top', color: [60, 60, 60]
    });
    y += 5.4;
    ctx.backend.line(body.x, y, body.x + body.width, y, { pen: 'thin', widthMm: 0.3 });
    y += 2.6;

    // metric strip
    var metrics = [];
    if (finite(sg.sheetCount)) metrics.push(sg.sheetCount + ' sheet' + (sg.sheetCount === 1 ? '' : 's'));
    if (finite(sg.yieldPct)) metrics.push(sg.yieldPct.toFixed(1) + '% yield');
    var sawCutTotal = finite(cuts.totalSawCuts)
      ? cuts.totalSawCuts
      : (finite(cuts.total) ? cuts.total + (finite(cuts.trim) ? cuts.trim : 0) : null);
    if (finite(sawCutTotal)) {
      var cutText = sawCutTotal + ' saw cuts';
      var breakdown = [];
      if (finite(cuts.crosscuts)) breakdown.push(cuts.crosscuts + ' crosscut' + (cuts.crosscuts === 1 ? '' : 's'));
      if (finite(cuts.rips)) breakdown.push(cuts.rips + ' rip' + (cuts.rips === 1 ? '' : 's'));
      if (finite(cuts.trim) && cuts.trim) breakdown.push(cuts.trim + ' edge trim');
      if (breakdown.length) cutText += ' (' + breakdown.join(', ') + ')';
      metrics.push(cutText);
    }
    if (finite(offcuts.count)) metrics.push(offcuts.count + ' offcuts (' + fmtAreaM2(offcuts.areaM2, f) + ')');
    if (finite(ss.purchaseBoardFeet)) metrics.push(fmtBoardFeet(ss.purchaseBoardFeet) + ' solid stock');
    y = ctx.paragraph(metrics.join('  ·  '), body.x, y, body.width, { sizeMm: 2.15, bold: true, lineHeight: 3.2, maxLines: 2 });
    y += 1.2;

    // reusable offcuts + board-foot explanation (net finished vs nominal purchase)
    var detailBits = [];
    if (finite(offcuts.reusableCount)) {
      var reusMinW = finite(offcuts.minWidth) ? offcuts.minWidth : 150;
      var reusMinL = finite(offcuts.minLength) ? offcuts.minLength : 300;
      detailBits.push('Reusable offcuts: ' + offcuts.reusableCount + ' of ' + (offcuts.count || offcuts.reusableCount) +
        ' (' + fmtAreaM2(offcuts.reusableAreaM2, f) + ') · reusable when both sides at least ' +
        f.mm(reusMinW) + ' × ' + f.mm(reusMinL));
    }
    if (finite(ss.netBoardFeet) || finite(ss.purchaseBoardFeet)) {
      var bfText = 'Solid stock: ' + (finite(ss.partsCount) ? ss.partsCount + ' parts · ' : '') +
        fmtBoardFeet(ss.netBoardFeet) + ' net finished BF';
      if (finite(ss.dressingPct) || finite(ss.defectPct)) {
        if (finite(ss.dressingPct) && ss.dressingPct) {
          bfText += ' + ' + ss.dressingPct + '% rough dressing' +
            (finite(ss.dressingBoardFeet) ? ' (' + fmtBoardFeet(ss.dressingBoardFeet) + ')' : '');
        }
        if (finite(ss.defectPct) && ss.defectPct) {
          bfText += ' + ' + ss.defectPct + '% defects' +
            (finite(ss.defectBoardFeet) ? ' (' + fmtBoardFeet(ss.defectBoardFeet) + ')' : '');
        }
      } else if (finite(ss.allowancePct)) {
        bfText += ' + ' + ss.allowancePct + '% milling allowance';
      }
      if (finite(ss.roundingBoardFeet) && ss.roundingBoardFeet > 0.01) {
        bfText += ' + ' + fmtBoardFeet(ss.roundingBoardFeet) + ' rounding';
      }
      if (finite(ss.purchaseBoardFeet)) bfText += ' -> ' + fmtBoardFeet(ss.purchaseBoardFeet) + ' nominal purchase';
      detailBits.push(bfText);
    }
    if (detailBits.length) {
      y = ctx.paragraph(detailBits.join('  ·  '), body.x, y, body.width, { sizeMm: 1.95, lineHeight: 2.9, maxLines: 3 });
    }
    y += 2.2;

    // purchase tables — side by side on wide pages, stacked otherwise
    var sheetRows = (purchase.sheetGoods || []).map(function (item) {
      return {
        material: clean(item.materialName || item.materialId),
        thickness: f.mm(item.thickness),
        qty: String(item.sheets),
        unit: clean(item.unit || 'sheet') + (item.sheets === 1 ? '' : 's'),
        note: clean(item.note)
      };
    });
    var solidRows = (purchase.solidStock || []).map(function (item) {
      return {
        material: clean(item.materialName || item.materialId),
        thickness: f.mm(item.thickness),
        qty: String(finite(item.boardFeet) ? Math.round(item.boardFeet) : '—'),
        unit: clean(item.unit || 'bf'),
        note: clean(item.note)
      };
    });
    var purchaseCols = [
      { key: 'material', title: 'MATERIAL', width: 0.40 },
      { key: 'thickness', title: 'THICK', width: 0.13, align: 'right' },
      { key: 'qty', title: 'QTY', width: 0.10, align: 'right' },
      { key: 'unit', title: 'UNIT', width: 0.11 },
      { key: 'note', title: 'NOTE', width: 0.26 }
    ];
    function tableHeight(rows) {
      return 9 + Math.max(1, rows.length) * 5.8 + 2;
    }
    var widePurchase = body.width >= 300 && sheetRows.length && solidRows.length;
    var needH = widePurchase
      ? Math.max(tableHeight(sheetRows), tableHeight(solidRows)) + 4
      : tableHeight(sheetRows) + (solidRows.length ? tableHeight(solidRows) + 4 : 0) + 4;
    if (!ctx.hasRoom(needH, y)) continueSheet();
    if (widePurchase) {
      var half = (body.width - 4) / 2;
      var yLeft = table().draw(ctx, {
        title: 'SHEET GOODS TO BUY', titleSizeMm: 2.0,
        x: body.x, y: y, width: half,
        columns: purchaseCols, rows: sheetRows, sizeMm: 1.8, headerSizeMm: 1.7, minRowHeight: 4.8,
        meta: { title: 'Cut list', subtitle: 'Material plan', scale: 'NTS' }
      }).y;
      var yRight = table().draw(ctx, {
        title: 'SOLID STOCK TO BUY', titleSizeMm: 2.0,
        x: body.x + half + 4, y: y, width: half,
        columns: purchaseCols, rows: solidRows, sizeMm: 1.8, headerSizeMm: 1.7, minRowHeight: 4.8,
        meta: { title: 'Cut list', subtitle: 'Material plan', scale: 'NTS' }
      }).y;
      y = Math.max(yLeft, yRight) + 4;
    } else {
      if (sheetRows.length) {
        y = table().draw(ctx, {
          title: 'SHEET GOODS TO BUY', titleSizeMm: 2.0,
          x: body.x, y: y, width: body.width,
          columns: purchaseCols, rows: sheetRows, sizeMm: 1.85, headerSizeMm: 1.75, minRowHeight: 5.0,
          meta: { title: 'Cut list', subtitle: 'Material plan', scale: 'NTS' }
        }).y;
        y += 3;
      }
      if (solidRows.length) {
        y = table().draw(ctx, {
          title: 'SOLID STOCK TO BUY', titleSizeMm: 2.0,
          x: body.x, y: y, width: body.width,
          columns: purchaseCols, rows: solidRows, sizeMm: 1.85, headerSizeMm: 1.75, minRowHeight: 5.0,
          meta: { title: 'Cut list', subtitle: 'Material plan', scale: 'NTS' }
        }).y;
        y += 3;
      }
    }

    // optimizer notes + honest boundary
    var notes = (purchase.notes || []).slice();
    if (!notes.length) {
      notes = [
        'Straight-cut/guillotine plan for a panel saw or table saw with a straight edge; dimensions govern, the nesting diagrams are not to scale.',
        'Board feet cover finished solid parts plus a milling allowance for dressing, defects and snipe.'
      ];
    }
    y += 1;
    for (var n = 0; n < notes.length; n++) {
      y = ctx.paragraph('- ' + notes[n], body.x, y, body.width, { sizeMm: 1.85, lineHeight: 2.75, maxLines: 2 });
      y += 0.6;
    }
    // alternative objective trade-off — one line, only when there is room
    var alt = opt.alternative;
    if (alt && alt.objective) {
      var altName = alt.objectiveLabel ? clean(alt.objectiveLabel) : objectiveLabel(alt.objective).replace(/\s*\(.*$/, '');
      var altDelta = alt.delta || null;
      var altMeaningful = altDelta && ['sheets', 'sheetCount', 'cuts', 'cutCount', 'yieldPct'].some(function (key) {
        return finite(altDelta[key]) && Math.abs(altDelta[key]) > 0.05;
      });
      var altCuts = alt.cutCount;
      if (altCuts === undefined && alt.cuts) altCuts = alt.cuts.total;
      var altLine;
      if (altMeaningful) {
        var tradeBits = [];
        if (finite(alt.sheetCount)) tradeBits.push(alt.sheetCount + ' sheet' + (alt.sheetCount === 1 ? '' : 's'));
        if (finite(altCuts)) tradeBits.push(altCuts + ' saw cuts');
        if (finite(alt.yieldPct)) tradeBits.push(alt.yieldPct.toFixed(1) + '% yield');
        var deltaBits = [];
        if (finite(altDelta.sheetCount) && altDelta.sheetCount) deltaBits.push((altDelta.sheetCount > 0 ? '+' : '') + altDelta.sheetCount + ' sheets');
        else if (finite(altDelta.sheets) && altDelta.sheets) deltaBits.push((altDelta.sheets > 0 ? '+' : '') + altDelta.sheets + ' sheets');
        var deltaCuts = finite(altDelta.cutCount) ? altDelta.cutCount : altDelta.cuts;
        if (finite(deltaCuts) && deltaCuts) deltaBits.push((deltaCuts > 0 ? '+' : '') + deltaCuts + ' cuts');
        if (finite(altDelta.yieldPct) && altDelta.yieldPct) deltaBits.push((altDelta.yieldPct > 0 ? '+' : '') + altDelta.yieldPct.toFixed(1) + '% yield');
        altLine = 'Alternative objective — ' + altName + ': ' + tradeBits.join('  ·  ') +
          (deltaBits.length ? '  (' + deltaBits.join(', ') + ' vs selected)' : '');
      } else {
        var sameBits = [];
        if (finite(alt.sheetCount)) sameBits.push(alt.sheetCount + ' sheet' + (alt.sheetCount === 1 ? '' : 's'));
        if (finite(altCuts)) sameBits.push(altCuts + ' saw cuts');
        if (finite(alt.yieldPct)) sameBits.push(alt.yieldPct.toFixed(1) + '% yield');
        altLine = 'Alternative objective — ' + altName + ': same plan under both objectives' +
          (sameBits.length ? ' (' + sameBits.join('  ·  ') + ')' : '') + ' — no trade-off on this project.';
      }
      if (ctx.hasRoom(12, y)) {
        y = ctx.paragraph(altLine, body.x, y, body.width, {
          sizeMm: 1.85, lineHeight: 2.8, maxLines: 2, color: [70, 70, 70]
        });
      }
    }
    y += 2.4;
    return y;
  }

  function buildCutListSheets(state) {
    var f = state.f;
    var resolved = state.resolved;
    var rows = cutListRows(resolved);
    var cutList = resolved.cutList || {};
    var totals = cutList.totals || {};
    var groups = cutList.groups || [];
    var sheets = [{
      title: 'Cut list',
      subtitle: 'Grouped by material — dimensions are finished sizes',
      scale: 'NTS',
      note: 'Cut list dimensions exclude edgebanding thickness unless noted',
      draw: function (ctx) {
        var y = ctx.body.y;
        if (!rows.length) {
          ctx.text(ctx.body.x, y, 'CUT LIST', { sizeMm: 3.4, bold: true, baseline: 'top' });
          ctx.paragraph('No cut-list data was supplied by the engine for this project. This usually means the engine could not resolve the cabinets. Check the validation notes at the end of this set.', ctx.body.x, y + 8, ctx.body.width * 0.8, { sizeMm: 2.4, lineHeight: 3.6 });
          ctx.y = ctx.body.bottom;
          return;
        }
        ctx.text(ctx.body.x, y, 'CUT LIST', { sizeMm: 3.4, bold: true, baseline: 'top' });
        ctx.text(ctx.body.x + 40, y + 0.2, 'Finished part sizes · one line per unique part type · qty is total across the run', {
          sizeMm: 2.05, baseline: 'top', color: [70, 70, 70]
        });
        y += 8;

        // cut-planning material plan block (CUT-PLANNING-SPEC §5)
        if (optimizationOf(resolved)) {
          y = drawMaterialPlanBlock(ctx, state, y);
          y += 3;
        }

        // material summary
        var summaryRows = groups.map(function (g) {
          var r = (g.rows || []);
          var sheetGood = isSheetMaterial(g.sheet);
          return {
            material: clean(g.materialName || g.materialId),
            thickness: f.mm(g.thickness),
            parts: sum(r, function (row) { return finite(row.qty) ? row.qty : 1; }),
            sheets: sheetGood ? 0 : '',
            area: sheetGood ? 0 : '',
            sheetGood: sheetGood,
            sheetSize: sheetDescription(g.sheet, f)
          };
        });
        (resolved.sheetLayouts || []).forEach(function (layout) {
          var match = null;
          for (var i = 0; i < summaryRows.length; i++) {
            if (summaryRows[i].material === clean(layout.materialName || layout.materialId)) { match = summaryRows[i]; break; }
          }
          if (!match || !match.sheetGood) return;
          match.sheets = (layout.sheets || []).length;
          match.area = sum(layout.sheets || [], function (sheet) { return sheet.usedArea || 0; });
        });
        y = table().draw(ctx, {
          title: 'Material summary',
          x: ctx.body.x,
          y: y,
          width: ctx.body.width,
          sizeMm: 2.0,
          headerSizeMm: 1.9,
          minRowHeight: 5.8,
          zebra: false,
          columns: [
            { key: 'material', title: 'MATERIAL', width: 0.34 },
            { key: 'thickness', title: 'THICK', width: 0.10, align: 'right' },
            { key: 'sheetSize', title: 'SHEET SIZE', width: 0.17, align: 'right' },
            { key: 'parts', title: 'PARTS', width: 0.09, align: 'right' },
            { key: 'sheets', title: 'SHEETS', width: 0.09, align: 'right' },
            { key: 'area', title: 'USED AREA', width: 0.21, align: 'right' }
          ],
          rows: summaryRows.map(function (r) {
            return Object.assign({}, r, {
              sheets: r.sheetGood ? String(r.sheets) : '',
              area: r.sheetGood
                ? (f.units.formatArea ? f.units.formatArea(r.area, f.unit) : String(Math.round(r.area / 1e4) / 100) + ' m²')
                : ''
            });
          }),
          footers: [{
            cells: {
              material: 'TOTALS', thickness: '', sheetSize: '',
              parts: String(totals.partCount !== undefined ? totals.partCount : sum(rows, function (r) { return r.qty; })),
              sheets: String(totals.sheetCount !== undefined ? totals.sheetCount : ''),
              area: (function () {
                var used = sum(summaryRows, function (r) { return typeof r.area === 'number' ? r.area : 0; });
                if (f.units.formatArea && used > 0) return f.units.formatArea(used, f.unit);
                return finite(totals.areaM2) ? totals.areaM2.toFixed(2) + ' m²' : '';
              })()
            }
          }]
        }).y;
        y += 4;

        // detail table
        table().draw(ctx, {
          title: 'Part list',
          y: y,
          width: ctx.body.width,
          columns: [
            { key: 'labels', title: 'PART NO.', width: 0.12 },
            { key: 'name', title: 'PART', width: 0.175 },
            { key: 'qty', title: 'QTY', width: 0.045, align: 'right' },
            { key: 'length', title: 'LENGTH', width: 0.085, align: 'right' },
            { key: 'width', title: 'WIDTH', width: 0.08, align: 'right' },
            { key: 'thickness', title: 'THICK', width: 0.06, align: 'right' },
            { key: 'material', title: 'MATERIAL', width: 0.135 },
            { key: 'grain', title: 'GRAIN', width: 0.05 },
            { key: 'edgeband', title: 'EDGEBAND', width: 0.14 },
            { key: 'notes', title: 'NOTES', width: 0.11 }
          ],
          rows: rows.map(function (row) {
            return Object.assign({}, row, {
              length: f.mm(row.length),
              width: f.mm(row.width),
              thickness: f.mm(row.thickness),
              material: row.materialName
            });
          }),
          groupBy: 'materialName',
          groupLabel: function (name) {
            var material = groups.filter(function (g) { return clean(g.materialName || g.materialId) === name; })[0] || {};
            var thick = finite(material.thickness) ? f.mm(material.thickness) : '';
            var sheet = material.sheet
              ? (isSheetMaterial(material.sheet) ? '  ·  sheet ' + sheetDescription(material.sheet, f) : '  ·  ' + sheetDescription(material.sheet, f))
              : '';
            return name + (thick ? '  ·  ' + thick : '') + sheet;
          },
          meta: { title: 'Cut list', subtitle: 'Grouped by material', scale: 'NTS' },
          footers: [
            {
              cells: {
                labels: 'TOTALS', name: rows.length + ' unique parts', qty: String(totals.partCount !== undefined ? totals.partCount : sum(rows, function (r) { return r.qty; })),
                length: '', width: '', thickness: '',
                material: finite(totals.sheetCount) ? totals.sheetCount + ' sheets' : '',
                grain: '', edgeband: finite(totals.edgebandMetres) ? totals.edgebandMetres.toFixed(1) + ' m edgeband' : '',
                notes: [
                  finite(totals.yieldPct) ? totals.yieldPct.toFixed(1) + '% yield' : '',
                  finite(totals.totalSawCuts) ? totals.totalSawCuts + ' saw cuts' : (finite(totals.cutCount) ? totals.cutCount + ' saw cuts' : ''),
                  finite(totals.offcutCount) ? totals.offcutCount + ' offcuts' : '',
                  finite(totals.solidBoardFeet) ? fmtBoardFeet(totals.solidBoardFeet) + ' solid (net)' : ''
                ].filter(Boolean).join(' · ')
              }
            }
          ]
        });
        ctx.y = ctx.body.bottom;
      }
    }];
    return sheets;
  }

  // ============================================================================
  //  SHEET NESTING
  // ============================================================================

  /** Clone a scene without its text annotations, for compact diagrams where the PDF
   *  supplies captions itself (shared builders annotate at paper size, which collides
   *  in small nesting cells). Geometry and pens are untouched. */
  function sceneWithoutText(scene, keepBalloons) {
    if (!scene || scene.error || !scene.items) return scene;
    var copy = {
      items: [],
      meta: scene.meta ? Object.assign({}, scene.meta) : {},
      width: scene.width,
      height: scene.height
    };
    scene.items.forEach(function (item) {
      if (!item || item.t === 'label' || item.t === 'leader') return;
      if (item.t === 'balloon' && !keepBalloons) return;
      copy.items.push(JSON.parse(JSON.stringify(item)));
    });
    if (CS.draw.scene && CS.draw.scene.finalize) CS.draw.scene.finalize(copy);
    else copy.bounds = scene.bounds;
    return copy;
  }

  /** Normalise a sheet's cut list into printable table rows. */
  function cutSequenceRows(sheet, f) {
    var rows = [];
    (sheet.cuts || []).forEach(function (c, i) {
      if (!c) return;
      var type = c.type === 'trim' ? 'Trim' : c.type === 'crosscut' ? 'Crosscut' : c.type === 'rip' ? 'Rip' : clean(c.type || 'Cut');
      var cutText = type;
      if (finite(c.position)) {
        // engine `axis` names the axis the position is measured on:
        // axis 'x' => "X 276 mm" (a rip), axis 'y' => "Y 694 mm" (a crosscut)
        var at = c.axis === 'x' ? 'X' : (c.axis === 'y' ? 'Y' : '');
        cutText += at ? ' at ' + at + ' ' + f.mm(c.position) : ' at ' + f.mm(c.position);
      }
      if (finite(c.length)) cutText += ' · ' + f.mm(c.length) + ' long';
      if (finite(c.width) && c.width) cutText += ' · kerf ' + f.mm(c.width);
      var produced;
      if (c.yields && c.yields.length) produced = c.yields.join(', ');
      else if (c.pieceOut && c.pieceOut.length) produced = c.pieceOut.join(' + ');
      else produced = clean(c.piece || '');
      rows.push({
        seq: String(finite(c.seq) ? c.seq : i + 1),
        cut: cutText,
        parts: produced,
        note: clean(c.note || '')
      });
    });
    // legacy fallback: the compact cutPlan.steps helper
    if (!rows.length && sheet.cutPlan && sheet.cutPlan.steps) {
      sheet.cutPlan.steps.forEach(function (st, i) {
        rows.push({
          seq: String(finite(st.seq) ? st.seq : i + 1),
          cut: clean(st.title || 'Cut'),
          parts: clean(st.detail || ''),
          note: ''
        });
      });
    }
    return rows;
  }

  function offcutRows(sheet, f) {
    return (sheet.offcuts || []).map(function (o, i) {
      var size = (finite(o.width) ? f.mm(o.width) : '—') + ' × ' + (finite(o.height) ? f.mm(o.height) : '—');
      var at = (finite(o.x) ? f.mm(o.x) : '—') + ', ' + (finite(o.y) ? f.mm(o.y) : '—');
      return {
        size: size,
        at: at,
        area: fmtAreaM2(o.areaM2, f),
        reusable: o.reusable ? 'Yes' : 'No',
        note: clean(o.note || o.label || '')
      };
    });
  }

  function placementLabels(sheet) {
    var labels = [];
    (sheet.placements || []).forEach(function (p) {
      var label = clean(p.label || p.key);
      if (label && labels.indexOf(label) < 0) labels.push(label);
    });
    return labels;
  }

  var NEST_CUT_COLS = [
    { key: 'seq', title: '#', width: 0.06, align: 'right' },
    { key: 'cut', title: 'CUT', width: 0.40 },
    { key: 'parts', title: 'PARTS PRODUCED / PIECE', width: 0.34 },
    { key: 'note', title: 'NOTE', width: 0.20 }
  ];
  var NEST_OFFCUT_COLS = [
    { key: 'size', title: 'SIZE L × W', width: 0.30 },
    { key: 'at', title: 'AT (X, Y)', width: 0.24, align: 'right' },
    { key: 'area', title: 'AREA', width: 0.20, align: 'right' },
    { key: 'reusable', title: 'REUSE', width: 0.12 },
    { key: 'note', title: 'NOTE', width: 0.14 }
  ];

  /** Compact diagram grid for narrow nesting pages (2 across, parts list under each). */
  function drawNarrowNestingDiagrams(ctx, state, layout, layoutIndex, sheets, y, materialName) {
    var f = state.f;
    var body = ctx.body;
    var meta = { title: 'Sheet nesting — ' + materialName, scale: 'NTS', cabinetTag: 'ALL' };
    var cols = 2;
    var gap = 3;
    var cellW = (body.width - (cols - 1) * gap) / cols;
    var captionH = 4.2;
    var labelsH = 11.0;
    var aspect = (layout.sheet && layout.sheet.width) ? ((layout.sheet.height || 2440) / layout.sheet.width) : 2;
    var cellH = Math.min(body.bottom - y - 2, cellW * aspect + captionH + labelsH + 6);
    cellH = Math.max(60, cellH);
    for (var start = 0; start < sheets.length; start += cols) {
      if (start > 0) {
        ctx.continueSheet(meta);
        y = ctx.body.y;
      }
      var pageSheets = sheets.slice(start, start + cols);
      for (var c = 0; c < pageSheets.length; c++) {
        var sheet = pageSheets[c];
        var sheetNumber = start + c;
        var box = { x: body.x + c * (cellW + gap), y: y, width: cellW, height: cellH };
        ctx.backend.rect(box.x, box.y, box.width, box.height, { pen: 'guide', widthMm: 0.13 });
        var util = finite(sheet.wastePct) ? (100 - sheet.wastePct) : (finite(sheet.utilization) ? sheet.utilization : 0);
        var cuts = cutSequenceRows(sheet, f);
        var trimN = finite(sheet.trimCuts) ? sheet.trimCuts : 0;
        var infoBits = [placementsCount(sheet) + ' parts', util.toFixed(1) + '% used'];
        if (cuts.length) infoBits.push((finite(sheet.cutCount) ? sheet.cutCount : cuts.length) + trimN + ' cuts');
        ctx.text(box.x + 1.2, box.y + 1.4, 'SHEET ' + (sheetNumber + 1) + ' OF ' + sheets.length, { sizeMm: 2.0, bold: true, baseline: 'top' });
        ctx.text(box.x + box.width - 1.2, box.y + 1.5, infoBits.join(' · '), { sizeMm: 1.7, align: 'right', baseline: 'top', color: [70, 70, 70] });
        var diagramBox = { x: box.x + 1, y: box.y + captionH + 0.5, width: box.width - 2, height: box.height - captionH - labelsH - 1 };
        var scene = state.scenes.raw(
          'nest:' + layoutIndex + ':' + sheetNumber,
          'views', 'sheetLayoutScene',
          [layout, sheetNumber, { units: state.opts.units }],
          'sheet layout'
        );
        drawScene(ctx, sceneWithoutText(scene), diagramBox, {
          standard: false, padding: 1, formatLength: state.scenes.formatLength, label: 'CS.draw.views.sheetLayoutScene'
        });
        var labels = placementLabels(sheet);
        var labelLines = ctx.wrapLines('Parts: ' + (labels.length ? labels.join(', ') : 'none'), box.width - 3, 1.6, {});
        for (var l = 0; l < Math.min(labelLines.length, 3); l++) {
          ctx.text(box.x + 1.4, box.y + box.height - labelsH + 1.2 + l * 2.4, labelLines[l], {
            sizeMm: 1.6, baseline: 'top', color: [55, 55, 55]
          });
        }
      }
    }
    return y + cellH + 4;
  }

  function placementsCount(sheet) { return (sheet.placements || []).length; }

  /** Full-width cut sequence + offcut tables for one sheet on a narrow nesting page. */
  function drawNarrowSheetDetails(ctx, state, sheet, sheetNumber, sheetTotal, y, meta) {
    var f = state.f;
    var body = ctx.body;
    var cuts = cutSequenceRows(sheet, f);
    var offcuts = offcutRows(sheet, f);
    if (!cuts.length && !offcuts.length && !finite(sheet.cutCount)) return y;
    if (!ctx.hasRoom(26, y)) {
      ctx.continueSheet(meta);
      y = ctx.body.y;
    }
    var util = finite(sheet.wastePct) ? (100 - sheet.wastePct) : (finite(sheet.utilization) ? sheet.utilization : 0);
    ctx.text(body.x, y, 'SHEET ' + (sheetNumber + 1) + ' OF ' + sheetTotal + ' — DETAILS', { sizeMm: 2.1, bold: true, baseline: 'top' });
    var localTrim = finite(sheet.trimCuts) ? sheet.trimCuts : 0;
    var localCuts = finite(sheet.cutCount) ? sheet.cutCount : cuts.length;
    ctx.text(body.x + body.width, y + 0.2, util.toFixed(1) + '% used · ' +
      (localTrim ? (localCuts + localTrim) + ' saw cuts (' + localCuts + ' + ' + localTrim + ' trim)' : localCuts + ' cuts'), {
      sizeMm: 1.8, align: 'right', baseline: 'top', color: [70, 70, 70]
    });
    if (localTrim) {
      ctx.text(body.x, y + 2.4, 'Edge-trim cuts (' + localTrim + ') are taken from the sheet edges first and are included in the material plan count.', {
        sizeMm: 1.6, baseline: 'top', color: [90, 90, 90]
      });
      y += 2.2;
    }
    y += 4.4;
    if (!ctx.hasRoom(16, y)) { ctx.continueSheet(meta); y = ctx.body.y; }
    if (cuts.length) {
      y = table().draw(ctx, {
        title: 'CUT SEQUENCE', titleSizeMm: 1.9,
        x: body.x, y: y, width: body.width,
        columns: NEST_CUT_COLS, rows: cuts,
        sizeMm: 1.8, headerSizeMm: 1.7, minRowHeight: 4.4,
        meta: meta
      }).y + 2.5;
    } else {
      ctx.text(body.x, y, 'CUT SEQUENCE', { sizeMm: 1.8, bold: true, baseline: 'top', color: [70, 70, 70] });
      ctx.text(body.x, y + 3.4, 'No cut sequence supplied for this sheet.', { sizeMm: 1.8, baseline: 'top', color: [90, 90, 90] });
      y += 8;
    }
    if (!ctx.hasRoom(16, y)) { ctx.continueSheet(meta); y = ctx.body.y; }
    if (offcuts.length) {
      y = table().draw(ctx, {
        title: 'OFFCUTS', titleSizeMm: 1.9,
        x: body.x, y: y, width: body.width,
        columns: NEST_OFFCUT_COLS, rows: offcuts,
        sizeMm: 1.8, headerSizeMm: 1.7, minRowHeight: 4.4,
        meta: meta
      }).y + 2.5;
    } else {
      ctx.text(body.x, y, 'OFFCUTS  None left on this sheet.', { sizeMm: 1.7, baseline: 'top', color: [90, 90, 90] });
      y += 5;
    }
    return y;
  }

  /**
   * One sheet card on a nesting page: the existing nesting diagram plus the planner's
   * numbered cut sequence and offcut list. Wide pages put the diagram left and both
   * tables right; narrow pages stack them. Long tables continue after the card with
   * repeated headings so nothing is ever clipped.
   */
  function drawNestingSheetCard(ctx, state, layout, layoutIndex, sheet, sheetNumber, sheetTotal, y, materialName) {
    var f = state.f;
    var body = ctx.body;
    var meta = { title: 'Sheet nesting — ' + materialName, scale: 'NTS', cabinetTag: 'ALL' };
    var cuts = cutSequenceRows(sheet, f);
    var offcuts = offcutRows(sheet, f);
    var placements = sheet.placements || [];
    var util = finite(sheet.wastePct) ? (100 - sheet.wastePct) : (finite(sheet.utilization) ? sheet.utilization : 0);
    var cutCount = finite(sheet.cutCount) ? sheet.cutCount : cuts.length;
    var wide = body.width >= 330;
    // measured-style estimates at the card typography (1.7 mm text + padding)
    var cutTableH = cuts.length ? (8 + cuts.length * 4.6 + 2) : 0;
    var offTableH = offcuts.length ? (8 + offcuts.length * 4.6 + 2) : 0;
    var neededRight = cutTableH + ((cutTableH && offTableH) ? 3 : 0) + offTableH;
    var minCardH = wide ? 88 : 112;
    if (!ctx.hasRoom(minCardH, y)) {
      ctx.continueSheet(meta);
      y = ctx.body.y;
    }
    var available = ctx.body.bottom - y;
    var cardH = wide
      ? Math.min(available, Math.max(minCardH, Math.min(neededRight + 12, available)))
      : Math.min(available, 158);
    var cardBottom = y + cardH - 1;
    var contentY = y + 5.2;
    var x = body.x;

    // card header strip
    ctx.backend.line(x, y, x + body.width, y, { pen: 'thin', widthMm: 0.25 });
    ctx.text(x, y + 1.2, 'SHEET ' + (sheetNumber + 1) + ' OF ' + sheetTotal, { sizeMm: 2.1, bold: true, baseline: 'top' });
    var trimCuts = finite(sheet.trimCuts) ? sheet.trimCuts : 0;
    var infoBits = [util.toFixed(1) + '% used'];
    if (cuts.length || cutCount) {
      infoBits.push(trimCuts
        ? (cutCount + trimCuts) + ' saw cuts (' + cutCount + ' + ' + trimCuts + ' trim)'
        : cutCount + ' cuts');
    }
    infoBits.push(placements.length + ' part' + (placements.length === 1 ? '' : 's'));
    if (offcuts.length) infoBits.push(offcuts.length + ' offcuts');
    ctx.text(x + body.width, y + 1.4, infoBits.join('  ·  '), {
      sizeMm: 1.8, align: 'right', baseline: 'top', color: [70, 70, 70]
    });

    var cutRes = { drawn: 0, remaining: cuts, y: contentY };
    var offRes = { drawn: 0, remaining: offcuts, y: contentY };
    var labels = placementLabels(sheet);
    var labelText = 'Parts: ' + (labels.length ? labels.join(', ') : 'none');

    if (wide) {
      var leftW = (body.width - 4) * 0.42;
      var diagTop = contentY;
      var labelLines = ctx.wrapLines(labelText, leftW - 2, 1.6, {});
      var labelBlockH = Math.min(labelLines.length, 2) * 2.45 + 1.2;
      var diagH = Math.max(36, cardBottom - diagTop - labelBlockH - 1);
      var scene = state.scenes.raw(
        'nest:' + layoutIndex + ':' + sheetNumber,
        'views', 'sheetLayoutScene',
        [layout, sheetNumber, { units: state.opts.units }],
        'sheet layout'
      );
      drawScene(ctx, sceneWithoutText(scene), {
        x: x + 1.2, y: diagTop, width: leftW - 2.4, height: diagH
      }, {
        standard: false, padding: 1, formatLength: state.scenes.formatLength, label: 'CS.draw.views.sheetLayoutScene'
      });
      for (var li = 0; li < Math.min(labelLines.length, 2); li++) {
        ctx.text(x + 1.2, cardBottom - labelBlockH + 1.2 + li * 2.45, labelLines[li], {
          sizeMm: 1.6, baseline: 'top', color: [55, 55, 55]
        });
      }
      var tableX = x + leftW + 2;
      var tableW = body.width - leftW - 3;
      var rightH = cardBottom - contentY;
      var cutMaxY;
      var offcutTop;
      // prefer a complete cut sequence inside the card; offcuts may continue on the
      // next page if the sheet has many remnants
      var reserveOff = offcuts.length ? Math.min(offTableH, 46) : 0;
      cutMaxY = Math.min(contentY + cutTableH, cardBottom - reserveOff);
      if (cutMaxY < contentY + 12) cutMaxY = contentY + rightH * 0.62;
      offcutTop = cutMaxY + 3;
      if (cuts.length) {
        cutRes = table().drawBounded(ctx, {
          x: tableX, y: contentY, width: tableW, maxY: cutMaxY,
          title: 'CUT SEQUENCE', titleSizeMm: 1.7,
          columns: NEST_CUT_COLS, rows: cuts,
          sizeMm: 1.7, headerSizeMm: 1.6, minRowHeight: 4.0
        });
      } else {
        ctx.text(tableX, contentY, 'CUT SEQUENCE', { sizeMm: 1.7, bold: true, baseline: 'top', color: [70, 70, 70] });
        ctx.text(tableX, contentY + 3.4, 'No cut sequence supplied for this sheet.', { sizeMm: 1.7, baseline: 'top', color: [90, 90, 90] });
        cutRes.y = contentY + 6;
      }
      offcutTop = Math.max(cutRes.y + 2.2, offcutTop);
      if (offcuts.length) {
        offRes = table().drawBounded(ctx, {
          x: tableX, y: offcutTop, width: tableW, maxY: cardBottom,
          title: 'OFFCUTS', titleSizeMm: 1.7,
          columns: NEST_OFFCUT_COLS, rows: offcuts,
          sizeMm: 1.7, headerSizeMm: 1.6, minRowHeight: 4.0
        });
      } else {
        ctx.text(tableX, offcutTop, 'OFFCUTS  None left on this sheet.', { sizeMm: 1.7, baseline: 'top', color: [90, 90, 90] });
      }
    } else {
      // narrow pages: diagram on top, tables stacked below, card may continue
      var diagH2 = Math.max(38, Math.min((cardBottom - contentY) * 0.46, (body.width - 3) * ((layout.sheet && layout.sheet.height && layout.sheet.width) ? layout.sheet.height / layout.sheet.width : 2)));
      var scene2 = state.scenes.raw(
        'nest:' + layoutIndex + ':' + sheetNumber,
        'views', 'sheetLayoutScene',
        [layout, sheetNumber, { units: state.opts.units }],
        'sheet layout'
      );
      drawScene(ctx, sceneWithoutText(scene2), { x: x + 1, y: contentY, width: body.width - 2, height: diagH2 }, {
        standard: false, padding: 1, formatLength: state.scenes.formatLength, label: 'CS.draw.views.sheetLayoutScene'
      });
      var labelsBelow = ctx.wrapLines(labelText, body.width - 3, 1.6, {});
      var ly = contentY + diagH2 + 1;
      for (var lj = 0; lj < Math.min(labelsBelow.length, 2); lj++) {
        ctx.text(x + 1, ly + lj * 2.45, labelsBelow[lj], { sizeMm: 1.6, baseline: 'top', color: [55, 55, 55] });
      }
      var narrowTop = ly + Math.min(labelsBelow.length, 2) * 2.45 + 1.6;
      var narrowCutMax = narrowTop + (cardBottom - narrowTop) * 0.58;
      if (cuts.length) {
        cutRes = table().drawBounded(ctx, {
          x: x, y: narrowTop, width: body.width, maxY: narrowCutMax,
          title: 'CUT SEQUENCE', titleSizeMm: 1.7,
          columns: NEST_CUT_COLS, rows: cuts,
          sizeMm: 1.7, headerSizeMm: 1.6, minRowHeight: 4.0
        });
      } else {
        ctx.text(x, narrowTop, 'CUT SEQUENCE', { sizeMm: 1.7, bold: true, baseline: 'top', color: [70, 70, 70] });
        cutRes.y = narrowTop + 4;
      }
      if (offcuts.length) {
        offRes = table().drawBounded(ctx, {
          x: x, y: Math.max(cutRes.y + 2, narrowCutMax + 1), width: body.width, maxY: cardBottom,
          title: 'OFFCUTS', titleSizeMm: 1.7,
          columns: NEST_OFFCUT_COLS, rows: offcuts,
          sizeMm: 1.7, headerSizeMm: 1.6, minRowHeight: 4.0
        });
      }
    }

    // anything that did not fit in the card continues with repeated headings,
    // stacked in order after the card (never at the stale ctx.y at the page top)
    var contY = cardBottom + 3;
    if (!ctx.hasRoom(cutRes.remaining.length ? 24 : 14, contY)) {
      ctx.continueSheet(meta);
      contY = ctx.body.y;
    }
    if (cutRes.remaining && cutRes.remaining.length) {
      if (!ctx.hasRoom(24, contY)) { ctx.continueSheet(meta); contY = ctx.body.y; }
      contY = table().draw(ctx, {
        title: 'Cut sequence — sheet ' + (sheetNumber + 1) + ' (continued)',
        x: x, y: contY, width: body.width,
        columns: NEST_CUT_COLS, rows: cutRes.remaining,
        sizeMm: 1.8, headerSizeMm: 1.7, minRowHeight: 4.4,
        meta: meta
      }).y + 2;
    }
    if (offRes.remaining && offRes.remaining.length) {
      if (!ctx.hasRoom(20, contY)) { ctx.continueSheet(meta); contY = ctx.body.y; }
      contY = table().draw(ctx, {
        title: 'Offcuts — sheet ' + (sheetNumber + 1) + ' (continued)',
        x: x, y: contY, width: body.width,
        columns: NEST_OFFCUT_COLS, rows: offRes.remaining,
        sizeMm: 1.8, headerSizeMm: 1.7, minRowHeight: 4.4,
        meta: meta
      }).y + 2;
    }
    ctx.y = contY;
    return contY;
  }

  function buildNestingSheets(state) {
    var f = state.f;
    var opts = state.opts;
    var resolved = state.resolved;
    var layouts = resolved.sheetLayouts || [];
    var opt = optimizationOf(resolved);
    return layouts.map(function (layout, layoutIndex) {
      var sheets = layout.sheets || [];
      if (!sheets.length) return null;
      var materialName = clean(layout.materialName || layout.materialId);
      var materialOpt = optimizationMaterial(opt, layout);
      var meta = { title: 'Sheet nesting — ' + materialName, scale: 'NTS', cabinetTag: 'ALL' };
      return {
        title: meta.title,
        subtitle: sheets.length + ' sheet' + (sheets.length === 1 ? '' : 's') + (layout.notes && layout.notes.length ? ' · ' + layout.notes.join('; ') : ''),
        scale: 'NTS',
        cabinetTag: 'ALL',
        note: 'Dimensions govern - the nesting diagram is not to scale. Verify grain, kerf and sheet condition before cutting.',
        draw: function (ctx) {
          var y = ctx.body.y;
          var layoutTitle = 'SHEET LAYOUT - ' + materialName.toUpperCase();
          ctx.text(ctx.body.x, y, layoutTitle, { sizeMm: 3.3, bold: true, baseline: 'top' });
          var sheetDim = sheetDescription(layout.sheet, f);
          var details = sheetDim + ' · kerf ' + f.mm(layout.kerf || 3) + ' · trim ' + f.mm(layout.trim || 10);
          ctx.text(ctx.body.x + ctx.body.width, y + 0.2, details, {
            sizeMm: 2.05, baseline: 'top', align: 'right', color: [70, 70, 70]
          });
          y += 6.2;

          // planner summary for this material
          var usedArea = sum(sheets, function (sheet) {
            return finite(sheet.usedArea) ? sheet.usedArea : sum(sheet.placements || [], function (p) { return (p.width || 0) * (p.height || 0); });
          });
          var sheetArea = layout.sheet ? layout.sheet.width * layout.sheet.height * sheets.length : 0;
          var avgUtil = sheetArea > 0 ? (100 * usedArea / sheetArea) : 0;
          var summaryBits = [sheets.length + ' sheet' + (sheets.length === 1 ? '' : 's')];
          if (f.units.formatArea && sheetArea > 0) {
            summaryBits.push('used ' + f.units.formatArea(usedArea, f.unit));
            summaryBits.push('average utilization ' + avgUtil.toFixed(1) + '%');
          }
          if (materialOpt) {
            var mCuts = materialOpt.cuts || {};
            var mOff = materialOpt.offcuts || {};
            var mSaw = finite(mCuts.totalSawCuts) ? mCuts.totalSawCuts : mCuts.total;
            if (finite(mSaw)) {
              var cutBreak = [];
              if (finite(mCuts.crosscuts)) cutBreak.push(mCuts.crosscuts + ' crosscut' + (mCuts.crosscuts === 1 ? '' : 's'));
              if (finite(mCuts.rips)) cutBreak.push(mCuts.rips + ' rip' + (mCuts.rips === 1 ? '' : 's'));
              if (finite(mCuts.trim) && mCuts.trim) cutBreak.push(mCuts.trim + ' edge trim');
              summaryBits.push(mSaw + ' saw cuts' + (cutBreak.length ? ' (' + cutBreak.join(', ') + ')' : ''));
            }
            if (finite(mOff.count)) {
              summaryBits.push(mOff.count + ' offcuts' + (finite(mOff.reusableCount) ? ' · ' + mOff.reusableCount + ' reusable' : ''));
            }
          }
          if ((layout.unplaced || []).length) summaryBits.push((layout.unplaced || []).length + ' unplaced part(s)');
          y = ctx.paragraph(summaryBits.join('  ·  '), ctx.body.x, y, ctx.body.width, { sizeMm: 2.0, lineHeight: 3.0, maxLines: 2 });
          y += 2.4;

          // nesting notes + honest boundary (before the per-sheet detail so no page
          // ends with orphaned notes)
          var notes = (layout.notes || []).slice();
          if (opt) {
            notes.push('Cut sequence is a straight-cut/guillotine plan; dimensions govern, not the diagram.');
            notes.push('Offcuts are reusable when both sides meet the minimum offcut size; label and store them.');
          }
          if (notes.length) {
            y = ctx.paragraph('NESTING NOTES  ' + notes.join(' · '), ctx.body.x, y, ctx.body.width, {
              sizeMm: 1.9, lineHeight: 2.8, maxLines: 3
            });
            y += 2.2;
          }

          var widePage = pageBodySize(state.opts).width >= 330;
          if (widePage) {
            // one detailed card per sheet, diagram left, sequence/offcut tables right
            for (var si = 0; si < sheets.length; si++) {
              y = drawNestingSheetCard(ctx, state, layout, layoutIndex, sheets[si], si, sheets.length, y, materialName);
            }
          } else {
            // narrow pages: compact diagram grid first, then full-width sequence and
            // offcut tables per sheet (a card per sheet would leave unusable columns)
            y = drawNarrowNestingDiagrams(ctx, state, layout, layoutIndex, sheets, y, materialName);
            for (var sj = 0; sj < sheets.length; sj++) {
              y = drawNarrowSheetDetails(ctx, state, sheets[sj], sj, sheets.length, y, meta);
            }
          }

          // unplaced parts
          var unplaced = layout.unplaced || [];
          if (unplaced.length) {
            if (!ctx.hasRoom(26, y)) { ctx.continueSheet(meta); y = ctx.body.y; }
            table().draw(ctx, {
              title: 'Unplaced parts — no room on the standard sheets',
              x: ctx.body.x,
              y: y,
              width: ctx.body.width,
              columns: [
                { key: 'label', title: 'PART', width: 0.16 },
                { key: 'name', title: 'DESCRIPTION', width: 0.34 },
                { key: 'size', title: 'SIZE L × W', width: 0.24 },
                { key: 'reason', title: 'NOTE', width: 0.26 }
              ],
              rows: unplaced.map(function (u) {
                return {
                  label: clean(u.label || u.key),
                  name: clean(u.name || u.key),
                  size: (finite(u.length) ? f.mm(u.length) + ' × ' + f.mm(u.width) : ''),
                  reason: clean(u.reason || u.note || 'Does not fit a standard sheet; use offcut or oversize stock')
                };
              }),
              sizeMm: 1.95,
              meta: meta
            });
            y = ctx.y;
          }

          ctx.y = ctx.body.bottom;
        }
      };
    }).filter(Boolean);
  }

  // ============================================================================
  //  DOOR & DRAWER SCHEDULE
  // ============================================================================

  function buildFrontScheduleSheets(state) {
    var f = state.f;
    var items = state.resolved.frontSchedule || [];
    if (!items.length) return [];
    var rows = items.map(function (item) {
      return {
        tag: clean(item.cabinetTag),
        label: clean(item.label),
        kind: item.kind === 'drawer-front' ? 'Drawer front' : 'Door',
        qty: finite(item.qty) ? item.qty : 1,
        width: f.mm(item.width),
        height: f.mm(item.height),
        thickness: f.mm(item.thickness),
        style: clean(item.style),
        material: item.materialName ? clean(item.materialName) : materialDisplayName(item.materialId),
        overlay: clean(item.overlay),
        hingeSide: clean(item.hingeSide),
        hingeCount: clean(item.hingeCount),
        pull: clean(item.pull && (item.pull.id || item.pull.name) || item.pull || ''),
        note: clean(item.note)
      };
    });
    var doorCount = sum(items, function (i) { return i.kind === 'door' ? (i.qty || 1) : 0; });
    var drawerCount = sum(items, function (i) { return i.kind === 'drawer-front' ? (i.qty || 1) : 0; });
    return [{
      title: 'Door & drawer schedule',
      subtitle: 'Front sizes, style, material, hinge and pull',
      scale: 'NTS',
      cabinetTag: 'ALL',
      note: 'Front sizes are finished sizes; hinge side is as viewed from the front',
      draw: function (ctx) {
        var y = ctx.body.y;
        ctx.text(ctx.body.x, y, 'DOOR & DRAWER SCHEDULE', { sizeMm: 3.4, bold: true, baseline: 'top' });
        ctx.text(ctx.body.x + 78, y + 0.2, doorCount + ' door leaf(s) · ' + drawerCount + ' drawer front(s) · ' + items.length + ' front types', {
          sizeMm: 2.05, baseline: 'top', color: [70, 70, 70]
        });
        y += 8;
        table().draw(ctx, {
          title: null,
          x: ctx.body.x,
          y: y,
          width: ctx.body.width,
          columns: [
            { key: 'tag', title: 'CAB', width: 0.055, bold: true },
            { key: 'label', title: 'FRONT NO.', width: 0.075 },
            { key: 'kind', title: 'TYPE', width: 0.075 },
            { key: 'qty', title: 'QTY', width: 0.04, align: 'right' },
            { key: 'width', title: 'WIDTH', width: 0.075, align: 'right' },
            { key: 'height', title: 'HEIGHT', width: 0.075, align: 'right' },
            { key: 'thickness', title: 'THICK', width: 0.055, align: 'right' },
            { key: 'style', title: 'STYLE', width: 0.09 },
            { key: 'material', title: 'MATERIAL', width: 0.13 },
            { key: 'overlay', title: 'OVERLAY', width: 0.07 },
            { key: 'hingeSide', title: 'HINGE', width: 0.075 },
            { key: 'hingeCount', title: '#', width: 0.035, align: 'right' },
            { key: 'pull', title: 'PULL', width: 0.10 },
            { key: 'note', title: 'NOTE', width: 0.09 }
          ],
          rows: rows,
          groupBy: 'tag',
          groupLabel: function (tag) {
            var model = null;
            (state.resolved.cabinets || []).forEach(function (cm) { if (clean(cm.config.tag) === tag) model = cm; });
            return 'Cabinet ' + tag + (model ? ' — ' + clean(model.config.name) : '');
          },
          meta: { title: 'Door & drawer schedule', scale: 'NTS' },
          footers: [{
            cells: {
              tag: 'TOTAL', label: doorCount + ' doors', kind: drawerCount + ' drawers', qty: '',
              width: '', height: '', thickness: '', style: '', material: '', overlay: '', hingeSide: '', hingeCount: '', pull: '', note: ''
            }
          }]
        });
        ctx.y = ctx.body.bottom;
      }
    }];
  }

  // ============================================================================
  //  HARDWARE SCHEDULE
  // ============================================================================

  function buildHardwareScheduleSheets(state) {
    var f = state.f;
    var items = state.resolved.hardware || [];
    if (!items.length) return [];
    var rows = items.map(function (item) {
      return {
        category: clean(item.category || 'Hardware'),
        name: clean(item.name || item.id),
        tags: Array.isArray(item.cabinetTags) ? item.cabinetTags.join(', ') : clean(item.cabinetTag || ''),
        qty: finite(item.qty) ? item.qty : 1,
        unit: clean(item.unit || 'ea'),
        install: clean(item.install || ''),
        notes: clean(item.notes || '')
      };
    });
    var totalQty = sum(rows, function (r) { return r.qty; });
    return [{
      title: 'Hardware schedule',
      subtitle: 'Aggregated hardware with quantities and installation notes',
      scale: 'NTS',
      cabinetTag: 'ALL',
      note: 'Confirm hinge overlay and slide lengths against the fronts before ordering',
      draw: function (ctx) {
        var y = ctx.body.y;
        ctx.text(ctx.body.x, y, 'HARDWARE SCHEDULE', { sizeMm: 3.4, bold: true, baseline: 'top' });
        ctx.text(ctx.body.x + 58, y + 0.2, rows.length + ' line items · ' + totalQty + ' pieces total', {
          sizeMm: 2.05, baseline: 'top', color: [70, 70, 70]
        });
        y += 8;
        table().draw(ctx, {
          title: null,
          x: ctx.body.x,
          y: y,
          width: ctx.body.width,
          columns: [
            { key: 'name', title: 'HARDWARE', width: 0.30 },
            { key: 'tags', title: 'CABINETS', width: 0.15 },
            { key: 'qty', title: 'QTY', width: 0.07, align: 'right' },
            { key: 'unit', title: 'UNIT', width: 0.06 },
            { key: 'install', title: 'INSTALL', width: 0.28 },
            { key: 'notes', title: 'NOTES', width: 0.14 }
          ],
          rows: rows,
          groupBy: 'category',
          groupLabel: function (category) {
            var labels = {
              slide: 'Drawer slides', hinge: 'Hinges', pull: 'Pulls', accessory: 'Accessories',
              fastener: 'Fasteners', shelf: 'Shelving', mounting: 'Mounting', edgeband: 'Edgebanding',
              other: 'Other hardware'
            };
            var key = String(category || '').toLowerCase();
            return labels[key] || (category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Hardware');
          },
          meta: { title: 'Hardware schedule', scale: 'NTS' },
          footers: [{
            cells: { name: 'TOTAL', tags: '', qty: String(totalQty), unit: '', install: '', notes: rows.length + ' line items' }
          }]
        });
        ctx.y = ctx.body.bottom;
      }
    }];
  }

  // ============================================================================
  //  ASSEMBLY ORDER
  // ============================================================================

  /** Resolve assembly step ids to the human part labels / hardware names. */
  function stepReferenceMaps(cm, resolved) {
    var parts = {};
    (cm.parts || []).forEach(function (p) { parts[p.id] = p; });
    var hardware = {};
    (resolved.hardware || []).concat(cm.hardware || []).forEach(function (h) {
      if (h && h.id) hardware[h.id] = h;
    });
    return { parts: parts, hardware: hardware };
  }

  function drawAssemblyStep(ctx, state, cm, step, box) {
    var f = state.f;
    var scenes = state.scenes;
    var maps = stepReferenceMaps(cm, state.resolved);
    var illusW = Math.min(215, Math.max(85, box.width * 0.44));
    var textW = box.width - illusW - 9;
    var maxY = box.y + box.height - 1;

    // step number medallion
    var numX = box.x + 6;
    var numY = box.y + 6.4;
    ctx.backend.circle(numX, numY, 3.6, { pen: 'cut', fill: 'light', widthMm: 0.3 });
    ctx.backend.text(numX, numY + 0.1, String(step.order || ''), {
      sizeMm: 2.7, bold: true, align: 'center', baseline: 'middle'
    });

    var tx = box.x + 12.5;
    var cursor = box.y + 2.2;
    ctx.backend.text(tx, cursor, clean(step.title || ('Step ' + step.order)), {
      sizeMm: 2.75, bold: true, baseline: 'top'
    });
    cursor += 4.4;

    function paragraph(text, sizeMm, maxLines, color) {
      if (!text) return;
      var lineH = sizeMm * 1.42;
      var lines = ctx.wrapLines(text, textW, sizeMm, {});
      var count = Math.min(lines.length, maxLines);
      for (var i = 0; i < count; i++) {
        if (cursor > maxY - lineH) return;
        ctx.backend.text(tx, cursor, lines[i], { sizeMm: sizeMm, baseline: 'top', color: color });
        cursor += lineH;
      }
      cursor += 0.8;
    }

    paragraph(clean(step.description), 2.15, 5);

    // parts / hardware used
    var partLabels = (step.partIds || []).map(function (id) {
      var p = maps.parts[id];
      return p ? partLabel(p) : id;
    }).filter(Boolean);
    if (partLabels.length) paragraph('PARTS  ' + partLabels.join(', '), 1.95, 2, [60, 60, 60]);
    var hardwareNames = (step.hardwareIds || []).map(function (id) {
      var h = maps.hardware[id];
      return h ? clean(h.name || h.id) : id;
    }).filter(Boolean);
    if (hardwareNames.length) paragraph('HARDWARE  ' + hardwareNames.join(', '), 1.95, 2, [60, 60, 60]);
    if (step.tools && step.tools.length) paragraph('TOOLS  ' + step.tools.join(', '), 1.9, 2, [75, 75, 75]);
    var glueFast = [];
    if (step.glue) glueFast.push('glue: ' + step.glue);
    if (step.fasteners && step.fasteners.length) glueFast.push('fasteners: ' + step.fasteners.join(', '));
    if (glueFast.length) paragraph(glueFast.join(' · '), 1.9, 2, [75, 75, 75]);
    if (step.qc && step.qc.length) {
      paragraph('QC  ' + step.qc.map(function (q) { return '\u2022 ' + q; }).join('  '), 1.9, 3, [20, 20, 20]);
    }
    if (step.notes && step.notes.length) paragraph('NOTE  ' + step.notes.join(' · '), 1.85, 2, [90, 90, 90]);

    // illustration: geometry + part balloons only (the step title/description are the
    // text column, so the scene's own labels are stripped to give the drawing room)
    var highlightCount = (step.partIds || []).length;
    var scene = scenes.assembly('stepScene', cm, step, {
      units: state.opts.units,
      labels: false,
      balloons: highlightCount > 0 && highlightCount <= 12
    }, 'assembly step');
    var illBox = { x: box.x + box.width - illusW - 1, y: box.y + 1.2, width: illusW, height: box.height - 3 };
    ctx.backend.rect(illBox.x, illBox.y, illBox.width, illBox.height, { pen: 'guide', widthMm: 0.13 });
    drawScene(ctx, sceneWithoutText(scene, true), { x: illBox.x + 1, y: illBox.y + 1, width: illBox.width - 2, height: illBox.height - 2 }, {
      standard: false,
      padding: 1,
      formatLength: scenes.formatLength,
      label: 'CS.draw.assembly.stepScene'
    });
    ctx.text(illBox.x + 1.4, illBox.y + 1.3, 'STEP ' + (step.order || '') + ' - ' + fitText(ctx, clean(step.title || ''), illBox.width - 12, 1.85, true), {
      sizeMm: 1.85, bold: true, baseline: 'top', color: [60, 60, 60]
    });

    // solid separator between steps
    ctx.backend.line(box.x, box.y + box.height, box.x + box.width, box.y + box.height, { pen: 'thin', widthMm: 0.18 });
  }

  function buildAssemblySheets(state) {
    var cabinets = state.resolved.cabinets || [];
    var sheets = [];
    var body = pageBodySize(state.opts);
    var perPage = body.height >= 200 ? 3 : 2;
    cabinets.forEach(function (cm) {
      var steps = (cm.assembly || []).slice().sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });
      if (!steps.length) return;
      var tag = clean(cm.config.tag);
      var chunks = chunk(steps, perPage);
      chunks.forEach(function (stepChunk, chunkIndex) {
        var startIndex = chunkIndex * perPage;
        sheets.push({
          title: tag + ' — assembly order',
          subtitle: 'Step ' + (startIndex + 1) + '–' + (startIndex + stepChunk.length) + ' of ' + steps.length,
          scale: 'NTS',
          cabinetTag: tag,
          note: 'Work in order; complete each QC check before the next step',
          draw: function (ctx) {
            var y = ctx.body.y;
            if (chunkIndex === 0) {
              ctx.text(ctx.body.x, y, 'ASSEMBLY ORDER — ' + tag + '  ' + clean(cm.config.name), { sizeMm: 3.3, bold: true, baseline: 'top' });
              ctx.text(ctx.body.x, y + 5.2, cabinetDimsText(cm, state.f) + ' · ' + constructionSummary(cm.config) + ' · ' + frontSummary(cm), {
                sizeMm: 2.05, baseline: 'top', color: [70, 70, 70]
              });
              y += 10.5;
            } else {
              ctx.text(ctx.body.x, y, 'ASSEMBLY ORDER — ' + tag + ' (continued)', { sizeMm: 3.0, bold: true, baseline: 'top' });
              y += 8;
            }
            var rowH = (ctx.body.bottom - y) / stepChunk.length;
            stepChunk.forEach(function (step, i) {
              drawAssemblyStep(ctx, state, cm, step, {
                x: ctx.body.x,
                y: y + i * rowH,
                width: ctx.body.width,
                height: rowH - 1
              });
            });
            if (chunkIndex === chunks.length - 1) {
              // assembly completion / QC sign-off strip on the final page
              var stripH = 12;
              ctx.backend.line(ctx.body.x, ctx.body.bottom - stripH + 1, ctx.body.x + ctx.body.width, ctx.body.bottom - stripH + 1, { pen: 'thin', widthMm: 0.3 });
              ctx.text(ctx.body.x, ctx.body.bottom - stripH + 3, 'ASSEMBLY COMPLETE  ' + tag + '  —  check square, reveals, slides and hinges; sign off:', {
                sizeMm: 2.15, bold: true, baseline: 'top'
              });
              var lineY = ctx.body.bottom - 3;
              ctx.backend.line(ctx.body.x + ctx.body.width * 0.55, lineY, ctx.body.x + ctx.body.width * 0.72, lineY, { pen: 'thin', widthMm: 0.18 });
              ctx.text(ctx.body.x + ctx.body.width * 0.73, lineY, 'DATE', { sizeMm: 1.8, baseline: 'bottom', color: [80, 80, 80] });
              ctx.backend.line(ctx.body.x + ctx.body.width * 0.82, lineY, ctx.body.x + ctx.body.width, lineY, { pen: 'thin', widthMm: 0.18 });
              ctx.text(ctx.body.x + ctx.body.width * 0.82, lineY - 2.6, 'INITIALS', { sizeMm: 1.6, baseline: 'bottom', color: [80, 80, 80] });
            }
            ctx.y = ctx.body.bottom;
          }
        });
      });
    });
    return sheets;
  }

  // ============================================================================
  //  NOTES, VALIDATION & SIGN-OFF
  // ============================================================================

  function buildNotesSheets(state) {
    var project = state.project;
    var settings = project.settings || {};
    var warnings = state.warnings.list;
    var f = state.f;
    var resolved = state.resolved;
    return [{
      title: 'Notes, validation & sign-off',
      subtitle: 'Warnings, conventions, revision block and acceptance',
      scale: 'NTS',
      cabinetTag: 'ALL',
      note: 'Read before cutting — this page records what the engine validated and what it did not',
      draw: function (ctx) {
        var y = ctx.body.y;
        var x = ctx.body.x;
        var width = ctx.body.width;
        ctx.text(x, y, 'NOTES, VALIDATION & SIGN-OFF', { sizeMm: 3.4, bold: true, baseline: 'top' });
        y += 7.5;

        // ---- validation
        ctx.text(x, y, '1.  VALIDATION', { sizeMm: 2.4, bold: true, baseline: 'top' });
        y += 4.6;
        if (warnings.length) {
          y = table().draw(ctx, {
            title: null,
            x: x,
            y: y,
            width: width,
            columns: [
              { key: 'severity', title: 'LEVEL', width: 0.075 },
              { key: 'tag', title: 'CAB', width: 0.06 },
              { key: 'title', title: 'FINDING', width: 0.25 },
              { key: 'message', title: 'DETAIL', width: 0.40 },
              { key: 'fix', title: 'WHAT TO DO', width: 0.215 }
            ],
            rows: warnings.map(function (w) {
              return {
                severity: clean(w.severity || 'warning').toUpperCase(),
                tag: clean(w.cabinetTag || '—'),
                title: clean(w.title),
                message: clean(w.message),
                fix: clean(w.fix || 'Review the design and re-export the plan set.')
              };
            }),
            sizeMm: 1.95,
            headerSizeMm: 1.9,
            minRowHeight: 5.6,
            meta: { title: 'Notes, validation & sign-off', scale: 'NTS' }
          }).y;
        } else {
          ctx.backend.rect(x, y, width, 13, { pen: 'thin', widthMm: 0.2, fill: 'light' });
          ctx.text(x + 3, y + 3, 'No warnings or errors — the engine validated the design.', { sizeMm: 2.5, bold: true, baseline: 'top' });
          ctx.text(x + 3, y + 8, 'Geometry, clearances, drawer sizing, shelf spans and front overlays all passed the rule set.', { sizeMm: 2.0, baseline: 'top', color: [70, 70, 70] });
          y += 17;
        }
        y += 5;

        // ---- how to use
        ctx.text(x, y, '2.  HOW TO USE THIS PLAN SET', { sizeMm: 2.4, bold: true, baseline: 'top' });
        y += 4.6;
        var guide = [
          'Cover & sheet index — set date, units, cabinet tags and the list of sheets in this set.',
          'Cabinet schedule — every cabinet with its finished size, front style and construction.',
          'General arrangement — the run in elevation; use it to confirm layout and tagging.',
          'Whole-cabinet sheets — front elevation, sections and isometric per cabinet, with a parts key.',
          'Component drawings — one drawing per unique part: face, edge profiles, dimensions, machining and material. MACHINING TABLES LIST EVERY HOLE, GROOVE, RABBET AND NOTCH.',
          'Cut list and sheet nesting — quantities, sizes, grain and edgeband; nesting diagrams show suggested placement only.',
          'Schedules — door/drawer sizes, hinge sides and pulls; aggregated hardware list.',
          'Assembly order — numbered steps with illustrations, parts, tools, glue/fasteners and QC checks.',
          'This page — validation findings, finish schedule, revision block and sign-off.'
        ];
        for (var g = 0; g < guide.length; g++) {
          var lines = ctx.wrapLines(guide[g], width, 2.05, {});
          if (!ctx.hasRoom(3, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
          for (var gl = 0; gl < lines.length; gl++) {
            if (!ctx.hasRoom(3.2, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
            ctx.backend.text(x + 4, y, lines[gl], { sizeMm: 2.05, baseline: 'top' });
            y += 2.9;
          }
          y += 0.6;
        }
        y += 3;

        // ---- design notes
        if (!ctx.hasRoom(16, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
        ctx.text(x, y, '3.  DESIGN NOTES', { sizeMm: 2.4, bold: true, baseline: 'top' });
        y += 4.6;
        y = ctx.paragraph(project.notes || 'No project notes were entered.', x, y, width * 0.78, { sizeMm: 2.1, lineHeight: 3.1, maxLines: 8 });
        y += 3;

        // ---- conventions stay with the notes they belong to
        if (!ctx.hasRoom(30, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
        ctx.text(x, y, '4.  SHOP CONVENTIONS USED IN THIS SET', { sizeMm: 2.4, bold: true, baseline: 'top' });
        y += 4.6;
        var conv = [];
        conv.push('UNITS  ' + (f.unit === 'metric' ? 'Metric — all dimensions in millimetres, whole numbers.' : 'Imperial — dimensions in inches, fractions to 1/32".'));
        conv.push('SHEET GOODS  ' + f.sheetDim(settings.sheetWidth || 1220) + ' × ' + f.sheetDim(settings.sheetHeight || 2440) + ', trim ' + f.mm(settings.sheetTrim || 10) + ', kerf ' + f.mm(settings.sheetKerf || 3) + '.');
        conv.push('EDGES  Exposed edges banded per part unless noted; edgebanding thickness is additional to the listed part size.');
        conv.push('GRAIN  "length" runs with the long dimension of the part; "width" across it. Match grain direction on doors and drawer fronts from the same stock.');
        conv.push('DIMENSIONS  Overall sizes are finished; door and drawer fronts overlay the cabinet face except for inset fronts.');
        conv.push('DRAWINGS  Orthographic views are drawn at the stated standard scale where dimensioned; isometrics and nesting diagrams are not to scale. Do not scale dimensions from the PDF — use the printed figures.');
        for (var c = 0; c < conv.length; c++) {
          var clines = ctx.wrapLines(conv[c], width, 2.0, {});
          if (!ctx.hasRoom(3, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
          for (var cl = 0; cl < clines.length; cl++) {
            if (!ctx.hasRoom(3.2, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
            ctx.backend.text(x + 3, y, clines[cl], { sizeMm: 2.0, baseline: 'top' });
            y += 2.85;
          }
          y += 0.5;
        }
        y += 3;

        // ---- plan-set summary (fills the notes page and gives the shop the numbers at a glance)
        if (!ctx.hasRoom(46, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
        y += 2;
        ctx.text(x, y, '5.  PLAN-SET SUMMARY', { sizeMm: 2.4, bold: true, baseline: 'top' });
        y += 4.8;
        var stats = resolved.stats || {};
        var totals = (resolved.cutList && resolved.cutList.totals) || {};
        var summaryItems = [
          ['Cabinets', String((resolved.cabinets || []).length)],
          ['Part records', String(stats.partCount !== undefined ? stats.partCount : sumParts(resolved))],
          ['Cut-list rows', String(totals.uniqueParts !== undefined ? totals.uniqueParts : '—')],
          ['Sheet goods', String(totals.sheetCount !== undefined ? totals.sheetCount : '—') + ' sheets'],
          ['Edgeband', finite(totals.edgebandMetres) ? totals.edgebandMetres.toFixed(1) + ' m' : '—'],
          ['Hardware', String((resolved.hardware || []).length) + ' line items'],
          ['Fronts', String((resolved.frontSchedule || []).length) + ' items'],
          ['Validation findings', String(warnings.length)],
          ['Plan date', clean(state.opts.date) || '—'],
          ['Units', state.opts.units === 'metric' ? 'Metric (mm)' : 'Imperial (in)'],
          ['Plan set', 'Built with Cabinet Studio'],
          ['Sheet numbering', '1 to ' + (ctx.totalPages || '—')]
        ];
        var sumCols = 3;
        var sumRows = Math.ceil(summaryItems.length / sumCols);
        var sumColW = ctx.body.width / sumCols;
        for (var si = 0; si < summaryItems.length; si++) {
          var scol = Math.floor(si / sumRows);
          var srow = si % sumRows;
          var sx = x + scol * sumColW;
          var sy = y + srow * 4.6;
          ctx.text(sx, sy + 1.1, summaryItems[si][0].toUpperCase(), { sizeMm: 1.55, baseline: 'top', color: [110, 110, 110] });
          ctx.text(sx + sumColW * 0.44, sy, summaryItems[si][1], { sizeMm: 2.0, bold: true, baseline: 'top' });
        }
        y += sumRows * 4.6 + 4;

        // ---- page 2: finish schedule, revision block and sign-off
        ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' });
        y = ctx.body.y;
        x = ctx.body.x;

        // ---- finish schedule
        var cabinets = resolved.cabinets || [];
        if (cabinets.length) {
          ctx.text(x, y, '6.  FINISH SCHEDULE', { sizeMm: 2.4, bold: true, baseline: 'top' });
          y += 4.6;
          y = table().draw(ctx, {
            title: null,
            x: x,
            y: y,
            width: width,
            columns: [
              { key: 'tag', title: 'CAB', width: 0.07, bold: true },
              { key: 'name', title: 'CABINET', width: 0.30 },
              { key: 'fronts', title: 'FRONTS', width: 0.27 },
              { key: 'finish', title: 'FINISH', width: 0.14 },
              { key: 'color', title: 'COLOUR / SHEEN', width: 0.22 }
            ],
            rows: cabinets.map(function (cm) {
              var cfg = cm.config || {};
              return {
                tag: clean(cfg.tag),
                name: clean(cfg.name),
                fronts: materialDisplayName(cfg.front && cfg.front.doors && cfg.front.doors.material) + ' · ' + clean(cfg.front && cfg.front.doors && cfg.front.doors.style),
                finish: clean(cfg.finish && cfg.finish.id),
                color: clean(cfg.finish && cfg.finish.color) + (cfg.finish && cfg.finish.sheen ? ' · ' + clean(cfg.finish.sheen) : '')
              };
            }),
            sizeMm: 2.0,
            zebra: true,
            meta: { title: 'Notes, validation & sign-off', scale: 'NTS' }
          }).y;
          y += 5;
        }

        // ---- revision block + sign-off
        if (!ctx.hasRoom(46, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
        ctx.text(x, y, '7.  REVISIONS', { sizeMm: 2.4, bold: true, baseline: 'top' });
        y += 4.6;
        y = table().draw(ctx, {
          title: null,
          x: x,
          y: y,
          width: width,
          columns: [
            { key: 'rev', title: 'REV', width: 0.07, align: 'center' },
            { key: 'date', title: 'DATE', width: 0.12 },
            { key: 'description', title: 'DESCRIPTION', width: 0.56 },
            { key: 'by', title: 'BY', width: 0.25 }
          ],
          rows: [
            { rev: '0', date: state.opts.date || '', description: 'Issued for shop — generated plan set', by: 'Cabinet Studio' },
            { rev: '', date: '', description: '', by: '' },
            { rev: '', date: '', description: '', by: '' }
          ],
          sizeMm: 2.0,
          minRowHeight: 6.4,
          zebra: false,
          rowRules: true,
          meta: { title: 'Notes, validation & sign-off', scale: 'NTS' }
        }).y;
        y += 6;

        if (!ctx.hasRoom(34, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
        ctx.text(x, y, '8.  ACCEPTANCE & SIGN-OFF', { sizeMm: 2.4, bold: true, baseline: 'top' });
        y += 5.4;
        y = ctx.paragraph(
          'This plan set was generated from the Cabinet Studio model files. Before cutting: verify all on-site dimensions, confirm material availability, review the validation findings above, and check door/drawer reveals against the actual fronts. The shop takes responsibility for site measurements; Cabinet Studio takes responsibility for the geometry it generated from the model.',
          x, y, width, { sizeMm: 2.0, lineHeight: 2.95, maxLines: 5 }
        );
        y += 4;
        var boxW = (width - 2 * 6) / 3;
        var boxes = [
          ['SHOP / MAKER', 'Signature & date'],
          ['CLIENT', 'Accepted as drawn'],
          ['SITE CHECK', 'Dimensions verified']
        ];
        for (var b = 0; b < boxes.length; b++) {
          var bx = x + b * (boxW + 6);
          ctx.backend.rect(bx, y, boxW, 24, { pen: 'thin', widthMm: 0.25 });
          ctx.text(bx + 2, y + 2.2, boxes[b][0], { sizeMm: 1.8, bold: true, baseline: 'top', color: [70, 70, 70] });
          ctx.text(bx + 2, y + 6.4, boxes[b][1], { sizeMm: 1.8, baseline: 'top', color: [110, 110, 110] });
          ctx.backend.line(bx + 2, y + 19.5, bx + boxW - 2, y + 19.5, { pen: 'guide', widthMm: 0.18 });
        }
        y += 30;

        // ---- pre-cut checklist: the last thing the shop reads before breaking down sheets
        if (!ctx.hasRoom(40, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
        ctx.text(x, y, '9.  PRE-CUT & PRE-ASSEMBLY CHECKLIST', { sizeMm: 2.4, bold: true, baseline: 'top' });
        y += 4.8;
        var checks = [
          'Site dimensions verified against the general arrangement and cabinet schedule.',
          'Sheet goods on hand match the cut list materials, thicknesses and grain requirements; sheet labels checked.',
          'Edgebanding stock and adhesive match the edgeband callouts; 2 mm banding for exposed front edges confirmed.',
          'Door and drawer front sizes checked against the door & drawer schedule, including hinges and pulls.',
          'Drawer slide lengths and clearances checked against the drawer box sizes and cabinet depths.',
          'Hardware quantities checked against the hardware schedule before ordering.',
          'Assembly order read end to end; each step\'s QC point understood before starting.',
          'This plan set matches the latest model export (check the plan date and revision block above).'
        ];
        for (var ci = 0; ci < checks.length; ci++) {
          if (!ctx.hasRoom(4, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
          ctx.backend.rect(x + 0.6, y + 0.6, 2.4, 2.4, { pen: 'thin', widthMm: 0.2, fill: 'none' });
          var checkLines = ctx.wrapLines(checks[ci], ctx.body.width - 6, 2.0, {});
          for (var cl2 = 0; cl2 < checkLines.length; cl2++) {
            if (!ctx.hasRoom(3.2, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
            ctx.backend.text(x + 4.4, y, checkLines[cl2], { sizeMm: 2.0, baseline: 'top' });
            y += 2.9;
          }
          y += 0.7;
        }
        y += 3;
        if (!ctx.hasRoom(8, y)) { ctx.continueSheet({ title: 'Notes, validation & sign-off', scale: 'NTS' }); y = ctx.body.y; x = ctx.body.x; }
        ctx.text(x, y, 'Plan set generated by Cabinet Studio on ' + (state.opts.date || '—') + '. Model version ' + clean((project.schemaVersion != null ? project.schemaVersion : 1)) + ' · ' + cabinets.length + ' cabinets · ' + sumParts(resolved) + ' parts.', {
          sizeMm: 1.8, baseline: 'top', color: [110, 110, 110]
        });
        ctx.y = ctx.body.bottom;
      }
    }];
  }

  // -------------------------------------------------------------------- module export
  CS.export = CS.export || {};
  CS.export.pdf = CS.export.pdf || {};
  CS.export.pdf.planSet = {
    STD_SCALES: STD_SCALES,
    plan: plan,
    utilities: {
      chooseStandardScale: chooseStandardScale,
      scaleLabel: scaleLabel,
      partSignature: partSignature,
      componentGroups: componentGroups,
      normalizeOptions: normalizeOptions
    }
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.export.pdf.planSet;
})(typeof globalThis !== 'undefined' ? globalThis : this);
