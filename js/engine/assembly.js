/**
 * Cabinet Studio engine — assembly sequence (contract §4 AssemblyStep).
 *
 * Produces a realistic, numbered shop build sequence for a resolved cabinet: sort parts, edge
 * band, machine, assemble the carcass square, fit the back, shelves, toe kick, face frame, doors,
 * drawers, hardware and final QC. Every step carries the part ids it uses, the tools, glue and
 * fasteners, QC checks, notes and an illustration hint with exploded-view offsets so the drawing
 * backends can show the step.
 *
 * Pure and deterministic. Steps are ordered by the canonical shop sequence for the cabinet type,
 * carcass system and front type.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var defaults = CS.engine && CS.engine.defaults;
  var P = CS.engine && CS.engine.parts;
  if (!defaults || !P) throw new Error('CabinetStudio engine load order: defaults.js, parts.js must load before assembly.js');

  var U = defaults.util;
  var round = U.round;

  var TOOLS = {
    tape: 'Tape measure',
    pencil: 'Pencil / marking knife',
    square: 'Combination square',
    driver: 'Drill/driver',
    drill: 'Drill press or cordless drill',
    clamp: 'Clamps (4+)',
    mallet: 'Dead-blow mallet',
    brad: 'Brad nailer / stapler',
    iron: 'Edgebanding iron',
    trimmer: 'Edgeband trimmer + file',
    boring: '35 mm hinge boring bit + 5 mm bit',
    router: 'Router / table saw (dados)',
    level: 'Spirit level',
    sander: 'Random-orbit sander',
    knife: 'Utility knife',
    screwdriver: 'Screwdriver set'
  };

  var EXPLODE = {
    'side-left': [-180, 0, 0],
    'side-right': [180, 0, 0],
    bottom: [0, 0, -120],
    top: [0, 0, 140],
    'top-stretcher-front': [0, 0, 140],
    'top-stretcher-rear': [0, 0, 140],
    back: [0, -160, 0],
    'toe-kick-front': [0, 100, 0],
    'toe-kick-side-left': [-100, 0, 0],
    'toe-kick-side-right': [100, 0, 0],
    'toe-kick-back': [0, -80, 0],
    'ff-stile-left': [-120, 90, 0],
    'ff-stile-right': [120, 90, 0]
  };

  function explodeFor(part) {
    if (EXPLODE[part.key]) return EXPLODE[part.key].slice();
    if (part.key.indexOf('fixed-shelf') === 0) return [0, 0, 100];
    if (part.key.indexOf('adjustable-shelf') === 0) return [0, 0, 160];
    if (part.key.indexOf('ff-rail') === 0) return [0, 90, 0];
    if (part.group === 'Doors') return [0, 120, 0];
    if (part.group === 'Drawers') return [0, 90, 0];
    return [0, 0, 0];
  }

  function buildExplode(parts, mode) {
    var offsets = {};
    if (mode !== 'exploded') return offsets;
    for (var i = 0; i < parts.length; i++) {
      var off = explodeFor(parts[i]);
      if (off[0] !== 0 || off[1] !== 0 || off[2] !== 0) offsets[parts[i].id] = off;
    }
    return offsets;
  }

  function idsOf(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) out.push(parts[i].id);
    return out;
  }

  function partsMatching(model, test) {
    var out = [];
    for (var i = 0; i < model.parts.length; i++) if (test(model.parts[i])) out.push(model.parts[i]);
    return out;
  }

  function partsKeyPrefix(model, prefix) {
    return partsMatching(model, function (p) { return p.key.indexOf(prefix) === 0; });
  }

  function hardwareIds(model, templateIds) {
    var out = [];
    for (var i = 0; i < model.hardware.length; i++) {
      if (templateIds.indexOf(model.hardware[i].templateId) !== -1) out.push(model.hardware[i].id);
    }
    return out;
  }

  function hasEdgeband(part) {
    return part.edgeband && Array.isArray(part.edgeband.edges) && part.edgeband.edges.length > 0;
  }

  /**
   * Build the assembly steps for one resolved cabinet.
   *
   * @param {Object} model CabinetModel (already resolved)
   * @returns {Array} AssemblyStep[]
   */
  function buildAssembly(model) {
    var cfg = model.config;
    var dims = model.dims;
    var steps = [];
    var order = 1;

    function step(title, description, opts) {
      opts = opts || {};
      var parts = opts.parts || [];
      var stepObj = {
        id: cfg.tag + '-ASM-' + (order < 10 ? '0' : '') + order,
        order: order,
        title: title,
        cabinetId: cfg.id,
        cabinetTag: cfg.tag,
        description: description,
        partIds: idsOf(parts),
        hardwareIds: opts.hardwareIds || [],
        tools: opts.tools || [],
        glue: opts.glue === undefined ? null : opts.glue,
        fasteners: opts.fasteners || [],
        notes: opts.notes || [],
        qc: opts.qc || [],
        illustration: {
          mode: opts.mode || 'assembled',
          highlightPartIds: idsOf(parts),
          explodeOffsets: buildExplode(parts, opts.mode || 'assembled'),
          caption: opts.caption || (title + ' — ' + cfg.tag)
        }
      };
      order += 1;
      steps.push(stepObj);
      return stepObj;
    }

    var allParts = model.parts;
    var carcassParts = partsMatching(model, function (p) {
      return p.group === 'Carcass';
    });
    var backParts = partsMatching(model, function (p) { return p.group === 'Back'; });
    var shelfParts = partsMatching(model, function (p) { return p.group === 'Shelves'; });
    var toeParts = partsMatching(model, function (p) { return p.group === 'Toe kick'; });
    var ffParts = partsMatching(model, function (p) { return p.group === 'Face frame'; });
    var doorParts = partsMatching(model, function (p) { return p.group === 'Doors'; });
    var drawerParts = partsMatching(model, function (p) { return p.group === 'Drawers'; });
    var bandedParts = partsMatching(model, function (p) { return hasEdgeband(p); });
    var fixedShelves = partsMatching(model, function (p) { return p.key.indexOf('fixed-shelf') === 0; });
    var movableShelves = partsMatching(model, function (p) { return p.key.indexOf('adjustable-shelf') === 0; });
    var doorLeaves = model.frontLayout.doors;
    var drawerFronts = model.frontLayout.drawerFronts;
    var c = cfg.construction;
    var isFaceFrame = c.system === 'faceframe';

    // ---- 1. sort and check parts -------------------------------------------------------------
    step('Lay out and check the parts',
      'Lay out every part for ' + cfg.tag + ' and check it against the cut list: quantity, material, thickness, grain direction and edgeband.',
      {
        parts: allParts,
        tools: [TOOLS.tape, TOOLS.pencil],
        qc: [
          'Part count matches the cut list (' + model.stats.partCount + ' parts)',
          'Material and thickness match each label',
          'Grain direction is consistent on fronts and shelves',
          'No chipped or undersized blanks'
        ],
        notes: ['Work from the component drawings for any part with machining; do not re-measure off the elevation.'],
        caption: 'All parts for ' + cfg.tag + ' laid out and checked'
      });

    // ---- 2. edgebanding ----------------------------------------------------------------------
    if (bandedParts.length > 0) {
      step('Edge-band the exposed edges',
        'Band the exposed edges shown on the cut list, trim flush and file the ends. Band before machining so the band does not cover any holes.',
        {
          parts: bandedParts,
          tools: [TOOLS.iron, TOOLS.trimmer, TOOLS.knife],
          glue: 'PVC edgeband adhesive (iron-on)',
          qc: [
            'Band is flush with the face both ways',
            'No gaps or lifting at the ends',
            'Edges are sanded flush and the corner is eased'
          ],
          notes: ['Band the front edges of the carcass first, then the shelves and drawer parts.'],
          caption: 'Edge-band the exposed edges'
        });
    }

    // ---- 3. machine the carcass parts --------------------------------------------------------
    step('Machine the carcass parts',
      'Drill the System 32 shelf-pin rows and hinge plate holes, cut the back rabbets/dados and drill the carcass joinery as shown on the component drawings.',
      {
        parts: carcassParts.concat(backParts),
        tools: [TOOLS.boring, TOOLS.router, TOOLS.drill, TOOLS.square],
        qc: [
          'Shelf-pin rows are 37 mm from the front edge and on 32 mm centres',
          'Back rabbet/dado depth matches the back thickness (' + round(dims.backThickness, 1) + ' mm)',
          'Hinge plate holes are 37/69 mm from the front edge and level with the door',
          'Left and right side panels are mirror images where the drawing says so'
        ],
        notes: ['Machine both side panels together as a pair with the interior faces out to keep the hole rows identical.'],
        caption: 'Machine the side panels'
      });

    // ---- 4. assemble the carcass -------------------------------------------------------------
    var carcassFastener = c.joinery === 'confirmat' ? 'Confirmat screws (3 per joint)'
      : c.joinery === 'pocket-screw' ? 'Pocket screws (3 per joint)'
        : c.joinery === 'dowel' ? '8 × 30 mm dowels (3 per joint) + glue'
          : c.joinery === 'biscuit' ? 'Biscuits (3 per joint) + glue'
            : c.joinery === 'dado-screw' ? 'Dados + screws (2 per joint) + glue'
              : 'Wood screws (3 per joint) + glue';
    var carcassStepParts = partsMatching(model, function (p) {
      return p.group === 'Carcass' && p.key.indexOf('toe-kick') === -1;
    });
    step('Assemble the carcass',
      'Glue and fasten the sides, bottom and top structure into a square box. Work on a flat table and check the diagonals before the glue sets.',
      {
        parts: carcassStepParts,
        hardwareIds: hardwareIds(model, ['confirmat-50', 'pocket-screw-32', 'wood-dowel-8', 'biscuit-20']),
        tools: [TOOLS.driver, TOOLS.square, TOOLS.clamp, TOOLS.mallet],
        glue: 'PVA / aliphatic wood glue',
        fasteners: [carcassFastener],
        mode: 'exploded',
        qc: [
          'Diagonals are equal within 1 mm',
          'Carcass sits flat with no twist',
          'Joints are tight and flush; no split panels',
          'Interior width and height match the cut list'
        ],
        notes: [
          c.joinery === 'confirmat' ? 'Drill the confirmat pilot holes before driving; do not over-torque.' : 'Dry-fit the joints before glue-up.',
          'Check square as you tighten each corner; adjust the clamps until the diagonals agree.'
        ],
        caption: 'Carcass glued and squared'
      });

    // ---- 5. back -----------------------------------------------------------------------------
    if (backParts.length > 0) {
      var backNote = c.backStyle === 'rabbet' ? 'The back sits in the rear rabbet, flush with the rear edge.'
        : c.backStyle === 'dado' ? 'The back is captured in the rear dados, ' + round(c.backRecess, 1) + ' mm in from the rear edge.'
          : c.backStyle === 'applied' && c.backRecess > 0.01 ? 'The back is inset ' + round(c.backRecess, 1) + ' mm from the rear edge as a scribe lip.'
            : 'The back is applied to the rear face and squares the box.';
      step('Fit the back',
        'Fit and fasten the back. The back squares the carcass, so check the diagonals again after it is fitted.',
        {
          parts: backParts,
          tools: [TOOLS.brad, TOOLS.square, TOOLS.driver],
          glue: 'PVA on the rabbet/dado shoulders',
          fasteners: ['Staples or 18 ga brads through the back into the carcass'],
          mode: 'exploded',
          qc: ['Back is flush and square', 'Diagonals still equal within 1 mm', 'No fasteners through the finished interior face'],
          notes: [backNote],
          caption: 'Back fitted'
        });
    }

    // ---- 6. shelves --------------------------------------------------------------------------
    if (fixedShelves.length > 0) {
      step('Fit the fixed shelves',
        'Glue and fasten the fixed shelves into their dados. Check they are level and fully seated.',
        {
          parts: fixedShelves,
          tools: [TOOLS.driver, TOOLS.square, TOOLS.clamp],
          glue: 'PVA in the dados',
          fasteners: ['Screws or pins through the shelf into the sides'],
          mode: 'exploded',
          qc: ['Shelf is level front-to-back and side-to-side', 'Dado is fully engaged', 'No squeeze-out left on the faces'],
          caption: 'Fixed shelf installed'
        });
    }
    if (movableShelves.length > 0) {
      step('Fit the adjustable shelves',
        'Check the pin holes, then set the adjustable shelves on 5 mm pins at the heights shown. The shelves must lift in and out without binding.',
        {
          parts: movableShelves,
          hardwareIds: hardwareIds(model, ['shelf-pin-5']),
          tools: [TOOLS.tape, TOOLS.mallet],
          qc: ['Shelf sits level on four pins', '1 mm side clearance each side', 'Front edge flush with the shelf line'],
          notes: ['Final heights are set on site; the plan shows a suggested position.'],
          caption: 'Adjustable shelves fitted'
        });
    }

    // ---- 7. toe kick -------------------------------------------------------------------------
    if (toeParts.length > 0 && cfg.toeKick.style === 'separate-platform') {
      step('Build and fit the toe-kick platform',
        'Assemble the platform square, set it back ' + round(dims.toeKickSetback, 1) + ' mm from the cabinet face and fix the cabinet to it. The finished face of the platform stays exposed.',
        {
          parts: toeParts,
          tools: [TOOLS.driver, TOOLS.square, TOOLS.clamp],
          glue: 'PVA + screws',
          fasteners: ['3" construction screws into the platform'],
          mode: 'exploded',
          qc: [
            'Platform front is set back ' + round(dims.toeKickSetback, 1) + ' mm and parallel to the cabinet face',
            'Platform is flush with the cabinet sides',
            'Finished face is clean and ready to paint',
            'Cabinet is level on the platform'
          ],
          caption: 'Toe-kick platform fitted'
        });
    } else if (cfg.toeKick.style === 'legs-levelers') {
      step('Fit the levelers',
        'Screw the adjustable legs into the corners (and centre on wide cabinets), stand the cabinet up and level it.',
        {
          parts: [],
          hardwareIds: hardwareIds(model, ['leveler-foot']),
          tools: [TOOLS.driver, TOOLS.level],
          fasteners: ['Leg plates with four screws each'],
          qc: ['Cabinet is level and stable', 'Legs are set to the finished toe-kick height', 'No leg is in the way of the toe-kick board'],
          caption: 'Levelers fitted'
        });
    } else if (cfg.toeKick.style === 'notched-sides') {
      step('Fit the toe-kick board',
        'Cut the toe-kick board to the notched opening, fit it flush into the notches and fix it from inside.',
        {
          parts: toeParts,
          tools: [TOOLS.driver, TOOLS.tape],
          glue: 'Construction adhesive',
          fasteners: ['Screws or clips into the side panels'],
          qc: ['Board is set back flush with the scribe line', 'Board is square and tight to the notches', 'Exposed face is finished'],
          caption: 'Toe-kick board fitted'
        });
    }

    // ---- 8. face frame -----------------------------------------------------------------------
    if (isFaceFrame && ffParts.length > 0) {
      step('Assemble the face frame',
        'Assemble the stiles and rails on a flat table: glue and pocket-screw (or biscuit/dowel per the technique) each joint, check square, then set aside to cure.',
        {
          parts: ffParts,
          hardwareIds: hardwareIds(model, cfg.faceFrame.joinery === 'pocket-screw' ? ['pocket-screw-32'] : cfg.faceFrame.joinery === 'biscuit' ? ['biscuit-20'] : ['wood-dowel-8']),
          tools: [TOOLS.driver, TOOLS.square, TOOLS.clamp],
          glue: 'PVA',
          fasteners: [cfg.faceFrame.joinery === 'pocket-screw' ? 'Pocket screws (2 per joint)' : cfg.faceFrame.joinery === 'biscuit' ? 'Biscuits (2 per joint)' : 'Dowels (2 per joint)'],
          mode: 'exploded',
          qc: [
            'Frame is square (diagonals equal)',
            'All joints flush; faces sanded flat',
            'Opening sizes match the door/drawer schedule'
          ],
          caption: 'Face frame assembled'
        });
      step('Attach the face frame',
        'Glue and clamp the face frame to the carcass, flush with the outer sides. Check the overhang at the top and bottom before the glue sets.',
        {
          parts: ffParts,
          tools: [TOOLS.clamp, TOOLS.driver, TOOLS.square],
          glue: 'PVA',
          fasteners: ['Clamps + 1-1/4" screws from inside the carcass (or biscuits)'],
          qc: [
            'Frame flush with the sides within 0.5 mm',
            'Frame square; openings still match the schedule',
            'No glue squeeze-out on the face',
            'Carcass depth equals ' + round(dims.carcassDepth, 1) + ' mm behind the frame'
          ],
          notes: ['Pre-drill and countersink the interior fixings so the frame pulls tight without creeping.'],
          caption: 'Face frame attached to the carcass'
        });
    }

    // ---- 9. doors ----------------------------------------------------------------------------
    if (doorParts.length > 0 && doorLeaves.length > 0) {
      var frameDoorParts = partsMatching(model, function (p) {
        return p.group === 'Doors' && (p.key.indexOf('-stile') !== -1 || p.key.indexOf('-rail') !== -1);
      });
      var panelParts = partsMatching(model, function (p) {
        return p.group === 'Doors' && (p.key.indexOf('-panel') !== -1 || p.key.indexOf('-glass') !== -1 || p.key.indexOf('-muntin') !== -1);
      });
      if (frameDoorParts.length > 0) {
        step('Assemble the doors',
          'Assemble each door frame around its floating panel: glue the cope-and-stick (or dowel/domino) joints, check square and flat, and leave the panel free to move.',
          {
            parts: frameDoorParts.concat(panelParts),
            tools: [TOOLS.clamp, TOOLS.square, TOOLS.mallet, TOOLS.sander],
            glue: 'PVA on the frame joints only — never on the panel',
            fasteners: ['Clamps; pin the tenons if the profile is loose'],
            mode: 'exploded',
            qc: [
              'Door is square (diagonals equal within 1 mm)',
              'Door sits flat on the bench with no twist',
              'Panel floats ' + round(cfg.front.doors.panelFloat, 1) + ' mm all round (shake test)',
              'Frame joints tight and flush'
            ],
            notes: ['Check each door against its opening before boring the hinges.'],
            caption: 'Door frames assembled'
          });
      }
      if (cfg.front.doors.hingeType === 'euro-cup') {
        step('Bore the hinge cups and fit the hinges',
          'Bore the 35 mm hinge cups and screw holes on the door backs per the component drawing, then screw the hinges to the doors and the mounting plates to the cabinet.',
          {
            parts: doorParts.concat(partsMatching(model, function (p) { return p.key === 'side-left' || p.key === 'side-right'; })),
            hardwareIds: hardwareIds(model, ['hinge-euro-110', 'hinge-euro-inset', 'hinge-plate-cross']),
            tools: [TOOLS.boring, TOOLS.driver, TOOLS.screwdriver],
            qc: [
              'Cup centres are 22.5 mm from the hinge edge and equal top and bottom',
              'Cup depth 13 mm — do not break through a 19 mm door',
              'Screws bite cleanly; no stripped holes',
              'Mounting plates are level and at the correct overlay'
            ],
            notes: [
              'Left and right doors are mirror images — check the hinge side before boring.',
              dims.isFaceFrame && cfg.front.doors.overlay === 'full' ? 'Use face-frame adapter plates with a ' + round(dims.faceFrameThickness, 1) + ' mm overlay.' : 'Standard overlay plates.'
            ],
            caption: 'Hinge cups bored'
          });
      }
      step('Hang the doors and set the reveals',
        'Hang each door on its hinges and adjust the three-way cams until the reveal is even all round and the door sits flush with its neighbours.',
        {
          parts: doorParts,
          hardwareIds: hardwareIds(model, ['hinge-euro-110', 'hinge-euro-inset', 'hinge-butt']),
          tools: [TOOLS.screwdriver, TOOLS.driver],
          qc: [
            'Reveal is ' + round(cfg.front.reveal, 1) + ' mm and even at top, bottom and sides',
            'Doors are flush with each other and with the frame/face',
            'Doors close against the bumpers without binding',
            'Soft-close damping set'
          ],
          notes: ['Adjust the door height first, then the side reveal, then the depth.'],
          caption: 'Doors hung and adjusted'
        });
    }

    // ---- 10. drawers -------------------------------------------------------------------------
    if (drawerParts.length > 0) {
      var boxParts = partsMatching(model, function (p) {
        return p.group === 'Drawers' && p.key.indexOf('df') !== 0;
      });
      var dfParts = partsMatching(model, function (p) {
        return p.group === 'Drawers' && p.key.indexOf('df') === 0;
      });
      if (boxParts.length > 0) {
        step('Assemble the drawer boxes',
          'Cut the dovetails/box joints, glue and clamp each box with the bottom captured in its dado, and check square and flat before the glue cures.',
          {
            parts: boxParts,
            hardwareIds: hardwareIds(model, ['slide-undermount-softclose', 'slide-side-mount', 'slide-center-mount']),
            tools: [TOOLS.clamp, TOOLS.square, TOOLS.driver],
            glue: 'PVA',
            fasteners: [cfg.front.drawers.boxJoinery === 'butt-screw' ? 'Screws + glue' : 'Glue only (dovetail/box joint)'],
            mode: 'exploded',
            qc: [
              'Box is square (diagonals equal)',
              'Bottom is flat and fully seated in its dado',
              'No glue on the inside faces',
              'Box outside size matches the slide rule: ' + round(dims.interiorWidth, 1) + ' mm opening'
            ],
            notes: ['Label each box with its drawer number so it goes back into the same opening.'],
            caption: 'Drawer boxes assembled'
          });
        step('Fit the drawer slides and boxes',
          'Install the cabinet members of the slides level and parallel, then fit the drawer boxes and check the travel and clearance.',
          {
            parts: boxParts,
            hardwareIds: hardwareIds(model, ['slide-undermount-softclose', 'slide-side-mount', 'slide-center-mount']),
            tools: [TOOLS.driver, TOOLS.tape, TOOLS.square],
            qc: [
              'Slide members are level and at the same height left/right',
              'Box clears the back by the rear clearance',
              'Drawer runs full travel with no binding',
              'Soft-close engages before the front meets the cabinet'
            ],
            caption: 'Drawer slides fitted'
          });
      }
      if (dfParts.length > 0) {
        step('Fit the drawer fronts',
          'Screw the drawer fronts to the boxes from inside, set the reveals and check each front is flush with its neighbours and the doors.',
          {
            parts: dfParts,
            tools: [TOOLS.clamp, TOOLS.driver, TOOLS.tape],
            fasteners: ['Drawer front screws through the box front from inside'],
            qc: [
              'Reveal is ' + round(cfg.front.reveal, 1) + ' mm and even all round',
              'Front is centred on the box and flush with the cabinet face',
              'Drawer front lines up with the adjacent doors/drawers',
              'All fronts operate without rubbing'
            ],
            notes: ['Use double-sided tape or clamps to hold the front while you drive the first screw, then check before the second.',
              isFaceFrame && cfg.front.doors.overlay === 'full' ? 'Overlay fronts on a face frame sit one frame thickness in front of the drawer box; use screws long enough (driven from inside the box) or a spacer.' : 'Check the front-to-box gap before driving the second screw.'],
            caption: 'Drawer fronts fitted'
          });
      }
    }

    // ---- 11. pulls ---------------------------------------------------------------------------
    var pullParts = doorParts.concat(drawerParts);
    if (pullParts.length > 0) {
      step('Fit the pulls',
        'Drill the pull screw holes at the positions on the front schedule and fit the pulls. Check spacing and height across the whole run.',
        {
          parts: pullParts,
          hardwareIds: hardwareIds(model, ['pull-bar-128', 'pull-knob-32']),
          tools: [TOOLS.drill, TOOLS.tape, TOOLS.pencil, TOOLS.screwdriver],
          qc: [
            'Pull centres are consistent across the run',
            'Door pulls are opposite the hinges',
            'Screw holes do not break through the door/drawer face',
            'Pulls are level and tight'
          ],
          caption: 'Pulls fitted'
        });
    }

    // ---- 12. wall mounting -------------------------------------------------------------------
    if (cfg.type === 'wall' || cfg.type === 'tall' || cfg.type === 'pantry') {
      if (cfg.hardware.hangingRail) {
        step('Fit the hanging rail and hang the cabinet',
          'Fix the wall rail to the studs at the marked height, engage the cabinet cleat and level the cabinet. Tall cabinets also get a bottom fixing and anti-tip strap.',
          {
            parts: [],
            hardwareIds: hardwareIds(model, ['hanging-rail']),
            tools: [TOOLS.drill, TOOLS.level, TOOLS.driver],
            fasteners: ['Rail screws into studs every ' + round((defaults.standards().wallAttachment || {}).railFastenerSpacing || 100, 0) + ' mm'],
            qc: [
              'Rail is level and fixed into studs',
              'Cabinet hangs level and flush with its neighbours',
              'All adjustable feet/levelers are carrying load',
              'Tall cabinets: anti-tip fixing fitted at the top'
            ],
            notes: ['Wall cabinets must carry 272–363 kg static load per KCMA; never rely on a 6 mm back alone.'],
            caption: 'Hanging rail fitted'
          });
      }
      if (cfg.type === 'tall' || cfg.type === 'pantry') {
        step('Fix the tall cabinet to the wall',
          'Plumb and level the tall cabinet, shim the base, then screw through the hanging rail and the anti-tip bracket at the top.',
          {
            parts: [],
            hardwareIds: hardwareIds(model, ['hanging-rail']),
            tools: [TOOLS.level, TOOLS.driver],
            fasteners: ['Anti-tip bracket + 3" screws into studs'],
            qc: ['Cabinet is plumb and level', 'Top is fixed to the wall', 'No movement when pushed'],
            caption: 'Tall cabinet fixed'
          });
      }
    } else if (dims.hasToeKick) {
      step('Set the cabinet in place',
        'Move the cabinet to its position, scribe it to the wall if needed, level it and fix it to the wall studs.',
        {
          parts: [],
          tools: [TOOLS.level, TOOLS.driver, TOOLS.tape],
          fasteners: ['Wall fixings into studs'],
          qc: ['Cabinet is level and plumb', 'Scribe is tight to the wall', 'Toe kick line is continuous with the run'],
          caption: 'Cabinet set and levelled'
        });
    }

    // ---- 13. final QC ------------------------------------------------------------------------
    step('Final quality check',
      'Run the final check before the cabinet leaves the bench: dimensions, square, front alignment, hardware operation and finish readiness.',
      {
        parts: allParts,
        tools: [TOOLS.tape, TOOLS.square, TOOLS.level],
        qc: [
          'Overall size matches the plan (' + round(dims.width, 1) + ' × ' + round(dims.height, 1) + ' × ' + round(dims.depth, 1) + ' mm)',
          'Cabinet is square and sits flat',
          'All reveals even at ' + round(cfg.front.reveal, 1) + ' mm',
          'Doors and drawers operate smoothly; hinges and slides adjusted',
          'All hardware fitted and tight',
          'Edges banded, faces sanded and ready to finish',
          'Part labels removed or hidden'
        ],
        notes: ['Touch up any filled fastener holes before finishing.', 'Record the cabinet tag on the back for site identification.'],
        caption: 'Final QC'
      });

    return steps;
  }

  var api = {
    buildAssembly: buildAssembly,
    TOOLS: TOOLS
  };

  CS.engine = CS.engine || {};
  CS.engine.assembly = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
