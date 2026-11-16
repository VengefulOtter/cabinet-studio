/* ═══════════════════════════════════════════════════════════════════════════
   Cabinet Studio — guided design flow (js/ui/guided.js)

   Two modes for the Design tab, both owned here:

   · Run overview  — the default. A proportional kitchen-run strip, the next
                     action ("Design a cabinet" / "Advanced editor"), compact
                     cabinet rows, checks and quick links.
   · Guided wizard — seven one-question steps (Space → Standard → Box → Size →
                     Fronts → Inside & finish → Review). The draft cabinet is
                     resolved through CS.engine.resolveCabinet and previewed
                     with CS.draw.views; nothing is written to the project until
                     the user confirms in Review.

   The old three-pane editor is untouched and reachable behind the explicit
   "Advanced editor" door (app.setDesignMode('advanced')).

   Presets come from js/data/presets.js when it is loaded; the small fallback
   below keeps the wizard fully usable while that file is being written and if
   a build ships without it. No project mutation happens before Finish.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var doc = root.document;

  /* ───────────────────────────── Constants ───────────────────────────── */

  var STEPS = [
    { id: 'space', rail: 'Space', question: 'What are you filling?', helper: 'Measure the wall you want to fill, then we\u2019ll fit cabinets to it.' },
    { id: 'standard', rail: 'Standard', question: 'Which cabinet tradition should we start from?', helper: 'Both are common in Canada. You can change any detail later.' },
    { id: 'box', rail: 'Box', question: 'What kind of cabinet are you adding?', helper: 'Pick the box you\u2019re building next. Dimensions come next.' },
    { id: 'size', rail: 'Size', question: 'How big should it be?', helper: 'We\u2019ve picked the usual size. Adjust it if your space needs something else.' },
    { id: 'build', rail: 'Build', question: 'How is the box built?', helper: 'Pick the joint method and the carcass panel. The recommended pair matches your cabinet standard.' },
    { id: 'layout', rail: 'Layout', question: 'What\u2019s on the front?', helper: 'Choose the arrangement first \u2014 doors, drawers, a combination, or open shelving.' },
    { id: 'style', rail: 'Front style', question: 'What should the fronts look like?', helper: 'Pick the door or drawer style; counts, overlay and material follow.' },
    { id: 'inside', rail: 'Inside & finish', question: 'What\u2019s inside, and how should it look?', helper: 'Shelves, drawer slides and the finish. The defaults suit most kitchens.' },
    { id: 'review', rail: 'Review', question: 'Ready to add this cabinet?', helper: 'Check the summary and the live drawing, then add it to the run.' }
  ];
  var LAST_STEP = STEPS.length;

  var TYPE_LABEL = { base: 'Base', wall: 'Wall', tall: 'Tall', pantry: 'Pantry' };
  var TYPE_BLURB = {
    base: 'Counter-height cabinet for the main run.',
    wall: 'Above the counter, for plates and glassware.',
    tall: 'Full-height storage or an oven / pantry column.',
    pantry: 'Shallow full-height storage.'
  };
  var TYPE_ORDER = ['base', 'wall', 'tall', 'pantry'];

  var LAYOUTS = [
    { id: 'doors', title: 'Doors', desc: 'One or two doors; best for storage and sinks.', glyph: 'door' },
    { id: 'drawer-stack', title: 'Drawers', desc: 'A stack of drawers; best for pots and cutlery.', glyph: 'drawer' },
    { id: 'door-drawer', title: 'Drawer + doors', desc: 'A top drawer over doors; the classic kitchen base.', glyph: 'layers' },
    { id: 'open', title: 'Open', desc: 'No fronts \u2014 a shelf unit or a niche.', glyph: 'shelf' }
  ];
  var DOOR_STYLES = [
    { id: 'slab', title: 'Slab', desc: 'One flat panel. Cheapest, cleanest, easiest to paint.' },
    { id: 'shaker', title: 'Shaker', desc: 'Frame and panel, classic and strong. The kitchen default.' },
    { id: 'raised-panel', title: 'Raised panel', desc: 'Traditional timber look; more machining and cost.' },
    { id: 'beadboard', title: 'Beadboard', desc: 'Vertical beads in the panel; cottage and utility rooms.' },
    { id: 'glass', title: 'Glass', desc: 'A glazed frame; display cabinets and upper runs.' }
  ];
  var DRAWER_STYLES = [
    { id: 'slab', title: 'Slab', desc: 'Flat front. The usual choice for kitchen drawers.' },
    { id: 'shaker', title: 'Shaker', desc: 'Frame and panel drawer fronts to match a shaker kitchen.' }
  ];
  var OVERLAYS = [
    { value: 'full', label: 'Full overlay', desc: 'Doors cover the face; the modern look.' },
    { value: 'inset', label: 'Inset', desc: 'Doors sit inside the face frame with a small reveal.' }
  ];
  var SLIDES = [
    { value: 'undermount', label: 'Undermount', desc: 'Soft-close runner underneath; recommended.' },
    { value: 'side-mount', label: 'Side-mount', desc: 'Runner on the box sides; economical.' },
    { value: 'center-mount', label: 'Centre-mount', desc: 'Single runner underneath; light drawers only.' }
  ];
  var FINISHES = [
    { id: 'paint', title: 'Paint', desc: 'Any colour; easiest to touch up.' },
    { id: 'lacquer', title: 'Lacquer', desc: 'Smooth built-up finish; shop spray.' },
    { id: 'water-poly', title: 'Water-based poly', desc: 'Clear, durable, low odour.' },
    { id: 'stain-lacquer', title: 'Stain + lacquer', desc: 'Clear timber with a darker tone.' }
  ];
  var SHEENS = [{ id: 'satin', label: 'Satin' }, { id: 'matte', label: 'Matte' }, { id: 'gloss', label: 'Gloss' }];
  var SHELF_COUNTS = [0, 1, 2, 3, 4];
  var MATERIAL_CHOICES = [
    { id: 'hardwood-maple', label: 'Paint-grade maple' },
    { id: 'hardwood-poplar', label: 'Poplar' },
    { id: 'hardwood-oak', label: 'White oak' },
    { id: 'mdf-18', label: 'MDF \u2014 paint grade' },
    { id: 'melamine-18', label: 'Melamine-faced panel' }
  ];
  var SWATCHES = ['#f2ede3', '#ffffff', '#c9c3b5', '#7d8570', '#9a7b5d', '#3f4a52'];

  /* Build step — carcass joinery (engine `carcassJoinery` ids), researched copy. */
  var BUILD_METHODS = [
    {
      id: 'confirmat', title: 'Confirmat screws', short: 'Confirmat', meta: 'Fast \u00b7 frameless',
      desc: 'Stepped 7 mm screw that draws and registers the joint without clamps. Best in 18 mm melamine, particleboard and ply; keep the outside covered.'
    },
    {
      id: 'pocket-screw', title: 'Pocket screws', short: 'Pocket screw', meta: 'Fast \u00b7 face frames',
      desc: 'Angled screw in a drilled pocket. The small-shop standard for face frames and base joints; keep pockets on hidden faces.'
    },
    {
      id: 'dado-screw', title: 'Dado + screws', short: 'Dado + screws', meta: 'Strong \u00b7 more setup',
      desc: 'A housing joint plus glue and screws. Locates and squares the box and adds glue area; a through dado shows on the outside.'
    },
    {
      id: 'dowel', title: 'Dowels', short: 'Dowels', meta: 'Strong \u00b7 tooling',
      desc: 'Line-bored 6 or 8 mm dowels, glued and case-clamped. Production-strong when you have the boring jig and clamps; fussy without them.'
    },
    {
      id: 'biscuit', title: 'Biscuit alignment', short: 'Biscuit alignment', meta: 'Needs screws/clamps',
      desc: 'Biscuits locate parts during glue-up; they do not clamp the joint. Screws, glue or clamps must carry the load \u2014 never biscuits alone.'
    },
    {
      id: 'butt-screw', title: 'Butt + screws', short: 'Butt + screws', meta: 'Simplest \u00b7 weakest',
      desc: 'Countersunk screws from the outside with glue. Fine for shop boxes where the end is hidden; plug or cover exposed ends.'
    }
  ];
  /* Carcass sheet goods for the Build step (engine material ids). */
  var BUILD_PANELS = [
    { id: 'ply-birch-18', group: 18, thickness: 18, label: 'Baltic birch ply', desc: 'Void-free multi-ply; the all-round shop default.' },
    { id: 'ply-veneer-18', group: 18, thickness: 18.3, label: 'Veneer-core ply', desc: 'Paint- or stain-grade face for exposed ends.' },
    { id: 'ply-prefinished-18', group: 18, thickness: 18, label: 'Prefinished ply', desc: 'Factory-finished interior; skips a finishing pass.' },
    { id: 'melamine-18', group: 18, thickness: 18, label: 'Melamine-faced PB', desc: 'Wipe-clean interior; confirmats hold well.' },
    { id: 'mdf-18', group: 18, thickness: 18, label: 'MDF', desc: 'Painted boxes; seal the edges, keep out of wet areas.' },
    { id: 'particleboard-18', group: 18, thickness: 18, label: 'Particleboard', desc: 'Economical; use fine screws and protect the edges.' },
    { id: 'ply-birch-12', group: 12, thickness: 12, label: 'Baltic birch ply \u2014 light duty', desc: 'Wall boxes, dividers and shop cabinets; not for loaded base or tall boxes.', warning: true },
    { id: 'mdf-12', group: 12, thickness: 12, label: 'MDF \u2014 light duty', desc: 'Light painted boxes; seal the edges; not structural.', warning: true }
  ];
  var BACK_STYLE_OPTIONS = [
    { value: 'applied', label: 'Applied back', desc: 'Screwed to the rear. Fast; wall cabinets need a hanging rail.' },
    { value: 'rabbet', label: 'Rabbeted back', desc: 'Set into a rabbet. The usual 1/4 in back; squares the box.' },
    { value: 'dado', label: 'Dadoed back', desc: 'Captured in a dado. Strongest for hanging; extra machining.' },
    { value: 'none', label: 'No back', desc: 'Open service or shelving cabinet; wall units need a rail.' }
  ];
  var TOE_KICK_OPTIONS = [
    { value: 'separate-platform', label: 'Separate platform', desc: 'Plywood ladder platform; easiest to level a long run.' },
    { value: 'notched-sides', label: 'Notched sides', desc: 'Sides run to the floor with a front notch; face-frame idiom.' },
    { value: 'legs-levelers', label: 'Legs & levelers', desc: 'Adjustable feet; fastest on uneven floors, with a clipped kick board.' },
    { value: 'flush-base', label: 'Flush base', desc: 'Box sits on the floor with no recess; less foot room.' },
    { value: 'none', label: 'No toe kick', desc: 'Box goes to the floor; appliance, tall or furniture-style runs.' }
  ];
  var FACE_FRAME_JOINT_OPTIONS = [
    { value: 'pocket-screw', label: 'Pocket screws', desc: 'Fast and strong enough for a paint-grade frame.' },
    { value: 'biscuit', label: 'Biscuit + screws', desc: 'Biscuits align; screws and glue carry the joint.' },
    { value: 'dowel', label: 'Dowels', desc: 'Clean, strong frame joint with clamping.' },
    { value: 'mortise-tenon', label: 'Mortise & tenon', desc: 'Traditional strongest frame joint; slowest.' }
  ];

  function buildMethodById(id) {
    for (var i = 0; i < BUILD_METHODS.length; i++) if (BUILD_METHODS[i].id === id) return BUILD_METHODS[i];
    return null;
  }
  function buildPanelById(id) {
    for (var i = 0; i < BUILD_PANELS.length; i++) if (BUILD_PANELS[i].id === id) return BUILD_PANELS[i];
    return null;
  }
  function buildPanelThickness(id) {
    var panel = buildPanelById(id);
    return panel ? panel.thickness : 18;
  }
  function buildPanelGroup(id) {
    var panel = buildPanelById(id);
    return panel ? panel.group : 18;
  }
  function safeBuildPanelId(id, fallback) {
    if (buildPanelById(id)) return id;
    if (buildPanelById(fallback)) return fallback;
    return 'ply-birch-18';
  }
  function safeBuildMethodId(id, fallback) {
    if (buildMethodById(id)) return id;
    if (buildMethodById(fallback)) return fallback;
    return 'confirmat';
  }
  function buildDefaultsForPreset(preset) {
    var panelId = safeBuildPanelId(preset.construction && preset.construction.carcassMaterial, 'ply-birch-18');
    return {
      joinery: safeBuildMethodId(preset.construction && preset.construction.joinery, 'confirmat'),
      carcassMaterial: panelId,
      carcassThickness: buildPanelThickness(panelId),
      backStyle: (preset.construction && preset.construction.backStyle) || 'rabbet',
      toeKickStyle: (preset.toeKick && preset.toeKick.style) || 'separate-platform',
      faceFrameJoinery: (preset.faceFrame && preset.faceFrame.joinery) || 'pocket-screw'
    };
  }
  function buildMethodLabel(id) {
    var m = buildMethodById(id);
    return m ? (m.short || m.title) : String(id || '');
  }
  function buildPanelLabel(id) {
    var p = buildPanelById(id);
    return p ? p.label : String(id || 'Carcass panel');
  }
  function buildThicknessLabel(mm) {
    var n = num(mm, 18);
    return (Math.round(n * 10) / 10) + ' mm';
  }
  function backStyleLabel(id) {
    for (var i = 0; i < BACK_STYLE_OPTIONS.length; i++) if (BACK_STYLE_OPTIONS[i].value === id) return BACK_STYLE_OPTIONS[i].label;
    return id || 'Back';
  }
  function toeKickLabel(id) {
    for (var i = 0; i < TOE_KICK_OPTIONS.length; i++) if (TOE_KICK_OPTIONS[i].value === id) return TOE_KICK_OPTIONS[i].label;
    return id || 'Toe kick';
  }
  function faceFrameJointLabel(id) {
    for (var i = 0; i < FACE_FRAME_JOINT_OPTIONS.length; i++) if (FACE_FRAME_JOINT_OPTIONS[i].value === id) return FACE_FRAME_JOINT_OPTIONS[i].label;
    return id || 'Face-frame joint';
  }
  function buildWarningForDraft(draft) {
    if (!draft) return '';
    var panel = buildPanelById(draft.carcassMaterial);
    if (panel && panel.warning) {
      return 'Light-duty 12 mm carcass. Fine for wall boxes, dividers and shop cases; use 18 mm for base and tall cabinets. Shelf spans should stay near 600 mm, and dado depth must not exceed 6 mm.';
    }
    if (draft.type === 'wall' && draft.backStyle === 'none') {
      return 'A wall cabinet with no back needs a full hanging rail or nailer.';
    }
    return '';
  }
  var FEET_PRESETS = [2438.4, 3048, 3657.6, 4267.2]; // 8', 10', 12', 14'
  var METRE_PRESETS = [2400, 3000, 3600, 4200];

  /* Fallback presets: enough for a complete, buildable wizard run. When
     js/data/presets.js loads, its richer values win (see presetList()). */
  var FALLBACK_PRESETS = {
    northAmerican: {
      id: 'northAmerican',
      label: 'North American face frame',
      summary: 'Familiar face-frame kitchens: a 3/4 in plywood box with a hardwood face frame and full-overlay shaker doors.',
      units: 'imperial',
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
      faceFrame: { material: 'hardwood-poplar', thickness: 19, stileWidth: 57.15, joinery: 'pocket-screw' },
      toeKick: { style: 'separate-platform', height: 101.6, setback: 76.2, material: 'ply-birch-18', finishedFace: true },
      interior: { shelfMaterial: 'ply-birch-18', shelfThickness: 18, shelfEdgeband: 'pvc-2' },
      dims: {
        base: { width: 762, height: 876.3, depth: 609.6 },
        wall: { width: 762, height: 762, depth: 304.8 },
        tall: { width: 609.6, height: 2133.6, depth: 609.6 },
        pantry: { width: 609.6, height: 2133.6, depth: 304.8 }
      },
      fronts: {
        doors: { style: 'shaker', count: 2, overlay: 'full', material: 'hardwood-maple' },
        drawers: { style: 'slab', count: 3, material: 'hardwood-maple', slide: 'undermount' }
      },
      hardware: { pull: { id: 'bar-128', finish: 'brushed nickel' }, softClose: true },
      finish: { id: 'paint', color: '#f2ede3', sheen: 'satin' },
      standardWidths: [228.6, 304.8, 381, 457.2, 533.4, 609.6, 685.8, 762, 838.2, 914.4, 1066.8, 1219.2],
      heights: { base: [876.3, 914.4], wall: [609.6, 762, 914.4], tall: [1981.2, 2133.6, 2286], pantry: [1981.2, 2133.6, 2286] },
      depths: { base: [457.2, 533.4, 609.6], wall: [304.8, 381], tall: [609.6, 660.4], pantry: [304.8, 381] },
      counterHeight: 914.4,
      space: { wallLength: 3657.6, ceilingHeight: 2438.4, counterHeight: 914.4 },
      outcome: 'Familiar painted face-frame kitchens',
      bullets: ['Face frame with 2 1/4 in stiles', '3/4 in plywood box with rabbeted 1/4 in back', 'Full-overlay shaker doors, 3/4 in thick', '4 in toe kick, 24 in base depth', '36 in counters; wall cabinets 18 in above']
    },
    european: {
      id: 'european',
      label: 'European frameless',
      summary: 'Clean frameless boxes on the 32 mm system: melamine carcass, full-overlay fronts and simple lines.',
      units: 'metric',
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
      faceFrame: { material: 'hardwood-poplar', thickness: 19, stileWidth: 57.15, joinery: 'pocket-screw' },
      toeKick: { style: 'separate-platform', height: 150, setback: 60, material: 'ply-birch-18', finishedFace: true },
      interior: { shelfMaterial: 'melamine-18', shelfThickness: 18, shelfEdgeband: 'pvc-0.5' },
      dims: {
        base: { width: 600, height: 870, depth: 560, toeKickHeight: 150, toeKickSetback: 60, counterHeight: 900 },
        wall: { width: 600, height: 720, depth: 350, aboveCounter: 550 },
        tall: { width: 600, height: 2100, depth: 560, toeKickHeight: 150 },
        pantry: { width: 600, height: 2100, depth: 350, toeKickHeight: 150 }
      },
      fronts: {
        doors: { style: 'slab', count: 2, overlay: 'full', material: 'mdf-18' },
        drawers: { style: 'slab', count: 3, material: 'mdf-18', slide: 'undermount' }
      },
      hardware: { pull: { id: 'bar-128', finish: 'brushed nickel' }, softClose: true },
      finish: { id: 'lacquer', color: '#f2ede3', sheen: 'satin' },
      standardWidths: [300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200],
      heights: { base: [870, 942, 1014], wall: [720, 900], tall: [2000, 2100, 2200], pantry: [2000, 2100, 2200] },
      depths: { base: [560], wall: [350], tall: [560], pantry: [350] },
      counterHeight: 900,
      space: { wallLength: 3600, ceilingHeight: 2440, counterHeight: 900 },
      outcome: 'Clean, flat frameless kitchens',
      bullets: ['No face frame; 32 mm system holes', '18 mm melamine carcass, confirmat joinery', 'Full-overlay slab lacquered MDF fronts', '150 mm plinth, 560 mm base depth', '90 cm counters; wall units 55 cm above']
    }
  };

  /* ───────────────────────────── Module state ───────────────────────────── */

  var initialized = false;
  var host = null;
  var overviewRenderQueued = false;
  var wizard = {
    active: false,
    step: 1,
    maxStep: 1,
    mode: 'add',              // add | edit
    isNewProject: false,
    editId: null,
    draft: null,
    model: null,
    success: null,
    preview: { view: 'front' },
    compareOpen: false,
    why: {},
    baseConfig: null,
    suspended: null,
    renderedStep: 0,
    focusPending: false
  };
  var previewRo = null;

  /* ───────────────────────────── Small helpers ───────────────────────────── */

  function app() { return CS.ui.app; }
  function el(tag, props, children) { return CS.ui.app.el(tag, props, children); }
  function icon(name, cls) { return CS.ui.app.icon(name, cls); }
  function frag(children) { return CS.ui.app.frag(children); }
  function clear(node) { return CS.ui.app.clear(node); }
  function deepClone(v) { return CS.ui.app.deepClone(v); }
  function esc(v) { return CS.ui.app.esc(v); }

  function getProject() { return CS.ui.app.state.project; }
  function getState() { return CS.ui.app.state; }
  function getResolved() { return CS.ui.app.state.resolved; }
  function getCabinet(id) {
    var project = getProject();
    if (!project || !project.cabinets) return null;
    for (var i = 0; i < project.cabinets.length; i++) {
      if (project.cabinets[i].id === id) return project.cabinets[i];
    }
    return null;
  }
  function selectedCabinet() { return getCabinet(getState().selectedCabinetId); }

  function deepMerge(a, b) {
    if (CS.core && CS.core.project && typeof CS.core.project.mergeDeep === 'function') {
      try { return CS.core.project.mergeDeep(a, b); } catch (err) { /* fall through */ }
    }
    var out = deepClone(a || {});
    Object.keys(b || {}).forEach(function (key) {
      var value = b[key];
      if (value && typeof value === 'object' && !Array.isArray(value) &&
          out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
        out[key] = deepMerge(out[key], value);
      } else {
        out[key] = value && typeof value === 'object' ? deepClone(value) : value;
      }
    });
    return out;
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  /* ───────────────────────────── Presets ───────────────────────────── */

  function normalisePreset(input) {
    var id = input && input.id === 'european' ? 'european' : 'northAmerican';
    var base = deepClone(FALLBACK_PRESETS[id]);
    var merged = deepMerge(base, input || {});
    merged.id = id;
    merged.construction = deepMerge(base.construction, merged.construction);
    merged.toeKick = deepMerge(base.toeKick, merged.toeKick);
    merged.interior = deepMerge(base.interior, merged.interior);
    merged.faceFrame = deepMerge(base.faceFrame, merged.faceFrame);
    merged.fronts = deepMerge(base.fronts, merged.fronts);
    merged.hardware = deepMerge(base.hardware, merged.hardware);
    merged.finish = deepMerge(base.finish, merged.finish);
    merged.dims = deepMerge(base.dims, merged.dims);
    merged.heights = deepMerge(base.heights, merged.heights);
    merged.depths = deepMerge(base.depths, merged.depths);
    if (!Array.isArray(merged.standardWidths) || !merged.standardWidths.length) merged.standardWidths = base.standardWidths;
    if (!isFinite(merged.counterHeight)) merged.counterHeight = base.counterHeight;
    if (!Array.isArray(merged.bullets) || !merged.bullets.length) merged.bullets = base.bullets;
    if (!merged.outcome) merged.outcome = base.outcome || merged.label;
    if (!merged.space || !isFinite(merged.space.wallLength)) merged.space = base.space;
    // Optional researched convenience: CS.data.presets.cabinetPatch(presetId, type).
    merged.__patchFor = function (type) {
      var external = CS.data && CS.data.presets;
      if (external && typeof external.cabinetPatch === 'function') {
        try {
          var patch = external.cabinetPatch(merged.id, type);
          if (patch && typeof patch === 'object') return deepClone(patch);
        } catch (err) { /* fall back to the wizard's own mapping */ }
      }
      return null;
    };
    return merged;
  }

  function presetList() {
    var external = CS.data && CS.data.presets;
    var list = [];
    if (external) {
      try {
        if (typeof external.list === 'function') {
          var l = external.list();
          if (Array.isArray(l)) list = l;
        }
        if (!list.length) {
          if (external.northAmerican) list.push(external.northAmerican);
          if (external.european) list.push(external.european);
        }
      } catch (err) { list = []; }
    }
    if (!list.length) list = [FALLBACK_PRESETS.northAmerican, FALLBACK_PRESETS.european];
    return list.map(normalisePreset);
  }

  function presetById(id) {
    var list = presetList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return list[0];
  }

  function recommendedPresetId() {
    return getProject() && getProject().units === 'metric' ? 'european' : 'northAmerican';
  }

  /* ───────────────────────────── Units + formatting ───────────────────────────── */

  function draftUnit() {
    return wizard.draft && wizard.draft.units === 'metric' ? 'metric' : 'imperial';
  }

  function fmtV(mm, opts) {
    if (mm === null || mm === undefined || !isFinite(mm)) return '\u2014';
    try {
      return CS.units.format(mm, draftUnit(), Object.assign({ trim: true }, opts || {}));
    } catch (err) {
      return Math.round(mm) + ' mm';
    }
  }

  function fmtDimV(mm) {
    try { return CS.units.formatDim(mm, draftUnit()); } catch (err) { return fmtV(mm); }
  }

  function fmtShortV(mm) {
    try { return CS.units.formatLengthShort(mm, draftUnit()); } catch (err) { return fmtV(mm); }
  }

  /** Feet-and-inches copy for wall / ceiling context, e.g. 16' 0". */
  function fmtFeet(mm) {
    if (draftUnit() === 'metric') return fmtV(mm, { precision: 0 });
    var inches = num(mm, 0) / 25.4;
    var feet = Math.floor(inches / 12 + 1e-9);
    var rem = inches - feet * 12;
    var remText;
    if (rem < 0.03) remText = '0"';
    else {
      try { remText = CS.units.format(rem * 25.4, 'imperial', { fraction: 16 }); }
      catch (err) { remText = String(Math.round(rem)) + '"'; }
    }
    if (feet <= 0) return remText;
    return feet + "' " + remText;
  }

  /** Counter height reads better in inches (36") than feet (3' 0"). */
  function fmtCounter(mm) { return fmtV(mm); }

  /** Remaining-run copy: inches under 4 ft, feet-and-inches above (7' 6"). */
  function fmtRun(mm) {
    if (mm === null || mm === undefined || !isFinite(mm)) return '\u2014';
    if (draftUnit() === 'metric') return fmtV(mm, { precision: 0 });
    var inches = Math.abs(num(mm, 0)) / 25.4;
    var text = inches >= 47.999 ? fmtFeet(mm) : fmtShortV(mm);
    return mm < 0 ? '-' + text : text;
  }

  function unitSuffix() { return draftUnit() === 'metric' ? 'mm' : 'in'; }

  function parseV(text) {
    try { return CS.units.parse(text, draftUnit()); } catch (err) { return null; }
  }

  /* ───────────────────────────── Space + run maths ───────────────────────────── */

  function normaliseSpace(space) {
    if (!space || typeof space !== 'object') return null;
    var wall = num(space.wallLength, null);
    if (!wall || wall <= 0) return null;
    return {
      wallLength: wall,
      ceilingHeight: num(space.ceilingHeight, 2438.4),
      counterHeight: num(space.counterHeight, 914.4)
    };
  }

  function typicalSpace(units) {
    return units === 'metric'
      ? { wallLength: 3000, ceilingHeight: 2440, counterHeight: 900 }
      : { wallLength: 3048, ceilingHeight: 2438.4, counterHeight: 914.4 };
  }

  function projectSpace() { return normaliseSpace(getProject() && getProject().space); }

  /**
   * Display-only space for run guidance. While the wizard is open the Step 1
   * draft measurement is authoritative (it may not be saved to project.space
   * until Finish); overview/advanced always use the saved project space.
   */
  function effectiveSpace() {
    if (wizard && wizard.active && wizard.draft) {
      var draftSpace = normaliseSpace(wizard.draft.space);
      if (draftSpace) return draftSpace;
    }
    return projectSpace();
  }

  /**
   * Horizontal run footprint. Base, tall and pantry cabinets stand on the floor
   * and consume wall width; wall cabinets sit above the run and do not, unless
   * the project has only wall cabinets. Gaps are 3 mm between footprint cabinets.
   */
  function footprintCabinets(excludeCabinetId) {
    var project = getProject();
    var cabinets = ((project && project.cabinets) || []).filter(function (cab) {
      return !(excludeCabinetId && cab.id === excludeCabinetId);
    });
    var wallOnly = cabinets.length > 0 && cabinets.every(function (cab) { return cab.type === 'wall'; });
    var footprint = cabinets.filter(function (cab) { return wallOnly || cab.type !== 'wall'; });
    return { all: cabinets, footprint: footprint, wallOnly: wallOnly };
  }

  function footprintTotals(excludeCabinetId) {
    var data = footprintCabinets(excludeCabinetId);
    var total = 0;
    data.footprint.forEach(function (cab) { total += num(cab.width, 0); });
    var gaps = data.footprint.length > 1 ? (data.footprint.length - 1) * 3 : 0;
    var space = effectiveSpace();
    var remaining = space ? space.wallLength - total - gaps : null;
    return {
      cabinetWidth: total, gaps: gaps, count: data.footprint.length,
      footprint: data.footprint, wallOnly: data.wallOnly,
      space: space, remaining: remaining
    };
  }

  function runTotals(excludeCabinetId) { return footprintTotals(excludeCabinetId); }

  /** Remaining run after the draft is added/edited (0 for a wall cabinet in a mixed run). */
  function draftConsumption() {
    var draft = wizard.draft;
    if (!draft) return { remaining: null, consumed: 0, isFootprint: true };
    var totals = footprintTotals(wizard.mode === 'edit' ? wizard.editId : null);
    if (!totals.space) return { remaining: null, consumed: 0, isFootprint: true };
    var isFootprint = draft.type !== 'wall' || totals.count === 0 || totals.wallOnly;
    var consumed = isFootprint ? num(draft.width, 0) + (totals.count > 0 ? 3 : 0) : 0;
    return { remaining: totals.remaining - consumed, consumed: consumed, isFootprint: isFootprint, totals: totals };
  }

  /* ───────────────────────────── Draft creation ───────────────────────────── */

  function defaultShelves(type, preset) {
    if (type === 'wall') return 2;
    if (type === 'tall' || type === 'pantry') return 4;
    return 1;
  }

  function defaultDoorCount(width) { return width >= 457.2 ? 2 : 1; }

  function autoTypeFromRun() {
    var project = getProject();
    var cabinets = (project && project.cabinets) || [];
    if (!cabinets.length) return 'base';
    var hasWall = cabinets.some(function (cab) { return cab.type === 'wall'; });
    return hasWall ? 'base' : 'base';
  }

  function newDraft(opts) {
    opts = opts || {};
    var project = getProject() || {};
    var units = opts.units || project.units || 'imperial';
    var presetId = opts.presetId ||
      (project.settings && project.settings.standard === 'european' ? 'european' : null) ||
      (project.settings && project.settings.standard === 'northAmerican' ? 'northAmerican' : null) ||
      (units === 'metric' ? 'european' : 'northAmerican');
    var preset = presetById(presetId);
    var type = opts.type || autoTypeFromRun();
    if (TYPE_ORDER.indexOf(type) < 0) type = 'base';
    var dims = preset.dims[type] || preset.dims.base;
    var space = normaliseSpace(opts.space) || projectSpace() || typicalSpace(units);
    var buildDefaults = buildDefaultsForPreset(preset);
    var draft = {
      units: units,
      presetId: preset.id,
      type: type,
      joinery: buildDefaults.joinery,
      carcassMaterial: buildDefaults.carcassMaterial,
      carcassThickness: buildDefaults.carcassThickness,
      backStyle: buildDefaults.backStyle,
      toeKickStyle: buildDefaults.toeKickStyle,
      faceFrameJoinery: buildDefaults.faceFrameJoinery,
      projectName: opts.newProject ? (project.name || 'Kitchen project') : (project.name || ''),
      space: deepClone(space),
      width: dims.width,
      height: dims.height,
      depth: dims.depth,
      layout: type === 'base' ? 'doors' : 'doors',
      doorStyle: preset.fronts.doors.style || 'shaker',
      doorCount: defaultDoorCount(dims.width),
      overlay: (preset.construction.system === 'faceframe') ? 'full' : 'full',
      drawerStyle: preset.fronts.drawers.style || 'slab',
      drawerCount: preset.fronts.drawers.count || 3,
      material: preset.fronts.doors.material || 'hardwood-maple',
      slide: preset.fronts.drawers.slide || 'undermount',
      shelves: defaultShelves(type, preset),
      finishId: preset.finish.id || 'paint',
      finishColor: preset.finish.color || '#f2ede3',
      sheen: preset.finish.sheen || 'satin',
      tag: '',
      name: '',
      spaceNote: !normaliseSpace(project.space),
      changed: false
    };
    return draft;
  }

  function draftFromCabinet(cabinet) {
    var project = getProject() || {};
    var presetId = (cabinet.construction && cabinet.construction.system === 'faceframe') ? 'northAmerican' : 'european';
    var preset = presetById(presetId);
    var front = cabinet.front || {};
    var doors = front.doors || {};
    var drawers = front.drawers || {};
    var draft = newDraft({ units: project.units, presetId: presetId, type: cabinet.type, space: project.space });
    draft.type = cabinet.type;
    draft.width = num(cabinet.width, draft.width);
    draft.height = num(cabinet.height, draft.height);
    draft.depth = num(cabinet.depth, draft.depth);
    draft.layout = front.type || 'doors';
    draft.doorStyle = doors.style || preset.fronts.doors.style;
    draft.doorCount = num(doors.count, defaultDoorCount(draft.width));
    draft.overlay = doors.overlay === 'inset' ? 'inset' : 'full';
    draft.drawerStyle = drawers.style || preset.fronts.drawers.style;
    draft.drawerCount = num(drawers.count, preset.fronts.drawers.count);
    draft.material = doors.material || drawers.material || preset.fronts.doors.material;
    draft.slide = drawers.slide || preset.fronts.drawers.slide;
    var construction = cabinet.construction || {};
    var toeKick = cabinet.toeKick || {};
    var faceFrame = cabinet.faceFrame || {};
    draft.joinery = safeBuildMethodId(construction.joinery, draft.joinery);
    draft.carcassMaterial = safeBuildPanelId(construction.carcassMaterial, draft.carcassMaterial);
    draft.carcassThickness = num(construction.carcassThickness, buildPanelThickness(draft.carcassMaterial));
    draft.backStyle = construction.backStyle || draft.backStyle;
    draft.toeKickStyle = toeKick.style || draft.toeKickStyle;
    draft.faceFrameJoinery = faceFrame.joinery || draft.faceFrameJoinery;
    draft.shelves = num((cabinet.interior || {}).adjustableShelves, defaultShelves(cabinet.type, preset));
    draft.finishId = (cabinet.finish || {}).id || preset.finish.id;
    draft.finishColor = (cabinet.finish || {}).color || preset.finish.color;
    draft.sheen = (cabinet.finish || {}).sheen || 'satin';
    draft.tag = cabinet.tag || '';
    draft.name = cabinet.name || '';
    draft.projectName = project.name || '';
    draft.spaceNote = !normaliseSpace(project.space);
    draft.changed = false;
    return draft;
  }

  /* ───────────────────────────── Draft → cabinet config ───────────────────────────── */

  function panelStyleFor(doorStyle) {
    if (doorStyle === 'raised-panel') return 'raised';
    if (doorStyle === 'glass') return 'glass';
    if (doorStyle === 'beadboard') return 'beadboard';
    if (doorStyle === 'slab') return 'flat';
    return 'recessed';
  }

  function frontOverrides() {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    var layout = draft.layout;
    var drawerCount = layout === 'drawer-stack' ? draft.drawerCount : (layout === 'door-drawer' ? 1 : 3);
    var researched = deepClone(preset.fronts || {});
    var presetDoorMaterial = preset.fronts && preset.fronts.doors && preset.fronts.doors.material;
    var material = safeMaterialId(draft.material, presetDoorMaterial);
    if (material !== draft.material) draft.material = material;
    return deepMerge(researched, {
      type: layout,
      reveal: 3,
      doors: {
        count: draft.doorCount,
        style: draft.doorStyle,
        material: material,
        thickness: 19,
        overlay: draft.overlay,
        stileWidth: 57.15,
        railWidth: 57.15,
        doorJoinery: preset.construction.system === 'faceframe' ? 'cope-stick' : 'mitered',
        panelMaterial: 'ply-birch-6',
        panelThickness: 6.35,
        panelStyle: panelStyleFor(draft.doorStyle),
        glassThickness: 3,
        beadSpacing: 57.15,
        muntins: draft.doorStyle === 'glass' ? 1 : 0,
        hingeType: 'euro-cup',
        hingeCount: 'auto',
        hingeSide: 'auto'
      },
      drawers: {
        count: drawerCount,
        style: draft.drawerStyle,
        material: material,
        thickness: 19,
        heights: null,
        boxMaterial: 'ply-birch-12',
        boxJoinery: 'dovetail',
        boxSideThickness: 12.7,
        boxBottomThickness: 6.35,
        boxBottomJoinery: 'dado',
        boxHeightAllowance: 25,
        slide: draft.slide,
        slideLength: null,
        boxWidthClearance: null,
        boxDepthClearance: null
      },
      combined: { drawerHeight: 177.8, doorsBelow: Math.max(1, draft.doorCount) }
    });
  }

  function presetOverrides() {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    var panelId = safeBuildPanelId(draft.carcassMaterial, preset.construction.carcassMaterial);
    var construction = deepClone(preset.construction);
    construction.carcassMaterial = panelId;
    construction.carcassThickness = num(draft.carcassThickness, buildPanelThickness(panelId)) || buildPanelThickness(panelId);
    construction.joinery = safeBuildMethodId(draft.joinery, preset.construction.joinery);
    construction.backStyle = draft.backStyle || construction.backStyle;
    var faceFrame = deepClone(preset.faceFrame);
    if (faceFrame) faceFrame.joinery = draft.faceFrameJoinery || faceFrame.joinery;
    var toeKick = deepClone(preset.toeKick);
    toeKick.style = draft.toeKickStyle || toeKick.style;
    if (draft.type === 'wall') toeKick = deepMerge(toeKick, { style: 'none' });
    return {
      construction: construction,
      faceFrame: faceFrame,
      toeKick: toeKick,
      interior: {
        adjustableShelves: draft.shelves,
        fixedShelves: 0,
        shelfMaterial: preset.interior.shelfMaterial,
        shelfThickness: preset.interior.shelfThickness,
        shelfFrontSetback: 10,
        shelfEdgeband: preset.interior.shelfEdgeband,
        dividers: 0
      },
      hardware: {
        pull: deepClone(preset.hardware.pull),
        softClose: preset.hardware.softClose !== false,
        doorBumpers: true,
        shelfPins: true,
        hangingRail: draft.type !== 'base'
      },
      finish: { id: draft.finishId, color: draft.finishColor, sheen: draft.sheen }
    };
  }

  /**
   * Edit-mode patch: only paths the guided UI actually changed. Starting from
   * the existing cabinet and merging this minimal patch keeps every Advanced
   * field the wizard does not surface (backRecess, shelf materials/hardware,
   * front thicknesses, face-frame stock, toe-kick dimensions, ...).
   */
  function editOverrides() {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    var base = wizard.baseConfig || {};
    var panelId = safeBuildPanelId(draft.carcassMaterial, preset.construction.carcassMaterial);
    var panelMaterial = safeMaterialId(draft.material, preset.fronts && preset.fronts.doors && preset.fronts.doors.material);
    var baseFront = base.front || {};
    var baseDoors = baseFront.doors || {};
    var baseDrawers = baseFront.drawers || {};
    var baseConstruction = base.construction || {};
    var baseFaceFrame = base.faceFrame || {};
    var baseToeKick = base.toeKick || {};
    var baseInterior = base.interior || {};
    var baseFinish = base.finish || {};
    function changed(next, previous) {
      if (next === previous) return false;
      if (typeof next === 'number' && typeof previous === 'number') return Math.abs(next - previous) > 0.0001;
      return true;
    }
    function put(target, key, value) {
      if (changed(value, target[key])) target[key] = value;
    }

    var patch = {};
    if (changed(draft.width, base.width)) patch.width = draft.width;
    if (changed(draft.height, base.height)) patch.height = draft.height;
    if (changed(draft.depth, base.depth)) patch.depth = draft.depth;

    var construction = {};
    put(construction, 'system', preset.construction.system === 'faceframe' ? 'faceframe' : 'frameless');
    put(construction, 'joinery', safeBuildMethodId(draft.joinery, preset.construction.joinery));
    put(construction, 'carcassMaterial', panelId);
    put(construction, 'carcassThickness', num(draft.carcassThickness, buildPanelThickness(panelId)) || buildPanelThickness(panelId));
    put(construction, 'backStyle', draft.backStyle || baseConstruction.backStyle || 'rabbet');
    if (changed(construction.system, baseConstruction.system)) patch.construction = Object.assign({}, patch.construction || {}, { system: construction.system });
    if (changed(construction.joinery, baseConstruction.joinery)) patch.construction = Object.assign({}, patch.construction || {}, { joinery: construction.joinery });
    if (changed(construction.carcassMaterial, baseConstruction.carcassMaterial)) patch.construction = Object.assign({}, patch.construction || {}, { carcassMaterial: construction.carcassMaterial });
    if (changed(construction.carcassThickness, baseConstruction.carcassThickness)) patch.construction = Object.assign({}, patch.construction || {}, { carcassThickness: construction.carcassThickness });
    if (changed(construction.backStyle, baseConstruction.backStyle)) patch.construction = Object.assign({}, patch.construction || {}, { backStyle: construction.backStyle });

    var faceFrameJoinery = draft.faceFrameJoinery || baseFaceFrame.joinery || (preset.faceFrame && preset.faceFrame.joinery) || 'pocket-screw';
    if (changed(faceFrameJoinery, baseFaceFrame.joinery)) patch.faceFrame = { joinery: faceFrameJoinery };

    var toeKickStyle = draft.toeKickStyle || baseToeKick.style || (preset.toeKick && preset.toeKick.style) || 'separate-platform';
    if (changed(toeKickStyle, baseToeKick.style)) patch.toeKick = { style: toeKickStyle };

    if (changed(draft.shelves, baseInterior.adjustableShelves)) patch.interior = { adjustableShelves: draft.shelves };

    var finish = { id: draft.finishId, color: draft.finishColor, sheen: draft.sheen };
    var finishPatch = {};
    ['id', 'color', 'sheen'].forEach(function (key) { if (changed(finish[key], baseFinish[key])) finishPatch[key] = finish[key]; });
    if (Object.keys(finishPatch).length) patch.finish = finishPatch;

    var front = {};
    if (changed(draft.layout, baseFront.type)) front.type = draft.layout;
    var doors = {};
    var desiredDoorCount = draft.doorCount;
    if (changed(desiredDoorCount, baseDoors.count)) doors.count = desiredDoorCount;
    if (changed(draft.doorStyle, baseDoors.style)) doors.style = draft.doorStyle;
    if (changed(panelMaterial, baseDoors.material)) doors.material = panelMaterial;
    if (changed(draft.overlay, baseDoors.overlay)) doors.overlay = draft.overlay;
    if (changed(draft.doorStyle, baseDoors.style) && changed(panelStyleFor(draft.doorStyle), baseDoors.panelStyle)) {
      doors.panelStyle = panelStyleFor(draft.doorStyle);
    }
    if (Object.keys(doors).length) front.doors = doors;
    var drawers = {};
    var desiredDrawerCount = draft.layout === 'door-drawer' ? 1 : draft.drawerCount;
    if (changed(desiredDrawerCount, baseDrawers.count)) drawers.count = desiredDrawerCount;
    if (changed(draft.drawerStyle, baseDrawers.style)) drawers.style = draft.drawerStyle;
    if (changed(panelMaterial, baseDrawers.material)) drawers.material = panelMaterial;
    if (changed(draft.slide, baseDrawers.slide)) drawers.slide = draft.slide;
    if (Object.keys(drawers).length) front.drawers = drawers;
    if (draft.layout === 'door-drawer') {
      var doorsBelow = Math.max(1, draft.doorCount);
      if (changed(doorsBelow, baseFront.combined && baseFront.combined.doorsBelow)) {
        front.combined = { doorsBelow: doorsBelow };
      }
    }
    if (Object.keys(front).length) patch.front = front;
    return patch;
  }

  function buildConfig() {
    if (!wizard.draft) return null;
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    if (wizard.mode === 'edit' && wizard.baseConfig) {
      // Start from the existing cabinet so advanced fields the wizard does not
      // surface survive an edit; merge only the surfaced paths.
      var cfg = deepClone(wizard.baseConfig);
      var overrides = editOverrides();
      cfg = deepMerge(cfg, overrides);
      cfg.id = wizard.editId;
      cfg.tag = draft.tag || cfg.tag;
      cfg.name = draft.name || cfg.name;
      return cfg;
    }
    var patch = typeof preset.__patchFor === 'function' ? preset.__patchFor(draft.type) : null;
    var overrides2 = deepMerge(patch || {}, presetOverrides());
    overrides2 = deepMerge(overrides2, {
      width: draft.width,
      height: draft.height,
      depth: draft.depth,
      front: frontOverrides()
    });
    var created = CS.core.project.makeCabinet(draft.type, overrides2);
    created.tag = draft.tag || 'NEW';
    created.name = draft.name || (TYPE_LABEL[draft.type] + ' cabinet');
    if (wizard.draft.projectName && wizard.isNewProject) {
      // Name is applied to the project at Finish, not the cabinet.
    }
    return created;
  }

  function resolveDraft() {
    if (!wizard.draft) return null;
    var project = getProject();
    var cfg = buildConfig();
    if (!project || !cfg || !CS.engine || typeof CS.engine.resolveCabinet !== 'function') return null;
    try {
      wizard.model = CS.engine.resolveCabinet(project, cfg);
      return wizard.model;
    } catch (err) {
      if (root.console && root.console.error) root.console.error('[Cabinet Studio] Guided draft could not resolve', err);
      wizard.model = null;
      return null;
    }
  }

  function draftRemaining() {
    return draftConsumption().remaining;
  }

  /* ───────────────────────────── Illustrations (inline SVG) ───────────────────────────── */

  function sketchWrap(markup, className) {
    var div = el('div', { className: 'choice-visual' + (className ? ' ' + className : ''), attrs: { 'aria-hidden': 'true' } });
    div.innerHTML = markup;
    return div;
  }

  function cabinetSketch(type, layout) {
    var toe = type === 'base' || type === 'tall' ? '<line x1="14" y1="74" x2="106" y2="74"/><line x1="20" y1="80" x2="100" y2="80"/>' : '';
    var topY = type === 'wall' ? 16 : 12;
    var bottomY = type === 'base' || type === 'tall' ? 66 : 70;
    var front = '';
    if (layout === 'drawers') {
      front = '<line x1="16" y1="' + (topY + 18) + '" x2="104" y2="' + (topY + 18) + '"/>' +
        '<line x1="16" y1="' + (topY + 34) + '" x2="104" y2="' + (topY + 34) + '"/>' +
        '<line x1="16" y1="' + (topY + 50) + '" x2="104" y2="' + (topY + 50) + '"/>';
    } else if (layout === 'door-drawer') {
      front = '<line x1="16" y1="' + (topY + 16) + '" x2="104" y2="' + (topY + 16) + '"/>' +
        '<line x1="60" y1="' + (topY + 18) + '" x2="60" y2="' + bottomY + '"/>' +
        '<line x1="52" y1="' + (topY + 20) + '" x2="68" y2="' + (topY + 20) + '"/>';
    } else if (layout === 'open') {
      front = '<line x1="16" y1="' + (topY + 22) + '" x2="104" y2="' + (topY + 22) + '"/>' +
        '<line x1="16" y1="' + (topY + 40) + '" x2="104" y2="' + (topY + 40) + '"/>';
    } else {
      front = '<line x1="60" y1="' + topY + '" x2="60" y2="' + bottomY + '" class="svg-thin"/>' +
        '<rect x="16" y="' + (topY + 2) + '" width="88" height="' + (bottomY - topY - 4) + '" class="svg-thin"/>';
    }
    return '<svg viewBox="0 0 120 92" class="choice-svg" focusable="false">' +
      '<rect x="12" y="' + topY + '" width="96" height="' + (bottomY - topY) + '" rx="1.5" class="svg-cut"/>' +
      (type === 'wall' ? '<line x1="12" y1="' + (bottomY - 8) + '" x2="108" y2="' + (bottomY - 8) + '" class="svg-thin"/>' : '') +
      '<g class="svg-thin">' + front + '</g>' +
      toe + '</svg>';
  }

  function doorSketch(style) {
    var inner = '';
    if (style === 'slab') {
      inner = '<rect x="18" y="10" width="84" height="70" class="svg-fill"/>';
    } else if (style === 'shaker') {
      inner = '<rect x="16" y="8" width="88" height="74" class="svg-cut"/>' +
        '<rect x="28" y="20" width="64" height="50" class="svg-fill"/>';
    } else if (style === 'raised-panel') {
      inner = '<rect x="16" y="8" width="88" height="74" class="svg-cut"/>' +
        '<rect x="30" y="22" width="60" height="46" class="svg-fill"/>' +
        '<rect x="38" y="30" width="44" height="30" class="svg-thin"/>';
    } else if (style === 'beadboard') {
      inner = '<rect x="16" y="8" width="88" height="74" class="svg-cut"/>';
      for (var x = 28; x <= 92; x += 12) inner += '<line x1="' + x + '" y1="12" x2="' + x + '" y2="78" class="svg-thin"/>';
    } else if (style === 'glass') {
      inner = '<rect x="16" y="8" width="88" height="74" class="svg-cut"/>' +
        '<rect x="28" y="20" width="64" height="50" class="svg-thin"/>' +
        '<line x1="28" y1="20" x2="92" y2="70" class="svg-thin"/>' +
        '<line x1="92" y1="20" x2="28" y2="70" class="svg-thin"/>';
    }
    return '<svg viewBox="0 0 120 90" class="choice-svg" focusable="false">' +
      '<rect x="10" y="6" width="100" height="78" rx="1.5" class="svg-cut"/>' + inner + '</svg>';
  }

  function layoutSketch(layout) {
    if (layout === 'drawers') return cabinetSketch('base', 'drawers');
    if (layout === 'door-drawer') return cabinetSketch('base', 'door-drawer');
    if (layout === 'open') return cabinetSketch('base', 'open');
    return cabinetSketch('base', 'doors');
  }

  function spaceSketch() {
    return '<svg viewBox="0 0 120 90" class="choice-svg" focusable="false">' +
      '<line x1="10" y1="78" x2="110" y2="78" class="svg-cut"/>' +
      '<line x1="10" y1="78" x2="10" y2="20" class="svg-thin"/>' +
      '<line x1="10" y1="20" x2="110" y2="20" class="svg-thin"/>' +
      '<rect x="18" y="48" width="24" height="30" class="svg-fill"/>' +
      '<rect x="44" y="48" width="24" height="30" class="svg-fill"/>' +
      '<rect x="70" y="48" width="24" height="30" class="svg-fill"/>' +
      '<line x1="18" y1="48" x2="94" y2="48" class="svg-thin"/>' +
      '</svg>';
  }

  function standardSketch(faceFrame) {
    if (faceFrame) {
      return '<svg viewBox="0 0 120 90" class="choice-svg" focusable="false">' +
        '<rect x="12" y="8" width="96" height="74" class="svg-cut"/>' +
        '<rect x="18" y="14" width="84" height="62" class="svg-thin"/>' +
        '<line x1="18" y1="30" x2="102" y2="30" class="svg-thin"/>' +
        '<line x1="18" y1="60" x2="102" y2="60" class="svg-thin"/>' +
        '<line x1="60" y1="30" x2="60" y2="60" class="svg-thin"/>' +
        '</svg>';
    }
    return '<svg viewBox="0 0 120 90" class="choice-svg" focusable="false">' +
      '<rect x="12" y="8" width="96" height="74" class="svg-cut"/>' +
      '<line x1="24" y1="16" x2="24" y2="74" class="svg-thin"/>' +
      '<line x1="48" y1="16" x2="48" y2="74" class="svg-thin"/>' +
      '<line x1="72" y1="16" x2="72" y2="74" class="svg-thin"/>' +
      '<line x1="96" y1="16" x2="96" y2="74" class="svg-thin"/>' +
      '</svg>';
  }

  /* ───────────────────────────── DOM building blocks ───────────────────────────── */

  function singleChoice(opts) {
    var group = el('div', {
      className: 'choice-grid' + (opts.columns ? ' cols-' + opts.columns : '') + (opts.compact ? ' is-compact' : ''),
      attrs: { role: 'radiogroup', 'aria-label': opts.label || 'Choices' }
    });
    var buttons = [];
    var current = opts.get();
    function sync() {
      var value = opts.get();
      buttons.forEach(function (btn, index) {
        var selected = btn.dataset.value === String(value);
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-checked', selected ? 'true' : 'false');
        btn.tabIndex = selected ? 0 : -1;
      });
    }
    function choose(value) {
      opts.set(value);
      sync();
      if (opts.onChange) opts.onChange(value);
    }
    (opts.items || []).forEach(function (item, index) {
      var selected = item.value === current;
      var visual = item.visual || (item.glyph ? (item.visualMarkup || null) : null);
      var btn = el('button', {
        className: 'choice-card' + (item.badge ? ' has-badge' : ''),
        type: 'button',
        role: 'radio',
        attrs: { 'aria-checked': selected ? 'true' : 'false', tabindex: selected ? '0' : '-1' },
        dataset: { value: String(item.value) },
        on: {
          click: function () { choose(item.value); },
          keydown: function (evt) {
            var idx = buttons.indexOf(btn);
            if (evt.key === 'ArrowRight' || evt.key === 'ArrowDown') {
              evt.preventDefault();
              var next = buttons[(idx + 1) % buttons.length];
              next.focus();
              choose(next.dataset.value);
            } else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowUp') {
              evt.preventDefault();
              var prev = buttons[(idx - 1 + buttons.length) % buttons.length];
              prev.focus();
              choose(prev.dataset.value);
            } else if (evt.key === ' ' || evt.key === 'Enter') {
              evt.preventDefault();
              choose(item.value);
            }
          }
        }
      });
      if (item.data) {
        Object.keys(item.data).forEach(function (key) {
          btn.setAttribute('data-' + key, String(item.data[key]));
        });
      }
      if (item.visual) {
        btn.appendChild(item.visual);
      } else if (item.markup) {
        btn.appendChild(sketchWrap(item.markup));
      }
      var text = el('span', { className: 'choice-text' }, [
        el('span', { className: 'choice-name', text: item.title }),
        item.desc ? el('span', { className: 'choice-desc', text: item.desc }) : null,
        item.meta ? el('span', { className: 'choice-meta', text: item.meta }) : null
      ]);
      btn.appendChild(text);
      if (item.badge) btn.appendChild(el('span', { className: 'choice-badge', text: item.badge }));
      group.appendChild(btn);
      buttons.push(btn);
    });
    sync();
    return group;
  }

  function chipRow(opts) {
    var row = el('div', { className: 'chip-row', attrs: { role: 'group', 'aria-label': opts.label || 'Presets' } });
    var buttons = [];
    function sync() {
      var value = opts.get();
      buttons.forEach(function (btn) {
        var active = Math.abs(num(btn.dataset.value, NaN) - value) < 0.5;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    (opts.values || []).forEach(function (value) {
      var btn = el('button', {
        className: 'chip-btn', type: 'button',
        attrs: { 'aria-pressed': 'false' },
        dataset: { value: value },
        text: opts.format ? opts.format(value) : String(value),
        on: {
          click: function () {
            opts.set(value);
            sync();
            if (opts.onChange) opts.onChange(value);
          }
        }
      });
      buttons.push(btn);
      row.appendChild(btn);
    });
    sync();
    return row;
  }

  function guidedField(opts) {
    var wrap = el('div', { className: 'guided-field' + (opts.wide ? ' is-wide' : '') });
    var id = opts.id || ('guided-field-' + (++uid));
    if (opts.kind === 'text') {
      var textLabel = el('label', { className: 'guided-field-label', attrs: { for: id }, text: opts.label });
      var textInput = el('input', {
        className: 'input', id: id,
        attrs: { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': opts.label }
      });
      textInput.value = opts.value === null || opts.value === undefined ? '' : String(opts.value);
      if (opts.onInput) textInput.addEventListener('input', function () { if (textInput.isConnected) opts.onInput(textInput.value); });
      if (opts.set) textInput.addEventListener('input', function () { if (textInput.isConnected) opts.set(textInput.value); });
      wrap.appendChild(textLabel);
      wrap.appendChild(textInput);
      if (opts.hint) wrap.appendChild(el('div', { className: 'guided-field-hint', text: opts.hint }));
      return wrap;
    }
    var label = el('label', { className: 'guided-field-label', attrs: { for: id }, text: opts.label });
    wrap.appendChild(label);
    if (opts.kind === 'select') {
      var selectAttrs = { 'aria-label': opts.label };
      if (opts.attrs) Object.keys(opts.attrs).forEach(function (k) { selectAttrs[k] = opts.attrs[k]; });
      var select = el('select', { className: 'select', id: id, attrs: selectAttrs, dataset: opts.dataset || null });
      function addOption(container, opt) {
        var option = el('option', { text: opt.label });
        option.value = opt.value;
        if (String(opt.value) === String(opts.value)) option.selected = true;
        container.appendChild(option);
      }
      if (Array.isArray(opts.groups) && opts.groups.length) {
        opts.groups.forEach(function (group) {
          var optgroup = doc.createElement('optgroup');
          optgroup.label = group.label;
          (group.options || []).forEach(function (opt) { addOption(optgroup, opt); });
          select.appendChild(optgroup);
        });
      } else {
        (opts.options || []).forEach(function (opt) { addOption(select, opt); });
      }
      if (opts.onChange) select.addEventListener('change', function () { opts.onChange(select.value); });
      wrap.appendChild(select);
      if (opts.hint) wrap.appendChild(el('div', { className: 'guided-field-hint', text: opts.hint }));
      return wrap;
    }
    var wrapInput = el('div', { className: 'input-wrap' });
    var input = el('input', {
      className: 'input', id: id,
      attrs: { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': opts.label }
    });
    if (opts.formatValue) input.value = opts.formatValue(opts.value);
    else if (typeof opts.value === 'number') input.value = fmtV(opts.value, { trim: true });
    else input.value = String(opts.value);
    var suffix = el('span', { className: 'input-unit', text: opts.unitLabel || unitSuffix() });
    wrapInput.appendChild(input);
    if (opts.unitLabel !== false) wrapInput.appendChild(suffix);
    var error = el('div', { className: 'guided-field-error', hidden: true });
    function validate(mm) {
      if (mm === null || !isFinite(mm)) {
        showError('Enter a measurement, e.g. ' + (draftUnit() === 'metric' ? '876 mm' : '34\u00bd in'));
        return false;
      }
      if (isFinite(opts.min) && mm < opts.min) { showError('Minimum ' + fmtV(opts.min)); return false; }
      if (isFinite(opts.max) && mm > opts.max) { showError('Maximum ' + fmtV(opts.max)); return false; }
      hideError();
      return true;
    }
    function showError(message) {
      clear(error);
      error.appendChild(icon('alert'));
      error.appendChild(el('span', { text: message }));
      error.hidden = false;
      wrapInput.classList.add('is-invalid');
    }
    function hideError() {
      error.hidden = true;
      error.textContent = '';
      wrapInput.classList.remove('is-invalid');
    }
    input.addEventListener('input', function () {
      var mm = opts.parse ? opts.parse(input.value) : parseV(input.value);
      if (mm === null) return; // wait for a complete value
      if (!validate(mm)) return;
      opts.set(mm);
      if (opts.onChange) opts.onChange(mm);
    });
    input.addEventListener('blur', function () {
      if (!input.isConnected) return;
      var mm = opts.parse ? opts.parse(input.value) : parseV(input.value);
      if (mm === null) mm = opts.get();
      input.value = opts.formatValue ? opts.formatValue(mm) : fmtV(mm);
      validate(mm);
    });
    input.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') { evt.preventDefault(); input.blur(); }
      if (evt.key === 'Escape') { input.value = fmtV(opts.get()); hideError(); input.blur(); }
    });
    wrap.appendChild(wrapInput);
    if (opts.hint) wrap.appendChild(el('div', { className: 'guided-field-hint', text: opts.hint }));
    wrap.appendChild(error);
    return wrap;
  }

  var uid = 0;

  function sectionTitle(text, note) {
    return el('div', { className: 'wizard-subhead' }, [
      el('h2', { className: 'wizard-subhead-title', text: text }),
      note ? el('span', { className: 'wizard-subhead-note', text: note }) : null
    ]);
  }

  /* ───────────────────────────── App integration helpers ───────────────────────────── */

  function setDesignMode(mode) { CS.ui.app.setDesignMode(mode); }

  function openAdvancedEditorDirect() {
    var target = wizard.mode === 'edit' ? wizard.editId : getState().selectedCabinetId;
    if (wizard.active && wizard.draft) {
      wizard.suspended = {
        mode: wizard.mode,
        editId: wizard.editId,
        isNewProject: wizard.isNewProject,
        step: wizard.step,
        maxStep: wizard.maxStep,
        draft: deepClone(wizard.draft),
        baseConfig: wizard.baseConfig ? deepClone(wizard.baseConfig) : null
      };
    }
    wizard.active = false;
    wizard.success = null;
    if (target) CS.ui.app.selectCabinet(target);
    setDesignMode('advanced');
  }

  /** Back from Advanced: resume the wizard draft where it was left, if any. */
  function resumeFromAdvanced() {
    var saved = wizard.suspended;
    if (!saved) { showOverview(); return; }
    wizard.suspended = null;
    wizard.mode = saved.mode;
    wizard.editId = saved.editId;
    wizard.isNewProject = saved.isNewProject;
    wizard.step = saved.step;
    wizard.maxStep = saved.maxStep;
    wizard.draft = saved.draft;
    wizard.baseConfig = saved.baseConfig;
    wizard.success = null;
    wizard.active = true;
    wizard.focusPending = false;
    setDesignMode('guided');
    renderWizard();
  }

  function openAdvancedEditor() {
    if (!wizard.active) { openAdvancedEditorDirect(); return; }
    confirmDiscardThen(openAdvancedEditorDirect);
  }

  function confirmDiscardThen(fn) {
    if (!wizard.active || !wizard.draft || !wizard.draft.changed) { fn(); return; }
    CS.ui.app.confirm({
      title: 'Leave the cabinet setup?',
      message: 'The choices you made in the wizard have not been added to the project.',
      note: 'Nothing is lost from the run or from previously added cabinets.',
      confirmLabel: 'Leave wizard',
      cancelLabel: 'Keep setting up',
      danger: true
    }).then(function (confirmed) { if (confirmed) fn(); });
  }

  /* ───────────────────────────── Overview render ───────────────────────────── */

  function scheduleOverviewRender() {
    if (overviewRenderQueued) return;
    overviewRenderQueued = true;
    var run = function () {
      overviewRenderQueued = false;
      if (wizard.active) return;
      if (getState().designMode !== 'guided') return;
      if (getState().activeTab !== 'design') return;
      renderOverview();
    };
    if (root.requestAnimationFrame) root.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  function frontSummaryOf(cabinet, model) {
    var front = (cabinet && cabinet.front) || {};
    var type = front.type || 'doors';
    if (type === 'open') return 'Open \u00b7 no fronts';
    if (type === 'drawers' || type === 'drawer-stack') {
      var count = (front.drawers && front.drawers.count) || 0;
      return count + (count === 1 ? ' drawer' : ' drawers');
    }
    if (type === 'door-drawer') return 'Drawer + doors';
    var doors = (front.doors && front.doors.count) || 1;
    var style = (front.doors && front.doors.style) || '';
    var styleLabel = style ? style.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Doors';
    return styleLabel + ' \u00b7 ' + doors + (doors === 1 ? ' door' : ' doors');
  }

  function cabinetWarningCount(cabinetId) {
    var resolved = getResolved();
    if (!resolved || !Array.isArray(resolved.cabinets)) return { total: 0, errors: 0 };
    for (var i = 0; i < resolved.cabinets.length; i++) {
      var model = resolved.cabinets[i];
      var cfg = model && model.config ? model.config : model;
      if (cfg && cfg.id === cabinetId) {
        var warnings = Array.isArray(model.warnings) ? model.warnings : [];
        return {
          total: warnings.length,
          errors: warnings.filter(function (w) { return w.severity === 'error'; }).length
        };
      }
    }
    return { total: 0, errors: 0 };
  }

  function renderOverview() {
    if (!host) return;
    if (wizard.active) { renderWizard(); return; }
    host.dataset.mode = 'overview';
    var project = getProject();
    clear(host);
    if (!project) return;
    var state = getState();
    var cabinets = project.cabinets || [];
    var space = projectSpace();
    var totals = runTotals();
    var selected = selectedCabinet();
    var resolved = getResolved();
    var warnings = resolved && Array.isArray(resolved.warnings) ? resolved.warnings : [];

    var overview = el('div', { className: 'guided-overview', attrs: { id: 'run-overview' } });

    /* Heading + space summary */
    var head = el('header', { className: 'overview-head' });
    var stats = resolved && resolved.stats ? resolved.stats : null;
    var statsLine = cabinets.length
      ? cabinets.length + (cabinets.length === 1 ? ' cabinet' : ' cabinets') +
        (stats ? ' \u00b7 ' + stats.partCount + ' parts \u00b7 ' + stats.sheetCount + ' sheets' : '') +
        ' in this run' + (space ? '' : ' \u00b7 space not set yet')
      : 'Nothing in the run yet. Set up the space, then design the first cabinet.';
    var headText = el('div', { className: 'overview-head-text' }, [
      el('div', { className: 'overview-eyebrow', text: 'Design run' }),
      el('h1', { className: 'overview-title', text: readSpaceRoom(project) }),
      el('p', { className: 'overview-sub', text: statsLine })
    ]);
    head.appendChild(headText);
    var headActions = el('div', { className: 'overview-head-actions' });
    if (space) {
      headActions.appendChild(el('span', { className: 'meta-chip', text: 'Wall ' + fmtFeet(space.wallLength) }));
      headActions.appendChild(el('span', { className: 'meta-chip', text: 'Ceiling ' + fmtFeet(space.ceilingHeight) }));
      headActions.appendChild(el('span', { className: 'meta-chip', text: 'Counter ' + fmtCounter(space.counterHeight) }));
      headActions.appendChild(el('button', {
        className: 'btn btn-secondary btn-sm', type: 'button',
        on: { click: openSpaceDialog }
      }, [icon('sliders'), el('span', { text: 'Edit space' })]));
    } else {
      headActions.appendChild(el('button', {
        className: 'btn btn-primary btn-sm', type: 'button',
        on: { click: openSpaceDialog }
      }, [icon('ruler'), el('span', { text: 'Set up your space' })]));
    }
    head.appendChild(headActions);
    overview.appendChild(head);

    /* Run strip */
    var stripWrap = el('div', { className: 'run-strip-wrap' });
    var wallCabinets = cabinets.filter(function (cab) { return cab.type === 'wall'; });
    var stripCabinets = totals.wallOnly ? cabinets : totals.footprint;
    if (wallCabinets.length && !totals.wallOnly) {
      var wallRow = el('div', { className: 'run-wall-row', attrs: { role: 'group', 'aria-label': 'Wall cabinets above the run' } }, [
        el('span', { className: 'run-wall-label', text: 'Above the counter' })
      ]);
      wallCabinets.forEach(function (cab) {
        var isSelected = cab.id === state.selectedCabinetId;
        wallRow.appendChild(el('button', {
          className: 'run-wall-chip' + (isSelected ? ' is-selected' : ''),
          type: 'button',
          attrs: { 'aria-pressed': isSelected ? 'true' : 'false', title: (cab.tag || '') + ' \u00b7 ' + (cab.name || '') },
          dataset: { wallCabinet: cab.id },
          on: { click: function () { CS.ui.app.selectCabinet(cab.id); } }
        }, [
          el('span', { className: 'run-seg-tag', text: cab.tag || '\u2014' }),
          el('span', { className: 'run-seg-dims', text: fmtShortV(cab.width) })
        ]));
      });
      wallRow.appendChild(el('span', { className: 'run-wall-note', text: 'Wall cabinets hang above the run and do not use floor width.' }));
      stripWrap.appendChild(wallRow);
    }
    var strip = el('div', { className: 'run-strip' + (stripCabinets.length ? '' : ' is-empty'), attrs: { id: 'run-strip', role: 'group', 'aria-label': 'Kitchen run footprint' } });
    if (!stripCabinets.length) {
      strip.appendChild(el('div', { className: 'run-strip-empty', text: cabinets.length ? 'No floor cabinets yet \u2014 wall cabinets hang above the run.' : 'No cabinets yet \u2014 the run starts with your first cabinet.' }));
    } else {
      stripCabinets.forEach(function (cab) {
        var isSelected = cab.id === state.selectedCabinetId;
        var seg = el('button', {
          className: 'run-seg' + (isSelected ? ' is-selected' : ''),
          type: 'button',
          attrs: { 'aria-pressed': isSelected ? 'true' : 'false', title: (cab.tag || '') + ' \u00b7 ' + (cab.name || '') },
          dataset: { runSegment: cab.id },
          on: { click: function () { CS.ui.app.selectCabinet(cab.id); } }
        }, [
          el('span', { className: 'run-seg-tag', text: cab.tag || '\u2014' }),
          el('span', { className: 'run-seg-dims', text: fmtShortV(cab.width) })
        ]);
        if (space) {
          var pct = Math.max(3, (num(cab.width, 300) / space.wallLength) * 100);
          seg.style.flex = '0 0 auto';
          seg.style.width = 'calc(' + pct.toFixed(2) + '% - 3px)';
          seg.style.minWidth = '84px';
        } else {
          seg.style.flex = '1 1 0';
        }
        strip.appendChild(seg);
      });
      if (space && totals.remaining !== null) {
        if (totals.remaining > 0.5) {
          var remainingMm = String(Math.round(totals.remaining * 100) / 100);
          var remainingSeg = el('div', {
            className: 'run-remaining',
            attrs: {
              id: 'run-remaining',
              'data-remaining-mm': remainingMm,
              title: remainingMm + ' mm left in the run',
              'aria-label': fmtRun(totals.remaining) + ' left (' + remainingMm + ' mm)'
            }
          }, [
            el('span', { className: 'run-remaining-label', text: fmtRun(totals.remaining) + ' left' })
          ]);
          var remPct = Math.max(4, (totals.remaining / space.wallLength) * 100);
          remainingSeg.style.flex = '0 0 auto';
          remainingSeg.style.width = 'calc(' + Math.min(60, remPct).toFixed(2) + '% - 3px)';
          strip.appendChild(remainingSeg);
        } else if (totals.remaining < -0.5) {
          strip.appendChild(el('div', {
            className: 'run-remaining is-over',
            attrs: { id: 'run-remaining', 'data-remaining-mm': String(Math.round(totals.remaining * 100) / 100) }
          }, [
            el('span', { className: 'run-remaining-label', text: fmtShortV(Math.abs(totals.remaining)) + ' over' })
          ]));
        } else {
          strip.appendChild(el('div', { className: 'run-remaining is-full', attrs: { id: 'run-remaining', 'data-remaining-mm': '0' } }, [
            el('span', { className: 'run-remaining-label', text: 'Run full' })
          ]));
        }
      }
    }
    stripWrap.appendChild(strip);
    var legend = el('div', { className: 'run-strip-legend' }, [
      el('span', { text: space ? 'Floor run uses cabinet widths plus 3 mm gaps between them. Wall cabinets are shown above.' : 'Set the wall length to see how much run is left.' })
    ]);
    stripWrap.appendChild(legend);
    overview.appendChild(stripWrap);

    /* Main grid */
    var grid = el('div', { className: 'overview-grid' });
    var main = el('section', { className: 'overview-main', attrs: { 'aria-label': 'Add or edit cabinets' } });

    var cta = el('div', { className: 'overview-cta' }, [
      el('div', { className: 'overview-cta-copy' }, [
        el('h2', { className: 'overview-cta-title', text: cabinets.length ? 'Add the next cabinet' : 'Start your first cabinet' }),
        el('p', {
          className: 'overview-cta-text',
          text: cabinets.length
            ? 'Answer a few questions and the box, fronts and cut list are worked out for you.'
            : 'Set up the space, choose a construction standard and size the first box.'
        })
      ]),
      el('div', { className: 'overview-cta-actions' }, [
        el('button', {
          className: 'btn btn-primary btn-lg', type: 'button', attrs: { id: 'run-add-cabinet' },
          on: { click: function () { startWizard(); } }
        }, [icon('plus'), el('span', { text: 'Design a cabinet' })]),
        el('button', {
          className: 'btn btn-secondary', type: 'button', attrs: { id: 'run-advanced' },
          on: { click: function () { setDesignMode('advanced'); } }
        }, [icon('sliders'), el('span', { text: 'Advanced editor' })])
      ])
    ]);
    main.appendChild(cta);

    if (cabinets.length) {
      var listCard = el('div', { className: 'overview-cabinet-card' });
      listCard.appendChild(el('div', { className: 'overview-card-head' }, [
        el('h2', { className: 'overview-card-title', text: 'Cabinets' }),
        el('span', { className: 'count-chip', text: String(cabinets.length) })
      ]));
      var gridCabs = el('div', { className: 'overview-cabinet-grid' });
      cabinets.forEach(function (cab) {
        gridCabs.appendChild(renderOverviewCabinet(cab));
      });
      listCard.appendChild(gridCabs);
      main.appendChild(listCard);
    }
    grid.appendChild(main);

    var side = el('aside', { className: 'overview-side', attrs: { 'aria-label': 'Selected cabinet and checks' } });
    side.appendChild(renderSelectedCard(selected));
    side.appendChild(renderChecksCard(warnings));
    side.appendChild(renderQuickLinks());
    grid.appendChild(side);
    overview.appendChild(grid);
    host.appendChild(overview);
    lockHeaderUnits(false);
    doc.title = (project.name || 'Cabinet Studio') + ' \u2014 Cabinet Studio';
    syncOverviewCanvasless();
  }

  function readSpaceRoom(project) {
    if (project && project.space && project.space.room) {
      return String(project.space.room).charAt(0).toUpperCase() + String(project.space.room).slice(1) + ' run';
    }
    return 'Kitchen run';
  }

  function fmtSpaceSummary(space) {
    return 'wall ' + fmtFeet(space.wallLength) + ' \u00b7 ceiling ' + fmtFeet(space.ceilingHeight) + ' \u00b7 counter ' + fmtCounter(space.counterHeight);
  }

  function renderOverviewCabinet(cab) {
    var state = getState();
    var selected = cab.id === state.selectedCabinetId;
    var model = null;
    var resolved = getResolved();
    if (resolved && Array.isArray(resolved.cabinets)) {
      for (var i = 0; i < resolved.cabinets.length; i++) {
        var m = resolved.cabinets[i];
        var cfg = m && m.config ? m.config : m;
        if (cfg && cfg.id === cab.id) { model = m; break; }
      }
    }
    var warnings = cabinetWarningCount(cab.id);
    var card = el('div', { className: 'run-cabinet-card' + (selected ? ' is-selected' : ''), dataset: { runCabinet: cab.id } }, [
      el('span', { className: 'run-cabinet-type', text: (cab.type || 'base').charAt(0).toUpperCase(), attrs: { title: TYPE_LABEL[cab.type] || 'Cabinet' } }),
      el('span', { className: 'run-cabinet-main' }, [
        el('span', { className: 'run-cabinet-name' }, [
          el('span', { className: 'run-cabinet-tag', text: cab.tag || '\u2014' }),
          el('span', { text: cab.name || TYPE_LABEL[cab.type] || 'Cabinet' })
        ]),
        el('span', { className: 'run-cabinet-meta', text: fmtShortV(cab.width) + ' W \u00b7 ' + fmtShortV(cab.height) + ' H \u00b7 ' + frontSummaryOf(cab, model) })
      ]),
      warnings.total
        ? el('span', { className: 'run-cabinet-warn' + (warnings.errors ? ' is-error' : ''), title: warnings.total + ' checks', text: String(warnings.total) })
        : null,
      el('span', { className: 'run-cabinet-actions' }, [
        el('button', {
          className: 'btn btn-quiet btn-sm', type: 'button', title: 'Edit in guided setup',
          on: { click: function (evt) { evt.stopPropagation(); CS.ui.app.selectCabinet(cab.id); startWizardEdit(cab.id); } }
        }, [icon('design'), el('span', { text: 'Edit' })]),
        el('button', {
          className: 'btn btn-quiet btn-icon', type: 'button', title: 'Duplicate cabinet', attrs: { 'aria-label': 'Duplicate ' + (cab.tag || 'cabinet') },
          on: { click: function (evt) { evt.stopPropagation(); CS.ui.app.selectCabinet(cab.id); CS.ui.app.duplicateSelectedCabinet(); } }
        }, icon('copy')),
        el('button', {
          className: 'btn btn-quiet btn-icon', type: 'button', title: 'Delete cabinet', attrs: { 'aria-label': 'Delete ' + (cab.tag || 'cabinet') },
          on: { click: function (evt) { evt.stopPropagation(); CS.ui.app.selectCabinet(cab.id); CS.ui.app.deleteSelectedCabinet(); } }
        }, icon('trash'))
      ]),
      el('button', {
        className: 'run-cabinet-select', type: 'button',
        attrs: { 'aria-label': 'Select ' + (cab.tag || 'cabinet') },
        on: { click: function () { CS.ui.app.selectCabinet(cab.id); } }
      })
    ]);
    return card;
  }

  function renderSelectedCard(cab) {
    var card = el('div', { className: 'overview-side-card', attrs: { id: 'run-selected' } });
    card.appendChild(el('div', { className: 'overview-card-head' }, [
      el('h2', { className: 'overview-card-title', text: cab ? 'Selected cabinet' : 'No cabinet selected' }),
      cab ? el('span', { className: 'run-cabinet-tag', text: cab.tag || '' }) : null
    ]));
    if (!cab) {
      card.appendChild(el('p', { className: 'overview-empty-text', text: 'Pick a cabinet from the run strip or the list to see its summary.' }));
      return card;
    }
    var model = null;
    var resolved = getResolved();
    if (resolved && Array.isArray(resolved.cabinets)) {
      for (var i = 0; i < resolved.cabinets.length; i++) {
        var m = resolved.cabinets[i];
        var cfg = m && m.config ? m.config : m;
        if (cfg && cfg.id === cab.id) { model = m; break; }
      }
    }
    card.appendChild(el('div', { className: 'selected-summary' }, [
      el('div', { className: 'selected-name', text: cab.name || TYPE_LABEL[cab.type] || 'Cabinet' }),
      el('div', { className: 'selected-dims', text: fmtShortV(cab.width) + ' \u00d7 ' + fmtShortV(cab.height) + ' \u00d7 ' + fmtShortV(cab.depth) }),
      el('div', { className: 'selected-meta', text: (TYPE_LABEL[cab.type] || 'Cabinet') + ' \u00b7 ' + ((cab.construction && cab.construction.system === 'faceframe') ? 'Face frame' : 'Frameless') + ' \u00b7 ' + frontSummaryOf(cab, model) })
    ]));
    var actions = el('div', { className: 'selected-actions' }, [
      el('button', {
        className: 'btn btn-primary btn-sm', type: 'button',
        on: { click: function () { startWizardEdit(cab.id); } }
      }, [icon('design'), el('span', { text: 'Edit' })]),
      el('button', {
        className: 'btn btn-secondary btn-sm', type: 'button',
        on: { click: function () { CS.ui.app.selectCabinet(cab.id); setDesignMode('advanced'); } }
      }, [icon('sliders'), el('span', { text: 'Advanced editor' })])
    ]);
    card.appendChild(actions);
    return card;
  }

  function renderChecksCard(warnings) {
    var card = el('div', { className: 'overview-side-card' });
    var errors = warnings.filter(function (w) { return w.severity === 'error'; }).length;
    var warns = warnings.filter(function (w) { return w.severity === 'warning'; }).length;
    var infos = warnings.filter(function (w) { return w.severity === 'info'; }).length;
    card.appendChild(el('div', { className: 'overview-card-head' }, [
      el('h2', { className: 'overview-card-title', text: 'Checks' }),
      el('span', { className: 'overview-check-counts' }, [
        errors ? el('span', { className: 'count-chip is-error', text: errors + ' error' + (errors === 1 ? '' : 's') }) : null,
        warns ? el('span', { className: 'count-chip is-warning', text: warns + ' warning' + (warns === 1 ? '' : 's') }) : null,
        infos ? el('span', { className: 'count-chip is-info', text: String(infos) }) : null,
        (!errors && !warns && !infos) ? el('span', { className: 'count-chip is-ok', text: 'All clear' }) : null
      ])
    ]));
    if (!warnings.length) {
      card.appendChild(el('div', { className: 'overview-checks-empty' }, [
        icon('check'),
        el('span', { text: 'No issues found in the current run. You can add checks by opening a cabinet in the advanced editor.' })
      ]));
      return card;
    }
    var list = el('ul', { className: 'overview-check-list' });
    warnings.slice(0, 3).forEach(function (warning) {
      list.appendChild(el('li', { className: 'overview-check is-' + (warning.severity || 'info') }, [
        icon(warning.severity === 'error' ? 'alert' : warning.severity === 'info' ? 'info' : 'alert'),
        el('span', null, [
          el('strong', { text: warning.title || 'Check' }),
          el('span', { className: 'overview-check-message', text: warning.message || '' })
        ])
      ]));
    });
    card.appendChild(list);
    card.appendChild(el('button', {
      className: 'btn btn-quiet btn-sm overview-see-all', type: 'button',
      on: { click: openChecksInAdvanced }
    }, [el('span', { text: 'See all checks' }), icon('arrow-right')]));
    return card;
  }

  function openChecksInAdvanced() {
    var target = getState().selectedCabinetId;
    setDesignMode('advanced');
    if (target && CS.ui.app.selectCabinet) CS.ui.app.selectCabinet(target);
    var designPanel = doc.getElementById('panel-design');
    if (designPanel) {
      var focusTarget = designPanel.querySelector('.warnings-panel') || designPanel;
      if (focusTarget && focusTarget.focus) {
        focusTarget.setAttribute('tabindex', '-1');
        try { focusTarget.focus({ preventScroll: false }); } catch (err) { /* ignore */ }
      }
    }
  }

  function renderQuickLinks() {
    var card = el('div', { className: 'overview-side-card' });
    card.appendChild(el('div', { className: 'overview-card-head' }, [
      el('h2', { className: 'overview-card-title', text: 'Next' })
    ]));
    var resolved = getResolved();
    var stats = resolved && resolved.stats ? resolved.stats : {};
    var links = [
      { tab: 'cutlist', label: 'Cut list', meta: stats.sheetCount ? stats.sheetCount + ' sheets' : '', icon: 'cutlist' },
      { tab: 'assembly', label: 'Assembly', meta: stats.cabinetCount ? stats.cabinetCount + ' cabinets' : '', icon: 'assembly' },
      { tab: 'plans', label: 'Plans & export', meta: 'PDF \u00b7 DXF \u00b7 DWG', icon: 'plans' }
    ];
    var wrap = el('div', { className: 'overview-links' });
    links.forEach(function (link) {
      wrap.appendChild(el('button', {
        className: 'overview-link', type: 'button',
        on: { click: function () { CS.ui.app.switchTab(link.tab); } }
      }, [
        icon(link.icon),
        el('span', { className: 'overview-link-label', text: link.label }),
        el('span', { className: 'overview-link-meta', text: link.meta })
      ]));
    });
    card.appendChild(wrap);
    return card;
  }

  function syncOverviewCanvasless() { /* overview has no canvases; kept for symmetry/readability */ }

  /* ───────────────────────────── Space dialog ───────────────────────────── */

  function openSpaceDialog() {
    var project = getProject();
    if (!project) return;
    var space = projectSpace() || typicalSpace(project.units);
    var steps = {
      wall: el('div'),
      ceiling: el('div'),
      counter: el('div')
    };
    var draft = { wallLength: space.wallLength, ceilingHeight: space.ceilingHeight, counterHeight: space.counterHeight };
    var unit = project.units === 'metric' ? 'metric' : 'imperial';
    function localFeet(mm) {
      if (unit === 'metric') { try { return CS.units.format(mm, 'metric', { precision: 0, unitLabel: true }); } catch (err) { return String(mm); } }
      var inches = num(mm, 0) / 25.4;
      var feet = Math.floor(inches / 12 + 1e-9);
      var rem = inches - feet * 12;
      var remText = rem < 0.03 ? '0"' : CS.units.format(rem * 25.4, 'imperial', { fraction: 16 });
      return feet > 0 ? feet + "' " + remText : remText;
    }
    function v(mm) { try { return unit === 'metric' ? CS.units.format(mm, 'metric', { precision: 0, unitLabel: true }) : CS.units.format(mm, 'imperial', { fraction: 16 }); } catch (err) { return String(mm); } }
    function inputFor(field, label, min, max, formatFn) {
      var id = 'space-' + field;
      var wrap = el('div', { className: 'guided-field' }, [
        el('label', { className: 'guided-field-label', attrs: { for: id }, text: label })
      ]);
      var inputWrap = el('div', { className: 'input-wrap' });
      var input = el('input', { className: 'input', id: id, attrs: { type: 'text', inputmode: 'decimal', 'aria-label': label } });
      var format = formatFn || v;
      input.value = format(draft[field]);
      inputWrap.appendChild(input);
      inputWrap.appendChild(el('span', { className: 'input-unit', text: unit === 'metric' ? 'mm' : 'in' }));
      wrap.appendChild(inputWrap);
      input.addEventListener('change', function () {
        var mm = null;
        try { mm = CS.units.parse(input.value, unit); } catch (err) { mm = null; }
        if (mm === null || mm < min || mm > max) {
          input.value = v(draft[field]);
          CS.ui.app.toast('Enter a measurement between ' + v(min) + ' and ' + v(max) + '.', { type: 'warning' });
          return;
        }
        draft[field] = mm;
        input.value = format(mm);
      });
      input.addEventListener('blur', function () { input.dispatchEvent(new Event('change')); });
      return wrap;
    }
    steps.wall.appendChild(inputFor('wallLength', 'Wall length', 300, 12000, localFeet));
    steps.ceiling.appendChild(inputFor('ceilingHeight', 'Ceiling height', 1828.8, 4000, localFeet));
    steps.counter.appendChild(inputFor('counterHeight', 'Counter height', 711.2, 1219.2));
    var body = el('div', { className: 'space-dialog' }, [
      el('p', { className: 'space-dialog-intro', text: 'These measurements drive the run strip and the size suggestions. You can change them at any time.' }),
      el('div', { className: 'space-dialog-grid' }, [steps.wall, steps.ceiling, steps.counter])
    ]);
    var modal = CS.ui.app.openModal({
      title: 'Kitchen run space',
      sub: 'Measure the wall you are filling. Values are suggestions until you save.',
      size: 'small',
      children: body,
      footer: [
        el('span', { className: 'foot-note', text: 'Remaining run = wall length minus cabinet widths and 3 mm gaps.' }),
        el('button', { className: 'btn btn-secondary', type: 'button', text: 'Cancel', on: { click: function () { CS.ui.app.closeModal(true); } } }),
        el('button', {
          className: 'btn btn-primary', type: 'button', text: 'Save space',
          on: {
            click: function () {
              if (!(draft.wallLength > 0)) {
                CS.ui.app.toast('Wall length must be greater than zero.', { type: 'warning' });
                return;
              }
              CS.ui.app.mutate(function (proj) {
                proj.space = {
                  wallLength: draft.wallLength,
                  ceilingHeight: draft.ceilingHeight,
                  counterHeight: draft.counterHeight
                };
              }, { source: 'guided', structural: false, reason: 'space' });
              CS.ui.app.closeModal(true);
              scheduleOverviewRender();
              CS.ui.app.toast('Run space saved.', { title: 'Space updated', type: 'success', timeout: 3000 });
            }
          }
        })
      ]
    });
    return modal;
  }

  /* ───────────────────────────── Wizard shell ───────────────────────────── */

  function startWizard(opts) {
    wizard.focusPending = false;
    wizard.suspended = null;
    opts = opts || {};
    wizard.active = true;
    wizard.success = null;
    wizard.mode = 'add';
    wizard.isNewProject = !!opts.newProject;
    wizard.editId = null;
    wizard.baseConfig = null;
    if (opts.keepDraft && wizard.draft) {
      // Keep space/standard/units from the previous draft, start a new box.
      var previous = wizard.draft;
      wizard.draft = newDraft({
        units: previous.units, presetId: previous.presetId, type: opts.type || 'base',
        space: previous.space, newProject: wizard.isNewProject
      });
      wizard.draft.projectName = previous.projectName;
      wizard.step = opts.step || 3;
    } else {
      wizard.draft = newDraft({
        type: opts.type,
        units: opts.units,
        presetId: opts.presetId,
        space: opts.space,
        newProject: wizard.isNewProject
      });
      wizard.step = opts.step || 1;
    }
    wizard.maxStep = wizard.step;
    wizard.preview = { view: 'front' };
    setDesignMode('guided');
    renderWizard();
  }

  function startWizardEdit(cabinetId) {
    wizard.focusPending = false;
    wizard.suspended = null;
    var cabinet = getCabinet(cabinetId);
    if (!cabinet) return;
    CS.ui.app.selectCabinet(cabinetId);
    wizard.active = true;
    wizard.success = null;
    wizard.mode = 'edit';
    wizard.editId = cabinetId;
    wizard.isNewProject = false;
    wizard.baseConfig = deepClone(cabinet);
    wizard.draft = draftFromCabinet(cabinet);
    wizard.step = LAST_STEP;
    wizard.maxStep = LAST_STEP;
    wizard.preview = { view: 'front' };
    setDesignMode('guided');
    renderWizard();
  }

  function startNewProject() {
    wizard.focusPending = false;
    wizard.suspended = null;
    wizard.active = true;
    wizard.success = null;
    wizard.mode = 'add';
    wizard.isNewProject = true;
    wizard.editId = null;
    wizard.baseConfig = null;
    wizard.draft = newDraft({ newProject: true, units: getProject() ? getProject().units : 'imperial' });
    wizard.draft.projectName = getProject() ? getProject().name : 'Kitchen project';
    wizard.draft.changed = false;
    wizard.step = 1;
    wizard.maxStep = 1;
    wizard.preview = { view: 'front' };
    setDesignMode('guided');
    renderWizard();
  }

  function showOverview() {
    wizard.suspended = null;
    wizard.active = false;
    wizard.success = null;
    setDesignMode('guided');
    renderOverview();
  }

  function closeWizard() {
    confirmDiscardThen(function () {
      wizard.active = false;
      wizard.success = null;
      renderOverview();
    });
  }

  function lockHeaderUnits(locked) {
    var wrap = doc.querySelector('.units-switch');
    if (!wrap) return;
    if (locked) wrap.setAttribute('data-locked', 'true');
    else wrap.removeAttribute('data-locked');
    Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (btn) {
      btn.disabled = !!locked;
    });
  }

  function renderWizard() {
    if (!host) return;
    if (wizard.success) { renderSuccess(); return; }
    lockHeaderUnits(true);
    if (!wizard.draft) { renderOverview(); return; }
    var project = getProject();
    if (!project) return;

    host.dataset.mode = 'wizard';
    clear(host);
    var wrapper = el('div', {
      className: 'guided-wizard',
      attrs: { id: 'guided-wizard', role: 'region', 'aria-label': 'Guided cabinet setup' }
    });

    /* Progress rail */
    var rail = el('aside', { className: 'wizard-rail', attrs: { 'aria-label': 'Setup steps' } });
    rail.appendChild(el('div', { className: 'wizard-rail-head' }, [
      el('span', { className: 'wizard-rail-kicker', text: wizard.mode === 'edit' ? 'Editing ' + (wizard.draft.tag || 'cabinet') : 'New cabinet' }),
      el('span', { className: 'wizard-rail-sub', text: wizard.isNewProject ? 'Kitchen project' : 'Guided setup' })
    ]));
    var stepsList = el('ol', { className: 'wizard-steps', attrs: { id: 'guided-progress', 'aria-label': 'Setup progress' } });
    STEPS.forEach(function (step, index) {
      var n = index + 1;
      var isCurrent = n === wizard.step;
      var isComplete = n < wizard.step;
      var clickable = n <= wizard.maxStep || isComplete;
      var item = el('li', { className: 'wizard-step' + (isCurrent ? ' is-current' : '') + (isComplete ? ' is-complete' : '') }, [
        el('button', {
          className: 'wizard-step-btn', type: 'button',
          attrs: { 'aria-current': isCurrent ? 'step' : null, disabled: clickable ? null : true, title: clickable ? 'Go to ' + step.rail : 'Complete the earlier steps first' },
          on: {
            click: function () {
              if (!clickable || isCurrent) return;
              if (n < wizard.step) { goStep(n); }
            }
          }
        }, [
          el('span', { className: 'wizard-step-num' }, isComplete ? icon('check') : el('span', { text: String(n) })),
          el('span', { className: 'wizard-step-label', text: step.rail })
        ])
      ]);
      stepsList.appendChild(item);
    });
    rail.appendChild(stepsList);
    var railFoot = el('div', { className: 'wizard-rail-foot' });
    railFoot.appendChild(el('button', {
      className: 'btn btn-quiet btn-sm wizard-advanced-link', type: 'button', attrs: { id: 'guided-advanced' },
      on: { click: function () { confirmDiscardThen(openAdvancedEditorDirect); } }
    }, [icon('sliders'), el('span', { text: 'Advanced editor' })]));
    railFoot.appendChild(el('button', {
      className: 'btn btn-quiet btn-sm', type: 'button', attrs: { id: 'guided-close' },
      on: { click: closeWizard }
    }, [icon('x'), el('span', { text: 'Close' })]));
    rail.appendChild(railFoot);
    wrapper.appendChild(rail);

    /* Question panel */
    var stepDef = STEPS[wizard.step - 1];
    doc.title = 'Step ' + wizard.step + ' of ' + LAST_STEP + ' \u00b7 ' + stepDef.rail + ' \u2014 ' + (project.name || 'Cabinet Studio');
    var main = el('section', { className: 'wizard-main', attrs: { 'aria-labelledby': 'guided-heading' } });
    var progress = el('div', { className: 'wizard-mobile-progress' }, [
      el('div', { className: 'wizard-mobile-progress-text', attrs: { 'aria-live': 'polite' }, text: 'Step ' + wizard.step + ' of ' + LAST_STEP + ' \u00b7 ' + stepDef.rail }),
      el('div', { className: 'wizard-mobile-progress-bar' }, [
        el('span', { style: { width: Math.round((wizard.step / LAST_STEP) * 100) + '%' } })
      ])
    ]);
    main.appendChild(progress);
    var question = el('div', { className: 'wizard-question' });
    question.appendChild(el('div', { className: 'wizard-eyebrow', attrs: { 'aria-live': 'polite' }, text: 'Step ' + wizard.step + ' of ' + LAST_STEP }));
    question.appendChild(el('h1', { className: 'wizard-title', attrs: { id: 'guided-heading', tabindex: '-1' }, text: stepDef.question }));
    question.appendChild(el('p', { className: 'wizard-helper', text: stepDef.helper }));
    var body = el('div', { className: 'wizard-body', attrs: { id: 'wizard-body' } });
    body.dataset.guidedStep = stepDef.id;
    question.appendChild(body);
    main.appendChild(question);
    var footer = el('footer', { className: 'wizard-footer' });
    main.appendChild(footer);
    wrapper.appendChild(main);

    /* Live preview */
    wrapper.appendChild(renderWizardPreview());
    host.appendChild(wrapper);

    renderStepBody(body);
    buildWizardFooter(footer);

    wizard.maxStep = Math.max(wizard.maxStep, wizard.step);
    var shouldFocusHeading = wizard.focusPending === true;
    wizard.focusPending = false;
    var stepChanged = wizard.renderedStep && wizard.renderedStep !== wizard.step;
    wizard.renderedStep = wizard.step;
    if (shouldFocusHeading && stepChanged) {
      var heading = doc.getElementById('guided-heading');
      if (heading) {
        try { heading.focus({ preventScroll: false }); } catch (err) { /* ignore */ }
      }
    }
    attachPreview();
    refreshPreview();
  }

  function renderWizardPreview() {
    var side = el('aside', { className: 'wizard-preview', attrs: { 'aria-label': 'Live draft preview' } });
    var head = el('div', { className: 'wizard-preview-head' }, [
      el('span', { className: 'wizard-preview-title', text: 'Live preview' }),
      el('div', { className: 'wizard-preview-toggle', role: 'group', attrs: { 'aria-label': 'Preview view' } }, [
        viewButton('front', 'Front'),
        viewButton('iso', 'Isometric')
      ])
    ]);
    side.appendChild(head);
    var canvasWrap = el('div', { className: 'wizard-preview-canvas' });
    var canvas = el('canvas', { attrs: { id: 'guided-preview-canvas', 'aria-label': 'Draft cabinet drawing' } });
    canvasWrap.appendChild(canvas);
    canvasWrap.appendChild(el('div', { className: 'preview-empty guided-preview-empty', attrs: { id: 'guided-preview-empty', hidden: true } }));
    side.appendChild(canvasWrap);
    side.appendChild(el('div', { className: 'wizard-spec', attrs: { id: 'guided-preview-summary', 'aria-live': 'polite' } }));
    side.appendChild(el('div', { className: 'wizard-preview-foot' }, [
      icon('info'),
      el('span', { text: 'Draft only \u2014 nothing is added to the project until review.' })
    ]));
    return side;
  }

  function viewButton(view, label) {
    return el('button', {
      className: 'wizard-toggle-btn', type: 'button',
      attrs: { 'aria-pressed': wizard.preview.view === view ? 'true' : 'false' },
      dataset: { previewView: view },
      text: label,
      on: {
        click: function () {
          wizard.preview.view = view;
          var buttons = host.querySelectorAll('.wizard-toggle-btn');
          Array.prototype.forEach.call(buttons, function (btn) {
            btn.setAttribute('aria-pressed', btn.dataset.previewView === view ? 'true' : 'false');
          });
          refreshPreview();
        }
      }
    });
  }

  function buildWizardFooter(footer) {
    var valid = validateCurrentStep();
    var left = el('div', { className: 'wizard-footer-left' });
    left.appendChild(el('button', {
      className: 'btn btn-secondary wizard-back', type: 'button', attrs: { id: 'guided-back' }, disabled: wizard.step === 1,
      on: { click: function () { goStep(wizard.step - 1); } }
    }, [icon('chevron-right', 'rot180'), el('span', { text: 'Back' })]));
    if (wizard.step === 8) {
      left.appendChild(el('button', {
        className: 'btn btn-quiet', type: 'button',
        on: {
          click: function () {
            var preset = presetById(wizard.draft.presetId);
            wizard.draft.shelves = defaultShelves(wizard.draft.type, preset);
            wizard.draft.finishId = preset.finish.id;
            wizard.draft.finishColor = preset.finish.color;
            goStep(LAST_STEP);
          }
        }
      }, el('span', { text: 'Skip this step' })));
    }
    footer.appendChild(left);
    var right = el('div', { className: 'wizard-footer-right' });
    var message = el('div', { className: 'wizard-footer-message', attrs: { id: 'wizard-footer-message', 'aria-live': 'polite' } });
    if (valid.message) message.classList.add('is-' + (valid.tone || 'warning'));
    message.appendChild(icon(valid.ok ? 'info' : 'alert'));
    message.appendChild(el('span', { text: valid.message || '' }));
    message.hidden = !valid.message;
    right.appendChild(message);
    var isReview = wizard.step === LAST_STEP;
    right.appendChild(el('button', {
      className: 'btn btn-primary wizard-continue', type: 'button', attrs: { id: 'guided-next' },
      on: { click: function () { if (isReview) { finishWizard(); } else if (valid.ok) { goStep(wizard.step + 1); } else { CS.ui.app.toast(valid.message || 'Complete this step first.', { type: 'warning' }); } } }
    }, [el('span', { text: isReview ? (wizard.mode === 'edit' ? 'Save changes' : 'Add cabinet to run') : 'Continue' }), icon('arrow-right')]));
    footer.appendChild(right);
  }

  function updateFooter() {
    var footer = host && host.querySelector('.wizard-footer');
    if (!footer) return;
    var message = footer.querySelector('#wizard-footer-message');
    var valid = validateCurrentStep();
    if (message) {
      if (!valid.message) { message.hidden = true; message.textContent = ''; }
      else {
        message.hidden = false;
        message.textContent = '';
        message.appendChild(icon(valid.ok ? 'info' : 'alert'));
        message.appendChild(el('span', { text: valid.message }));
        message.className = 'wizard-footer-message' + (valid.tone ? ' is-' + valid.tone : '');
      }
    }
    var back = footer.querySelector('.wizard-back');
    if (back) back.disabled = wizard.step === 1;
  }

  function renderStepBody(body) {
    clear(body);
    var step = STEPS[wizard.step - 1];
    if (!step) return;
    if (wizard.step === 1) renderSpaceStep(body);
    else if (wizard.step === 2) renderStandardStep(body);
    else if (wizard.step === 3) renderBoxStep(body);
    else if (wizard.step === 4) renderSizeStep(body);
    else if (wizard.step === 5) renderBuildStep(body);
    else if (wizard.step === 6) renderLayoutStep(body);
    else if (wizard.step === 7) renderStyleStep(body);
    else if (wizard.step === 8) renderInsideStep(body);
    else renderReviewStep(body);
  }

  function rerenderStep() {
    var body = host && host.querySelector('#wizard-body');
    if (body) renderStepBody(body);
    var footer = host && host.querySelector('.wizard-footer');
    if (footer) {
      clear(footer);
      buildWizardFooter(footer);
    }
    refreshPreview();
  }

  function goStep(next) {
    if (next < 1 || next > LAST_STEP) return;
    if (next > wizard.step) {
      var valid = validateCurrentStep();
      if (!valid.ok) {
        CS.ui.app.toast(valid.message || 'Complete this step first.', { type: 'warning' });
        return;
      }
    }
    if (next !== wizard.step) wizard.focusPending = true;
    wizard.step = next;
    wizard.maxStep = Math.max(wizard.maxStep, next);
    renderWizard();
  }

  function markChanged() {
    if (!wizard.draft) return;
    wizard.draft.changed = true;
    updateFooter();
  }

  /* ───────────────────────────── Validation ───────────────────────────── */

  function validateCurrentStep() {
    var draft = wizard.draft;
    if (!draft) return { ok: true, message: '' };
    var project = getProject() || {};
    if (wizard.step === 1) {
      if (!(draft.space.wallLength > 0)) return { ok: false, message: 'Enter a wall length to continue.', tone: 'warning' };
      if (draft.space.wallLength > 15000) return { ok: false, message: 'That wall length is unusually large \u2014 check the measurement.', tone: 'warning' };
      if (draft.space.ceilingHeight < 1828.8) return { ok: false, message: 'Ceiling height must be at least 6 ft (1829 mm).', tone: 'warning' };
      var totals = footprintTotals(wizard.editId);
      if (totals.remaining !== null && totals.remaining < 0) {
        return { ok: true, message: 'The measured wall is shorter than the current run; the strip will show the overage.', tone: 'warning' };
      }
      return { ok: true, message: totals.remaining !== null ? fmtRun(totals.remaining) + ' of run is free before the next cabinet.' : '' };
    }
    if (wizard.step === 2) {
      if (!presetById(draft.presetId)) return { ok: false, message: 'Choose a construction standard.' };
      return { ok: true, message: '' };
    }
    if (wizard.step === 3) {
      if (TYPE_ORDER.indexOf(draft.type) < 0) return { ok: false, message: 'Choose a cabinet type.' };
      var preset = presetById(draft.presetId);
      var dims = preset.dims[draft.type] || preset.dims.base;
      return { ok: true, message: 'Typical ' + TYPE_LABEL[draft.type].toLowerCase() + ': ' + fmtV(dims.width) + ' W \u00d7 ' + fmtV(dims.height) + ' H \u00d7 ' + fmtV(dims.depth) + ' D' };
    }
    if (wizard.step === 4) {
      if (!(draft.width >= 100 && draft.width <= 2438.4)) return { ok: false, message: 'Width must be between 4 in and 96 in (100\u20132438 mm).' };
      if (!(draft.height >= 100 && draft.height <= 2743.2)) return { ok: false, message: 'Height must be between 4 in and 108 in (100\u20132743 mm).' };
      if (!(draft.depth >= 100 && draft.depth <= 914.4)) return { ok: false, message: 'Depth must be between 4 in and 36 in (100\u2013914 mm).' };
      var remaining = draftRemaining();
      if (remaining !== null && remaining < 0) {
        return { ok: true, message: 'This is ' + fmtShortV(Math.abs(remaining)) + ' wider than the space left. You can still add it.' , tone: 'warning' };
      }
      if (remaining !== null) return { ok: true, message: 'Fits with ' + fmtRun(remaining) + ' left in the run.' };
      return { ok: true, message: 'Space not set \u2014 you can still continue.' };
    }
    if (wizard.step === 5) {
      if (!buildMethodById(draft.joinery)) return { ok: false, message: 'Choose a carcass joint.' };
      if (!buildPanelById(draft.carcassMaterial)) return { ok: false, message: 'Choose a carcass panel.' };
      var buildWarning = buildWarningForDraft(draft);
      if (buildWarning) {
        var panelWarning = buildPanelById(draft.carcassMaterial) && buildPanelById(draft.carcassMaterial).warning;
        return {
          ok: true,
          message: panelWarning ? '12 mm light-duty carcass selected \u2014 see the note above.' : buildWarning,
          tone: 'warning'
        };
      }
      return { ok: true, message: buildMethodLabel(draft.joinery) + ' \u00b7 ' + buildPanelLabel(draft.carcassMaterial) + ' (' + buildThicknessLabel(draft.carcassThickness) + ').' };
    }
    if (wizard.step === 6) {
      if (['doors', 'drawer-stack', 'door-drawer', 'open'].indexOf(draft.layout) < 0) {
        return { ok: false, message: 'Choose a layout for the front.' };
      }
      return { ok: true, message: layoutLabel(draft.layout) + ' selected.' };
    }
    if (wizard.step === 7) {
      if (draft.layout === 'doors' || draft.layout === 'door-drawer') {
        if (!draft.doorStyle) return { ok: false, message: 'Choose a door style.' };
        if (!(draft.doorCount >= 1 && draft.doorCount <= 3)) return { ok: false, message: 'Door count must be 1 to 3.' };
      }
      if (draft.layout === 'drawer-stack' || draft.layout === 'door-drawer') {
        if (!(draft.drawerCount >= 1 && draft.drawerCount <= 6)) return { ok: false, message: 'Drawer count must be 1 to 6.' };
      }
      return { ok: true, message: '' };
    }
    if (wizard.step === 8) {
      return { ok: true, message: 'Changes to shelves and finish apply when you add the cabinet.' };
    }
    if (wizard.step === LAST_STEP) {
      var model = resolveDraft();
      if (!model) return { ok: false, message: 'The draft could not be resolved; check the console and try again.' };
      return { ok: true, message: '' };
    }
    return { ok: true, message: '' };
  }

  /* ───────────────────────────── Step 1: Space ───────────────────────────── */

  function renderSpaceStep(body) {
    var draft = wizard.draft;
    if (wizard.isNewProject) {
      body.appendChild(guidedField({
        kind: 'text',
        id: 'wizard-space-project-name',
        label: 'Project name', value: draft.projectName,
        set: function (v) { draft.projectName = String(v); markChanged(); },
        hint: 'Appears on the plan set.'
      }));
    }
    var unitRow = el('div', { className: 'guided-option-row' }, [
      el('div', { className: 'guided-field-label', text: 'Units' }),
      el('div', { className: 'segmented', role: 'group', attrs: { 'aria-label': 'Units' } }, [
        unitButton('imperial', 'Imperial'),
        unitButton('metric', 'Metric')
      ])
    ]);
    body.appendChild(unitRow);

    var three = el('div', { className: 'space-field-grid' });
    three.appendChild(guidedField({
      id: 'wizard-space-wall',
      label: 'Wall length', value: draft.space.wallLength, min: 300, max: 15000,
      formatValue: fmtFeet,
      hint: 'The run you are filling.',
      set: function (mm) { draft.space.wallLength = mm; draft.spaceTouched = true; markChanged(); refreshSpaceHints(); },
      onChange: function () { refreshSpaceHints(); }
    }));
    three.appendChild(guidedField({
      id: 'wizard-space-ceiling',
      label: 'Ceiling height', value: draft.space.ceilingHeight, min: 1828.8, max: 4000,
      formatValue: fmtFeet,
      hint: 'Tall cabinets stop just below this.',
      set: function (mm) { draft.space.ceilingHeight = mm; draft.spaceTouched = true; markChanged(); },
      onChange: function () {}
    }));
    three.appendChild(guidedField({
      id: 'wizard-space-counter',
      label: 'Counter height', value: draft.space.counterHeight, min: 711.2, max: 1219.2,
      hint: 'Base cabinets sit under the counter.',
      set: function (mm) { draft.space.counterHeight = mm; draft.spaceTouched = true; markChanged(); },
      onChange: function () {}
    }));
    body.appendChild(three);

    var presets = el('div', { className: 'space-presets' });
    presets.appendChild(el('span', { className: 'space-presets-label', text: 'Wall presets' }));
    var wallPresets = draft.units === 'metric' ? METRE_PRESETS : FEET_PRESETS;
    wallPresets.forEach(function (mm) {
      presets.appendChild(el('button', {
        className: 'chip-btn', type: 'button',
        text: fmtFeet(mm),
        on: {
          click: function () {
            draft.space.wallLength = mm;
            markChanged();
            rerenderStep();
          }
        }
      }));
    });
    body.appendChild(presets);

    body.appendChild(el('div', { className: 'guided-inline-actions' }, [
      el('button', {
        className: 'btn btn-secondary btn-sm', type: 'button',
        on: {
          click: function () {
            draft.space = typicalSpace(draft.units);
            draft.spaceTouched = true;
            markChanged();
            rerenderStep();
          }
        }
      }, [icon('ruler'), el('span', { text: 'Use a typical kitchen' })]),
      draft.spaceNote ? el('span', { className: 'guided-inline-note', text: 'This project had no saved space yet \u2014 typical kitchen values are suggested.' }) : null
    ]));

    var hintNode = el('div', { className: 'space-run-hint', attrs: { id: 'space-run-hint' } });
    body.appendChild(hintNode);
    refreshSpaceHints();

    var totals = footprintTotals();
    body.appendChild(el('div', { className: 'space-context' }, [
      el('div', { className: 'space-context-head' }, [icon('ruler'), el('span', { text: 'What happens next' })]),
      el('p', {
        className: 'space-context-text',
        text: 'Next you pick a cabinet tradition and the box type. The wall, ceiling and counter measurements drive every size suggestion after that.'
      }),
      el('div', { className: 'space-context-row' }, [
        el('span', { className: 'meta-chip', text: (getProject().cabinets || []).length + ' cabinets in the run' }),
        el('span', { className: 'meta-chip', text: fmtFeet(draft.space.wallLength) + ' wall' }),
        el('span', { className: 'meta-chip is-olive', text: '3 mm planning gaps' })
      ])
    ]));
  }

  function refreshSpaceHints() {
    var node = doc.getElementById('space-run-hint');
    if (!node) return;
    var draft = wizard.draft;
    var totals = runTotals(wizard.editId);
    var wallLength = totals.space ? totals.space.wallLength : (draft.space && draft.space.wallLength);
    var gapCount = totals.count > 1 ? totals.count - 1 : 0;
    var remaining = wallLength ? wallLength - totals.cabinetWidth - gapCount * 3 : null;
    clear(node);
    if (remaining === null) {
      node.appendChild(el('span', { text: 'Set a wall length to see how much run is left.' }));
    } else if (remaining < 0) {
      node.appendChild(icon('alert'));
      node.appendChild(el('span', { text: 'The existing cabinets are ' + fmtShortV(Math.abs(remaining)) + ' wider than this wall. The strip will show the overage.' }));
    } else {
      node.appendChild(icon('info'));
      node.appendChild(el('span', { text: fmtRun(remaining) + ' of run is free before the next cabinet.' }));
    }
    updateFooter();
  }

  function unitButton(unit, label) {
    return el('button', {
      className: 'segmented-btn', type: 'button',
      attrs: { 'aria-pressed': wizard.draft.units === unit ? 'true' : 'false' },
      dataset: { unit: unit },
      text: label,
      on: {
        click: function () {
          if (wizard.draft.units === unit) return;
          var mm = { wall: wizard.draft.space.wallLength, ceiling: wizard.draft.space.ceilingHeight, counter: wizard.draft.space.counterHeight };
          wizard.draft.units = unit;
          // Keep the same physical measurements; reformat in the new unit.
          wizard.draft.space.wallLength = mm.wall;
          wizard.draft.space.ceilingHeight = mm.ceiling;
          wizard.draft.space.counterHeight = mm.counter;
          markChanged();
          rerenderStep();
        }
      }
    });
  }

  /* ───────────────────────────── Step 2: Standard ───────────────────────────── */

  function renderStandardStep(body) {
    var draft = wizard.draft;
    var presets = presetList();
    var recommended = recommendedPresetId();
    body.appendChild(singleChoice({
      label: 'Construction standard',
      columns: 2,
      get: function () { return draft.presetId; },
      set: function (value) { draft.presetId = value; applyPresetToDraft(value); },
      onChange: function () { markChanged(); refreshPreview(); rerenderStep(); },
      items: presets.map(function (preset) {
        var isRecommended = preset.id === recommended;
        return {
          value: preset.id,
          data: { standard: preset.id },
          title: preset.outcome || preset.label,
          desc: preset.summary,
          badge: isRecommended ? 'Recommended' : null,
          markup: standardSketch(preset.construction.system === 'faceframe'),
          meta: preset.label + ' \u00b7 ' + preset.bullets.slice(0, 2).join(' \u00b7 ')
        };
      })
    }));

    if (recommended) {
      body.appendChild(el('p', {
        className: 'wizard-recommendation',
        text: 'Recommended: ' + (recommended === 'northAmerican' ? 'North American face frame' : 'European frameless') +
          ' \u2014 matches your ' + (draft.units === 'metric' ? 'metric units and the common European kitchen' : 'imperial units and the common Canadian kitchen') + '.'
      }));
    }

    var compare = el('details', { className: 'wizard-accordion' }, [
      el('summary', { className: 'wizard-accordion-summary', text: 'Compare the two standards' })
    ]);
    var table = el('table', { className: 'wizard-compare' });
    var rows = [
      ['Construction', 'Face frame with stiles and rails', 'Frameless 32 mm system'],
      ['Carcass', '18 mm (3/4 in) plywood', '18 mm melamine-faced PB'],
      ['Carcass joinery', 'Dado + screw', 'Confirmat'],
      ['Toe kick', '101.6 mm high \u00d7 76.2 setback', '150 mm high \u00d7 60 setback'],
      ['Base height', '876.3 mm (34\u00bd in)', '870 mm (720 carcass + 150 plinth)'],
      ['Counter height', '914.4 mm (36 in)', '900 mm (870 + 30 mm top)'],
      ['Base depth', '609.6 mm (24 in)', '560 mm carcass'],
      ['Wall cabinet', '762 \u00d7 304.8 mm, 457 above counter', '720 \u00d7 350 mm, 550 above counter'],
      ['Tall / pantry', '2133.6 mm; 609.6 / 304.8 deep', '2100 mm; 560 / 350 deep'],
      ['Fronts', 'Full-overlay shaker maple', 'Full-overlay slab lacquered MDF'],
      ['Drawer box', 'Dovetail, undermount', 'Box joint, undermount'],
      ['Finish', 'Paint', 'Lacquer'],
      ['Widths', '228.6\u20131219.2 mm (9\u201348 in)', '300\u20131200 mm']
    ];
    var thead = el('tr', null, [el('th', { text: '' }), el('th', { text: 'North American' }), el('th', { text: 'European' })]);
    table.appendChild(el('thead', null, thead));
    var tbody = el('tbody');
    rows.forEach(function (row) {
      tbody.appendChild(el('tr', null, [el('td', { text: row[0] }), el('td', { text: row[1] }), el('td', { text: row[2] })]));
    });
    table.appendChild(tbody);
    compare.appendChild(table);
    body.appendChild(compare);
    body.appendChild(el('p', {
      className: 'wizard-source-note',
      text: 'Sources: the researched technique report shipped with this app (docs/RESEARCH-techniques.md). Details stay editable in the Advanced editor.'
    }));
  }

  function applyPresetToDraft(presetId) {
    var draft = wizard.draft;
    var preset = presetById(presetId);
    if (!preset) return;
    var type = draft.type;
    var dims = preset.dims[type] || preset.dims.base;
    draft.width = dims.width;
    draft.height = dims.height;
    draft.depth = dims.depth;
    draft.doorStyle = preset.fronts.doors.style || draft.doorStyle;
    draft.drawerStyle = preset.fronts.drawers.style || draft.drawerStyle;
    draft.material = preset.fronts.doors.material || draft.material;
    draft.slide = preset.fronts.drawers.slide || draft.slide;
    draft.finishId = preset.finish.id || draft.finishId;
    draft.finishColor = preset.finish.color || draft.finishColor;
    draft.sheen = preset.finish.sheen || draft.sheen;
    draft.shelves = defaultShelves(type, preset);
    draft.doorCount = defaultDoorCount(dims.width);
    var buildDefaults = buildDefaultsForPreset(preset);
    draft.joinery = buildDefaults.joinery;
    draft.carcassMaterial = buildDefaults.carcassMaterial;
    draft.carcassThickness = buildDefaults.carcassThickness;
    draft.backStyle = buildDefaults.backStyle;
    draft.toeKickStyle = buildDefaults.toeKickStyle;
    draft.faceFrameJoinery = buildDefaults.faceFrameJoinery;
  }

  /* ───────────────────────────── Step 3: Build ───────────────────────────── */

  function backStyleOption(id) {
    for (var i = 0; i < BACK_STYLE_OPTIONS.length; i++) if (BACK_STYLE_OPTIONS[i].value === id) return BACK_STYLE_OPTIONS[i];
    return BACK_STYLE_OPTIONS[0];
  }

  function toeKickOption(id) {
    for (var i = 0; i < TOE_KICK_OPTIONS.length; i++) if (TOE_KICK_OPTIONS[i].value === id) return TOE_KICK_OPTIONS[i];
    return TOE_KICK_OPTIONS[0];
  }

  function faceFrameJointOption(id) {
    for (var i = 0; i < FACE_FRAME_JOINT_OPTIONS.length; i++) if (FACE_FRAME_JOINT_OPTIONS[i].value === id) return FACE_FRAME_JOINT_OPTIONS[i];
    return FACE_FRAME_JOINT_OPTIONS[0];
  }

  function panelSelectGroups() {
    function group(label, groupId) {
      return {
        label: label,
        options: BUILD_PANELS.filter(function (p) { return p.group === groupId; }).map(function (p) {
          return { value: p.id, label: p.label + ' \u2014 ' + buildThicknessLabel(p.thickness) };
        })
      };
    }
    return [group('18 mm \u2014 standard carcass', 18), group('12 mm \u2014 light-duty (wall units, dividers)', 12)];
  }

  function renderBuildStep(body) {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    var isFaceFrame = preset.construction.system === 'faceframe';
    var panel = buildPanelById(draft.carcassMaterial) || buildPanelById('ply-birch-18');
    var warning = buildWarningForDraft(draft);

    body.appendChild(singleChoice({
      label: 'Carcass joinery',
      columns: 3,
      get: function () { return draft.joinery; },
      set: function (value) { if (buildMethodById(value)) draft.joinery = value; },
      onChange: function () { markChanged(); refreshPreview(); updateFooter(); },
      items: BUILD_METHODS.map(function (method) {
        return {
          value: method.id,
          data: { 'build-method': method.id },
          title: method.title,
          desc: method.desc,
          meta: method.meta,
          badge: method.id === preset.construction.joinery ? 'Recommended' : null
        };
      })
    }));

    body.appendChild(el('p', {
      className: 'wizard-source-note',
      text: 'The joint sets the machining and assembly steps. The box details below feed the parts, cut list, sheet layout and plan set.'
    }));

    body.appendChild(el('div', { className: 'wizard-divider' }));
    body.appendChild(sectionTitle('Box details', 'Sheet goods, back, base and frame.'));

    var grid = el('div', { className: 'build-details-grid' });
    var panelIsRecommended = draft.carcassMaterial === preset.construction.carcassMaterial;
    grid.appendChild(guidedField({
      id: 'wizard-build-panel',
      kind: 'select',
      label: 'Carcass panel',
      value: draft.carcassMaterial,
      groups: panelSelectGroups(),
      attrs: {
        'data-build-field': 'panel',
        'data-carcass-thickness': String(draft.carcassThickness)
      },
      hint: panel.desc + ' \u00b7 ' + buildThicknessLabel(draft.carcassThickness) + ' carcass' +
        (panelIsRecommended ? ' \u00b7 recommended for this standard' : '') + '.',
      onChange: function (value) {
        var next = buildPanelById(value);
        if (!next) return;
        draft.carcassMaterial = next.id;
        draft.carcassThickness = next.thickness;
        markChanged();
        refreshPreview();
        rerenderStep();
      }
    }));
    grid.appendChild(guidedField({
      id: 'wizard-build-back',
      kind: 'select',
      label: 'Back',
      value: draft.backStyle,
      options: BACK_STYLE_OPTIONS.map(function (o) { return { value: o.value, label: o.label }; }),
      attrs: { 'data-build-field': 'back' },
      hint: backStyleOption(draft.backStyle).desc,
      onChange: function (value) {
        draft.backStyle = value;
        markChanged();
        refreshPreview();
        rerenderStep();
      }
    }));
    if (draft.type !== 'wall') {
      grid.appendChild(guidedField({
        id: 'wizard-build-toekick',
        kind: 'select',
        label: 'Toe kick',
        value: draft.toeKickStyle,
        options: TOE_KICK_OPTIONS.map(function (o) { return { value: o.value, label: o.label }; }),
        attrs: { 'data-build-field': 'toeKick' },
        hint: toeKickOption(draft.toeKickStyle).desc,
        onChange: function (value) {
          draft.toeKickStyle = value;
          markChanged();
          refreshPreview();
          rerenderStep();
        }
      }));
    }
    if (isFaceFrame) {
      grid.appendChild(guidedField({
        id: 'wizard-build-faceframe',
        kind: 'select',
        label: 'Face-frame joint',
        value: draft.faceFrameJoinery,
        options: FACE_FRAME_JOINT_OPTIONS.map(function (o) { return { value: o.value, label: o.label }; }),
        attrs: { 'data-build-field': 'faceFrameJoinery' },
        hint: faceFrameJointOption(draft.faceFrameJoinery).desc,
        onChange: function (value) {
          draft.faceFrameJoinery = value;
          markChanged();
          refreshPreview();
          rerenderStep();
        }
      }));
    }
    body.appendChild(grid);

    var chips = el('div', { className: 'build-summary-row' }, [
      el('span', { className: 'meta-chip', text: buildMethodLabel(draft.joinery) }),
      el('span', { className: 'meta-chip', text: panel.label + ' \u00b7 ' + buildThicknessLabel(draft.carcassThickness) }),
      el('span', { className: 'meta-chip', text: backStyleLabel(draft.backStyle) }),
      draft.type !== 'wall' ? el('span', { className: 'meta-chip', text: toeKickLabel(draft.toeKickStyle) }) : null,
      isFaceFrame ? el('span', { className: 'meta-chip', text: faceFrameJointLabel(draft.faceFrameJoinery) }) : null
    ]);
    body.appendChild(chips);

    var methodWarning = draft.joinery === 'biscuit'
      ? 'Biscuits locate parts; screws and glue must carry the joint. Do not use biscuits as the only carcass joint.'
      : draft.joinery === 'butt-screw'
        ? 'Butt-and-screw is the weakest corner joint; plug or cover any exposed end.'
        : '';
    var warnings = [warning, methodWarning].filter(Boolean);
    if (warnings.length) {
      body.appendChild(el('div', { className: 'wizard-build-warning', attrs: { role: 'status' } }, [
        icon('alert'),
        el('span', { text: warnings.join(' ') })
      ]));
    }
    body.appendChild(el('p', {
      className: 'wizard-source-note',
      text: 'Carcass thickness is real geometry: interior width is W \u2212 2t, shelves span less on 12 mm, and the parts, cut list, sheet layouts and plan set all follow this choice.'
    }));
  }

  /* ───────────────────────────── Step 4: Box ───────────────────────────── */

  function renderBoxStep(body) {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    body.appendChild(singleChoice({
      label: 'Cabinet type',
      columns: 4,
      get: function () { return draft.type; },
      set: function (value) {
        draft.type = value;
        var dims = preset.dims[value] || preset.dims.base;
        draft.width = dims.width;
        draft.height = dims.height;
        draft.depth = dims.depth;
        draft.shelves = defaultShelves(value, preset);
        draft.doorCount = defaultDoorCount(dims.width);
        if (value === 'wall' && draft.layout === 'open') draft.layout = 'doors';
      },
      onChange: function () {
        markChanged();
        refreshPreview();
        rerenderStep();
      },
      items: TYPE_ORDER.map(function (type) {
        var dims = preset.dims[type] || preset.dims.base;
        return {
          value: type,
          data: { choice: type },
          title: TYPE_LABEL[type],
          desc: TYPE_BLURB[type],
          meta: fmtShortV(dims.width) + ' W \u00d7 ' + fmtShortV(dims.height) + ' H \u00d7 ' + fmtShortV(dims.depth) + ' D',
          markup: cabinetSketch(type, 'doors')
        };
      })
    }));
    body.appendChild(el('p', {
      className: 'wizard-source-note',
      text: 'The sizes shown are the ' + preset.label.toLowerCase() + ' defaults for this box. You can change them in the next step.'
    }));
  }

  /* ───────────────────────────── Step 4: Size ───────────────────────────── */

  function renderSizeStep(body) {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    var dims = preset.dims[draft.type] || preset.dims.base;
    var totals = runTotals(wizard.editId);
    var remainingBefore = totals.space ? totals.space.wallLength - totals.cabinetWidth - totals.gaps : null;

    /* Width */
    var widthCard = el('div', { className: 'size-block' });
    widthCard.appendChild(sectionTitle('Width', 'Standard widths are the ones cabinetmakers stock.'));
    var widthValues = preset.standardWidths.slice();
    var widthRow = chipRow({
      label: 'Standard widths',
      values: widthValues,
      format: function (mm) { return fmtShortV(mm); },
      get: function () { return draft.width; },
      set: function (mm) { draft.width = mm; draft.doorCount = defaultDoorCount(mm); },
      onChange: function () { markChanged(); refreshPreview(); refreshSizeHints(); updateFooter(); }
    });
    widthCard.appendChild(widthRow);
    var fitChipRow = el('div', { className: 'chip-row size-fit-row' });
    if (remainingBefore !== null && remainingBefore >= 150) {
      fitChipRow.appendChild(el('button', {
        className: 'chip-btn chip-btn-fit', type: 'button', attrs: { id: 'wizard-fit-remaining' },
        on: {
          click: function () {
            draft.width = Math.max(152.4, Math.min(1219.2, Math.round(remainingBefore - 3)));
            markChanged();
            rerenderStep();
          }
        }
      }, [icon('fit'), el('span', { text: 'Fit remaining run (' + fmtRun(remainingBefore) + ')' })]));
      if (remainingBefore > 1219.2 + 3) {
        fitChipRow.appendChild(el('span', { className: 'size-fit-note', text: 'The free run is wider than a single cabinet; add more than one.' }));
      }
    }
    widthCard.appendChild(fitChipRow);
    widthCard.appendChild(guidedField({
      id: 'wizard-size-width',
      label: 'Width', value: draft.width, min: 152.4, max: 2438.4,
      hint: 'Inside the box, before doors.',
      set: function (mm) { draft.width = mm; draft.doorCount = defaultDoorCount(mm); },
      onChange: function () { markChanged(); refreshPreview(); refreshSizeHints(); }
    }));
    body.appendChild(widthCard);

    /* Height + depth */
    var hd = el('div', { className: 'size-two-col' });
    var heightBlock = el('div', { className: 'size-block' });
    heightBlock.appendChild(sectionTitle('Height', heightHint(draft.type)));
    var heights = preset.heights[draft.type] || [dims.height];
    heightBlock.appendChild(chipRow({
      label: 'Standard heights', values: heights,
      format: function (mm) { return fmtShortV(mm); },
      get: function () { return draft.height; },
      set: function (mm) { draft.height = mm; },
      onChange: function () { markChanged(); refreshPreview(); refreshSizeHints(); }
    }));
    heightBlock.appendChild(guidedField({
      id: 'wizard-size-height',
      label: 'Height', value: draft.height, min: 152.4, max: 2743.2,
      set: function (mm) { draft.height = mm; },
      onChange: function () { markChanged(); refreshPreview(); refreshSizeHints(); }
    }));

    var depthBlock = el('div', { className: 'size-block' });
    depthBlock.appendChild(sectionTitle('Depth', 'The depth shown is the box, not the door.'));
    var depths = preset.depths[draft.type] || [dims.depth];
    depthBlock.appendChild(chipRow({
      label: 'Standard depths', values: depths,
      format: function (mm) { return fmtShortV(mm); },
      get: function () { return draft.depth; },
      set: function (mm) { draft.depth = mm; },
      onChange: function () { markChanged(); refreshPreview(); refreshSizeHints(); }
    }));
    depthBlock.appendChild(guidedField({
      id: 'wizard-size-depth',
      label: 'Depth', value: draft.depth, min: 152.4, max: 914.4,
      set: function (mm) { draft.depth = mm; },
      onChange: function () { markChanged(); refreshPreview(); refreshSizeHints(); }
    }));
    hd.appendChild(heightBlock);
    hd.appendChild(depthBlock);
    body.appendChild(hd);

    var hints = el('div', { className: 'size-hints', attrs: { id: 'size-hints' } });
    body.appendChild(hints);
    refreshSizeHints();
  }

  function heightHint(type) {
    var draft = wizard.draft;
    var space = draft.space;
    var preset = presetById(draft.presetId);
    var typeDims = (preset.dims && preset.dims[type]) || {};
    if (type === 'base') return 'Counter at ' + fmtShortV(space.counterHeight) + '; the cabinet top sits just below it.';
    if (type === 'wall') {
      var above = isFinite(typeDims.aboveCounter) ? typeDims.aboveCounter : 457.2;
      return 'Underside about ' + fmtShortV(above) + ' above the counter (50\u201360 cm is the usual range).';
    }
    return 'Floor to near the ceiling (' + fmtShortV(space.ceilingHeight) + ').';
  }

  function refreshSizeHints() {
    var node = doc.getElementById('size-hints');
    if (!node) return;
    var draft = wizard.draft;
    var remaining = draftRemaining();
    clear(node);
    if (remaining === null) {
      node.appendChild(el('span', { className: 'guided-inline-note', attrs: { id: 'wizard-size-remaining-hint' } }, [icon('info'), el('span', { text: 'Space not set \u2014 width suggestions are the standard sizes.' })]));
      return;
    }
    if (remaining < -0.5) {
      node.appendChild(el('div', { className: 'size-warning', attrs: { id: 'wizard-size-remaining-hint' } }, [
        icon('alert'),
        el('span', { text: 'This is ' + fmtShortV(Math.abs(remaining)) + ' wider than the space left. You can still add it, or choose a narrower width.' })
      ]));
    } else {
      node.appendChild(el('div', { className: 'size-ok', attrs: { id: 'wizard-size-remaining-hint' } }, [
        icon('check'),
        el('span', { text: 'Fits with ' + fmtRun(remaining) + ' left in the run.' })
      ]));
    }
  }

  /* ───────────────────────────── Step 5: Fronts ───────────────────────────── */

  /* ───────────────────────────── Step 5: Layout ───────────────────────────── */

  function renderLayoutStep(body) {
    var draft = wizard.draft;
    body.appendChild(sectionTitle('Layout', 'One glance at the front is enough for most cabinets.'));
    body.appendChild(singleChoice({
      label: 'Front layout',
      columns: 4,
      get: function () { return draft.layout; },
      set: function (value) {
        draft.layout = value;
        if (value === 'door-drawer') draft.drawerCount = 1;
        if (value === 'drawer-stack' && draft.drawerCount < 2) draft.drawerCount = 3;
      },
      onChange: function () {
        markChanged();
        refreshPreview();
        var mini = doc.getElementById('layout-mini-chip');
        if (mini) mini.textContent = layoutLabel(draft.layout);
      },
      items: LAYOUTS.map(function (layout) {
        return {
          value: layout.id, data: { choice: layout.id }, title: layout.title, desc: layout.desc,
          markup: layoutSketch(layout.id)
        };
      })
    }));
    body.appendChild(el('p', {
      className: 'wizard-source-note',
      text: 'The next step styles the fronts for this layout \u2014 door style and count, or drawer style and count.'
    }));
    body.appendChild(el('div', { className: 'wizard-mini-preview-note' }, [
      el('span', { className: 'meta-chip', text: TYPE_LABEL[draft.type] }),
      el('span', { className: 'meta-chip', text: fmtShortV(draft.width) + ' W \u00d7 ' + fmtShortV(draft.height) + ' H \u00d7 ' + fmtShortV(draft.depth) + ' D' }),
      el('span', { className: 'meta-chip is-olive', attrs: { id: 'layout-mini-chip' }, text: layoutLabel(draft.layout) })
    ]));
  }

  function layoutLabel(id) {
    for (var i = 0; i < LAYOUTS.length; i++) if (LAYOUTS[i].id === id) return LAYOUTS[i].title;
    return id || 'Layout';
  }

  /* ───────────────────────────── Step 6: Front style ───────────────────────────── */

  function renderStyleStep(body) {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    var hasDoors = draft.layout === 'doors' || draft.layout === 'door-drawer';
    var hasDrawers = draft.layout === 'drawer-stack' || draft.layout === 'door-drawer';

    if (!hasDoors && !hasDrawers) {
      body.appendChild(el('div', { className: 'wizard-empty-choice' }, [
        icon('shelf'),
        el('h2', { text: 'Open cabinet \u2014 no fronts to style' }),
        el('p', { text: 'This layout has no doors or drawers. Continue to choose shelves and the finish.' })
      ]));
      return;
    }

    if (hasDoors) {
      body.appendChild(sectionTitle('Door style', 'The look of the doors.'));
      body.appendChild(singleChoice({
        label: 'Door style',
        columns: 5,
        get: function () { return draft.doorStyle; },
        set: function (value) { draft.doorStyle = value; },
        onChange: function () { markChanged(); refreshPreview(); },
        items: DOOR_STYLES.map(function (style) {
          return { value: style.id, data: { 'door-style': style.id }, title: style.title, desc: style.desc, markup: doorSketch(style.id) };
        })
      }));
      var doorOptions = el('div', { className: 'front-options-row' });
      doorOptions.appendChild(guidedField({
        label: 'Doors on this cabinet',
        kind: 'select',
        value: draft.doorCount,
        options: [
          { value: 1, label: '1 door' },
          { value: 2, label: '2 doors' },
          { value: 3, label: '3 doors' }
        ],
        onChange: function (value) { draft.doorCount = num(value, 2); markChanged(); refreshPreview(); }
      }));
      doorOptions.appendChild(guidedField({
        label: 'Overlay',
        kind: 'select',
        value: draft.overlay,
        options: OVERLAYS.map(function (o) { return { value: o.value, label: o.label }; }),
        hint: preset.construction.system === 'faceframe' ? 'Inset shows the face frame around each door.' : 'Frameless cabinets are full overlay.',
        onChange: function (value) { draft.overlay = value; markChanged(); refreshPreview(); }
      }));
      body.appendChild(doorOptions);
    }

    if (hasDrawers) {
      if (hasDoors) body.appendChild(el('div', { className: 'wizard-divider' }));
      body.appendChild(sectionTitle('Drawers', 'Front style and how many.'));
      body.appendChild(singleChoice({
        label: 'Drawer front style',
        columns: 2,
        get: function () { return draft.drawerStyle; },
        set: function (value) { draft.drawerStyle = value; },
        onChange: function () { markChanged(); refreshPreview(); },
        items: DRAWER_STYLES.map(function (style) {
          return { value: style.id, title: style.title, desc: style.desc, markup: doorSketch(style.id) };
        })
      }));
      body.appendChild(guidedField({
        label: 'Drawer count',
        kind: 'select',
        value: draft.drawerCount,
        options: [
          { value: 1, label: '1 drawer' },
          { value: 2, label: '2 drawers' },
          { value: 3, label: '3 drawers \u2014 shallow top, deep bottom' },
          { value: 4, label: '4 drawers' },
          { value: 5, label: '5 drawers' },
          { value: 6, label: '6 drawers' }
        ],
        hint: 'The engine divides the opening and sizes each front.',
        onChange: function (value) { draft.drawerCount = num(value, 3); markChanged(); refreshPreview(); }
      }));
    }

    body.appendChild(el('div', { className: 'wizard-divider' }));
    body.appendChild(guidedField({
      label: 'Front material',
      kind: 'select',
      value: draft.material,
      options: MATERIAL_CHOICES.map(function (m) { return { value: m.id, label: m.label }; }),
      hint: 'This is the door and drawer front material.',
      onChange: function (value) { draft.material = value; markChanged(); refreshPreview(); }
    }));
    body.appendChild(el('p', {
      className: 'wizard-source-note',
      text: 'Hinges, pulls and machining use the standard preset. Fine-tune them for this cabinet in the Advanced editor.'
    }));
    body.appendChild(el('button', {
      className: 'btn btn-quiet btn-sm wizard-inline-advanced', type: 'button',
      on: { click: openAdvancedEditor }
    }, [icon('sliders'), el('span', { text: 'Fine-tune hardware and machining in the Advanced editor' })]));
  }

  /* ───────────────────────────── Step 6: Inside & finish ───────────────────────────── */

  function renderInsideStep(body) {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    var hasDrawers = draft.layout === 'drawer-stack' || draft.layout === 'door-drawer';

    body.appendChild(sectionTitle('Inside', 'Shelves and drawer slides.'));
    body.appendChild(guidedField({
      label: 'Adjustable shelves',
      kind: 'select',
      value: draft.shelves,
      options: SHELF_COUNTS.map(function (count) { return { value: count, label: count === 0 ? 'No shelves' : String(count) + (count === 1 ? ' shelf' : ' shelves') }; }),
      hint: 'Adjustable shelves use 32 mm pin spacing.',
      onChange: function (value) { draft.shelves = num(value, 0); markChanged(); refreshPreview(); }
    }));
    if (hasDrawers) {
      body.appendChild(singleChoice({
        label: 'Drawer slides',
        columns: 3,
        compact: true,
        get: function () { return draft.slide; },
        set: function (value) { draft.slide = value; },
        onChange: function () { markChanged(); refreshPreview(); },
        items: SLIDES.map(function (slide) {
          return { value: slide.value, title: slide.label, desc: slide.desc };
        })
      }));
    }

    body.appendChild(el('div', { className: 'wizard-divider' }));
    body.appendChild(sectionTitle('Finish', 'How the fronts are finished.'));
    body.appendChild(singleChoice({
      label: 'Finish',
      columns: 4,
      compact: true,
      get: function () { return draft.finishId; },
      set: function (value) { draft.finishId = value; },
      onChange: function () { markChanged(); refreshPreview(); rerenderStep(); },
      items: FINISHES.map(function (finish) {
        return { value: finish.id, title: finish.title, desc: finish.desc };
      })
    }));

    if (draft.finishId === 'paint' || draft.finishId === 'lacquer' || draft.finishId === 'stain-lacquer') {
      var swatches = el('div', { className: 'finish-swatches', attrs: { role: 'group', 'aria-label': 'Colour swatches' } });
      SWATCHES.forEach(function (color) {
        swatches.appendChild(el('button', {
          className: 'finish-swatch' + (draft.finishColor === color ? ' is-active' : ''),
          type: 'button',
          attrs: { style: 'background:' + color + ';', 'aria-label': 'Colour ' + color, 'aria-pressed': draft.finishColor === color ? 'true' : 'false' },
          on: {
            click: function () {
              draft.finishColor = color;
              markChanged();
              rerenderStep();
            }
          }
        }));
      });
      body.appendChild(el('div', { className: 'guided-option-row' }, [
        el('div', { className: 'guided-field-label', text: 'Colour' }),
        swatches
      ]));
      body.appendChild(el('div', { className: 'guided-option-row' }, [
        el('div', { className: 'guided-field-label', text: 'Sheen' }),
        chipRow({
          label: 'Sheen', values: SHEENS.map(function (s) { return s.id; }),
          format: function (id) { for (var i = 0; i < SHEENS.length; i++) if (SHEENS[i].id === id) return SHEENS[i].label; return id; },
          get: function () { return draft.sheen; },
          set: function (id) { draft.sheen = id; },
          onChange: function () { markChanged(); refreshPreview(); }
        })
      ]));
    }
    body.appendChild(el('p', {
      className: 'wizard-source-note',
      text: 'Cabinet interiors keep the standard shelf material and edgeband from the preset; change them in the Advanced editor.'
    }));
  }

  /* ───────────────────────────── Step 7: Review ───────────────────────────── */

  function suggestedTag(type) {
    var project = getProject();
    var core = CS.core && CS.core.project;
    if (project && core && typeof core.nextTag === 'function') {
      try { return core.nextTag(project, type); } catch (err) { /* fall through */ }
    }
    return (TYPE_LABEL[type] || 'Cabinet').charAt(0) + '1';
  }

  function renderReviewStep(body) {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    if (wizard.mode === 'add') {
      if (!draft.tag) draft.tag = suggestedTag(draft.type);
      if (!draft.name) draft.name = TYPE_LABEL[draft.type] + ' \u2014 ' + draft.tag;
    }
    var model = resolveDraft();
    var cfg = model && model.config ? model.config : (model || {});
    var totals = runTotals(wizard.editId);
    var remainingAfter = draftRemaining();

    var review = el('div', { className: 'review-grid' });
    var summary = el('div', { className: 'review-summary' });
    summary.appendChild(el('div', { className: 'review-summary-head' }, [
      el('div', { className: 'review-tag-badge', text: draft.tag || (wizard.mode === 'edit' ? 'EDIT' : 'NEW') }),
      el('div', null, [
        el('div', { className: 'review-title', text: draft.name || (TYPE_LABEL[draft.type] + ' cabinet') }),
        el('div', { className: 'review-sub', text: TYPE_LABEL[draft.type] + ' \u00b7 ' + preset.label })
      ])
    ]));
    var rows = [
      { label: 'Standard', value: preset.label, step: 2 },
      { label: 'Build', value: buildSummaryFromDraft(), step: 5, key: 'build' },
      { label: 'Dimensions', value: fmtShortV(draft.width) + ' W \u00d7 ' + fmtShortV(draft.height) + ' H \u00d7 ' + fmtShortV(draft.depth) + ' D', step: 4 },
      { label: 'Layout', value: layoutLabel(draft.layout), step: 6 },
      { label: 'Front style', value: frontSummaryFromDraft(), step: 7 },
      { label: 'Inside', value: draft.shelves + (draft.shelves === 1 ? ' adjustable shelf' : ' adjustable shelves') + (hasDrawers() ? ' \u00b7 ' + slideLabel(draft.slide) : ''), step: 8 },
      { label: 'Finish', value: finishLabel(draft.finishId) + ' \u00b7 ' + draft.sheen, step: 8 }
    ];
    rows.forEach(function (row) {
      var rowNode = el('div', { className: 'review-row', dataset: row.key ? { reviewRow: row.key } : null }, [
        el('span', { className: 'review-row-label', text: row.label }),
        el('span', { className: 'review-row-value', text: row.value }),
        el('button', {
          className: 'review-change', type: 'button', text: 'Change',
          attrs: { 'aria-label': 'Change ' + row.label.toLowerCase() },
          on: { click: function () { wizard.focusPending = true; wizard.step = row.step; renderWizard(); } }
        })
      ]);
      summary.appendChild(rowNode);
    });
    var buildWarning = buildWarningForDraft(draft);
    var buttWarning = draft.joinery === 'butt-screw'
      ? 'Butt-and-screw is the weakest corner joint; plug or cover exposed ends, or choose another method for finished ends.'
      : '';
    if (buildWarning || buttWarning) {
      summary.appendChild(el('div', { className: 'review-build-warning' }, [
        icon('alert'),
        el('span', { text: [buildWarning, buttWarning].filter(Boolean).join(' ') })
      ]));
    }
    review.appendChild(summary);

    var fields = el('div', { className: 'review-fields' });
    fields.appendChild(guidedField({
      kind: 'text',
      id: 'wizard-review-tag',
      label: 'Tag', value: draft.tag || '',
      set: function (v) { draft.tag = String(v).replace(/\s+/g, '').toUpperCase().slice(0, 8); },
      hint: 'Suggested tag; it keeps part numbers unique. Editable.',
      onInput: function () { markChanged(); }
    }));
    fields.appendChild(guidedField({
      kind: 'text',
      id: 'wizard-review-name',
      label: 'Name', value: draft.name || '',
      set: function (v) { draft.name = String(v); },
      onInput: function () { markChanged(); }
    }));
    review.appendChild(fields);

    var remainingBox = el('div', { className: 'review-remaining', attrs: { id: 'wizard-review-remaining' } });
    if (remainingAfter === null) {
      remainingBox.appendChild(icon('info'));
      remainingBox.appendChild(el('span', { text: 'Space not set \u2014 you can still add the cabinet; set the wall later to see the remaining run.' }));
    } else if (remainingAfter < -0.5) {
      remainingBox.classList.add('is-warning');
      remainingBox.appendChild(icon('alert'));
      remainingBox.appendChild(el('span', { text: 'This cabinet is ' + fmtShortV(Math.abs(remainingAfter)) + ' wider than the run. You can still add it; the strip is a planning guide.' }));
    } else {
      remainingBox.appendChild(icon('check'));
      remainingBox.appendChild(el('span', { text: 'This adds ' + fmtShortV(draft.width) + ' to the ' + fmtFeet(totals.space.wallLength) + ' run \u2014 ' + fmtRun(remainingAfter) + ' stays free.' }));
    }
    review.appendChild(remainingBox);

    var checks = el('div', { className: 'review-checks', attrs: { id: 'guided-checks' } });
    var warnings = model && Array.isArray(model.warnings) ? model.warnings : [];
    var blocking = warnings.filter(function (w) { return w.severity === 'error' || w.severity === 'warning'; });
    var notes = warnings.filter(function (w) { return w.severity === 'info'; });
    var checksTitle = blocking.length ? 'Checks' : (notes.length ? 'Notes' : 'Checks');
    checks.appendChild(el('div', { className: 'review-checks-head' }, [
      el('span', { className: 'review-checks-title', text: checksTitle }),
      blocking.length
        ? el('span', { className: 'count-chip is-warning', text: blocking.length + (blocking.length === 1 ? ' check' : ' checks') })
        : (notes.length
          ? el('span', { className: 'count-chip is-info', text: notes.length + (notes.length === 1 ? ' note' : ' notes') })
          : el('span', { className: 'count-chip is-ok', text: 'All clear' }))
    ]));
    if (!warnings.length) {
      checks.appendChild(el('p', { className: 'review-checks-empty', text: 'No dimension, reveal or hardware checks are flagged for this draft.' }));
    } else {
      var orderedWarnings = blocking.concat(notes);
      orderedWarnings.slice(0, 3).forEach(function (warning) {
        checks.appendChild(el('div', { className: 'review-check is-' + (warning.severity || 'info') }, [
          icon(warning.severity === 'error' ? 'alert' : warning.severity === 'warning' ? 'alert' : 'info'),
          el('span', null, [
            el('strong', { text: warning.title || 'Check' }),
            el('span', { className: 'review-check-message', text: warning.message || '' }),
            warning.fix ? el('span', { className: 'review-check-fix', text: warning.fix }) : null
          ])
        ]));
      });
      if (warnings.length > 3) {
        var moreKind = blocking.length ? ' checks' : ' notes';
        checks.appendChild(el('p', { className: 'review-checks-empty', text: '+ ' + (warnings.length - 3) + ' more' + moreKind + ' will appear after the cabinet is added.' }));
      }
    }
    review.appendChild(checks);
    body.appendChild(review);
    refreshReviewPreviewIfNeeded();

    function hasDrawers() { return draft.layout === 'drawer-stack' || draft.layout === 'door-drawer'; }
  }

  function validMaterialIds() {
    var ids = [];
    MATERIAL_CHOICES.forEach(function (m) { ids.push(m.id); });
    var catalogue = CS.data && CS.data.techniques;
    if (catalogue && Array.isArray(catalogue.materials)) {
      catalogue.materials.forEach(function (m) { if (m && m.id) ids.push(m.id); });
    }
    return ids;
  }

  /** Never let a bad/undefined material id reach the engine. */
  function safeMaterialId(id, fallbackId) {
    var ids = validMaterialIds();
    if (id && ids.indexOf(String(id)) >= 0) return String(id);
    if (fallbackId && ids.indexOf(String(fallbackId)) >= 0) return String(fallbackId);
    return 'hardwood-maple';
  }

  function materialLabel(id) {
    for (var i = 0; i < MATERIAL_CHOICES.length; i++) if (MATERIAL_CHOICES[i].id === id) return MATERIAL_CHOICES[i].label;
    var catalogue = CS.data && CS.data.techniques;
    if (catalogue && Array.isArray(catalogue.materials)) {
      for (var j = 0; j < catalogue.materials.length; j++) {
        if (catalogue.materials[j] && catalogue.materials[j].id === id) return catalogue.materials[j].name || id;
      }
    }
    return id ? String(id) : 'Material';
  }

  function slideLabel(id) {
    for (var i = 0; i < SLIDES.length; i++) if (SLIDES[i].value === id) return SLIDES[i].label.toLowerCase();
    return id;
  }

  function finishLabel(id) {
    for (var i = 0; i < FINISHES.length; i++) if (FINISHES[i].id === id) return FINISHES[i].title;
    return id;
  }

  function buildSummaryFromDraft() {
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    var parts = [];
    parts.push(preset.construction.system === 'faceframe' ? 'Face frame' : 'Frameless');
    parts.push(buildMethodLabel(draft.joinery));
    parts.push(buildPanelLabel(draft.carcassMaterial) + ' (' + buildThicknessLabel(draft.carcassThickness) + ')');
    parts.push(backStyleLabel(draft.backStyle));
    if (draft.type !== 'wall') parts.push(toeKickLabel(draft.toeKickStyle));
    if (preset.construction.system === 'faceframe') parts.push('frame: ' + faceFrameJointLabel(draft.faceFrameJoinery));
    return parts.join(' \u00b7 ');
  }

  function frontSummaryFromDraft() {
    var draft = wizard.draft;
    if (draft.layout === 'open') return 'Open \u00b7 no fronts';
    if (draft.layout === 'drawer-stack') return titleCase(draft.drawerStyle) + ' \u00b7 ' + draft.drawerCount + ' drawers';
    if (draft.layout === 'door-drawer') return 'Top drawer \u00b7 ' + draft.doorCount + ' ' + titleCase(draft.doorStyle) + ' doors below';
    return titleCase(draft.doorStyle) + ' \u00b7 ' + draft.doorCount + (draft.doorCount === 1 ? ' door' : ' doors') + ' \u00b7 ' + (draft.overlay === 'inset' ? 'inset' : 'full overlay');
  }

  function titleCase(text) {
    return String(text || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function refreshReviewPreviewIfNeeded() {
    // Review uses the same live preview; nothing extra needed here.
  }

  /* ───────────────────────────── Preview ───────────────────────────── */

  function attachPreview() {
    var canvas = doc.getElementById('guided-preview-canvas');
    if (!canvas) return;
    var wrap = canvas.parentElement;
    if (previewRo) { try { previewRo.disconnect(); } catch (err) { /* ignore */ } previewRo = null; }
    if (root.ResizeObserver && wrap) {
      var timer = null;
      previewRo = new root.ResizeObserver(function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { refreshPreview(); }, 80);
      });
      previewRo.observe(wrap);
    }
  }

  function refreshPreview() {
    if (!wizard.active || !wizard.draft) return;
    var canvas = doc.getElementById('guided-preview-canvas');
    if (!canvas) return;
    var project = getProject();
    var model = resolveDraft();
    if (!project || !model) {
      showPreviewMessage('The draft could not be resolved. Check the console for the engine message.');
      return;
    }
    hidePreviewMessage();
    var scene = null;
    try {
      var opts = { units: draftUnit(), partNumbers: false, labels: false };
      if (wizard.preview.view === 'iso') scene = CS.draw.views.cabinetIso(model, opts);
      else scene = CS.draw.views.cabinetFront(model, opts);
    } catch (err) {
      if (root.console && root.console.error) root.console.error('[Cabinet Studio] Guided preview scene failed', err);
      showPreviewMessage('The drawing could not be built; the rest of the wizard keeps working.');
      return;
    }
    var ok = false;
    try {
      if (CS.draw.canvas && typeof CS.draw.canvas.draw === 'function') {
        CS.draw.canvas.draw(canvas, scene, { padding: 20, background: 'rgba(0,0,0,0)', emptyText: '' });
        ok = true;
      }
    } catch (err2) {
      if (root.console && root.console.error) root.console.error('[Cabinet Studio] Guided preview canvas failed', err2);
    }
    if (!ok && CS.ui.preview && typeof CS.ui.preview.drawScene === 'function') {
      ok = CS.ui.preview.drawScene(canvas, scene, { padding: 20 });
    }
    if (!ok) showPreviewMessage('The drawing modules have not loaded yet.');
    updatePreviewSpec(model);
  }

  function showPreviewMessage(message) {
    var empty = doc.getElementById('guided-preview-empty');
    if (empty) {
      empty.hidden = false;
      clear(empty);
      empty.appendChild(CS.ui.app.moduleNote({
        title: 'Preview unavailable',
        message: message,
        files: []
      }));
    }
  }

  function hidePreviewMessage() {
    var empty = doc.getElementById('guided-preview-empty');
    if (empty) { empty.hidden = true; clear(empty); }
  }

  function updatePreviewSpec(model) {
    var node = doc.getElementById('guided-preview-summary');
    if (!node || !wizard.draft) return;
    var draft = wizard.draft;
    var preset = presetById(draft.presetId);
    clear(node);
    var parts = model && Array.isArray(model.parts) ? model.parts.length : null;
    var warnings = model && Array.isArray(model.warnings) ? model.warnings.length : 0;
    node.appendChild(el('div', { className: 'wizard-spec-kind', text: TYPE_LABEL[draft.type].toUpperCase() + ' \u00b7 ' + (draft.tag || 'DRAFT') }));
    node.appendChild(el('div', {
      className: 'wizard-spec-dims',
      text: fmtShortV(draft.width) + ' W \u00d7 ' + fmtShortV(draft.height) + ' H \u00d7 ' + fmtShortV(draft.depth) + ' D'
    }));
    node.appendChild(el('div', { className: 'wizard-spec-line', text: (preset.construction.system === 'faceframe' ? 'Face frame' : 'Frameless') + ' \u00b7 ' + frontSummaryFromDraft() }));
    node.appendChild(el('div', { className: 'wizard-spec-line muted', text: finishLabel(draft.finishId) + ' \u00b7 ' + materialLabel(draft.material) }));
    if (parts !== null) {
      node.appendChild(el('div', { className: 'wizard-spec-foot' }, [
        el('span', { className: 'meta-chip', text: parts + ' parts' }),
        warnings ? el('span', { className: 'meta-chip is-amber', text: warnings + ' checks' }) : el('span', { className: 'meta-chip is-olive', text: 'No checks' })
      ]));
    }
  }

  /* ───────────────────────────── Finish / success ───────────────────────────── */

  function finishWizard() {
    var draft = wizard.draft;
    var project = getProject();
    if (!draft || !project) return;
    var valid = validateCurrentStep();
    if (!valid.ok) { CS.ui.app.toast(valid.message || 'This step is incomplete.', { type: 'warning' }); return; }
    var preset = presetById(draft.presetId);
    var config = buildConfig();
    if (!config) { CS.ui.app.toast('The cabinet could not be built from these choices.', { type: 'error' }); return; }

    var existingTag = '';
    var addedId = null;
    var core = CS.core && CS.core.project;
    var tagInput = (draft.tag || '').trim().toUpperCase();
    // Tag validation for add mode.
    if (wizard.mode === 'add' && tagInput) {
      var clash = (project.cabinets || []).some(function (cab) { return String(cab.tag || '').toUpperCase() === tagInput; });
      if (clash) {
        CS.ui.app.toast('Tag ' + tagInput + ' is already used. Choose another tag or clear the field to auto-assign.', { title: 'Tag already in use', type: 'warning', timeout: 6000 });
        return;
      }
    }
    var nameInput = (draft.name || '').trim();

    CS.ui.app.mutate(function (proj) {
      proj.space = {
        wallLength: draft.space.wallLength,
        ceilingHeight: draft.space.ceilingHeight,
        counterHeight: draft.space.counterHeight
      };
      proj.units = draft.units;
      if (!proj.settings) proj.settings = {};
      proj.settings.standard = draft.presetId;
      if (wizard.isNewProject && draft.projectName) proj.name = draft.projectName;
      if (wizard.mode === 'edit' && wizard.editId) {
        for (var i = 0; i < proj.cabinets.length; i++) {
          if (proj.cabinets[i].id === wizard.editId) {
            config.id = proj.cabinets[i].id;
            config.tag = tagInput || proj.cabinets[i].tag;
            config.name = nameInput || proj.cabinets[i].name || (TYPE_LABEL[config.type] + ' cabinet');
            proj.cabinets[i] = config;
            addedId = config.id;
            existingTag = config.tag;
            break;
          }
        }
      } else {
        var id = null;
        if (core && typeof core.nextCabinetId === 'function') id = core.nextCabinetId(proj);
        else {
          var n = (proj.cabinets || []).length + 1;
          while (proj.cabinets.some(function (cab) { return cab.id === 'cab-' + n; })) n++;
          id = 'cab-' + n;
        }
        var tag = tagInput;
        if (!tag) {
          tag = core && typeof core.nextTag === 'function' ? core.nextTag(proj, config.type) : ('B' + ((proj.cabinets || []).length + 1));
        }
        config.id = id;
        config.tag = tag;
        config.name = nameInput || (TYPE_LABEL[config.type] + ' \u2014 ' + config.width + ' mm cabinet');
        proj.cabinets.push(config);
        addedId = id;
        existingTag = tag;
      }
    }, { source: 'guided', structural: true, reason: wizard.mode === 'edit' ? 'guided-edit' : 'guided-add' });

    if (!addedId) {
      CS.ui.app.toast('The cabinet could not be added to the project.', { type: 'error' });
      return;
    }
    var remainingAfter = footprintTotals().remaining;
    wizard.success = {
      id: addedId,
      tag: existingTag,
      name: nameInput || '',
      remaining: remainingAfter,
      mode: wizard.mode,
      preset: preset.label
    };
    CS.ui.app.selectCabinet(addedId);
    renderSuccess();
    CS.ui.app.toast((wizard.mode === 'edit' ? 'Changes saved to ' : '') + existingTag + ' ' + (wizard.mode === 'edit' ? '' : 'added to the run'), {
      title: wizard.mode === 'edit' ? 'Cabinet updated' : 'Cabinet added',
      type: 'success',
      timeout: 4000
    });
  }

  function renderSuccess() {
    if (!host) return;
    host.dataset.mode = 'wizard';
    var info = wizard.success || {};
    clear(host);
    var wrap = el('div', { className: 'wizard-success', attrs: { id: 'wizard-success' } }, [
      el('div', { className: 'wizard-success-icon' }, icon('check')),
      el('h1', { className: 'wizard-success-title', text: info.mode === 'edit' ? info.tag + ' updated' : info.tag + ' added to the run' }),
      el('p', {
        className: 'wizard-success-text',
        text: info.remaining !== null && info.remaining !== undefined
          ? (info.remaining >= 0
            ? fmtRun(info.remaining) + ' of run stays free. Add the next cabinet or go back to the run overview.'
            : 'The run is now ' + fmtShortV(Math.abs(info.remaining)) + ' over the wall length. Adjust the space or cabinet widths if that is not intended.')
          : 'Set the wall length later to see the remaining run.'
      }),
      el('div', { className: 'wizard-success-actions' }, [
        el('button', {
          className: 'btn btn-primary', type: 'button', attrs: { id: 'wizard-add-another' },
          on: {
            click: function () {
              var previous = wizard.draft;
              var space = previous ? deepClone(previous.space) : null;
              var presetId = previous ? previous.presetId : null;
              var units = previous ? previous.units : null;
              wizard.draft = null;
              wizard.success = null;
              wizard.active = false;
              startWizard({ step: 3, type: 'base', space: space, presetId: presetId, units: units });
            }
          }
        }, [icon('plus'), el('span', { text: 'Add another cabinet' })]),
        el('button', {
          className: 'btn btn-secondary', type: 'button', attrs: { id: 'wizard-view-run' },
          on: { click: function () { wizard.success = null; wizard.active = false; renderOverview(); } }
        }, [el('span', { text: 'View run' })]),
        el('button', {
          className: 'btn btn-quiet', type: 'button',
          on: { click: function () { wizard.success = null; wizard.active = false; CS.ui.app.switchTab('plans'); } }
        }, [icon('plans'), el('span', { text: 'Open plans' })])
      ]),
      el('div', { className: 'wizard-success-note' }, [
        icon('info'),
        el('span', { text: 'The cut list, assembly steps and plan set have refreshed with the new cabinet.' })
      ])
    ]);
    host.appendChild(wrap);
    lockHeaderUnits(false);
    var project = getProject();
    doc.title = (project && project.name ? project.name : 'Cabinet Studio') + ' \u2014 Cabinet Studio';
  }

  /* ───────────────────────────── Events / init ───────────────────────────── */

  function init() {
    if (initialized) return;
    initialized = true;
    host = doc.getElementById('guided-root');
    if (!host) return;
    var a = CS.ui.app;
    a.on('project', function () {
      wizard.active = false;
      wizard.success = null;
      wizard.draft = null;
      if (a.state.designMode !== 'advanced') {
        a.state.designMode = 'guided';
      }
      if (a.state.activeTab === 'design') renderOverview();
    });
    a.on('select', function () {
      if (a.state.designMode !== 'guided' || wizard.active) return;
      scheduleOverviewRender();
    });
    a.on('resolved', function () {
      if (a.state.designMode !== 'guided' || wizard.active) return;
      scheduleOverviewRender();
    });
    a.on('change', function (payload) {
      if (a.state.designMode !== 'guided' || wizard.active) return;
      if (payload && payload.source === 'guided') return;
      scheduleOverviewRender();
    });
    a.on('tab', function (payload) {
      if (payload.tab === 'design' && a.state.designMode === 'guided' && !wizard.active) {
        scheduleOverviewRender();
      }
    });
    a.on('units', function () {
      if (a.state.designMode === 'guided' && !wizard.active) scheduleOverviewRender();
    });
    doc.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && wizard.active && !CS.ui.app.isModalOpen()) {
        evt.preventDefault();
        closeWizard();
      }
    });
    // The Advanced-mode return button is wired by the app shell so it can
    // delegate to resumeFromAdvanced() (or showOverview) in one place.
    // Render the initial view once the app has booted and rendered the shell.
    if (CS.ui.app.state.booted) renderOverview();
  }

  function render() {
    if (!host) return;
    if (getState().designMode === 'advanced') return;
    if (wizard.active) { if (!doc.getElementById('guided-preview-canvas')) renderWizard(); }
    else renderOverview();
  }

  /* ───────────────────────────── Public API ───────────────────────────── */

  CS.ui.guided = {
    init: init,
    render: render,
    startWizard: startWizard,
    startWizardEdit: startWizardEdit,
    startNewProject: startNewProject,
    showOverview: showOverview,
    openAdvancedEditor: openAdvancedEditor,
    resumeFromAdvanced: resumeFromAdvanced,
    isWizardOpen: function () { return !!(wizard.active && !wizard.success); },
    currentStep: function () { return wizard.active ? wizard.step : null; },
    draft: function () { return wizard.active ? wizard.draft : null; },
    wizardSuccess: function () { return wizard.success; },
    presets: presetList,
    resolveDraft: resolveDraft,
    buildConfig: buildConfig,
    openSpaceDialog: openSpaceDialog,
    _state: wizard
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
