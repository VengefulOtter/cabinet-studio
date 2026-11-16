/**
 * Cabinet Studio engine — Part factory, machining helpers and component builders.
 *
 * Cabinet coordinate system used by `Part.box` and every builder in this file:
 *   x: 0 at the left side, increasing right
 *   y: 0 at the back of the cabinet, increasing toward the front (doors sit beyond `depth`)
 *   z: 0 at the floor, increasing up
 * All millimetres.
 *
 * Drawing model for a Part: `length` is horizontal on face A, `width` vertical; machining
 * coordinates are measured from the bottom-left of face A. `view.left` / `view.up` name the
 * physical edges found at the left and top of the drawing, so a shop reader can orient any part.
 * Face B is face A seen from behind: x is mirrored (`xB = length - xA`), y unchanged.
 *
 * Everything here is pure and deterministic: no DOM, no randomness, no clock.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var defaults = CS.engine && CS.engine.defaults;
  if (!defaults) throw new Error('CabinetStudio engine load order: defaults.js must load before parts.js');

  var U = defaults.util;
  var isObject = U.isObject, clone = U.clone, num = U.num, clamp = U.clamp, round = U.round;
  var isFinitePositive = U.isFinitePositive, contains = U.contains;

  var GROUPS = {
    CARCASS: 'Carcass',
    BACK: 'Back',
    SHELVES: 'Shelves',
    DOORS: 'Doors',
    DRAWERS: 'Drawers',
    FACE_FRAME: 'Face frame',
    TOE_KICK: 'Toe kick',
    HARDWARE: 'Hardware'
  };

  var EDGE_NAMES = ['front', 'back', 'top', 'bottom', 'left', 'right'];
  var EDGE_OPPOSITE = { front: 'back', back: 'front', top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

  // Physical unit directions and their cabinet edge vocabulary.
  var DIRS = {
    xp: { axis: 'x', sign: 1, name: 'right' },
    xn: { axis: 'x', sign: -1, name: 'left' },
    yp: { axis: 'y', sign: 1, name: 'front' },
    yn: { axis: 'y', sign: -1, name: 'back' },
    zp: { axis: 'z', sign: 1, name: 'top' },
    zn: { axis: 'z', sign: -1, name: 'bottom' }
  };
  var DIR_BY_NAME = { right: DIRS.xp, left: DIRS.xn, front: DIRS.yp, back: DIRS.yn, top: DIRS.zp, bottom: DIRS.zn };
  var VEC_BY_AXIS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  // Base orientation pairs per face normal: a x b = normal.
  var BASE_PAIRS = {
    'x+': ['yp', 'zp'], 'x-': ['zp', 'yp'],
    'y+': ['zp', 'xp'], 'y-': ['xp', 'zp'],
    'z+': ['xp', 'yp'], 'z-': ['yp', 'xp']
  };

  function negDir(d) { return DIR_BY_NAME[EDGE_OPPOSITE[d.name]]; }
  function dirVec(d) {
    var v = VEC_BY_AXIS[d.axis].slice();
    return [v[0] * d.sign, v[1] * d.sign, v[2] * d.sign];
  }
  function crossVec(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function normalKey(normal) {
    var axes = ['x', 'y', 'z'];
    for (var i = 0; i < 3; i++) {
      if (Math.abs(normal[i]) > 0.5) return axes[i] + (normal[i] > 0 ? '+' : '-');
    }
    return 'z+';
  }

  /** Box dimension along a physical axis. */
  function extentOf(box, axis) {
    return axis === 'x' ? box.w : axis === 'y' ? box.d : box.h;
  }
  function originOf(box, axis) {
    return axis === 'x' ? box.x : axis === 'y' ? box.y : box.z;
  }

  /**
   * Build a drawing orientation for a planar face of an axis-aligned box.
   *
   * @param {Object} opts
   * @param {number[]} opts.normal outward normal of face A (unit vector)
   * @param {Object} opts.box physical placement of the part {x,y,z,w,d,h}
   * @param {string} opts.faceA human name of face A
   * @param {string} [opts.note]
   * @returns {{
   *   length:number, width:number, view:{faceA:string, up:string, left:string, note:string},
   *   at:function(Object):{x:number,y:number},
   *   onFaceB:function(Object):{x:number,y:number},
   *   edgeToDrawing:function(string,string):(string|null),
   *   edgeLength:function(string):number
   * }}
   */
  function orient(opts) {
    var box = opts.box;
    var normal = opts.normal;
    var pair = BASE_PAIRS[normalKey(normal)];
    var a = DIRS[pair[0]];
    var b = DIRS[pair[1]];
    var extA = extentOf(box, a.axis);
    var extB = extentOf(box, b.axis);
    if (extA < extB) {
      var newA = b;
      b = negDir(a);
      a = newA;
      var tmp = extA; extA = extB; extB = tmp;
    }
    var length = round(extA, 2);
    var width = round(extB, 2);
    var view = {
      faceA: opts.faceA || 'Face A',
      up: b.name,
      left: DIR_BY_NAME[EDGE_OPPOSITE[a.name]].name,
      note: opts.note || ''
    };

    /** Physical absolute point -> drawing coordinates on face A. */
    function at(p) {
      var pa = p[a.axis] - originOf(box, a.axis);
      if (a.sign < 0) pa = extentOf(box, a.axis) - pa;
      var pb = p[b.axis] - originOf(box, b.axis);
      if (b.sign < 0) pb = extentOf(box, b.axis) - pb;
      return { x: round(pa, 2), y: round(pb, 2) };
    }
    /** Same point on face B (mirrored horizontally). */
    function onFaceB(p) {
      var q = at(p);
      return { x: round(length - q.x, 2), y: q.y };
    }
    function dirAtEdge(edgeName) {
      // Given a physical edge label, which drawing edge is it on face A?
      if (edgeName === view.left) return 'left';
      if (edgeName === EDGE_OPPOSITE[view.left]) return 'right';
      if (edgeName === view.up) return 'top';
      if (edgeName === EDGE_OPPOSITE[view.up]) return 'bottom';
      return null;
    }
    function edgeToDrawing(edgeName, face) {
      var e = dirAtEdge(edgeName);
      if (!e) return null;
      if (face === 'B') e = EDGE_OPPOSITE[e];
      return e;
    }
    function edgeLength(edgeName) {
      var e = dirAtEdge(edgeName);
      if (!e) return 0;
      return (e === 'left' || e === 'right') ? width : length;
    }
    return {
      length: length, width: width, view: view, a: a, b: b,
      at: at, onFaceB: onFaceB, edgeToDrawing: edgeToDrawing, edgeLength: edgeLength
    };
  }

  /**
   * For sheet goods the cut list must match the stock on the rack. If the configured thickness is
   * within 0.8 mm of the material thickness, the material wins (e.g. nominal 1/4" 6.35 → 6 mm).
   */
  function resolveSheetThickness(ctx, materialId, configured) {
    var mat = defaults.material(materialId);
    var th = num(configured, mat.thickness);
    if (mat.category === 'sheet' && isFinitePositive(mat.thickness) && Math.abs(mat.thickness - th) <= 0.8) {
      return round(mat.thickness, 2);
    }
    return round(th, 2);
  }

  function makeBox(x, y, z, w, d, h) {
    return { x: round(num(x, 0), 2), y: round(num(y, 0), 2), z: round(num(z, 0), 2), w: round(num(w, 0), 2), d: round(num(d, 0), 2), h: round(num(h, 0), 2) };
  }

  /** Test whether two placements intersect (touching faces allowed). */
  function boxesOverlap(a, b, epsilon) {
    var e = epsilon === undefined ? 0.01 : epsilon;
    return a.x + a.w > b.x + e && b.x + b.w > a.x + e &&
      a.y + a.d > b.y + e && b.y + b.d > a.y + e &&
      a.z + a.h > b.z + e && b.z + b.h > a.z + e;
  }

  function overlapVolume(a, b) {
    var dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var dy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
    var dz = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
    if (dx <= 0 || dy <= 0 || dz <= 0) return 0;
    return round(dx * dy * dz, 2);
  }

  // ---------------------------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------------------------

  /**
   * Create a per-cabinet build context. Parts and hardware are appended here; warnings are
   * collected in one place and ids are deterministic.
   *
   * @param {Object} opts {project, config, standards, warnings}
   */
  function createContext(opts) {
    var cfg = opts.config;
    return {
      project: opts.project,
      config: cfg,
      standards: opts.standards,
      warnings: opts.warnings || [],
      parts: [],
      hardware: [],
      _partSeq: 0,
      _hwSeq: 0,
      _hwIndex: {},
      tag: cfg.tag,
      cabinetId: cfg.id,
      /** Add a warning tied to this cabinet. */
      warn: function (severity, title, message, rule, fix, partIds) {
        this.warnings.push({
          id: 'w-' + (this.warnings.length + 1),
          severity: severity,
          cabinetId: cfg.id,
          cabinetTag: cfg.tag,
          partIds: partIds || [],
          title: title,
          message: message,
          rule: rule || 'geometry',
          fix: fix || ''
        });
      },
      /** Next stable part id, e.g. "B1-07". */
      nextPartId: function () {
        this._partSeq += 1;
        return cfg.tag + '-' + (this._partSeq < 10 ? '0' : '') + this._partSeq;
      },
      /** Aggregate a hardware template into the cabinet's hardware list. */
      addHardware: function (templateId, qty, partIds, notes, unit) {
        var q = num(qty, 0);
        if (!(q > 0)) return;
        var rec = this._hwIndex[templateId];
        if (!rec) {
          rec = this._hwIndex[templateId] = {
            templateId: templateId, qty: 0, unit: unit || defaults.hardware(templateId).unit || 'ea',
            partIds: [], notes: [], install: defaults.hardware(templateId).install || ''
          };
          this.hardware.push(rec);
        }
        rec.qty = round(rec.qty + q, 2);
        if (Array.isArray(partIds)) {
          for (var i = 0; i < partIds.length; i++) {
            if (partIds[i] && rec.partIds.indexOf(partIds[i]) === -1) rec.partIds.push(partIds[i]);
          }
        }
        if (notes && rec.notes.indexOf(notes) === -1) rec.notes.push(notes);
      }
    };
  }

  /** Build final HardwareItem records (contract §4) from the context aggregates. */
  function finaliseHardware(ctx) {
    var out = [];
    for (var i = 0; i < ctx.hardware.length; i++) {
      var rec = ctx.hardware[i];
      var tpl = defaults.hardware(rec.templateId);
      out.push({
        id: ctx.tag + '-HW-' + (i < 9 ? '0' : '') + (i + 1),
        name: tpl.name,
        category: tpl.category,
        qty: rec.qty,
        unit: rec.unit,
        cabinetId: ctx.cabinetId,
        cabinetTag: ctx.tag,
        templateId: rec.templateId,
        partIds: rec.partIds.slice(),
        notes: rec.notes.join(' '),
        install: rec.install || ''
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Part factory
  // ---------------------------------------------------------------------------------------------

  function validEdge(m) { return contains(EDGE_NAMES, m.edge); }
  function validFace(m) { return m.face === 'A' || m.face === 'B'; }
  function roundMach(m) {
    var out = clone(m);
    if (typeof out.x === 'number') out.x = round(out.x, 2);
    if (typeof out.y === 'number') out.y = round(out.y, 2);
    if (typeof out.x1 === 'number') out.x1 = round(out.x1, 2);
    if (typeof out.y1 === 'number') out.y1 = round(out.y1, 2);
    if (typeof out.x2 === 'number') out.x2 = round(out.x2, 2);
    if (typeof out.y2 === 'number') out.y2 = round(out.y2, 2);
    if (typeof out.width === 'number') out.width = round(out.width, 2);
    if (typeof out.height === 'number') out.height = round(out.height, 2);
    if (typeof out.depth === 'number') out.depth = round(out.depth, 2);
    if (typeof out.diameter === 'number') out.diameter = round(out.diameter, 2);
    return out;
  }

  /**
   * Validate and clamp machining so output never contains NaN or coordinates outside the part.
   * Returns the cleaned machining record or null when it cannot be repaired.
   */
  function cleanMachining(part, m, ctx) {
    if (!isObject(m)) return null;
    var face = validFace(m) ? m.face : 'A';
    var len = part.length, wid = part.width, thick = part.thickness;
    var out;
    switch (m.type) {
      case 'hole': {
        if (!isFinitePositive(m.diameter) || !isFinitePositive(m.depth)) return null;
        var x = num(m.x, NaN), y = num(m.y, NaN);
        if (!isFinite(x) || !isFinite(y)) return null;
        if (x < -0.01 || x > len + 0.01 || y < -0.01 || y > wid + 0.01) {
          if (ctx) ctx.warn('warning', 'Machining outside part', 'A ' + (m.purpose || 'hole') + ' hole at (' + round(x, 1) + ', ' + round(y, 1) + ') was moved inside the ' + part.name + '.', 'machining.bounds', 'Check the hole layout on this part.', [part.id]);
        }
        out = {
          type: 'hole', face: face, x: round(clamp(x, 0, len), 2), y: round(clamp(y, 0, wid), 2),
          diameter: round(m.diameter, 2), depth: round(m.depth, 2), through: !!m.through,
          purpose: m.purpose || 'hole', note: m.note || ''
        };
        break;
      }
      case 'groove': {
        if (!isFinitePositive(m.width) || !isFinitePositive(m.depth)) return null;
        var x1 = num(m.x1, NaN), y1 = num(m.y1, NaN), x2 = num(m.x2, NaN), y2 = num(m.y2, NaN);
        if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return null;
        out = {
          type: 'groove', face: face,
          x1: round(clamp(x1, 0, len), 2), y1: round(clamp(y1, 0, wid), 2),
          x2: round(clamp(x2, 0, len), 2), y2: round(clamp(y2, 0, wid), 2),
          width: round(m.width, 2), depth: round(Math.min(m.depth, thick), 2),
          purpose: m.purpose || 'groove', note: m.note || ''
        };
        break;
      }
      case 'rabbet': {
        if (!validEdge(m) || !isFinitePositive(m.width) || !isFinitePositive(m.depth)) return null;
        var across = (m.edge === 'left' || m.edge === 'right') ? wid : len;
        if (m.width > across) {
          if (ctx) ctx.warn('warning', 'Rabbet wider than part', 'Rabbet on ' + part.name + ' was reduced to the part size.', 'machining.bounds', 'Rebuild the part or reduce the rabbet.', [part.id]);
        }
        out = {
          type: 'rabbet', face: face, edge: m.edge,
          width: round(Math.min(m.width, across), 2),
          depth: round(Math.min(m.depth, thick), 2),
          purpose: m.purpose || 'panel', note: m.note || ''
        };
        break;
      }
      case 'notch': {
        if (!contains(['bl', 'br', 'tl', 'tr'], m.corner) || !isFinitePositive(m.width) || !isFinitePositive(m.height)) return null;
        if (m.width > len || m.height > wid) {
          if (ctx) ctx.warn('warning', 'Notch larger than part', 'Notch on ' + part.name + ' was clipped to the part.', 'machining.bounds', 'Check the notch dimensions.', [part.id]);
        }
        out = {
          type: 'notch', face: face, corner: m.corner,
          width: round(Math.min(m.width, len), 2),
          height: round(Math.min(m.height, wid), 2),
          purpose: m.purpose || 'notch', note: m.note || ''
        };
        break;
      }
      case 'drill-pattern': {
        // Convenience: expand to holes so every consumer sees one representation.
        var rows = Math.max(1, Math.round(num(m.rows, 1)));
        var cols = Math.max(1, Math.round(num(m.cols, 1)));
        var holes = [];
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            var hole = cleanMachining(part, {
              type: 'hole', face: face, x: num(m.x, 0) + c * num(m.dx, 0), y: num(m.y, 0) + r * num(m.dy, 0),
              diameter: m.diameter, depth: m.depth, purpose: m.purpose, note: m.note
            }, null);
            if (hole) holes.push(hole);
          }
        }
        return holes;
      }
      default:
        return null;
    }
    return out;
  }

  function machiningKey(m) {
    return [m.type, m.face, m.x, m.y, m.diameter, m.x1, m.y1, m.x2, m.y2, m.edge, m.corner, m.width, m.height, m.depth, m.purpose].join('|');
  }

  /**
   * Add a part to the context. Cleans dimensions, placement and machining, assigns the stable id
   * and returns the finished Part (contract §4).
   *
   * @param {Object} ctx context from createContext
   * @param {Object} spec part definition
   * @returns {Object} Part
   */
  function addPart(ctx, spec) {
    var name = spec.name || spec.key || 'Part';
    var material = defaults.material(spec.materialId || ctx.config.construction.carcassMaterial);
    var thickness = num(spec.thickness, material.thickness);
    var length = num(spec.length, 0);
    var width = num(spec.width, 0);
    // Repair impossible dimensions rather than emitting NaN / negative parts.
    if (!isFinitePositive(thickness)) thickness = material.thickness || 18;
    if (!isFinitePositive(length) && !isFinitePositive(width)) {
      length = isFinitePositive(spec.box && spec.box.w) ? spec.box.w : 1;
      width = isFinitePositive(spec.box && spec.box.d) ? spec.box.d : 1;
    } else if (!isFinitePositive(length)) {
      length = Math.max(width, 1);
    } else if (!isFinitePositive(width)) {
      width = Math.max(length, 1);
    }
    length = round(length, 2);
    width = round(width, 2);
    thickness = round(thickness, 2);

    var box = spec.box ? makeBox(spec.box.x, spec.box.y, spec.box.z, spec.box.w, spec.box.d, spec.box.h) : null;
    if (!box || !isFinitePositive(box.w) || !isFinitePositive(box.d) || !isFinitePositive(box.h)) {
      ctx.warn('warning', 'Part placement repaired', name + ' had an invalid box placement; it was given a minimal valid placement.', 'part.box', 'Check the generator inputs for this part.');
      box = box || makeBox(0, 0, 0, 1, 1, 1);
      if (!isFinitePositive(box.w)) box.w = 1;
      if (!isFinitePositive(box.d)) box.d = 1;
      if (!isFinitePositive(box.h)) box.h = 1;
    }

    var machining = [];
    var seen = {};
    var rawMach = Array.isArray(spec.machining) ? spec.machining : [];
    for (var i = 0; i < rawMach.length; i++) {
      var cleaned = cleanMachining({ length: length, width: width, thickness: thickness, name: name, id: '?' }, rawMach[i], ctx);
      if (!cleaned) continue;
      var list = Array.isArray(cleaned) ? cleaned : [cleaned];
      for (var j = 0; j < list.length; j++) {
        var item = roundMach(list[j]);
        var k = machiningKey(item);
        if (seen[k]) continue;
        seen[k] = true;
        machining.push(item);
      }
    }

    var edges = Array.isArray(spec.edges) ? spec.edges.filter(function (e) { return contains(EDGE_NAMES, e); }) : [];
    // Glass, floating panels, backs and solid-wood parts get no edgeband: report "none" so the cut
    // list / finish schedule cannot show a PVC band on a glass pane.
    var ebMat = edges.length === 0
      ? { id: 'none', thickness: 0, name: 'No edgeband' }
      : defaults.edgebandMaterial(spec.edgebandId || ctx.config.construction.edgeBanding || 'pvc-0.5');
    var part = {
      id: ctx.nextPartId(),
      cabinetId: ctx.cabinetId,
      cabinetTag: ctx.tag,
      key: spec.key || ('part-' + ctx._partSeq),
      name: name,
      group: spec.group || GROUPS.CARCASS,
      qty: 1,
      materialId: material.id,
      materialName: material.name,
      thickness: thickness,
      length: length,
      width: width,
      grain: spec.grain || (material.grain ? 'length' : 'none'),
      edgeband: { edges: edges, materialId: ebMat.id, thickness: ebMat.thickness },
      view: spec.view || { faceA: 'Face A', up: 'top', left: 'left', note: '' },
      box: box,
      machining: machining,
      joinery: Array.isArray(spec.joinery) ? spec.joinery : [],
      notes: Array.isArray(spec.notes) ? spec.notes.filter(Boolean) : [],
      cutListGroup: spec.cutListGroup || spec.key || 'part',
      isFront: !!spec.isFront,
      frontLabel: spec.frontLabel || null,
      finish: spec.finish || null
    };
    // Machining was validated against a stub above; re-clean with the real id for warnings.
    if (machining.length !== rawMach.length) {
      // dedupe dropped entries silently; patterns expand so length mismatch is expected
    }
    ctx.parts.push(part);
    return part;
  }

  /** Find a part previously added to the context by key. */
  function byKey(ctx, key) {
    for (var i = 0; i < ctx.parts.length; i++) if (ctx.parts[i].key === key) return ctx.parts[i];
    return null;
  }

  function hole(face, x, y, diameter, depth, purpose, note) {
    return { type: 'hole', face: face || 'A', x: x, y: y, diameter: diameter, depth: depth, through: false, purpose: purpose || 'hole', note: note || '' };
  }
  function throughHole(face, x, y, diameter, purpose, note) {
    return { type: 'hole', face: face || 'A', x: x, y: y, diameter: diameter, depth: 0, through: true, purpose: purpose || 'hole', note: note || '' };
  }
  function groove(face, x1, y1, x2, y2, width, depth, purpose, note) {
    return { type: 'groove', face: face || 'A', x1: x1, y1: y1, x2: x2, y2: y2, width: width, depth: depth, purpose: purpose || 'groove', note: note || '' };
  }
  function rabbet(face, edge, width, depth, purpose, note) {
    return { type: 'rabbet', face: face || 'A', edge: edge, width: width, depth: depth, purpose: purpose || 'panel', note: note || '' };
  }
  function notch(face, corner, width, height, purpose, note) {
    return { type: 'notch', face: face || 'A', corner: corner, width: width, height: height, purpose: purpose || 'notch', note: note || '' };
  }

  /** Edgeband helper: physical edge names, filtered against the part orientation later. */
  function edgeband(edges, materialId, thickness) {
    var list = (edges || []).filter(function (e) { return contains(EDGE_NAMES, e); });
    return { edges: list, materialId: materialId || 'pvc-0.5', thickness: num(thickness, 0.5) };
  }

  /** Total banded edge length of a part, using its view to map physical edges to drawing edges. */
  function edgebandLength(part) {
    if (!part || !part.edgeband || !part.edgeband.edges || part.edgeband.edges.length === 0) return 0;
    var o = orientFromPart(part);
    var total = 0;
    for (var i = 0; i < part.edgeband.edges.length; i++) {
      var e = o.edgeToDrawing(part.edgeband.edges[i], 'A');
      if (e === 'left' || e === 'right') total += part.width;
      else if (e === 'top' || e === 'bottom') total += part.length;
    }
    return round(total, 2);
  }

  /** Rebuild a minimal orientation object from a finished part's stored view. */
  function orientFromPart(part) {
    var box = part.box;
    var axisOfName = { right: DIRS.xp, left: DIRS.xn, front: DIRS.yp, back: DIRS.yn, top: DIRS.zp, bottom: DIRS.zn };
    // Reconstruct the face normal from the stored view: normal = drawingX x drawingY.
    var leftEdge = axisOfName[part.view.left] || DIRS.xn;
    var upEdge = axisOfName[part.view.up] || DIRS.zn;
    var a = negDir(leftEdge); // drawing x direction
    var b = upEdge;           // drawing y direction
    var normal = crossVec(dirVec(a), dirVec(b));
    return orient({ box: box, normal: normal, faceA: part.view.faceA, note: part.view.note });
  }

  // ---------------------------------------------------------------------------------------------
  // Carcass-style parts with explicit orientations
  // ---------------------------------------------------------------------------------------------

  /**
   * Rectangular panel with a given broad-face normal and placement; caller supplies machining in
   * physical cabinet coordinates through the returned orientation.
   */
  function panelPart(ctx, opts) {
    var o = orient({ normal: opts.normal, box: opts.box, faceA: opts.faceA, note: opts.note });
    var part = addPart(ctx, {
      key: opts.key, name: opts.name, group: opts.group, materialId: opts.materialId,
      thickness: opts.thickness, length: o.length, width: o.width, grain: opts.grain,
      edges: opts.edges, edgebandId: opts.edgebandId, joinery: opts.joinery, notes: opts.notes,
      cutListGroup: opts.cutListGroup, view: o.view, box: opts.box,
      machining: typeof opts.machining === 'function' ? opts.machining(o) : opts.machining,
      isFront: opts.isFront, frontLabel: opts.frontLabel
    });
    return { part: part, o: o };
  }

  // ---------------------------------------------------------------------------------------------
  // Door / drawer-front builders
  // ---------------------------------------------------------------------------------------------

  /**
   * Auto hinge count by door height (contract §4): 2 ≤ 900, 3 > 900, 4 > 1500, 5 > 1900.
   * Always clamped 2..6.
   */
  function autoHingeCount(height, standards) {
    var st = standards || defaults.standards();
    var cup = st.door.hingeCup;
    var schedule = (st.hinge && Array.isArray(st.hinge.countByHeight)) ? st.hinge.countByHeight : null;
    var n = 2;
    if (schedule && schedule.length) {
      n = schedule[schedule.length - 1].hinges;
      for (var i = 0; i < schedule.length; i++) {
        if (height <= schedule[i].maxHeight) { n = schedule[i].hinges; break; }
      }
    } else {
      n = height <= 900 ? 2 : height <= 1600 ? 3 : height <= 2000 ? 4 : 5;
    }
    return clamp(n, cup.minPerDoor || 2, cup.maxPerDoor || 6);
  }

  /** Hinge cup centre positions measured up from the door bottom. */
  function hingePositions(height, count, standards, endOffset) {
    var st = standards || defaults.standards();
    var cup = st.door.hingeCup;
    var n = clamp(Math.round(count), cup.minPerDoor, cup.maxPerDoor);
    var end = (typeof endOffset === 'number' && endOffset > 0)
      ? endOffset
      : Math.min(cup.endOffset, Math.max(25, height * 0.2));
    if (n === 1) return [round(height / 2, 1)];
    var span = height - 2 * end;
    var out = [];
    for (var i = 0; i < n; i++) out.push(round(end + (span * i) / (n - 1), 1));
    return out;
  }

  /**
   * Add hinge cup + screw-hole machining for one door leaf.
   * Hinge edge 'left' or 'right' as seen from the front (face A).
   */
  function addHingeMachining(ctx, part, o, opts) {
    var st = ctx.standards;
    var cup = st.door.hingeCup;
    var hinges = opts.hinges; // array of z offsets from door bottom
    var edgeSide = opts.hingeSide; // 'left' | 'right'
    if (opts.hingeType !== 'euro-cup') {
      part.joinery.push({ id: 'butt-hinge', note: 'Mortise ' + hinges.length + ' butt hinges in the door edge and cabinet edge; set 2–3 mm reveal' });
      part.notes.push('Butt hinges: cut ' + hinges.length + ' mortises in the hinge edge; geometry for the cup boring does not apply.');
      return;
    }
    var mach = [];
    var edgeDistance = cup.edgeDistance;
    var oWidth = o.width;
    var yA = edgeSide === 'left' ? edgeDistance : oWidth - edgeDistance;
    for (var i = 0; i < hinges.length; i++) {
      var xA = hinges[i];
      // Face-A coords of the cup centre (x = up the door, y = across the door width).
      var cupA = { x: round(xA, 2), y: round(yA, 2) };
      // Screw holes sit 22.5 mm either side of the cup along the hinge edge.
      var s1 = { x: round(clamp(xA - cup.screwSpacing / 2, 0, o.length), 2), y: round(yA, 2) };
      var s2 = { x: round(clamp(xA + cup.screwSpacing / 2, 0, o.length), 2), y: round(yA, 2) };
      mach.push({ type: 'hole', face: 'B', x: round(o.length - cupA.x, 2), y: cupA.y, diameter: cup.diameter, depth: cup.depth, through: false, purpose: 'hinge-plate', note: '35 mm hinge cup' });
      mach.push({ type: 'hole', face: 'B', x: round(o.length - s1.x, 2), y: s1.y, diameter: cup.screwDiameter, depth: cup.screwDepth, through: false, purpose: 'hinge-plate', note: 'hinge screw' });
      mach.push({ type: 'hole', face: 'B', x: round(o.length - s2.x, 2), y: s2.y, diameter: cup.screwDiameter, depth: cup.screwDepth, through: false, purpose: 'hinge-plate', note: 'hinge screw' });
    }
    if (!part.machining) part.machining = [];
    for (var m = 0; m < mach.length; m++) {
      // Clamp against the real face extents (face B uses the same length/width).
      mach[m].x = round(clamp(mach[m].x, 0, part.length), 2);
      mach[m].y = round(clamp(mach[m].y, 0, part.width), 2);
      part.machining.push(mach[m]);
    }
  }

  /**
   * Front face orientation for a rectangular front area: length along the longer physical axis.
   * Returns orientation built on a temporary box; callers use `.at()` for machining coords.
   */
  function frontOrientation(box, faceA, normal) {
    return orient({ normal: normal || [0, 1, 0], box: box, faceA: faceA || 'Front face', note: '' });
  }

  function pullScrewsFor(pullId) {
    if (pullId === 'pull-knob-32') return { count: 1, spacing: 0 };
    return { count: 2, spacing: 128 };
  }

  /**
   * Add pull screw holes to the front part that contains the pull centre.
   * Pull centre is given in front-elevation coordinates (x from cabinet left, y from floor).
   * Doors use a vertical screw pair; drawer fronts use a horizontal pair.
   */
  function addPullMachining(ctx, parts, pull) {
    if (!pull || !pull.id) return;
    var spec = pullScrewsFor(pull.id);
    var vertical = !!pull.vertical;
    var holes = [];
    if (spec.count === 1) {
      holes.push({ dx: 0, dz: 0 });
    } else if (vertical) {
      holes.push({ dx: 0, dz: -spec.spacing / 2 }, { dx: 0, dz: spec.spacing / 2 });
    } else {
      holes.push({ dx: -spec.spacing / 2, dz: 0 }, { dx: spec.spacing / 2, dz: 0 });
    }
    var maxDx = 0, maxDz = 0;
    for (var h = 0; h < holes.length; h++) {
      maxDx = Math.max(maxDx, Math.abs(holes[h].dx));
      maxDz = Math.max(maxDz, Math.abs(holes[h].dz));
    }
    // Prefer the part whose face contains the pull centre and has room for every screw.
    var best = null, bestScore = -1;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var b = p.box;
      if (pull.x < b.x - 0.5 || pull.x > b.x + b.w + 0.5 || pull.y < b.z - 0.5 || pull.y > b.z + b.h + 0.5) continue;
      var fitsX = maxDx === 0 || b.w >= 2 * maxDx + 4;
      var fitsZ = maxDz === 0 || b.h >= 2 * maxDz + 4;
      var score = (fitsX && fitsZ) ? 2 : 1;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) return;
    var target = best;
    var box = target.box;
    var o = orientFromPart(target);
    var px = clamp(pull.x, box.x + maxDx + 1, box.x + box.w - maxDx - 1);
    var pz = clamp(pull.y, box.z + maxDz + 1, box.z + box.h - maxDz - 1);
    var added = 0;
    for (var h2 = 0; h2 < holes.length; h2++) {
      var hx = px + holes[h2].dx;
      var hz = pz + holes[h2].dz;
      if (hx < box.x + 1 || hx > box.x + box.w - 1 || hz < box.z + 1 || hz > box.z + box.h - 1) continue;
      var a = o.at({ x: hx, y: box.y + box.d / 2, z: hz });
      target.machining.push({ type: 'hole', face: 'A', x: a.x, y: a.y, diameter: 4, depth: 12, through: false, purpose: 'pull', note: pull.id });
      added++;
    }
    if (added === holes.length) {
      target.joinery.push({ id: 'pull', note: 'Pull ' + pull.id + ' at ' + round(px, 1) + ', ' + round(pz, 1) + ' mm from cabinet left/floor' });
    } else if (added > 0) {
      target.notes.push('Pull fixing holes partially outside the part; check the pull position against the front drawing');
    }
  }

  function doorStyleIsGlazed(style, panelStyle) {
    return style === 'glass' || style === 'mullion-glass' || (panelStyle === 'glass' && style !== 'slab');
  }

  function frameStyleIsGlazed(style) {
    return style === 'glass' || style === 'mullion-glass';
  }

  /**
   * Build one door leaf: slab, frame-and-panel (shaker/raised/beadboard) or glazed frame.
   *
   * @param {Object} ctx build context
   * @param {Object} opts
   *   rect {x,z,w,h} front-elevation rectangle (x from cabinet left, z from floor)
   *   label front label, hingeSide 'left'|'right', overlay 'full'|'inset',
   *   doors config, depthY depth (y) of the front's back face, standards, pull {id,x,y}
   * @returns {Object} leaf summary for frontLayout and hinge hole placement
   */
  function buildDoorLeaf(ctx, opts) {
    var cfg = opts.doors;
    var rect = opts.rect;
    var st = ctx.standards;
    var overlay = opts.overlay;
    var thickness = cfg.thickness;
    var depthY = num(opts.depthY, ctx.config.depth - thickness);
    var doorBox = makeBox(rect.x, depthY, rect.z, rect.w, thickness, rect.h);
    var style = cfg.style;
    var glazed = doorStyleIsGlazed(style, cfg.panelStyle);
    var frame = style !== 'slab';
    var hingeSide = opts.hingeSide;
    var hingeCount = cfg.hingeCount === 'auto' ? autoHingeCount(rect.h, st) : clamp(Math.round(cfg.hingeCount), 2, 6);
    var cupStd = st.door.hingeCup;
    var endOffset = Math.min(cupStd.endOffset, Math.max(25, rect.h * 0.2));
    // Research rule V5: the top-to-bottom hinge span should exceed the leaf width. For a short,
    // wide leaf that means bringing the two cups in from the ends; never closer than 40 mm.
    if (hingeCount === 2 && rect.h > rect.w + 60) {
      var maxEndOffset = (rect.h - rect.w) / 2 - 2;
      if (maxEndOffset > 40 && endOffset > maxEndOffset) endOffset = maxEndOffset;
    }
    var hinges = hingePositions(rect.h, hingeCount, st, endOffset);
    var ruleSpan = hingeCount === 2 ? (hinges[hinges.length - 1] - hinges[0]) : null;
    // Snap cup centres onto the cabinet's 32 mm system grid so plate screws reuse shelf-pin holes.
    if (opts.pinGrid && opts.pinGrid.step > 0) {
      var gridOrigin = num(opts.pinGrid.origin, rect.z);
      var gridStep = num(opts.pinGrid.step, 32);
      var snappedHinges = hinges.map(function (off) {
        var abs = rect.z + off;
        var snapped = gridOrigin + Math.round((abs - gridOrigin) / gridStep) * gridStep;
        return round(clamp(snapped - rect.z, 30, rect.h - 30), 2);
      });
      snappedHinges.sort(function (a, b) { return a - b; });
      var unique = [];
      for (var hh = 0; hh < snappedHinges.length; hh++) {
        if (unique.length === 0 || snappedHinges[hh] - unique[unique.length - 1] > 1) unique.push(snappedHinges[hh]);
      }
      // Keep the grid lock only when it does not violate the hinge-spacing rule.
      var snappedSpan = unique.length === 2 ? (unique[1] - unique[0]) : ruleSpan;
      if (ruleSpan === null || snappedSpan === null || snappedSpan > rect.w) {
        hinges = unique;
        hingeCount = hinges.length;
      }
    }
    var leafParts = [];
    var edgeBandId = ctx.config.construction.edgeBanding;
    var doorMaterialId = cfg.material || cfg.materialId || ctx.config.front.doors.material;
    var solid = defaults.material(doorMaterialId).category === 'solid';
    var doorEdges = solid ? [] : ['left', 'right', 'top', 'bottom'];

    var panelMaterial = defaults.material(cfg.panelMaterial);
    var panelEdges = [];

    if (!frame) {
      var o = frontOrientation(doorBox, 'Front face');
      var part = addPart(ctx, {
        key: opts.keyPrefix + '-slab', name: rect.h >= rect.w ? 'Door, slab (vertical grain)' : 'Door, slab',
        group: GROUPS.DOORS, materialId: doorMaterialId, thickness: thickness,
        length: o.length, width: o.width, grain: 'length',
        edges: doorEdges, edgebandId: edgeBandId, box: doorBox, view: o.view,
        cutListGroup: 'door-slab', isFront: true, frontLabel: opts.label,
        joinery: [{ id: 'slab', note: 'Solid slab door; sand and finish all faces' }]
      });
      leafParts.push(part);
      addHingeMachining(ctx, part, o, { hinges: hinges, hingeSide: hingeSide, hingeType: cfg.hingeType });
      if (opts.pull) addPullMachining(ctx, [part], { id: opts.pull.id, x: opts.pull.x, y: opts.pull.y, vertical: true });
    } else {
      var stileW = Math.min(cfg.stileWidth, rect.w / 2 - 10);
      var railW = Math.min(cfg.railWidth, rect.h / 2 - 10);
      var openingW = rect.w - 2 * stileW;
      var openingH = rect.h - 2 * railW;
      var minOpening = st.door.minFrameOpening;
      if (openingW < minOpening || openingH < minOpening) {
        // Too small to build a frame: fall back to a slab and warn honestly.
        ctx.warn('warning', 'Frame door too small for its stiles', opts.label + ' (' + round(rect.w, 1) + ' × ' + round(rect.h, 1) + ' mm) cannot take ' + round(stileW, 1) + ' mm stiles and rails; building a slab door instead.', 'door.frameSize', 'Reduce stile/rail widths or make the door larger.', leafParts.map(function (p) { return p.id; }));
        var so = frontOrientation(doorBox, 'Front face');
        var slab = addPart(ctx, {
          key: opts.keyPrefix + '-slab', name: 'Door, slab (small frame fallback)', group: GROUPS.DOORS,
          materialId: doorMaterialId, thickness: thickness, length: so.length, width: so.width,
          grain: 'length', edges: doorEdges, edgebandId: edgeBandId, box: doorBox, view: so.view,
          cutListGroup: 'door-slab', isFront: true, frontLabel: opts.label
        });
        addHingeMachining(ctx, slab, so, { hinges: hinges, hingeSide: hingeSide, hingeType: cfg.hingeType });
        leafParts.push(slab);
        if (opts.pull) addPullMachining(ctx, [slab], { id: opts.pull.id, x: opts.pull.x, y: opts.pull.y, vertical: true });
      } else {
        var grooveDepth = st.door.panelGrooveDepth;
        var joineryId = cfg.doorJoinery || 'cope-stick';
        var joineryNote = joineryId === 'cope-stick' ? 'Cope-and-stick: stub tenon and panel groove cut with matched router bits' :
          joineryId === 'mitered' ? 'Mitred frame: spline or domino reinforcement, clamp square' :
            joineryId === 'domino' ? 'Domino frame joints: 2 per corner, glue and clamp square' :
              'Dowel frame joints: 2 dowels per corner, glue and clamp square';
        var frameJoinery = [{ id: joineryId, note: joineryNote }];

        // Stiles: full height, left and right.
        var leftStileBox = makeBox(rect.x, depthY, rect.z, stileW, thickness, rect.h);
        var rightStileBox = makeBox(rect.x + rect.w - stileW, depthY, rect.z, stileW, thickness, rect.h);
        var lo = frontOrientation(leftStileBox, 'Front face');
        var ro = frontOrientation(rightStileBox, 'Front face');
        var glassRab = st.door.glassRabbet;
        function stileMach(o, isLeft) {
          var mach = [];
          if (glazed) {
            // Glass rabbet runs along the inner edge of the stile.
            var innerPhysical = isLeft ? 'right' : 'left';
            var edge = o.edgeToDrawing(innerPhysical, 'B');
            if (edge) mach.push(rabbet('B', edge, glassRab.width, glassRab.depth, 'glass-rabbet', 'Glass rabbet'));
          }
          return mach;
        }
        var leftStile = addPart(ctx, {
          key: opts.keyPrefix + '-stile-left', name: 'Door stile, left' + (hingeSide === 'left' ? ' (hinge side)' : ''),
          group: GROUPS.DOORS, materialId: doorMaterialId, thickness: thickness,
          length: lo.length, width: lo.width, grain: 'length', edges: solid ? [] : ['left', 'right', 'top', 'bottom'],
          edgebandId: edgeBandId, box: leftStileBox, view: lo.view, cutListGroup: 'door-stile',
          joinery: frameJoinery, isFront: true, frontLabel: opts.label, machining: stileMach(lo, true)
        });
        var rightStile = addPart(ctx, {
          key: opts.keyPrefix + '-stile-right', name: 'Door stile, right' + (hingeSide === 'right' ? ' (hinge side)' : ''),
          group: GROUPS.DOORS, materialId: doorMaterialId, thickness: thickness,
          length: ro.length, width: ro.width, grain: 'length', edges: solid ? [] : ['left', 'right', 'top', 'bottom'],
          edgebandId: edgeBandId, box: rightStileBox, view: ro.view, cutListGroup: 'door-stile',
          joinery: frameJoinery, isFront: true, frontLabel: opts.label, machining: stileMach(ro, false)
        });
        // Rails: between the stiles.
        var railBoxBottom = makeBox(rect.x + stileW, depthY, rect.z, openingW, thickness, railW);
        var railBoxTop = makeBox(rect.x + stileW, depthY, rect.z + rect.h - railW, openingW, thickness, railW);
        var bo = frontOrientation(railBoxBottom, 'Front face');
        var to = frontOrientation(railBoxTop, 'Front face');
        function railMach(o, isTopRail) {
          var mach = [];
          if (glazed) {
            var innerPhysical = isTopRail ? 'bottom' : 'top';
            var edge = o.edgeToDrawing(innerPhysical, 'B');
            if (edge) mach.push(rabbet('B', edge, glassRab.width, glassRab.depth, 'glass-rabbet', 'Glass rabbet'));
          }
          return mach;
        }
        var tenon = (ctx.standards.doorFrame && num(ctx.standards.doorFrame.tenonLength, 11)) || 11;
        var railLen = round(openingW + (joineryId === 'cope-stick' ? 2 * tenon : 0), 2);
        var railNotes = joineryId === 'cope-stick' ? ['Rail blank includes a ' + round(tenon, 1) + ' mm stub tenon each end'] : [];
        var railBottom = addPart(ctx, {
          key: opts.keyPrefix + '-rail-bottom', name: 'Door bottom rail', group: GROUPS.DOORS,
          materialId: doorMaterialId, thickness: thickness, length: railLen, width: bo.width,
          notes: railNotes,
          grain: 'length', edges: solid ? [] : ['top', 'bottom'], edgebandId: edgeBandId,
          box: railBoxBottom, view: bo.view, cutListGroup: 'door-rail', joinery: frameJoinery,
          isFront: true, frontLabel: opts.label, machining: railMach(bo, false)
        });
        var railTop = addPart(ctx, {
          key: opts.keyPrefix + '-rail-top', name: 'Door top rail', group: GROUPS.DOORS,
          materialId: doorMaterialId, thickness: thickness, length: railLen, width: to.width,
          notes: railNotes,
          grain: 'length', edges: solid ? [] : ['top', 'bottom'], edgebandId: edgeBandId,
          box: railBoxTop, view: to.view, cutListGroup: 'door-rail', joinery: frameJoinery,
          isFront: true, frontLabel: opts.label, machining: railMach(to, true)
        });
        leafParts.push(leftStile, rightStile, railBottom, railTop);

        // Panel (or glass), captured 10 mm into the frame.
        // Panel blank = opening + 2 x groove depth - 2 x float per side (expansion allowance).
        var floatPerSide = clamp(num(cfg.panelFloat, 2), 0, 6);
        var panelH = openingH + 2 * grooveDepth - 2 * floatPerSide;
        var panelW = openingW + 2 * grooveDepth - 2 * floatPerSide;
        if (glazed) {
          var glassTh = cfg.glassThickness;
          var glassY = depthY + (thickness - glassTh) / 2;
          var glassBox = makeBox(rect.x + stileW - glassRab.width, glassY, rect.z + railW - glassRab.width, openingW + 2 * glassRab.width, glassTh, openingH + 2 * glassRab.width);
          var go = orient({ normal: [0, 1, 0], box: glassBox, faceA: 'Front face' });
          var glassPart = addPart(ctx, {
            key: opts.keyPrefix + '-glass', name: 'Glass pane ' + glassTh + ' mm', group: GROUPS.DOORS,
            materialId: 'glass-3', thickness: glassTh, length: go.length, width: go.width,
            grain: 'none', edges: [], box: glassBox, view: go.view, cutListGroup: 'door-glass',
            isFront: true, frontLabel: opts.label,
            notes: ['Tempered or laminated glass as required; sit in the rabbet on a thin glazing tape']
          });
          leafParts.push(glassPart);
          var muntinCount = style === 'mullion-glass' ? clamp(Math.round(cfg.muntins), 1, 6) : clamp(Math.round(cfg.muntins), 0, 6);
          if (muntinCount > 0) {
            var muntinW = Math.max(12, Math.round(st.faceFrame.midRailWidth / 3));
            for (var mi = 0; mi < muntinCount; mi++) {
              var mx = rect.x + stileW - glassRab.width + ((mi + 1) * (openingW + 2 * glassRab.width)) / (muntinCount + 1) - muntinW / 2;
              var mb = makeBox(mx, depthY, rect.z + railW - glassRab.width, muntinW, thickness, openingH + 2 * glassRab.width);
              var mo = frontOrientation(mb, 'Front face');
              var muntin = addPart(ctx, {
                key: opts.keyPrefix + '-muntin-' + (mi + 1), name: 'Muntin bar ' + (mi + 1), group: GROUPS.DOORS,
                materialId: doorMaterialId, thickness: thickness, length: mo.length, width: mo.width,
                grain: 'length', edges: solid ? [] : ['left', 'right', 'top', 'bottom'], edgebandId: edgeBandId,
                box: mb, view: mo.view, cutListGroup: 'door-muntin', isFront: true, frontLabel: opts.label,
                notes: ['Muntins are applied over the glass; miter or cope the intersections']
              });
              leafParts.push(muntin);
            }
          }
        } else {
          var panelMaterialInfo = defaults.material(cfg.panelMaterial);
          var solidPanel = panelMaterialInfo.category === 'solid';
          var panelTh = solidPanel
            ? round(panelMaterialInfo.thickness, 2)
            : resolveSheetThickness(ctx, cfg.panelMaterial, cfg.panelThickness);
          var panelStyle = cfg.panelStyle;
          var panelY = depthY + (panelStyle === 'raised' ? (thickness - panelTh) / 2 : 0);
          if (panelStyle === 'flat' || panelStyle === 'beadboard') panelY = depthY + (thickness - panelTh) / 2;
          var panelBox = makeBox(rect.x + stileW - grooveDepth, panelY, rect.z + railW - grooveDepth, panelW, panelTh, panelH);
          var po = orient({ normal: [0, 1, 0], box: panelBox, faceA: 'Front face' });
          var panelNotes = ['Floating panel: ' + round(st.door.panelFloat, 1) + ' mm float all round; do not glue the panel'];
          if (solidPanel) panelNotes.push('Solid ' + round(panelTh, 1) + ' mm panel blank; raise the field / machine the edge tongue to suit the frame groove');
          if (panelStyle === 'raised') panelNotes.push('Raised panel: field raised to sit proud of the frame');
          if (panelStyle === 'beadboard') panelNotes.push('Beadboard: ' + round(cfg.beadSpacing, 1) + ' mm bead spacing');
          var panelPart = addPart(ctx, {
            key: opts.keyPrefix + '-panel', name: 'Door panel' + (panelStyle && panelStyle !== 'recessed' ? ' (' + panelStyle + ')' : ''),
            group: GROUPS.DOORS, materialId: cfg.panelMaterial, thickness: panelTh,
            length: po.length, width: po.width, grain: 'length',
            edges: [], edgebandId: 'none', box: panelBox, view: po.view,
            cutListGroup: 'door-panel', isFront: true, frontLabel: opts.label,
            notes: panelNotes, joinery: [{ id: 'floating-panel', note: panelStyle + ' panel, ' + round(st.door.panelFloat, 1) + ' mm float' }]
          });
          leafParts.push(panelPart);
        }
        // Hinges are bored into the hinge-side stile of a frame door.
        var hingePart = hingeSide === 'left' ? leftStile : rightStile;
        var hingeO = hingeSide === 'left' ? lo : ro;
        addHingeMachining(ctx, hingePart, hingeO, { hinges: hinges, hingeSide: hingeSide, hingeType: cfg.hingeType });
        if (opts.pull) {
          var pullTargets = [];
          for (var t = 0; t < leafParts.length; t++) {
            if (leafParts[t].cutListGroup === 'door-stile' || leafParts[t].cutListGroup === 'door-rail') pullTargets.push(leafParts[t]);
          }
          addPullMachining(ctx, pullTargets, { id: opts.pull.id, x: opts.pull.x, y: opts.pull.y, vertical: true });
        }
      }
    }

    return {
      label: opts.label,
      kind: 'door',
      rect: { x: rect.x, z: rect.z, w: rect.w, h: rect.h },
      hingeSide: hingeSide,
      hingeCount: hingeCount,
      hingePositions: hinges,
      hingeCups: hingeTypeIsCup(cfg.hingeType) ? hinges.map(function (hz) { return { z: rect.z + hz, side: hingeSide, label: opts.label }; }) : [],
      style: style,
      overlay: overlay,
      thickness: thickness,
      partIds: leafParts.map(function (p) { return p.id; }),
      parts: leafParts
    };
  }

  function hingeTypeIsCup(t) { return t === 'euro-cup'; }
  function isFiniteDepth(v) { return typeof v === 'number' && isFinite(v); }

  /**
   * Build one drawer front (slab or frame-and-panel like a door, without hinge boring).
   * @returns {Object} front summary
   */
  function buildDrawerFront(ctx, opts) {
    var cfg = opts.drawers;
    var rect = opts.rect;
    var st = ctx.standards;
    var thickness = opts.thickness || cfg.thickness;
    var depthY = opts.depthY;
    var box = makeBox(rect.x, depthY, rect.z, rect.w, thickness, rect.h);
    var style = cfg.style;
    var doorMaterialId = cfg.material || cfg.materialId || ctx.config.front.doors.material;
    var solid = defaults.material(doorMaterialId).category === 'solid';
    var edges = solid ? [] : ['left', 'right', 'top', 'bottom'];
    var parts = [];
    var o = frontOrientation(box, 'Front face');
    var frame = style === 'shaker' || style === 'raised-panel';
    if (frame) {
      var sharedStile = (ctx.config.front.doors && ctx.config.front.doors.stileWidth) || st.door.stileWidth;
      var sharedRail = (ctx.config.front.doors && ctx.config.front.doors.railWidth) || st.door.railWidth;
      var stileW = Math.min(sharedStile, rect.w / 2 - 10);
      var railW = Math.min(sharedRail, rect.h / 2 - 10);
      var openingW = rect.w - 2 * stileW;
      var openingH = rect.h - 2 * railW;
      if (openingW < st.door.minFrameOpening || openingH < st.door.minFrameOpening) {
        ctx.warn('info', 'Shaker drawer front built as slab', opts.label + ' is too small for a frame; a slab front was generated.', 'drawer.frameSize', 'Use a slab front or increase the drawer height.', []);
        frame = false;
      }
    }
    if (!frame) {
      var slab = addPart(ctx, {
        key: opts.keyPrefix + '-slab', name: 'Drawer front, slab', group: GROUPS.DRAWERS,
        materialId: doorMaterialId, thickness: thickness, length: o.length, width: o.width,
        grain: 'length', edges: edges, edgebandId: ctx.config.construction.edgeBanding, box: box,
        view: o.view, cutListGroup: 'drawer-front', isFront: true, frontLabel: opts.label,
        joinery: [{ id: 'slab', note: 'Slab drawer front; sand and finish' }]
      });
      parts.push(slab);
      if (opts.pull) addPullMachining(ctx, [slab], { id: opts.pull.id, x: opts.pull.x, y: opts.pull.y, vertical: false });
    } else {
      var sharedStile2 = (ctx.config.front.doors && ctx.config.front.doors.stileWidth) || st.door.stileWidth;
      var sharedRail2 = (ctx.config.front.doors && ctx.config.front.doors.railWidth) || st.door.railWidth;
      var sW = Math.min(sharedStile2, rect.w / 2 - 10);
      var rW = Math.min(sharedRail2, rect.h / 2 - 10);
      var opW = rect.w - 2 * sW;
      var opH = rect.h - 2 * rW;
      var grooveDepth = st.door.panelGrooveDepth;
      var raise = style === 'raised-panel';
      var dfPanelMaterialId = cfg.panelMaterial || ctx.config.front.doors.panelMaterial || 'ply-birch-6';
      var dfPanelMat = defaults.material(dfPanelMaterialId);
      var dfSolidPanel = dfPanelMat.category === 'solid';
      var panelTh = dfSolidPanel
        ? round(dfPanelMat.thickness, 2)
        : resolveSheetThickness(ctx, dfPanelMaterialId, cfg.panelThickness || ctx.config.front.doors.panelThickness || st.door.panelThickness);
      var leftBox = makeBox(rect.x, depthY, rect.z, sW, thickness, rect.h);
      var rightBox = makeBox(rect.x + rect.w - sW, depthY, rect.z, sW, thickness, rect.h);
      var lo = frontOrientation(leftBox, 'Front face');
      var ro = frontOrientation(rightBox, 'Front face');
      var bottomRailBox = makeBox(rect.x + sW, depthY, rect.z, opW, thickness, rW);
      var topRailBox = makeBox(rect.x + sW, depthY, rect.z + rect.h - rW, opW, thickness, rW);
      var bo = frontOrientation(bottomRailBox, 'Front face');
      var to = frontOrientation(topRailBox, 'Front face');
      var joinery = [{ id: 'applied-moulding', note: 'Frame front: cope-and-stick or applied moulding; glue and clamp square' }];
      var leftStile = addPart(ctx, { key: opts.keyPrefix + '-stile-left', name: 'Drawer front stile, left', group: GROUPS.DRAWERS, materialId: doorMaterialId, thickness: thickness, length: lo.length, width: lo.width, grain: 'length', edges: solid ? [] : ['left', 'right', 'top', 'bottom'], edgebandId: ctx.config.construction.edgeBanding, box: leftBox, view: lo.view, cutListGroup: 'drawer-front-stile', isFront: true, frontLabel: opts.label, joinery: joinery });
      var rightStile = addPart(ctx, { key: opts.keyPrefix + '-stile-right', name: 'Drawer front stile, right', group: GROUPS.DRAWERS, materialId: doorMaterialId, thickness: thickness, length: ro.length, width: ro.width, grain: 'length', edges: solid ? [] : ['left', 'right', 'top', 'bottom'], edgebandId: ctx.config.construction.edgeBanding, box: rightBox, view: ro.view, cutListGroup: 'drawer-front-stile', isFront: true, frontLabel: opts.label, joinery: joinery });
      var bottomRail = addPart(ctx, { key: opts.keyPrefix + '-rail-bottom', name: 'Drawer front bottom rail', group: GROUPS.DRAWERS, materialId: doorMaterialId, thickness: thickness, length: bo.length, width: bo.width, grain: 'length', edges: solid ? [] : ['left', 'right', 'top', 'bottom'], edgebandId: ctx.config.construction.edgeBanding, box: bottomRailBox, view: bo.view, cutListGroup: 'drawer-front-rail', isFront: true, frontLabel: opts.label, joinery: joinery });
      var topRail = addPart(ctx, { key: opts.keyPrefix + '-rail-top', name: 'Drawer front top rail', group: GROUPS.DRAWERS, materialId: doorMaterialId, thickness: thickness, length: to.length, width: to.width, grain: 'length', edges: solid ? [] : ['left', 'right', 'top', 'bottom'], edgebandId: ctx.config.construction.edgeBanding, box: topRailBox, view: to.view, cutListGroup: 'drawer-front-rail', isFront: true, frontLabel: opts.label, joinery: joinery });
      var panelY = depthY + (raise ? (thickness - panelTh) / 2 : 0);
      var dfFloat = clamp(num(ctx.standards.door.panelFloat, 2), 0, 6);
      var panelBox = makeBox(rect.x + sW - grooveDepth, panelY, rect.z + rW - grooveDepth,
        opW + 2 * grooveDepth - 2 * dfFloat, panelTh, opH + 2 * grooveDepth - 2 * dfFloat);
      var po = orient({ normal: [0, 1, 0], box: panelBox, faceA: 'Front face' });
      var panel = addPart(ctx, {
        key: opts.keyPrefix + '-panel', name: 'Drawer front panel' + (raise ? ' (raised)' : ''), group: GROUPS.DRAWERS,
        materialId: dfPanelMaterialId, thickness: panelTh, length: po.length, width: po.width,
        grain: 'length', edges: [], edgebandId: 'none', box: panelBox, view: po.view,
        cutListGroup: 'drawer-front-panel', isFront: true, frontLabel: opts.label,
        notes: ['Floating panel: ' + round(st.door.panelFloat, 1) + ' mm float all round'].concat(dfSolidPanel ? ['Solid ' + round(panelTh, 1) + ' mm panel blank; machine the edge tongue to suit the frame groove'] : [])
      });
      parts.push(leftStile, rightStile, bottomRail, topRail, panel);
      if (opts.pull) {
        addPullMachining(ctx, [leftStile, rightStile, topRail, bottomRail], { id: opts.pull.id, x: opts.pull.x, y: opts.pull.y, vertical: false });
      }
    }
    return {
      label: opts.label,
      kind: 'drawer-front',
      rect: { x: rect.x, z: rect.z, w: rect.w, h: rect.h },
      style: style,
      thickness: thickness,
      partIds: parts.map(function (p) { return p.id; }),
      parts: parts
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Face frame
  // ---------------------------------------------------------------------------------------------

  /**
   * Build face-frame members.
   * @param {Object} ctx
   * @param {Object} opts {width, boxBottom, boxTop, frameY (y of carcass front), thickness,
   *                       stiles {left,right}, rails [{z0,h}] (top/bottom/mid rails in cabinet z),
   *                       railWidths {top,bottom,mid}}
   */
  function buildFaceFrame(ctx, opts) {
    var cfg = ctx.config.faceFrame;
    var width = opts.width;
    var stileW = Math.min(cfg.stileWidth, width / 2 - 10);
    var frameY = opts.frameY;
    var t = cfg.thickness;
    var boxBottom = opts.boxBottom;
    var boxTop = opts.boxTop;
    var members = [];
    var parts = [];
    var joinery = [{ id: cfg.joinery, note: faceFrameJoineryNote(cfg.joinery) }];

    function member(name, x, z, w, h, orientation, key) {
      var memberRecord = { name: name, x: round(x, 2), y: round(z, 2), w: round(w, 2), h: round(h, 2), orientation: orientation, partKey: key };
      members.push(memberRecord);
      var box = makeBox(x, frameY, z, w, t, h);
      var o = frontOrientation(box, 'Front face');
      var mach = [];
      // Pocket-screw holes on the back face near each glued end.
      if (cfg.joinery === 'pocket-screw') {
        var holes = [];
        if (orientation === 'v') {
          // Stiles join rails across their width; two holes per rail joint.
          var railZs = opts.railCentres || [];
          for (var i = 0; i < railZs.length; i++) {
            for (var k = 0; k < 2; k++) {
              holes.push({ x: round(stileW / 2 + (k === 0 ? -12 : 12), 2), z: railZs[i] });
            }
          }
        } else {
          // Rails join stiles at each end; two holes near each end.
          var ends = [x + 30, x + 60, x + w - 60, x + w - 30];
          for (var e = 0; e < ends.length; e++) holes.push({ x: round(ends[e], 2), z: z + h / 2 });
        }
        for (var hI = 0; hI < holes.length; hI++) {
          var hp = holes[hI];
          if (hp.x < box.x + 2 || hp.x > box.x + box.w - 2) continue;
          var a = o.onFaceB({ x: hp.x, y: box.y + box.d / 2, z: hp.z });
          mach.push(hole('B', a.x, a.y, 10, Math.min(20, t), 'pocket-screw', '15° pocket, ' + cfg.joinery));
        }
      } else if (cfg.joinery === 'dowel') {
        var dw = [];
        if (orientation === 'v') dw = [{ z: boxBottom + cfg.bottomRailWidth / 2 }, { z: boxTop - cfg.topRailWidth / 2 }];
        else dw = [{ x: x + 30 }, { x: x + w - 30 }];
        for (var d = 0; d < dw.length; d++) {
          var pt = dw[d];
          var a2 = o.onFaceB({ x: pt.x !== undefined ? pt.x : box.x + box.w / 2, y: box.y + box.d / 2, z: pt.z !== undefined ? pt.z : box.z + box.h / 2 });
          mach.push(hole('B', a2.x, a2.y, 8, 18, 'dowel', '8 mm dowel'));
        }
      }
      var part = addPart(ctx, {
        key: key, name: name, group: GROUPS.FACE_FRAME,
        materialId: cfg.material, thickness: t, length: o.length, width: o.width,
        grain: 'length', edges: [], edgebandId: 'none', box: box, view: o.view,
        cutListGroup: 'face-frame-' + orientation, machining: mach, joinery: joinery,
        isFront: true, frontLabel: null
      });
      parts.push(part);
      return part;
    }

    var boxH = boxTop - boxBottom;
    // Vertical stiles, full height.
    member('Face frame, left stile', 0, boxBottom, stileW, boxH, 'v', 'ff-stile-left');
    member('Face frame, right stile', width - stileW, boxBottom, stileW, boxH, 'v', 'ff-stile-right');
    // Horizontal rails between stiles.
    var railCentres = [];
    for (var r = 0; r < opts.rails.length; r++) {
      var rail = opts.rails[r];
      var railName = rail.name || (rail.role === 'top' ? 'Face frame, top rail' : rail.role === 'bottom' ? 'Face frame, bottom rail' : 'Face frame, mid rail');
      member(railName, stileW, rail.z0, width - 2 * stileW, rail.h, 'h', 'ff-rail-' + (rail.role || r));
      railCentres.push(rail.z0 + rail.h / 2);
    }
    return { members: members, parts: parts, railCentres: railCentres, stileWidth: stileW };
  }

  function faceFrameJoineryNote(id) {
    switch (id) {
      case 'pocket-screw': return 'Pocket screws: 2 per joint on the back face, glue the joint';
      case 'biscuit': return 'Biscuits: 2 per joint, glue and clamp';
      case 'dowel': return 'Dowels: 2 per joint, glue and clamp';
      case 'mortise-tenon': return 'Mortise-and-tenon: 1 per joint, glued and pinned';
      default: return 'Glue and clamp; reinforce as required';
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Drawer box
  // ---------------------------------------------------------------------------------------------

  /**
   * Build a complete drawer box (2 sides, front, back, bottom) for one drawer.
   *
   * @param {Object} ctx
   * @param {Object} opts
   *   box {x (cabinet x of box left), y (cabinet y of box front), z (cabinet z of box bottom),
   *        width, height, depth} physical outer dims
   *   slide, joinery, bottomJoinery, sideThickness, bottomThickness, label, hardware
   * @returns {Object} box summary
   */
  function buildDrawerBox(ctx, opts) {
    var b = opts.box;
    var sideT = opts.sideThickness;
    var botT = resolveSheetThickness(ctx, opts.bottomMaterial || 'ply-birch-6', opts.bottomThickness);
    var st = ctx.standards;
    var material = opts.materialId;
    var parts = [];
    var label = opts.label;
    var group = GROUPS.DRAWERS;
    var bottomMaterial = opts.bottomMaterial || (st.drawer && st.drawer.bottomMaterial) || 'ply-birch-6';
    var joinery = [{ id: opts.joinery, note: drawerJoineryNote(opts.joinery) }];
    var bottomInset = st.drawer.boxBottomInset;
    var grooveDepth = Math.min(st.drawer.boxBottomDadoDepth, sideT / 2);
    var grooveWidth = botT;
    var bottomZ = b.z + bottomInset;
    var grooveZ = bottomZ + botT / 2; // centreline of the drawer-bottom dado
    var outerW = b.width - 2 * sideT;
    var innerDepth = b.depth - 2 * sideT;

    // ---- sides (inside faces are face A, so the dado and the slide notch are visible) ----
    var sideBoxLeft = makeBox(b.x, b.y - b.depth, b.z, sideT, b.depth, b.height);
    var sideBoxRight = makeBox(b.x + b.width - sideT, b.y - b.depth, b.z, sideT, b.depth, b.height);
    var oLeft = orient({ normal: [1, 0, 0], box: sideBoxLeft, faceA: 'Inside face' });
    var oRight = orient({ normal: [-1, 0, 0], box: sideBoxRight, faceA: 'Inside face' });
    function sideMach(o, innerX) {
      var mach = [];
      var p1 = o.at({ x: innerX, y: b.y - b.depth + sideT, z: grooveZ });
      var p2 = o.at({ x: innerX, y: b.y - sideT, z: grooveZ });
      mach.push(groove('A', Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.max(p1.x, p2.x), Math.max(p1.y, p2.y), grooveWidth, grooveDepth, 'drawer-bottom', 'Drawer bottom dado, ' + round(bottomInset, 1) + ' mm up from box bottom'));
      if (opts.slide === 'undermount') {
        var n = st.drawer.undermountNotch;
        var cornerPt = o.at({ x: innerX, y: b.y - b.depth, z: b.z });
        var corner = (cornerPt.y < o.width / 2 ? 'b' : 't') + (cornerPt.x < o.length / 2 ? 'l' : 'r');
        mach.push(notch('A', corner, n.width, n.height, 'slide', 'Undermount slide relief notch at rear of box'));
      }
      return mach;
    }
    function sideSlideHoles(o, boxForSide, isLeft) {
      if (opts.slide !== 'side-mount') return [];
      var holes = [];
      var depthOffsets = [70, Math.max(150, b.depth - 90)];
      var zc = b.z + b.height / 2;
      var outerX = isLeft ? b.x : b.x + b.width;
      for (var s2 = 0; s2 < depthOffsets.length; s2++) {
        var q = o.onFaceB({ x: outerX, y: b.y - depthOffsets[s2], z: zc });
        holes.push(hole('B', q.x, q.y, 4, 10, 'slide', 'Side-mount slide screw into the box side'));
      }
      return holes;
    }
    var leftSide = addPart(ctx, {
      key: opts.keyPrefix + '-side-left', name: 'Drawer box side, left', group: group,
      materialId: material, thickness: sideT, length: oLeft.length, width: oLeft.width,
      grain: 'length', edges: ['top'], edgebandId: 'pvc-0.5', box: sideBoxLeft, view: oLeft.view,
      cutListGroup: 'drawer-side', machining: sideMach(oLeft, b.x + sideT).concat(sideSlideHoles(oLeft, sideBoxLeft, true)), joinery: joinery
    });
    var rightSide = addPart(ctx, {
      key: opts.keyPrefix + '-side-right', name: 'Drawer box side, right', group: group,
      materialId: material, thickness: sideT, length: oRight.length, width: oRight.width,
      grain: 'length', edges: ['top'], edgebandId: 'pvc-0.5', box: sideBoxRight, view: oRight.view,
      cutListGroup: 'drawer-side', machining: sideMach(oRight, b.x + b.width - sideT).concat(sideSlideHoles(oRight, sideBoxRight, false)), joinery: joinery
    });
    parts.push(leftSide, rightSide);

    // ---- front and back between the sides ----
    var frontBox = makeBox(b.x + sideT, b.y - sideT, b.z, outerW, sideT, b.height);
    var backBox = makeBox(b.x + sideT, b.y - b.depth, b.z, outerW, sideT, b.height);
    var oFront = orient({ normal: [0, -1, 0], box: frontBox, faceA: 'Inside face' });
    var oBack = orient({ normal: [0, 1, 0], box: backBox, faceA: 'Inside face' });
    function endMach(o, pieceBox) {
      var mach = [];
      if (opts.bottomJoinery === 'dado') {
        var p1 = o.at({ x: pieceBox.x, y: pieceBox.y + pieceBox.d / 2, z: grooveZ });
        var p2 = o.at({ x: pieceBox.x + pieceBox.w, y: pieceBox.y + pieceBox.d / 2, z: grooveZ });
        mach.push(groove('A', Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.max(p1.x, p2.x), Math.max(p1.y, p2.y), grooveWidth, grooveDepth, 'drawer-bottom', 'Drawer bottom dado'));
      } else {
        var edge = o.edgeToDrawing('bottom', 'A') || 'bottom';
        mach.push(rabbet('A', edge, Math.min(botT, o.length), sideT / 2, 'drawer-bottom', 'Drawer bottom rabbet'));
      }
      return mach;
    }
    var frontPart = addPart(ctx, {
      key: opts.keyPrefix + '-box-front', name: 'Drawer box front', group: group, materialId: material,
      thickness: sideT, length: oFront.length, width: oFront.width, grain: 'length',
      edges: ['top'], edgebandId: 'pvc-0.5', box: frontBox, view: oFront.view,
      cutListGroup: 'drawer-front-panel', machining: endMach(oFront, frontBox), joinery: joinery
    });
    var backPart = addPart(ctx, {
      key: opts.keyPrefix + '-box-back', name: 'Drawer box back', group: group, materialId: material,
      thickness: sideT, length: oBack.length, width: oBack.width, grain: 'length',
      edges: ['top'], edgebandId: 'pvc-0.5', box: backBox, view: oBack.view,
      cutListGroup: 'drawer-back', machining: endMach(oBack, backBox), joinery: joinery
    });
    parts.push(frontPart, backPart);

    // ---- bottom, captured in the side/front/back grooves ----
    var bottomW = outerW + 2 * grooveDepth;
    var bottomD = innerDepth + 2 * grooveDepth;
    var bottomBox = makeBox(
      b.x + sideT - grooveDepth,
      b.y - b.depth + sideT - grooveDepth,
      bottomZ, bottomW, bottomD, botT
    );
    var oBottom = orient({ normal: [0, 0, 1], box: bottomBox, faceA: 'Top face' });
    var bottomPart = addPart(ctx, {
      key: opts.keyPrefix + '-bottom', name: 'Drawer bottom', group: group, materialId: bottomMaterial,
      thickness: botT, length: oBottom.length, width: oBottom.width, grain: 'length',
      edges: [], edgebandId: 'none', box: bottomBox, view: oBottom.view,
      cutListGroup: 'drawer-bottom', joinery: [{ id: opts.bottomJoinery, note: opts.bottomJoinery === 'dado' ? 'Drawer bottom in 6 mm dado' : 'Drawer bottom in rabbet' }]
    });
    parts.push(bottomPart);

    if (opts.addHardware) {
      var slideTpl = opts.slide === 'undermount' ? 'slide-undermount-softclose' : opts.slide === 'side-mount' ? 'slide-side-mount' : 'slide-center-mount';
      ctx.addHardware(slideTpl, 1, parts.map(function (p) { return p.id; }), 'For drawer ' + label);
    }

    return {
      label: label,
      parts: parts,
      partIds: parts.map(function (p) { return p.id; }),
      box: { x: round(b.x, 2), y: round(b.y, 2), z: round(b.z, 2), w: round(b.width, 2), d: round(b.depth, 2), h: round(b.height, 2) },
      sideLeftId: leftSide.id,
      sideRightId: rightSide.id,
      bottomId: bottomPart.id
    };
  }

  function drawerJoineryNote(id) {
    switch (id) {
      case 'dovetail': return 'Half-blind dovetails: tails on sides, pins on front/back; glue only, no fasteners';
      case 'box-joint': return 'Box joint (finger joint): 1/4" fingers; glue and clamp';
      case 'dado': return 'Dado and rabbet box: glue and brad the joints';
      case 'butt-screw': return 'Butt joints: glue and 2 screws per joint, pre-drill';
      default: return 'Glue and clamp';
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Shelf-pin and slide machining helpers (called by cabinet.js after carcass/parts exist)
  // ---------------------------------------------------------------------------------------------

  /**
   * Drill the System-32 pin-hole rows in a side panel.
   * Two rows: front row `frontSetback` from the front edge, rear row `rearSetback` from the back.
   * Holes run from the first hole above the box bottom to the top of the adjustable-shelf zone.
   */
  function addShelfPinHoles(ctx, sideLeft, sideRight, dims, opts) {
    var c = ctx.config.construction;
    var st = ctx.standards;
    var pin = st.shelf;
    if (opts.system === 'none' || opts.system === 'fixed-dado') return 0;
    if (opts.adjustableCount <= 0) return 0;
    var spacing = c.shelfPinSpacing || pin.pinSpacing;
    var diameter = c.shelfPinDiameter || pin.pinDiameter;
    var depth = pin.pinDepth;
    var z0 = opts.zoneBottom;
    var z1 = opts.zoneTop;
    if (!(z1 > z0 + spacing)) {
      ctx.warn('warning', 'No room for shelf pin holes', 'The adjustable shelf zone is too short to drill a pin row.', 'shelf.pinZone', 'Reduce fixed shelves or increase the cabinet height.', [sideLeft.id, sideRight.id]);
      return 0;
    }
    var first = z0 + Math.round((opts.pinStartOffset || 0) / spacing) * spacing;
    if (first < z0) first += spacing;
    var count = 0;
    for (var z = first; z <= z1 + 0.01; z += spacing) {
      var front = frontSetbackY(dims, c.shelfPinFrontSetback || pin.frontSetback);
      var rear = rearSetbackY(dims, c.shelfPinRearSetback || pin.rearSetback);
      var aL = orientFromPart(sideLeft).at({ x: dims.carcassLeftX, y: front, z: z });
      var aR = orientFromPart(sideRight).at({ x: dims.carcassRightX, y: front, z: z });
      sideLeft.machining.push(hole('A', aL.x, aL.y, diameter, depth, 'shelf-pin', 'System 32: ' + Math.round(spacing) + ' mm pitch, front row'));
      sideRight.machining.push(hole('A', aR.x, aR.y, diameter, depth, 'shelf-pin', 'System 32: ' + Math.round(spacing) + ' mm pitch, front row'));
      var aL2 = orientFromPart(sideLeft).at({ x: dims.carcassLeftX, y: rear, z: z });
      var aR2 = orientFromPart(sideRight).at({ x: dims.carcassRightX, y: rear, z: z });
      sideLeft.machining.push(hole('A', aL2.x, aL2.y, diameter, depth, 'shelf-pin', 'System 32: ' + Math.round(spacing) + ' mm pitch, rear row'));
      sideRight.machining.push(hole('A', aR2.x, aR2.y, diameter, depth, 'shelf-pin', 'System 32: ' + Math.round(spacing) + ' mm pitch, rear row'));
      count++;
    }
    return count;
  }

  function frontSetbackY(dims, setback) { return dims.frontY - setback; }
  function rearSetbackY(dims, setback) { return dims.rearY + setback; }

  /**
   * Mounting-plate holes for euro hinges: two 5 mm screws per hinge at the System-32 plate pattern
   * (37 mm and 69 mm behind the front edge) on the side panel interior face.
   */
  function addHingePlateHoles(ctx, sideLeft, sideRight, dims, hingeCups) {
    if (!hingeCups || hingeCups.length === 0) return;
    var st = ctx.standards;
    var cup = st.door.hingeCup;
    var spacing = 32; // System-32 mounting-plate screw pitch
    var yFrontRow = dims.frontY - cup.plateSetback; // 37 mm behind the front edge
    for (var i = 0; i < hingeCups.length; i++) {
      var h = hingeCups[i];
      var side = h.side === 'left' ? sideLeft : sideRight;
      if (!side) continue;
      var o = orientFromPart(side);
      var x = h.side === 'left' ? dims.carcassLeftX : dims.carcassRightX;
      var minZ = dims.sidePanelZ0 + 30;
      var maxZ = dims.sidePanelZ0 + dims.sidePanelHeight - 20;
      // Existing System-32 pin bores on the same 37 mm row (used to keep the plate pair off them).
      var existing = [];
      for (var e = 0; e < side.machining.length; e++) {
        var em = side.machining[e];
        if (em.type === 'hole' && em.face === 'A' && em.diameter === 5 && Math.abs(em.y - cup.plateSetback) < 0.6) {
          existing.push(em.x + dims.sidePanelZ0); // drawing x back to a cabinet z (side panels: x = z - box.z)
        }
      }
      function usablePair(z1) {
        var z2 = z1 + spacing;
        if (z1 < minZ || z2 > maxZ) return false;
        var pair = [z1, z2];
        for (var q = 0; q < pair.length; q++) {
          var nearest = null;
          for (var x2 = 0; x2 < existing.length; x2++) {
            var d = Math.abs(existing[x2] - pair[q]);
            if (nearest === null || d < nearest) nearest = d;
          }
          if (nearest !== null && nearest > 0.6 && nearest < 6) return false; // would clash with a pin bore
        }
        return true;
      }
      var desiredZ = h.z;
      var bestZ = null;
      // Candidate starts: the hinge position plus any pin-bore position that keeps the 32 mm pair.
      var candidates = [desiredZ];
      for (var c = 0; c < existing.length; c++) candidates.push(existing[c]);
      for (var c2 = 0; c2 < candidates.length; c2++) {
        if (!usablePair(candidates[c2])) continue;
        if (bestZ === null || Math.abs(candidates[c2] - desiredZ) < Math.abs(bestZ - desiredZ)) bestZ = candidates[c2];
      }
      if (bestZ === null) bestZ = clamp(desiredZ, minZ, maxZ - spacing);
      for (var k = 0; k < 2; k++) {
        var z = bestZ + k * spacing;
        var a = o.at({ x: x, y: yFrontRow, z: z });
        side.machining.push(hole('A', a.x, a.y, 5, 12, 'hinge-plate', 'Hinge plate, System 32 row 37 mm from front edge'));
      }
    }
  }

  /**
   * Mounting-plate holes for full-overlay doors on a face frame: the plate screws to the back of
   * the face-frame stile (two 5 mm holes, 32 mm apart, on the stile centreline) with a face-frame
   * adapter plate so the door closes against the frame.
   */
  function addFaceFramePlateHoles(ctx, dims, hingeCups, ffParts) {
    if (!hingeCups || hingeCups.length === 0) return;
    var leftStile = null, rightStile = null;
    for (var i = 0; i < ffParts.length; i++) {
      if (ffParts[i].key === 'ff-stile-left') leftStile = ffParts[i];
      if (ffParts[i].key === 'ff-stile-right') rightStile = ffParts[i];
    }
    var spacing = (ctx.standards.door.hingeCup && ctx.standards.door.hingeCup.plateSpacing) || 32;
    for (var h = 0; h < hingeCups.length; h++) {
      var cup = hingeCups[h];
      var stile = cup.side === 'left' ? leftStile : rightStile;
      if (!stile) continue;
      var o = orientFromPart(stile);
      var xPhys = stile.box.x + stile.box.w / 2;
      var zs = [cup.z, cup.z + spacing];
      for (var k = 0; k < zs.length; k++) {
        if (zs[k] < stile.box.z + 20 || zs[k] > stile.box.z + stile.box.h - 20) continue;
        var q = o.onFaceB({ x: xPhys, y: stile.box.y, z: zs[k] });
        stile.machining.push(hole('B', q.x, q.y, 5, 12, 'hinge-plate', 'Face-frame mounting plate, 32 mm screw spacing'));
      }
    }
  }

  /** Slide screw holes: side-mount on the sides, undermount/center-mount on the bottom panel. */
  function addSlideHoles(ctx, dims, slide, drawerInfos, parts) {
    var bottom = byKey(ctx, 'bottom');
    var sideLeft = byKey(ctx, 'side-left');
    var sideRight = byKey(ctx, 'side-right');
    if (slide === 'side-mount' && sideLeft && sideRight) {
      for (var i = 0; i < drawerInfos.length; i++) {
        var d = drawerInfos[i];
        var z = d.boxZ + Math.min(60, d.boxH / 2);
        // Keep the slide screws clear of the 37 mm shelf-pin row so the two do not share a bore.
        var offsets = [70, 270, 470];
        for (var k = 0; k < offsets.length; k++) {
          var yPhys = Math.max(dims.frontY - offsets[k], dims.rearY + 20);
          var oL = orientFromPart(sideLeft).at({ x: dims.carcassLeftX, y: yPhys, z: z });
          var oR = orientFromPart(sideRight).at({ x: dims.carcassRightX, y: yPhys, z: z });
          sideLeft.machining.push(hole('A', oL.x, oL.y, 4, 10, 'slide', 'Side-mount slide screw'));
          sideRight.machining.push(hole('A', oR.x, oR.y, 4, 10, 'slide', 'Side-mount slide screw'));
        }
      }
      return;
    }
    if (!bottom) return;
    var o = orientFromPart(bottom);
    for (var j = 0; j < drawerInfos.length; j++) {
      var dd = drawerInfos[j];
      if (slide === 'center-mount') {
        var cx = dims.carcassLeftX + dims.interiorWidth / 2;
        var yc = Math.max(dd.boxY0 + 60, dims.rearY + 40);
        var pc = o.at({ x: cx, y: yc, z: dims.boxBottomZ + dims.bottomThickness / 2 });
        bottom.machining.push(hole('A', pc.x, pc.y, 4, 10, 'slide', 'Center-mount slide track screw'));
        continue;
      }
      // Undermount: two brackets per side of the drawer box.
      var xs = [dd.boxX0 + 20, dd.boxX0 + dd.boxW - 20];
      var ys = [Math.max(dd.boxY0 + 25, dims.rearY + 25), Math.max(dd.boxY0 + 200, dims.rearY + 60)];
      for (var s = 0; s < xs.length; s++) {
        for (var t = 0; t < ys.length; t++) {
          var pt = o.at({ x: xs[s], y: ys[t], z: dims.boxBottomZ + dims.bottomThickness / 2 });
          bottom.machining.push(hole('A', pt.x, pt.y, 4, 10, 'slide', 'Undermount slide bracket screw'));
        }
      }
    }
  }

  /**
   * Final pass: re-validate every part's machining against the finished part dimensions, clamp
   * coordinates, drop anything meaningless and de-duplicate coincident holes. This guarantees the
   * engine never emits NaN or out-of-part machining even when builders push raw records.
   *
   * @param {Object} ctx build context
   * @returns {{partCount:number, machiningCount:number}}
   */
  function finaliseParts(ctx) {
    var machiningCount = 0;
    for (var i = 0; i < ctx.parts.length; i++) {
      var part = ctx.parts[i];
      var cleaned = [];
      var seen = {};
      for (var j = 0; j < part.machining.length; j++) {
        var out = cleanMachining(part, part.machining[j], ctx);
        var list = Array.isArray(out) ? out : (out ? [out] : []);
        for (var k = 0; k < list.length; k++) {
          var item = roundMach(list[k]);
          // Holes are de-duplicated on a 0.1 mm grid: hinge plates deliberately reuse the
          // System-32 shelf-pin holes, and rounding must not keep two records for one bore.
          var key = item.type === 'hole'
            ? ['hole', item.face, round(item.x, 1), round(item.y, 1), round(item.diameter, 1), item.through].join('|')
            : [item.type, item.face, item.x, item.y, item.x1, item.y1, item.x2, item.y2, item.edge, item.corner, item.width, item.height, item.depth, item.purpose].join('|');
          if (seen[key]) continue;
          seen[key] = 1;
          cleaned.push(item);
        }
      }
      part.machining = cleaned;
      machiningCount += cleaned.length;
      // Belt and braces: dimensions must be finite and positive.
      if (!isFinitePositive(part.length) || !isFinitePositive(part.width) || !isFinitePositive(part.thickness)) {
        ctx.warn('error', 'Part dimension invalid', part.name + ' had a non-positive dimension and was skipped.', 'part.dimension', 'Report this cabinet configuration so the generator can be fixed.', [part.id]);
      }
    }
    return { partCount: ctx.parts.length, machiningCount: machiningCount };
  }

  var api = {
    GROUPS: GROUPS,
    EDGE_NAMES: EDGE_NAMES,
    EDGE_OPPOSITE: EDGE_OPPOSITE,
    DIRS: DIRS,

    createContext: createContext,
    finaliseHardware: finaliseHardware,
    addPart: addPart,
    byKey: byKey,

    orient: orient,
    orientFromPart: orientFromPart,
    makeBox: makeBox,
    boxesOverlap: boxesOverlap,
    overlapVolume: overlapVolume,

    hole: hole,
    throughHole: throughHole,
    groove: groove,
    rabbet: rabbet,
    notch: notch,
    edgeband: edgeband,
    edgebandLength: edgebandLength,

    panelPart: panelPart,
    autoHingeCount: autoHingeCount,
    hingePositions: hingePositions,
    addHingeMachining: addHingeMachining,
    addPullMachining: addPullMachining,
    frontOrientation: frontOrientation,

    buildDoorLeaf: buildDoorLeaf,
    buildDrawerFront: buildDrawerFront,
    buildFaceFrame: buildFaceFrame,
    buildDrawerBox: buildDrawerBox,

    finaliseParts: finaliseParts,
    resolveSheetThickness: resolveSheetThickness,
    addShelfPinHoles: addShelfPinHoles,
    addHingePlateHoles: addHingePlateHoles,
    addFaceFramePlateHoles: addFaceFramePlateHoles,
    addSlideHoles: addSlideHoles
  };

  CS.engine = CS.engine || {};
  CS.engine.parts = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
