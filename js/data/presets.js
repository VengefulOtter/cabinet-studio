/*
 * Cabinet Studio — cabinet-standard presets (North American / European).
 * Classic-script / CommonJS dual UMD. No ES modules, no build step, no dependencies.
 * Attaches to CS.data.presets in the browser and exports for Node.
 *
 * Values are millimetres. Each preset is a complete starting point for the guided
 * wizard: units, construction, face frame / toe kick, interior, fronts (doors and
 * drawers), hardware, finish, standard dimensions (base / wall / tall / pantry),
 * standard width/height/depth chip lists, and source ids.
 *
 * The wizard deep-merges these over its own fallbacks (js/ui/guided.js), so a
 * missing field falls back safely; extra fields are ignored.
 *
 * Evidence: docs/RESEARCH-UI-FLOW.md (UX and preset comparison) and
 * docs/RESEARCH-techniques.md (construction research). "shop" sources are recorded
 * professional practice, not a published standard; "manufacturer" is the maker's own
 * data; "standard" is a normative document or official association standard page.
 * Accessed: 2026-11-15.
 */
(function (root, factory) {
  'use strict';
  var presets = factory();
  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = presets;
  }
  if (root) {
    root.CS = root.CS || {};
    root.CS.data = root.CS.data || {};
    root.CS.data.presets = presets;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  var P = {};

  P.meta = {
    version: '1.0.0',
    updated: '2026-11-15',
    description: 'North American face-frame and European frameless kitchen cabinet presets for the ' +
      'guided wizard. Millimetre model values with imperial display handled by CS.units.',
    units: 'mm',
    report: 'docs/RESEARCH-UI-FLOW.md',
    accessDate: '2026-11-15'
  };

  /* ------------------------------------------------------------------ *
   * Sources cited by the presets. Same access date as the research report.
   * ------------------------------------------------------------------ */
  P.sources = {
    'kcma-a1611-2022': {
      title: 'ANSI/KCMA A161.1-2022 Performance and Construction Standard for Kitchen and Vanity Cabinets',
      publisher: 'Kitchen Cabinet Manufacturers Association',
      url: 'https://kcma.org/sites/default/files/2024-08/KCMA%20A161.1%202022%20High%20Res.pdf',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'nkba-guidelines-2010': {
      title: 'NKBA Kitchen Planning Guidelines (summary sheet, 2010 edition)',
      publisher: 'National Kitchen & Bath Association (reproduction hosted by Ivo Cabinets)',
      url: 'https://www.ivocabinets.com/wp-content/uploads/2024/06/NKBA-Kitchen-Planning-Guidelines.pdf',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'bobvila-standard-sizes': {
      title: 'Standard Kitchen Cabinet Dimensions & Sizes Guide',
      publisher: 'Bob Vila',
      url: 'https://www.bobvila.com/articles/standard-kitchen-cabinet-sizes/',
      accessed: '2026-11-15',
      kind: 'publication'
    },
    'hettich-furniture-tech': {
      title: 'Ratgeber fuer Moebeltechnik / Furniture technology guide (May 2021)',
      publisher: 'Hettich',
      url: 'https://web.hettich.com/fileadmin/Company_website/HDY/Media/Ratgeber_Moebeltechnik_de_en_05-2021.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'din-en-1116-2018': {
      title: 'DIN EN 1116:2018-03 (E) Furniture - Kitchen furniture - Coordinating sizes for kitchen furniture and kitchen appliances (table of contents)',
      publisher: 'DIN Deutsches Institut fuer Normung',
      url: 'https://www.din.de/de/mitwirken/normenausschuesse/nhm/wdc-beuth:din21:275325871/toc-2830247/download',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'en-1116-2016-draft': {
      title: 'E DIN EN 1116:2016-10 (D/E) Furniture - Kitchen furniture - Coordinating sizes for kitchen furniture and kitchen appliances (draft, table of contents)',
      publisher: 'DIN Deutsches Institut fuer Normung',
      url: 'https://www.din.de/de/mitwirken/normenausschuesse/nhm/entwuerfe/wdc-beuth:din21:254904175/toc-2514085/download',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'lieblingskuechen-kuechenhoehe': {
      title: 'Kuechenhoehe Standard: Masse, Ergononomie & Planung 2026 (Standard kitchen height in Germany: 90 cm worktop = 15 cm plinth + 72 cm carcass + ~3 cm worktop, DIN EN 1116)',
      publisher: 'Lieblingskuechen.de',
      url: 'https://www.lieblingskuechen.de/arbeitshoehe-kueche/',
      accessed: '2026-11-15',
      kind: 'publication'
    },
    'cutandedge-uk-sizes': {
      title: 'Kitchen Cabinet Sizes UK | Standard Base, Wall & Tall Units',
      publisher: 'Cut & Edge Express',
      url: 'https://www.cutandedgexpress.com/guides/kitchen-cabinet-sizes/',
      accessed: '2026-11-15',
      kind: 'reference'
    },
    'nobilia-brochure': {
      title: 'Nobilia kitchen programme brochure (carcass heights 720 / 792 / 864 mm; 582 mm side depth)',
      publisher: 'Nobilia Moebelwerke',
      url: 'https://nobiliabutor.gazmodulweisz.hu/images/brosura/doc/1695801364j7AOh.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'research-techniques': {
      title: 'Cabinet and door construction techniques - research report',
      publisher: 'Cabinet Studio project documentation',
      url: 'docs/RESEARCH-techniques.md',
      accessed: '2026-11-15',
      kind: 'reference'
    }
  };

  /* ------------------------------------------------------------------ *
   * North American face-frame preset.
   * Keeps the KCMA / stock-cabinet conventions: 34 1/2 in box, 24 in deep,
   * 4 in toe kick, full-overlay shaker doors, 3/4 in plywood carcass.
   * ------------------------------------------------------------------ */
  P.northAmerican = {
    id: 'northAmerican',
    label: 'North American face frame',
    shortLabel: 'Face frame',
    summary: 'Familiar face-frame kitchens: a 3/4 in plywood box with a hardwood face frame and ' +
      'full-overlay shaker doors.',
    units: 'imperial',
    sourceIds: ['kcma-a1611-2022', 'bobvila-standard-sizes', 'nkba-guidelines-2010', 'research-techniques'],
    space: { wallLength: 3657.6, ceilingHeight: 2438.4, counterHeight: 914.4 },

    construction: {
      system: 'faceframe',
      carcassMaterial: 'ply-birch-18',
      carcassThickness: 18,
      joinery: 'dado-screw',
      backStyle: 'rabbet',
      backMaterial: 'ply-birch-6',
      backThickness: 6,
      backRecess: 12,
      dadoDepth: 6,
      shelfSystem: 'adjustable-pins-32',
      shelfPinDiameter: 5,
      shelfPinSpacing: 32,
      shelfPinFrontSetback: 37,
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
      style: 'separate-platform',
      height: 101.6,
      setback: 76.2,
      material: 'ply-birch-18',
      finishedFace: true
    },
    interior: {
      shelfMaterial: 'ply-birch-18',
      shelfThickness: 18,
      shelfEdgeband: 'pvc-2',
      adjustableShelvesByType: { base: 1, wall: 2, tall: 4, pantry: 5 },
      fixedShelvesByType: { base: 0, wall: 0, tall: 1, pantry: 1 }
    },
    fronts: {
      doors: {
        style: 'shaker',
        count: 2,
        overlay: 'full',
        material: 'hardwood-maple',
        thickness: 19,
        stileWidth: 57.15,
        railWidth: 57.15,
        doorJoinery: 'cope-stick',
        panelMaterial: 'ply-birch-6',
        panelThickness: 6.35,
        panelStyle: 'recessed',
        hingeType: 'euro-cup',
        hingeCount: 'auto',
        hingeSide: 'auto'
      },
      drawers: {
        style: 'slab',
        count: 3,
        material: 'hardwood-maple',
        thickness: 19,
        boxMaterial: 'ply-birch-12',
        boxJoinery: 'dovetail',
        boxSideThickness: 12.7,
        boxBottomThickness: 6.35,
        boxBottomJoinery: 'dado',
        slide: 'undermount',
        boxHeightAllowance: 25
      }
    },
    hardware: {
      pull: { id: 'bar-128', finish: 'brushed nickel', placement: 'auto' },
      hinge: 'hinge-euro-110',
      slide: 'slide-undermount-softclose',
      shelfPin: 'shelf-pin-5',
      fastener: 'confirmat-50',
      softClose: true,
      doorBumpers: true,
      shelfPins: true,
      hangingRail: true
    },
    finish: {
      id: 'paint',
      label: 'Painted shaker',
      color: '#f2ede3',
      sheen: 'satin',
      note: 'Paint-grade maple or poplar doors and frames; primer + 2-3 coats.'
    },

    dims: {
      base: { width: 762, height: 876.3, depth: 609.6, toeKickHeight: 101.6, toeKickSetback: 76.2, counterHeight: 914.4 },
      wall: { width: 762, height: 762, depth: 304.8, aboveCounter: 457.2 },
      tall: { width: 609.6, height: 2133.6, depth: 609.6, toeKickHeight: 101.6 },
      pantry: { width: 609.6, height: 2133.6, depth: 304.8, toeKickHeight: 101.6 }
    },
    heights: {
      base: [876.3],
      wall: [609.6, 762, 914.4, 1066.8],
      tall: [2133.6, 2286, 2438.4],
      pantry: [2133.6, 2286, 2438.4]
    },
    depths: {
      base: [533.4, 609.6],
      wall: [304.8, 381, 457.2],
      tall: [609.6, 660.4],
      pantry: [304.8, 381]
    },
    standardWidths: [228.6, 304.8, 381, 457.2, 533.4, 609.6, 685.8, 762, 838.2, 914.4, 1066.8, 1219.2],
    counterHeight: 914.4,
    bullets: [
      'Face frame with 2 1/4 in stiles',
      '3/4 in plywood box with rabbeted 1/4 in back',
      'Full-overlay shaker doors, 3/4 in thick',
      '4 in toe kick, 24 in base depth',
      '36 in counters; wall cabinets 18 in above'
    ],
    notes: [
      'KCMA defines the typical base depth 24 in and counter height 36 in; stock base boxes are 34 1/2 in high.',
      'The 2 1/4 in stile/rail is shop practice for full-overlay shaker; 2 in to 2 1/2 in is the common range.',
      'Half overlay is a face-frame sizing rule (doors over a shared stile) but the wizard only exposes full overlay and inset in v1.'
    ]
  };

  /* ------------------------------------------------------------------ *
   * European frameless preset.
   * Built on the 32 mm system with a 720 mm carcass, 150 mm plinth and a
   * 900 mm worktop; 560 mm base carcass depth, 350 mm wall cabinet depth.
   * ------------------------------------------------------------------ */
  P.european = {
    id: 'european',
    label: 'European frameless',
    shortLabel: 'Frameless',
    summary: 'Clean frameless boxes on the 32 mm system: 18 mm melamine carcass, full-overlay ' +
      'lacquered MDF fronts and simple lines.',
    units: 'metric',
    sourceIds: ['din-en-1116-2018', 'lieblingskuechen-kuechenhoehe', 'cutandedge-uk-sizes', 'nobilia-brochure', 'hettich-furniture-tech', 'research-techniques'],
    space: { wallLength: 3600, ceilingHeight: 2440, counterHeight: 900 },

    construction: {
      system: 'frameless',
      carcassMaterial: 'melamine-18',
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
      style: 'separate-platform',
      height: 150,
      setback: 60,
      material: 'ply-birch-18',
      finishedFace: true
    },
    interior: {
      shelfMaterial: 'melamine-18',
      shelfThickness: 18,
      shelfEdgeband: 'pvc-0.5',
      adjustableShelvesByType: { base: 1, wall: 2, tall: 4, pantry: 5 },
      fixedShelvesByType: { base: 0, wall: 0, tall: 1, pantry: 1 }
    },
    fronts: {
      doors: {
        style: 'slab',
        count: 2,
        overlay: 'full',
        material: 'mdf-18',
        thickness: 19,
        stileWidth: 57.15,
        railWidth: 57.15,
        doorJoinery: 'cope-stick',
        panelMaterial: 'mdf-6',
        panelThickness: 6.35,
        panelStyle: 'flat',
        hingeType: 'euro-cup',
        hingeCount: 'auto',
        hingeSide: 'auto'
      },
      drawers: {
        style: 'slab',
        count: 3,
        material: 'mdf-18',
        thickness: 19,
        boxMaterial: 'ply-birch-12',
        boxJoinery: 'box-joint',
        boxSideThickness: 12.7,
        boxBottomThickness: 6.35,
        boxBottomJoinery: 'dado',
        slide: 'undermount',
        boxHeightAllowance: 25
      }
    },
    hardware: {
      pull: { id: 'bar-128', finish: 'matt black', placement: 'auto' },
      hinge: 'hinge-euro-110',
      slide: 'slide-undermount-softclose',
      shelfPin: 'shelf-pin-5',
      fastener: 'confirmat-50',
      softClose: true,
      doorBumpers: true,
      shelfPins: true,
      hangingRail: true
    },
    finish: {
      id: 'lacquer',
      label: 'Lacquered MDF',
      color: '#f2ede3',
      sheen: 'satin',
      note: 'Factory-look lacquered MDF fronts; melamine or laminate fronts are a front-material choice, not a finish id in this version.'
    },

    dims: {
      base: { width: 600, height: 870, depth: 560, toeKickHeight: 150, toeKickSetback: 60, counterHeight: 900 },
      wall: { width: 600, height: 720, depth: 350, aboveCounter: 550 },
      tall: { width: 600, height: 2100, depth: 560, toeKickHeight: 150 },
      pantry: { width: 600, height: 2100, depth: 350, toeKickHeight: 150 }
    },
    heights: {
      base: [870, 942, 1014],
      wall: [720, 900],
      tall: [2000, 2100, 2200],
      pantry: [2000, 2100, 2200]
    },
    depths: {
      base: [560],
      wall: [350],
      tall: [560],
      pantry: [350]
    },
    standardWidths: [300, 400, 450, 500, 600, 700, 800, 900, 1000, 1200],
    counterHeight: 900,
    bullets: [
      'No face frame; 32 mm system holes',
      '18 mm melamine carcass on a 150 mm plinth',
      'Full-overlay slab fronts, 3 mm reveal',
      '560 mm base depth; 350 mm wall cabinets',
      '900 mm worktop height'
    ],
    notes: [
      'DIN EN 1116 coordinates kitchen furniture sizes (worktop height, plinth height, unit depths, wall-unit depth and widths); the numeric values below are the German/UK trade conventions commonly used with it.',
      'German standard working height is 90 cm = 15 cm plinth + 72 cm carcass + about 3 cm worktop; the carcass modules 720/792/864 mm are common (Nobilia lists those three heights).',
      'UK trade practice agrees: 720 mm carcass, 560-570 mm carcass depth under a 600 mm worktop, 150 mm plinth, 300-330 mm wall carcass depth, 450-600 mm gap above the worktop.',
      'European kitchens usually stand on adjustable feet with a clipped plinth; the app models the toe kick as a separate platform so the plinth is still drawn and cut. "Separate-platform" is the closest buildable engine option in v1.',
      'Melamine/laminate fronts are common in Europe but are a material, not a finish id in this version; lacquered MDF is the default front finish.'
    ]
  };

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  P.presetIds = ['northAmerican', 'european'];

  /** Fresh deep clone so callers cannot mutate the preset singletons. */
  function clone(v) {
    if (v == null || typeof v !== 'object') return v;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(v); } catch (err) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(v));
  }

  /** Ordered list of presets for the Standard step. */
  P.list = function list() {
    return [clone(P.northAmerican), clone(P.european)];
  };

  /** Look up by id; falls back to the first preset (northAmerican). */
  P.byId = function byId(id) {
    if (id === 'european') return clone(P.european);
    if (id === 'northAmerican') return clone(P.northAmerican);
    return clone(P.northAmerican);
  };

  /** Preset recommended by project units (mirrors the wizard's rule). */
  P.forUnits = function forUnits(units) {
    return units === 'metric' ? clone(P.european) : clone(P.northAmerican);
  };

  /**
   * Convenience for the wizard: build the cabinet `overrides` patch for a type.
   * The caller still passes this through makeCabinet()/engine defaults, so any
   * value the preset gets wrong is corrected by the engine and shows in checks.
   */
  P.cabinetPatch = function cabinetPatch(presetId, type) {
    var p = P.byId(presetId);
    var t = p.dims[type] ? type : 'base';
    var d = p.dims[t];
    return {
      width: d.width,
      height: d.height,
      depth: d.depth,
      construction: clone(p.construction),
      faceFrame: clone(p.faceFrame),
      toeKick: clone(p.toeKick),
      interior: {
        shelfMaterial: p.interior.shelfMaterial,
        shelfThickness: p.interior.shelfThickness,
        shelfEdgeband: p.interior.shelfEdgeband,
        adjustableShelves: (p.interior.adjustableShelvesByType || {})[t] != null ?
          p.interior.adjustableShelvesByType[t] : 1,
        fixedShelves: (p.interior.fixedShelvesByType || {})[t] != null ?
          p.interior.fixedShelvesByType[t] : 0
      },
      front: {
        doors: clone(p.fronts.doors),
        drawers: clone(p.fronts.drawers)
      },
      hardware: clone(p.hardware),
      finish: clone(p.finish)
    };
  };

  return P;
}));
