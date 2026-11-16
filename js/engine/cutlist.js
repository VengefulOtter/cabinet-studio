/**
 * Cabinet Studio engine — cut list, guillotine material planner, purchase summary and hardware
 * aggregation. See docs/CUT-PLANNING-SPEC.md.
 *
 * What this module produces:
 *  - `cutList`: parts grouped by material + thickness with edgebanding, grain and labels.
 *  - `sheetLayouts`: one nesting layout per sheet material. Every sheet is a **guillotine**
 *    (straight-cut) plan: a numbered cut sequence, the placements it yields, offcuts with a
 *    reusable flag and a compact cut plan for UI/PDF.
 *  - `optimization`: the material plan — objective, sheet-goods metrics, aggregate cuts/offcuts,
 *    solid-stock board feet with a milling allowance, and the purchase recommendation.
 *
 * Objectives (project.settings.cutOptimization):
 *  - `leastSheets` — minimise sheet count; tie-break least waste, then fewest cuts.
 *  - `leastCuts`   — minimise saw cuts; tie-break fewer sheets, then least waste.
 * Candidate layouts are generated deterministically (free-rectangle guillotine packer and
 * strip/row/column packers, each with several orderings) and the best candidate for the selected
 * objective is used, separately per material.
 *
 * Placement convention: ABSOLUTE untrimmed sheet frame — x to the right, y up, origin at the
 * bottom-left of the untrimmed sheet; the usable rectangle starts at (trim, trim). `rotated:false`
 * → part.length along sheet x. Sheet-goods grain runs along the longer sheet dimension.
 *
 * Cut-tree fields (stable, machine-verifiable):
 *   seq, type:'rip'|'crosscut', axis:'x'|'y', position, length, width (kerf)
 *   axis 'x' = vertical cut at absolute x=position, splitting the parent piece left/right;
 *   axis 'y' = horizontal cut at absolute y=position, splitting it bottom/top.
 *   from:[x,y], to:[x,y] — absolute endpoints of the cut segment; the segment spans the parent
 *   piece exactly, so QA can find the unique parent piece geometrically and replay the tree.
 *   piece / pieceOut / yields — human-readable labels for the UI/PDF sequence (not required for
 *   machine validation). `kerfRemoved` is present when a cut exits the piece edge.
 * Per-sheet `cutCount` = breakdown cuts only; `trimCuts` = 4 when trim > 0 (edge trims are outside
 * the tree). Aggregate `optimization.sheetGoods.cuts.total` = breakdown total, `trim` separate,
 * `totalSawCuts` = both.
 *
 * Pure and deterministic: same parts in, same layout plan out. No DOM, no randomness, no clock.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var defaults = CS.engine && CS.engine.defaults;
  var P = CS.engine && CS.engine.parts;
  if (!defaults || !P) throw new Error('CabinetStudio engine load order: defaults.js, parts.js must load before cutlist.js');

  var U = defaults.util;
  var num = U.num, round = U.round, isFinitePositive = U.isFinitePositive;

  /** One board foot = 144 in³ in millimetres cubed. */
  var MM3_PER_BOARD_FOOT = 2359737.2;
  var EPS = 0.01;
  var MIN_PIECE = 0.02;

  var OBJECTIVES = ['leastSheets', 'leastCuts'];
  var OBJECTIVE_LABEL = { leastSheets: 'Fewest sheets', leastCuts: 'Fewest saw cuts' };

  // =============================================================================================
  // Material helpers
  // =============================================================================================

  /**
   * True when the material is cut from sheet stock. The catalogue classifies melamine-faced
   * particleboard and raw particleboard as `panel` but they are sheet goods; glass is `panel` too
   * but is cut to size by the glazier and must not be nested.
   */
  function isSheetGood(material) {
    if (!material) return false;
    if (/glass/i.test(material.id || '') || /glass/i.test(material.name || '')) return false;
    if (material.category !== 'sheet' && material.category !== 'panel') return false;
    return !!(material.sheet && isFinitePositive(material.sheet.width) && isFinitePositive(material.sheet.height));
  }

  /** Human label for the group/sheet header of non-sheet materials. */
  function stockLabel(material) {
    if (!material) return 'Stock material';
    if (/glass/i.test(material.id || '') || /glass/i.test(material.name || '')) return 'Glass — cut to size by the glazier (not nested)';
    if (material.category === 'solid') return 'Solid stock — milled to size (not nested)';
    return material.name || 'Stock material';
  }

  /** Nominal imperial label for a sheet, e.g. "48 × 96 in nominal (1220 × 2440 mm)". */
  function sheetLabel(width, height) {
    var MM_PER_IN = 25.4;
    var wi = Math.round(width / MM_PER_IN);
    var hi = Math.round(height / MM_PER_IN);
    var nominal = Math.abs(width / MM_PER_IN - wi) <= 0.25 && Math.abs(height / MM_PER_IN - hi) <= 0.25;
    if (nominal) return wi + ' × ' + hi + ' in nominal (' + round(width, 1) + ' × ' + round(height, 1) + ' mm)';
    return round(width, 1) + ' × ' + round(height, 1) + ' mm';
  }

  function sheetFor(material, project) {
    var settings = (project && project.settings) || {};
    var st = defaults.standards();
    // Solid stock and glass are not sheet goods; report the shop panel sheet as a neutral default.
    var sheet = isSheetGood(material) && isFinitePositive(material.sheet.width) ? material.sheet : null;
    var w = sheet ? material.sheet.width : num(settings.sheetWidth, st.sheetGoods.sheet.width);
    var h = sheet ? material.sheet.height : num(settings.sheetHeight, st.sheetGoods.sheet.height);
    return {
      width: round(w, 2), height: round(h, 2),
      label: sheet ? sheetLabel(w, h) : stockLabel(material),
      nominalIn: sheet ? { width: Math.round(w / 25.4), height: Math.round(h / 25.4) } : null,
      isSheet: !!sheet
    };
  }

  // =============================================================================================
  // Optimization settings and objectives
  // =============================================================================================

  /** Normalise an objective id, accepting the spec ids and a few friendly aliases. */
  function normalizeObjective(value) {
    var v = String(value || '').trim();
    if (v === 'leastCuts' || v === 'fewestCuts' || v === 'fewest-cuts') return 'leastCuts';
    return 'leastSheets';
  }

  /** Resolved planner settings (project settings win over engine defaults). */
  function settingsFor(project) {
    var settings = (project && project.settings) || {};
    var st = defaults.standards();
    return {
      objective: normalizeObjective(settings.cutOptimization),
      kerf: Math.max(0, num(settings.sheetKerf, st.sheetGoods.kerf)),
      trim: Math.max(0, num(settings.sheetTrim, st.sheetGoods.trim)),
      offcutMinWidth: Math.max(0, num(settings.offcutMinWidth, 150)),
      offcutMinLength: Math.max(0, num(settings.offcutMinLength, 300)),
      // Solid-stock purchasing: net finished bf -> rough-dressing allowance -> defect allowance.
      solidStockDressingPct: Math.max(0, num(settings.solidStockDressingPct, 34)),
      solidStockWastePct: Math.max(0, num(settings.solidStockWastePct, 15))
    };
  }

  function isReusableOffcut(width, height, settings) {
    var minSide = Math.min(width, height);
    var maxSide = Math.max(width, height);
    return minSide >= settings.offcutMinWidth - EPS && maxSide >= settings.offcutMinLength - EPS;
  }

  // =============================================================================================
  // Cut list
  // =============================================================================================

  function partArea(p) { return p.length * p.width; }

  /**
   * Build the cut list from resolved cabinet models.
   *
   * @param {Array} cabinetModels resolved cabinet models
   * @param {Object} project normalised project (sheet size settings)
   * @returns {Object} CutList (contract §4)
   */
  function buildCutList(cabinetModels, project) {
    var groupsByKey = {};
    var groupOrder = [];
    var partCount = 0;
    var totalArea = 0;
    var edgebandMm = 0;
    var i, j;

    for (i = 0; i < cabinetModels.length; i++) {
      var parts = (cabinetModels[i] && cabinetModels[i].parts) || [];
      for (j = 0; j < parts.length; j++) {
        var part = parts[j];
        if (!isFinitePositive(part.length) || !isFinitePositive(part.width)) continue;
        partCount++;
        totalArea += partArea(part);
        edgebandMm += P.edgebandLength(part);
        var material = defaults.material(part.materialId);
        var groupKey = material.id + '|' + part.thickness;
        var group = groupsByKey[groupKey];
        if (!group) {
          group = groupsByKey[groupKey] = {
            materialId: material.id,
            materialName: material.name,
            thickness: part.thickness,
            sheet: sheetFor(material, project),
            category: material.category,
            rowsByKey: {},
            rows: []
          };
          groupOrder.push(groupKey);
        }
        var edges = (part.edgeband && part.edgeband.edges ? part.edgeband.edges.slice() : []).sort();
        var rowKey = [part.cutListGroup, round(part.length, 1), round(part.width, 1), part.grain, edges.join('+'), part.edgeband ? part.edgeband.materialId : 'none'].join('|');
        var row = group.rowsByKey[rowKey];
        if (!row) {
          row = group.rowsByKey[rowKey] = {
            key: part.cutListGroup,
            name: part.name.replace(/\s+\d+$/, ''),
            length: round(part.length, 2),
            width: round(part.width, 2),
            thickness: part.thickness,
            qty: 0,
            grain: part.grain,
            edgeband: {
              edges: edges,
              materialId: part.edgeband ? part.edgeband.materialId : 'none',
              thickness: part.edgeband ? part.edgeband.thickness : 0
            },
            labels: [],
            notes: [],
            materialId: part.materialId
          };
          group.rows.push(row);
        }
        row.qty++;
        if (row.labels.indexOf(part.id) === -1) row.labels.push(part.id);
        if (Array.isArray(part.notes)) {
          for (var n = 0; n < part.notes.length; n++) {
            if (part.notes[n] && row.notes.indexOf(part.notes[n]) === -1) row.notes.push(part.notes[n]);
          }
        }
      }
    }

    var groups = [];
    for (var g = 0; g < groupOrder.length; g++) {
      var grp = groupsByKey[groupOrder[g]];
      grp.rows.sort(function (a, b) {
        if (b.length !== a.length) return b.length - a.length;
        if (b.width !== a.width) return b.width - a.width;
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });
      groups.push({
        materialId: grp.materialId, materialName: grp.materialName, thickness: grp.thickness,
        sheet: grp.sheet, category: grp.category, rows: grp.rows
      });
    }
    groups.sort(function (a, b) { return a.materialId < b.materialId ? -1 : a.materialId > b.materialId ? 1 : a.thickness - b.thickness; });

    var uniqueParts = 0;
    for (var u = 0; u < groups.length; u++) uniqueParts += groups[u].rows.length;

    return {
      groups: groups,
      totals: {
        partCount: partCount,
        uniqueParts: uniqueParts,
        sheetCount: 0,
        areaM2: round(totalArea / 1e6, 3),
        yieldPct: 0,
        edgebandMetres: round(edgebandMm / 1000, 3),
        cutCount: 0,
        offcutCount: 0,
        solidBoardFeet: 0,
        purchaseSheets: 0
      }
    };
  }

  // =============================================================================================
  // Grain-aware orientations
  // =============================================================================================

  /** Grain direction of a sheet: along its longer dimension. */
  function grainAxisFor(sheet) {
    return sheet.height >= sheet.width ? 'y' : 'x';
  }

  /**
   * Allowed placement orientations for a part, in sheet coordinates.
   * `w` = extent along sheet x, `h` = extent along sheet y, `rotated` = part.length along sheet y.
   * Grain-locked parts get exactly one orientation; grain:none may rotate.
   */
  function orientationVariants(inst, sheet, usable) {
    var axis = grainAxisFor(sheet);
    var out = [];
    function add(w, h) {
      if (w <= usable.width + EPS && h <= usable.height + EPS && w > 0 && h > 0) {
        var rotated = Math.abs(h - inst.length) < 0.001 && Math.abs(w - inst.width) < 0.001;
        // Guard against square parts where both orientations are geometrically identical.
        if (out.some(function (o) { return Math.abs(o.w - w) < EPS && Math.abs(o.h - h) < EPS; })) return;
        out.push({ w: round(w, 2), h: round(h, 2), rotated: rotated });
      }
    }
    if (inst.grain === 'length') {
      if (axis === 'y') add(inst.width, inst.length); else add(inst.length, inst.width);
    } else if (inst.grain === 'width') {
      if (axis === 'y') add(inst.length, inst.width); else add(inst.width, inst.length);
    } else {
      add(inst.length, inst.width);
      add(inst.width, inst.length);
    }
    return out;
  }

  function expandInstances(group) {
    var out = [];
    for (var i = 0; i < group.rows.length; i++) {
      var row = group.rows[i];
      for (var q = 0; q < row.qty; q++) {
        out.push({
          label: row.labels[q] || (row.labels[0] || row.key) + '-' + (q + 1),
          key: row.key,
          length: row.length,
          width: row.width,
          grain: row.grain
        });
      }
    }
    return out;
  }

  function compareLabel(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function orderInstances(instances, order) {
    var copy = instances.slice();
    copy.sort(function (a, b) {
      var areaA = a.length * a.width, areaB = b.length * b.width;
      if (order === 'height') {
        if (b.length !== a.length) return b.length - a.length;
      } else if (order === 'width') {
        if (b.width !== a.width) return b.width - a.width;
      } else if (order === 'dims') {
        if (b.length !== a.length) return b.length - a.length;
        if (b.width !== a.width) return b.width - a.width;
        return compareLabel(a.label, b.label);
      } else if (order === 'grain') {
        var ga = a.grain === 'length' || a.grain === 'width' ? 0 : 1;
        var gb = b.grain === 'length' || b.grain === 'width' ? 0 : 1;
        if (ga !== gb) return ga - gb;
      }
      if (areaB !== areaA) return areaB - areaA;
      if (b.length !== a.length) return b.length - a.length;
      if (b.width !== a.width) return b.width - a.width;
      return compareLabel(a.label, b.label);
    });
    return copy;
  }

  // =============================================================================================
  // SheetCutter — a guillotine cut tree on one sheet
  // =============================================================================================

  /**
   * Builds a guillotine cut tree on one sheet. Cut coordinates are in the placement frame: x to the
   * right, y up, origin at the bottom-left of the trimmed usable sheet. Each cut removes a piece of
   * a given size from the start (min-x / min-y) side of an existing piece, like a panel-saw
   * straight cut:
   *   direction 'v' → vertical cut (rip)   → output axis 'x', position = x
   *   direction 'h' → horizontal cut (crosscut) → output axis 'y', position = y
   * Kerf is consumed between the two new pieces, so the tree partitions the usable area exactly.
   * Edge trim is NOT part of the tree: it is reported as `trimCuts` (4 when trim > 0).
   *
   * @param {Object} sheet {width,height}
   * @param {number} trim edge trim (mm)
   * @param {number} kerf blade kerf (mm)
   */
  function SheetCutter(sheet, trim, kerf) {
    this.sheet = sheet;
    this.trim = trim;
    this.kerf = kerf;
    this.usable = {
      x: trim, y: trim,
      w: round(sheet.width - 2 * trim, 2),
      h: round(sheet.height - 2 * trim, 2)
    };
    this.pieces = {};
    this.pieces.sheet = { label: 'sheet', x: trim, y: trim, w: this.usable.w, h: this.usable.h };
    this.cuts = [];
    this.seq = 0;
    this.counter = 0;
    this.placements = [];
    this.placementLabels = {};
    this.trimCuts = trim > 0 ? 4 : 0;
  }

  SheetCutter.prototype.newLabel = function (prefix) {
    this.counter += 1;
    return prefix + ' ' + this.counter;
  };

  /**
   * Take a piece of `size` mm off the start side of the given piece along `dir`.
   * `dir` = 'v' for a vertical cut (splits left/right, output axis 'x'), 'h' for a horizontal cut
   * (splits bottom/top, output axis 'y').
   * Returns { partLabel, partRect, remainderLabel, cut, claimed }.
   * If size fills the piece, the piece is simply renamed to `opts.partLabel` (no cut).
   */
  SheetCutter.prototype.splitOff = function (label, dir, size, opts) {
    opts = opts || {};
    var p = this.pieces[label];
    if (!p) throw new Error('guillotine: piece "' + label + '" does not exist');
    var vertical = dir !== 'h';
    var dim = vertical ? p.w : p.h;
    size = round(size, 2);
    if (size <= MIN_PIECE || size >= dim - MIN_PIECE) {
      // Claim the whole piece (the caller wanted the remainder as the part).
      var claimLabel = opts.partLabel || this.newLabel('part');
      var claimed = { label: claimLabel, x: p.x, y: p.y, w: p.w, h: p.h };
      delete this.pieces[label];
      this.pieces[claimLabel] = claimed;
      if (opts.yields) { /* yields recorded by the caller on the placement */ }
      return { partLabel: claimLabel, partRect: claimed, remainderLabel: null, cut: null, claimed: true };
    }
    var aLabel = opts.aLabel || this.newLabel('strip');
    var bLabel = opts.bLabel || this.newLabel('remnant');
    var remainderDim = dim - size - this.kerf;
    if (remainderDim <= EPS) {
      // The blade would exit the edge: the cut still produces the part, and the remaining sliver
      // (< one kerf) is sawdust. Record the material actually removed by the cut.
      var only = vertical
        ? { label: aLabel, x: p.x, y: p.y, w: size, h: p.h }
        : { label: aLabel, x: p.x, y: p.y, w: p.w, h: size };
      delete this.pieces[label];
      this.pieces[aLabel] = only;
      this.seq += 1;
      var edgeCut = {
        seq: this.seq,
        type: vertical ? 'rip' : 'crosscut',
        axis: vertical ? 'x' : 'y',
        position: round(vertical ? p.x + size : p.y + size, 2),
        length: round(vertical ? p.h : p.w, 2),
        width: round(this.kerf, 2),
        kerfRemoved: round(dim - size, 2),
        piece: label,
        pieceOut: [aLabel],
        yields: opts.yields ? opts.yields.slice() : [],
        note: opts.note || 'blade exits the edge',
        from: vertical ? [round(p.x + size, 2), round(p.y, 2)] : [round(p.x, 2), round(p.y + size, 2)],
        to: vertical ? [round(p.x + size, 2), round(p.y + p.h, 2)] : [round(p.x + p.w, 2), round(p.y + size, 2)]
      };
      this.cuts.push(edgeCut);
      return { partLabel: aLabel, partRect: only, remainderLabel: null, cut: edgeCut, claimed: false };
    }
    var a, b;
    if (vertical) {
      a = { label: aLabel, x: p.x, y: p.y, w: size, h: p.h };
      b = { label: bLabel, x: round(p.x + size + this.kerf, 2), y: p.y, w: round(p.w - size - this.kerf, 2), h: p.h };
    } else {
      a = { label: aLabel, x: p.x, y: p.y, w: p.w, h: size };
      b = { label: bLabel, x: p.x, y: round(p.y + size + this.kerf, 2), w: p.w, h: round(p.h - size - this.kerf, 2) };
    }
    delete this.pieces[label];
    this.pieces[aLabel] = a;
    this.pieces[bLabel] = b;
    this.seq += 1;
    var cut = {
      seq: this.seq,
      type: vertical ? 'rip' : 'crosscut',
      // Placement-frame axis: vertical cuts are axis 'x' (position = x), horizontal are axis 'y'.
      axis: vertical ? 'x' : 'y',
      position: round(vertical ? p.x + size : p.y + size, 2),
      length: round(vertical ? p.h : p.w, 2),
      width: round(this.kerf, 2),
      piece: label,
      pieceOut: [aLabel, bLabel],
      yields: opts.yields ? opts.yields.slice() : [],
      note: opts.note || '',
      // Explicit placement-frame endpoints (x right, y up, origin = trimmed usable bottom-left).
      from: vertical
        ? [round(p.x + size, 2), round(p.y, 2)]
        : [round(p.x, 2), round(p.y + size, 2)],
      to: vertical
        ? [round(p.x + size, 2), round(p.y + p.h, 2)]
        : [round(p.x + p.w, 2), round(p.y + size, 2)]
    };
    this.cuts.push(cut);
    return { partLabel: aLabel, partRect: a, remainderLabel: bLabel, cut: cut, claimed: false };
  };

  /** Place a part on a known piece label without cutting (the piece is exactly the part). */
  SheetCutter.prototype.claim = function (label, partLabel) {
    var p = this.pieces[label];
    if (!p) throw new Error('guillotine: piece "' + label + '" does not exist');
    delete this.pieces[label];
    var claimed = { label: partLabel, x: p.x, y: p.y, w: p.w, h: p.h };
    this.pieces[partLabel] = claimed;
    return { label: partLabel, rect: claimed };
  };

  /** Record a placement and its label (the piece label must already be the part label). */
  SheetCutter.prototype.recordPlacement = function (inst, rotated) {
    var p = this.pieces[inst.label];
    if (!p) throw new Error('guillotine: placement piece "' + inst.label + '" does not exist');
    this.placements.push({
      label: inst.label,
      key: inst.key,
      x: round(p.x, 2),
      y: round(p.y, 2),
      width: round(p.w, 2),
      height: round(p.h, 2),
      rotated: !!rotated,
      grain: inst.grain
    });
    this.placementLabels[inst.label] = true;
    return p;
  };

  /** Free (not-yet-part) pieces, used by the free-rectangle packer. */
  SheetCutter.prototype.freeLabels = function () {
    var out = [];
    for (var label in this.pieces) {
      if (!Object.prototype.hasOwnProperty.call(this.pieces, label)) continue;
      if (this.placementLabels[label]) continue;
      var p = this.pieces[label];
      if (p.w > MIN_PIECE && p.h > MIN_PIECE) out.push(label);
    }
    return out;
  };

  /**
   * Finalise the sheet: indices, areas, offcuts and a compact cut plan for UI/PDF.
   * @param {number} index 1-based sheet number
   * @param {Object} settings planner settings (offcut thresholds)
   */
  SheetCutter.prototype.result = function (index, settings) {
    var cutCount = this.cuts.length; // breakdown cuts only (edge trim is reported separately)
    var usedArea = 0, i;
    for (i = 0; i < this.placements.length; i++) {
      usedArea += this.placements[i].width * this.placements[i].height;
    }
    usedArea = round(usedArea, 2);
    var sheetArea = this.sheet.width * this.sheet.height;
    var leftovers = this.freeLabels();
    var offcuts = [];
    for (i = 0; i < leftovers.length; i++) {
      var p = this.pieces[leftovers[i]];
      var offcut = {
        x: round(p.x, 2), y: round(p.y, 2), width: round(p.w, 2), height: round(p.h, 2),
        areaM2: round((p.w * p.h) / 1e6, 4),
        reusable: isReusableOffcut(p.w, p.h, settings),
        label: p.label
      };
      offcuts.push(offcut);
    }
    var steps = [];
    for (i = 0; i < this.cuts.length; i++) {
      var c = this.cuts[i];
      var action = c.type === 'trim' ? 'Trim' : c.type === 'crosscut' ? 'Crosscut' : 'Rip';
      var detail;
      if (c.type === 'trim') {
        detail = 'square the sheet (' + c.note + ')';
      } else {
        detail = c.piece + ' → ' + c.pieceOut.join(' + ');
        if (c.yields.length) detail += ' — yields ' + c.yields.join(', ');
      }
      steps.push({
        seq: c.seq,
        title: action + ' at ' + round(c.position, 1) + ' mm',
        detail: detail
      });
    }
    return {
      index: index,
      placements: this.placements,
      usedArea: usedArea,
      wastePct: sheetArea > 0 ? round(100 * (1 - usedArea / sheetArea), 1) : 0,
      cutCount: cutCount,
      trimCuts: this.trimCuts,
      cuts: this.cuts,
      offcuts: offcuts,
      cutPlan: { steps: steps, totalCuts: cutCount, trimCuts: this.trimCuts, totalSawCuts: cutCount + this.trimCuts }
    };
  };

  // =============================================================================================
  // Packers
  // =============================================================================================

  function newCutter(ctx) { return new SheetCutter(ctx.sheet, ctx.trim, ctx.kerf); }

  function unplacedEntry(inst, reason) {
    return {
      label: inst.label, key: inst.key,
      length: inst.length, width: inst.width,
      reason: reason
    };
  }

  function noFitReason(ctx) {
    return 'Larger than the usable sheet (' + round(ctx.usable.w, 0) + ' × ' + round(ctx.usable.h, 0) + ' mm) for its grain direction';
  }

  /**
   * Free-rectangle guillotine packer: each part is cut out of a free rectangle with one or two
   * straight cuts. Better sheet utilisation than strip packing, more cuts per part.
   */
  function packGuillotine(instances, ctx, strategy) {
    var orderName = strategy.order || 'area';
    var selectMode = strategy.select || 'area';
    var splitMode = strategy.split || 'max';
    var order = orderInstances(instances, orderName);
    var sheets = [];
    var unplaced = [];

    /**
     * Best-fit across every OPEN sheet: a new sheet is only opened when the part fits no current
     * free rectangle anywhere. (Opening a sheet early and never coming back was costing sheets.)
     */
    function bestPlacement(inst, variants) {
      var best = null;
      for (var si = 0; si < sheets.length; si++) {
        var cutter = sheets[si];
        var free = cutter.freeLabels();
        for (var f = 0; f < free.length; f++) {
          var piece = cutter.pieces[free[f]];
          for (var v = 0; v < variants.length; v++) {
            var variant = variants[v];
            if (variant.w > piece.w + EPS || variant.h > piece.h + EPS) continue;
            // A through-cut must leave a real remainder after the kerf (or be an exact fit).
            // Otherwise the blade would exit the edge and the cut tree would not partition cleanly.
            if (variant.w < piece.w - EPS && piece.w - variant.w - ctx.kerf <= EPS) continue;
            if (variant.h < piece.h - EPS && piece.h - variant.h - ctx.kerf <= EPS) continue;
            var rw = piece.w - variant.w;
            var rh = piece.h - variant.h;
            var score;
            if (selectMode === 'short') {
              score = [round(Math.min(rw, rh), 2), round(Math.max(rw, rh), 2), si, round(piece.w * piece.h, 2), f, v];
            } else if (selectMode === 'long') {
              score = [round(Math.max(rw, rh), 2), round(Math.min(rw, rh), 2), si, round(piece.w * piece.h, 2), f, v];
            } else if (selectMode === 'first') {
              score = [si, f, round(piece.w * piece.h - variant.w * variant.h, 2), v];
            } else {
              score = [round(piece.w * piece.h - variant.w * variant.h, 2), si, f, v];
            }
            if (!best || compareScore(score, best.score) < 0) {
              best = { sheetIndex: si, pieceLabel: free[f], variant: variant, score: score };
            }
          }
        }
      }
      return best;
    }

    for (var i = 0; i < order.length; i++) {
      var inst = order[i];
      var variants = orientationVariants(inst, ctx.sheet, ctx.usable);
      if (variants.length === 0) { unplaced.push(unplacedEntry(inst, noFitReason(ctx))); continue; }
      var best = bestPlacement(inst, variants);
      if (!best) {
        var newSheet = newCutter(ctx);
        sheets.push(newSheet);
        best = bestPlacement(inst, variants);
      }
      if (!best) { unplaced.push(unplacedEntry(inst, 'No remaining space on the sheet')); continue; }
      applyFreeRectPlacement(sheets[best.sheetIndex], best.pieceLabel, inst, best.variant, ctx, splitMode);
    }
    return finaliseCandidate(strategy.id, sheets, unplaced, ctx);
  }

  function compareScore(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i] - 0.001) return -1;
      if (a[i] > b[i] + 0.001) return 1;
    }
    return 0;
  }

  /** Cut one part out of a free rectangle, choosing the split that leaves the better remnants. */
  function applyFreeRectPlacement(cutter, pieceLabel, inst, variant, ctx, splitMode) {
    var p = cutter.pieces[pieceLabel];
    var w = variant.w, h = variant.h, kerf = ctx.kerf;
    // Exact fit: no cuts.
    if (w >= p.w - EPS && h >= p.h - EPS) {
      cutter.claim(pieceLabel, inst.label);
      cutter.recordPlacement(inst, variant.rotated);
      return;
    }
    var canV = w < p.w - EPS; // vertical cut first (rip)
    var canH = h < p.h - EPS; // horizontal cut first (crosscut)
    var useVertical;
    if (!canV) useVertical = false;
    else if (!canH) useVertical = true;
    else {
      // Count cuts for each order (a dimension that already matches needs no cut).
      var cutsV = 1 + (h < p.h - EPS ? 1 : 0);
      var cutsH = 1 + (w < p.w - EPS ? 1 : 0);
      if (cutsV !== cutsH) useVertical = cutsV < cutsH;
      else {
        var rw = p.w - w - kerf;
        var rh = p.h - h - kerf;
        if (splitMode === 'short') {
          // Cut along the shorter leftover so the larger rectangle stays whole.
          useVertical = rw < rh;
        } else if (splitMode === 'long') {
          useVertical = rw > rh;
        } else if (splitMode === 'fewest') {
          useVertical = false;
        } else {
          var vRemain = Math.max(rw * p.h, w * rh);
          var hRemain = Math.max(p.w * rh, rw * h);
          useVertical = vRemain >= hRemain - 0.001;
        }
      }
    }
    if (useVertical) {
      // Vertical cut first (rip a strip of width w), then a horizontal cut to length h.
      var stripRes = cutter.splitOff(pieceLabel, 'v', w, { aLabel: cutter.newLabel('strip') });
      var stripLabel = stripRes.partLabel;
      if (h >= cutter.pieces[stripLabel].h - EPS) {
        cutter.claim(stripLabel, inst.label);
        cutter.recordPlacement(inst, variant.rotated);
      } else {
        cutter.splitOff(stripLabel, 'h', h, { aLabel: inst.label, yields: [inst.label] });
        cutter.recordPlacement(inst, variant.rotated);
      }
    } else {
      // Horizontal cut first (crosscut a band of height h), then a vertical cut to width w.
      var bandRes = cutter.splitOff(pieceLabel, 'h', h, { aLabel: cutter.newLabel('strip') });
      var bandLabel = bandRes.partLabel;
      if (w >= cutter.pieces[bandLabel].w - EPS) {
        cutter.claim(bandLabel, inst.label);
        cutter.recordPlacement(inst, variant.rotated);
      } else {
        cutter.splitOff(bandLabel, 'v', w, { aLabel: inst.label, yields: [inst.label] });
        cutter.recordPlacement(inst, variant.rotated);
      }
    }
  }

  /**
   * Strip packer — fewest saw cuts. Rows: crosscut the sheet into full-width strips, then rip
   * parts from each strip. Columns: rip the sheet into full-height strips, then crosscut parts.
   * Parts are grouped by their strip dimension so strips only hold same-thickness (same-height)
   * parts and no extra trimming cuts are needed.
   */
  function packStrips(instances, ctx, mode, pref) {
    var rows = mode === 'rows';
    var usable = ctx.usable;
    var stripDimLimit = rows ? usable.h : usable.w;
    // Rows: crosscut horizontal strips first, then rip pieces (vertical). Columns: rip strips
    // first (vertical), then crosscut pieces (horizontal).
    var stripAxis = rows ? 'h' : 'v';
    var pieceAxis = rows ? 'v' : 'h';
    var unplaced = [];
    var chosen = [];

    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      var variants = orientationVariants(inst, ctx.sheet, ctx.usable);
      if (variants.length === 0) { unplaced.push(unplacedEntry(inst, noFitReason(ctx))); continue; }
      var pick = variants[0];
      if (variants.length > 1) {
        // pref 'a' prefers the first allowed orientation, 'b' the second.
        pick = pref === 'b' ? variants[1] : variants[0];
      }
      chosen.push({
        inst: inst,
        stripDim: round(rows ? pick.h : pick.w, 2),
        crossDim: round(rows ? pick.w : pick.h, 2),
        rotated: pick.rotated
      });
    }

    // Group identical strip dimensions together, largest strips first (deterministic).
    var groupMap = {};
    var groupKeys = [];
    for (var c = 0; c < chosen.length; c++) {
      var entry = chosen[c];
      var key = String(entry.stripDim);
      if (!groupMap[key]) {
        groupMap[key] = { dim: entry.stripDim, items: [] };
        groupKeys.push(key);
      }
      groupMap[key].items.push(entry);
    }
    var groups = groupKeys.map(function (k) { return groupMap[k]; });
    groups.sort(function (a, b) {
      if (b.dim !== a.dim) return b.dim - a.dim;
      return compareLabel(a.items[0].inst.label, b.items[0].inst.label);
    });
    for (var g = 0; g < groups.length; g++) {
      groups[g].items.sort(function (a, b) {
        if (b.crossDim !== a.crossDim) return b.crossDim - a.crossDim;
        return compareLabel(a.inst.label, b.inst.label);
      });
    }

    var cutters = [];
    var current = null;
    var blockLabel = null;
    var cursor = 0;

    function startSheet() {
      current = newCutter(ctx);
      cutters.push(current);
      blockLabel = 'sheet';
      cursor = 0;
    }
    startSheet();

    function recordFromPiece(entry) {
      var piece = current.pieces[entry.inst.label];
      if (!piece) throw new Error('guillotine: strip placement "' + entry.inst.label + '" missing');
      current.placements.push({
        label: entry.inst.label,
        key: entry.inst.key,
        x: round(piece.x, 2), y: round(piece.y, 2),
        width: round(piece.w, 2), height: round(piece.h, 2),
        rotated: entry.rotated, grain: entry.inst.grain
      });
      current.placementLabels[entry.inst.label] = true;
    }

    for (var gi = 0; gi < groups.length; gi++) {
      var queue = groups[gi].items.slice();
      var stripLabel = null;
      var guard = 0;
      while (queue.length > 0 && guard++ < 100000) {
        if (!current) startSheet();
        if (!stripLabel) {
          var stripDim = groups[gi].dim;
          var remaining = round(stripDimLimit - cursor, 2);
          if (remaining < stripDim - EPS) {
            // No room on this sheet for the strip — move to a new sheet.
            current = null;
            continue;
          }
          if (remaining <= stripDim + EPS) {
            // The strip is the whole remaining block — claim it without a cut.
            stripLabel = current.newLabel('strip');
            current.claim(blockLabel, stripLabel);
            blockLabel = null;
            cursor = stripDimLimit;
          } else {
            var stripRes = current.splitOff(blockLabel, stripAxis, stripDim, { aLabel: current.newLabel('strip') });
            stripLabel = stripRes.partLabel;
            blockLabel = stripRes.remainderLabel;
            cursor = round(cursor + stripDim + ctx.kerf, 2);
          }
        }
        var placedAny = false;
        while (queue.length > 0) {
          if (!stripLabel) break;
          var strip = current.pieces[stripLabel];
          if (!strip) break;
          var avail = rows ? strip.w : strip.h;
          var entry2 = queue[0];
          if (avail < entry2.crossDim - EPS) break;
          var gap = avail - entry2.crossDim;
          if (gap > EPS && gap < ctx.kerf - EPS) {
            // The strip leftover after this cut would be smaller than the kerf: keep the remnant as
            // an offcut and try the next strip instead of emitting a degenerate cut.
            stripLabel = null;
            break;
          }
          queue.shift();
          if (gap <= EPS) {
            // Last piece fills the strip remnant exactly — rename, no cut.
            current.claim(stripLabel, entry2.inst.label);
            stripLabel = null;
          } else {
            var res = current.splitOff(stripLabel, pieceAxis, entry2.crossDim, { aLabel: entry2.inst.label, yields: [entry2.inst.label] });
            stripLabel = res.remainderLabel;
          }
          recordFromPiece(entry2);
          placedAny = true;
        }
        if (!placedAny) {
          // Current strip cannot take the next part (too narrow) — start a new strip.
          stripLabel = null;
          continue;
        }
        if (queue.length === 0) {
          // Group finished; any strip remnant is an offcut.
          stripLabel = null;
        }
      }
    }

    return finaliseCandidate('strip-' + mode + '-' + pref, cutters, unplaced, ctx);
  }

  function finaliseCandidate(id, cutters, unplaced, ctx) {
    var sheets = [];
    var usedArea = 0;
    var totalCuts = 0;
    var trimCuts = 0;
    for (var i = 0; i < cutters.length; i++) {
      var sheet = cutters[i].result(i + 1, ctx.settings);
      sheets.push(sheet);
      usedArea += sheet.usedArea;
      totalCuts += sheet.cutCount;
      trimCuts += sheet.trimCuts;
    }
    var sheetArea = ctx.sheet.width * ctx.sheet.height * sheets.length;
    return {
      id: id,
      sheet: ctx.sheet,
      settings: ctx.settings,
      sheets: sheets,
      unplaced: unplaced,
      sheetCount: sheets.length,
      breakdownCuts: totalCuts,
      trimCuts: trimCuts,
      totalCuts: totalCuts + trimCuts, // every saw cut, including edge trim
      usedAreaM2: round(usedArea / 1e6, 4),
      sheetAreaM2: round(sheetArea / 1e6, 4),
      wasteAreaM2: round((sheetArea - usedArea) / 1e6, 4),
      yieldPct: sheetArea > 0 ? round(100 * usedArea / sheetArea, 2) : 0
    };
  }

  // =============================================================================================
  // Candidate generation + objective selection
  // =============================================================================================

  function guillotineStrategy(id, order, select, split) {
    return {
      id: id,
      build: function (inst, ctx) {
        return packGuillotine(inst, ctx, { id: id, order: order, select: select, split: split });
      }
    };
  }

  var CANDIDATE_STRATEGIES = [
    guillotineStrategy('guillotine-area', 'area', 'area', 'max'),
    guillotineStrategy('guillotine-area-short', 'area', 'short', 'short'),
    guillotineStrategy('guillotine-height', 'height', 'area', 'max'),
    guillotineStrategy('guillotine-height-short', 'height', 'short', 'short'),
    guillotineStrategy('guillotine-width', 'width', 'area', 'max'),
    guillotineStrategy('guillotine-grain', 'grain', 'area', 'max'),
    guillotineStrategy('guillotine-first', 'area', 'first', 'max'),
    guillotineStrategy('guillotine-long', 'area', 'long', 'long'),
    guillotineStrategy('guillotine-dims', 'dims', 'area', 'max'),
    { id: 'rows-a', build: function (inst, ctx) { return packStrips(inst, ctx, 'rows', 'a'); } },
    { id: 'rows-b', build: function (inst, ctx) { return packStrips(inst, ctx, 'rows', 'b'); } },
    { id: 'cols-a', build: function (inst, ctx) { return packStrips(inst, ctx, 'cols', 'a'); } },
    { id: 'cols-b', build: function (inst, ctx) { return packStrips(inst, ctx, 'cols', 'b'); } }
  ];

  /**
   * Candidate layouts for one material group.
   * @returns {Array} candidates (each with sheets/cuts/offcuts metrics)
   */
  function candidatesForGroup(group, ctx) {
    var instances = expandInstances(group);
    var candidates = [];
    var strategies = CANDIDATE_STRATEGIES;
    // Large part lists: drop the less useful orderings to stay fast.
    if (instances.length > 160) {
      strategies = strategies.filter(function (s) {
        return s.id === 'guillotine-area' || s.id === 'guillotine-area-short' ||
          s.id === 'guillotine-height-short' || s.id === 'rows-a' || s.id === 'cols-a';
      });
    } else if (instances.length > 80) {
      strategies = strategies.filter(function (s) {
        return s.id.indexOf('guillotine') === 0 ? (s.id === 'guillotine-area' || s.id === 'guillotine-area-short' ||
          s.id === 'guillotine-height-short' || s.id === 'guillotine-grain' || s.id === 'guillotine-long') : true;
      });
    }
    for (var i = 0; i < strategies.length; i++) {
      var candidate = strategies[i].build(instances, ctx);
      candidate.id = strategies[i].id;
      candidate.strategyIndex = i;
      candidates.push(candidate);
    }
    return candidates;
  }

  /** Selection rules per the spec (unplaced always dominates, then the objective). */
  function chooseCandidate(candidates, objective) {
    var sorted = candidates.slice();
    sorted.sort(function (a, b) {
      if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length - b.unplaced.length;
      if (objective === 'leastCuts') {
        // "Fewest saw cuts" counts every saw cut, including the edge trims (fewer sheets = fewer
        // trims), so the comparison is honest about handling.
        if (a.totalCuts !== b.totalCuts) return a.totalCuts - b.totalCuts;
        if (a.breakdownCuts !== b.breakdownCuts) return a.breakdownCuts - b.breakdownCuts;
        if (a.sheetCount !== b.sheetCount) return a.sheetCount - b.sheetCount;
      } else {
        if (a.sheetCount !== b.sheetCount) return a.sheetCount - b.sheetCount;
      }
      if (Math.abs(a.wasteAreaM2 - b.wasteAreaM2) > 0.0005) return a.wasteAreaM2 - b.wasteAreaM2;
      if (a.totalCuts !== b.totalCuts) return a.totalCuts - b.totalCuts;
      return a.strategyIndex - b.strategyIndex;
    });
    return sorted[0];
  }

  function candidateSummary(candidate) {
    return {
      id: candidate.id,
      sheetCount: candidate.sheetCount,
      totalCuts: candidate.totalCuts,
      breakdownCuts: candidate.breakdownCuts,
      trimCuts: candidate.trimCuts,
      wasteAreaM2: candidate.wasteAreaM2,
      yieldPct: candidate.yieldPct,
      unplacedCount: candidate.unplaced.length
    };
  }

  // =============================================================================================
  // Material plan
  // =============================================================================================

  function plannerContext(group, project, settings) {
    var sheet = group.sheet || sheetFor(defaults.material(group.materialId), project);
    var st = defaults.standards();
    var trimValue = Math.max(0, num((project && project.settings && project.settings.sheetTrim), settings.trim !== undefined ? settings.trim : st.sheetGoods.trim));
    return {
      sheet: sheet,
      trim: trimValue,
      kerf: Math.max(0, num((project && project.settings && project.settings.sheetKerf), settings.kerf !== undefined ? settings.kerf : st.sheetGoods.kerf)),
      usable: (function () {
        var usW = round(sheet.width - 2 * trimValue, 2);
        var usH = round(sheet.height - 2 * trimValue, 2);
        return { width: usW, height: usH, w: usW, h: usH };
      })(),
      settings: settings
    };
  }

  function materialNotes(ctx, candidate, objective) {
    var notes = [];
    notes.push('Trim ' + round(ctx.trim, 1) + ' mm off each sheet edge; kerf ' + round(ctx.kerf, 1) + ' mm is allowed between parts.');
    notes.push('Straight-cut (guillotine) plan for a panel saw or track saw — dimensions govern, not the diagram.');
    notes.push('Objective: ' + (OBJECTIVE_LABEL[objective] || objective) + ' (' + candidate.id + ').');
    if (ctx.sheet.isSheet) notes.push('Sheet: ' + ctx.sheet.label + '; grain along the ' + round(Math.max(ctx.sheet.width, ctx.sheet.height), 0) + ' mm dimension.');
    if (candidate.unplaced.length > 0) {
      notes.push(candidate.unplaced.length + ' part(s) could not be nested; check the sheet size or split them.');
    }
    return notes;
  }

  /**
   * Plan every sheet-goods material: generate deterministic candidates, choose the best per
   * objective, and return the layouts for the selected objective plus trade-off metrics for both.
   *
   * @param {Object} cutList
   * @param {Object} project
   * @returns {{objective:string, layouts:Array, tradeoff:Object, candidates:Array}}
   */
  function planSheets(cutList, project) {
    var settings = settingsFor(project);
    var byMaterial = {};
    var order = [];
    var i;
    for (i = 0; i < cutList.groups.length; i++) {
      var group = cutList.groups[i];
      var material = defaults.material(group.materialId);
      if (!isSheetGood(material)) continue;
      var merged = byMaterial[group.materialId];
      if (!merged) {
        merged = byMaterial[group.materialId] = {
          materialId: group.materialId,
          materialName: group.materialName,
          thickness: group.thickness,
          thicknesses: [],
          sheet: group.sheet,
          rows: []
        };
        order.push(group.materialId);
      }
      if (merged.thicknesses.indexOf(group.thickness) === -1) merged.thicknesses.push(group.thickness);
      merged.rows = merged.rows.concat(group.rows);
    }

    var layouts = [];
    var candidateReport = [];
    var tradeoff = {
      leastSheets: { sheetCount: 0, totalCuts: 0, yieldPct: 0 },
      leastCuts: { sheetCount: 0, totalCuts: 0, yieldPct: 0 }
    };
    for (var o = 0; o < order.length; o++) {
      var m = byMaterial[order[o]];
      var ctx = plannerContext(m, project, settings);
      var candidates = candidatesForGroup(m, ctx);
      var bestSheets = chooseCandidate(candidates, 'leastSheets');
      var bestCuts = chooseCandidate(candidates, 'leastCuts');
      function accumulate(t, best) {
        t.sheetCount += best.sheetCount;
        t.breakdownCuts = (t.breakdownCuts || 0) + best.breakdownCuts;
        t.trimCuts = (t.trimCuts || 0) + best.trimCuts;
        t.usedAreaM2 = round((t.usedAreaM2 || 0) + best.usedAreaM2, 4);
        t.sheetAreaM2 = round((t.sheetAreaM2 || 0) + best.sheetAreaM2, 4);
      }
      accumulate(tradeoff.leastSheets, bestSheets);
      accumulate(tradeoff.leastCuts, bestCuts);
      var chosen = settings.objective === 'leastCuts' ? bestCuts : bestSheets;
      layouts.push({
        materialId: m.materialId,
        materialName: m.materialName,
        thickness: m.thickness,
        thicknesses: m.thicknesses.slice().sort(function (a, b) { return a - b; }),
        sheet: ctx.sheet,
        kerf: round(ctx.kerf, 2),
        trim: round(ctx.trim, 2),
        objective: settings.objective,
        strategy: chosen.id,
        sheets: chosen.sheets,
        unplaced: chosen.unplaced,
        notes: materialNotes(ctx, chosen, settings.objective),
        // Layout-level metrics for UI/PDF robustness (also mirrored in `stats`).
        sheetCount: chosen.sheetCount,
        yieldPct: chosen.yieldPct,
        totalCuts: chosen.totalCuts,         // every saw cut (trim + breakdown)
        breakdownCuts: chosen.breakdownCuts,
        trimCuts: chosen.trimCuts,           // 4 per sheet when trim > 0 (outside the cut tree)
        totalSawCuts: chosen.totalCuts,
        wasteAreaM2: chosen.wasteAreaM2,
        usedAreaM2: chosen.usedAreaM2,
        sheetAreaM2: chosen.sheetAreaM2,
        stats: {
          sheetCount: chosen.sheetCount,
          cutCount: chosen.breakdownCuts,
          breakdownCuts: chosen.breakdownCuts,
          trimCuts: chosen.trimCuts,
          totalCuts: chosen.totalCuts,
          yieldPct: chosen.yieldPct,
          wasteAreaM2: chosen.wasteAreaM2
        }
      });
      candidateReport.push({
        materialId: m.materialId,
        materialName: m.materialName,
        candidates: candidates.map(candidateSummary),
        chosen: { leastSheets: bestSheets.id, leastCuts: bestCuts.id }
      });
    }
    function finishTradeoff(t) {
      t.yieldPct = t.sheetAreaM2 > 0 ? round(100 * t.usedAreaM2 / t.sheetAreaM2, 2) : 0;
      t.usedAreaM2 = round(t.usedAreaM2 || 0, 3);
      t.sheetAreaM2 = round(t.sheetAreaM2 || 0, 3);
      t.wasteAreaM2 = round((t.sheetAreaM2 || 0) - (t.usedAreaM2 || 0), 3);
      // Binding rollup: aggregate cutCount/totalCuts = every saw cut; breakdownCuts + trimCuts are
      // exposed separately (per-sheet cutCount remains the breakdown count).
      t.totalSawCuts = (t.breakdownCuts || 0) + (t.trimCuts || 0);
      t.cutCount = t.totalSawCuts;
      t.totalCuts = t.totalSawCuts; // backwards-compatible alias
      return t;
    }
    return {
      objective: settings.objective,
      settings: settings,
      layouts: layouts,
      tradeoff: { leastSheets: finishTradeoff(tradeoff.leastSheets), leastCuts: finishTradeoff(tradeoff.leastCuts) },
      candidates: candidateReport
    };
  }

  // =============================================================================================
  // Solid stock + purchase
  // =============================================================================================

  /**
   * Board footage for solid-stock parts from the cut list rows.
   * Net bf = finished part volume; purchase bf = ceil(net × (1 + allowance)) per material.
   */
  function solidStockSummary(cutList, project) {
    var settings = settingsFor(project);
    var dressingPct = settings.solidStockDressingPct;
    var defectPct = settings.solidStockWastePct;
    var byMaterial = {};
    var order = [];
    var partsCount = 0;
    for (var i = 0; i < cutList.groups.length; i++) {
      var group = cutList.groups[i];
      var material = defaults.material(group.materialId);
      if (material.category !== 'solid') continue;
      for (var r = 0; r < group.rows.length; r++) {
        var row = group.rows[r];
        var key = group.materialId + '|' + row.thickness;
        var rec = byMaterial[key];
        if (!rec) {
          rec = byMaterial[key] = {
            materialId: group.materialId,
            materialName: group.materialName,
            thickness: row.thickness,
            parts: 0,
            netBoardFeet: 0
          };
          order.push(key);
        }
        rec.parts += row.qty;
        rec.netBoardFeet += (row.length * row.width * row.thickness * row.qty) / MM3_PER_BOARD_FOOT;
        partsCount += row.qty;
      }
    }
    var materials = [];
    var netTotal = 0, dressingTotal = 0, defectTotal = 0, roundingTotal = 0, purchaseTotal = 0;
    for (var o = 0; o < order.length; o++) {
      var m = byMaterial[order[o]];
      var net = m.netBoardFeet;
      var dressing = net * (dressingPct / 100);
      var afterDressing = net + dressing;
      var defect = afterDressing * (defectPct / 100);
      // Purchase is rounded up to whole board feet, per material.
      var purchase = Math.ceil(afterDressing + defect - 0.000001);
      if (purchase < 1) purchase = net > 0 ? 1 : 0;
      var rounding = purchase - (net + dressing + defect);
      netTotal += net; dressingTotal += dressing; defectTotal += defect;
      roundingTotal += rounding; purchaseTotal += purchase;
      var breakdown = {
        netBoardFeet: round(net, 3),
        dressingPct: dressingPct,
        dressingBoardFeet: round(dressing, 3),
        defectPct: defectPct,
        defectBoardFeet: round(defect, 3),
        roundingBoardFeet: round(rounding, 3),
        purchaseBoardFeet: purchase
      };
      materials.push({
        materialId: m.materialId,
        materialName: m.materialName,
        thickness: m.thickness,
        parts: m.parts,
        netBoardFeet: breakdown.netBoardFeet,
        dressingPct: dressingPct,
        dressingBoardFeet: breakdown.dressingBoardFeet,
        defectPct: defectPct,
        allowancePct: defectPct, // backwards-compatible alias for the defect/waste allowance
        defectBoardFeet: breakdown.defectBoardFeet,
        roundingBoardFeet: breakdown.roundingBoardFeet,
        purchaseBoardFeet: purchase,
        breakdown: breakdown
      });
    }
    materials.sort(function (a, b) {
      if (a.materialId !== b.materialId) return compareLabel(a.materialId, b.materialId);
      return a.thickness - b.thickness;
    });
    return {
      partsCount: partsCount,
      netBoardFeet: round(netTotal, 3),
      dressingPct: dressingPct,
      dressingBoardFeet: round(dressingTotal, 3),
      defectPct: defectPct,
      allowancePct: defectPct,
      defectBoardFeet: round(defectTotal, 3),
      roundingBoardFeet: round(roundingTotal, 3),
      purchaseBoardFeet: purchaseTotal,
      basis: 'net finished board feet + ' + dressingPct + '% rough-dressing allowance + ' + defectPct + '% defect allowance, rounded up to whole bf per material',
      materials: materials
    };
  }

  /**
   * Assemble the `optimization` object (spec §3) from the chosen layouts + cut list.
   * @param {Object} cutList
   * @param {Array} layouts sheet layouts (chosen objective)
   * @param {Object} project
   * @param {Object} tradeoff both-objective totals from planSheets
   * @returns {Object} Resolved.optimization
   */
  function buildOptimization(cutList, layouts, project, tradeoff) {
    var settings = settingsFor(project);
    var sheetCount = 0;
    var sheetAreaM2 = 0;
    var usedAreaM2 = 0;
    var cuts = { total: 0, trim: 0, breakdown: 0, crosscuts: 0, rips: 0 };
    var offcutItems = [];
    var materials = [];
    var i, s, c, o;

    // Bindrag rollup (Lead, spec §3): aggregate `cuts.total` = every saw cut (trim + breakdown);
    // `breakdown` = crosscuts + rips; `trim` = 4 per trimmed sheet. Per-sheet `cutCount` is the
    // breakdown count only. `totalSawCuts` is an alias for the aggregate total.
    function withSawTotal(c) {
      c.totalSawCuts = c.total;
      return c;
    }

    function countCuts(sheet) {
      var local = { total: 0, trim: 0, breakdown: 0, crosscuts: 0, rips: 0 };
      local.trim = num(sheet.trimCuts, 0);
      for (var k = 0; k < (sheet.cuts || []).length; k++) {
        var cut = sheet.cuts[k];
        local.breakdown += 1;
        if (cut.type === 'crosscut') local.crosscuts += 1;
        else if (cut.type === 'rip') local.rips += 1;
      }
      local.total = local.breakdown + local.trim;
      return local;
    }

    for (i = 0; i < layouts.length; i++) {
      var layout = layouts[i];
      var matCuts = { total: 0, trim: 0, breakdown: 0, crosscuts: 0, rips: 0 };
      var matOffcuts = { count: 0, areaM2: 0, reusableCount: 0, reusableAreaM2: 0 };
      var matUsed = 0;
      var matSheetArea = 0;
      for (s = 0; s < layout.sheets.length; s++) {
        var sheet = layout.sheets[s];
        sheetCount += 1;
        var sheetArea = layout.sheet.width * layout.sheet.height;
        matSheetArea += sheetArea;
        matUsed += sheet.usedArea;
        var sc = countCuts(sheet);
        matCuts.total += sc.total;
        matCuts.trim += sc.trim;
        matCuts.breakdown += sc.breakdown;
        matCuts.crosscuts += sc.crosscuts;
        matCuts.rips += sc.rips;
        for (o = 0; o < sheet.offcuts.length; o++) {
          var off = sheet.offcuts[o];
          matOffcuts.count += 1;
          matOffcuts.areaM2 += off.areaM2;
          if (off.reusable) {
            matOffcuts.reusableCount += 1;
            matOffcuts.reusableAreaM2 += off.areaM2;
          }
          offcutItems.push({
            materialId: layout.materialId,
            materialName: layout.materialName,
            sheetIndex: sheet.index,
            x: off.x, y: off.y, width: off.width, height: off.height,
            areaM2: off.areaM2, reusable: off.reusable
          });
        }
      }
      sheetAreaM2 += matSheetArea;
      usedAreaM2 += matUsed;
      cuts.total += matCuts.total;
      cuts.trim += matCuts.trim;
      cuts.breakdown += matCuts.breakdown;
      cuts.crosscuts += matCuts.crosscuts;
      cuts.rips += matCuts.rips;
      materials.push({
        materialId: layout.materialId,
        materialName: layout.materialName,
        thickness: layout.thickness,
        thicknesses: layout.thicknesses || [layout.thickness],
        sheetCount: layout.sheets.length,
        sheetAreaM2: round(matSheetArea / 1e6, 4),
        usedAreaM2: round(matUsed / 1e6, 4),
        wasteAreaM2: round((matSheetArea - matUsed) / 1e6, 4),
        yieldPct: matSheetArea > 0 ? round(100 * matUsed / matSheetArea, 2) : 0,
        cuts: withSawTotal(matCuts),
        offcuts: {
          count: matOffcuts.count,
          areaM2: round(matOffcuts.areaM2, 3),
          reusableCount: matOffcuts.reusableCount,
          reusableAreaM2: round(matOffcuts.reusableAreaM2, 3)
        },
        objective: layout.objective,
        strategy: layout.strategy,
        sheets: layout.sheets
      });
    }

    var offcutCount = offcutItems.length;
    var offcutArea = 0, reusableCount = 0, reusableArea = 0;
    for (i = 0; i < offcutItems.length; i++) {
      offcutArea += offcutItems[i].areaM2;
      if (offcutItems[i].reusable) { reusableCount += 1; reusableArea += offcutItems[i].areaM2; }
    }
    sheetAreaM2 = round(sheetAreaM2 / 1e6, 4);
    usedAreaM2 = round(usedAreaM2 / 1e6, 4);
    var yieldPct = sheetAreaM2 > 0 ? round(100 * usedAreaM2 / sheetAreaM2, 2) : 0;

    var solid = solidStockSummary(cutList, project);
    var sheetGoodsPurchase = [];
    for (i = 0; i < layouts.length; i++) {
      var lay = layouts[i];
      sheetGoodsPurchase.push({
        materialId: lay.materialId,
        materialName: lay.materialName,
        thickness: lay.thickness,
        sheets: lay.sheets.length,
        unit: 'sheet',
        note: (lay.sheet.label || '') + '; trim ' + round(lay.trim, 1) + ' mm, kerf ' + round(lay.kerf, 1) + ' mm; exact for the ' + OBJECTIVE_LABEL[lay.objective] + ' plan' + (lay.thicknesses && lay.thicknesses.length > 1 ? ' (thicknesses ' + lay.thicknesses.join('/') + ' mm)' : '')
      });
    }
    var solidPurchase = solid.materials.map(function (m) {
      return {
        materialId: m.materialId,
        materialName: m.materialName,
        thickness: m.thickness,
        netBoardFeet: m.netBoardFeet,
        dressingPct: solid.dressingPct,
        dressingBoardFeet: m.dressingBoardFeet,
        defectPct: solid.defectPct,
        defectBoardFeet: m.defectBoardFeet,
        boardFeet: m.purchaseBoardFeet,
        unit: 'bf',
        note: 'Net ' + m.netBoardFeet + ' bf → +' + solid.dressingPct + '% rough dressing (' + m.dressingBoardFeet +
          ' bf) → +' + solid.defectPct + '% defect allowance (' + m.defectBoardFeet + ' bf) → ' +
          m.purchaseBoardFeet + ' bf to buy'
      };
    });

    var notes = [
      'Straight-cut (guillotine) plan for a panel saw or track saw; verify grain direction and sheet condition before cutting.',
      'Kerf ' + round(settings.kerf, 1) + ' mm and edge trim ' + round(settings.trim, 1) + ' mm are included in the layouts and saw-cut counts.',
      'Required sheet counts are exact for this plan; a spare sheet for defects is optional and is not included.',
      'Solid stock: net finished board feet + ' + solid.dressingPct + '% rough-dressing allowance + ' + solid.defectPct +
        '% defect allowance; purchase is rounded up to whole board feet per material.'
    ];
    if (offcutCount > 0) {
      notes.push(offcutCount + ' offcut(s) kept, ' + reusableCount + ' reusable (' + round(reusableArea, 3) + ' m²) with a ' + settings.offcutMinWidth + ' × ' + settings.offcutMinLength + ' mm minimum.');
    }

    // The other objective's metrics (computed from the same deterministic candidates) so the UI
    // can show the trade-off without re-resolving. delta = alternative − selected.
    var otherObjective = settings.objective === 'leastCuts' ? 'leastSheets' : 'leastCuts';
    var alternative = null;
    if (tradeoff && tradeoff[otherObjective] && sheetCount > 0) {
      var alt = tradeoff[otherObjective];
      var altCuts = alt.totalSawCuts;
      alternative = {
        objective: otherObjective,
        objectiveLabel: OBJECTIVE_LABEL[otherObjective],
        label: OBJECTIVE_LABEL[otherObjective],
        sheets: alt.sheetCount,
        cuts: altCuts,                       // every saw cut, same rollup as optimization.cuts.total
        sheetCount: alt.sheetCount,
        cutCount: altCuts,
        breakdown: alt.breakdownCuts,
        breakdownCuts: alt.breakdownCuts,
        trim: alt.trimCuts,
        trimCuts: alt.trimCuts,
        totalSawCuts: altCuts,
        yieldPct: alt.yieldPct,
        sheetAreaM2: alt.sheetAreaM2,
        usedAreaM2: alt.usedAreaM2,
        // delta = alternative − selected (positive = the alternative needs more sheets/cuts).
        delta: {
          sheets: alt.sheetCount - sheetCount,
          cuts: altCuts - cuts.total,
          sheetCount: alt.sheetCount - sheetCount,
          cutCount: altCuts - cuts.total,
          yieldPct: round(alt.yieldPct - yieldPct, 2)
        }
      };
    }

    return {
      objective: settings.objective,
      objectiveLabel: OBJECTIVE_LABEL[settings.objective],
      alternative: alternative,
      sheetGoods: {
        sheetCount: sheetCount,
        sheetAreaM2: sheetAreaM2,
        usedAreaM2: usedAreaM2,
        wasteAreaM2: round(sheetAreaM2 - usedAreaM2, 4),
        yieldPct: yieldPct,
        kerf: round(settings.kerf, 2),
        trim: round(settings.trim, 2),
        cuts: withSawTotal(cuts),
        offcuts: {
          count: offcutCount,
          areaM2: round(offcutArea, 3),
          reusableCount: reusableCount,
          reusableAreaM2: round(reusableArea, 3),
          minWidth: settings.offcutMinWidth,
          minLength: settings.offcutMinLength,
          items: offcutItems
        },
        materials: materials
      },
      solidStock: solid,
      purchase: {
        sheetGoods: sheetGoodsPurchase,
        solidStock: solidPurchase,
        edgebandMetres: cutList.totals.edgebandMetres,
        notes: notes
      },
      tradeoff: tradeoff || null
    };
  }

  /**
   * Build the complete material plan (layouts + optimization + totals) in one call.
   * @param {Object} cutList result of buildCutList
   * @param {Object} project normalised project
   * @returns {{objective:string, layouts:Array, optimization:Object}}
   */
  function buildMaterialPlan(cutList, project) {
    var plan = planSheets(cutList, project);
    finishTotals(cutList, plan.layouts, project);
    var optimization = buildOptimization(cutList, plan.layouts, project, plan.tradeoff);
    cutList.totals.cutCount = optimization.sheetGoods.cuts.total;
    cutList.totals.breakdownCutCount = optimization.sheetGoods.cuts.breakdown;
    cutList.totals.trimCutCount = optimization.sheetGoods.cuts.trim;
    cutList.totals.totalSawCuts = optimization.sheetGoods.cuts.total;
    cutList.totals.offcutCount = optimization.sheetGoods.offcuts.count;
    cutList.totals.solidBoardFeet = optimization.solidStock.netBoardFeet;
    cutList.totals.purchaseBoardFeet = optimization.solidStock.purchaseBoardFeet;
    cutList.totals.purchaseSheets = optimization.sheetGoods.sheetCount;
    return { objective: plan.objective, layouts: plan.layouts, optimization: optimization, candidates: plan.candidates, tradeoff: plan.tradeoff };
  }

  /**
   * GUILLOTINE VALIDATOR — reconstructs every placement from the cut sequence and proves the
   * sheet partitions cleanly. Used by the engine tests and available to QA/UI/PDF.
   *
   * @param {Object} layout a SheetLayout from resolved.sheetLayouts
   * @returns {{ok:boolean, errors:string[], sheetsChecked:number}}
   */
  function validateGuillotine(layout) {
    var errors = [];
    var trim = num(layout.trim, 0);
    var kerf = num(layout.kerf, 0);
    var sheet = layout.sheet || { width: 0, height: 0 };
    var usableW = round(sheet.width - 2 * trim, 2);
    var usableH = round(sheet.height - 2 * trim, 2);
    var checked = 0;
    function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 0.05 : tol); }
    for (var s = 0; s < (layout.sheets || []).length; s++) {
      var sheetResult = layout.sheets[s];
      // Start from the trimmed usable rectangle in the ABSOLUTE sheet frame.
      var pieces = [{ x: trim, y: trim, w: usableW, h: usableH }];
      var cuts = sheetResult.cuts || [];
      for (var c = 0; c < cuts.length; c++) {
        var cut = cuts[c];
        var vertical = cut.axis !== 'y'; // axis 'x' = vertical cut, axis 'y' = horizontal cut
        var pos = num(cut.position, NaN);
        if (!isFinitePositive(cut.length) || !isFinite(pos)) {
          errors.push('sheet ' + sheetResult.index + ': cut ' + cut.seq + ' has invalid position/length');
          break;
        }
        var from = cut.from, to = cut.to;
        if (!Array.isArray(from) || !Array.isArray(to)) {
          // Fall back to position/length when endpoints are absent (legacy layouts).
          from = vertical ? [pos, trim] : [trim, pos];
          to = vertical ? [pos, trim + usableH] : [trim + usableW, pos];
        }
        // Find the unique current piece this cut splits.
        var hits = [];
        for (var i = 0; i < pieces.length; i++) {
          var pc = pieces[i];
          var ok;
          if (vertical) {
            ok = pos > pc.x + EPS && pos < pc.x + pc.w - EPS &&
              near(from[1], pc.y) && near(to[1], pc.y + pc.h) &&
              near(from[0], pos) && near(to[0], pos) &&
              near(cut.length, pc.h);
          } else {
            ok = pos > pc.y + EPS && pos < pc.y + pc.h - EPS &&
              near(from[0], pc.x) && near(to[0], pc.x + pc.w) &&
              near(from[1], pos) && near(to[1], pos) &&
              near(cut.length, pc.w);
          }
          if (ok) hits.push(i);
        }
        if (hits.length !== 1) {
          errors.push('sheet ' + sheetResult.index + ': cut ' + cut.seq + ' intersects ' + hits.length + ' current pieces (expected exactly 1)');
          break;
        }
        var idx = hits[0];
        var src = pieces[idx];
        var local = vertical ? pos - src.x : pos - src.y;
        var dim = vertical ? src.w : src.h;
        if (!(local > EPS && local < dim - EPS)) {
          errors.push('sheet ' + sheetResult.index + ': cut ' + cut.seq + ' is not fully inside its piece');
          break;
        }
        var width = num(cut.width, kerf);
        if (width < 0) {
          errors.push('sheet ' + sheetResult.index + ': cut ' + cut.seq + ' has negative kerf');
          break;
        }
        var a, b;
        if (vertical) {
          a = { x: src.x, y: src.y, w: local, h: src.h };
          b = { x: src.x + local + width, y: src.y, w: src.w - local - width, h: src.h };
        } else {
          a = { x: src.x, y: src.y, w: src.w, h: local };
          b = { x: src.x, y: src.y + local + width, w: src.w, h: src.h - local - width };
        }
        var emptyRemainder = (vertical ? b.w : b.h) <= EPS;
        pieces.splice(idx, 1);
        if (emptyRemainder) {
          // Cut at the very edge: part + remaining sliver (<= kerf) = piece.
          var sliver = dim - local;
          if (sliver > Math.max(num(cut.width, kerf), kerf) + 0.05) {
            errors.push('sheet ' + sheetResult.index + ': cut ' + cut.seq + ' leaves a non-positive remainder');
            break;
          }
          pieces.push(a);
        } else {
          pieces.push(a, b);
        }
      }
      if (errors.length) break;
      // Placements must be exactly the part leaves.
      var placements = sheetResult.placements || [];
      var leaves = pieces.map(function (p) { return p; });
      var used = {};
      function findLeaf(pl) {
        for (var l = 0; l < leaves.length; l++) {
          var lf = leaves[l];
          if (used[l]) continue;
          if (near(lf.x, pl.x) && near(lf.y, pl.y) && near(lf.w, pl.width) && near(lf.h, pl.height)) {
            used[l] = true;
            return lf;
          }
        }
        return null;
      }
      for (var p = 0; p < placements.length; p++) {
        var pl = placements[p];
        if (!findLeaf(pl)) {
          errors.push('sheet ' + sheetResult.index + ': placement ' + pl.label + ' is not a leaf of the cut tree');
          break;
        }
        // Grain: length-grain parts keep their length along the sheet grain direction.
        var grainAxis = grainAxisFor(sheet);
        if (pl.grain === 'length' && grainAxis === 'y' && pl.rotated !== true) {
          errors.push('sheet ' + sheetResult.index + ': grain-length part ' + pl.label + ' is not aligned with the sheet grain');
        }
        if (pl.grain === 'width' && grainAxis === 'y' && pl.rotated !== false) {
          errors.push('sheet ' + sheetResult.index + ': grain-width part ' + pl.label + ' is not aligned with the sheet grain');
        }
        if (pl.x < trim - 0.05 || pl.y < trim - 0.05 ||
            pl.x + pl.width > sheet.width - trim + 0.05 || pl.y + pl.height > sheet.height - trim + 0.05) {
          errors.push('sheet ' + sheetResult.index + ': placement ' + pl.label + ' outside the usable sheet');
        }
      }
      if (errors.length) break;
      // Every remaining leaf must be listed as an offcut.
      var leftover = [];
      for (var l2 = 0; l2 < leaves.length; l2++) if (!used[l2]) leftover.push(leaves[l2]);
      var offcuts = sheetResult.offcuts || [];
      if (leftover.length !== offcuts.length) {
        errors.push('sheet ' + sheetResult.index + ': ' + leftover.length + ' leftover leaves but ' + offcuts.length + ' offcuts listed');
        break;
      }
      var matched = {};
      for (var o = 0; o < offcuts.length; o++) {
        var off = offcuts[o];
        var found = -1;
        for (var l3 = 0; l3 < leftover.length; l3++) {
          if (matched[l3]) continue;
          if (near(leftover[l3].x, off.x) && near(leftover[l3].y, off.y) && near(leftover[l3].w, off.width) && near(leftover[l3].h, off.height)) { found = l3; break; }
        }
        if (found === -1) { errors.push('sheet ' + sheetResult.index + ': offcut ' + o + ' does not match a leftover leaf'); break; }
        matched[found] = true;
      }
      if (errors.length) break;
      checked += 1;
    }
    return { ok: errors.length === 0, errors: errors, sheetsChecked: checked };
  }

  /**
   * Area reconciliation helper: placements + offcuts + saw kerf + edge trim should equal the sheet
   * area. Useful for QA and for the "where is the waste" explanation.
   */
  function areaBreakdown(layout, sheetResult) {
    var sheet = layout.sheet;
    var trim = num(layout.trim, 0);
    var sheetArea = sheet.width * sheet.height / 1e6;
    var trimArea = (sheetArea * 1e6 - (sheet.width - 2 * trim) * (sheet.height - 2 * trim)) / 1e6;
    var placementArea = 0, offcutArea = 0, kerfArea = 0;
    for (var i = 0; i < (sheetResult.placements || []).length; i++) {
      placementArea += sheetResult.placements[i].width * sheetResult.placements[i].height;
    }
    for (var o = 0; o < (sheetResult.offcuts || []).length; o++) {
      offcutArea += sheetResult.offcuts[o].width * sheetResult.offcuts[o].height;
    }
    for (var c = 0; c < (sheetResult.cuts || []).length; c++) {
      var cut = sheetResult.cuts[c];
      if (cut.type === 'trim') continue;
      var removed = cut.kerfRemoved != null ? num(cut.kerfRemoved, 0) : num(cut.width, 0);
      kerfArea += removed * num(cut.length, 0);
    }
    placementArea = placementArea / 1e6;
    offcutArea = offcutArea / 1e6;
    kerfArea = kerfArea / 1e6;
    var explained = trimArea + placementArea + offcutArea + kerfArea;
    return {
      sheetAreaM2: round(sheetArea, 5),
      trimAreaM2: round(trimArea, 5),
      placementAreaM2: round(placementArea, 5),
      offcutAreaM2: round(offcutArea, 5),
      kerfAreaM2: round(kerfArea, 5),
      explainedAreaM2: round(explained, 5),
      differenceM2: round(sheetArea - explained, 5)
    };
  }

  // =============================================================================================
  // Backwards-compatible wrappers
  // =============================================================================================

  /** Build sheet layouts for the project's objective (single material planner entry point). */
  function buildSheetLayouts(cutList, project) {
    return planSheets(cutList, project).layouts;
  }

  /**
   * Legacy single-group packer wrapper. Plans one material group and returns its sheets/unplaced.
   */
  function nestGroup(group, project) {
    var settings = settingsFor(project);
    var ctx = plannerContext(group, project, settings);
    var candidates = candidatesForGroup(group, ctx);
    var chosen = chooseCandidate(candidates, settings.objective);
    return {
      sheets: chosen.sheets,
      unplaced: chosen.unplaced,
      notes: materialNotes(ctx, chosen, settings.objective),
      sheet: ctx.sheet,
      objective: settings.objective,
      cutCount: chosen.totalCuts
    };
  }

  function nestBest(group, project) { return nestGroup(group, project); }

  /**
   * Fill cut-list totals after nesting (kept for compatibility; buildMaterialPlan does this too).
   */
  function finishTotals(cutList, sheetLayouts, project) {
    var sheetCount = 0;
    var sheetArea = 0;
    var usedArea = 0;
    var cutCount = 0;
    var offcutCount = 0;
    for (var i = 0; i < sheetLayouts.length; i++) {
      var layout = sheetLayouts[i];
      sheetCount += layout.sheets.length;
      for (var s = 0; s < layout.sheets.length; s++) {
        var sheet = layout.sheets[s];
        sheetArea += layout.sheet.width * layout.sheet.height / 1e6;
        usedArea += sheet.usedArea / 1e6;
        cutCount += sheet.cutCount || 0;
        offcutCount += (sheet.offcuts || []).length;
      }
    }
    cutList.totals.sheetCount = sheetCount;
    cutList.totals.sheetAreaM2 = round(sheetArea, 3);
    cutList.totals.yieldPct = sheetArea > 0 ? round(100 * usedArea / sheetArea, 1) : 0;
    cutList.totals.cutCount = cutCount;
    cutList.totals.trimCutCount = (cutList.totals.trimCutCount || 0);
    cutList.totals.offcutCount = offcutCount;
    cutList.totals.purchaseSheets = sheetCount;
    var solid = solidStockSummary(cutList, project);
    cutList.totals.solidBoardFeet = solid.netBoardFeet;
    cutList.totals.purchaseBoardFeet = solid.purchaseBoardFeet;
    return cutList.totals;
  }

  /**
   * Aggregate hardware from all cabinet models by template id.
   *
   * @param {Array} cabinetModels resolved cabinet models
   * @returns {Array} [HardwareItem]
   */
  function aggregateHardware(cabinetModels) {
    var byTemplate = {};
    var order = [];
    for (var i = 0; i < cabinetModels.length; i++) {
      var hw = (cabinetModels[i] && cabinetModels[i].hardware) || [];
      for (var j = 0; j < hw.length; j++) {
        var item = hw[j];
        var key = (item.templateId || item.name) + '|' + item.unit;
        var rec = byTemplate[key];
        if (!rec) {
          rec = byTemplate[key] = {
            templateId: item.templateId,
            name: item.name,
            category: item.category,
            qty: 0,
            unit: item.unit,
            partIds: [],
            cabinets: [],
            notes: [],
            install: item.install || ''
          };
          order.push(key);
        }
        rec.qty = round(rec.qty + num(item.qty, 0), 2);
        if (item.cabinetTag && rec.cabinets.indexOf(item.cabinetTag) === -1) rec.cabinets.push(item.cabinetTag);
        if (Array.isArray(item.partIds)) {
          for (var p = 0; p < item.partIds.length; p++) {
            if (item.partIds[p] && rec.partIds.indexOf(item.partIds[p]) === -1) rec.partIds.push(item.partIds[p]);
          }
        }
        if (item.notes && rec.notes.indexOf(item.notes) === -1) rec.notes.push(item.notes);
      }
    }
    var out = [];
    for (var o = 0; o < order.length; o++) {
      var r = byTemplate[order[o]];
      out.push({
        id: 'HW-' + (o + 1 < 10 ? '0' : '') + (o + 1),
        templateId: r.templateId,
        name: r.name,
        category: r.category,
        qty: r.qty,
        unit: r.unit,
        cabinetId: null,
        cabinetTag: null,
        cabinets: r.cabinets,
        partIds: r.partIds,
        notes: r.notes.join(' '),
        install: r.install
      });
    }
    return out;
  }

  var api = {
    // contract API
    buildCutList: buildCutList,
    buildSheetLayouts: buildSheetLayouts,
    aggregateHardware: aggregateHardware,
    finishTotals: finishTotals,
    // material planner
    buildMaterialPlan: buildMaterialPlan,
    planSheets: planSheets,
    buildOptimization: buildOptimization,
    solidStockSummary: solidStockSummary,
    candidatesForGroup: candidatesForGroup,
    settingsFor: settingsFor,
    normalizeObjective: normalizeObjective,
    validateGuillotine: validateGuillotine,
    areaBreakdown: areaBreakdown,
    // compatibility
    nestBest: nestBest,
    nestGroup: nestGroup,
    // material helpers
    isSheetGood: isSheetGood,
    stockLabel: stockLabel,
    sheetFor: sheetFor,
    sheetLabel: sheetLabel,
    OBJECTIVE_LABEL: OBJECTIVE_LABEL,
    MM3_PER_BOARD_FOOT: MM3_PER_BOARD_FOOT
  };

  CS.engine = CS.engine || {};
  CS.engine.cutlist = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
