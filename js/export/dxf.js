/* Cabinet Studio — ASCII DXF writer (contract §8).
 *
 * Writes a clean, minimal-but-complete ASCII DXF from the writer-independent
 * CadDrawing built by js/export/cad-layout.js. No external library.
 *
 * Supported versions:
 *   'r2000' (default) — AC1015: handles, LWPOLYLINE, lineweights, OBJECTS.
 *   'r12'             — AC1009: no handles, POLYLINE/VERTEX/SEQEND only.
 *
 * The file always carries: HEADER ($ACADVER, $INSUNITS 4, $EXTMIN/$EXTMAX,
 * $LTSCALE, $TEXTSTYLE, …), TABLES (LTYPE Continuous/Dashed/Hidden, LAYER
 * records for every CS-* layer with its ACI color and linetype, STYLE
 * Standard), BLOCKS (*Model_Space, *Paper_Space), ENTITIES and EOF.
 * CRLF line endings, no NaN/inf, non-ASCII escaped as \U+XXXX.
 *
 * Classic script; attaches to CS.export.dxf and exports in Node.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});

  var CRLF = '\r\n';
  var VERSIONS = {
    r2000: { acadver: 'AC1015', r12: false },
    r12: { acadver: 'AC1009', r12: true }
  };

  /* ------------------------------------------------------------------ *
   * Value formatting
   * ------------------------------------------------------------------ */
  function fmtNum(value) {
    var v = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(v)) v = 0;
    var r = Math.round(v * 1e6) / 1e6;
    if (r === 0) r = 0;                       // normalise -0
    return String(r);
  }
  function fmtInt(value) {
    var v = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(v)) v = 0;
    return String(Math.round(v));
  }

  /** DXF text values are single-line; escape non-ASCII as \U+XXXX. */
  function fmtText(value) {
    var s = value == null ? '' : String(value);
    s = s.replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f]/g, '');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      if (code < 127) out += s.charAt(i);
      else out += '\\U+' + ('000' + code.toString(16).toUpperCase()).slice(-4);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Writer
   * ------------------------------------------------------------------ */
  function Writer(r12) {
    this.r12 = !!r12;
    this.nextHandle = 0x100;
    this.tableLines = [];
    this.entityLines = [];
    this.objectLines = [];
    this.blockLines = [];
    this.dest = this.tableLines;
  }

  Writer.prototype.out = function (code, value) {
    this.dest.push(String(code), String(value));
  };
  Writer.prototype.handle = function () {
    var h = this.nextHandle.toString(16).toUpperCase();
    this.nextHandle += 1;
    return h;
  };
  Writer.prototype.recordHandle = function () {
    var h = this.handle();
    this.out(5, h);
    return h;
  };

  /* Tables ------------------------------------------------------------ */
  Writer.prototype.beginTable = function (name, count) {
    this.out(0, 'TABLE');
    this.out(2, name);
    var h = this.recordHandle();
    if (!this.r12) this.out(330, '0');
    if (!this.r12) {
      this.out(100, 'AcDbSymbolTable');
      this.out(70, fmtInt(count));
      if (name === 'DIMSTYLE') {
        this.out(100, 'AcDbDimStyleTable');
        this.out(71, '0');
      }
    } else {
      this.out(70, fmtInt(count));
    }
    return h;
  };
  Writer.prototype.endTable = function () {
    this.out(0, 'ENDTAB');
  };

  Writer.prototype.symbolRecord = function (type, ownerHandle, subclasses) {
    this.out(0, type);
    var h = this.recordHandle();
    if (!this.r12) {
      this.out(330, ownerHandle);
      for (var i = 0; i < subclasses.length; i++) this.out(100, subclasses[i]);
    }
    return h;
  };

  Writer.prototype.buildTables = function (layers) {
    var self = this;
    this.dest = this.tableLines;
    /* VPORT: one active viewport so CAD programs have a sane view. */
    var vportTable = this.beginTable('VPORT', 1);
    this.symbolRecord('VPORT', vportTable, ['AcDbSymbolTableRecord', 'AcDbViewportTableRecord']);
    this.out(2, '*ACTIVE');
    this.out(70, '0');
    this.out(10, '0.0'); this.out(20, '0.0');
    this.out(11, '1.0'); this.out(21, '1.0');
    this.out(12, '0.0'); this.out(22, '0.0');
    this.out(13, '0.0'); this.out(23, '0.0');
    this.out(14, '10.0'); this.out(24, '10.0');
    this.out(15, '10.0'); this.out(25, '10.0');
    this.out(16, '0.0'); this.out(26, '0.0'); this.out(36, '1.0');
    this.out(17, '0.0'); this.out(27, '0.0'); this.out(37, '0.0');
    this.out(40, '1000.0');
    this.out(41, '1.6');
    this.out(42, '50.0');
    this.out(43, '0.0');
    this.out(44, '0.0');
    this.out(50, '0.0');
    this.out(51, '0.0');
    this.out(71, '0'); this.out(72, '100'); this.out(73, '1');
    this.out(74, '3'); this.out(75, '0'); this.out(76, '0');
    this.out(77, '0'); this.out(78, '0');
    this.endTable();

    /* LTYPE: ByBlock, ByLayer, Continuous, Dashed, Hidden. */
    var ltypes = [
      { name: 'ByBlock', desc: '', pattern: [] },
      { name: 'ByLayer', desc: '', pattern: [] },
      { name: 'Continuous', desc: 'Solid line', pattern: [] },
      { name: 'Dashed', desc: 'Dashed __ __ __ __', pattern: [0.75, 0.5, -0.25] },
      { name: 'Hidden', desc: 'Hidden __ __ __ __', pattern: [0.375, 0.25, -0.125] }
    ];
    var ltypeTable = this.beginTable('LTYPE', ltypes.length);
    ltypes.forEach(function (lt) {
      self.symbolRecord('LTYPE', ltypeTable, ['AcDbSymbolTableRecord', 'AcDbLinetypeTableRecord']);
      self.out(2, lt.name);
      self.out(70, '0');
      self.out(3, lt.desc);
      self.out(72, '65');
      self.out(73, fmtInt(lt.pattern.length));
      self.out(40, fmtNum(lt.pattern.length ? lt.pattern[0] : 0));
      lt.pattern.forEach(function (dash) { self.out(49, fmtNum(dash)); });
    });
    this.endTable();

    /* LAYER: layer 0 plus the Cabinet Studio layer set. */
    var layerList = [];
    layerList.push({ name: '0', color: 7, linetype: 'Continuous', lineweight: 25 });
    (layers || []).forEach(function (layer) {
      if (!layer || !layer.name) return;
      var exists = layerList.some(function (l) { return l.name === layer.name; });
      if (!exists) layerList.push(layer);
    });
    var layerTable = this.beginTable('LAYER', layerList.length);
    layerList.forEach(function (layer) {
      var name = String(layer.name).replace(/[<>/\\":;?*|=`,]/g, '_');
      self.symbolRecord('LAYER', layerTable, ['AcDbSymbolTableRecord', 'AcDbLayerTableRecord']);
      self.out(2, name);
      self.out(70, '0');
      self.out(62, fmtInt(layer.color == null ? 7 : layer.color));
      self.out(6, layer.linetype || 'Continuous');
      if (!self.r12) self.out(370, fmtInt(layer.lineweight == null ? 25 : layer.lineweight));
    });
    this.endTable();

    /* STYLE: one Standard text style (txt.shx, width 1). */
    var styleTable = this.beginTable('STYLE', 1);
    this.symbolRecord('STYLE', styleTable, ['AcDbSymbolTableRecord', 'AcDbTextStyleTableRecord']);
    this.out(2, 'Standard');
    this.out(70, '0');
    this.out(40, '0.0');
    this.out(41, '1.0');
    this.out(50, '0.0');
    this.out(71, '0');
    this.out(42, '2.5');
    this.out(3, 'txt');
    this.out(4, '');
    this.endTable();

    /* VIEW and UCS: empty tables (kept for DXF completeness). */
    this.beginTable('VIEW', 0); this.endTable();
    this.beginTable('UCS', 0); this.endTable();

    /* APPID: ACAD is conventional. */
    var appidTable = this.beginTable('APPID', 1);
    this.symbolRecord('APPID', appidTable, ['AcDbSymbolTableRecord', 'AcDbRegAppTableRecord']);
    this.out(2, 'ACAD');
    this.out(70, '0');
    this.endTable();

    /* DIMSTYLE: Standard with the usual metric defaults. */
    var dimstyleTable = this.beginTable('DIMSTYLE', 1);
    this.symbolRecord('DIMSTYLE', dimstyleTable, ['AcDbSymbolTableRecord', 'AcDbDimStyleTableRecord']);
    this.out(2, 'Standard');
    this.out(70, '0');
    var dimVars = [
      [3, ''], [4, ''], [40, 1], [41, 2.5], [42, 0.625], [43, 3.75], [44, 1.25],
      [45, 0], [46, 0], [47, 0], [48, 0], [140, 2.5], [141, 2.5], [142, 0],
      [143, 0.03937007874], [144, 1], [145, 0], [146, 1], [147, 0.625], [148, 0],
      [71, 0], [72, 0], [73, 0], [74, 0], [75, 0], [76, 0], [77, 0], [78, 8],
      [170, 0], [171, 2], [172, 0], [173, 0], [174, 0], [175, 0], [176, 0],
      [177, 0], [178, 0], [179, 0],
      [271, 2], [272, 2], [273, 2], [274, 2], [275, 0], [276, 0], [277, 2],
      [278, 46], [279, 0], [280, 0], [281, 0], [282, 0], [283, 0], [284, 8],
      [285, 0], [286, 0], [287, 3], [288, 0]
    ];
    dimVars.forEach(function (pair) {
      if (typeof pair[1] === 'string') self.out(pair[0], pair[1]);
      else self.out(pair[0], fmtNum(pair[1]));
    });
    this.endTable();

    /* BLOCK_RECORD (R2000+): model and paper space records. */
    if (!this.r12) {
      var blockRecordTable = this.beginTable('BLOCK_RECORD', 2);
      this.modelSpaceRecord = this.symbolRecord('BLOCK_RECORD', blockRecordTable, ['AcDbSymbolTableRecord', 'AcDbBlockTableRecord']);
      this.out(2, '*Model_Space');
      this.out(70, '0');
      this.out(280, '1');
      this.out(281, '0');
      this.paperSpaceRecord = this.symbolRecord('BLOCK_RECORD', blockRecordTable, ['AcDbSymbolTableRecord', 'AcDbBlockTableRecord']);
      this.out(2, '*Paper_Space');
      this.out(70, '0');
      this.out(280, '1');
      this.out(281, '0');
      this.endTable();
    }
  };

  /* Blocks ------------------------------------------------------------ */
  Writer.prototype.buildBlocks = function () {
    var self = this;
    if (this.r12) {
      this.blockLines = [];
      return;
    }
    this.dest = this.blockLines;
    var pairs = [
      { name: '*Model_Space', record: this.modelSpaceRecord },
      { name: '*Paper_Space', record: this.paperSpaceRecord }
    ];
    pairs.forEach(function (pair) {
      self.out(0, 'BLOCK');
      self.out(5, self.handle());
      self.out(330, pair.record);
      self.out(100, 'AcDbEntity');
      self.out(8, '0');
      self.out(100, 'AcDbBlockBegin');
      self.out(2, pair.name);
      self.out(70, '0');
      self.out(10, '0.0'); self.out(20, '0.0'); self.out(30, '0.0');
      self.out(3, pair.name);
      self.out(1, '');
      self.out(0, 'ENDBLK');
      self.out(5, self.handle());
      self.out(330, pair.record);
      self.out(100, 'AcDbEntity');
      self.out(8, '0');
      self.out(100, 'AcDbBlockEnd');
    });
  };

  /* Entities ---------------------------------------------------------- */
  Writer.prototype.entityStart = function (type, entity, subclass) {
    this.out(0, type);
    this.out(5, this.handle());
    if (!this.r12) {
      this.out(330, this.modelSpaceRecord);
      this.out(100, 'AcDbEntity');
    }
    this.out(8, entity.layer || '0');
    if (!this.r12) this.out(100, subclass);
  };

  Writer.prototype.writeEntities = function (entities) {
    var self = this;
    this.dest = this.entityLines;
    (entities || []).forEach(function (entity) {
      if (!entity || !entity.type) return;
      switch (entity.type) {
        case 'line': self.writeLine(entity); break;
        case 'polyline': self.writePolyline(entity); break;
        case 'circle': self.writeCircle(entity); break;
        case 'arc': self.writeArc(entity); break;
        case 'text': self.writeText(entity); break;
        default: /* unsupported by the CadDrawing contract */ break;
      }
    });
  };

  Writer.prototype.writeLine = function (entity) {
    var a = entity.a, b = entity.b;
    if (!a || !b) return;
    this.entityStart('LINE', entity, 'AcDbLine');
    this.out(10, fmtNum(a[0])); this.out(20, fmtNum(a[1])); this.out(30, '0.0');
    this.out(11, fmtNum(b[0])); this.out(21, fmtNum(b[1])); this.out(31, '0.0');
  };

  Writer.prototype.writePolyline = function (entity) {
    var points = entity.points || [];
    if (points.length < 2) return;
    if (this.r12) {
      this.out(0, 'POLYLINE');
      this.out(5, this.handle());
      this.out(8, entity.layer || '0');
      this.out(66, '1');
      this.out(10, '0.0'); this.out(20, '0.0'); this.out(30, '0.0');
      this.out(70, entity.closed ? '1' : '0');
      for (var i = 0; i < points.length; i++) {
        this.out(0, 'VERTEX');
        this.out(5, this.handle());
        this.out(8, entity.layer || '0');
        this.out(10, fmtNum(points[i][0]));
        this.out(20, fmtNum(points[i][1]));
        this.out(30, '0.0');
        this.out(70, '0');
      }
      this.out(0, 'SEQEND');
      this.out(5, this.handle());
      this.out(8, entity.layer || '0');
      return;
    }
    this.entityStart('LWPOLYLINE', entity, 'AcDbPolyline');
    this.out(90, fmtInt(points.length));
    this.out(70, entity.closed ? '1' : '0');
    this.out(43, '0.0');
    points.forEach(function (point) {
      this.out(10, fmtNum(point[0]));
      this.out(20, fmtNum(point[1]));
    }, this);
  };

  Writer.prototype.writeCircle = function (entity) {
    var c = entity.c, r = entity.r;
    if (!c || !isFinite(r) || r <= 0) return;
    this.entityStart('CIRCLE', entity, 'AcDbCircle');
    this.out(10, fmtNum(c[0])); this.out(20, fmtNum(c[1])); this.out(30, '0.0');
    this.out(40, fmtNum(r));
  };

  Writer.prototype.writeArc = function (entity) {
    var c = entity.c, r = entity.r;
    if (!c || !isFinite(r) || r <= 0) return;
    this.entityStart('ARC', entity, 'AcDbCircle');
    this.out(10, fmtNum(c[0])); this.out(20, fmtNum(c[1])); this.out(30, '0.0');
    this.out(40, fmtNum(r));
    if (!this.r12) this.out(100, 'AcDbArc');
    this.out(50, fmtNum(entity.a0));
    this.out(51, fmtNum(entity.a1));
  };

  Writer.prototype.writeText = function (entity) {
    var p = entity.p;
    if (!p) return;
    var height = isFinite(entity.height) && entity.height > 0 ? entity.height : 2.5;
    var halign = { left: 0, center: 1, right: 2 }[entity.align] || 0;
    var valign = { baseline: 0, middle: 2, top: 3 }[entity.valign] || 0;
    this.entityStart('TEXT', entity, 'AcDbText');
    this.out(10, fmtNum(p[0])); this.out(20, fmtNum(p[1])); this.out(30, '0.0');
    this.out(40, fmtNum(height));
    this.out(1, fmtText(entity.text || ''));
    if (entity.rotation) this.out(50, fmtNum(entity.rotation));
    this.out(7, 'Standard');
    this.out(71, '0');
    if (halign) this.out(72, fmtInt(halign));
    this.out(11, fmtNum(p[0])); this.out(21, fmtNum(p[1])); this.out(31, '0.0');
    if (!this.r12) this.out(100, 'AcDbText');
    if (valign) this.out(73, fmtInt(valign));
  };

  /* OBJECTS (R2000+): a root dictionary so the file is complete. */
  Writer.prototype.buildObjects = function () {
    if (this.r12) return;
    this.dest = this.objectLines;
    var rootHandle = this.handle();
    var groupHandle = this.handle();
    this.out(0, 'DICTIONARY');
    this.out(5, rootHandle);
    this.out(330, '0');
    this.out(100, 'AcDbDictionary');
    this.out(281, '1');
    this.out(3, 'ACAD_GROUP');
    this.out(350, groupHandle);
    this.out(0, 'DICTIONARY');
    this.out(5, groupHandle);
    this.out(330, rootHandle);
    this.out(100, 'AcDbDictionary');
    this.out(281, '1');
  };

  /* Header ------------------------------------------------------------ */
  Writer.prototype.buildHeader = function (cadDrawing, version) {
    var lines = [];
    var g = function (code, value) { lines.push(String(code), String(value)); };
    var extents = cadDrawing.extents || { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    var seed = this.nextHandle.toString(16).toUpperCase();
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, version.acadver);
    g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
    g(9, '$INSBASE'); g(10, '0.0'); g(20, '0.0'); g(30, '0.0');
    g(9, '$EXTMIN'); g(10, fmtNum(extents.minX)); g(20, fmtNum(extents.minY)); g(30, '0.0');
    g(9, '$EXTMAX'); g(10, fmtNum(extents.maxX)); g(20, fmtNum(extents.maxY)); g(30, '0.0');
    g(9, '$LIMMIN'); g(10, '0.0'); g(20, '0.0');
    g(9, '$LIMMAX'); g(10, fmtNum(extents.maxX)); g(20, fmtNum(extents.maxY));
    g(9, '$LTSCALE'); g(40, '1.0');
    g(9, '$TEXTSTYLE'); g(7, 'Standard');
    g(9, '$CLAYER'); g(8, '0');
    g(9, '$CELTYPE'); g(6, 'ByLayer');
    g(9, '$CECOLOR'); g(62, '256');
    g(9, '$MEASUREMENT'); g(70, '1');
    g(9, '$INSUNITS'); g(70, '4');
    g(9, '$LUNITS'); g(70, '2');
    g(9, '$LUPREC'); g(70, '4');
    g(9, '$HANDSEED'); g(5, seed);
    if (!version.r12) { g(9, '$TILEMODE'); g(70, '1'); }
    g(0, 'ENDSEC');
    return lines;
  };

  /* Assembly ---------------------------------------------------------- */
  function build(cadDrawing, options) {
    options = options || {};
    var versionKey = options.version === 'r12' ? 'r12' : 'r2000';
    var version = VERSIONS[versionKey];
    if (!cadDrawing || !Array.isArray(cadDrawing.entities)) {
      throw new Error('CS.export.dxf.build: a CadDrawing with an entities array is required.');
    }
    var writer = new Writer(version.r12);
    writer.buildTables(cadDrawing.layers || []);
    writer.buildBlocks();
    writer.writeEntities(cadDrawing.entities);
    writer.buildObjects();

    var lines = [];
    var pushAll = function (arr) { for (var i = 0; i < arr.length; i++) lines.push(arr[i]); };
    pushAll(writer.buildHeader(cadDrawing, version));
    lines.push('0', 'SECTION', '2', 'TABLES');
    pushAll(writer.tableLines);
    lines.push('0', 'ENDSEC');
    lines.push('0', 'SECTION', '2', 'BLOCKS');
    pushAll(writer.blockLines);
    lines.push('0', 'ENDSEC');
    lines.push('0', 'SECTION', '2', 'ENTITIES');
    pushAll(writer.entityLines);
    lines.push('0', 'ENDSEC');
    if (!version.r12) {
      lines.push('0', 'SECTION', '2', 'OBJECTS');
      pushAll(writer.objectLines);
      lines.push('0', 'ENDSEC');
    }
    lines.push('0', 'EOF');
    return lines.join(CRLF) + CRLF;
  }

  /** Layer names the writer always emits (0 plus contract layers). */
  function requiredLayerNames() {
    return ['0', 'CS-OUTLINE', 'CS-HOLES', 'CS-GROOVES', 'CS-PARTS', 'CS-DIM',
      'CS-TEXT', 'CS-SHEET', 'CS-NEST', 'CS-HIDDEN'];
  }

  var api = {
    build: build,
    VERSIONS: Object.keys(VERSIONS),
    requiredLayerNames: requiredLayerNames,
    formatText: fmtText
  };
  CS.export = CS.export || {};
  CS.export.dxf = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
