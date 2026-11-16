/**
 * Cabinet Studio engine — cabinet resolution (contract §4 "Derived geometry semantics").
 *
 * `resolveCabinet(project, cabinet)` turns one cabinet configuration into a buildable model:
 * dimensions, parts with real placements and machining, hardware, front layout, openings, face
 * frame layout, warnings and stats. It is pure: inputs are never mutated, output is deterministic.
 *
 * Cabinet coordinate system: x right from the left side, y from the back toward the front (doors
 * sit beyond `depth`), z up from the floor. All millimetres.
 *
 * Construction decisions implemented here (and documented for the shop):
 *  - Base/tall height includes the toe kick; wall cabinets ignore the toe kick.
 *  - Frameless base cabinets use a front and rear top stretcher; wall/tall use a full top panel.
 *  - `rabbet`/`dado` backs are captured near the rear of full-depth structural panels; `applied`
 *    with `backRecess = 0` plants the back on the rear face (sides shortened by the back
 *    thickness); `applied` with `backRecess > 0` sets an interior-sized back forward of the rear
 *    edge, leaving a scribe lip.
 *  - Full-overlay fronts are sized from the overall cabinet face; inset fronts are derived from the
 *    physical opening (face-frame opening or frameless interior opening).
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var defaults = CS.engine && CS.engine.defaults;
  var P = CS.engine && CS.engine.parts;
  if (!defaults || !P) throw new Error('CabinetStudio engine load order: defaults.js and parts.js must load before cabinet.js');

  var U = defaults.util;
  var num = U.num, clamp = U.clamp, round = U.round, isFinitePositive = U.isFinitePositive, isObject = U.isObject;
  var GROUPS = P.GROUPS;

  var SLIDE_CLEARANCE = { undermount: 42, 'side-mount': 25, 'center-mount': 50 };
  var SLIDE_REAR_CLEARANCE = { undermount: 15, 'side-mount': 5, 'center-mount': 5 };

  // =============================================================================================
  // Dimensions
  // =============================================================================================

  /**
   * Resolve every derived dimension for a cabinet.
   * @returns {Object} dims (all mm, documented inline)
   */
  function computeDims(cfg, standards) {
    var c = cfg.construction;
    var W = round(cfg.width, 2);
    var H = round(cfg.height, 2);
    var D = round(cfg.depth, 2);
    var t = round(c.carcassThickness, 2);
    var isFaceFrame = c.system === 'faceframe';
    var ffT = isFaceFrame ? round(cfg.faceFrame.thickness, 2) : 0;
    var type = cfg.type;
    var isWall = type === 'wall';
    var kick = cfg.toeKick;
    var style = kick.style;
    var hasKick = !isWall && style !== 'none' && style !== 'flush-base' && kick.height > 0;
    var kickHeight = hasKick ? round(kick.height, 2) : 0;

    // z layout
    var boxBottom = isWall ? 0 : kickHeight;
    var carcassHeight = round(H - boxBottom, 2);
    var boxTop = H;
    var interiorBottomZ = round(boxBottom + t, 2);       // top face of the bottom panel
    var interiorTopZ = round(boxTop - t, 2);             // underside of top panel / stretchers
    var interiorHeight = round(interiorTopZ - interiorBottomZ, 2);
    var frontBottomZ = boxBottom;                        // bottom of the front region
    var frontHeight = round(H - frontBottomZ, 2);
    var frontTopZ = H;

    // y layout: overall depth D includes the face frame (front of the cabinet), not the fronts.
    var cabinetFrontY = D;                               // finished front plane of the box/frame
    var frontY = round(D - ffT, 2);                      // structural carcass front plane
    var carcassDepth = frontY;
    var backT = round(c.backThickness, 2);
    var backStyle = c.backStyle;
    var backRecess = round(c.backRecess, 2);
    var hasBack = backStyle !== 'none' && backT > 0;
    var appliedOuter = hasBack && backStyle === 'applied' && backRecess <= 0.01;
    var structuralRearY = appliedOuter ? backT : 0;
    var backY0 = hasBack ? (backStyle === 'applied' ? (appliedOuter ? 0 : backRecess) : backStyle === 'rabbet' ? 0 : backRecess) : 0;
    var backY1 = round(backY0 + backT, 2);
    var interiorRearY = hasBack ? backY1 : 0;
    var sideDepth = round(frontY - structuralRearY, 2);
    var interiorDepth = round(frontY - interiorRearY, 2);
    var interiorWidth = round(W - 2 * t, 2);
    var sidePanelHeight = corpseHeightForStyle(style, isWall, carcassHeight, H);
    var sidePanelZ0 = style === 'notched-sides' && !isWall ? 0 : boxBottom;

    // Vertical run of the back panel depends on the top structure.
    var backPanel = null;
    if (hasBack) {
      var bpZ0, bpH, bpW;
      if (appliedOuter) {
        // Applied across the full rear: full cabinet width and box height.
        bpW = W;
        bpH = carcassHeight;
        bpZ0 = boxBottom;
      } else if (backStyle === 'applied') {
        bpW = interiorWidth;
        bpH = interiorHeight;
        bpZ0 = interiorBottomZ;
      } else if (backStyle === 'rabbet') {
        bpW = round(interiorWidth + 2 * backT, 2);
        bpZ0 = round(boxBottom + t, 2);
        bpH = round(carcassHeight - t - (isWall ? t : 0), 2);
      } else { // dado
        var dadoD = c.dadoDepth;
        bpW = round(interiorWidth + 2 * dadoD, 2);
        bpZ0 = round(boxBottom + t - dadoD, 2);
        bpH = round((isWall ? boxTop - t + dadoD : boxTop) - bpZ0, 2);
      }
      backPanel = { w: bpW, h: bpH, y0: backY0, z0: bpZ0 };
    }

    var dims = {
      width: W, height: H, depth: D,
      type: type, isWall: isWall,
      system: c.system, isFaceFrame: isFaceFrame,
      carcassThickness: t,
      faceFrameThickness: ffT,
      carcassWidth: W,
      carcassHeight: carcassHeight,
      carcassDepth: carcassDepth,
      carcassTopZ: boxTop,
      carcassBottomZ: boxBottom,
      sideDepth: sideDepth,
      sidePanelHeight: sidePanelHeight,
      sidePanelZ0: sidePanelZ0,
      interiorWidth: interiorWidth,
      interiorHeight: interiorHeight,
      interiorDepth: interiorDepth,
      interiorBottomZ: interiorBottomZ,
      interiorTopZ: interiorTopZ,
      interiorRearY: interiorRearY,
      frontY: frontY,
      rearY: structuralRearY,
      structuralFrontY: frontY,
      cabinetFrontY: cabinetFrontY,
      frontHeight: frontHeight,
      frontWidth: W,
      frontBottomZ: frontBottomZ,
      frontTopZ: frontTopZ,
      toeKickHeight: kickHeight,
      toeKickSetback: style === 'none' || style === 'flush-base' ? 0 : round(kick.setback, 2),
      toeKickStyle: style,
      hasToeKick: hasKick,
      boxBottomZ: boxBottom,
      boxTopZ: boxTop,
      bottomThickness: t,
      topStructureHeight: t,
      backThickness: backT,
      backStyle: backStyle,
      backRecess: backRecess,
      backY0: backY0,
      backY1: backY1,
      backPanel: backPanel,
      hasBack: hasBack,
      reveal: cfg.front.reveal,
      doorThickness: cfg.front.doors.thickness,
      drawerFrontThickness: cfg.front.drawers.thickness,
      shelfThickness: cfg.interior.shelfThickness,
      leftInnerX: t,
      rightInnerX: round(W - t, 2),
      // names used by parts.js helpers (mapping ignores the normal-axis coordinate, but keep the
      // physical values honest so callers cannot mislead themselves).
      carcassLeftX: 0,
      carcassRightX: round(W - t, 2)
    };
    if (dims.interiorWidth <= 40) dims.interiorWidth = Math.max(dims.interiorWidth, 0);
    return dims;
  }

  function corpseHeightForStyle(style, isWall, carcassHeight, H) {
    return style === 'notched-sides' && !isWall ? round(H, 2) : carcassHeight;
  }

  // =============================================================================================
  // Front layout
  // =============================================================================================

  function minFrontHeight(standards) {
    return (standards && standards.drawer ? standards.drawer.minFrontHeight : 90);
  }

  /**
   * Auto drawer-front heights for a front region (top-down). Contract rule: for 3+ stacks the top
   * drawer is min(180, 25% of the region), the rest split evenly; minimum 90 mm.
   *
   * @param {number} regionHeight height of the front region (mm)
   * @param {number} count number of drawer fronts
   * @param {Object} standards resolved standards
   * @returns {{heights:number[], error:boolean, rest:number}}
   */
  function autoDrawerHeights(regionHeight, count, standards) {
    var st = standards || defaults.standards();
    var dr = st.drawer;
    var n = Math.max(1, Math.round(count));
    var rowH = Math.max(1, regionHeight); // caller passes the region already net of reveals
    var heights = [];
    var minH = dr.minFrontHeight;
    if (n >= 3) {
      var top = Math.min(dr.topDrawerMax, dr.topDrawerRatio * rowH);
      var rest = (rowH - top) / (n - 1);
      heights.push(round(top, 1));
      for (var i = 1; i < n; i++) heights.push(round(rest, 1));
      if (rest < minH) heights = fillEqual(rowH, n);
    } else {
      heights = fillEqual(rowH, n);
    }
    var error = false;
    for (var j = 0; j < heights.length; j++) {
      if (heights[j] < minH) { error = true; break; }
    }
    if (error) {
      // Keep going with equal heights (still positive) so the caller can warn honestly.
      heights = fillEqual(rowH, n);
      for (var k = 0; k < heights.length; k++) if (heights[k] < 30) heights[k] = 30;
    }
    // Absorb rounding into the last row so the sum is exact.
    var sum = 0;
    for (var s = 0; s < heights.length - 1; s++) { heights[s] = round(heights[s], 1); sum += heights[s]; }
    heights[heights.length - 1] = round(rowH - sum, 1);
    return { heights: heights, error: error, region: rowH };
  }

  function fillEqual(total, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(total / n);
    return out;
  }

  function overlayRowHeights(cfg, dims, standards, warnings) {
    var reveal = cfg.front.reveal;
    var frontHeight = dims.frontHeight;
    var dr = standards.drawer;
    var type = cfg.front.type;
    var rows = [];
    if (type === 'doors' || type === 'open') {
      if (type === 'open') return { rows: [], error: false };
      rows.push({ role: 'doors', kind: 'doors', z: round(dims.frontBottomZ + reveal, 2), h: round(frontHeight - 2 * reveal, 2) });
      return { rows: rows, error: false };
    }
    if (type === 'drawer-stack') {
      var n = cfg.front.drawers.count;
      var region = frontHeight - (n + 1) * reveal;
      if (region <= n * dr.minFrontHeight) {
        warnings.push(warnObj(cfg, 'error', 'Drawer stack does not fit',
          'The front region (' + round(frontHeight, 1) + ' mm) cannot hold ' + n + ' drawer fronts with ' + reveal + ' mm reveals at the ' + dr.minFrontHeight + ' mm minimum height.',
          'front.drawers.fit', 'Reduce the drawer count, raise the cabinet, or lower the toe kick.'));
      }
      if (cfg.front.drawers.heights) {
        var heights = cfg.front.drawers.heights.slice();
        var sum = heights.reduce(function (a, b) { return a + b; }, 0);
        if (sum + (n + 1) * reveal > frontHeight + 0.01) {
          warnings.push(warnObj(cfg, 'error', 'Drawer heights exceed the front',
            'Custom drawer heights total ' + round(sum, 1) + ' mm, which does not fit the ' + round(frontHeight, 1) + ' mm front region.',
            'front.drawers.heights', 'Reduce the custom heights or the drawer count.'));
        }
        var cursor0 = dims.frontTopZ - reveal;
        for (var i = 0; i < heights.length; i++) {
          var z = round(cursor0 - heights[i], 2);
          rows.push({ role: 'drawer-' + i, kind: 'drawer', z: z, h: round(heights[i], 2) });
          cursor0 = z - reveal;
        }
      } else {
        var auto = autoDrawerHeights(region, n, standards);
        if (auto.error) {
          warnings.push(warnObj(cfg, 'error', 'Drawer fronts too short',
            'With ' + n + ' drawers the auto heights fall below the ' + standards.drawer.minFrontHeight + ' mm minimum (' + round(region / n, 1) + ' mm each).',
            'front.drawers.fit', 'Reduce the drawer count or make the cabinet taller.'));
        }
        var cursor = dims.frontTopZ - reveal;
        for (var d = 0; d < auto.heights.length; d++) {
          var dz = round(cursor - auto.heights[d], 2);
          rows.push({ role: 'drawer-' + d, kind: 'drawer', z: dz, h: auto.heights[d] });
          cursor = dz - reveal;
        }
      }
      return { rows: rows, error: false };
    }
    if (type === 'door-drawer') {
      var drawerH = clamp(cfg.front.combined.drawerHeight, standards.drawer.minFrontHeight, frontHeight - 3 * reveal - standards.drawer.minFrontHeight);
      var doorH = round(frontHeight - 3 * reveal - drawerH, 2);
      if (doorH < standards.drawer.minFrontHeight) {
        warnings.push(warnObj(cfg, 'error', 'Drawer/doors do not fit', 'The combined drawer and door fronts do not fit the front region.', 'front.doorDrawer.fit', 'Reduce the drawer height or the doors below.'));
      }
      var topZ = round(dims.frontTopZ - reveal, 2);
      rows.push({ role: 'drawer-0', kind: 'drawer', z: round(topZ - drawerH, 2), h: round(drawerH, 2) });
      rows.push({ role: 'doors', kind: 'doors', z: round(dims.frontBottomZ + reveal, 2), h: doorH });
      return { rows: rows, error: false };
    }
    return { rows: rows, error: false };
  }

  /** Distribute `total` into `n` drawer opening heights (inset fronts). */
  function autoOpeningHeights(total, n, standards) {
    var minH = standards.drawer.minFrontHeight;
    var heights;
    if (n >= 3) {
      var top = Math.min(standards.drawer.topDrawerMax + 8, 0.25 * total);
      var rest = (total - top) / (n - 1);
      if (rest < minH) heights = fillEqual(total, n);
      else { heights = [top]; for (var i = 1; i < n; i++) heights.push(rest); }
    } else {
      heights = fillEqual(total, n);
    }
    var sum = 0;
    for (var j = 0; j < heights.length - 1; j++) { heights[j] = round(heights[j], 1); sum += heights[j]; }
    heights[heights.length - 1] = round(total - sum, 1);
    return heights;
  }

  /**
   * Compute the complete front plan: rows, front rectangles, openings, face-frame rail positions.
   * @returns {Object} plan
   */
  function computeFrontPlan(cfg, dims, standards, warnings) {
    var reveal = cfg.front.reveal;
    var type = cfg.front.type;
    var isFaceFrame = dims.isFaceFrame;
    var ff = cfg.faceFrame;
    var overlay = cfg.front.doors.overlay === 'full';
    var plan = { rows: [], leaves: [], drawerFronts: [], openings: [], faceFrame: null, overlay: overlay };
    var i;

    if (type === 'open') {
      var openRect = isFaceFrame
        ? { x: ff.stileWidth, z: dims.boxBottomZ + ff.bottomRailWidth, w: dims.width - 2 * ff.stileWidth, h: dims.carcassHeight - ff.bottomRailWidth - ff.topRailWidth }
        : { x: dims.carcassThickness, z: dims.interiorBottomZ, w: dims.interiorWidth, h: dims.interiorHeight };
      plan.openings.push({
        role: 'open',
        x: openRect.x, y: openRect.z, width: Math.max(0, openRect.w), height: Math.max(0, openRect.h),
        doors: [], drawer: null
      });
      if (isFaceFrame) plan.faceFrame = faceFrameRails(cfg, dims, [{ role: 'open', kind: 'open', z: openRect.z, h: openRect.h }], warnings);
      return plan;
    }

    if (isFaceFrame && !overlay) {
      // Inset in a face frame: rails and openings are the primary geometry.
      var ffLayout = insetFaceFrameLayout(cfg, dims, standards, warnings);
      plan.faceFrame = ffLayout.faceFrame;
      for (i = 0; i < ffLayout.rows.length; i++) plan.rows.push(ffLayout.rows[i]);
    } else if (isFaceFrame && overlay) {
      var overlayLayout = overlayRowHeights(cfg, dims, standards, warnings);
      plan.rows = overlayLayout.rows;
      plan.faceFrame = faceFrameRails(cfg, dims, plan.rows, warnings);
    } else if (overlay) {
      var o2 = overlayRowHeights(cfg, dims, standards, warnings);
      plan.rows = o2.rows;
    } else {
      // Frameless inset: split the interior opening into row zones and warn about dividers.
      var insetLayout = framelessInsetLayout(cfg, dims, standards, warnings);
      plan.rows = insetLayout.rows;
    }

    // Now build the actual front rectangles for every row.
    for (i = 0; i < plan.rows.length; i++) {
      var row = plan.rows[i];
      if (row.kind === 'doors') {
        buildDoorRow(cfg, dims, plan, row, warnings);
      } else if (row.kind === 'drawer') {
        buildDrawerRow(cfg, dims, plan, row, warnings);
      }
    }

    // Annotation openings: one per row (structural x bounds; y = vertical from the floor).
    for (i = 0; i < plan.rows.length; i++) {
      var r = plan.rows[i];
      var openingX = isFaceFrame ? ff.stileWidth : dims.carcassThickness;
      var openingW = isFaceFrame ? dims.width - 2 * ff.stileWidth : dims.interiorWidth;
      var rowDoors = [];
      if (r.kind === 'doors') {
        for (var li = 0; li < plan.leaves.length; li++) if (plan.leaves[li].role === r.role) rowDoors.push(plan.leaves[li].label);
      }
      var drawerLabel = null;
      if (r.kind === 'drawer') {
        for (var di = 0; di < plan.drawerFronts.length; di++) if (plan.drawerFronts[di].role === r.role) drawerLabel = plan.drawerFronts[di].label;
      }
      plan.openings.push({
        role: r.role,
        x: openingX, y: r.z, width: openingW, height: r.h,
        doors: rowDoors,
        drawer: drawerLabel ? { label: drawerLabel } : null
      });
    }
    return plan;
  }

  function buildDoorRow(cfg, dims, plan, row, warnings) {
    var reveal = cfg.front.reveal;
    var count = Math.max(1, Math.round(cfg.front.doors.count));
    var opening;
    if (plan.overlay) {
      var spanW = dims.width - 2 * reveal;
      var leafW = (spanW - (count - 1) * reveal) / count;
      opening = null;
      for (var i = 0; i < count; i++) {
        var rect = {
          x: round(reveal + i * (leafW + reveal), 2),
          z: row.z,
          w: round(leafW, 2),
          h: row.h
        };
        plan.leaves.push({
          role: row.role, kind: 'door', rect: rect,
          hingeSide: hingeSideFor(cfg, i, count), leafIndex: i
        });
      }
    } else {
      opening = row.opening || framelessInsetOpening(dims);
      var innerW = opening.w - 2 * reveal - (count - 1) * reveal;
      var lw = innerW / count;
      if (lw < 60) {
        warnings.push(warnObj(cfg, 'warning', 'Door leaves narrow', 'The door row leaves are only ' + round(lw, 1) + ' mm wide; check the hinge choice.', 'door.minWidth', 'Use fewer doors or a wider cabinet.'));
      }
      for (var j = 0; j < count; j++) {
        var rect2 = {
          x: round(opening.x + reveal + j * (lw + reveal), 2),
          z: round(opening.z + reveal, 2),
          w: round(lw, 2),
          h: round(opening.h - 2 * reveal, 2)
        };
        plan.leaves.push({
          role: row.role, kind: 'door', rect: rect2,
          hingeSide: hingeSideFor(cfg, j, count), leafIndex: j
        });
      }
    }
  }

  function buildDrawerRow(cfg, dims, plan, row, warnings) {
    var reveal = cfg.front.reveal;
    var rect;
    if (plan.overlay) {
      rect = { x: round(reveal, 2), z: row.z, w: round(dims.width - 2 * reveal, 2), h: row.h };
    } else {
      var opening = row.opening || framelessInsetOpening(dims);
      rect = {
        x: round(opening.x + reveal, 2), z: round(opening.z + reveal, 2),
        w: round(opening.w - 2 * reveal, 2), h: round(opening.h - 2 * reveal, 2)
      };
    }
    if (rect.w <= 0 || rect.h <= 0) {
      warnings.push(warnObj(cfg, 'error', 'Drawer front too small', 'A drawer front resolved to an impossible size (' + round(rect.w, 1) + ' × ' + round(rect.h, 1) + ' mm).', 'front.drawer.minSize', 'Increase the cabinet size or reduce rails/reveals.'));
      rect.w = Math.max(rect.w, 1);
      rect.h = Math.max(rect.h, 1);
    }
    plan.drawerFronts.push({ role: row.role, kind: 'drawer-front', rect: rect });
  }

  function hingeSideFor(cfg, index, count) {
    if (count === 1) return cfg.front.doors.hingeSide === 'auto' ? 'left' : cfg.front.doors.hingeSide;
    // Paired/multi-leaf rows: the outer leaves hinge to their outside edges.
    return index % 2 === 0 ? 'left' : 'right';
  }

  function framelessInsetOpening(dims) {
    return { x: dims.carcassThickness, z: dims.interiorBottomZ, w: dims.interiorWidth, h: dims.interiorHeight };
  }

  /** Face-frame rail plan for overlay fronts: just top/bottom rails plus mid rails at row gaps. */
  function faceFrameRails(cfg, dims, rows, warnings) {
    var ff = cfg.faceFrame;
    var reveal = cfg.front.reveal;
    var rails = [];
    var bottomZ = dims.boxBottomZ;
    var topZ = dims.boxTopZ;
    rails.push({ name: 'Face frame, bottom rail', role: 'bottom', z0: round(bottomZ, 2), h: round(ff.bottomRailWidth, 2) });
    rails.push({ name: 'Face frame, top rail', role: 'top', z0: round(topZ - ff.topRailWidth, 2), h: round(ff.topRailWidth, 2) });
    // Mid rails centred on each row gap (top-down rows input).
    for (var i = 1; i < rows.length; i++) {
      var upper = rows[i - 1];
      var boundary = upper.z - reveal / 2;
      var z0 = round(boundary - ff.midRailWidth / 2, 2);
      var bottomRailTop = bottomZ + ff.bottomRailWidth;
      var topRailBottom = topZ - ff.topRailWidth;
      if (z0 + ff.midRailWidth > topRailBottom + 0.1 || z0 < bottomRailTop - 0.1) {
        warnings.push(warnObj(cfg, 'warning', 'Face-frame mid rail does not fit', 'The mid rail behind row ' + i + ' overlaps the top or bottom rail.', 'faceFrame.midRail', 'Reduce the rail width or adjust the fronts.'));
      }
      rails.push({ name: 'Face frame, mid rail ' + i, role: 'mid', z0: z0, h: round(ff.midRailWidth, 2) });
    }
    return {
      stileWidth: ff.stileWidth, thickness: ff.thickness,
      rails: rails, stileCount: 2, midRailCount: Math.max(0, rows.length - 1)
    };
  }

  /** Face-frame layout for inset fronts: rails and openings are solved together. */
  function insetFaceFrameLayout(cfg, dims, standards, warnings) {
    var ff = cfg.faceFrame;
    var reveal = cfg.front.reveal;
    var type = cfg.front.type;
    var topRail = ff.topRailWidth, bottomRail = ff.bottomRailWidth, midRail = ff.midRailWidth;
    var base = dims.boxBottomZ;
    var top = dims.boxTopZ;
    var rowsIn = [];
    var openings = [];
    var midCount = 0;
    if (type === 'doors') {
      openings.push({ z: round(base + bottomRail, 2), h: round(dims.carcassHeight - bottomRail - topRail, 2) });
    } else if (type === 'drawer-stack') {
      var n = cfg.front.drawers.count;
      midCount = n - 1;
      var avail = dims.carcassHeight - bottomRail - topRail - midCount * midRail;
      var hs = autoOpeningHeights(avail, n, standards);
      for (var i = 0; i < n; i++) openings.push({ z: 0, h: hs[i] });
    } else if (type === 'door-drawer') {
      midCount = 1;
      var avail2 = dims.carcassHeight - bottomRail - topRail - midRail;
      var wantDrawer = clamp(cfg.front.combined.drawerHeight + 2 * reveal, standards.drawer.minFrontHeight + 2 * reveal, avail2 - (standards.drawer.minFrontHeight + 2 * reveal) - 150);
      var drawerOpening = Math.round(wantDrawer * 10) / 10;
      openings.push({ z: 0, h: drawerOpening });               // top row: drawer
      openings.push({ z: 0, h: round(avail2 - drawerOpening, 2) }); // bottom row: doors
    }
    // Lay out top-down: top rail at the top, then each opening, then a mid rail, ... bottom rail.
    var cursor = round(top - topRail, 2);
    var rails = [{ name: 'Face frame, top rail', role: 'top', z0: round(top - topRail, 2), h: topRail }];
    for (var o = 0; o < openings.length; o++) {
      openings[o].z = round(cursor - openings[o].h, 2);
      cursor = round(openings[o].z, 2);
      if (o < openings.length - 1) {
        var mz = round(cursor - midRail, 2);
        rails.push({ name: 'Face frame, mid rail ' + (o + 1), role: 'mid', z0: mz, h: midRail });
        cursor = mz;
      }
    }
    var bottomH = round(cursor - base, 2);
    if (Math.abs(bottomH - bottomRail) > 0.1) {
      // Absorb residual in the bottom rail so the frame fits exactly.
      bottomH = round(bottomH, 2);
    }
    rails.push({ name: 'Face frame, bottom rail', role: 'bottom', z0: round(base, 2), h: bottomH });
    rails.sort(function (a, b) { return b.z0 - a.z0; }); // keep top-down order for the model

    var faceFrame = {
      stileWidth: ff.stileWidth, thickness: ff.thickness,
      rails: rails, stileCount: 2, midRailCount: midCount
    };
    // Rows for front generation: openings are top-down; roles follow the front type.
    var k;
    if (type === 'doors') {
      rowsIn.push({ role: 'doors', kind: 'doors', z: openings[0].z, h: openings[0].h, opening: { x: ff.stileWidth, z: openings[0].z, w: dims.width - 2 * ff.stileWidth, h: openings[0].h } });
    } else if (type === 'drawer-stack') {
      for (k = 0; k < openings.length; k++) {
        rowsIn.push({
          role: 'drawer-' + k, kind: 'drawer', z: openings[k].z, h: openings[k].h,
          opening: { x: ff.stileWidth, z: openings[k].z, w: dims.width - 2 * ff.stileWidth, h: openings[k].h }
        });
      }
    } else if (type === 'door-drawer') {
      rowsIn.push({ role: 'drawer-0', kind: 'drawer', z: openings[0].z, h: openings[0].h, opening: { x: ff.stileWidth, z: openings[0].z, w: dims.width - 2 * ff.stileWidth, h: openings[0].h } });
      rowsIn.push({ role: 'doors', kind: 'doors', z: openings[1].z, h: openings[1].h, opening: { x: ff.stileWidth, z: openings[1].z, w: dims.width - 2 * ff.stileWidth, h: openings[1].h } });
    }
    return { faceFrame: faceFrame, rows: rowsIn, openings: openings };
  }

  /** Frameless inset: no rails exist, so rows are front zones inside the interior opening. */
  function framelessInsetLayout(cfg, dims, standards, warnings) {
    var reveal = cfg.front.reveal;
    var type = cfg.front.type;
    var opening = framelessInsetOpening(dims);
    var rows = [];
    if (type === 'doors') {
      rows.push({ role: 'doors', kind: 'doors', z: opening.z + reveal, h: opening.h - 2 * reveal, opening: opening });
    } else if (type === 'drawer-stack') {
      var n = cfg.front.drawers.count;
      warnings.push(warnObj(cfg, 'warning', 'Frameless inset drawer stack',
        'A frameless cabinet has no rails between inset drawer fronts; the gaps will show the carcass interior unless you add applied rails or dividers.',
        'front.framelessInset', 'Add a face frame, applied rails, or use overlay drawers.'));
      var region = opening.h - (n + 1) * reveal;
      var auto = autoDrawerHeights(region, n, standards);
      var cursor = opening.z + opening.h - reveal;
      for (var i = 0; i < n; i++) {
        rows.push({ role: 'drawer-' + i, kind: 'drawer', z: round(cursor - auto.heights[i], 2), h: auto.heights[i], opening: opening });
        cursor = rows[rows.length - 1].z - reveal;
      }
    } else if (type === 'door-drawer') {
      warnings.push(warnObj(cfg, 'warning', 'Frameless inset door/drawer stack',
        'A frameless cabinet has no rails between the inset drawer front and the doors; add applied rails or dividers.',
        'front.framelessInset', 'Add a face frame or applied rails.'));
      var drawerH = clamp(cfg.front.combined.drawerHeight, standards.drawer.minFrontHeight, opening.h - 3 * reveal - 150);
      rows.push({ role: 'drawer-0', kind: 'drawer', z: round(opening.z + opening.h - reveal - drawerH, 2), h: drawerH, opening: opening });
      rows.push({ role: 'doors', kind: 'doors', z: opening.z + reveal, h: round(opening.h - 3 * reveal - drawerH, 2), opening: opening });
    }
    return { rows: rows };
  }

  function warnObj(cfg, severity, title, message, rule, fix) {
    return {
      id: '', severity: severity, cabinetId: cfg.id, cabinetTag: cfg.tag, partIds: [],
      title: title, message: message, rule: rule || 'geometry', fix: fix || ''
    };
  }

  // =============================================================================================
  // Carcass
  // =============================================================================================

  function buildCarcass(ctx, dims) {
    var cfg = ctx.config;
    var c = cfg.construction;
    var t = dims.carcassThickness;
    var out = { shelves: { fixed: [], adjustable: [] }, back: null, topParts: [] };

    var sideOpts = {
      group: GROUPS.CARCASS, materialId: c.carcassMaterial, thickness: t,
      edges: dims.system === 'frameless' ? ['front'] : [],
      edgebandId: c.edgeBanding, grain: 'length'
    };
    var left = P.panelPart(ctx, {
      key: 'side-left', name: 'Left side panel', normal: [1, 0, 0],
      box: P.makeBox(0, dims.rearY, dims.sidePanelZ0, t, dims.sideDepth, dims.sidePanelHeight),
      faceA: 'Interior face', note: 'Front edge is at the right of face A',
      materialId: sideOpts.materialId, thickness: t, edges: sideOpts.edges, grain: 'length',
      cutListGroup: 'side', group: GROUPS.CARCASS, edgebandId: c.edgeBanding,
      joinery: carcassJoineryNotes(c),
      machining: function (o) { return sideMachining(o, 'left', ctx, dims); }
    });
    var right = P.panelPart(ctx, {
      key: 'side-right', name: 'Right side panel', normal: [-1, 0, 0],
      box: P.makeBox(dims.width - t, dims.rearY, dims.sidePanelZ0, t, dims.sideDepth, dims.sidePanelHeight),
      faceA: 'Interior face', note: 'Front edge is at the right of face A',
      materialId: sideOpts.materialId, thickness: t, edges: sideOpts.edges, grain: 'length',
      cutListGroup: 'side', group: GROUPS.CARCASS, edgebandId: c.edgeBanding,
      joinery: carcassJoineryNotes(c),
      machining: function (o) { return sideMachining(o, 'right', ctx, dims); }
    });
    out.sideLeft = left.part;
    out.sideRight = right.part;

    // Bottom panel between the sides.
    var bottomPart = P.panelPart(ctx, {
      key: 'bottom', name: 'Bottom panel', normal: [0, 0, 1],
      box: P.makeBox(t, dims.rearY, dims.boxBottomZ, dims.interiorWidth, dims.sideDepth, t),
      faceA: 'Top face (interior)', note: 'Top edge of face A is the back of the cabinet',
      materialId: c.carcassMaterial, thickness: t, edges: ['front'], grain: 'length',
      cutListGroup: 'bottom', group: GROUPS.CARCASS, edgebandId: c.edgeBanding,
      machining: function (o) { return horizontalBackMachining(o, ctx, dims, 'Bottom panel'); }
    });
    out.bottom = bottomPart.part;

    if (dims.isWall || cfg.type === 'tall' || cfg.type === 'pantry') {
      // Full top panel.
      var topPart = P.panelPart(ctx, {
        key: 'top', name: 'Top panel', normal: [0, 0, -1],
        box: P.makeBox(t, dims.rearY, dims.boxTopZ - t, dims.interiorWidth, dims.sideDepth, t),
        faceA: 'Bottom face (interior)', note: 'Top edge of face A is the back of the cabinet',
        materialId: c.carcassMaterial, thickness: t, edges: ['front'], grain: 'length',
        cutListGroup: 'top', group: GROUPS.CARCASS, edgebandId: c.edgeBanding,
        machining: function (o) { return horizontalBackMachining(o, ctx, dims, 'Top panel'); }
      });
      out.top = topPart.part;
      out.topParts.push(topPart.part);
    } else {
      // Base cabinet: front and rear top stretchers (18 × 100 mm by default).
      var st = ctx.standards;
      var sd = Math.min(st.carcass.topStretcherDepth, dims.sideDepth - dims.backY1 - 20);
      if (!(sd > 20)) sd = Math.max(20, dims.sideDepth / 3);
      var frontStretcher = P.panelPart(ctx, {
        key: 'top-stretcher-front', name: 'Top stretcher, front', normal: [0, 0, -1],
        box: P.makeBox(t, dims.frontY - sd, dims.boxTopZ - t, dims.interiorWidth, sd, t),
        faceA: 'Bottom face (interior)', note: 'Top edge of face A is the front of the cabinet',
        materialId: c.carcassMaterial, thickness: t, edges: [], grain: 'length',
        cutListGroup: 'stretcher', group: GROUPS.CARCASS, edgebandId: 'none'
      });
      var rearStretcher = P.panelPart(ctx, {
        key: 'top-stretcher-rear', name: 'Top stretcher, rear', normal: [0, 0, -1],
        box: P.makeBox(t, dims.interiorRearY, dims.boxTopZ - t, dims.interiorWidth, sd, t),
        faceA: 'Bottom face (interior)', note: 'Top edge of face A is the back of the cabinet',
        materialId: c.carcassMaterial, thickness: t, edges: [], grain: 'length',
        cutListGroup: 'stretcher', group: GROUPS.CARCASS, edgebandId: 'none'
      });
      out.topParts.push(frontStretcher.part, rearStretcher.part);
      out.frontStretcher = frontStretcher.part;
      out.rearStretcher = rearStretcher.part;
    }

    // Back panel.
    if (dims.hasBack && dims.backPanel) {
      var bp = dims.backPanel;
      var backEdges = 'none';
      if (c.backStyle === 'applied' && c.backRecess > 0.01) {
        // Inset applied back: interior sized, screwed through the sides/bottom.
        backEdges = [];
      }
      var back = P.panelPart(ctx, {
        key: 'back', name: 'Back panel', normal: [0, -1, 0],
        box: P.makeBox(round((dims.width - bp.w) / 2, 2), bp.y0, bp.z0, bp.w, dims.backThickness, bp.h),
        faceA: 'Rear face', note: '',
        materialId: c.backMaterial, thickness: dims.backThickness, edges: backEdges, grain: 'length',
        cutListGroup: 'back', group: GROUPS.BACK, edgebandId: 'none',
        notes: [c.backStyle === 'applied' && c.backRecess > 0.01
          ? 'Applied back set in ' + round(c.backRecess, 1) + ' mm from the rear edge (scribe lip)'
          : c.backStyle === 'rabbet' ? 'Back captured in ' + round(dims.backThickness, 1) + ' mm rear rabbets'
            : c.backStyle === 'dado' ? 'Back captured in ' + round(c.dadoDepth, 1) + ' mm dados, ' + round(c.backRecess, 1) + ' mm in from the rear edge'
              : 'Back applied to the rear face']
      });
      out.back = back.part;
    }

    // Shelves.
    buildShelves(ctx, dims, out);
    return out;
  }

  function carcassJoineryNotes(c) {
    return [{ id: c.joinery, note: joineryNote(c.joinery) }];
  }

  function joineryNote(id) {
    switch (id) {
      case 'confirmat': return 'Confirmat screws: 3 per joint, 64 mm from the ends and centred';
      case 'pocket-screw': return 'Pocket screws: 3 per joint, 15° pockets on the concealed side';
      case 'dado-screw': return 'Dados plus screws: 2 screws per joint, glue the dado';
      case 'dowel': return 'Dowels: 3 per joint with glue, clamp square';
      case 'biscuit': return 'Biscuits plus glue: 3 per joint, clamp square';
      case 'butt-screw': return 'Butt joint plus glue and screws: 3 per joint, pre-drill';
      default: return 'Glue and fasten per shop standard';
    }
  }

  function sideMachining(o, side, ctx, dims) {
    var cfg = ctx.config;
    var c = cfg.construction;
    var t = dims.carcassThickness;
    var mach = [];
    var innerX = side === 'left' ? dims.carcassThickness : dims.width - dims.carcassThickness;
    var phys = function (y, z) { return { x: innerX, y: y, z: z }; };

    // Back connection: rabbet or dado.
    if (dims.hasBack) {
      if (c.backStyle === 'rabbet') {
        var e = o.edgeToDrawing('back', 'A');
        if (e) mach.push(P.rabbet('A', e, dims.backThickness, dims.backThickness, 'back', 'Rear rabbet for ' + round(dims.backThickness, 1) + ' mm back'));
      } else if (c.backStyle === 'dado') {
        var yc = dims.backY0 + dims.backThickness / 2;
        var bz0 = dims.backPanel ? dims.backPanel.z0 : dims.boxBottomZ;
        var bz1 = dims.backPanel ? dims.backPanel.z0 + dims.backPanel.h : dims.boxTopZ;
        var p1 = o.at(phys(yc, bz0 + 1));
        var p2 = o.at(phys(yc, bz1 - 1));
        mach.push(P.groove('A', Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.max(p1.x, p2.x), Math.max(p1.y, p2.y), dims.backThickness, c.dadoDepth, 'back', 'Back dado, ' + round(c.backRecess, 1) + ' mm from the rear edge'));
      }
    }

    // Fixed shelf dados.
    var fixed = fixedShelfCentres(cfg, dims);
    for (var i = 0; i < fixed.length; i++) {
      var zc = fixed[i];
      var a = o.at(phys(dims.interiorRearY, zc));
      var b = o.at(phys(dims.frontY, zc));
      mach.push(P.groove('A', Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), cfg.interior.shelfThickness, Math.min(c.dadoDepth, t / 2), 'shelf', 'Fixed shelf dado'));
    }

    // Toe-kick notch on notched side panels: the front bottom corner is cut away.
    if (dims.toeKickStyle === 'notched-sides' && dims.hasToeKick && !dims.isWall) {
      // Drawing axes on a side panel: x = cabinet height, y = cabinet depth.
      var originPt = o.at(phys(dims.frontY, dims.boxBottomZ));
      var corner = (originPt.y < o.width / 2 ? 'b' : 't') + (originPt.x < o.length / 2 ? 'l' : 'r');
      mach.push(P.notch('A', corner, dims.toeKickHeight, dims.toeKickSetback, 'toe-kick', 'Toe-kick notch, ' + round(dims.toeKickHeight, 1) + ' × ' + round(dims.toeKickSetback, 1) + ' mm'));
    }

    // Carcass joinery machining.
    var joineryMach = carcassJoineryMachining(o, side, ctx, dims);
    for (var j = 0; j < joineryMach.length; j++) mach.push(joineryMach[j]);
    return mach;
  }

  function horizontalBackMachining(o, ctx, dims, name) {
    var c = ctx.config.construction;
    var mach = [];
    if (!dims.hasBack) return mach;
    if (c.backStyle === 'dado') {
      // Groove in the top/bottom panel face, running across the width at the dado offset.
      var yc = dims.backY0 + dims.backThickness / 2;
      var zc = o.box ? o.box.z + o.box.h / 2 : dims.boxBottomZ;
      var p1 = o.at({ x: dims.carcassThickness, y: yc, z: zc });
      var p2 = o.at({ x: dims.width - dims.carcassThickness, y: yc, z: zc });
      mach.push(P.groove('A', Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.max(p1.x, p2.x), Math.max(p1.y, p2.y), dims.backThickness, c.dadoDepth, 'back', 'Back dado in the ' + name.toLowerCase()));
    }
    return mach;
  }

  function carcassJoineryMachining(o, side, ctx, dims) {
    var c = ctx.config.construction;
    var t = dims.carcassThickness;
    var mach = [];
    if (c.joinery === 'dado-screw') {
      // Dados for bottom and top structure into the side panel.
      var joints = [dims.boxBottomZ + t / 2, dims.boxTopZ - t / 2];
      for (var i = 0; i < joints.length; i++) {
        var p1 = o.at({ x: 0, y: dims.rearY, z: joints[i] });
        var p2 = o.at({ x: 0, y: dims.frontY, z: joints[i] });
        mach.push(P.groove('A', Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.max(p1.x, p2.x), Math.max(p1.y, p2.y), t, Math.min(c.dadoDepth, t / 2), i === 0 ? 'bottom' : 'decorative', 'Carcass dado'));
      }
      return mach;
    }
    if (c.joinery === 'confirmat' || c.joinery === 'butt-screw') {
      // Screws pass through the side panel outer face into the bottom / top-structure ends. A base
      // cabinet has a front and a rear top stretcher (3 screws each, spread across the 100 mm
      // stretcher); a wall/tall cabinet has a full top panel (3 screws spread along the depth).
      var isBase = !(dims.isWall || ctx.config.type === 'tall' || ctx.config.type === 'pantry');
      var jointHoles = [];
      // Bottom joint: three screws spread along the cabinet depth.
      var yA = dims.rearY + Math.min(64, dims.sideDepth * 0.2);
      var yB = dims.frontY - Math.min(64, dims.sideDepth * 0.2);
      jointHoles.push({ y: yA, z: dims.boxBottomZ + t / 2 }, { y: (yA + yB) / 2, z: dims.boxBottomZ + t / 2 }, { y: yB, z: dims.boxBottomZ + t / 2 });
      if (isBase) {
        var sd = Math.min(ctx.standards.carcass.topStretcherDepth, dims.sideDepth - dims.backY1 - 20);
        if (!(sd > 20)) sd = Math.max(20, dims.sideDepth / 3);
        var stretchers = [dims.frontY - sd / 2, dims.interiorRearY + sd / 2];
        for (var st = 0; st < stretchers.length; st++) {
          for (var off = -32; off <= 32; off += 32) {
            var yy = clamp(stretchers[st] + off, dims.rearY + 10, dims.frontY - 10);
            jointHoles.push({ y: yy, z: dims.boxTopZ - t / 2 });
          }
        }
      } else {
        for (var off2 = -32; off2 <= 32; off2 += 32) {
          jointHoles.push({ y: (dims.rearY + dims.frontY) / 2 + off2, z: dims.boxTopZ - t / 2 });
        }
      }
      for (var jh = 0; jh < jointHoles.length; jh++) {
        var p = o.onFaceB({ x: 0, y: jointHoles[jh].y, z: jointHoles[jh].z });
        mach.push(P.hole('B', p.x, p.y, c.joinery === 'confirmat' ? 7 : 4.5, c.joinery === 'confirmat' ? 50 : 40, c.joinery === 'confirmat' ? 'confirmat' : 'dowel', joineryNote(c.joinery)));
      }
      return mach;
    }
    if (c.joinery === 'dowel') {
      var zJ = [dims.boxBottomZ + t / 2, dims.boxTopZ - t / 2];
      var yS = [dims.rearY + 64, (dims.rearY + dims.frontY) / 2, dims.frontY - 64];
      for (var zz = 0; zz < zJ.length; zz++) {
        for (var yy = 0; yy < yS.length; yy++) {
          var q = o.at({ x: 0, y: yS[yy], z: zJ[zz] });
          mach.push(P.hole('A', q.x, q.y, 8, 18, 'dowel', 'Dowel 8 × 30, 3 per joint'));
        }
      }
      return mach;
    }
    return mach;
  }

  function fixedShelfCentres(cfg, dims) {
    var n = Math.max(0, Math.round(cfg.interior.fixedShelves));
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(round(dims.interiorBottomZ + ((i + 1) * dims.interiorHeight) / (n + 1) - cfg.interior.shelfThickness / 2, 2));
    }
    return out;
  }

  function buildShelves(ctx, dims, out) {
    var cfg = ctx.config;
    var it = cfg.interior;
    var c = cfg.construction;
    var shelfMat = it.shelfMaterial || c.carcassMaterial;
    var shelfT = it.shelfThickness;
    var shelfDepth = round(dims.interiorDepth - it.shelfFrontSetback - ctx.standards.shelf.backClearance, 2);
    if (shelfDepth <= 20) {
      ctx.warn('warning', 'Shelf depth too small', 'The shelf depth resolved to ' + round(shelfDepth, 1) + ' mm; shelves were still generated at 20 mm.', 'shelf.depth', 'Reduce the shelf front setback or cabinet depth.', []);
      shelfDepth = Math.max(20, shelfDepth);
    }

    var fixedCentres = fixedShelfCentres(cfg, dims);
    for (var i = 0; i < fixedCentres.length; i++) {
      var zc = fixedCentres[i];
      var length = round(dims.interiorWidth + 2 * c.dadoDepth, 2);
      var shelf = P.panelPart(ctx, {
        key: 'fixed-shelf-' + (i + 1), name: 'Fixed shelf ' + (i + 1), normal: [0, 0, 1],
        box: P.makeBox(dims.carcassThickness - c.dadoDepth, dims.interiorRearY + ctx.standards.shelf.backClearance, zc, length, shelfDepth, shelfT),
        faceA: 'Top face', note: 'Top edge of face A is the back of the cabinet',
        materialId: shelfMat, thickness: shelfT, edges: ['front'], grain: 'length',
        cutListGroup: 'fixed-shelf', group: GROUPS.SHELVES, edgebandId: it.shelfEdgeband,
        notes: ['Captured in ' + round(c.dadoDepth, 1) + ' mm side dados'],
        joinery: [{ id: 'dado', note: 'Fixed shelf in side dados; glue and pin or screw' }]
      });
      out.shelves.fixed.push(shelf.part);
    }

    var adjustable = Math.max(0, Math.round(it.adjustableShelves));
    var pinSystem = c.shelfSystem === 'adjustable-pins-32' || c.shelfSystem === 'adjustable-pins-custom';
    if (adjustable > 0 && !pinSystem) {
      ctx.warn('info', 'Adjustable shelves need a pin system', 'The cabinet has ' + adjustable + ' adjustable shelves but the shelf system is "' + c.shelfSystem + '"; no adjustable shelves or pin bores were generated.', 'shelf.system', 'Choose an adjustable-pin shelf system or use fixed shelves.', []);
      adjustable = 0;
    }
    var clearance = ctx.standards.shelf.adjustableClearance;
    var adjLength = round(dims.interiorWidth - 2 * clearance, 2);
    for (var j = 0; j < adjustable; j++) {
      var z = round(dims.interiorBottomZ + ((j + 1) * dims.interiorHeight) / (adjustable + 1) - shelfT / 2, 2);
      // Nudge away from a fixed shelf if they collide.
      for (var f = 0; f < fixedCentres.length; f++) {
        if (Math.abs(z - fixedCentres[f]) < shelfT + 40) z = round(fixedCentres[f] - shelfT - 60, 2);
      }
      z = clamp(z, dims.interiorBottomZ + 20, dims.interiorTopZ - shelfT - 20);
      var shelf2 = P.panelPart(ctx, {
        key: 'adjustable-shelf-' + (j + 1), name: 'Adjustable shelf ' + (j + 1), normal: [0, 0, 1],
        box: P.makeBox(dims.carcassThickness + clearance, dims.interiorRearY + ctx.standards.shelf.backClearance, z, adjLength, shelfDepth, shelfT),
        faceA: 'Top face', note: 'Top edge of face A is the back of the cabinet',
        materialId: shelfMat, thickness: shelfT, edges: ['front'], grain: 'length',
        cutListGroup: 'adjustable-shelf', group: GROUPS.SHELVES, edgebandId: it.shelfEdgeband,
        notes: ['Adjustable: shown at a suggested height; set on 5 mm pins at 32 mm pitch']
      });
      out.shelves.adjustable.push(shelf2.part);
    }
  }

  // =============================================================================================
  // Toe kick
  // =============================================================================================

  function buildToeKick(ctx, dims) {
    var cfg = ctx.config;
    var tk = cfg.toeKick;
    var style = tk.style;
    var parts = [];
    if (style === 'none' || style === 'flush-base' || dims.isWall) return parts;
    var t = defaults.material(tk.material).thickness || dims.carcassThickness;
    var h = dims.toeKickHeight;
    if (!(h > 0)) return parts;
    var c = cfg.construction;
    if (style === 'legs-levelers') {
      ctx.addHardware('leveler-foot', cfg.width > 900 ? 6 : 4, [], 'Legs and levelers: set the cabinet ' + round(h, 1) + ' mm above the floor and level before fitting the fronts');
      return parts;
    }
    if (style === 'notched-sides') {
      // Sides are already full height with notches; only the recessed kick board is generated.
      var board = P.panelPart(ctx, {
        key: 'toe-kick', name: 'Toe kick board', normal: [0, 1, 0],
        box: P.makeBox(dims.carcassThickness, dims.frontY - dims.toeKickSetback - t, 0, dims.interiorWidth, t, h),
        faceA: 'Front face', note: '',
        materialId: tk.material, thickness: t, edges: ['left', 'right', 'top', 'bottom'], grain: 'length',
        cutListGroup: 'toe-kick', group: GROUPS.TOE_KICK, edgebandId: c.edgeBanding,
        notes: [tk.finishedFace ? 'Finished front face; band or paint exposed edges' : 'Unfinished front; add a finished skin later']
      });
      parts.push(board.part);
      return parts;
    }
    // separate-platform: a platform under the carcass, set back from the front.
    var frontPlane = dims.cabinetFrontY; // face frame adds to the front, platform set back from it
    var platformFaceY = round(frontPlane - dims.toeKickSetback, 2);  // finished kick face
    var platformBoardY = round(platformFaceY - t, 2);                // back face of the kick board
    var railDepth = round(platformBoardY, 2);                         // side/back rails stop at the board
    var front = P.panelPart(ctx, {
      key: 'toe-kick-front', name: 'Toe kick platform front (finished face)', normal: [0, 1, 0],
      box: P.makeBox(t, platformBoardY, 0, round(dims.width - 2 * t, 2), t, h),
      faceA: 'Front face', note: '',
      materialId: tk.material, thickness: t, edges: ['top'], grain: 'length',
      cutListGroup: 'toe-kick', group: GROUPS.TOE_KICK, edgebandId: c.edgeBanding,
      notes: [tk.finishedFace ? 'Finished front face; band or paint the exposed edges' : 'Unfinished front; add a finished skin later']
    });
    var leftRail = P.panelPart(ctx, {
      key: 'toe-kick-side-left', name: 'Toe kick platform side, left', normal: [1, 0, 0],
      box: P.makeBox(0, 0, 0, t, railDepth, h),
      faceA: 'Inside face', note: '',
      materialId: tk.material, thickness: t, edges: [], grain: 'length',
      cutListGroup: 'toe-kick', group: GROUPS.TOE_KICK, edgebandId: 'none'
    });
    var rightRail = P.panelPart(ctx, {
      key: 'toe-kick-side-right', name: 'Toe kick platform side, right', normal: [-1, 0, 0],
      box: P.makeBox(dims.width - t, 0, 0, t, railDepth, h),
      faceA: 'Inside face', note: '',
      materialId: tk.material, thickness: t, edges: [], grain: 'length',
      cutListGroup: 'toe-kick', group: GROUPS.TOE_KICK, edgebandId: 'none'
    });
    var backRail = P.panelPart(ctx, {
      key: 'toe-kick-back', name: 'Toe kick platform back rail', normal: [0, -1, 0],
      box: P.makeBox(t, 0, 0, round(dims.width - 2 * t, 2), t, h),
      faceA: 'Front face', note: '',
      materialId: tk.material, thickness: t, edges: [], grain: 'length',
      cutListGroup: 'toe-kick', group: GROUPS.TOE_KICK, edgebandId: 'none'
    });
    parts.push(front.part, leftRail.part, rightRail.part, backRail.part);
    return parts;
  }

  // =============================================================================================
  // Doors / drawers / face frame
  // =============================================================================================

  function buildFronts(ctx, dims, plan, pinGrid) {
    var cfg = ctx.config;
    var st = ctx.standards;
    var leaves = [];
    var drawerFronts = [];
    var i;

    // Door leaves.
    for (i = 0; i < plan.leaves.length; i++) {
      var spec = plan.leaves[i];
      var label = cfg.tag + '-D' + (i + 1);
      var pull = pullFor(cfg, dims, 'door', spec.rect, spec.hingeSide, st);
      var overlay = plan.overlay;
      var depthY = overlay ? dims.depth : dims.depth - cfg.front.doors.thickness;
      var leaf = P.buildDoorLeaf(ctx, {
        rect: spec.rect, label: label, hingeSide: spec.hingeSide, overlay: overlay,
        doors: cfg.front.doors, depthY: depthY, pull: { id: pull.id, x: pull.placement.x, y: pull.placement.y },
        keyPrefix: 'door' + (i + 1), pinGrid: pinGrid
      });
      // Attach pull/parts bookkeeping.
      leaf.role = spec.role;
      leaf.leafIndex = i;
      leaf.pull = pull;
      leaf.label = label;
      leaf.overlay = plan.overlay ? 'full' : 'inset';
      leaves.push(leaf);
    }

    // Drawer fronts.
    for (i = 0; i < plan.drawerFronts.length; i++) {
      var dfSpec = plan.drawerFronts[i];
      var dfLabel = cfg.tag + '-DF' + (i + 1);
      var dfPull = pullFor(cfg, dims, 'drawer', dfSpec.rect, null, st);
      var dfDepthY = plan.overlay ? dims.depth : dims.depth - cfg.front.drawers.thickness;
      var front = P.buildDrawerFront(ctx, {
        rect: dfSpec.rect, label: dfLabel, drawers: cfg.front.drawers, depthY: dfDepthY,
        pull: { id: dfPull.id, x: dfPull.placement.x, y: dfPull.placement.y },
        keyPrefix: 'df' + (i + 1), thickness: cfg.front.drawers.thickness
      });
      front.role = dfSpec.role;
      front.pull = dfPull;
      front.label = dfLabel;
      drawerFronts.push(front);
    }
    return { leaves: leaves, drawerFronts: drawerFronts };
  }

  function ctxSide(ctx, key) {
    for (var i = 0; i < ctx.parts.length; i++) if (ctx.parts[i].key === key) return ctx.parts[i];
    return null;
  }

  /** Pull placement in front-elevation coordinates (x from left, y from floor). */
  function pullFor(cfg, dims, kind, rect, hingeSide, st) {
    var pullCfg = cfg.hardware.pull;
    var id = pullCfg.id || 'pull-bar-128';
    var finish = pullCfg.finish || '';
    var template = defaults.hardware(id);
    var isBar = /bar/i.test(template.name) || /bar/i.test(id);
    var halfBar = isBar ? 64 : 0;
    var x, y;
    if (kind === 'drawer') {
      var frameFront = cfg.front.drawers.style === 'shaker' || cfg.front.drawers.style === 'raised-panel';
      x = rect.x + rect.w / 2;
      // A frame drawer front carries its pull on the top rail, centred; a slab front is centred.
      y = frameFront
        ? rect.z + rect.h - (st.door.railWidth / 2)
        : rect.z + rect.h / 2;
    } else {
      var edgeInset = Math.min(45, Math.max(25, rect.w * 0.1));
      x = hingeSide === 'left' ? rect.x + rect.w - edgeInset : rect.x + edgeInset;
      var want;
      if (cfg.type === 'wall') {
        want = rect.z + Math.min(rect.h - 70, Math.max(70, rect.h * 0.18));
      } else {
        want = rect.z + rect.h - Math.min(90, Math.max(55, rect.h * 0.1));
      }
      // Keep the bar screws (and knob) inside the door, clear of the top and bottom rails.
      var lowLimit = rect.z + (isBar ? halfBar + 6 : 18);
      var highLimit = rect.z + rect.h - (isBar ? halfBar + 6 : 18);
      y = clamp(want, lowLimit, highLimit);
    }
    return {
      id: id, finish: finish,
      placement: { x: round(clamp(x, 20, dims.width - 20), 2), y: round(y, 2) }
    };
  }

  /**
   * Build drawer boxes for every drawer front.
   * @returns {Array} drawer info records
   */
  /**
   * Resolve the slide-family rules for a drawer (researched, contract §4).
   * Families differ in how the 42/25.4/6.35 mm deductions apply and in their standard lengths.
   * @returns {Object} {familyKey, boxOutsideW, rearClearance, lengths, boxDepthRule}
   */
  function drawerFamilyRules(cfg, standards) {
    var dr = cfg.front.drawers;
    var fams = standards.drawerFamilies || {};
    var families = {
      undermount: fams.undermount || { insideWidthClearance: 42, rearClearance: 40, lengthsMm: standards.drawer.slideLengths },
      sideMount: fams.sideMount || { outsideWidthClearance: 25.4, rearClearance: 25, lengthsMm: standards.drawer.slideLengths },
      centerMount: fams.centerMount || { outsideWidthClearance: 6.35, rearClearance: 31.75 }
    };
    if (dr.slide === 'undermount') {
      return {
        key: 'undermount', clearance: dr.boxWidthClearance !== null ? dr.boxWidthClearance : families.undermount.insideWidthClearance,
        clearanceFromInside: true, rearClearance: families.undermount.rearClearance,
        lengths: families.undermount.lengthsMm || standards.drawer.slideLengths,
        minVertical: standards.drawer.minVerticalClearance.undermount
      };
    }
    if (dr.slide === 'side-mount') {
      return {
        key: 'side-mount', clearance: dr.boxWidthClearance !== null ? dr.boxWidthClearance : families.sideMount.outsideWidthClearance,
        clearanceFromInside: false, rearClearance: families.sideMount.rearClearance,
        lengths: families.sideMount.lengthsMm || standards.drawer.slideLengths,
        minVertical: standards.drawer.minVerticalClearance['side-mount'],
        profileHeight: families.sideMount.profileHeight
      };
    }
    return {
      key: 'center-mount', clearance: dr.boxWidthClearance !== null ? dr.boxWidthClearance : families.centerMount.outsideWidthClearance,
      clearanceFromInside: false, rearClearance: families.centerMount.rearClearance,
      lengths: standards.drawer.slideLengths, minVertical: standards.drawer.minVerticalClearance['center-mount'],
      depthRule: true
    };
  }

  function buildDrawerBoxes(ctx, dims, drawerFronts) {
    var cfg = ctx.config;
    var dr = cfg.front.drawers;
    var st = ctx.standards;
    var reveal = cfg.front.reveal;
    var family = drawerFamilyRules(cfg, st);
    var sideT = dr.boxSideThickness;
    var out = [];
    for (var i = 0; i < drawerFronts.length; i++) {
      var df = drawerFronts[i];
      var rect = df.rect;

      // --- width: researched rule per slide family ---
      var boxW = family.clearanceFromInside
        ? round(dims.interiorWidth - family.clearance + 2 * sideT, 2)   // undermount: inside width rule
        : round(dims.interiorWidth - family.clearance, 2);
      if (family.clearanceFromInside) {
        // show the inside width the slide actually asks for
        df.insideWidth = round(dims.interiorWidth - family.clearance, 2);
      }
      if (boxW < 120) {
        ctx.warn('error', 'Drawer box too narrow', 'Drawer box width resolved to ' + round(boxW, 1) + ' mm; the slide will not fit.', 'drawer.boxWidth', 'Widen the cabinet or use a different slide.', []);
      }

      // --- depth: largest standard length with length + rear clearance <= clean interior depth ---
      var boxFrontY = null; // resolved below; depends on the front overlay mode
      var boxFrontPlane = dims.frontY;
      var rearClearance = family.rearClearance;
      if (dr.boxDepthClearance !== null) rearClearance = dr.boxDepthClearance;
      var cleanDepth = round(dims.interiorDepth - rearClearance, 2);
      var slideLen = null;
      var boxDepth;
      if (dr.slideLength) {
        slideLen = dr.slideLength;
        if (slideLen > cleanDepth + 0.01) {
          ctx.warn('warning', 'Slide longer than the cabinet', 'The selected ' + round(slideLen, 1) + ' mm slide needs ' + round(rearClearance, 1) + ' mm rear clearance but only ' + round(dims.interiorDepth, 1) + ' mm of interior depth is available; the box was shortened.', 'drawer.slideLength', 'Choose a shorter slide or a deeper cabinet.', []);
          slideLen = cleanDepth;
        }
      } else {
        var lengths = family.lengths.slice().sort(function (a, b) { return a - b; });
        for (var s = lengths.length - 1; s >= 0; s--) {
          if (lengths[s] <= cleanDepth + 0.01) { slideLen = lengths[s]; break; }
        }
        if (!slideLen) {
          slideLen = cleanDepth;
          ctx.warn('warning', 'No standard slide fits', 'Available drawer depth after ' + round(rearClearance, 1) + ' mm rear clearance is ' + round(cleanDepth, 1) + ' mm; the shortest standard slide is ' + lengths[0] + ' mm.', 'drawer.slideLength', 'Use a shorter slide or a deeper cabinet.', []);
        }
      }
      boxDepth = round(slideLen, 2);
      if (family.depthRule && !dr.slideLength) boxDepth = round(cleanDepth, 2); // centre-mount: interior − 31.75
      if (boxDepth < 150) {
        ctx.warn('error', 'Drawer box too shallow', 'Drawer box depth resolved to ' + round(boxDepth, 1) + ' mm.', 'drawer.boxDepth', 'Increase the cabinet depth.', []);
        boxDepth = Math.max(60, boxDepth);
      }

      // --- box front plane: overlay boxes sit at the carcass front; inset boxes behind the front ---
      boxFrontPlane = dims.frontY;
      var frontThickness = cfg.front.drawers.thickness;
      if (!cfg.front.doors.overlay || cfg.front.doors.overlay === 'inset') {
        // Inset fronts sit flush with the cabinet face; the box front is immediately behind them.
        boxFrontPlane = round(dims.depth - frontThickness, 2);
      }
      var availableDepth = round(boxFrontPlane - dims.interiorRearY - rearClearance, 2);
      if (boxDepth > availableDepth + 0.01) {
        boxDepth = Math.max(60, round(availableDepth, 2));
        ctx.warn('warning', 'Drawer box shortened for the back', 'The drawer box was shortened to clear the rear clearance.', 'drawer.boxDepth', 'Use a shorter slide.', []);
      }
      boxFrontY = boxFrontPlane;
      var boxY0 = round(boxFrontY - boxDepth, 2);
      if (boxY0 < dims.interiorRearY - 0.01) {
        boxY0 = dims.interiorRearY;
        boxDepth = round(boxFrontY - boxY0, 2);
      }

      // --- height & vertical placement ---
      var rawH = round(rect.h - dr.boxHeightAllowance, 2);
      if (rawH < st.drawer.minBoxHeight) {
        ctx.warn('warning', 'Drawer box shorter than recommended', 'Drawer box height resolved to ' + round(rawH, 1) + ' mm; ' + st.drawer.minBoxHeight + ' mm is the usual minimum for ' + dr.slide + ' slides.', 'drawer.boxHeight', 'Reduce the front gap allowance or make the front taller.', []);
      }
      var boxH = Math.max(st.drawer.minBoxHeight, rawH);
      if (boxH > dims.interiorHeight - 10) boxH = Math.max(60, round(dims.interiorHeight - 10, 2));
      var minVert = family.minVertical || 0;
      var openingEnvelope = rect.h + 2 * reveal;
      if (dr.slide === 'undermount' && openingEnvelope - boxH < minVert) {
        ctx.warn('warning', 'Drawer vertical clearance tight', 'Opening/carcass clearance above the drawer box is ' + round(openingEnvelope - boxH, 1) + ' mm; undermount slides want at least ' + round(minVert, 1) + ' mm.', 'drawer.verticalFit', 'Reduce the box height allowance or increase the opening height.', []);
      }
      if (dr.slide === 'side-mount' && boxH < (family.profileHeight || 46)) {
        ctx.warn('warning', 'Drawer box lower than the slide profile', 'Drawer box height is ' + round(boxH, 1) + ' mm; side-mount slides are about ' + round(family.profileHeight || 46, 1) + ' mm tall.', 'drawer.verticalFit', 'Increase the drawer front height.', []);
      }
      var bottomClear = (st.drawer.bottomClearance && st.drawer.bottomClearance[dr.slide]);
      if (typeof bottomClear !== 'number') bottomClear = dr.slide === 'undermount' ? 12.7 : dr.slide === 'center-mount' ? 25.4 : 2;
      var minBoxBottom = round(dims.interiorBottomZ + bottomClear, 2);
      var desiredZ = round(rect.z + (rect.h - boxH) / 2, 2);
      var boxZ = Math.max(desiredZ, minBoxBottom);
      if (boxZ + boxH > dims.interiorTopZ) {
        var reduced = round(dims.interiorTopZ - boxZ, 2);
        if (reduced >= 60) {
          boxH = reduced;
        } else {
          boxZ = Math.max(minBoxBottom, dims.interiorTopZ - boxH);
          ctx.warn('warning', 'Drawer box tight under the top', 'The drawer box was moved down to clear the top structure.', 'drawer.boxHeight', 'Check the drawer opening heights.', []);
        }
      }
      // The drawer front must cover the box: keep the box top at or below the front top.
      var frontTopZ = round(rect.z + rect.h, 2);
      if (boxZ + boxH > frontTopZ + 0.01) {
        var clipped = round(frontTopZ - boxZ, 2);
        if (clipped >= st.drawer.minBoxHeight) {
          boxH = clipped;
        } else {
          boxZ = round(Math.max(minBoxBottom, frontTopZ - boxH), 2);
          if (boxZ + boxH > frontTopZ + 0.01) {
            boxH = Math.max(40, round(frontTopZ - boxZ, 2));
            ctx.warn('warning', 'Drawer box exceeds the front', 'The box bottom clearance pushes the drawer box above its front; check the slide choice and front heights.', 'drawer.verticalFit', 'Increase the box height allowance or move the bottom drawer up.', []);
          }
        }
      }
      if (boxH < 60) {
        ctx.warn('error', 'Drawer box does not fit', 'The drawer box does not fit vertically in the opening.', 'drawer.boxHeight', 'Reduce the box allowance or increase the opening height.', []);
        boxH = 60;
      }
      var boxX = round(dims.carcassThickness + (dims.interiorWidth - boxW) / 2, 2);

      var box = P.buildDrawerBox(ctx, {
        box: { x: boxX, y: boxFrontY, z: boxZ, width: boxW, height: boxH, depth: boxDepth },
        sideThickness: sideT, bottomThickness: dr.boxBottomThickness,
        slide: dr.slide, joinery: dr.boxJoinery, bottomJoinery: dr.boxBottomJoinery,
        materialId: dr.boxMaterial, label: df.label, keyPrefix: 'dr' + (i + 1), addHardware: true
      });
      out.push({
        label: df.label, role: df.role, box: box, boxZ: boxZ, boxH: boxH, boxW: boxW,
        boxX0: boxX, boxY0: boxY0, boxDepth: boxDepth, slide: dr.slide, slideLength: slideLen,
        front: df
      });
    }
    return out;
  }

  function buildFaceFrame(ctx, dims, plan) {
    if (!plan.faceFrame) return { members: [], parts: [], railCentres: [] };
    var rails = plan.faceFrame.rails.map(function (r) {
      return { name: r.name, role: r.role, z0: r.z0, h: r.h };
    });
    var built = P.buildFaceFrame(ctx, {
      width: dims.width, boxBottom: dims.boxBottomZ, boxTop: dims.boxTopZ,
      frameY: dims.carcassDepth, thickness: ctx.config.faceFrame.thickness,
      rails: rails
    });
    return built;
  }

  // =============================================================================================
  // Hardware
  // =============================================================================================

  function addHardware(ctx, dims, plan, frontBuild, drawerBoxes) {
    var cfg = ctx.config;
    var st = ctx.standards;
    var c = cfg.construction;
    var front = cfg.front;
    var i;

    // Hinges: inset applications need a half-cranked/inset hinge; full overlay uses the standard
    // 110° cup hinge. Face-frame full overlay additionally needs a face-frame adapter plate.
    var hingeType = front.doors.hingeType;
    var overlay = front.doors.overlay;
    var hingeTemplate = hingeType === 'butt' ? 'hinge-butt' : overlay === 'inset' ? 'hinge-euro-inset' : 'hinge-euro-110';
    for (i = 0; i < frontBuild.leaves.length; i++) {
      var leaf = frontBuild.leaves[i];
      if (leaf.hingeCount <= 0) continue;
      var note = cfg.hardware.softClose ? 'Soft-close: set the hinge damping after fitting' : 'Standard closing hinge';
      if (dims.isFaceFrame && overlay === 'full') note += '. Mount on a face-frame adapter plate (19 mm overlay) so the door closes against the frame';
      ctx.addHardware(hingeTemplate, leaf.hingeCount, leaf.partIds, note, 'ea');
    }
    if (hingeType !== 'butt' && dims.isFaceFrame && overlay === 'full' && frontBuild.leaves.length > 0) {
      var plateQty = 0;
      for (i = 0; i < frontBuild.leaves.length; i++) plateQty += frontBuild.leaves[i].hingeCount;
      ctx.addHardware('hinge-plate-cross', plateQty, [], 'Face-frame mounting plates: set the plate overlay to the ' + round(dims.faceFrameThickness, 1) + ' mm frame thickness', 'ea');
    }

    // Pulls (one per front).
    var allFronts = frontBuild.leaves.concat(frontBuild.drawerFronts);
    for (i = 0; i < allFronts.length; i++) {
      var f = allFronts[i];
      if (!f.pull || !f.pull.id) continue;
      ctx.addHardware(f.pull.id, 1, f.partIds, 'Pull at ' + round(f.pull.placement.x, 0) + ' mm from left, ' + round(f.pull.placement.y, 0) + ' mm from floor', 'ea');
    }

    // Shelf pins.
    if (cfg.hardware.shelfPins) {
      var adj = ctx.config.interior.adjustableShelves;
      if (adj > 0) ctx.addHardware('shelf-pin-5', adj * st.shelf.minPinsPerShelf, [], 'Four pins per adjustable shelf (front and rear pin rows)', 'ea');
    }

    // Door bumpers.
    if (cfg.hardware.doorBumpers && frontBuild.leaves.length > 0) {
      ctx.addHardware('door-bumper', frontBuild.leaves.length, [], 'One bumper per door leaf near the opening edge', 'ea');
    }

    // Wall/tall hanging rail.
    if (cfg.hardware.hangingRail && (cfg.type === 'wall' || cfg.type === 'tall' || cfg.type === 'pantry')) {
      ctx.addHardware('hanging-rail', round((dims.width - 40) / 1000, 2), [], 'Fasten to wall studs; cabinet cleat engages the rail', 'm');
    }

    // Carcass joinery fasteners.
    var isBase = !(dims.isWall || cfg.type === 'tall' || cfg.type === 'pantry');
    var joints = 2 + (isBase ? 4 : 2); // bottom (2) + top structure (base: 2 stretchers × 2 sides; wall/tall: 2)
    var perJoint = 3;
    var fastener = c.joinery === 'confirmat' ? { id: 'confirmat-50', qty: perJoint * joints } :
      c.joinery === 'pocket-screw' ? { id: 'pocket-screw-32', qty: perJoint * joints } :
        c.joinery === 'dowel' ? { id: 'wood-dowel-8', qty: perJoint * joints } :
          c.joinery === 'biscuit' ? { id: 'biscuit-20', qty: perJoint * joints } :
            c.joinery === 'dado-screw' ? { id: 'confirmat-50', qty: 2 * joints } :
              { id: 'confirmat-50', qty: perJoint * joints };
    ctx.addHardware(fastener.id, fastener.qty, [], joineryNote(c.joinery), 'ea');
    if (dims.toeKickStyle === 'notched-sides' || dims.toeKickStyle === 'separate-platform') {
      ctx.addHardware('toe-kick-clip', Math.ceil(dims.width / 300), [], 'Clip the finished base board to the platform', 'ea');
    }

    // Face-frame joinery fasteners.
    if (plan.faceFrame) {
      var railCount = plan.faceFrame.rails.length;
      var ffj = cfg.faceFrame.joinery;
      var ffQty;
      if (ffj === 'pocket-screw') ffQty = 4 * railCount;
      else if (ffj === 'biscuit') ffQty = 4 * railCount;
      else if (ffj === 'dowel') ffQty = 4 * railCount;
      else ffQty = 2 * railCount;
      var ffTpl = ffj === 'pocket-screw' ? 'pocket-screw-32' : ffj === 'biscuit' ? 'biscuit-20' : ffj === 'dowel' ? 'wood-dowel-8' : 'wood-dowel-8';
      ctx.addHardware(ffTpl, ffQty, [], 'Face-frame joints: 2 fasteners per rail end', 'ea');
    }

    // Drawer box joinery hardware.
    var boxFastener = front.drawers.boxJoinery === 'butt-screw' ? { id: 'confirmat-50', qty: 8 * drawerBoxes.length } : null;
    if (boxFastener && drawerBoxes.length > 0) ctx.addHardware(boxFastener.id, boxFastener.qty, [], 'Drawer box butt joints: screws and glue', 'ea');
  }

  // =============================================================================================
  // Front schedule
  // =============================================================================================

  function buildFrontSchedule(cfg, frontBuild) {
    var out = [];
    var i;
    for (i = 0; i < frontBuild.leaves.length; i++) {
      var leaf = frontBuild.leaves[i];
      out.push({
        cabinetId: cfg.id, cabinetTag: cfg.tag, kind: 'door', label: leaf.label, qty: 1,
        width: leaf.rect.w, height: leaf.rect.h, thickness: leaf.thickness,
        style: leaf.style, materialId: cfg.front.doors.material, overlay: leaf.overlay,
        hingeSide: leaf.hingeSide, hingeCount: leaf.hingeCount, pull: leaf.pull,
        note: leaf.style === 'slab' ? 'Slab door' : leaf.style + ' door'
      });
    }
    for (i = 0; i < frontBuild.drawerFronts.length; i++) {
      var df = frontBuild.drawerFronts[i];
      out.push({
        cabinetId: cfg.id, cabinetTag: cfg.tag, kind: 'drawer-front', label: df.label, qty: 1,
        width: df.rect.w, height: df.rect.h, thickness: df.thickness,
        style: df.style, materialId: cfg.front.drawers.material, overlay: cfg.front.doors.overlay,
        hingeSide: 'none', hingeCount: 0, pull: df.pull, note: df.style + ' drawer front'
      });
    }
    return out;
  }

  // =============================================================================================
  // Assembly stub (assembly.js fills the real steps; this keeps resolveCabinet usable alone)
  // =============================================================================================

  function buildAssembly(model) {
    if (CS.engine && CS.engine.assembly && typeof CS.engine.assembly.buildAssembly === 'function') {
      try {
        return CS.engine.assembly.buildAssembly(model);
      } catch (e) {
        model.warnings.push(warnObj(model.config, 'warning', 'Assembly sequence failed', 'The assembly sequence could not be generated: ' + (e && e.message ? e.message : String(e)), 'assembly.error', 'Report this cabinet configuration.'));
        return [];
      }
    }
    return [];
  }

  // =============================================================================================
  // Public resolver
  // =============================================================================================

  /**
   * Resolve one cabinet into a buildable model.
   *
   * @param {Object} project normalised or partial project (settings are read for defaults)
   * @param {Object} cabinet cabinet object (partial allowed; defaults are filled)
   * @param {number} [index] cabinet index in the project, used for fallback ids/tags
   * @returns {Object} CabinetModel (contract §4)
   */
  function resolveCabinet(project, cabinet, index) {
    var proj = isObject(project) ? project : {};
    if (CS.core && CS.core.project && typeof CS.core.project.normalizeProject === 'function') {
      try {
        var np = CS.core.project.normalizeProject(proj);
        if (np && np.project) proj = np.project;
      } catch (e) { /* engine must work with a bare project object */ }
    }
    var standards = defaults.standards();
    var norm = defaults.normalizeCabinet(proj, cabinet, typeof index === 'number' ? index : 0);
    var cfg = norm.config;
    var warnings = norm.warnings;

    var dims = computeDims(cfg, standards);
    var plan = computeFrontPlan(cfg, dims, standards, warnings);
    var ctx = P.createContext({ project: proj, config: cfg, standards: standards, warnings: warnings });

    var carcass = buildCarcass(ctx, dims);
    buildToeKick(ctx, dims);
    var ffBuild = buildFaceFrame(ctx, dims, plan);
    // One 32 mm grid for shelf pins *and* hinge plates so the plate screws reuse the pin holes.
    var pinSpacing = cfg.construction.shelfPinSpacing || standards.shelf.pinSpacing;
    var pinFirstZ = round(dims.interiorBottomZ + Math.round(standards.shelf.pinStartOffset / pinSpacing) * pinSpacing, 2);
    var pinGrid = { origin: pinFirstZ, step: pinSpacing };
    var frontBuild = buildFronts(ctx, dims, plan, pinGrid);
    var drawerBoxes = buildDrawerBoxes(ctx, dims, frontBuild.drawerFronts);

    // Slide machining on the carcass (after boxes exist).
    if (drawerBoxes.length > 0) {
      P.addSlideHoles(ctx, dims, cfg.front.drawers.slide, drawerBoxes, ctx.parts);
    }
    // Shelf pin hole rows.
    if (cfg.interior.adjustableShelves > 0 && carcass.sideLeft && carcass.sideRight) {
      var pinStart = standards.shelf.pinStartOffset;
      P.addShelfPinHoles(ctx, carcass.sideLeft, carcass.sideRight, dims, {
        system: cfg.construction.shelfSystem,
        adjustableCount: cfg.interior.adjustableShelves,
        zoneBottom: dims.interiorBottomZ,
        zoneTop: round(dims.interiorTopZ - standards.shelf.pinEndClearance, 2),
        pinStartOffset: pinFirstZ - dims.interiorBottomZ
      });
    }

    // Hinge mounting-plate holes on the side panels.
    var hingeCups = [];
    for (var h = 0; h < frontBuild.leaves.length; h++) {
      var cups = frontBuild.leaves[h].hingeCups || [];
      for (var c2 = 0; c2 < cups.length; c2++) hingeCups.push(cups[c2]);
    }
    if (hingeCups.length > 0) {
      var fullOverlayFaceFrame = dims.isFaceFrame && cfg.front.doors.overlay === 'full' && cfg.front.doors.hingeType === 'euro-cup';
      if (fullOverlayFaceFrame && ffBuild && ffBuild.parts && ffBuild.parts.length > 0) {
        // Full-overlay face-frame doors hinge on face-frame adapter plates screwed to the stiles.
        P.addFaceFramePlateHoles(ctx, dims, hingeCups, ffBuild.parts);
      } else if (carcass.sideLeft && carcass.sideRight) {
        P.addHingePlateHoles(ctx, carcass.sideLeft, carcass.sideRight, dims, hingeCups);
      }
    }

    addHardware(ctx, dims, plan, frontBuild, drawerBoxes);
    P.finaliseParts(ctx);
    var hardware = P.finaliseHardware(ctx);

    var frontSchedule = buildFrontSchedule(cfg, frontBuild);
    var frontLayout = {
      doors: frontBuild.leaves.map(function (l) {
        return {
          label: l.label, x: l.rect.x, y: l.rect.z, w: l.rect.w, h: l.rect.h,
          hingeSide: l.hingeSide, hingeCount: l.hingeCount, hingePositions: l.hingePositions,
          style: l.style, overlay: l.overlay,
          materialId: cfg.front.doors.material, thickness: l.thickness, pull: l.pull,
          role: l.role, partIds: l.partIds
        };
      }),
      drawerFronts: frontBuild.drawerFronts.map(function (d) {
        return {
          label: d.label, x: d.rect.x, y: d.rect.z, w: d.rect.w, h: d.rect.h,
          style: d.style, materialId: cfg.front.drawers.material, thickness: d.thickness,
          pull: d.pull, role: d.role, partIds: d.partIds
        };
      })
    };
    var faceFrameLayout = ffBuild && ffBuild.members ? { members: ffBuild.members } : { members: [] };

    // Model stats.
    var partCount = ctx.parts.length;
    var areaMm2 = 0;
    var edgebandMm = 0;
    var frontCount = frontLayout.doors.length + frontLayout.drawerFronts.length;
    for (var p = 0; p < ctx.parts.length; p++) {
      areaMm2 += ctx.parts[p].length * ctx.parts[p].width;
      edgebandMm += P.edgebandLength(ctx.parts[p]);
    }
    var stats = {
      partCount: partCount,
      partTypeCount: uniqueCount(ctx.parts, 'cutListGroup'),
      machiningCount: ctx.parts.reduce(function (a, x) { return a + x.machining.length; }, 0),
      hardwareCount: hardware.reduce(function (a, x) { return a + x.qty; }, 0),
      frontCount: frontCount,
      doorCount: frontLayout.doors.length,
      drawerCount: frontLayout.drawerFronts.length,
      areaM2: round(areaMm2 / 1e6, 3),
      edgebandMetres: round(edgebandMm / 1000, 3)
    };

    var model = {
      config: cfg,
      dims: dims,
      parts: ctx.parts,
      hardware: hardware,
      frontSchedule: frontSchedule,
      assembly: [],
      warnings: warnings,
      openings: plan.openings.map(function (o) {
        return { role: o.role, x: o.x, y: o.y, width: o.width, height: o.height, doors: o.doors, drawer: o.drawer || null };
      }),
      frontLayout: frontLayout,
      faceFrameLayout: faceFrameLayout,
      shelves: carcass.shelves,
      drawerBoxes: drawerBoxes.map(function (d) {
        return {
          label: d.label, role: d.role, box: d.box.box, slide: d.slide, slideLength: d.slideLength,
          boxHeight: d.boxH, boxWidth: d.boxW, boxDepth: d.boxDepth, partIds: d.box.partIds
        };
      }),
      stats: stats
    };

    // Cross-cutting checks (check.js) augment the warning list.
    if (CS.engine && CS.engine.check && typeof CS.engine.check.validateCabinet === 'function') {
      try {
        var checkWarnings = CS.engine.check.validateCabinet(model, proj, standards);
        for (var w2 = 0; w2 < checkWarnings.length; w2++) warnings.push(checkWarnings[w2]);
      } catch (e2) {
        warnings.push(warnObj(cfg, 'warning', 'Validation failed', 'Cabinet validation could not run: ' + (e2 && e2.message ? e2.message : String(e2)), 'check.error', 'Report this cabinet configuration.'));
      }
    }

    model.assembly = buildAssembly(model);
    return model;
  }

  function uniqueCount(parts, key) {
    var seen = {};
    var n = 0;
    for (var i = 0; i < parts.length; i++) {
      var k = parts[i][key];
      if (!seen[k]) { seen[k] = 1; n++; }
    }
    return n;
  }

  /**
   * Suggest auto drawer-front heights (top-down) for a cabinet without resolving every part.
   * @param {Object} cabinet partial cabinet
   * @returns {number[]} heights in mm, top drawer first
   */
  function suggestDrawerHeights(cabinet) {
    var standards = defaults.standards();
    var norm = defaults.normalizeCabinet({}, cabinet, 0);
    var cfg = norm.config;
    var dims = computeDims(cfg, standards);
    var count = Math.max(1, Math.round(cfg.front.drawers.count));
    var reveal = cfg.front.reveal;
    var region = dims.frontHeight - (count + 1) * reveal;
    var auto = autoDrawerHeights(region, count, standards);
    return auto.heights.map(function (h) { return round(h, 1); });
  }

  /** Standard dimensions for a cabinet type (contract §12). */
  function suggestCabinetDimensions(type) {
    var standards = defaults.standards();
    var t = standards.dims[type] ? type : 'base';
    var d = standards.dims[t];
    return { width: d.width || (t === 'wall' ? 762 : 762), height: d.height, depth: d.depth };
  }

  var api = {
    computeDims: computeDims,
    computeFrontPlan: computeFrontPlan,
    autoDrawerHeights: autoDrawerHeights,
    resolveCabinet: resolveCabinet,
    suggestDrawerHeights: suggestDrawerHeights,
    suggestCabinetDimensions: suggestCabinetDimensions
  };

  CS.engine = CS.engine || {};
  CS.engine.cabinet = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
