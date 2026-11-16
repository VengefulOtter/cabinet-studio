/**
 * Cabinet Studio engine — validation (contract §4 Warning).
 *
 * `validateCabinet` runs the per-cabinet shop rules against a resolved CabinetModel;
 * `validateProject` adds project-wide checks (nesting failures, sheet yield, catalogue gaps).
 * Warnings are honest and actionable: severity `error` means "do not cut yet", `warning` means
 * "this will bite you", `info` is a professional note.
 *
 * Rule ids (`Warning.rule`) follow `area.subject` so the UI can group and the tests can assert.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var defaults = CS.engine && CS.engine.defaults;
  var P = CS.engine && CS.engine.parts;
  if (!defaults) throw new Error('CabinetStudio engine load order: defaults.js must load before check.js');

  var U = defaults.util;
  var num = U.num, round = U.round, isFinitePositive = U.isFinitePositive;

  function makeWarning(cfg, severity, title, message, rule, fix, partIds) {
    return {
      id: (rule || 'check') + ':' + (cfg && cfg.tag ? cfg.tag : 'project'),
      severity: severity,
      cabinetId: cfg ? cfg.id : null,
      cabinetTag: cfg ? cfg.tag : null,
      partIds: partIds || [],
      title: title,
      message: message,
      rule: rule || 'check',
      fix: fix || ''
    };
  }

  /** Ensure warning ids are unique inside a list by suffixing a counter. */
  function uniquify(list) {
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var base = list[i].id || 'w';
      var n = 2;
      var id = base;
      while (seen[id]) id = base + '#' + n++;
      seen[id] = true;
      list[i].id = id;
    }
    return list;
  }

  function partsWithKey(model, prefix) {
    var out = [];
    for (var i = 0; i < model.parts.length; i++) {
      if (model.parts[i].key.indexOf(prefix) === 0) out.push(model.parts[i]);
    }
    return out;
  }

  function partByKey(model, key) {
    for (var i = 0; i < model.parts.length; i++) if (model.parts[i].key === key) return model.parts[i];
    return null;
  }

  function allEdges(part) {
    return (part.edgeband && Array.isArray(part.edgeband.edges)) ? part.edgeband.edges : [];
  }

  // =============================================================================================
  // Per-cabinet validation
  // =============================================================================================

  /**
   * Validate one resolved cabinet.
   * @param {Object} model CabinetModel
   * @param {Object} project normalised project
   * @param {Object} standards resolved standards (defaults.standards())
   * @returns {Array} warnings (contract §4 Warning)
   */
  function validateCabinet(model, project, standards) {
    var st = standards || defaults.standards();
    var cfg = model.config;
    var dims = model.dims;
    var warnings = [];
    var W = function (severity, title, message, rule, fix, partIds) {
      warnings.push(makeWarning(cfg, severity, title, message, rule, fix, partIds));
    };
    var i;

    // ---- geometry sanity ---------------------------------------------------------------------
    for (i = 0; i < model.parts.length; i++) {
      var part = model.parts[i];
      var badDims = !isFinitePositive(part.length) || !isFinitePositive(part.width) || !isFinitePositive(part.thickness);
      var badBox = !part.box || !isFinitePositive(part.box.w) || !isFinitePositive(part.box.d) || !isFinitePositive(part.box.h);
      if (badDims || badBox) {
        W('error', 'Part has invalid geometry', part.name + ' (' + part.id + ') has a non-positive dimension or placement and must not be cut.', 'part.geometry', 'Report this cabinet configuration; do not cut the part.', [part.id]);
        continue;
      }
      for (var m = 0; m < part.machining.length; m++) {
        var mach = part.machining[m];
        if (mach.type === 'hole') {
          if (mach.x < -0.01 || mach.x > part.length + 0.01 || mach.y < -0.01 || mach.y > part.width + 0.01) {
            W('error', 'Machining outside part', part.name + ': a ' + mach.purpose + ' hole falls outside the part outline.', 'machining.bounds', 'Check the machining layout before cutting.', [part.id]);
          }
        }
      }
    }

    // ---- overall dimensions ------------------------------------------------------------------
    var typeStd = (st.dims && st.dims[cfg.type]) || st.dims.base;
    if (cfg.width < (typeStd.minWidth || 152.4)) {
      W('warning', 'Cabinet narrower than usable', 'A ' + round(cfg.width, 1) + ' mm cabinet leaves very little usable interior.', 'dims.minWidth', 'Increase the width or use a filler.', []);
    }
    if (cfg.width > (typeStd.maxWidth || 1219.2)) {
      W('error', 'Cabinet too wide for one section', 'At ' + round(cfg.width, 1) + ' mm the panels and shelves need a divider; build two cabinets or add a fixed divider.', 'dims.maxWidth', 'Split the run into two cabinets.', []);
    } else if (cfg.type === 'wall' && cfg.width > 914.4) {
      W('warning', 'Wall cabinet over 36" wide', 'Wall cabinets over 914 mm usually need a centre divider or heavier hanging rail.', 'dims.wallWidth', 'Add a fixed divider or specify a heavier rail.', []);
    }
    if (dims.isFaceFrame) {
      var ffOpen = dims.width - 2 * cfg.faceFrame.stileWidth;
      if (ffOpen < num((st.faceFrame && st.faceFrame.minOpening) || 100, 100)) {
        W('error', 'Face-frame opening too narrow', 'The face-frame opening is ' + round(ffOpen, 1) + ' mm wide with ' + round(cfg.faceFrame.stileWidth, 1) + ' mm stiles; the doors/hinges need more room.', 'faceFrame.opening', 'Reduce the stile width or widen the cabinet.', []);
      }
    }
    if (dims.interiorWidth < 80) {
      W('error', 'No usable interior', 'Interior width after sides' + (dims.isFaceFrame ? ' and face frame' : '') + ' is ' + round(dims.interiorWidth, 1) + ' mm.', 'dims.interiorWidth', 'Increase the cabinet width.', []);
    }
    if (dims.interiorHeight < 100) {
      W('error', 'No usable interior height', 'Interior height resolved to ' + round(dims.interiorHeight, 1) + ' mm.', 'dims.interiorHeight', 'Increase the cabinet height.', []);
    }

    // ---- construction / material sanity ------------------------------------------------------
    var carcassMat = defaults.material(cfg.construction.carcassMaterial);
    if (Math.abs(carcassMat.thickness - cfg.construction.carcassThickness) > 0.75) {
      W('warning', 'Carcass thickness differs from the material', 'Configured thickness ' + round(cfg.construction.carcassThickness, 2) + ' mm but ' + carcassMat.name + ' is ' + round(carcassMat.thickness, 2) + ' mm.', 'construction.thickness', 'Set the carcass thickness to the material thickness (or vice versa).', []);
    }
    // Honest thickness guidance for the guided Build step. These are advisory only — geometry is
    // unchanged; a 12 mm build must not produce errors by itself.
    var carcassT = cfg.construction.carcassThickness;
    var structuralType = cfg.type === 'base' || cfg.type === 'tall' || cfg.type === 'pantry';
    if (structuralType && carcassT < 15) {
      W('warning', 'Light-duty carcass for a structural cabinet',
        'This ' + cfg.type + ' cabinet uses a ' + round(carcassT, 1) + ' mm carcass. 12 mm sheet goods are for wall/light-duty units, not a kitchen-grade structural box; an 18 mm carcass carries the base, drawers, counter and daily load far better.',
        'construction.thinCarcass', 'Use 18 mm (or at least 15 mm) plywood/MDF for the carcass.', []);
    } else if (cfg.type === 'wall' && carcassT < 15) {
      W('info', 'Light-duty wall cabinet carcass',
        'This wall cabinet uses a ' + round(carcassT, 1) + ' mm carcass. That is acceptable for light wall units, but 18 mm is more durable and takes hinges, shelf pins and a hanging rail with more bite.',
        'construction.thinCarcass', 'Consider 18 mm for wall cabinets; keep shelf loads modest if staying at ' + round(carcassT, 1) + ' mm.', []);
    }
    if (cfg.construction.system === 'faceframe' && carcassT < 17) {
      W('warning', 'Thin carcass under a face frame',
        'The ' + round(cfg.faceFrame.thickness, 1) + ' mm face frame sits proud of a ' + round(carcassT, 1) + ' mm carcass, so the frame edge shows and the frame-to-carcass screws have very little purchase. Use an 18 mm carcass with a face frame.',
        'faceFrame.thinCarcass', 'Match the face frame to an 18 mm (or thicker) carcass; if the carcass stays thin, use glue blocks or a thicker frame and check the joint.', []);
    }
    if (cfg.construction.backStyle === 'dado' && carcassT < 15) {
      var dadoDepth = num(cfg.construction.dadoDepth, 6);
      var dadoRatio = carcassT > 0 ? Math.round((dadoDepth / carcassT) * 100) : 0;
      W('warning', 'Back dado cuts into a thin carcass',
        'A ' + round(dadoDepth, 1) + ' mm back dado removes about ' + dadoRatio + '% of a ' + round(carcassT, 1) + ' mm side panel. The remaining side can bow or split when the cabinet is loaded or moved; a rabbeted or applied back is safer on thin sheet goods.',
        'back.thinDado', 'Use a rabbeted/applied back, or use an 18 mm carcass for the dadoed back.', []);
    }
    var drawerMat = defaults.material(cfg.front.drawers.boxMaterial);
    if (Math.abs(drawerMat.thickness - cfg.front.drawers.boxSideThickness) > 0.75) {
      W('warning', 'Drawer side thickness differs from the material', 'Drawer sides are ' + round(cfg.front.drawers.boxSideThickness, 2) + ' mm but ' + drawerMat.name + ' is ' + round(drawerMat.thickness, 2) + ' mm.', 'drawer.thickness', 'Set the drawer side thickness to the material thickness.', []);
    }
    if (cfg.construction.system === 'frameless' && cfg.construction.backStyle === 'none' && (cfg.type === 'wall' || cfg.type === 'tall' || cfg.type === 'pantry')) {
      W('error', 'Wall/tall cabinet has no back', 'A wall or tall cabinet without a back loses its racking strength and hanging load path.', 'construction.backNone', 'Use a rabbeted or applied back, or add a full nailer rail.', []);
    }
    if (cfg.front.type === 'doors' && cfg.front.doors.style === 'slab' && !dims.isFaceFrame && cfg.front.doors.overlay === 'inset' && cfg.width > 900) {
      W('info', 'Wide frameless inset doors', 'Inset doors need stops; on a frameless cabinet add applied rails or a face frame.', 'construction.framelessInset', 'Add a face frame or applied door stops.', []);
    }

    // ---- front sizing ------------------------------------------------------------------------
    var reveal = cfg.front.reveal;
    var doorThickness = cfg.front.doors.thickness;
    var thicknessKey = String(Math.round(doorThickness));
    var minRevealTable = (st.hinge && st.hinge.minRevealByThickness) || {};
    var minReveal = 0.6;
    if (minRevealTable[thicknessKey]) {
      minReveal = num(minRevealTable[thicknessKey]['5'], num(minRevealTable[thicknessKey]['3'], 0.6));
    }
    if (cfg.front.doors.overlay === 'inset' && reveal < minReveal) {
      W('error', 'Inset reveal below hinge minimum', 'The ' + round(reveal, 2) + ' mm reveal is below the ' + round(minReveal, 2) + ' mm minimum for a ' + thicknessKey + ' mm door with a euro hinge.', 'door.insetReveal', 'Increase the reveal to at least ' + round(minReveal + 0.5, 1) + ' mm.', []);
    }
    if (reveal < 2) {
      W('warning', 'Reveal below 2 mm', 'Gaps of ' + round(reveal, 1) + ' mm are hard to keep even; finishes will rub.', 'door.revealMin', 'Use a 2.5–3 mm reveal.', []);
    }
    if (reveal > 6) {
      W('info', 'Large front reveal', 'Reveals over 6 mm look gappy and let dust in.', 'door.revealMax', 'Use 2.5–3 mm.', []);
    }
    for (i = 0; i < model.frontLayout.doors.length; i++) {
      var leaf = model.frontLayout.doors[i];
      if (leaf.w > (st.door.maxLeafWidth || 609.6)) {
        W('error', 'Door leaf too wide', leaf.label + ' is ' + round(leaf.w, 1) + ' mm wide; cup hinges are rated to ' + round(st.door.maxLeafWidth || 609.6, 1) + ' mm.', 'door.maxLeafWidth', 'Split the door into two leaves.', leaf.partIds);
      }
      var schedule = (st.hinge && st.hinge.countByHeight) || [];
      var requiredHinges = schedule.length ? schedule[schedule.length - 1].hinges : 2;
      for (var s = 0; s < schedule.length; s++) {
        if (leaf.h <= schedule[s].maxHeight) { requiredHinges = schedule[s].hinges; break; }
      }
      if (leaf.hingeCount < requiredHinges) {
        W('error', 'Not enough hinges', leaf.label + ' is ' + round(leaf.h, 1) + ' mm high and needs at least ' + requiredHinges + ' hinges; the door has ' + leaf.hingeCount + '.', 'hinge.count', 'Increase the hinge count to ' + requiredHinges + ' or more.', leaf.partIds);
      }
      var hingeSpan = (Array.isArray(leaf.hingePositions) && leaf.hingePositions.length >= 2)
        ? (leaf.hingePositions[leaf.hingePositions.length - 1] - leaf.hingePositions[0])
        : leaf.h - 2 * st.door.hingeCup.endOffset;
      if (leaf.hingeCount === 2 && hingeSpan <= leaf.w) {
        W('warning', 'Hinge spacing shorter than the door width', leaf.label + ': the two hinge cups are ' + round(hingeSpan, 1) + ' mm apart but the leaf is ' + round(leaf.w, 1) + ' mm wide (research rule V5). A short wide leaf should get a third hinge or a wider cup spacing.', 'hinge.spacing', 'Add a third hinge or re-check the door proportions.', leaf.partIds);
      }
      if (leaf.thickness < 16 || leaf.thickness > 26) {
        W('warning', 'Door thickness outside the hinge range', leaf.label + ' is ' + round(leaf.thickness, 1) + ' mm thick; standard 35 mm cup hinges suit 16–26 mm.', 'door.thickness', 'Change the door thickness or specify a hinge for the thickness.', leaf.partIds);
      }
      if (dims.isFaceFrame && cfg.front.doors.overlay === 'full' && cfg.front.doors.hingeType === 'euro-cup') {
        var requiredOverlay = dims.faceFrameThickness;
        if (requiredOverlay > 26) {
          W('error', 'Face frame too thick for a full-overlay hinge', 'A full-overlay door over a ' + round(requiredOverlay, 1) + ' mm face frame needs a special plate; standard plates top out around 26 mm overlay.', 'door.faceFrameHingeOverlay', 'Use an inset door or a thicker-overlay hinge plate.', leaf.partIds);
        } else {
          W('info', 'Face-frame full overlay needs adapter plates', 'Full-overlay doors on a ' + round(requiredOverlay, 1) + ' mm face frame must use face-frame mounting plates with the same overlay; a frameless plate would hold the door off the frame.', 'door.faceFrameHingeOverlay', 'Specify face-frame mounting plates (hinge-plate-cross) with a ' + round(requiredOverlay, 1) + ' mm overlay.', leaf.partIds);
        }
      }
    }
    // Drawer front heights fill the front region.
    if (cfg.front.type === 'drawer-stack' && model.frontLayout.drawerFronts.length > 0 && cfg.front.doors.overlay === 'full') {
      var df = model.frontLayout.drawerFronts;
      var lowest = null, highest = null;
      for (i = 0; i < df.length; i++) {
        if (lowest === null || df[i].y < lowest.y) lowest = df[i];
        if (highest === null || df[i].y + df[i].h > highest.y + highest.h) highest = df[i];
      }
      if (lowest && highest) {
        var bottomGap = round(lowest.y - dims.frontBottomZ, 2);
        var topGap = round(dims.boxTopZ - (highest.y + highest.h), 2);
        if (Math.abs(bottomGap - reveal) > 0.6 || Math.abs(topGap - reveal) > 0.6) {
          W('info', 'Drawer stack does not fill the front', 'Top/bottom gaps are ' + round(topGap, 1) + ' / ' + round(bottomGap, 1) + ' mm instead of ' + round(reveal, 1) + ' mm; the stack may not fill the front region.', 'front.drawerStackFit', 'Adjust the custom drawer heights.', []);
        }
      }
      for (i = 0; i < df.length; i++) {
        if (df[i].w > 610) {
          W('info', 'Wide drawer front with one pull', df[i].label + ' is ' + round(df[i].w, 1) + ' mm wide; a single 128 mm bar will look undersized.', 'pull.count', 'Specify two pulls or a longer bar.', []);
        }
      }
    }

    // ---- drawers -----------------------------------------------------------------------------
    var dr = cfg.front.drawers;
    var famKey = dr.slide === 'undermount' ? 'undermount' : dr.slide === 'side-mount' ? 'sideMount' : 'centerMount';
    var families = st.drawerFamilies || {};
    var family = families[famKey] || {};
    var rearClear = num(family.rearClearance, st.drawer.rearClearance[dr.slide] || 0);
    for (i = 0; i < model.drawerBoxes.length; i++) {
      var box = model.drawerBoxes[i];
      var b = box.box;
      var expectedW;
      if (dr.slide === 'undermount') {
        var insideW = num(family.insideWidthClearance, dr.boxWidthClearance !== null ? dr.boxWidthClearance : st.drawer.undermountClearance);
        expectedW = round(dims.interiorWidth - insideW + 2 * dr.boxSideThickness, 2);
      } else if (dr.slide === 'side-mount') {
        expectedW = round(dims.interiorWidth - num(family.outsideWidthClearance, st.drawer.sideMountClearance), 2);
      } else {
        expectedW = round(dims.interiorWidth - num(family.outsideWidthClearance, st.drawer.centerMountClearance), 2);
      }
      if (Math.abs(b.w - expectedW) > 0.6) {
        W('error', 'Drawer box width does not match the slide rule', box.label + ' box outside width is ' + round(b.w, 1) + ' mm but the ' + dr.slide + ' rule gives ' + round(expectedW, 1) + ' mm.', 'drawer.boxWidth', 'Use the slide manufacturer\'s width rule.', box.partIds);
      }
      var slideLen = box.slideLength || b.d;
      if (slideLen + rearClear > dims.interiorDepth + 0.6) {
        W('error', 'Slide longer than the cabinet', box.label + ': ' + round(slideLen, 1) + ' mm slide + ' + round(rearClear, 1) + ' mm rear clearance exceeds the ' + round(dims.interiorDepth, 1) + ' mm interior depth.', 'drawer.slideDepth', 'Choose a shorter slide.', box.partIds);
      }
      // Wrong standard length: a larger standard slide also fits.
      if (family.lengthsMm && dr.slide !== 'center-mount') {
        var largerFits = false;
        for (var l = 0; l < family.lengthsMm.length; l++) {
          var len = family.lengthsMm[l];
          if (len > slideLen + 0.6 && len + rearClear <= dims.interiorDepth + 0.6) largerFits = true;
        }
        if (largerFits) {
          W('warning', 'Shorter slide than necessary', box.label + ' uses a ' + round(slideLen, 1) + ' mm slide; a longer standard slide still fits the cabinet.', 'drawer.slideSizing', 'Use the largest standard slide that fits.', box.partIds);
        }
      }
      var profileMin = num(st.drawer.minVerticalClearance && st.drawer.minVerticalClearance[dr.slide], 0);
      if (dr.slide === 'undermount' && num(dr.boxHeightAllowance, 25) + 2 * reveal < profileMin) {
        W('warning', 'Drawer box allowance too small for an undermount slide', box.label + ': the front overlaps the box by ' + round(num(dr.boxHeightAllowance, 25), 1) + ' mm plus reveals; undermount slides want about ' + round(profileMin, 1) + ' mm of vertical clearance.', 'drawer.verticalFit', 'Increase the box height allowance to at least ' + round(profileMin - 2 * reveal, 1) + ' mm.', box.partIds);
      }
      if (b.y < dims.interiorRearY - 0.6) {
        W('error', 'Drawer box hits the back', box.label + ' box extends past the interior rear.', 'drawer.boxBack', 'Shorten the box or slide.', box.partIds);
      }
    }
    if (model.drawerBoxes.length > 0 && dims.interiorDepth < 150) {
      W('error', 'Cabinet too shallow for drawers', 'Interior depth is only ' + round(dims.interiorDepth, 1) + ' mm.', 'drawer.depth', 'Increase the cabinet depth.', []);
    }

    for (i = 0; i < model.frontLayout.drawerFronts.length; i++) {
      var smallFront = model.frontLayout.drawerFronts[i];
      if (smallFront.h < num(st.drawer.minFrontHeight, 90)) {
        W('warning', 'Drawer front below the minimum height', smallFront.label + ' is ' + round(smallFront.h, 1) + ' mm high; the minimum sensible drawer front is ' + round(num(st.drawer.minFrontHeight, 90), 1) + ' mm.', 'front.drawerMinHeight', 'Use fewer drawers or a taller cabinet.', smallFront.partIds || []);
      }
    }

    // ---- shelves and panels ------------------------------------------------------------------
    var spanConfig = st.shelfSpan && st.shelfSpan.recommendedByMaterial ? st.shelfSpan.recommendedByMaterial : {};
    var shelfSpanLimit = num(spanConfig[cfg.interior.shelfMaterial], num((st.shelf.maxSpanByThickness || {})[String(Math.round(cfg.interior.shelfThickness))], 900));
    var blockSpan = num(st.shelfSpan && st.shelfSpan.blockWithoutSupport, 1050);
    for (i = 0; i < model.parts.length; i++) {
      var sp = model.parts[i];
      if (sp.group !== 'Shelves') continue;
      if (sp.length > blockSpan) {
        W('error', 'Shelf span too long', sp.name + ' spans ' + round(sp.length, 1) + ' mm; ' + round(blockSpan, 1) + ' mm is the blocking limit without a support.', 'shelf.span', 'Add a mid support, divider or thicker material.', [sp.id]);
      } else if (sp.length > shelfSpanLimit) {
        W('warning', 'Shelf span over the recommended limit', sp.name + ' spans ' + round(sp.length, 1) + ' mm; ' + round(shelfSpanLimit, 1) + ' mm is recommended for ' + cfg.interior.shelfMaterial + ' at ' + round(cfg.interior.shelfThickness, 1) + ' mm.', 'shelf.span', 'Add a support or use a thicker shelf.', [sp.id]);
      }
    }
    var hasFrameDoors = (cfg.front.type === 'doors' || cfg.front.type === 'door-drawer') && cfg.front.doors.style !== 'slab';
    var hasFrameDrawers = (cfg.front.type === 'drawer-stack' || cfg.front.type === 'door-drawer') && cfg.front.drawers.style !== 'slab';
    var panelFloat = num(cfg.front.doors.panelFloat, st.door.panelFloat);
    if ((hasFrameDoors || hasFrameDrawers) && panelFloat < 2) {
      W('error', 'Panel expansion allowance too small', 'The floating panel has ' + round(panelFloat, 1) + ' mm float per side; solid panels need at least 2 mm (3 mm recommended).', 'door.panelFloat', 'Increase the panel float to 2.5–3 mm per side.', []);
    } else if ((hasFrameDoors || hasFrameDrawers) && panelFloat < 3) {
      W('info', 'Panel float is minimal', 'The floating panel has ' + round(panelFloat, 1) + ' mm float per side; 3 mm is recommended for wide solid panels.', 'door.panelFloat', 'Increase the panel float to 3 mm.', []);
    }

    // ---- back and wall attachment ------------------------------------------------------------
    if ((cfg.type === 'wall' || cfg.type === 'tall' || cfg.type === 'pantry') && cfg.construction.backStyle === 'applied' && dims.backThickness < 12 && !cfg.hardware.hangingRail) {
      W('error', 'Thin applied back with no hanging rail', 'A ' + round(dims.backThickness, 1) + ' mm applied back is not a load path for a wall cabinet; KCMA static loads are 272–363 kg.', 'back.wallSupport', 'Add a hanging rail/nailer (hardware.hangingRail) or use a structural back.', []);
    }
    if ((cfg.type === 'wall' || cfg.type === 'tall' || cfg.type === 'pantry') && cfg.construction.backStyle === 'none' && !cfg.hardware.hangingRail) {
      W('error', 'No back and no hanging rail', 'The cabinet has no back and no hanging rail; it cannot be safely fixed to the wall.', 'back.wallSupport', 'Add a back or a full hanging rail.', []);
    }
    if ((cfg.type === 'tall' || cfg.type === 'pantry') && cfg.height > 1800) {
      W('info', 'Tall cabinet needs an anti-tip fixing', 'Tall cabinets over 1800 mm must be fixed to the wall at the top as well as the bottom.', 'install.antiTip', 'Add wall fixings and an anti-tip strap.', []);
    }
    if (cfg.construction.backStyle === 'applied' && cfg.construction.backRecess > 0 && dims.isWall && cfg.depth < 250) {
      W('warning', 'Shallow wall cabinet with an inset back', 'A ' + round(cfg.construction.backRecess, 1) + ' mm back recess costs interior depth on a shallow cabinet.', 'back.depth', 'Check that plates and glassware still clear the doors.', []);
    }

    // ---- toe kick ----------------------------------------------------------------------------
    if (cfg.toeKick.style !== 'none' && cfg.toeKick.style !== 'flush-base' && cfg.toeKick.style !== 'legs-levelers') {
      var kcmaMinH = num(st.toeKick.kcmaMinHeight, 76.2);
      var kcmaMinD = num(st.toeKick.kcmaMinDepth, 50.8);
      if (cfg.toeKick.height < kcmaMinH) {
        W('warning', 'Toe kick below the KCMA minimum', 'Toe kick is ' + round(cfg.toeKick.height, 1) + ' mm high; the minimum is ' + round(kcmaMinH, 1) + ' mm.', 'toeKick.height', 'Increase the toe kick height.', []);
      }
      if (cfg.toeKick.setback < kcmaMinD) {
        W('warning', 'Toe kick setback too shallow', 'Toe kick setback is ' + round(cfg.toeKick.setback, 1) + ' mm; KCMA minimum toe space is ' + round(kcmaMinD, 1) + ' mm deep.', 'toeKick.setback', 'Increase the setback to 76–100 mm.', []);
      }
      if (dims.toeKickSetback > 150) {
        W('info', 'Deep toe kick', 'A ' + round(dims.toeKickSetback, 1) + ' mm setback makes the cabinet unstable unless it is fixed to the wall.', 'toeKick.setback', 'Keep the setback at 50–100 mm.', []);
      }
    }
    if (cfg.toeKick.style === 'flush-base' && cfg.front.type !== 'open') {
      W('info', 'Flush base under working fronts', 'A flush base leaves the doors reaching the floor; it is usually reserved for furniture/vanity work.', 'construction.flushBase', 'Use a separate platform or notched sides for a kitchen run.', []);
    }
    var toeKickBoard = partByKey(model, 'toe-kick-front');
    if (toeKickBoard && toeKickBoard.box.z !== dims.toeKickSetback && toeKickBoard.box.z !== 0 && toeKickBoard.box.y < 0) {
      W('warning', 'Toe kick placement', 'The toe kick board may be behind the carcass.', 'toeKick.placement', 'Check the toe kick setback.', [toeKickBoard.id]);
    }

    // ---- edge treatment ----------------------------------------------------------------------
    for (i = 0; i < model.parts.length; i++) {
      var p2 = model.parts[i];
      var mat = defaults.material(p2.materialId);
      var isGlass = /glass/i.test(mat.id) || /glass/i.test(mat.name);
      var isBoard = !isGlass && (mat.category === 'panel' || mat.category === 'sheet');
      if (!isBoard) continue;
      var banded = allEdges(p2);
      var exposedFrontGroups = { 'door-slab': 1, 'drawer-front': 1, 'door-stile': 1, 'door-rail': 1, 'drawer-front-stile': 1, 'drawer-front-rail': 1, 'door-muntin': 1 };
      var isFrontPart = (p2.group === 'Doors' || p2.group === 'Drawers') && exposedFrontGroups[p2.cutListGroup];
      if (isFrontPart && banded.length === 0) {
        W('warning', 'Exposed front edge not edge-banded', p2.name + ' is made from ' + mat.name + ' and has no edgeband on its exposed edges.', 'edge.exposed', 'Band the exposed edges before finishing.', [p2.id]);
      }
      if (!isFrontPart && p2.group === 'Shelves' && banded.indexOf('front') === -1) {
        W('warning', 'Shelf front edge not banded', p2.name + ' (' + mat.name + ') has no front edgeband.', 'edge.exposed', 'Band the shelf front edge.', [p2.id]);
      }
      if (!isFrontPart && !dims.isFaceFrame && p2.key.indexOf('side-') === 0 && banded.indexOf('front') === -1) {
        W('warning', 'Frameless side front edge not banded', p2.name + ' (' + mat.name + ') exposes its front edge.', 'edge.exposed', 'Band the front edge before assembly.', [p2.id]);
      }
    }

    // ---- sheet fit ---------------------------------------------------------------------------
    for (i = 0; i < model.parts.length; i++) {
      var sh = model.parts[i];
      var sm = defaults.material(sh.materialId);
      var sheetGoods = CS.engine.cutlist && typeof CS.engine.cutlist.isSheetGood === 'function'
        ? CS.engine.cutlist.isSheetGood(sm) : (sm.category === 'sheet' && !!sm.sheet);
      if (!sheetGoods) continue;
      var trim = 0;
      try {
        var projSettings = (project && project.settings) || {};
        trim = num(projSettings.sheetTrim, st.sheetGoods.trim);
      } catch (e) { trim = 10; }
      var usableW = sm.sheet.width - 2 * trim;
      var usableH = sm.sheet.height - 2 * trim;
      var longSide = Math.max(sh.length, sh.width);
      var shortSide = Math.min(sh.length, sh.width);
      if (sh.grain === 'length') {
        if (longSide > usableH || shortSide > usableW) {
          W('error', 'Part does not fit the sheet with grain', sh.name + ' is ' + round(sh.length, 1) + ' × ' + round(sh.width, 1) + ' mm and cannot be cut from a ' + round(sm.sheet.width, 0) + ' × ' + round(sm.sheet.height, 0) + ' mm sheet (trim ' + trim + ' mm) with the grain along its length.', 'sheet.fit', 'Use a larger sheet, split the part, or rotate the grain.', [sh.id]);
        }
      } else if (longSide > Math.max(usableW, usableH) || shortSide > Math.min(usableW, usableH)) {
        W('error', 'Part does not fit the sheet', sh.name + ' is ' + round(sh.length, 1) + ' × ' + round(sh.width, 1) + ' mm and exceeds the usable sheet.', 'sheet.fit', 'Use a larger sheet or split the part.', [sh.id]);
      }
    }

    // ---- machining clash ---------------------------------------------------------------------
    var clashPurposes = { 'hinge-plate': 1, slide: 1, pull: 1 };
    var linePurposes = { 'shelf-pin': 1, confirmat: 1, dowel: 1, 'pocket-screw': 1 };
    for (i = 0; i < model.parts.length; i++) {
      var mp = model.parts[i];
      for (var a = 0; a < mp.machining.length; a++) {
        var ha = mp.machining[a];
        if (ha.type !== 'hole' || !clashPurposes[ha.purpose]) continue;
        for (var b2 = 0; b2 < mp.machining.length; b2++) {
          var hb = mp.machining[b2];
          if (hb.type !== 'hole' || !linePurposes[hb.purpose] || hb.face !== ha.face) continue;
          var dist = Math.sqrt((ha.x - hb.x) * (ha.x - hb.x) + (ha.y - hb.y) * (ha.y - hb.y));
          if (dist < 6 && dist > 0.6) {
            W('warning', 'Machining clash on the 32 mm line', mp.name + ': a ' + ha.purpose + ' hole is only ' + round(dist, 1) + ' mm from a ' + hb.purpose + ' hole.', 'machining.clash', 'Move the hinge/slide hole or use the system holes.', [mp.id]);
            a = mp.machining.length; // one warning per part is enough
            break;
          }
        }
      }
    }

    // ---- construction traps ------------------------------------------------------------------
    if (cfg.front.drawers.boxJoinery === 'butt-screw') {
      W('warning', 'Butt-screw drawer boxes in a kitchen', 'Screwed butt joints in drawer boxes loosen under daily use; dovetail, box joint or dowel is recommended.', 'construction.drawerJoinery', 'Use dovetail or box joints for kitchen drawers.', []);
    }
    if (cfg.construction.joinery === 'biscuit') {
      W('warning', 'Biscuits as the only carcass joint', 'Biscuits align but do not clamp a carcass on their own; add screws or a dado.', 'construction.biscuit', 'Use confirmats, dowels or a dado plus screws.', []);
    }
    if (cfg.front.type === 'drawer-stack' && cfg.toeKick.style !== 'none' && cfg.toeKick.height < num(st.toeKick.toeKickDrawerUsableHeight, 76.2)) {
      W('info', 'Toe-kick drawer space', 'A toe-kick drawer needs about ' + round(num(st.toeKick.toeKickDrawerUsableHeight, 76.2), 1) + ' mm of clear height; the kick is ' + round(cfg.toeKick.height, 1) + ' mm.', 'toeKick.drawer', 'Check the kick height if you plan a toe-kick drawer.', []);
    }

    // ---- finish compatibility ----------------------------------------------------------------
    var finishId = cfg.finish.id;
    var finishMaterialName = defaults.material(cfg.front.doors.material).name;
    if (finishId === 'stain-lacquer' && /MDF|melamine|particleboard/i.test(finishMaterialName)) {
      W('warning', 'Stain on a non-grain material', 'A stain finish shows no grain on ' + finishMaterialName + '; use paint or a factory finish.', 'finish.compatibility', 'Choose paint, or a veneered material for stain.', []);
    }
    if (finishId === 'hardwax-oil' && /melamine|particleboard/i.test(finishMaterialName)) {
      W('warning', 'Hardwax oil on melamine', 'Hardwax oil will not bond to a melamine face; use a bonding primer and paint.', 'finish.compatibility', 'Choose paint or lacquer.', []);
    }

    return uniquify(warnings);
  }

  // =============================================================================================
  // Project validation
  // =============================================================================================

  /**
   * Validate a resolved project: nesting failures, yield, catalogue gaps.
   * @param {Object} resolved engine output
   * @param {Object} project normalised project
   * @param {Object} standards resolved standards
   * @returns {Array} warnings
   */
  function validateProject(resolved, project, standards) {
    var st = standards || defaults.standards();
    var warnings = [];
    var i;
    function W(severity, title, message, rule, fix, cabinetTag) {
      warnings.push({
        id: rule, severity: severity, cabinetId: null, cabinetTag: cabinetTag || null,
        partIds: [], title: title, message: message, rule: rule, fix: fix
      });
    }

    // Nesting failures.
    for (i = 0; i < resolved.sheetLayouts.length; i++) {
      var layout = resolved.sheetLayouts[i];
      if (layout.unplaced && layout.unplaced.length > 0) {
        var labels = layout.unplaced.slice(0, 8).map(function (u) { return u.label; }).join(', ');
        W('error', 'Parts do not fit the sheet', layout.unplaced.length + ' part(s) of ' + layout.materialName + ' could not be nested: ' + labels + (layout.unplaced.length > 8 ? ', …' : '') + '.', 'sheet.nesting', 'Use a larger sheet, split the part, or check the sheet size settings.');
      }
    }

    // Yield.
    var yieldPct = resolved.cutList && resolved.cutList.totals ? resolved.cutList.totals.yieldPct : null;
    if (yieldPct !== null && yieldPct < 50 && resolved.cutList.totals.partCount > 10) {
      W('warning', 'Low sheet yield', 'Sheet yield is ' + yieldPct + '%; review part sizes or the sheet layout before ordering material.', 'sheet.yield', 'Re-arrange the cabinets or use a different sheet size.');
    } else if (yieldPct !== null && yieldPct < 70 && resolved.cutList.totals.partCount > 20) {
      W('info', 'Sheet yield below 70%', 'Sheet yield is ' + yieldPct + '%; normal for mixed runs but worth checking the nesting.', 'sheet.yield', 'Review the sheet layout page.');
    }

    // Catalogue gaps: materials/hardware the engine had to invent.
    var seenMaterial = {};
    for (i = 0; i < resolved.cabinets.length; i++) {
      for (var p = 0; p < resolved.cabinets[i].parts.length; p++) {
        var part = resolved.cabinets[i].parts[p];
        if (seenMaterial[part.materialId]) continue;
        seenMaterial[part.materialId] = true;
        var mat = defaults.material(part.materialId);
        if (mat._fallback) {
          W('warning', 'Material not in the catalogue', 'Material "' + part.materialId + '" is not in the researched catalogue; thickness was guessed and no finish/edgeband data is available.', 'catalogue.material', 'Add the material or pick a catalogue material.', resolved.cabinets[i].config.tag);
        }
      }
    }
    var seenHw = {};
    for (i = 0; i < resolved.hardware.length; i++) {
      var hw = resolved.hardware[i];
      if (seenHw[hw.templateId]) continue;
      seenHw[hw.templateId] = true;
      if (hw.templateId && defaults.hardware(hw.templateId)._fallback) {
        W('warning', 'Hardware not in the catalogue', 'Hardware "' + hw.templateId + '" is not in the researched catalogue.', 'catalogue.hardware', 'Add the hardware or pick a catalogue item.');
      }
    }

    // Cabinet count / tag sanity.
    var tags = {};
    for (i = 0; i < resolved.cabinets.length; i++) {
      var tag = resolved.cabinets[i].config.tag;
      if (tags[tag]) W('error', 'Duplicate cabinet tag', 'Cabinet tag "' + tag + '" is used more than once; part labels will collide.', 'project.duplicateTag', 'Rename the cabinets.', tag);
      tags[tag] = true;
    }
    if (resolved.cabinets.length === 0) {
      W('info', 'Project has no cabinets', 'Add cabinets to generate a cut list and plan set.', 'project.empty', 'Add a base cabinet.');
    }
    if (resolved.cabinets.length > 20) {
      W('info', 'Large project', 'Projects over 20 cabinets can take a while to render; export in batches if the preview slows down.', 'project.size', 'Split the run into stages.');
    }

    // Settings sanity.
    var settings = (project && project.settings) || {};
    if (num(settings.sheetTrim, st.sheetGoods.trim) < 5) {
      W('warning', 'Sheet trim too small', 'Trim is ' + num(settings.sheetTrim, st.sheetGoods.trim) + ' mm; 10 mm is usual to clean up factory edges.', 'sheet.trim', 'Use a 10 mm trim.');
    }
    if (num(settings.sheetKerf, st.sheetGoods.kerf) < 2) {
      W('warning', 'Kerf smaller than a saw blade', 'Kerf is set to ' + num(settings.sheetKerf, st.sheetGoods.kerf) + ' mm; most blades cut 3 mm.', 'sheet.kerf', 'Set the kerf to match the blade.');
    }
    return uniquify(warnings);
  }

  var api = {
    validateCabinet: validateCabinet,
    validateProject: validateProject,
    makeWarning: makeWarning
  };

  CS.engine = CS.engine || {};
  CS.engine.check = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
