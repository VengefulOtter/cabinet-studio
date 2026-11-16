/* Cabinet Studio — DWG writer (contract §8).
 *
 * Maps the writer-independent CadDrawing from js/export/cad-layout.js onto
 * the vendored nasjidwg document model (js/vendor/nasjidwg.bundle.js, MIT,
 * pure TypeScript) and writes a real binary DWG: R2000 (AC1015, default),
 * R2018 (AC1032) or R12 (AC1009). No external tool is used at runtime —
 * the bytes are produced in the browser/Node by nasjidwg itself.
 *
 * The mapping covers everything the CAD contract draws: layers with ACI
 * colours / linetypes / lineweights, the Standard text style, lines,
 * polylines, circles (holes), arcs and text (including justified text).
 * Entity kinds the writer cannot encode are reported in `skipped`; simpler
 * re-encodings are reported in `downgraded`; `auditDrawing` findings are
 * returned so a caller can surface real problems instead of shipping a
 * broken file.
 *
 * Classic script; attaches to CS.export.dwg and exports in Node.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});

  var VERSION_IDS = {
    r2000: { nasjidwg: 'R2000', writer: 'writeDwg2000' },
    r2018: { nasjidwg: 'R2018', writer: 'writeDwg2018' },
    r12: { nasjidwg: 'R12', writer: 'writeDwgR12' }
  };
  var HALIGN = { left: 'left', center: 'center', right: 'right' };
  var VALIGN = { baseline: 'baseline', middle: 'middle', top: 'top' };
  var CHAR_W = 0.55;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v, fallback) { return isNum(v) ? v : fallback; }
  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  /** Resolve the vendored library at call time (browser global or Node). */
  function getNasjidwg() {
    var N = root.Nasjidwg;
    if (!N && typeof require === 'function') {
      try {
        // Node/tests: the bundle sets globalThis.Nasjidwg when required.
        require('../vendor/nasjidwg.bundle.js');
        N = root.Nasjidwg;
      } catch (error) {
        N = null;
      }
    }
    if (!N || typeof N.emptyDrawing !== 'function' || typeof N.writeDwg2000 !== 'function') {
      throw new Error('CS.export.dwg.build: nasjidwg is not loaded (expected js/vendor/nasjidwg.bundle.js).');
    }
    return N;
  }

  function toAci(color) {
    var index = typeof color === 'number' ? Math.round(color) : 7;
    if (!isFinite(index) || index < 1 || index > 255) return 7;
    return index;
  }

  function toMmLineweight(lineweight) {
    // CadDrawing lineweights are 1/100 mm (contract), nasjidwg wants mm.
    if (!isNum(lineweight) || lineweight <= 0) return undefined;
    return Math.round(lineweight) / 100;
  }

  function textWidth(text, height) {
    return String(text == null ? '' : text).length * height * CHAR_W;
  }

  /** Map a CadDrawing text entity to a nasjidwg TextEntity.
   *
   * nasjidwg omits the DWG alignment point when it equals the insertion
   * point, and LibreDWG then decodes the alignment point as (0,0); for
   * justified text we therefore write the conventional left/baseline
   * insertion point and keep the requested anchor as alignmentPoint.
   */
  function mapText(N, entity) {
    var p = entity.p;
    var height = num(entity.height, 2.5);
    if (height <= 0) height = 2.5;
    var rotation = num(entity.rotation, 0) * Math.PI / 180;
    var halign = HALIGN[entity.align] || 'left';
    var valign = VALIGN[entity.valign] || 'baseline';
    var justified = halign !== 'left' || valign !== 'baseline';
    var x = p[0], y = p[1];
    var text = clean(entity.text);
    var out = {
      type: 'text',
      layer: entity.layer,
      color: { kind: 'byLayer' },
      text: text,
      height: height,
      rotation: rotation,
      style: 'Standard',
      halign: halign,
      valign: valign
    };
    if (justified) {
      var width = textWidth(text, height);
      if (halign === 'center') x -= width / 2;
      else if (halign === 'right') x -= width;
      if (valign === 'middle') y -= height / 2;
      else if (valign === 'top') y -= height;
      if (Math.abs(x - p[0]) < 1e-9 && Math.abs(y - p[1]) < 1e-9) x -= 0.01;
      out.position = { x: x, y: y, z: 0 };
      out.alignmentPoint = { x: p[0], y: p[1], z: 0 };
    } else {
      out.position = { x: p[0], y: p[1], z: 0 };
    }
    return out;
  }

  function mapEntity(N, entity, skipped) {
    if (!entity || !entity.layer) {
      skipped.push('entity-without-layer:' + (entity && entity.type));
      return null;
    }
    switch (entity.type) {
      case 'line': {
        if (!entity.a || !entity.b || !isNum(entity.a[0]) || !isNum(entity.b[0])) {
          skipped.push('line:invalid-coordinates');
          return null;
        }
        return {
          type: 'line', layer: entity.layer, color: { kind: 'byLayer' },
          start: { x: entity.a[0], y: entity.a[1], z: 0 },
          end: { x: entity.b[0], y: entity.b[1], z: 0 }
        };
      }
      case 'polyline': {
        var points = (entity.points || []).filter(function (p) {
          return Array.isArray(p) && isNum(p[0]) && isNum(p[1]);
        });
        if (points.length < 2) {
          skipped.push('polyline:fewer-than-2-points');
          return null;
        }
        return {
          type: 'polyline', layer: entity.layer, color: { kind: 'byLayer' },
          vertices: points.map(function (p) { return { x: p[0], y: p[1] }; }),
          closed: !!entity.closed
        };
      }
      case 'circle': {
        if (!entity.c || !isNum(entity.c[0]) || !isNum(entity.c[1]) || !isNum(entity.r) || entity.r <= 0) {
          skipped.push('circle:invalid-radius');
          return null;
        }
        return {
          type: 'circle', layer: entity.layer, color: { kind: 'byLayer' },
          center: { x: entity.c[0], y: entity.c[1], z: 0 }, radius: entity.r
        };
      }
      case 'arc': {
        if (!entity.c || !isNum(entity.c[0]) || !isNum(entity.r) || entity.r <= 0) {
          skipped.push('arc:invalid-radius');
          return null;
        }
        return {
          type: 'arc', layer: entity.layer, color: { kind: 'byLayer' },
          center: { x: entity.c[0], y: entity.c[1], z: 0 },
          radius: entity.r,
          startAngle: num(entity.a0, 0) * Math.PI / 180,
          endAngle: num(entity.a1, 0) * Math.PI / 180
        };
      }
      case 'text': {
        if (!entity.p || !isNum(entity.p[0]) || !isNum(entity.p[1]) || !clean(entity.text)) {
          skipped.push('text:invalid');
          return null;
        }
        return mapText(N, entity);
      }
      default:
        skipped.push('unsupported-entity-type:' + entity.type);
        return null;
    }
  }

  /** Build the nasjidwg Drawing for a CadDrawing and a target version. */
  function mapDrawing(N, cadDrawing, version) {
    var drawing = N.emptyDrawing();
    var extents = cadDrawing.extents || { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    drawing.header = {
      version: version.nasjidwg,
      codepage: 'ANSI_1252',
      insUnits: 4,                       // 4 = millimetres
      extMin: { x: num(extents.minX, 0), y: num(extents.minY, 0), z: 0 },
      extMax: { x: num(extents.maxX, 1000), y: num(extents.maxY, 1000), z: 0 },
      linetypeScale: 1,
      summary: {
        title: clean(cadDrawing.title || 'Cabinet Studio drawing'),
        author: 'Cabinet Studio',
        lastSavedBy: 'Cabinet Studio',
        comments: 'Generated by Cabinet Studio — shop drawings export',
        keywords: 'cabinet, shop drawing, CNC'
      }
    };

    /* Layers: ACI colour, linetype by name, lineweight in mm. */
    var layers = [];
    var seenLayers = {};
    var addLayer = function (source) {
      if (!source || !source.name) return;
      var name = String(source.name);
      if (seenLayers[name]) return;
      seenLayers[name] = true;
      var layer = {
        name: name,
        color: { kind: 'aci', index: toAci(source.color) },
        on: true,
        frozen: false,
        locked: false,
        linetype: source.linetype || 'Continuous'
      };
      var lineweight = toMmLineweight(source.lineweight);
      if (lineweight != null) layer.lineweight = lineweight;
      layers.push(layer);
    };
    addLayer({ name: '0', color: 7, linetype: 'Continuous' });
    (cadDrawing.layers || []).forEach(addLayer);
    drawing.layers = layers;

    /* Linetypes: the ones our layers reference, with AutoCAD's classic
       dash patterns. */
    var needed = {};
    layers.forEach(function (layer) { if (layer.linetype) needed[layer.linetype] = true; });
    var linetypes = [
      { name: 'Continuous', description: 'Solid line', pattern: [] },
      { name: 'Dashed', description: 'Dashed __ __ __ __', pattern: [0.75, 0.5, -0.25] },
      { name: 'Hidden', description: 'Hidden __ __ __ __', pattern: [0.375, 0.25, -0.125] }
    ].filter(function (lt) { return lt.name === 'Continuous' || needed[lt.name]; });
    drawing.linetypes = linetypes;

    /* Text style Standard, exactly as the DXF writer uses it. */
    drawing.textStyles = [{ name: 'Standard', font: 'txt', bigFont: '' }];
    drawing.blocks = {};

    var skipped = [];
    var entities = [];
    (cadDrawing.entities || []).forEach(function (entity) {
      var mapped = mapEntity(N, entity, skipped);
      if (mapped) entities.push(mapped);
    });
    drawing.entities = entities;

    /* XDATA/handles are not used: a fresh drawing is audited below. */
    return { drawing: drawing, skipped: skipped };
  }

  /**
   * Build a DWG from a CadDrawing.
   * @param {object} cadDrawing — CS.export.cadLayout.build output.
   * @param {object} [options] — {version:'r2000'|'r2018'|'r12'}
   * @returns {object} {data:Uint8Array, skipped:string[], downgraded:string[],
   *                    audit:Array, errors:number, warnings:number,
   *                    version:string, entityCount:number}
   */
  function build(cadDrawing, options) {
    options = options || {};
    var versionKey = VERSION_IDS[options.version] ? options.version : 'r2000';
    var version = VERSION_IDS[versionKey];
    if (!cadDrawing || !Array.isArray(cadDrawing.entities)) {
      throw new Error('CS.export.dwg.build: a CadDrawing with an entities array is required.');
    }
    var N = getNasjidwg();
    if (typeof N[version.writer] !== 'function') {
      throw new Error('CS.export.dwg.build: nasjidwg has no ' + version.writer + ' function.');
    }
    var mapped = mapDrawing(N, cadDrawing, version);
    var drawing = mapped.drawing;

    /* Audit before writing: surface real problems (bad layers, duplicate
       table entries, degenerate geometry) to the caller. */
    var findings = [];
    try {
      findings = N.auditDrawing(drawing) || [];
    } catch (error) {
      findings = [{
        severity: 'warning',
        code: 'audit-failed',
        message: 'auditDrawing failed: ' + (error && error.message ? error.message : String(error))
      }];
    }
    var errors = findings.filter(function (f) { return f.severity === 'error'; }).length;
    var warnings = findings.filter(function (f) { return f.severity === 'warning'; }).length;

    var result = N[version.writer](drawing);
    var skipped = mapped.skipped.slice();
    var downgraded = (result.downgraded || []).slice();
    if (Array.isArray(result.skipped)) skipped = skipped.concat(result.skipped);

    return {
      data: result.data,
      skipped: skipped,
      downgraded: downgraded,
      audit: findings,
      errors: errors,
      warnings: warnings,
      version: versionKey,
      entityCount: drawing.entities.length,
      layerCount: drawing.layers.length
    };
  }

  var api = {
    build: build,
    VERSIONS: Object.keys(VERSION_IDS),
    mapDrawing: mapDrawing,
    getNasjidwg: getNasjidwg
  };
  CS.export = CS.export || {};
  CS.export.dwg = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
