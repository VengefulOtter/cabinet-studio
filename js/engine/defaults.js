/**
 * Cabinet Studio engine — defaults, standards, materials, hardware and normalisation.
 *
 * This file is the single source of truth for numeric defaults (§12 of the contract) and the
 * fallback material / hardware catalogue. At call time it may enrich itself from
 * `CS.data.techniques` (the researched catalogue); if that file is missing, incomplete or malformed
 * the hard-coded fallbacks below drive the engine. No DOM, no network, no mutation of inputs.
 *
 * Units: millimetres everywhere. Option ids are the exact strings from contract §5.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});

  /** Millimetres per inch. */
  var MM_PER_IN = 25.4;

  // ---------------------------------------------------------------------------------------------
  // Standards (contract §5 table + shop constants). Resolved through `standards()` so the
  // research catalogue can refine values at call time.
  // ---------------------------------------------------------------------------------------------
  var BASE_STANDARDS = {
    dims: {
      base: { height: 876.3, toeKick: 101.6, depth: 609.6, counterHeight: 914.4, minWidth: 152.4, maxWidth: 1219.2, minHeight: 400, maxHeight: 1200 },
      wall: { height: 762, depth: 304.8, aboveCounter: 457.2, minWidth: 152.4, maxWidth: 1219.2, minHeight: 250, maxHeight: 1200 },
      tall: { height: 2133.6, depth: 609.6, minWidth: 304.8, maxWidth: 1219.2, minHeight: 1200, maxHeight: 2438.4 },
      pantry: { height: 2133.6, depth: 609.6, minWidth: 304.8, maxWidth: 1219.2, minHeight: 1200, maxHeight: 2438.4 },
      standardWidths: [228.6, 304.8, 381, 457.2, 533.4, 609.6, 685.8, 762, 838.2, 914.4, 1066.8, 1219.2]
    },
    reveal: 3.0,
    door: {
      thickness: 19, panelThickness: 6.35, stileWidth: 57.15, railWidth: 57.15, panelFloat: 2.0,
      panelGrooveDepth: 10, maxLeafWidth: 609.6, minFrameOpening: 60, gapMax: 6,
      hingeCup: {
        diameter: 35, depth: 13.0, edgeDistance: 22.5, screwSpacing: 45, screwDiameter: 3.5,
        screwDepth: 12, plateSetback: 37, plateSpacing: 32, endOffset: 75, minPerDoor: 2, maxPerDoor: 6
      },
      glassRabbet: { width: 12, depth: 6 }
    },
    shelf: {
      thickness: 18, pinDiameter: 5, pinDepth: 12, pinSpacing: 32, frontSetback: 37, rearSetback: 37,
      adjustableClearance: 0.5, backClearance: 2, minPinsPerShelf: 4, pinStartOffset: 100, pinEndClearance: 50,
      maxSpanByThickness: { 12: 600, 16: 750, 18: 900, 19: 900, 25: 1200 }
    },
    drawer: {
      boxSideThickness: 12.7, boxBottomThickness: 6.35,
      // researched: slide lengths at 3" increments; each family carries its own clearances
      slideLengths: [229, 305, 381, 457, 533, 610, 686, 762],
      undermountClearance: 42, sideMountClearance: 25.4, centerMountClearance: 6.35,
      rearClearance: { undermount: 40, 'side-mount': 25, 'center-mount': 31.75 },
      bottomClearance: { undermount: 12.7, 'side-mount': 3, 'center-mount': 3 },
      minVerticalClearance: { undermount: 20.6, 'side-mount': 46, 'center-mount': 25.4 },
      bottomMaterial: 'ply-birch-6', boxHeightAllowance: 25, minBoxHeight: 80, boxBottomInset: 10, minFrontHeight: 90,
      topDrawerRatio: 0.25, topDrawerMax: 180, boxBottomDadoDepth: 6, boxBottomDadoWidth: 6.35,
      undermountNotch: { width: 15, height: 12.7 }
    },
    // Fallbacks for the researched slide-family rules (catalogue overrides at call time).
    drawerFamilies: {
      undermount: {
        widthRule: 'insideWidth = opening - 42', insideWidthClearance: 42,
        outsideWidthFormula: 'opening - 42 + 2 * sideThickness', bottomRecess: 12.7,
        boxDepthEqualsSlideNominal: true, rearClearance: 40, minVerticalClearance: 20.6,
        lengthsMm: [229, 305, 381, 457, 533, 610, 686, 762]
      },
      sideMount: {
        widthRule: 'outsideWidth = opening - 25.4', sideClearancePerSide: 12.7,
        outsideWidthClearance: 25.4, profileHeight: 46, rearClearance: 25,
        lengthsMm: [254, 305, 356, 406, 457, 508, 559, 610, 660, 711]
      },
      centerMount: {
        widthRule: 'outsideWidth = opening - 6.35', sideClearancePerSide: 3.2,
        outsideWidthClearance: 6.35, depthRule: 'boxDepth = cabinetDepth - 31.75',
        rearClearance: 31.75, slideHeight: 25.4
      }
    },
    // Fallback hinge schedule (catalogue `standards.hinge` overrides at call time).
    hinge: {
      cupDiameter: 35, cupMinDepth: 13, screwSpacing: 45,
      defaultBoringDistance: 5, defaultCupCentre: 22.5,
      countByHeight: [
        { maxHeight: 900, hinges: 2, maxWeightKg: 9 },
        { maxHeight: 1600, hinges: 3, maxWeightKg: 14 },
        { maxHeight: 2000, hinges: 4, maxWeightKg: 27 },
        { maxHeight: 2400, hinges: 5, maxWeightKg: 27 }
      ],
      maxLeafWidth: 609.6,
      minRevealByThickness: { '16': { '3': 0.6 }, '18': { '3': 1 }, '19': { '3': 1.3 }, '20': { '3': 1.7 }, '22': { '3': 2.5 } }
    },
    // Fallback shelf-span + wall-attachment rules (catalogue overrides at call time).
    shelfSpan: {
      recommendedByMaterial: { 'ply-birch-18': 900, 'ply-veneer-18': 900, 'mdf-18': 850, 'ply-birch-12': 600, 'mdf-12': 550 },
      blockWithoutSupport: 1050
    },
    wallAttachment: {
      backThicknessStructuralMin: 12, nailerHeight: 76.2,
      kcmaWallLoad: { upTo36in: 272, upTo60in: 363, perInchOver60in: 9 },
      railFastenerSpacing: 100
    },
    sheetGoods: { sheet: { width: 1220, height: 2440 }, trim: 10, kerf: 3, grainAxis: 'height' },
    edgebandThickness: { 'pvc-0.5': 0.5, 'pvc-2': 2, 'wood-tape': 0.5, none: 0 },
    faceFrame: { thickness: 19, stileWidth: 57.15, topRailWidth: 57.15, bottomRailWidth: 57.15, midRailWidth: 57.15, minOpening: 100 },
    toeKick: {
      height: 101.6, setback: 76.2, kickBoardThickness: 6,
      kcmaMinHeight: 76.2, kcmaMinDepth: 50.8, toeKickDrawerUsableHeight: 76.2,
      minHeight: 50, maxHeight: 200, minSetback: 0, maxSetback: 150
    },
    back: { thickness: 6, recess: 12, dadoDepth: 6, rabbetWidth: 6 },
    carcass: { topStretcherDepth: 100, minInterior: 100, minSideDepth: 100 },
    hardware: { levelersPerCabinet: 4, levelersWideThreshold: 900 }
  };

  // ---------------------------------------------------------------------------------------------
  // Fallback material catalogue — ids required by contract §5, plus glass for glazed doors.
  // ---------------------------------------------------------------------------------------------
  var FALLBACK_MATERIALS = [
    { id: 'ply-birch-18', name: '3/4" Baltic birch plywood', shortName: '3/4 ply', category: 'sheet', thickness: 18, sheet: { width: 1220, height: 2440 }, grain: true, edgeband: 'pvc-0.5', uses: ['carcass', 'shelves', 'toe kick'], cost: 3 },
    { id: 'ply-birch-12', name: '1/2" Baltic birch plywood', shortName: '1/2 ply', category: 'sheet', thickness: 12, sheet: { width: 1220, height: 2440 }, grain: true, edgeband: 'pvc-0.5', uses: ['drawer boxes'], cost: 2 },
    { id: 'ply-birch-6', name: '1/4" Baltic birch plywood', shortName: '1/4 ply', category: 'sheet', thickness: 6, sheet: { width: 1220, height: 2440 }, grain: true, edgeband: 'none', uses: ['backs', 'door panels', 'drawer bottoms'], cost: 1 },
    { id: 'ply-veneer-18', name: '3/4" veneer-core cabinet plywood', shortName: '3/4 veneer ply', category: 'sheet', thickness: 18.3, sheet: { width: 1220, height: 2440 }, grain: true, edgeband: 'wood-tape', uses: ['carcass', 'shelves'], cost: 2 },
    { id: 'ply-prefinished-18', name: '3/4" prefinished maple/birch plywood', shortName: '3/4 prefin ply', category: 'sheet', thickness: 18, sheet: { width: 1220, height: 2440 }, grain: true, edgeband: 'pvc-0.5', uses: ['carcass', 'shelves'], cost: 3 },
    { id: 'mdf-18', name: '3/4" MDF', shortName: '3/4 MDF', category: 'sheet', thickness: 18, sheet: { width: 1220, height: 2440 }, grain: false, edgeband: 'none', uses: ['painted doors', 'carcass'], cost: 2 },
    { id: 'mdf-12', name: '1/2" MDF', shortName: '1/2 MDF', category: 'sheet', thickness: 12, sheet: { width: 1220, height: 2440 }, grain: false, edgeband: 'none', uses: ['drawer fronts'], cost: 1 },
    { id: 'mdf-6', name: '1/4" MDF', shortName: '1/4 MDF', category: 'sheet', thickness: 6, sheet: { width: 1220, height: 2440 }, grain: false, edgeband: 'none', uses: ['backs', 'panels'], cost: 1 },
    { id: 'melamine-18', name: '3/4" melamine-faced particleboard', shortName: '3/4 melamine', category: 'sheet', thickness: 18, sheet: { width: 1220, height: 2440 }, grain: false, edgeband: 'pvc-0.5', uses: ['carcass', 'shelves'], cost: 2 },
    { id: 'particleboard-18', name: '3/4" particleboard', shortName: '3/4 PB', category: 'sheet', thickness: 18, sheet: { width: 1220, height: 2440 }, grain: false, edgeband: 'pvc-0.5', uses: ['carcass'], cost: 1 },
    { id: 'hardwood-poplar', name: 'Poplar (solid)', shortName: 'Poplar', category: 'solid', thickness: 19, sheet: null, grain: true, edgeband: 'none', uses: ['face frames'], cost: 2 },
    { id: 'hardwood-maple', name: 'Hard maple (solid)', shortName: 'Maple', category: 'solid', thickness: 19, sheet: null, grain: true, edgeband: 'none', uses: ['doors', 'drawer fronts'], cost: 4 },
    { id: 'hardwood-oak', name: 'White oak (solid)', shortName: 'Oak', category: 'solid', thickness: 19, sheet: null, grain: true, edgeband: 'none', uses: ['doors', 'face frames'], cost: 4 },
    { id: 'glass-3', name: 'Glass pane, 3 mm', shortName: 'Glass 3 mm', category: 'panel', thickness: 3, sheet: null, grain: false, edgeband: 'none', uses: ['glass doors'], cost: 2 }
  ];

  // ---------------------------------------------------------------------------------------------
  // Fallback hardware catalogue — ids required by contract §5.
  // ---------------------------------------------------------------------------------------------
  var FALLBACK_HARDWARE = [
    { id: 'hinge-euro-110', name: 'Euro concealed cup hinge, 110°, full overlay', category: 'hinge', unit: 'ea', install: '35 mm cup, cup centre 22.5 mm from hinge edge; mounting plate 37 mm from front edge' },
    { id: 'hinge-euro-inset', name: 'Euro concealed hinge, inset application', category: 'hinge', unit: 'ea', install: 'Inset application: half-cranked hinge + inset mounting plate' },
    { id: 'hinge-plate-cross', name: 'Mounting plate, cross/wing (32 mm system)', category: 'hinge', unit: 'ea', install: 'Screws into the 32 mm system holes or a face-frame adapter plate' },
    { id: 'hinge-butt', name: 'Butt hinge (traditional, mortised)', category: 'hinge', unit: 'ea', install: 'Mortise door leaf and cabinet edge; 2 per leaf' },
    { id: 'slide-undermount-softclose', name: 'Undermount soft-close drawer slide (pair)', category: 'slide', unit: 'set', install: 'Box width = opening − 42 mm; rear clearance 15 mm; box bottom 12.7 mm above cabinet bottom' },
    { id: 'slide-side-mount', name: 'Side-mount ball-bearing full-extension slide (pair)', category: 'slide', unit: 'pair', install: 'Box width = opening − 25.4 mm (12.7 mm each side); screw slides to cabinet sides' },
    { id: 'slide-center-mount', name: 'Center-mount single-track slide', category: 'slide', unit: 'ea', install: 'Box width = opening − 6.35 mm; track centred under drawer box; box depth = interior depth − 31.75 mm' },
    { id: 'pull-bar-128', name: 'Bar pull, 128 mm centres', category: 'pull', unit: 'ea', install: 'One per front; drawers centred, doors opposite the hinge' },
    { id: 'pull-knob-32', name: 'Round knob, 32 mm', category: 'pull', unit: 'ea', install: 'One per front; drawers centred, doors opposite the hinge' },
    { id: 'shelf-pin-5', name: 'Shelf pin, 5 mm, with shoulder', category: 'shelf', unit: 'ea', install: 'Four pins per adjustable shelf (front and rear rows each side)' },
    { id: 'confirmat-50', name: 'Confirmat screw 7 × 50 mm', category: 'fastener', unit: 'ea', install: 'Pilot 5 mm, through side panel into panel edge; 3 per joint' },
    { id: 'wood-dowel-8', name: 'Wood dowel 8 × 30 mm', category: 'fastener', unit: 'ea', install: '3 per joint with glue' },
    { id: 'pocket-screw-32', name: 'Pocket screw 32 mm (fine thread)', category: 'fastener', unit: 'ea', install: '15° pocket, 3 per joint (carcass and face frame)' },
    { id: 'biscuit-20', name: 'Biscuit #20', category: 'fastener', unit: 'ea', install: 'Glue and clamp; 3 per joint' },
    { id: 'door-bumper', name: 'Self-adhesive door bumper', category: 'accessory', unit: 'ea', install: 'One or two per door leaf near the opening edge' },
    { id: 'leveler-foot', name: 'Adjustable leveler foot / leg', category: 'leveler', unit: 'ea', install: 'Four per cabinet, six over 900 mm wide' },
    { id: 'hanging-rail', name: 'Hanging rail / French cleat / suspension rail', category: 'mounting', unit: 'm', install: 'Screw to wall studs; cabinet cleat engages from below' },
    { id: 'magnet-catch', name: 'Magnetic catch and strike', category: 'accessory', unit: 'set', install: 'For doors without soft-close hinges' },
    { id: 'toe-kick-clip', name: 'Toe-kick clip / clip-on base board fastener', category: 'accessory', unit: 'ea', install: 'Clips the finished base board to the platform' }
  ];

  // ---------------------------------------------------------------------------------------------
  // Valid option ids (contract §5) — used by the UI pickers and by normalisation validation.
  // ---------------------------------------------------------------------------------------------
  var OPTION_IDS = {
    constructionSystem: ['frameless', 'faceframe'],
    carcassJoinery: ['confirmat', 'pocket-screw', 'dado-screw', 'dowel', 'biscuit', 'butt-screw'],
    backStyle: ['applied', 'rabbet', 'dado', 'none'],
    toeKickStyle: ['separate-platform', 'notched-sides', 'legs-levelers', 'flush-base', 'none'],
    shelfSystem: ['adjustable-pins-32', 'adjustable-pins-custom', 'fixed-dado', 'none'],
    doorStyle: ['slab', 'shaker', 'raised-panel', 'beadboard', 'glass', 'mullion-glass'],
    doorJoinery: ['cope-stick', 'mitered', 'dowel', 'domino'],
    doorOverlay: ['full', 'inset'],
    hingeType: ['euro-cup', 'butt'],
    drawerFrontStyle: ['slab', 'shaker', 'raised-panel'],
    drawerJoinery: ['dovetail', 'box-joint', 'butt-screw', 'dado'],
    drawerBottom: ['dado', 'rabbet'],
    drawerSlide: ['undermount', 'side-mount', 'center-mount'],
    faceFrameJoinery: ['pocket-screw', 'biscuit', 'dowel', 'mortise-tenon'],
    edgeBanding: ['pvc-0.5', 'pvc-2', 'wood-tape', 'none'],
    finish: ['paint', 'lacquer', 'water-poly', 'hardwax-oil', 'stain-lacquer'],
    cabinetType: ['base', 'wall', 'tall', 'pantry'],
    frontType: ['doors', 'drawer-stack', 'door-drawer', 'open'],
    panelStyle: ['recessed', 'raised', 'flat', 'beadboard', 'glass']
  };

  // ---------------------------------------------------------------------------------------------
  // Default project and cabinet configuration (contract §4). Objects are cloned before use:
  // never hand out a reference into this table.
  // ---------------------------------------------------------------------------------------------
  var DEFAULT_PROJECT = {
    schemaVersion: 1,
    id: 'prj-0001',
    name: 'Untitled project',
    client: '',
    notes: '',
    units: 'imperial',
    pageSize: 'letter',
    orientation: 'landscape',
    settings: {
      shopName: '',
      date: '',
      defaultCarcassMaterial: 'ply-birch-18',
      defaultFaceFrameMaterial: 'hardwood-poplar',
      defaultDoorMaterial: 'hardwood-maple',
      defaultDrawerMaterial: 'ply-birch-12',
      defaultFinish: 'paint',
      edgeBanding: 'pvc-0.5',
      sheetWidth: 1220,
      sheetHeight: 2440,
      sheetTrim: 10,
      sheetKerf: 3,
      includeSheetLayout: true,
      includeAssembly: true,
      includeComponentDrawings: true,
      dwgVersion: 'r2000'
    },
    cabinets: []
  };

  var DEFAULT_CABINET = {
    id: '',
    tag: '',
    name: '',
    type: 'base',
    width: 762,
    height: 876.3,
    depth: 609.6,
    construction: {
      system: 'frameless',
      carcassMaterial: 'ply-birch-18',
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
      shelfPinRearSetback: 37,
      edgeBanding: 'pvc-0.5'
    },
    faceFrame: {
      material: 'hardwood-poplar',
      thickness: 19,
      stileWidth: 57.15,
      topRailWidth: 57.15,
      bottomRailWidth: 57.15,
      midRailWidth: 57.15,
      joinery: 'pocket-screw'
    },
    toeKick: {
      style: 'separate-platform', height: 101.6, setback: 76.2, material: 'ply-birch-18', finishedFace: true
    },
    interior: {
      adjustableShelves: 1, fixedShelves: 1, shelfThickness: 18, shelfMaterial: 'ply-birch-18',
      shelfFrontSetback: 10, shelfEdgeband: 'pvc-2', dividers: 0
    },
    front: {
      type: 'doors',
      reveal: 3,
      doors: {
        count: 2, style: 'shaker', material: 'hardwood-maple', thickness: 19, overlay: 'full',
        stileWidth: 57.15, railWidth: 57.15, doorJoinery: 'cope-stick', panelMaterial: 'ply-birch-6',
        panelThickness: 6.35, panelStyle: 'recessed', glassThickness: 3, beadSpacing: 57.15,
        muntins: 0, hingeType: 'euro-cup', hingeCount: 'auto', hingeSide: 'auto'
      },
      drawers: {
        count: 3, style: 'slab', material: 'hardwood-maple', thickness: 19, heights: null,
        boxMaterial: 'ply-birch-12', boxJoinery: 'dovetail', boxSideThickness: 12.7,
        boxBottomThickness: 6.35, boxBottomJoinery: 'dado', boxHeightAllowance: 25,
        slide: 'undermount', slideLength: null, boxWidthClearance: null, boxDepthClearance: null
      },
      combined: { drawerHeight: 177.8, doorsBelow: 2 }
    },
    hardware: {
      pull: { id: 'pull-bar-128', finish: 'brushed nickel', placement: 'auto' },
      softClose: true, doorBumpers: true, shelfPins: true, hangingRail: false
    },
    finish: { id: 'paint', color: '#f2ede3', sheen: 'satin' },
    notes: ''
  };

  /** Per-type overrides applied beneath the user's cabinet object. */
  var TYPE_DEFAULTS = {
    base: {
      name: 'Base cabinet', width: 762, height: 876.3, depth: 609.6,
      toeKick: { style: 'separate-platform' },
      hardware: { hangingRail: false },
      front: { doors: { count: 2 } }
    },
    wall: {
      name: 'Wall cabinet', width: 762, height: 762, depth: 304.8,
      toeKick: { style: 'none' },
      hardware: { hangingRail: true },
      interior: { adjustableShelves: 2, fixedShelves: 0 },
      front: { doors: { count: 2 } }
    },
    tall: {
      name: 'Tall cabinet', width: 609.6, height: 2133.6, depth: 609.6,
      toeKick: { style: 'separate-platform' },
      hardware: { hangingRail: true },
      interior: { adjustableShelves: 3, fixedShelves: 1 },
      front: { doors: { count: 2 } }
    },
    pantry: {
      name: 'Pantry cabinet', width: 609.6, height: 2133.6, depth: 609.6,
      toeKick: { style: 'separate-platform' },
      hardware: { hangingRail: true },
      interior: { adjustableShelves: 3, fixedShelves: 1 },
      front: { doors: { count: 2 } }
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Small utilities shared by the engine modules.
  // ---------------------------------------------------------------------------------------------
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function clone(v) {
    if (Array.isArray(v)) return v.map(clone);
    if (isObject(v)) {
      var out = {};
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = clone(v[k]);
      return out;
    }
    return v;
  }

  /**
   * Deep-merge plain objects. Arrays and scalars from `src` replace destination values.
   * `null`/`undefined` in src are ignored so partial configs keep their defaults. This is how
   * partial cabinet objects from tests and the UI become full configs.
   */
  function deepMerge(dst, src) {
    if (!isObject(src)) return dst;
    var out = isObject(dst) ? dst : {};
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var sv = src[k];
      if (sv === null || sv === undefined) continue;
      if (isObject(sv)) {
        out[k] = deepMerge(out[k], sv);
      } else {
        out[k] = Array.isArray(sv) ? clone(sv) : sv;
      }
    }
    return out;
  }

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : Number(v);
    return (typeof n === 'number' && isFinite(n)) ? n : fallback;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function round(v, decimals) {
    var f = Math.pow(10, decimals === undefined ? 1 : decimals);
    return Math.round(v * f) / f;
  }

  function isFinitePositive(v) { return typeof v === 'number' && isFinite(v) && v > 0; }

  function contains(list, value) { return Array.isArray(list) && list.indexOf(value) !== -1; }

  /** Access the researched catalogue at call time; tolerate a missing or partial file. */
  function techniques() {
    var t = CS && CS.data && CS.data.techniques;
    return isObject(t) ? t : null;
  }

  /** Deep-ish merge of researched standards over the hard-coded table (arrays replace). */
  function standards() {
    var t = techniques();
    if (!t || !isObject(t.standards)) return clone(BASE_STANDARDS);
    return deepMerge(clone(BASE_STANDARDS), t.standards);
  }

  function catalogueMaterials() {
    var t = techniques();
    return (t && Array.isArray(t.materials)) ? t.materials : [];
  }

  function catalogueHardware() {
    var t = techniques();
    return (t && Array.isArray(t.hardware)) ? t.hardware : [];
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  /** Materials list: catalogue first (researched), fallbacks fill required ids not covered. */
  function materials() {
    var found = catalogueMaterials();
    var out = [];
    var seen = {};
    for (var i = 0; i < found.length; i++) {
      var m = found[i];
      if (!m || !m.id || seen[m.id]) continue;
      seen[m.id] = true;
      out.push(normaliseMaterial(m));
    }
    for (var j = 0; j < FALLBACK_MATERIALS.length; j++) {
      if (!seen[FALLBACK_MATERIALS[j].id]) out.push(clone(FALLBACK_MATERIALS[j]));
    }
    return out;
  }

  /** Guess a material thickness from a conventional id suffix (`ply-birch-18` → 18). */
  function guessThickness(id) {
    var m = /-(\d+(?:\.\d+)?)$/.exec(String(id || ''));
    if (!m) return 18;
    var n = parseFloat(m[1]);
    if (!isFinite(n) || n <= 0) return 18;
    if (n === 12) return 12;
    if (n === 6) return 6;
    if (n === 19) return 19;
    return n;
  }

  function normaliseMaterial(m) {
    var out = clone(m);
    out.id = m.id;
    out.name = m.name || m.id;
    out.shortName = m.shortName || out.name;
    out.category = m.category || 'sheet';
    out.thickness = num(m.thickness, guessThickness(m.id));
    out.sheet = isObject(m.sheet) ? { width: num(m.sheet.width, 1220), height: num(m.sheet.height, 2440) } : null;
    out.grain = m.grain !== false;
    out.edgeband = m.edgeband || 'pvc-0.5';
    out.uses = Array.isArray(m.uses) ? m.uses : [];
    out.cost = num(m.cost, 3);
    return out;
  }

  /**
   * Resolve a material by id. Never throws and never returns null: an unknown id produces a
   * guessed-thickness fallback flagged `_fallback: true` so callers can warn.
   */
  function material(id) {
    var list = materials();
    var found = findById(list, id);
    if (found) return found;
    var thickness = guessThickness(id);
    var fallback = {
      id: String(id || 'unknown'),
      name: String(id || 'unknown material'),
      shortName: String(id || 'unknown'),
      category: thickness >= 14 ? 'sheet' : 'sheet',
      thickness: thickness,
      sheet: { width: 1220, height: 2440 },
      grain: true,
      edgeband: 'pvc-0.5',
      uses: [],
      cost: 3,
      _fallback: true
    };
    return fallback;
  }

  function hardwareTemplates() {
    var found = catalogueHardware();
    var out = [];
    var seen = {};
    for (var i = 0; i < found.length; i++) {
      var h = found[i];
      if (!h || !h.id || seen[h.id]) continue;
      seen[h.id] = true;
      var copy = clone(h);
      copy.name = h.name || h.id;
      copy.category = h.category || 'hardware';
      copy.unit = h.unit || 'ea';
      out.push(copy);
    }
    for (var j = 0; j < FALLBACK_HARDWARE.length; j++) {
      if (!seen[FALLBACK_HARDWARE[j].id]) out.push(clone(FALLBACK_HARDWARE[j]));
    }
    return out;
  }

  /** Resolve a hardware template by id with a safe fallback. */
  function hardware(id) {
    var found = findById(hardwareTemplates(), id);
    if (found) return found;
    return { id: String(id || 'unknown'), name: String(id || 'unknown hardware'), category: 'hardware', unit: 'ea', install: '', _fallback: true };
  }

  function edgebandMaterial(id) {
    var st = standards();
    var thickness = (st.edgebandThickness && st.edgebandThickness[id] !== undefined) ? st.edgebandThickness[id] : 0.5;
    var name = id === 'pvc-2' ? '2 mm PVC edgeband' :
      id === 'wood-tape' ? 'Wood veneer edge tape' :
        id === 'none' ? 'No edgeband' : '0.5 mm PVC edgeband';
    return { id: id || 'pvc-0.5', thickness: num(thickness, 0.5), name: name };
  }

  function typeDefaults(type) {
    var t = TYPE_DEFAULTS[type] ? TYPE_DEFAULTS[type] : TYPE_DEFAULTS.base;
    return clone(t);
  }

  /**
   * Defaulted cabinet for a type (no user data). Used by UI "add cabinet" and by
   * `suggestCabinetDimensions`.
   */
  function cabinetDefaults(type) {
    var base = clone(DEFAULT_CABINET);
    base.type = OPTION_IDS.cabinetType.indexOf(type) !== -1 ? type : 'base';
    var merged = deepMerge(base, typeDefaults(base.type));
    merged.tag = fallbackTag(merged.type, 0);
    merged.id = 'cab-01';
    merged.name = merged.name || (merged.type.charAt(0).toUpperCase() + merged.type.slice(1) + ' cabinet');
    return merged;
  }

  function projectDefaults() { return clone(DEFAULT_PROJECT); }

  // ---------------------------------------------------------------------------------------------
  // Normalisation. The engine assumes a normalised project but must guard, so this fills every
  // field, coerces numbers, repairs impossible values and collects warnings rather than throwing.
  // ---------------------------------------------------------------------------------------------

  /** Push a normalisation warning in the `Warning` shape (contract §4). */
  function warn(list, severity, title, message, rule, fix, cabinet) {
    if (!list) return;
    list.push({
      id: 'norm-' + (list.length + 1),
      severity: severity,
      cabinetId: cabinet ? cabinet.id : null,
      cabinetTag: cabinet ? cabinet.tag : null,
      partIds: [],
      title: title,
      message: message,
      rule: rule || 'schema',
      fix: fix || ''
    });
  }

  function normaliseSettings(project, warnings) {
    var s = deepMerge(clone(DEFAULT_PROJECT.settings), project.settings);
    s.sheetWidth = Math.max(300, num(s.sheetWidth, 1220));
    s.sheetHeight = Math.max(300, num(s.sheetHeight, 2440));
    s.sheetTrim = Math.max(0, num(s.sheetTrim, 10));
    s.sheetKerf = Math.max(0, num(s.sheetKerf, 3));
    if (!contains(OPTION_IDS.edgeBanding, s.edgeBanding)) s.edgeBanding = 'pvc-0.5';
    if (!contains(OPTION_IDS.finish, s.defaultFinish)) s.defaultFinish = 'paint';
    ['includeSheetLayout', 'includeAssembly', 'includeComponentDrawings'].forEach(function (k) {
      if (typeof s[k] !== 'boolean') s[k] = true;
    });
    if (['r2000', 'r2018', 'r12'].indexOf(s.dwgVersion) === -1) s.dwgVersion = 'r2000';
    return s;
  }

  /** Cheap deterministic id from a cabinet type and index, used only when data is missing. */
  function fallbackTag(type, index) {
    var letter = type === 'wall' ? 'W' : type === 'tall' ? 'T' : type === 'pantry' ? 'P' : 'B';
    return letter + (index + 1);
  }

  function sanitiseTag(tag) {
    return String(tag || '').trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'C';
  }

  /**
   * Fill a cabinet config with defaults (global then type-specific), coerce numbers and validate
   * enum ids. Returns `{ config, warnings }`; never mutates the input cabinet.
   *
   * @param {Object} project normalised or partial project (only `settings` is read)
   * @param {Object} cabinet partial cabinet from project data
   * @param {number} [index] position in the project, used for fallback tags/ids
   * @returns {{config: Object, warnings: Array}}
   */
  function normalizeCabinet(project, cabinet, index) {
    var warnings = [];
    var input = isObject(cabinet) ? cabinet : {};
    var settings = isObject(project) && isObject(project.settings) ? project.settings : DEFAULT_PROJECT.settings;
    var idx = typeof index === 'number' ? index : 0;

    var type = contains(OPTION_IDS.cabinetType, input.type) ? input.type : 'base';
    if (input.type && input.type !== type) {
      warn(warnings, 'warning', 'Unknown cabinet type', 'Cabinet type "' + input.type + '" is not recognised; treated as a base cabinet.', 'cabinet.type', 'Choose base, wall, tall or pantry.', input);
    }
    var base = cabinetDefaults(type);
    var cfg = deepMerge(base, input);

    // Identity.
    cfg.type = type;
    cfg.id = cfg.id ? String(cfg.id) : 'cab-' + (idx + 1 < 10 ? '0' : '') + (idx + 1);
    cfg.tag = sanitiseTag(cfg.tag || fallbackTag(type, idx));
    cfg.name = String(cfg.name || (type.charAt(0).toUpperCase() + type.slice(1) + ' cabinet'));

    // Overall dimensions.
    cfg.width = num(cfg.width, 762);
    cfg.height = num(cfg.height, 876.3);
    cfg.depth = num(cfg.depth, 609.6);
    var typeStd = standards().dims[type] || standards().dims.base;
    if (cfg.width < typeStd.minWidth) {
      warn(warnings, 'info', 'Cabinet narrower than standard', 'Width ' + round(cfg.width, 1) + ' mm is below the usual minimum of ' + round(typeStd.minWidth, 1) + ' mm for a ' + type + ' cabinet.', 'dims.minWidth', 'Increase the cabinet width or accept a custom cabinet.', cfg);
    }
    if (cfg.width > typeStd.maxWidth) {
      warn(warnings, 'warning', 'Cabinet wider than standard', 'Width ' + round(cfg.width, 1) + ' mm exceeds the usual maximum of ' + round(typeStd.maxWidth, 1) + ' mm; wide panels and shelves may sag.', 'dims.maxWidth', 'Split the run into two cabinets.', cfg);
    }

    // Construction.
    var c = cfg.construction;
    if (!contains(OPTION_IDS.constructionSystem, c.system)) c.system = 'frameless';
    if (!contains(OPTION_IDS.carcassJoinery, c.joinery)) c.joinery = 'confirmat';
    if (!contains(OPTION_IDS.backStyle, c.backStyle)) c.backStyle = 'rabbet';
    if (!contains(OPTION_IDS.shelfSystem, c.shelfSystem)) c.shelfSystem = 'adjustable-pins-32';
    if (!contains(OPTION_IDS.edgeBanding, c.edgeBanding)) c.edgeBanding = settings.edgeBanding || 'pvc-0.5';
    c.carcassMaterial = c.carcassMaterial || settings.defaultCarcassMaterial;
    c.backMaterial = c.backMaterial || 'ply-birch-6';
    c.backThickness = Math.max(0, num(c.backThickness, material(c.backMaterial).thickness));
    c.carcassThickness = num(c.carcassThickness, material(c.carcassMaterial).thickness);
    if (!isFinitePositive(c.carcassThickness)) c.carcassThickness = 18;
    c.backRecess = clamp(num(c.backRecess, 12), 0, Math.max(0, c.backThickness * 4));
    c.dadoDepth = clamp(num(c.dadoDepth, 6), 1, Math.max(1, c.carcassThickness / 2));
    c.shelfPinDiameter = clamp(num(c.shelfPinDiameter, 5), 2, 8);
    c.shelfPinSpacing = clamp(num(c.shelfPinSpacing, 32), 16, 64);
    c.shelfPinFrontSetback = Math.max(10, num(c.shelfPinFrontSetback, 37));
    c.shelfPinRearSetback = Math.max(10, num(c.shelfPinRearSetback, c.shelfPinFrontSetback));

    // Face frame.
    var ff = cfg.faceFrame;
    ff.material = ff.material || settings.defaultFaceFrameMaterial;
    ff.thickness = clamp(num(ff.thickness, 19), 10, 40);
    ff.stileWidth = clamp(num(ff.stileWidth, 57.15), 25, 150);
    ff.topRailWidth = clamp(num(ff.topRailWidth, 57.15), 25, 150);
    ff.bottomRailWidth = clamp(num(ff.bottomRailWidth, 57.15), 25, 150);
    ff.midRailWidth = clamp(num(ff.midRailWidth, 57.15), 25, 150);
    if (!contains(OPTION_IDS.faceFrameJoinery, ff.joinery)) ff.joinery = 'pocket-screw';

    // Toe kick.
    var tk = cfg.toeKick;
    if (!contains(OPTION_IDS.toeKickStyle, tk.style)) tk.style = type === 'wall' ? 'none' : 'separate-platform';
    tk.height = clamp(num(tk.height, 101.6), 0, 300);
    tk.setback = clamp(num(tk.setback, 76.2), 0, 200);
    tk.material = tk.material || c.carcassMaterial;
    tk.finishedFace = tk.finishedFace !== false;

    // Interior.
    var it = cfg.interior;
    it.adjustableShelves = clamp(Math.round(num(it.adjustableShelves, 1)), 0, 8);
    it.fixedShelves = clamp(Math.round(num(it.fixedShelves, 0)), 0, 8);
    it.shelfThickness = num(it.shelfThickness, material(it.shelfMaterial || c.carcassMaterial).thickness);
    if (!isFinitePositive(it.shelfThickness)) it.shelfThickness = 18;
    it.shelfMaterial = it.shelfMaterial || c.carcassMaterial;
    it.shelfFrontSetback = Math.max(0, num(it.shelfFrontSetback, 10));
    it.dividers = clamp(Math.round(num(it.dividers, 0)), 0, 6);
    if (it.dividers > 0) warn(warnings, 'info', 'Dividers are not generated', 'Vertical dividers are recorded but the v1 engine does not generate divider parts.', 'interior.dividers', 'Remove dividers for now; the option is documented.', cfg);

    // Fronts.
    var front = cfg.front;
    if (!contains(OPTION_IDS.frontType, front.type)) front.type = 'doors';
    front.reveal = clamp(num(front.reveal, 3), 0.5, 12);
    var doors = front.doors;
    if (!contains(OPTION_IDS.doorStyle, doors.style)) doors.style = 'shaker';
    if (!contains(OPTION_IDS.doorJoinery, doors.doorJoinery)) doors.doorJoinery = 'cope-stick';
    if (!contains(OPTION_IDS.doorOverlay, doors.overlay)) doors.overlay = 'full';
    if (!contains(OPTION_IDS.hingeType, doors.hingeType)) doors.hingeType = 'euro-cup';
    if (!contains(OPTION_IDS.panelStyle, doors.panelStyle)) doors.panelStyle = 'recessed';
    doors.material = doors.material || settings.defaultDoorMaterial;
    doors.thickness = clamp(num(doors.thickness, 19), 12, 30);
    doors.stileWidth = clamp(num(doors.stileWidth, 57.15), 25, 150);
    doors.railWidth = clamp(num(doors.railWidth, 57.15), 25, 150);
    doors.panelThickness = clamp(num(doors.panelThickness, 6.35), 3, 20);
    doors.glassThickness = clamp(num(doors.glassThickness, 3), 2, 10);
    doors.panelFloat = clamp(num(doors.panelFloat, 2), 0, 8);
    doors.count = clamp(Math.round(num(doors.count, 2)), 1, 6);
    doors.muntins = clamp(Math.round(num(doors.muntins, 0)), 0, 6);
    if (doors.hingeCount !== 'auto') {
      var hc = Math.round(num(doors.hingeCount, 2));
      doors.hingeCount = clamp(hc, 2, 6);
    }
    if (['auto', 'left', 'right'].indexOf(doors.hingeSide) === -1) doors.hingeSide = 'auto';
    if (doors.panelStyle === 'glass' && OPTION_IDS.doorStyle.indexOf(doors.style) === -1) doors.style = 'glass';

    var dw = front.drawers;
    if (!contains(OPTION_IDS.drawerFrontStyle, dw.style)) dw.style = 'slab';
    if (!contains(OPTION_IDS.drawerJoinery, dw.boxJoinery)) dw.boxJoinery = 'dovetail';
    if (!contains(OPTION_IDS.drawerBottom, dw.boxBottomJoinery)) dw.boxBottomJoinery = 'dado';
    if (!contains(OPTION_IDS.drawerSlide, dw.slide)) dw.slide = 'undermount';
    dw.material = dw.material || settings.defaultDoorMaterial;
    dw.boxMaterial = dw.boxMaterial || settings.defaultDrawerMaterial;
    dw.thickness = clamp(num(dw.thickness, 19), 12, 30);
    dw.count = clamp(Math.round(num(dw.count, 3)), 1, 8);
    dw.boxSideThickness = clamp(num(dw.boxSideThickness, material(dw.boxMaterial).thickness), 6, 25);
    dw.boxBottomThickness = clamp(num(dw.boxBottomThickness, 6.35), 3, 20);
    dw.boxHeightAllowance = clamp(num(dw.boxHeightAllowance, 25), 0, 80);
    dw.slideLength = dw.slideLength === null || dw.slideLength === undefined ? null : Math.max(150, num(dw.slideLength, 0) || 0);
    dw.boxWidthClearance = dw.boxWidthClearance === null || dw.boxWidthClearance === undefined ? null : Math.max(0, num(dw.boxWidthClearance, 0));
    dw.boxDepthClearance = dw.boxDepthClearance === null || dw.boxDepthClearance === undefined ? null : Math.max(0, num(dw.boxDepthClearance, 0));
    if (dw.heights !== null && dw.heights !== undefined) {
      if (!Array.isArray(dw.heights) || dw.heights.length !== dw.count) {
        warn(warnings, 'warning', 'Drawer heights ignored', 'Custom drawer front heights must be an array with one value per drawer; auto heights are used instead.', 'front.drawers.heights', 'Set ' + dw.count + ' explicit heights or null.', cfg);
        dw.heights = null;
      } else {
        dw.heights = dw.heights.map(function (h) { return Math.max(1, num(h, 90)); });
      }
    }
    front.combined.drawerHeight = clamp(num(front.combined.drawerHeight, 177.8), 60, 600);
    front.combined.doorsBelow = clamp(Math.round(num(front.combined.doorsBelow, 2)), 1, 6);

    // Hardware / finish.
    var hw = cfg.hardware;
    if (!isObject(hw.pull)) hw.pull = { id: 'pull-bar-128', finish: '', placement: 'auto' };
    hw.pull.id = hw.pull.id || 'pull-bar-128';
    // Migrate the contract §4 example ids onto the researched catalogue ids.
    var pullAliases = { 'bar-128': 'pull-bar-128', 'knob-32': 'pull-knob-32', 'pull-bar': 'pull-bar-128' };
    if (pullAliases[hw.pull.id]) hw.pull.id = pullAliases[hw.pull.id];
    hw.pull.finish = hw.pull.finish || '';
    ['softClose', 'doorBumpers', 'shelfPins', 'hangingRail'].forEach(function (k) {
      if (typeof hw[k] !== 'boolean') hw[k] = !!hw[k];
    });
    if (!contains(OPTION_IDS.finish, cfg.finish.id)) cfg.finish.id = settings.defaultFinish || 'paint';
    if (typeof cfg.notes !== 'string') cfg.notes = '';

    // Option-id validation: fall back to the safe value but say so.
    function enumCheck(obj, field, list, fallback, label) {
      if (obj[field] !== undefined && !contains(list, obj[field])) {
        warn(warnings, 'warning', 'Unknown ' + label + ' option', '"' + obj[field] + '" is not a valid ' + label + ' option; using "' + fallback + '".', 'option.' + field, 'Choose one of: ' + list.join(', ') + '.', cfg);
        obj[field] = fallback;
      }
    }
    enumCheck(cfg.construction, 'system', OPTION_IDS.constructionSystem, 'frameless', 'construction system');
    enumCheck(cfg.construction, 'joinery', OPTION_IDS.carcassJoinery, 'confirmat', 'carcass joinery');
    enumCheck(cfg.construction, 'backStyle', OPTION_IDS.backStyle, 'rabbet', 'back style');
    enumCheck(cfg.construction, 'shelfSystem', OPTION_IDS.shelfSystem, 'adjustable-pins-32', 'shelf system');
    enumCheck(cfg.toeKick, 'style', OPTION_IDS.toeKickStyle, type === 'wall' ? 'none' : 'separate-platform', 'toe kick style');
    enumCheck(cfg.faceFrame, 'joinery', OPTION_IDS.faceFrameJoinery, 'pocket-screw', 'face frame joinery');
    enumCheck(cfg.front, 'type', OPTION_IDS.frontType, 'doors', 'front type');
    enumCheck(cfg.front.doors, 'style', OPTION_IDS.doorStyle, 'shaker', 'door style');
    enumCheck(cfg.front.doors, 'overlay', OPTION_IDS.doorOverlay, 'full', 'door overlay');
    enumCheck(cfg.front.doors, 'hingeType', OPTION_IDS.hingeType, 'euro-cup', 'hinge type');
    enumCheck(cfg.front.doors, 'doorJoinery', OPTION_IDS.doorJoinery, 'cope-stick', 'door joinery');
    enumCheck(cfg.front.drawers, 'style', OPTION_IDS.drawerFrontStyle, 'slab', 'drawer front style');
    enumCheck(cfg.front.drawers, 'boxJoinery', OPTION_IDS.drawerJoinery, 'dovetail', 'drawer joinery');
    enumCheck(cfg.front.drawers, 'boxBottomJoinery', OPTION_IDS.drawerBottom, 'dado', 'drawer bottom joinery');
    enumCheck(cfg.front.drawers, 'slide', OPTION_IDS.drawerSlide, 'undermount', 'drawer slide');
    enumCheck(cfg.construction, 'edgeBanding', OPTION_IDS.edgeBanding, 'pvc-0.5', 'edgebanding');

    // Wall cabinets never get a generated toe kick.
    if (cfg.type === 'wall' && tk.style !== 'none') {
      warn(warnings, 'info', 'Toe kick ignored on wall cabinet', 'Wall cabinets are mounted on the wall; the toe kick setting was ignored.', 'toeKick.wall', 'Set toe kick style to none for wall cabinets.', cfg);
      tk.style = 'none';
    }

    // Cabinet must be big enough for its carcass.
    var minBits = 2 * c.carcassThickness + (c.system === 'faceframe' ? 2 * ff.stileWidth : 0);
    if (cfg.width <= minBits + 20) {
      warn(warnings, 'error', 'Cabinet too small', 'Width ' + round(cfg.width, 1) + ' mm leaves no usable interior after sides' + (c.system === 'faceframe' ? ' and face frame stiles' : '') + '.', 'dims.minInterior', 'Increase the cabinet width.', cfg);
    }
    if (cfg.depth <= c.carcassThickness + 20) {
      warn(warnings, 'error', 'Cabinet too shallow', 'Depth ' + round(cfg.depth, 1) + ' mm is not deep enough for a carcass.', 'dims.minDepth', 'Increase the cabinet depth.', cfg);
    }

    return { config: cfg, warnings: warnings };
  }

  /**
   * Fill and validate a whole project. Deep-clones the input, applies settings defaults, normalises
   * every cabinet, assigns unique tags and stable ids.
   *
   * @param {Object} project partial or full project
   * @returns {{project: Object, warnings: Array}}
   */
  function normalizeProject(project) {
    var warnings = [];
    var input = isObject(project) ? project : {};
    var out = deepMerge(clone(DEFAULT_PROJECT), input);
    out.schemaVersion = 1;
    out.id = out.id ? String(out.id) : 'prj-0001';
    out.name = String(out.name || 'Untitled project');
    out.units = out.units === 'metric' ? 'metric' : 'imperial';
    if (['letter', 'tabloid', 'a4', 'a3'].indexOf(out.pageSize) === -1) out.pageSize = 'letter';
    out.orientation = out.orientation === 'portrait' ? 'portrait' : 'landscape';
    out.settings = normaliseSettings(out, warnings);
    var cabinets = Array.isArray(input.cabinets) ? input.cabinets : (Array.isArray(out.cabinets) ? out.cabinets : []);
    out.cabinets = [];

    var usedTags = {};
    var usedIds = {};
    for (var i = 0; i < cabinets.length; i++) {
      var res = normalizeCabinet(out, cabinets[i], i);
      var cfg = res.config;
      // Unique ids and tags.
      var idBase = cfg.id;
      var n = 2;
      while (usedIds[cfg.id]) cfg.id = idBase + '-' + n++;
      usedIds[cfg.id] = true;
      var tagBase = cfg.tag;
      n = 2;
      while (usedTags[cfg.tag]) cfg.tag = tagBase + '-' + n++;
      usedTags[cfg.tag] = true;
      // Renumber normalisation warning ids to be project-unique and attach cabinet ids.
      for (var w = 0; w < res.warnings.length; w++) {
        var item = res.warnings[w];
        item.id = 'norm-' + (warnings.length + 1);
        if (item.cabinetId === null || item.cabinetId === undefined) item.cabinetId = cfg.id;
        if (item.cabinetTag === null || item.cabinetTag === undefined) item.cabinetTag = cfg.tag;
        warnings.push(item);
      }
      out.cabinets.push(cfg);
    }

    if (out.cabinets.length === 0) {
      warn(warnings, 'info', 'Empty project', 'The project has no cabinets yet.', 'project.empty', 'Add a base cabinet to start.', null);
    }
    return { project: out, warnings: warnings };
  }

  // ---------------------------------------------------------------------------------------------
  // Public API attached as CS.engine.defaults.
  // ---------------------------------------------------------------------------------------------
  /** Alias used by the UI when it fills a new cabinet (contract §3 "applyDefaults"). */
  function createCabinet(type) { return cabinetDefaults(type); }

  /**
   * Fill defaults on a partial cabinet or project. Returns the filled cabinet config (or the
   * normalised project when given a project-shaped object), never mutating the input.
   */
  function applyDefaults(input) {
    if (input && Array.isArray(input.cabinets)) return normalizeProject(input).project;
    return normalizeCabinet({}, input, 0).config;
  }

  // Material and hardware ids come from the catalogue/fallbacks at load time (the catalogue is
  // loaded before the engine in the contract order); this keeps the UI pickers one call away.
  try {
    OPTION_IDS.materials = materials().map(function (m) { return m.id; });
    OPTION_IDS.hardware = hardwareTemplates().map(function (h) { return h.id; });
  } catch (e) {
    OPTION_IDS.materials = OPTION_IDS.materials || [];
    OPTION_IDS.hardware = OPTION_IDS.hardware || [];
  }

  var api = {
    MM_PER_IN: MM_PER_IN,
    BASE_STANDARDS: BASE_STANDARDS,
    DEFAULT_PROJECT: DEFAULT_PROJECT,
    DEFAULT_CABINET: DEFAULT_CABINET,
    TYPE_DEFAULTS: TYPE_DEFAULTS,
    FALLBACK_MATERIALS: FALLBACK_MATERIALS,
    FALLBACK_HARDWARE: FALLBACK_HARDWARE,
    optionIds: OPTION_IDS,

    // resolution (call-time reads of CS.data.techniques)
    standards: standards,
    materials: materials,
    material: material,
    hardwareTemplates: hardwareTemplates,
    hardware: hardware,
    edgebandMaterial: edgebandMaterial,

    // defaults / normalisation
    projectDefaults: projectDefaults,
    cabinetDefaults: cabinetDefaults,
    createCabinet: createCabinet,
    defaultCabinet: createCabinet,
    applyDefaults: applyDefaults,
    typeDefaults: typeDefaults,
    normalizeProject: normalizeProject,
    normalizeCabinet: normalizeCabinet,

    // shared helpers (engine-internal and handy for tests)
    util: {
      isObject: isObject,
      clone: clone,
      deepMerge: deepMerge,
      num: num,
      clamp: clamp,
      round: round,
      isFinitePositive: isFinitePositive,
      contains: contains,
      warn: warn,
      findById: findById
    }
  };

  CS.engine = CS.engine || {};
  CS.engine.defaults = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
