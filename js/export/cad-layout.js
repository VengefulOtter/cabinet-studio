/* Cabinet Studio — CAD drawing model (contract §8).
 *
 * Builds a writer-independent intermediate drawing (CadDrawing) from the
 * engine's Resolved object: named layers, model-space LINE / POLYLINE /
 * CIRCLE / ARC / TEXT entities in millimetres at 1:1, a sheet frame and a
 * title block. Two backends consume it: js/export/dxf.js (ASCII DXF) and
 * js/export/dwg.js (binary DWG through the vendored nasjidwg).
 *
 * Layout modes:
 *   'parts'   every unique part type at 1:1 in a labelled, dimensioned grid;
 *             holes as circles, grooves/rabbets/notches as lines.
 *   'nesting' sheet boundaries and the parts placed on each sheet.
 *   'cabinet' front elevation, side section and simple isometric line art
 *             per cabinet, with overall dimensions and a part key.
 *   'all'     parts, then cabinets, then nesting (default).
 *
 * Determinism: every collection is sorted by a content signature before it
 * is drawn; no Math.random, no clock reads. Geometry is always millimetres;
 * only annotation text is converted through CS.units at call time.
 *
 * Classic script; attaches to CS.export.cadLayout and exports in Node.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});

  /* ------------------------------------------------------------------ *
   * Layers (contract §8). Colour numbers are AutoCAD Color Index values.
   * ------------------------------------------------------------------ */
  var LAYER_DEFS = [
    { name: 'CS-OUTLINE', color: 7, linetype: 'Continuous', lineweight: 35 },
    { name: 'CS-HOLES', color: 4, linetype: 'Continuous', lineweight: 25 },
    { name: 'CS-GROOVES', color: 6, linetype: 'Continuous', lineweight: 25 },
    { name: 'CS-PARTS', color: 3, linetype: 'Continuous', lineweight: 18 },
    { name: 'CS-DIM', color: 1, linetype: 'Continuous', lineweight: 18 },
    { name: 'CS-TEXT', color: 3, linetype: 'Continuous', lineweight: 18 },
    { name: 'CS-SHEET', color: 8, linetype: 'Continuous', lineweight: 18 },
    { name: 'CS-NEST', color: 5, linetype: 'Continuous', lineweight: 25 },
    { name: 'CS-HIDDEN', color: 8, linetype: 'Dashed', lineweight: 18 }
  ];
  var L = {
    outline: 'CS-OUTLINE', holes: 'CS-HOLES', grooves: 'CS-GROOVES',
    parts: 'CS-PARTS', dim: 'CS-DIM', text: 'CS-TEXT', sheet: 'CS-SHEET',
    nest: 'CS-NEST', hidden: 'CS-HIDDEN'
  };
  /* Annotation heights, mm (contract: 3.5–6 mm text, headings larger). */
  var H = { tiny: 2.5, note: 3.5, dim: 3.5, label: 5, small: 4, heading: 6, section: 9, sheet: 10 };
  var DIM_TICK = 2.5;          // half-length of the 45° dimension tick
  var CHAR_W = 0.58;           // conservative Helvetica-ish width per char
  var SECTION_GAP = 380;       // vertical gap between layout sections
  var PART_ROW_GAP = 200;      // vertical gap between part rows
  var CAB_ROW_GAP = 360;       // vertical gap between cabinet rows
  var TARGET_WIDTH = 5600;     // preferred content width before wrapping
  var MARGIN = 60;             // frame margin around content
  var BAND = 190;              // reserved title-block band at the bottom

  /* ------------------------------------------------------------------ *
   * Small numeric / text helpers
   * ------------------------------------------------------------------ */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v, fallback) { return isNum(v) ? v : (isNum(fallback) ? fallback : 0); }
  function round(v, decimals) {
    var p = Math.pow(10, decimals == null ? 3 : decimals);
    return Math.round(v * p) / p;
  }
  function has(obj, key) { return !!obj && Object.prototype.hasOwnProperty.call(obj, key); }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function unitSystem(resolved, options) {
    if (options && /^(imperial|metric)$/.test(options.units || '')) return options.units;
    var u = resolved && resolved.project && resolved.project.units;
    return u === 'imperial' ? 'imperial' : 'metric';
  }

  /** Dimension text: project units, converted only here. */
  function fmtDim(mm, unit) {
    if (!isNum(mm)) return '?';
    if (CS.units && typeof CS.units.formatDim === 'function') return CS.units.formatDim(mm, unit);
    return unit === 'metric' ? String(Math.round(mm)) + ' mm' : (mm / 25.4).toFixed(2) + '"';
  }
  /** Compact length text for schedules and labels. */
  function fmtLen(mm, unit) {
    if (!isNum(mm)) return '?';
    if (CS.units && typeof CS.units.formatLengthShort === 'function') return CS.units.formatLengthShort(mm, unit);
    return unit === 'metric' ? String(Math.round(mm)) + ' mm' : (mm / 25.4).toFixed(2) + '"';
  }
  function fmtQty(qty) { return String(num(qty, 1)); }
  /* CAD text is kept ASCII where it matters: fraction and inch marks from
     CS.units are already ASCII, and these substitutions remove the few
     typographic characters that DXF escape differently from DWG. Anything
     else non-ASCII is left for the writers to escape. */
  var SYMBOLS = {
    '\u2014': '-', '\u2013': '-', '\u2212': '-', '\u00d7': 'x', '\u00b7': '.',
    '\u2022': '-', '\u00d8': 'DIA ', '\u00f8': 'dia ', '\u00b0': ' deg',
    '\u2033': '"', '\u2032': "'", '\u00b1': '+/-', '\u2264': '<=', '\u2265': '>=',
    '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u00a0': ' '
  };
  function cleanText(v) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    Object.keys(SYMBOLS).forEach(function (symbol) { s = s.split(symbol).join(SYMBOLS[symbol]); });
    return s.replace(/\s+/g, ' ').trim();
  }
  function asciiSafe(v) { return cleanText(v); }

  /* ------------------------------------------------------------------ *
   * Drawing container
   * ------------------------------------------------------------------ */
  function makeCad(options) {
    return {
      layers: LAYER_DEFS.map(function (layer) { return clone(layer); }),
      entities: [],
      warnings: [],
      _warned: {},
      _labels: [],          // placed annotation boxes (collision check)
      _keepOut: [],         // geometry a label must not cover
      _bounds: null,
      units: options && options.unitsOverride ? options.unitsOverride : null
    };
  }

  function warnOnce(cad, message) {
    var key = String(message);
    if (cad._warned[key]) return;
    cad._warned[key] = true;
    cad.warnings.push(key);
  }

  function track(cad, x, y) {
    if (!isNum(x) || !isNum(y)) return;
    if (!cad._bounds) {
      cad._bounds = { minX: x, minY: y, maxX: x, maxY: y };
      return;
    }
    var b = cad._bounds;
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  }

  function trackBox(cad, minX, minY, maxX, maxY) {
    if (![minX, minY, maxX, maxY].every(isNum)) return;
    track(cad, minX, minY);
    track(cad, maxX, maxY);
  }

  /* Entity helpers ---------------------------------------------------- */
  function addLine(cad, layer, ax, ay, bx, by) {
    if (![ax, ay, bx, by].every(isNum)) {
      warnOnce(cad, 'Skipped a line with a non-finite coordinate (' + layer + ').');
      return null;
    }
    if (!isNum(ax + 0) || (ax === bx && ay === by)) return null;
    var e = { type: 'line', layer: layer, a: [round(ax, 4), round(ay, 4)], b: [round(bx, 4), round(by, 4)] };
    cad.entities.push(e);
    trackBox(cad, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
    return e;
  }

  function addPoly(cad, layer, points, closed) {
    if (!Array.isArray(points) || points.length < 2) return null;
    var pts = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p || !isNum(p[0]) || !isNum(p[1])) {
        warnOnce(cad, 'Skipped a polyline with a non-finite vertex (' + layer + ').');
        return null;
      }
      pts.push([round(p[0], 4), round(p[1], 4)]);
      track(cad, p[0], p[1]);
    }
    if (closed && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) {
      pts.push([pts[0][0], pts[0][1]]);
    }
    var e = { type: 'polyline', layer: layer, points: pts, closed: !!closed };
    cad.entities.push(e);
    return e;
  }

  function addRect(cad, layer, x, y, w, h) {
    if (![x, y, w, h].every(isNum) || w <= 0 || h <= 0) return null;
    return addPoly(cad, layer, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
  }

  function addCircle(cad, layer, cx, cy, r) {
    if (![cx, cy, r].every(isNum) || r <= 0) {
      warnOnce(cad, 'Skipped a circle with a non-positive radius (' + layer + ').');
      return null;
    }
    var e = { type: 'circle', layer: layer, c: [round(cx, 4), round(cy, 4)], r: round(r, 4) };
    cad.entities.push(e);
    trackBox(cad, cx - r, cy - r, cx + r, cy + r);
    return e;
  }

  function addArc(cad, layer, cx, cy, r, a0, a1) {
    if (![cx, cy, r, a0, a1].every(isNum) || r <= 0) return null;
    var e = { type: 'arc', layer: layer, c: [round(cx, 4), round(cy, 4)], r: round(r, 4),
      a0: round(((a0 % 360) + 360) % 360, 3), a1: round(((a1 % 360) + 360) % 360, 3) };
    cad.entities.push(e);
    /* Conservative extents: the full circle. */
    trackBox(cad, cx - r, cy - r, cx + r, cy + r);
    return e;
  }

  function textWidth(text, height) { return cleanText(text).length * height * CHAR_W; }

  /** Trim text so it fits a width at a given height (title-block cells). */
  function fitText(text, maxWidth, height) {
    var s = cleanText(text);
    if (textWidth(s, height) <= maxWidth) return s;
    var keep = Math.max(4, Math.floor(maxWidth / (height * CHAR_W)) - 3);
    return s.slice(0, keep).trim() + '...';
  }

  /** Approximate annotation box; rotation is treated in 90° steps. */
  function textBox(text, height, align, valign, x, y, rotation) {
    var w = textWidth(text, height);
    var h = height;
    var rot = num(rotation, 0);
    var quarter = Math.abs(rot % 180) === 90;
    var x1 = x, y1 = y;
    if (align === 'center') x1 = x - w / 2;
    else if (align === 'right') x1 = x - w;
    if (valign === 'middle') y1 = y - h / 2;
    else if (valign === 'top') y1 = y - h;
    if (quarter) return { minX: x1 - h, minY: y1, maxX: x1, maxY: y1 + w };
    return { minX: x1, minY: y1, maxX: x1 + w, maxY: y1 + h };
  }

  function addText(cad, layer, x, y, text, height, opts) {
    opts = opts || {};
    var value = asciiSafe(text);
    if (!value) return null;
    var h = num(height, H.note);
    var align = opts.align === 'center' || opts.align === 'right' ? opts.align : 'left';
    var valign = opts.valign === 'middle' || opts.valign === 'top' ? opts.valign : 'baseline';
    var rotation = num(opts.rotation, 0);
    if (!isNum(x) || !isNum(y) || h <= 0) {
      warnOnce(cad, 'Skipped text with a non-finite position (' + layer + ').');
      return null;
    }
    var e = {
      type: 'text', layer: layer, p: [round(x, 4), round(y, 4)], text: value,
      height: round(h, 3), rotation: rotation, align: align, valign: valign
    };
    cad.entities.push(e);
    var box = textBox(value, h, align, valign, x, y, rotation);
    trackBox(cad, box.minX, box.minY, box.maxX, box.maxY);
    return e;
  }

  /* Bounding boxes ---------------------------------------------------- */
  function boxOfPoints(points) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function entityBox(e) {
    if (!e) return null;
    switch (e.type) {
      case 'line': return boxOfPoints([e.a, e.b]);
      case 'polyline': return boxOfPoints(e.points);
      case 'circle': return { minX: e.c[0] - e.r, minY: e.c[1] - e.r, maxX: e.c[0] + e.r, maxY: e.c[1] + e.r };
      case 'arc': return { minX: e.c[0] - e.r, minY: e.c[1] - e.r, maxX: e.c[0] + e.r, maxY: e.c[1] + e.r };
      case 'text': return textBox(e.text, e.height, e.align, e.valign, e.p[0], e.p[1], e.rotation);
      default: return null;
    }
  }

  function boxesIntersect(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
  }

  function findFreeShift(cad, box, steps, step) {
    steps = steps || [0, 1, 2, 3, -1, -2];
    step = step || 14;
    for (var i = 0; i < steps.length; i++) {
      var dy = steps[i] * step;
      var candidate = { minX: box.minX, minY: box.minY + dy, maxX: box.maxX, maxY: box.maxY + dy };
      var hit = false;
      for (var j = 0; j < cad._labels.length && !hit; j++) {
        if (boxesIntersect(cad._labels[j], candidate)) hit = true;
      }
      for (var k = 0; k < cad._keepOut.length && !hit; k++) {
        if (boxesIntersect(cad._keepOut[k], candidate)) hit = true;
      }
      if (!hit) {
        cad._labels.push(candidate);
        return dy;
      }
    }
    warnOnce(cad, 'A part label could not be placed without overlap; one was offset further than usual.');
    cad._labels.push(box);
    return 0;
  }

  /* Dimensions -------------------------------------------------------- */
  function dimText(mm) { return fmtDim(mm); }

  /** Horizontal dimension between x1 and x2 at y, referenced to refY. */
  function dimH(cad, unit, x1, x2, y, refY, textOverride) {
    if (x2 < x1) { var t = x1; x1 = x2; x2 = t; }
    if (Math.abs(x2 - x1) < 0.01) return;
    var dir = y >= refY ? 1 : -1;
    var gap = 8 * dir;
    addLine(cad, L.dim, x1, refY + gap, x1, y + 6 * dir);
    addLine(cad, L.dim, x2, refY + gap, x2, y + 6 * dir);
    addLine(cad, L.dim, x1, y, x2, y);
    addLine(cad, L.dim, x1 - DIM_TICK, y - DIM_TICK, x1 + DIM_TICK, y + DIM_TICK);
    addLine(cad, L.dim, x2 - DIM_TICK, y - DIM_TICK, x2 + DIM_TICK, y + DIM_TICK);
    addText(cad, L.dim, (x1 + x2) / 2, y + 3.5 * (dir > 0 ? 1 : 1), textOverride || dimText(x2 - x1), H.dim,
      { align: 'center', valign: 'baseline' });
  }

  /** Vertical dimension between y1 and y2 at x, referenced to refX. */
  function dimV(cad, unit, y1, y2, x, refX, textOverride) {
    if (y2 < y1) { var t = y1; y1 = y2; y2 = t; }
    if (Math.abs(y2 - y1) < 0.01) return;
    var dir = x >= refX ? 1 : -1;
    var gap = 8 * dir;
    addLine(cad, L.dim, refX + gap, y1, x + 6 * dir, y1);
    addLine(cad, L.dim, refX + gap, y2, x + 6 * dir, y2);
    addLine(cad, L.dim, x, y1, x, y2);
    addLine(cad, L.dim, x - DIM_TICK, y1 - DIM_TICK, x + DIM_TICK, y1 + DIM_TICK);
    addLine(cad, L.dim, x - DIM_TICK, y2 - DIM_TICK, x + DIM_TICK, y2 + DIM_TICK);
    addText(cad, L.dim, x - 4, (y1 + y2) / 2, textOverride || dimText(y2 - y1), H.dim,
      { align: 'center', valign: 'baseline', rotation: 90 });
  }

  /* ------------------------------------------------------------------ *
   * Unique part types (contract §8: every unique part type)
   * ------------------------------------------------------------------ */
  function partSignature(part) {
    return [
      cleanText(part.key || part.name || ''),
      round(num(part.length, NaN), 2),
      round(num(part.width, NaN), 2),
      round(num(part.thickness, 0), 2),
      cleanText(part.materialId || ''),
      // Machining differs between otherwise identical panels, so it must
      // take part in the signature: a left side with hinge cups is not the
      // same drawing as a bare shelf.
      machiningSignature(part.machining)
    ].join('|');
  }

  function machiningSignature(machining) {
    if (!Array.isArray(machining) || !machining.length) return 'none';
    var rows = machining.map(function (m) {
      var parts = [m && m.type, m && m.face, m && m.purpose];
      if (!m) return 'null';
      ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'diameter', 'width', 'depth', 'height', 'rows', 'cols', 'dx', 'dy'].forEach(function (k) {
        if (isNum(m[k])) parts.push(k + '=' + round(m[k], 1));
      });
      if (m.edge) parts.push('e=' + m.edge);
      if (m.corner) parts.push('c=' + m.corner);
      if (m.through) parts.push('through');
      return parts.join(',');
    });
    rows.sort();
    return rows.join(';');
  }

  /**
   * Collect the distinct part drawings across the project, aggregating
   * labels and quantities for parts that are identical in size, material
   * and machining. Deterministic order: material, thickness, key, length.
   */
  function collectUniqueParts(resolved) {
    var map = {};
    var entries = [];
    var cabinets = (resolved && resolved.cabinets) || [];
    cabinets.forEach(function (cm) {
      var parts = (cm && cm.parts) || [];
      parts.forEach(function (part) {
        if (!part || !isNum(part.length) || !isNum(part.width)) return;
        if (part.length <= 0 || part.width <= 0) return;
        var sig = partSignature(part);
        var entry = map[sig];
        if (!entry) {
          entry = {
            signature: sig,
            part: part,
            labels: [],
            qty: 0,
            count: 0,
            materialId: cleanText(part.materialId || 'unspecified'),
            materialName: cleanText(part.materialName || part.materialId || 'Unspecified material'),
            thickness: num(part.thickness, 0)
          };
          map[sig] = entry;
          entries.push(entry);
        }
        entry.qty += Math.max(1, Math.round(num(part.qty, 1)));
        entry.count += 1;
        var label = cleanText(part.id || ('[' + entry.count + ']'));
        if (entry.labels.indexOf(label) < 0) entry.labels.push(label);
      });
    });
    entries.sort(function (a, b) {
      return (a.materialId < b.materialId ? -1 : a.materialId > b.materialId ? 1 : 0) ||
        (b.thickness - a.thickness) ||
        (String(a.part.key || '') < String(b.part.key || '') ? -1 : String(a.part.key || '') > String(b.part.key || '') ? 1 : 0) ||
        (b.part.length - a.part.length) ||
        (b.part.width - a.part.width) ||
        (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0);
    });
    return entries;
  }

  /* ------------------------------------------------------------------ *
   * Machining drawing
   * ------------------------------------------------------------------ */
  function drawHole(cad, layer, part, m, ox, oy, mirrored) {
    var d = num(m.diameter, 0);
    if (d <= 0) return;
    var x = mirrored ? num(part.length, 0) - num(m.x, 0) : num(m.x, 0);
    addCircle(cad, layer, ox + x, oy + num(m.y, 0), d / 2);
  }

  function drawHolePattern(cad, layer, part, m, ox, oy, mirrored) {
    var rows = Math.max(1, Math.min(200, Math.round(num(m.rows, 1))));
    var cols = Math.max(1, Math.min(200, Math.round(num(m.cols, 1))));
    var dx = num(m.dx, 0), dy = num(m.dy, 0);
    for (var i = 0; i < rows; i++) {
      for (var j = 0; j < cols; j++) {
        var hole = { x: num(m.x, 0) + j * dx, y: num(m.y, 0) + i * dy, diameter: m.diameter };
        drawHole(cad, layer, part, hole, ox, oy, mirrored);
      }
    }
  }

  /** Two parallel lines marking a groove; direction may be arbitrary. */
  function drawGroove(cad, layer, part, m, ox, oy, mirrored) {
    var x1 = num(m.x1, 0), y1 = num(m.y1, 0), x2 = num(m.x2, 0), y2 = num(m.y2, 0);
    var width = Math.abs(num(m.width, 0));
    if (mirrored) { x1 = num(part.length, 0) - x1; x2 = num(part.length, 0) - x2; }
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;
    var nx = -dy / len * width / 2, ny = dx / len * width / 2;
    if (width <= 0) { addLine(cad, layer, ox + x1, oy + y1, ox + x2, oy + y2); return; }
    addLine(cad, layer, ox + x1 + nx, oy + y1 + ny, ox + x2 + nx, oy + y2 + ny);
    addLine(cad, layer, ox + x1 - nx, oy + y1 - ny, ox + x2 - nx, oy + y2 - ny);
  }

  /** Rabbet: the stepped edge removed along one side of the face. */
  function drawRabbet(cad, layer, part, m, ox, oy, mirrored) {
    var length = num(part.length, 0), width = num(part.width, 0);
    var w = Math.abs(num(m.width, 0)), d = Math.abs(num(m.depth, 0));
    if (d <= 0) return;
    var edge = m.edge;
    if (mirrored) {
      if (edge === 'left') edge = 'right';
      else if (edge === 'right') edge = 'left';
    }
    if (edge === 'left' || edge === 'right') {
      var x = edge === 'left' ? ox + d : ox + length - d;
      addLine(cad, layer, x, oy, x, oy + width);
    } else if (edge === 'top' || edge === 'bottom') {
      var y = edge === 'bottom' ? oy + d : oy + width - d;
      addLine(cad, layer, ox, y, ox + length, y);
    }
  }

  /** Notch: rectangular corner cut-out, drawn as two cut lines + a cross. */
  function drawNotch(cad, layer, part, m, ox, oy, mirrored) {
    var length = num(part.length, 0), width = num(part.width, 0);
    var nw = Math.abs(num(m.width, 0)), nh = Math.abs(num(m.height, 0));
    if (nw <= 0 || nh <= 0) return;
    var corner = m.corner;
    if (mirrored) {
      if (corner === 'bl') corner = 'br';
      else if (corner === 'br') corner = 'bl';
      else if (corner === 'tl') corner = 'tr';
      else if (corner === 'tr') corner = 'tl';
    }
    var x = (corner === 'bl' || corner === 'tl') ? ox : ox + length - nw;
    var y = (corner === 'bl' || corner === 'br') ? oy : oy + width - nh;
    addLine(cad, layer, x + nw, y, x + nw, y + nh);
    addLine(cad, layer, x, y + nh, x + nw, y + nh);
    addLine(cad, layer, x, y, x + nw, y + nh);
  }

  function drawMachining(cad, part, ox, oy, noteSink) {
    var machining = Array.isArray(part.machining) ? part.machining : [];
    machining.forEach(function (m) {
      if (!m || typeof m !== 'object') return;
      var back = m.face === 'B';
      var layer = back ? L.hidden : L.grooves;
      switch (m.type) {
        case 'hole':
          drawHole(cad, back ? L.hidden : L.holes, part, m, ox, oy, back);
          if (back) noteSink.faceBHoles++;
          break;
        case 'drill-pattern':
          drawHolePattern(cad, back ? L.hidden : L.holes, part, m, ox, oy, back);
          if (back) noteSink.faceBHoles += Math.max(1, num(m.rows, 1)) * Math.max(1, num(m.cols, 1));
          break;
        case 'groove':
          drawGroove(cad, layer, part, m, ox, oy, back);
          if (back) noteSink.faceBGrooves++;
          break;
        case 'rabbet':
          drawRabbet(cad, layer, part, m, ox, oy, back);
          if (back) noteSink.faceBGrooves++;
          break;
        case 'notch':
          drawNotch(cad, layer, part, m, ox, oy, back);
          break;
        default:
          warnOnce(cad, 'Unknown machining type "' + m.type + '" in a part drawing was not drawn.');
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Parts mode
   * ------------------------------------------------------------------ */
  function edgebandText(part, unit) {
    var eb = part.edgeband;
    if (!eb || !Array.isArray(eb.edges) || !eb.edges.length) return '';
    var material = eb.materialId || '';
    return 'Edgeband ' + eb.edges.join(', ') + (material ? ' (' + material + ')' : '');
  }

  function partLabelLines(entry, unit) {
    var part = entry.part;
    var ids = entry.labels.slice(0, 4).join(', ');
    if (entry.labels.length > 4) ids += ' +' + (entry.labels.length - 4);
    var name = cleanText(part.name || part.key || 'Part');
    var size = fmtLen(part.length, unit) + ' \u00d7 ' + fmtLen(part.width, unit);
    if (entry.thickness > 0) size += ' \u00d7 ' + fmtLen(entry.thickness, unit);
    var detail = size + '   Qty ' + fmtQty(entry.qty) + '   ' + entry.materialName;
    var extra = '';
    var eb = edgebandText(part, unit);
    if (eb) extra = eb;
    var view = part.view || {};
    if (view.faceA) extra += (extra ? '   ' : '') + cleanText(view.faceA);
    return { id: ids + '  ' + name, detail: detail, extra: extra };
  }

  function drawPartDrawing(cad, entry, unit, ox, oy) {
    var part = entry.part;
    var length = num(part.length, 0);
    var width = num(part.width, 0);
    addRect(cad, L.outline, ox, oy, length, width);
    cad._keepOut.push({ minX: ox, minY: oy, maxX: ox + length, maxY: oy + width });

    /* Grain direction: a thin arrow along the panel. */
    if (part.grain === 'length') {
      addLine(cad, L.parts, ox + 20, oy + width / 2, ox + length - 20, oy + width / 2);
      addLine(cad, L.parts, ox + 20, oy + width / 2, ox + 30, oy + width / 2 + 4);
      addLine(cad, L.parts, ox + 20, oy + width / 2, ox + 30, oy + width / 2 - 4);
    }

    var notes = { faceBHoles: 0, faceBGrooves: 0 };
    drawMachining(cad, part, ox, oy, notes);

    /* Dimensions. */
    dimH(cad, unit, ox, ox + length, oy - 82, oy - 14);
    dimV(cad, unit, oy, oy + width, ox - 82, ox - 14);

    /* Label block above the part, placed greedily to avoid collisions. */
    var lines = partLabelLines(entry, unit);
    if (notes.faceBHoles || notes.faceBGrooves) {
      var faceNote = 'Face B:';
      if (notes.faceBHoles) faceNote += ' ' + notes.faceBHoles + ' hole' + (notes.faceBHoles === 1 ? '' : 's');
      if (notes.faceBGrooves) faceNote += (notes.faceBHoles ? ',' : '') + ' ' + notes.faceBGrooves + ' groove/rabbet' + (notes.faceBGrooves === 1 ? '' : 's');
      faceNote += ' (shown dashed)';
      lines.extra = lines.extra ? lines.extra + '   ' + faceNote : faceNote;
    }
    var cx = ox + length / 2;
    var baseY = oy + width + 20;
    var hasExtra = !!lines.extra;
    var h1 = H.label, h2 = H.note, h3 = H.tiny;
    var b2 = baseY + (hasExtra ? 5 : 0);
    var b1 = b2 + 6;
    var top = b1 + h1;
    var boxW = Math.max(textWidth(lines.id, h1), textWidth(lines.detail, h2), textWidth(lines.extra, h3));
    var box = { minX: cx - boxW / 2, minY: baseY, maxX: cx + boxW / 2, maxY: top };
    var shift = findFreeShift(cad, box, [0, 1, 2, 3, 4, -1, -2], 14);
    addText(cad, L.parts, cx, b1 + shift, lines.id, h1, { align: 'center', valign: 'baseline' });
    addText(cad, L.parts, cx, b2 + shift, lines.detail, h2, { align: 'center', valign: 'baseline' });
    if (hasExtra) addText(cad, L.parts, cx, baseY + shift, lines.extra, h3, { align: 'center', valign: 'baseline' });
    return { width: length, height: width };
  }

  function buildParts(cad, resolved, unit, unitLabel) {
    var entries = collectUniqueParts(resolved);
    var y0 = 0;
    if (!entries.length) {
      addText(cad, L.text, 0, y0 + 100, 'No part geometry was available from the engine output; nothing to draw at 1:1.', H.small);
      return { width: 4000, height: 160 };
    }

    /* Group by material, preserving the deterministic entry order. */
    var groups = [];
    var current = null;
    entries.forEach(function (entry) {
      if (!current || current.materialId !== entry.materialId) {
        current = { materialId: entry.materialId, materialName: entry.materialName, thickness: entry.thickness, entries: [] };
        groups.push(current);
      }
      current.entries.push(entry);
    });

    var cursorY = 0;
    var maxRight = 0;
    var leftGap = 130;   // room for the vertical dimension
    var rightMargin = 260; // room for the next part / label overhang

    groups.forEach(function (group, groupIndex) {
      var header = 'MATERIAL \u2014 ' + group.materialName +
        (group.thickness > 0 ? ' (' + fmtLen(group.thickness, unit) + ')' : '') +
        '  \u00b7  ' + group.entries.length + ' unique part type' + (group.entries.length === 1 ? '' : 's') +
        '  \u00b7  ' + group.entries.reduce(function (n, e) { return n + e.qty; }, 0) + ' pieces';
      if (groupIndex > 0) cursorY += 120;
      addText(cad, L.text, 0, cursorY + H.heading, header, H.heading, { align: 'left', valign: 'baseline' });
      cursorY += 70;

      var rowX = 0;
      var rowMaxWidth = 0;
      var rowStartY = cursorY;
      group.entries.forEach(function (entry) {
        var length = num(entry.part.length, 0);
        var width = num(entry.part.width, 0);
        var cellW = length + leftGap + rightMargin;
        if (rowX > 0 && rowX + cellW > TARGET_WIDTH) {
          cursorY = rowStartY + rowMaxWidth + 120;
          rowX = 0;
          rowMaxWidth = 0;
          rowStartY = cursorY;
        }
        var partY = rowStartY + 120;
        drawPartDrawing(cad, entry, unit, rowX + leftGap, partY);
        maxRight = Math.max(maxRight, rowX + cellW);
        rowX += cellW;
        rowMaxWidth = Math.max(rowMaxWidth, width + 120);
      });
      cursorY = rowStartY + rowMaxWidth + 120;
    });

    var totalPieces = entries.reduce(function (n, e) { return n + e.qty; }, 0);
    addText(cad, L.text, 0, cursorY + 30,
      'All part drawings are 1:1 in model space, millimetres. ' + entries.length +
      ' unique part type' + (entries.length === 1 ? '' : 's') + ', ' + totalPieces + ' pieces. ' +
      'Dimensions read in ' + (unit === 'metric' ? 'millimetres' : 'imperial') + '.',
      H.small);
    return { width: Math.max(maxRight, 4000), height: cursorY + 120 };
  }

  /* ------------------------------------------------------------------ *
   * Cabinet mode
   * ------------------------------------------------------------------ */
  function cabinetDims(cm) {
    var config = cm.config || {};
    var dims = cm.dims || {};
    return {
      width: num(dims.width, num(config.width, 600)),
      height: num(dims.height, num(config.height, 800)),
      depth: num(dims.depth, num(config.depth, 600)),
      toeHeight: num(dims.toeKickHeight, num(config.toeKick && config.toeKick.height, 0)),
      frontBottom: num(dims.frontBottomZ, num(config.toeKick && config.toeKick.height, 0)),
      innerWidth: num(dims.interiorWidth, 0),
      innerHeight: num(dims.interiorHeight, 0),
      carcassDepth: num(dims.carcassDepth, num(dims.depth, num(config.depth, 600)))
    };
  }

  function configOf(cm) { return (cm && cm.config) || {}; }

  /** Front items for a cabinet: engine frontLayout when present, else a
   *  conservative derivation from the resolved front configuration. */
  function frontItems(cm) {
    var layout = cm.frontLayout || {};
    var items = [];
    (Array.isArray(layout.doors) ? layout.doors : []).forEach(function (d) {
      if (!d) return;
      items.push({ kind: 'door', label: cleanText(d.label || ''), x: num(d.x), y: num(d.y), w: num(d.w), h: num(d.h) });
    });
    (Array.isArray(layout.drawerFronts) ? layout.drawerFronts : []).forEach(function (d) {
      if (!d) return;
      items.push({ kind: 'drawer', label: cleanText(d.label || ''), x: num(d.x), y: num(d.y), w: num(d.w), h: num(d.h) });
    });
    if (items.length) return { items: items, derived: false };

    /* Fallback derivation (engine output should normally provide a layout). */
    var config = configOf(cm);
    var front = config.front || {};
    var dims = cabinetDims(cm);
    var reveal = Math.max(0, num(front.reveal, 3));
    var bottom = dims.frontBottom;
    var regionH = Math.max(0, dims.height - bottom);
    var width = dims.width;
    var doors = front.doors || {};
    var drawers = front.drawers || {};
    if (front.type === 'doors' || front.type === 'door-drawer') {
      var count = Math.max(1, Math.round(num(doors.count, 2)));
      var n = front.type === 'door-drawer' ? Math.max(1, Math.round(num(front.combined && front.combined.doorsBelow, 1))) : count;
      var regionBottom = bottom;
      var regionTop = bottom + regionH;
      if (front.type === 'door-drawer') {
        var drawerH = num(front.combined && front.combined.drawerHeight, 180);
        regionTop = bottom + regionH - drawerH - reveal;
      }
      var usable = width - reveal * (n + 1);
      var leaf = usable / n;
      var h = (regionTop - regionBottom) - reveal * 2;
      for (var i = 0; i < n; i++) {
        items.push({ kind: 'door', label: 'Door ' + (i + 1), x: reveal + i * (leaf + reveal), y: regionBottom + reveal, w: leaf, h: h });
      }
    }
    var drawersCount = 0;
    if (front.type === 'drawer-stack') drawersCount = Math.max(1, Math.round(num(drawers.count, 3)));
    if (front.type === 'door-drawer') drawersCount = 1;
    if (front.type === 'drawer-stack' || front.type === 'door-drawer') {
      var stackBottom = front.type === 'door-drawer' ? bottom + regionH - num(front.combined && front.combined.drawerHeight, 180) : bottom;
      var stackTop = bottom + regionH;
      var rowH = front.type === 'door-drawer' ? (stackTop - stackBottom) : (stackTop - stackBottom) / drawersCount;
      if (front.type === 'drawer-stack') {
        var autoHeights = null;
        if (Array.isArray(drawers.heights)) autoHeights = drawers.heights;
        var totalGap = reveal * (drawersCount + 1);
        var remaining = (stackTop - stackBottom) - totalGap;
        for (var j = 0; j < drawersCount; j++) {
          var dh = autoHeights && isNum(autoHeights[j]) ? autoHeights[j] : remaining / drawersCount;
          items.push({ kind: 'drawer', label: 'Drawer ' + (j + 1), x: reveal, y: stackTop - reveal - (j + 1) * dh - j * reveal, w: width - reveal * 2, h: dh });
        }
      } else {
        items.push({ kind: 'drawer', label: 'Drawer 1', x: reveal, y: stackTop - reveal - rowH, w: width - reveal * 2, h: rowH });
      }
    }
    return { items: items, derived: true };
  }

  function drawFrontElevation(cad, cm, unit, ox, oy) {
    var dims = cabinetDims(cm);
    var width = dims.width, height = dims.height;
    addRect(cad, L.outline, ox, oy, width, height);
    if (dims.toeHeight > 0) {
      addLine(cad, L.outline, ox, oy + dims.toeHeight, ox + width, oy + dims.toeHeight);
    }
    var fronts = frontItems(cm);
    fronts.items.forEach(function (item) {
      if (item.w <= 0 || item.h <= 0) return;
      addRect(cad, L.outline, ox + item.x, oy + item.y, item.w, item.h);
      if (item.label && textWidth(item.label, H.note) + 8 < item.w && item.h > 12) {
        addText(cad, L.parts, ox + item.x + item.w / 2, oy + item.y + item.h / 2, item.label, H.note,
          { align: 'center', valign: 'middle' });
      }
    });
    /* Overall dimensions. */
    dimH(cad, unit, ox, ox + width, oy - 84, oy - 12);
    dimV(cad, unit, oy, oy + height, ox + width + 76, ox + width + 12);
    addText(cad, L.text, ox, oy + height + 34, 'FRONT ELEVATION', H.heading);
    return width;
  }

  function drawSideSection(cad, cm, unit, ox, oy) {
    var dims = cabinetDims(cm);
    var config = configOf(cm);
    var construction = config.construction || {};
    var depth = dims.carcassDepth || dims.depth;
    var height = dims.height;
    var toeHeight = dims.toeHeight;
    var setback = num(config.toeKick && config.toeKick.setback, num(config.construction && config.construction.toeKickSetback, 0));
    addRect(cad, L.outline, ox, oy, depth, height);
    if (toeHeight > 0) {
      var sb = Math.min(Math.max(setback, 0), depth * 0.5);
      addLine(cad, L.outline, ox + sb, oy, ox + sb, oy + toeHeight);
      addLine(cad, L.outline, ox + sb, oy + toeHeight, ox + depth, oy + toeHeight);
      addLine(cad, L.outline, ox + sb, oy, ox + depth, oy);
    }
    var backThickness = num(construction.backThickness, 0);
    var backStyle = construction.backStyle || 'rabbet';
    if (backThickness > 0 && backStyle !== 'none') {
      addLine(cad, L.outline, ox + depth - backThickness, oy + (toeHeight > 0 ? toeHeight : 0), ox + depth - backThickness, oy + height);
    }
    /* Fronts shown as a panel in front of the carcass. */
    var frontThickness = num(config.front && config.front.doors && config.front.doors.thickness,
      num(config.faceFrame && config.faceFrame.thickness, 19));
    addLine(cad, L.outline, ox - frontThickness, oy + dims.frontBottom, ox - frontThickness, oy + height);
    addLine(cad, L.outline, ox, oy + dims.frontBottom, ox - frontThickness, oy + dims.frontBottom);
    addLine(cad, L.outline, ox, oy + height, ox - frontThickness, oy + height);

    /* Shelves: evenly distributed between the bottom and top structures. */
    var interior = config.interior || {};
    var shelfCount = Math.max(0, Math.round(num(interior.adjustableShelves, 0))) +
      Math.max(0, Math.round(num(interior.fixedShelves, 0)));
    var thickness = num(construction.carcassThickness, 18);
    var shelfThickness = num(interior.shelfThickness, thickness);
    var bottomY = (toeHeight > 0 ? toeHeight : 0) + thickness;
    var topY = height - thickness;
    if (shelfCount > 0 && topY - bottomY > shelfThickness * 2) {
      var x1 = ox + (backThickness > 0 ? depth - backThickness : depth);
      for (var i = 1; i <= shelfCount; i++) {
        var sy = bottomY + (topY - bottomY) * i / (shelfCount + 1);
        addLine(cad, L.outline, ox, oy + sy, x1, oy + sy);
      }
      addText(cad, L.text, ox + depth / 2, oy + height + 34, shelfCount + ' shelf' + (shelfCount === 1 ? '' : 'ves') + ' (evenly shown)', H.note,
        { align: 'center' });
    }
    dimH(cad, unit, ox, ox + depth, oy - 84, oy - 12);
    dimV(cad, unit, oy, oy + height, ox + depth + 76, ox + depth + 12);
    addText(cad, L.text, ox, oy + height + 60, 'SIDE SECTION', H.heading);
    return depth + frontThickness;
  }

  var COS30 = Math.cos(Math.PI / 6);
  var SIN30 = 0.5;

  /**
   * Cabinet isometric projection, in agreement with CS.draw.iso when it is
   * present (Lead's convention: x = left→right, y = back→front, z = up,
   * origin bottom-left-back). Falls back to the same formula so the CAD
   * module never depends on the drawing modules being loaded first.
   */
  function isoPoint(x, y, z) {
    if (CS.draw && CS.draw.iso && typeof CS.draw.iso.project === 'function') {
      return CS.draw.iso.project(x, y, z);
    }
    return [(x - y) * COS30, z - (x + y) * SIN30];
  }

  function isoLine(cad, layer, a, b) {
    addLine(cad, layer, a[0], a[1], b[0], b[1]);
  }

  function drawIso(cad, cm, unit, ox, oy) {
    var dims = cabinetDims(cm);
    var width = dims.width, height = dims.height, depth = dims.depth;
    var toeHeight = dims.toeHeight;
    /* y = depth measured from the back (0) to the front (depth). The
       isometric projection sends the front/back legs to negative x and y,
       so shift the drawing by its own overhang to keep it inside the block
       (and clear of the side-section view beside it). */
    var isoShiftX = depth * COS30;
    var isoShiftY = (width + depth) * SIN30;
    var p = function (x, y, z) {
      var q = isoPoint(x, y, z);
      return [ox + q[0] + isoShiftX, oy + q[1] + isoShiftY];
    };

    /* Visible box edges: front face (y = depth), top face (z = height) and
       right face (x = width). */
    var fbl = p(0, depth, 0), fbr = p(width, depth, 0),
      ftr = p(width, depth, height), ftl = p(0, depth, height);
    var btl = p(0, 0, height), btr = p(width, 0, height), bbr = p(width, 0, 0);
    addPoly(cad, L.outline, [fbl, fbr, ftr, ftl], true);
    addPoly(cad, L.outline, [btl, btr, ftr, ftl], true);
    addPoly(cad, L.outline, [fbr, ftr, btr, bbr], true);
    if (toeHeight > 0) {
      isoLine(cad, L.outline, p(0, depth, toeHeight), p(width, depth, toeHeight));
    }
    /* Fronts drawn on the front face. */
    frontItems(cm).items.forEach(function (item) {
      if (item.w <= 0 || item.h <= 0) return;
      var a = p(item.x, depth, item.y), b = p(item.x + item.w, depth, item.y),
        c = p(item.x + item.w, depth, item.y + item.h), d = p(item.x, depth, item.y + item.h);
      addPoly(cad, L.outline, [a, b, c, d], true);
    });
    /* Shelf lines on the right side face (dashed = inside the cabinet). */
    var config = configOf(cm);
    var interior = config.interior || {};
    var shelfCount = Math.max(0, Math.round(num(interior.adjustableShelves, 0))) +
      Math.max(0, Math.round(num(interior.fixedShelves, 0)));
    if (shelfCount > 0) {
      for (var i = 1; i <= shelfCount; i++) {
        var z = height * i / (shelfCount + 1);
        isoLine(cad, L.hidden, p(width, 0, z), p(width, depth, z));
      }
    }
    addText(cad, L.text, ox, oy + height + (width + depth) * SIN30 + 34, 'ISOMETRIC (line art)', H.heading);
    return (width + depth) * COS30;
  }

  function partKeyLines(cm) {
    var lines = [];
    var parts = (cm && cm.parts) || [];
    parts.forEach(function (part) {
      if (!part) return;
      var id = cleanText(part.id || part.key || '?');
      var name = cleanText(part.name || part.key || '');
      var qty = Math.max(1, Math.round(num(part.qty, 1)));
      lines.push(id + '  ' + name + '  \u00d7' + qty);
    });
    return lines;
  }

  function drawCabinetBlock(cad, cm, unit, ox, oy) {
    var config = configOf(cm);
    var dims = cabinetDims(cm);
    var tag = cleanText(config.tag || cm.tag || '') || 'CAB';
    var name = cleanText(config.name || cm.name || 'Cabinet');
    var type = cleanText(config.type || 'base');

    var keyLines = partKeyLines(cm);
    var keyCols = keyLines.length > 18 ? 2 : 1;
    var keyColW = 0;
    keyLines.forEach(function (line) { keyColW = Math.max(keyColW, textWidth(line, H.note) + 20); });
    keyColW = Math.max(keyColW, 240);
    var keyRows = Math.ceil(keyLines.length / keyCols);
    var keyHeight = 34 + keyRows * 5.4;

    var viewBottom = keyHeight + 190;
    var frontW = dims.width;
    var sideW = dims.depth;
    var isoW = (dims.width + dims.depth) * COS30;
    var gap = 430;
    var frontH = dims.height;
    var sideH = dims.height;
    var isoH = dims.height + (dims.width + dims.depth) * SIN30;
    var viewH = Math.max(frontH, sideH, isoH);
    var blockW = Math.max(frontW + 120, sideW + 120, isoW) + gap * 2 + frontW * 0 + 160;
    blockW = frontW + gap + sideW + gap + isoW + 180;
    var blockH = viewBottom + viewH + 130;

    /* Cabinet heading. */
    addText(cad, L.text, ox, oy + blockH - 20, tag + ' \u2014 ' + name, H.heading, { valign: 'top' });
    addText(cad, L.text, ox, oy + blockH - 40,
      type + ' cabinet  \u00b7  ' + fmtDim(dims.width, unit) + ' W \u00d7 ' + fmtDim(dims.height, unit) + ' H \u00d7 ' +
      fmtDim(dims.depth, unit) + ' D  \u00b7  ' + (keyLines.length) + ' part records',
      H.note, { valign: 'top' });

    /* Part key at the bottom left of the block. */
    addText(cad, L.parts, ox, oy + keyHeight - 10, 'PARTS', H.note, { valign: 'top' });
    keyLines.forEach(function (line, index) {
      var col = Math.floor(index / keyRows);
      var row = index % keyRows;
      addText(cad, L.parts, ox + col * (keyColW + 20), oy + keyHeight - 30 - row * 5.4, line, H.note, { valign: 'top' });
    });

    var vx = ox;
    var vy = oy + viewBottom;
    var fw = drawFrontElevation(cad, cm, unit, vx, vy);
    var sx = vx + Math.max(fw, frontW) + gap;
    var sw = drawSideSection(cad, cm, unit, sx, vy);
    var ix = sx + sideW + gap;
    drawIso(cad, cm, unit, ix, vy);

    return { width: blockW, height: blockH };
  }

  function buildCabinets(cad, resolved, unit, unitLabel) {
    var cabinets = (resolved && resolved.cabinets) || [];
    if (!cabinets.length) {
      addText(cad, L.text, 0, 100, 'No cabinets were available from the engine output; nothing to draw.', H.small);
      return { width: 4000, height: 160 };
    }
    var cursorY = 0;
    var rowX = 0;
    var rowH = 0;
    var maxRight = 0;
    cabinets.forEach(function (cm) {
      if (!cm) return;
      var dims = cabinetDims(cm);
      var estimateW = dims.width + dims.depth + (dims.width + dims.depth) * COS30 + 3 * 430 + 200;
      if (rowX > 0 && rowX + estimateW > TARGET_WIDTH + 2200) {
        cursorY += rowH + CAB_ROW_GAP;
        rowX = 0;
        rowH = 0;
      }
      var block = drawCabinetBlock(cad, cm, unit, rowX, cursorY);
      rowX += block.width + 260;
      rowH = Math.max(rowH, block.height);
      maxRight = Math.max(maxRight, rowX);
    });
    cursorY += rowH;
    return { width: Math.max(maxRight, 4000), height: cursorY + 100 };
  }

  /* ------------------------------------------------------------------ *
   * Nesting mode
   * ------------------------------------------------------------------ */
  function buildNesting(cad, resolved, unit, unitLabel) {
    var layouts = (resolved && resolved.sheetLayouts) || [];
    if (!layouts.length) {
      addText(cad, L.text, 0, 100, 'No sheet layout was available from the engine output; nothing to nest.', H.small);
      return { width: 4000, height: 160 };
    }
    var y = 0;
    var maxRight = 0;
    layouts.forEach(function (layout, layoutIndex) {
      if (!layout) return;
      var sheet = layout.sheet || { width: 1220, height: 2440 };
      var sheetW = num(sheet.width, 1220), sheetH = num(sheet.height, 2440);
      var sheets = Array.isArray(layout.sheets) ? layout.sheets : [];
      var materialName = cleanText(layout.materialName || layout.materialId || 'Material');
      var gap = 380;
      var columns = Math.max(1, Math.floor((TARGET_WIDTH + gap) / (sheetW + gap)));
      if (layoutIndex > 0) y += 220;
      if (!sheets.length) {
        addText(cad, L.text, 0, y + H.small, 'SHEET LAYOUT \u2014 ' + materialName + ': no sheets placed.', H.small);
        y += 80;
        return;
      }
      addText(cad, L.text, 0, y + H.heading,
        'SHEET LAYOUT \u2014 ' + materialName + '  \u00b7  ' + sheets.length + ' sheet' + (sheets.length === 1 ? '' : 's') +
        '  \u00b7  ' + fmtDim(sheetW, unit) + ' \u00d7 ' + fmtDim(sheetH, unit),
        H.heading);
      y += 70;
      var gridStartY = y;
      sheets.forEach(function (sheetLayout, sheetIndex) {
        var col = sheetIndex % columns;
        var row = Math.floor(sheetIndex / columns);
        var ox = col * (sheetW + gap);
        var oy = gridStartY + row * (sheetH + 300);
        /* Sheet boundary and caption. */
        addRect(cad, L.nest, ox, oy, sheetW, sheetH);
        var usedArea = num(sheetLayout.usedArea, 0);
        var waste = num(sheetLayout.wastePct, 0);
        var caption = 'Sheet ' + (num(sheetLayout.index, sheetIndex + 1)) + ' of ' + sheets.length +
          (isNum(waste) ? '  \u00b7  waste ' + round(waste, 1) + '%' : '');
        addText(cad, L.text, ox, oy + sheetH + 26, caption, H.note);
        /* Overall sheet dimensions on the first sheet only. */
        if (sheetIndex === 0) {
          dimH(cad, unit, ox, ox + sheetW, oy - 76, oy - 10);
          dimV(cad, unit, oy, oy + sheetH, ox - 76, ox - 10);
        }
        (Array.isArray(sheetLayout.placements) ? sheetLayout.placements : []).forEach(function (pl) {
          if (!pl) return;
          var px = num(pl.x, 0), py = num(pl.y, 0), pw = num(pl.width, 0), ph = num(pl.height, 0);
          if (pw <= 0 || ph <= 0) return;
          addRect(cad, L.nest, ox + px, oy + py, pw, ph);
          var label = cleanText(pl.label || pl.key || '');
          if (!label) return;
          var fits = textWidth(label, H.tiny) + 8 < pw && ph > 6;
          if (fits) {
            addText(cad, L.parts, ox + px + pw / 2, oy + py + ph / 2, label, H.tiny,
              { align: 'center', valign: 'middle' });
          } else if (pw > 40) {
            addText(cad, L.parts, ox + px + pw / 2, oy + py + ph + 4, label, H.tiny,
              { align: 'center', valign: 'bottom' });
          } else {
            addLine(cad, L.nest, ox + px + pw / 2, oy + py + ph / 2, ox + px + pw + 60, oy + py + ph + 24);
            addText(cad, L.parts, ox + px + pw + 64, oy + py + ph + 20, label, H.tiny);
          }
          if (pl.rotated) {
            addText(cad, L.parts, ox + px + pw - 14, oy + py + 10, 'R', H.tiny, { align: 'right' });
          }
        });
        maxRight = Math.max(maxRight, ox + sheetW);
      });
      var rows = Math.ceil(sheets.length / columns);
      y = gridStartY + rows * (sheetH + 300) + 100;
      if (Array.isArray(layout.unplaced) && layout.unplaced.length) {
        y += 60;
        addText(cad, L.text, 0, y, 'WARNING: ' + layout.unplaced.length + ' part(s) could not be placed on a sheet.', H.note);
        y += 40;
      }
      maxRight = Math.max(maxRight, columns * (sheetW + gap) - gap);
    });
    return { width: Math.max(maxRight, 4000), height: y + 100 };
  }

  /* ------------------------------------------------------------------ *
   * Sheet frame and title block
   * ------------------------------------------------------------------ */
  function translateEntity(e, dx, dy) {
    if (!e) return;
    if (e.a) { e.a[0] = round(e.a[0] + dx, 4); e.a[1] = round(e.a[1] + dy, 4); }
    if (e.b) { e.b[0] = round(e.b[0] + dx, 4); e.b[1] = round(e.b[1] + dy, 4); }
    if (e.c) { e.c[0] = round(e.c[0] + dx, 4); e.c[1] = round(e.c[1] + dy, 4); }
    if (e.p) { e.p[0] = round(e.p[0] + dx, 4); e.p[1] = round(e.p[1] + dy, 4); }
    if (e.points) {
      e.points.forEach(function (pt) { pt[0] = round(pt[0] + dx, 4); pt[1] = round(pt[1] + dy, 4); });
    }
  }

  function contentBounds(cad) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cad.entities.forEach(function (e) {
      var box = entityBox(e);
      if (!box) return;
      if (box.minX < minX) minX = box.minX;
      if (box.minY < minY) minY = box.minY;
      if (box.maxX > maxX) maxX = box.maxX;
      if (box.maxY > maxY) maxY = box.maxY;
    });
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function sanitizeEntities(cad) {
    var kept = [];
    var dropped = 0;
    cad.entities.forEach(function (e) {
      var box = entityBox(e);
      if (!box || ![box.minX, box.minY, box.maxX, box.maxY].every(isNum)) {
        dropped++;
        return;
      }
      kept.push(e);
    });
    if (dropped) {
      cad.entities = kept;
      warnOnce(cad, 'Dropped ' + dropped + ' CAD entity/entities with non-finite geometry.');
    }
  }

  function addSheetFrame(cad, content, options) {
    var project = options.project || {};
    var settings = project.settings || {};
    var unit = options.unit;
    var date = cleanText(options.date || settings.date || '');
    var dx = MARGIN - content.minX;
    var dy = BAND - content.minY;
    cad.entities.forEach(function (e) { translateEntity(e, dx, dy); });
    var right = Math.max(content.maxX - content.minX + 2 * MARGIN, 4200);
    var top = Math.max(content.maxY - content.minY + BAND + 80, 1200);
    var titleBlock = { minX: right - 470, minY: 20, maxX: right - 16, maxY: BAND - 30 };
    var legend = { minX: 18, minY: 20, maxX: right - 500, maxY: BAND - 30 };

    /* Border: outer frame and inner trim line. */
    addRect(cad, L.sheet, 0, 0, right, top);
    addRect(cad, L.sheet, 6, 6, right - 12, top - 12);

    /* Title block box and separators. */
    addRect(cad, L.sheet, titleBlock.minX, titleBlock.minY,
      titleBlock.maxX - titleBlock.minX, titleBlock.maxY - titleBlock.minY);
    var tbW = titleBlock.maxX - titleBlock.minX;
    var rows = [0.72, 0.48, 0.24];
    rows.forEach(function (frac) {
      var y = titleBlock.minY + (titleBlock.maxY - titleBlock.minY) * frac;
      addLine(cad, L.sheet, titleBlock.minX, y, titleBlock.maxX, y);
    });
    addLine(cad, L.sheet, titleBlock.minX + tbW * 0.52, titleBlock.minY, titleBlock.minX + tbW * 0.52, titleBlock.maxY);

    /* Title block text: explicit baselines inside the four bands so no row
       collides with a separator line. */
    var tx = titleBlock.minX + 10;
    var tx2 = titleBlock.minX + tbW * 0.52 + 10;
    var cellMax = tbW * 0.48 - 24;
    var band = function (fraction) { return titleBlock.minY + (titleBlock.maxY - titleBlock.minY) * fraction; };
    var tbTop = titleBlock.maxY;
    var modeLine = options.modeLabel || '';

    /* Top band: identity. */
    addText(cad, L.sheet, tx, tbTop - 10, 'Cabinet Studio', H.label);
    addText(cad, L.sheet, tx, tbTop - 26, 'CAD export - shop drawings', H.note);
    addText(cad, L.sheet, tx2, tbTop - 10,
      fitText(project.name || 'Untitled cabinet project', cellMax, H.note), H.note);
    addText(cad, L.sheet, tx2, tbTop - 22,
      fitText('Client: ' + (cleanText(project.client) || '-'), cellMax, H.tiny), H.tiny);
    addText(cad, L.sheet, tx2, tbTop - 34, 'Date: ' + (date || '-'), H.tiny);

    /* Second band: units, drafting convention and drawing list. */
    addText(cad, L.sheet, tx, band(0.72) - 10, 'Units: millimetres (model space 1:1)', H.tiny);
    addText(cad, L.sheet, tx, band(0.72) - 22,
      'Dimensions shown in ' + (unit === 'metric' ? 'millimetres' : 'imperial (fractional inches)'), H.tiny);
    addText(cad, L.sheet, tx2, band(0.72) - 10,
      fitText('Drawings: ' + options.sectionList, cellMax, H.tiny), H.tiny);

    /* Third band: scale and counts. */
    addText(cad, L.sheet, tx, band(0.48) - 10, 'Scale: 1:1 for part drawings', H.tiny);
    addText(cad, L.sheet, tx, band(0.48) - 22, 'Views: front / side / isometric (not to scale)', H.tiny);
    addText(cad, L.sheet, tx2, band(0.48) - 10,
      'Cabinets: ' + options.cabinetCount + '   Part types: ' + options.partCount, H.tiny);
    addText(cad, L.sheet, tx2, band(0.48) - 22,
      'Sheet: CAD-' + options.sheetNumber + ' - Cabinet Studio', H.tiny);

    /* Bottom band: generation note and mode. */
    addText(cad, L.sheet, tx, band(0.24) - 14,
      'Generated by Cabinet Studio - local, offline', H.tiny);
    addText(cad, L.sheet, tx2, band(0.24) - 14, fitText(modeLine, cellMax, H.tiny), H.tiny);

    /* Layer legend / notes at bottom left. */
    var legendLines = [
      'CS-OUTLINE  solid   part and cabinet outlines, profile edges',
      'CS-HOLES    solid   drilled holes (circles, diameter in mm)',
      'CS-GROOVES  solid   grooves, rabbets, notches',
      'CS-PARTS    solid   part numbers, labels and part keys',
      'CS-DIM      solid   dimensions and extension lines',
      'CS-TEXT     solid   notes and view titles',
      'CS-NEST     solid   sheet boundaries and nested parts',
      'CS-HIDDEN   dashed  face-B machining and hidden lines',
      'CS-SHEET    solid   frame, title block and legend'
    ];
    addText(cad, L.text, legend.minX + 2, legend.maxY - 6, 'LAYER LEGEND', H.note, { valign: 'top' });
    var half = Math.ceil(legendLines.length / 2);
    for (var i = 0; i < legendLines.length; i++) {
      var col = Math.floor(i / half);
      var row = i % half;
      addText(cad, L.text, legend.minX + 2 + col * 620, legend.maxY - 24 - row * 9, legendLines[i], H.tiny, { valign: 'top' });
    }
    addText(cad, L.text, legend.minX + 2, legend.minY + 10,
      'Model space, millimetres, 1:1. Hole diameters: Ø in file. All coordinates are finished part dimensions unless a view is noted otherwise.',
      H.tiny);

    trackBox(cad, 0, 0, right, top);
    return {
      right: right, top: top,
      titleBlock: { minX: titleBlock.minX, minY: titleBlock.minY, maxX: titleBlock.maxX, maxY: titleBlock.maxY },
      legend: { minX: legend.minX, minY: legend.minY, maxX: legend.maxX, maxY: legend.maxY },
      dx: dx, dy: dy
    };
  }

  /* ------------------------------------------------------------------ *
   * Build entry point
   * ------------------------------------------------------------------ */
  var MODE_LABELS = {
    parts: 'Part drawings (1:1)',
    nesting: 'Sheet nesting',
    cabinet: 'Cabinet views',
    all: 'Part drawings, cabinet views and sheet nesting'
  };

  /**
   * Build a CadDrawing from the engine's Resolved output.
   * @param {object} resolved — contract §4 Resolved object (tolerant of missing parts).
   * @param {object} [options] — {mode:'parts'|'nesting'|'cabinet'|'all', units, title, date, includeTitleBlock}
   * @returns {object} CadDrawing — {layers, entities, extents, title, units, meta, sections, warnings}
   */
  function build(resolved, options) {
    options = options || {};
    resolved = resolved || {};
    var unit = unitSystem(resolved, options);
    var mode = /^(parts|nesting|cabinet|all)$/.test(options.mode || '') ? options.mode : 'all';
    var project = resolved.project || {};
    var settings = project.settings || {};
    var cad = makeCad({ unitsOverride: unit });
    var date = cleanText(options.date || settings.date || '');
    var modes = mode === 'all' ? ['parts', 'cabinet', 'nesting'] : [mode];

    /* Build each section at y=0; keep its entity range so it can be
       stacked afterwards. */
    var built = [];
    modes.forEach(function (name) {
      var start = cad.entities.length;
      if (name === 'parts') buildParts(cad, resolved, unit);
      else if (name === 'cabinet') buildCabinets(cad, resolved, unit);
      else buildNesting(cad, resolved, unit);
      built.push({ name: name, label: MODE_LABELS[name], start: start, end: cad.entities.length });
    });

    /* Stack the sections vertically, then add each section heading above its
       content. Everything is deterministic and in creation order. */
    var sections = [];
    var cursorY = 0;
    built.forEach(function (section, index) {
      var box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (var i = section.start; i < section.end; i++) {
        var eb = entityBox(cad.entities[i]);
        if (!eb) continue;
        box.minX = Math.min(box.minX, eb.minX);
        box.minY = Math.min(box.minY, eb.minY);
        box.maxX = Math.max(box.maxX, eb.maxX);
        box.maxY = Math.max(box.maxY, eb.maxY);
      }
      if (!isFinite(box.minX)) box = { minX: 0, minY: 0, maxX: 4000, maxY: 200 };
      var shift = cursorY - box.minY;
      for (var j = section.start; j < section.end; j++) translateEntity(cad.entities[j], 0, shift);
      var shifted = { minX: box.minX, minY: box.minY + shift, maxX: box.maxX, maxY: box.maxY + shift };
      addText(cad, L.text, shifted.minX, shifted.maxY + 34, section.label, H.section, { valign: 'baseline' });
      shifted.maxY += 34 + H.section;
      sections.push({ name: section.name, label: section.label, box: shifted });
      cursorY = shifted.maxY + SECTION_GAP;
    });

    sanitizeEntities(cad);
    var content = contentBounds(cad);
    var optsForFrame = {
      project: project,
      unit: unit,
      date: date,
      sectionList: modes.map(function (m) { return MODE_LABELS[m]; }).join('; '),
      cabinetCount: (resolved.cabinets || []).length,
      partCount: collectUniqueParts(resolved).length,
      sheetNumber: options.sheetNumber || '001',
      modeLabel: MODE_LABELS[mode],
      sectionModes: modes
    };

    var frame;
    var includeFrame = options.includeTitleBlock !== false;
    if (includeFrame) {
      frame = addSheetFrame(cad, content, optsForFrame);
      var extents = {
        minX: 0, minY: 0,
        maxX: Math.ceil(frame.right * 10) / 10,
        maxY: Math.ceil(frame.top * 10) / 10
      };
    } else {
      var dx = MARGIN - content.minX;
      var dy = MARGIN - content.minY;
      cad.entities.forEach(function (e) { translateEntity(e, dx, dy); });
      frame = {
        right: content.maxX - content.minX + 2 * MARGIN,
        top: content.maxY - content.minY + 2 * MARGIN,
        titleBlock: null,
        dx: dx,
        dy: dy
      };
      extents = {
        minX: 0, minY: 0,
        maxX: Math.ceil(frame.right * 10) / 10,
        maxY: Math.ceil(frame.top * 10) / 10
      };
    }

    var finalSections = sections.map(function (section) {
      return {
        name: section.name,
        label: section.label,
        minX: round(section.box.minX + frame.dx, 3),
        minY: round(section.box.minY + frame.dy, 3),
        maxX: round(section.box.maxX + frame.dx, 3),
        maxY: round(section.box.maxY + frame.dy, 3)
      };
    });

    return {
      layers: cad.layers,
      entities: cad.entities,
      extents: extents,
      title: cleanText(options.title || (project.name ? project.name + ' \u2014 CAD export' : 'Cabinet Studio CAD export')),
      units: 'mm',
      mode: mode,
      meta: {
        projectName: cleanText(project.name || ''),
        client: cleanText(project.client || ''),
        date: date,
        unit: unit,
        mode: mode,
        cabinetCount: (resolved.cabinets || []).length,
        uniquePartCount: collectUniqueParts(resolved).length,
        entityCount: cad.entities.length,
        layerCount: cad.layers.length
      },
      sections: finalSections,
      titleBlock: frame.titleBlock,
      warnings: cad.warnings.slice()
    };
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */
  var api = {
    build: build,
    collectUniqueParts: collectUniqueParts,
    LAYER_DEFS: LAYER_DEFS,
    entityBox: entityBox,
    textBox: textBox
  };
  CS.export = CS.export || {};
  CS.export.cadLayout = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
