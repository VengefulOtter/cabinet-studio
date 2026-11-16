/* Cabinet Studio — orthographic cabinet views.
 *
 * Builds semantic scenes for the whole-cabinet sheets and on-screen previews:
 * front elevation, side section, plan section, an elevation lineup and sheet
 * nesting diagrams. All dimensions come from the resolved CabinetModel.
 *
 * Classic script; attaches to CS.draw.views and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});
  CS.draw = CS.draw || {};

  var COUNTER_HEIGHT = 914.4;       // finished counter top AFF
  var WALL_ABOVE_COUNTER = 457.2;   // standard wall cabinet bottom above counter

  var GROUP_FILL = {
    'Carcass': 'none',
    'Back': 'light',
    'Shelves': 'light',
    'Doors': 'paper',
    'Drawers': 'paper',
    'Face frame': 'none',
    'Toe kick': 'dark'
  };

  function has(obj, key) {
    return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function addDim(scene, p1, p2, offset, orient, text) {
    CS.draw.scene.add(scene, CS.draw.scene.dim(p1, p2, {
      offset: offset, orient: orient, text: text == null ? null : text
    }));
  }

  function modelConfig(model) {
    return (model && model.config) || {};
  }

  function frontLayout(model) {
    var cfg = modelConfig(model);
    var layout = (model && model.frontLayout) || {};
    var doors = Array.isArray(layout.doors) ? layout.doors : [];
    var drawerFronts = Array.isArray(layout.drawerFronts) ? layout.drawerFronts : [];
    return { doors: doors, drawerFronts: drawerFronts };
  }

  function frontPanelDetails(scene, front, cfg, opts) {
    var style = front.style || (cfg.front && cfg.front.doors ? cfg.front.doors.style : 'slab');
    var x = front.x, y = front.y, w = front.w, h = front.h;
    var stile = (cfg.front && cfg.front.doors && cfg.front.doors.stileWidth) || 57.15;
    var rail = (cfg.front && cfg.front.doors && cfg.front.doors.railWidth) || 57.15;
    var panelStyle = (front.panelStyle || (cfg.front && cfg.front.doors && cfg.front.doors.panelStyle) || 'recessed');
    var isFrame = style === 'shaker' || style === 'raised-panel' || style === 'beadboard' || style === 'glass' || style === 'mullion-glass' || panelStyle === 'raised' || panelStyle === 'beadboard' || panelStyle === 'glass';
    var isRaised = style === 'raised-panel' || panelStyle === 'raised';
    var isBeadboard = style === 'beadboard' || panelStyle === 'beadboard';
    var isGlass = style === 'glass' || style === 'mullion-glass' || panelStyle === 'glass';

    if (isFrame && w > stile * 2 + 10 && h > rail * 2 + 10) {
      var ix = x + stile, iy = y + rail, iw = w - stile * 2, ih = h - rail * 2;
      if (!isGlass) {
        CS.draw.scene.add(scene, CS.draw.scene.rect(ix, iy, iw, ih, { pen: 'thin', fill: 'none' }));
      }
      if (isRaised) {
        var bevel = Math.min(38, Math.min(iw, ih) * 0.12);
        CS.draw.scene.add(scene, CS.draw.scene.rect(ix + bevel, iy + bevel, iw - bevel * 2, ih - bevel * 2, { pen: 'thin', fill: 'none' }));
      }
      if (isBeadboard && iw > 10 && !isGlass) {
        var spacing = (cfg.front.doors.beadSpacing || 57.15);
        for (var bx = ix + spacing; bx < ix + iw - 1; bx += spacing) {
          CS.draw.scene.add(scene, CS.draw.scene.line([bx, iy + 2], [bx, iy + ih - 2], { pen: 'guide' }));
        }
      }
    }
    if (isGlass) {
      var gx = x + stile, gy = y + rail, gw = w - stile * 2, gh = h - rail * 2;
      CS.draw.scene.add(scene, CS.draw.scene.rect(gx, gy, gw, gh, { pen: 'thin', fill: 'none' }));
      var muntins = front.muntins != null ? front.muntins : ((cfg.front.doors && cfg.front.doors.muntins) || 0);
      for (var m = 1; m <= muntins; m++) {
        var mx = gx + (gw * m) / (muntins + 1);
        CS.draw.scene.add(scene, CS.draw.scene.line([mx, gy], [mx, gy + gh], { pen: 'thin' }));
      }
      // glass glazing marks (diagonals) to read as glass
      CS.draw.scene.add(scene, CS.draw.scene.line([gx + 4, gy + 4], [gx + 4 + Math.min(gw, gh) * 0.4, gy + 4 + Math.min(gw, gh) * 0.4], { pen: 'guide' }));
    }
    if (opts && opts.partNumbers && front.label) {
      // Drawer fronts carry a centred pull bar; keep the label clear of it.
      var labelY = front.kind === 'drawer' ? y + h * 0.25 : y + h / 2;
      CS.draw.scene.add(scene, CS.draw.scene.label([x + w / 2, labelY], front.label, {
        size: 'small', align: 'center', baseline: 'middle', bg: true
      }));
    }
  }

  function frontPanel(scene, front, cfg, opts) {
    CS.draw.scene.add(scene, CS.draw.scene.rect(front.x, front.y, front.w, front.h, { pen: 'cut', fill: 'paper' }));
    frontPanelDetails(scene, front, cfg, opts);
  }

  function pullSymbol(scene, front, cfg) {
    if (!front.pull) return;
    var p = front.pull.placement || front.pull;
    var x = p.x != null ? p.x : front.x + front.w / 2;
    var y = p.y != null ? p.y : front.y + front.h * 0.75;
    var id = String(front.pull.id || '');
    if (/knob/i.test(id)) {
      CS.draw.scene.add(scene, CS.draw.scene.circle([x, y], 16, { pen: 'thin', fill: 'medium' }));
      return;
    }
    var m = /(\d{2,3})/.exec(id);
    var nominal = m ? parseInt(m[1], 10) : 128;
    var len = Math.min(Math.max(32, nominal), front.w * 0.7);
    if (front.kind === 'drawer') {
      x = Math.min(Math.max(x, front.x + len / 2 + 6), front.x + front.w - len / 2 - 6);
      CS.draw.scene.add(scene, CS.draw.scene.rect(x - len / 2, y - 4, len, 8, { pen: 'thin', fill: 'medium' }));
    } else {
      y = Math.min(Math.max(y, front.y + len / 2 + 6), front.y + front.h - len / 2 - 6);
      CS.draw.scene.add(scene, CS.draw.scene.rect(x - 5, y - len / 2, 10, len, { pen: 'thin', fill: 'medium' }));
    }
  }

  /** Hinge-side tick marks on the door face; shops read the swing from the elevation. */
  function hingeMarks(scene, front) {
    if (!front || !front.hingePositions || !front.hingePositions.length) return;
    var side = front.hingeSide === 'right' ? 'right' : 'left';
    var edgeX = side === 'left' ? front.x : front.x + front.w;
    var dir = side === 'left' ? 1 : -1;
    front.hingePositions.forEach(function (z) {
      var zy = front.y + z;
      CS.draw.scene.add(scene, CS.draw.scene.line([edgeX, zy], [edgeX + dir * 18, zy], { pen: 'thin' }));
    });
    CS.draw.scene.add(scene, CS.draw.scene.label([edgeX + dir * 6, front.y + 18], side === 'left' ? 'L' : 'R', {
      size: 'tiny', align: 'left', baseline: 'middle', pen: 'guide'
    }));
  }

  function faceFrameScene(scene, model) {
    var cfg = modelConfig(model);
    var ff = cfg.faceFrame || {};
    var layout = (model && model.faceFrameLayout) || {};
    var members = Array.isArray(layout.members) ? layout.members : [];
    if (!members.length) {
      // Fallback frame derived from widths (only if the engine omitted the layout).
      var stile = ff.stileWidth || 57.15, top = ff.topRailWidth || 57.15, bottom = ff.bottomRailWidth || 57.15;
      var W = cfg.width, H = cfg.height;
      members = [
        { name: 'Left stile', x: 0, y: 0, w: stile, h: H, orientation: 'v' },
        { name: 'Right stile', x: W - stile, y: 0, w: stile, h: H, orientation: 'v' },
        { name: 'Top rail', x: stile, y: H - top, w: W - stile * 2, h: top, orientation: 'h' },
        { name: 'Bottom rail', x: stile, y: 0, w: W - stile * 2, h: bottom, orientation: 'h' }
      ];
    }
    members.forEach(function (member) {
      CS.draw.scene.add(scene, CS.draw.scene.rect(member.x, member.y, member.w, member.h, { pen: 'thin', fill: 'none' }));
    });
  }

  function toeKickScene(scene, model) {
    var cfg = modelConfig(model);
    var tk = cfg.toeKick || {};
    var dims = model.dims || {};
    var frontBottom = dims.frontBottomZ != null ? dims.frontBottomZ : tk.height;
    var style = dims.toeKickStyle || tk.style;
    if (!(frontBottom > 0) || !style || style === 'none') return;
    var W = cfg.width;
    CS.draw.scene.add(scene, CS.draw.scene.line([0, frontBottom], [W, frontBottom], { pen: 'cut' }));
    if (style === 'legs-levelers') {
      CS.draw.scene.add(scene, CS.draw.scene.label([W / 2, frontBottom / 2], 'LEVELLERS', {
        size: 'tiny', align: 'center', baseline: 'middle', pen: 'guide'
      }));
    } else {
      CS.draw.scene.add(scene, CS.draw.scene.line([0, 0], [0, frontBottom], { pen: 'thin' }));
      CS.draw.scene.add(scene, CS.draw.scene.line([W, 0], [W, frontBottom], { pen: 'thin' }));
    }
  }

  /** Front elevation, dimensions and annotation. opts.compact omits dims/title. */
  function cabinetFront(model, opts) {
    opts = opts || {};
    var cfg = modelConfig(model);
    if (!cfg.width || !cfg.height) return CS.draw.scene.finalize(CS.draw.scene.scene({ view: 'front' }));
    var scene = CS.draw.scene.scene({ view: 'front', title: cfg.tag || '', scaleHint: '1:5' });
    var W = cfg.width, H = cfg.height;

    CS.draw.scene.add(scene, CS.draw.scene.rect(0, 0, W, H, { pen: 'cut', fill: 'none' }));
    if (cfg.construction && cfg.construction.system === 'faceframe') faceFrameScene(scene, model);
    toeKickScene(scene, model);

    var fl = frontLayout(model);
    fl.drawerFronts.forEach(function (front) {
      var f = Object.assign({ kind: 'drawer' }, front);
      frontPanel(scene, f, cfg, opts);
      if (!opts.compact) pullSymbol(scene, f, cfg);
    });
    fl.doors.forEach(function (front) {
      var f = Object.assign({ kind: 'door' }, front);
      frontPanel(scene, f, cfg, opts);
      if (!opts.compact) { pullSymbol(scene, f, cfg); hingeMarks(scene, f); }
    });

    if (cfg.front && cfg.front.type === 'open') {
      var dims = model.dims || {};
      var left = dims.interiorWidth != null ? (W - dims.interiorWidth) / 2 : 18;
      var right = left + (dims.interiorWidth != null ? dims.interiorWidth : W - 36);
      (model.parts || []).forEach(function (part) {
        if (part.group !== 'Shelves' || !part.box) return;
        var zz = part.box.z + part.box.h;
        CS.draw.scene.add(scene, CS.draw.scene.line([left, zz], [right, zz], { pen: 'thin' }));
      });
    }

    if (!opts.compact) {
      addDim(scene, [0, 0], [W, 0], -55, 'h');
      addDim(scene, [0, 0], [0, H], -55, 'v');
      CS.draw.scene.add(scene, CS.draw.scene.label([0, H + 42], (cfg.tag || '') + '  ' + (cfg.name || ''), {
        size: 'large', bold: true, align: 'left', baseline: 'bottom'
      }));
      CS.draw.scene.add(scene, CS.draw.scene.label([0, H + 20], 'FRONT ELEVATION', {
        size: 'small', align: 'left', baseline: 'bottom', pen: 'dim'
      }));
    }
    return CS.draw.scene.finalize(scene);
  }

  function formatSize(w, h, d, units) {
    units = units || 'imperial';
    return 'W ' + CS.units.formatDim(w, units) + '  H ' + CS.units.formatDim(h, units) + '  D ' + CS.units.formatDim(d, units);
  }

  function profileFill(part, opts) {
    if (opts && opts.highlight && opts.highlight[part.id]) return 'medium';
    return GROUP_FILL[part.group] || 'none';
  }

  /** Side vertical section through the middle of the cabinet. */
  function cabinetSideSection(model, opts) {
    opts = opts || {};
    var cfg = modelConfig(model);
    var scene = CS.draw.scene.scene({ view: 'side', title: 'SIDE SECTION' });
    if (!cfg.width) return CS.draw.scene.finalize(scene);
    var D = cfg.depth, H = cfg.height;

    CS.draw.scene.add(scene, CS.draw.scene.rect(0, 0, D, H, { pen: 'cut', fill: 'none' }));

    (model.parts || []).forEach(function (part) {
      var b = part.box;
      if (!b || b.d < 0.5 || b.h < 0.5) return;
      if (part.group === 'Hardware') return;
      var fill = profileFill(part, opts);
      // Side view: horizontal axis = depth (y), vertical = height (z).
      var x = b.y, y = b.z, w = b.d, h = b.h;
      CS.draw.scene.add(scene, CS.draw.scene.rect(x, y, w, h, { pen: 'thin', fill: fill }));
      // Panels cut by the vertical section plane are hatched.
      var spansWidth = b.w > (model.dims ? model.dims.interiorWidth * 0.7 : cfg.width * 0.6);
      if (spansWidth && h < 60) {
        CS.draw.scene.add(scene, CS.draw.scene.hatch([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], {
          angle: 45, spacing: 4, pen: 'thin'
        }));
      }
    });

    // Fronts in profile at the door face.
    var fl = frontLayout(model);
    fl.doors.forEach(function (f) {
      var y = f.y, h = f.h, d = (cfg.front && cfg.front.doors && cfg.front.doors.thickness) || 19;
      var frontD = f.overlay === 'inset' ? (cfg.construction.system === 'faceframe' ? (cfg.faceFrame.thickness || 19) : d) : d;
      var x = f.overlay === 'inset' ? D - frontD : D; // overlay fronts sit outside the carcass envelope
      CS.draw.scene.add(scene, CS.draw.scene.rect(x, y, frontD, h, { pen: 'cut', fill: 'medium' }));
    });

    addDim(scene, [0, 0], [D, 0], -55, 'h');
    addDim(scene, [0, 0], [0, H], -55, 'v');
    var tk = cfg.toeKick || {};
    var frontBottom = model.dims && model.dims.frontBottomZ != null ? model.dims.frontBottomZ : tk.height;
    var tkStyle = (model.dims && model.dims.toeKickStyle) || tk.style;
    if (frontBottom > 0 && tkStyle !== 'none') {
      addDim(scene, [0, 0], [0, frontBottom], -115, 'v', CS.units.formatDim(frontBottom, opts.units));
      CS.draw.scene.add(scene, CS.draw.scene.label([D + 24, frontBottom + 6], (tkStyle === 'legs-levelers' ? 'LEVELERS ' : 'TOE KICK ') + CS.units.formatDim(frontBottom, opts.units), {
        size: 'tiny', pen: 'guide'
      }));
    }
    CS.draw.scene.add(scene, CS.draw.scene.label([0, H + 26], 'SECTION A\u2013A', {
      size: 'small', bold: true, pen: 'dim'
    }));
    CS.draw.scene.add(scene, CS.draw.scene.marker('section', [D + 50, H / 2], { label: 'A' }));
    CS.draw.scene.add(scene, CS.draw.scene.marker('section', [D / 2, H + 70], { label: 'A', angle: 90 }));
    return CS.draw.scene.finalize(scene);
  }

  /** Horizontal plan section through the cabinet interior. */
  function cabinetPlanSection(model, opts) {
    opts = opts || {};
    var cfg = modelConfig(model);
    var scene = CS.draw.scene.scene({ view: 'plan', title: 'PLAN SECTION' });
    if (!cfg.width) return CS.draw.scene.finalize(scene);
    var W = cfg.width, D = cfg.depth;

    CS.draw.scene.add(scene, CS.draw.scene.rect(0, 0, W, D, { pen: 'cut', fill: 'none' }));

    var cutZ = (model.dims && model.dims.frontBottomZ != null ? model.dims.frontBottomZ + model.dims.frontHeight * 0.5 : cfg.height * 0.55);
    (model.parts || []).forEach(function (part) {
      var b = part.box;
      if (!b) return;
      if (part.group === 'Hardware') return;
      if (b.z > cutZ || b.z + b.h < cutZ) return;
      // Plan: x across width, y from front (bottom of view) towards the back.
      var x = b.x;
      var y = D - (b.y + b.d);
      CS.draw.scene.add(scene, CS.draw.scene.rect(x, y, b.w, b.d, { pen: 'thin', fill: 'light' }));
    });

    var fl = frontLayout(model);
    var frontFill = 'medium';
    fl.doors.concat(fl.drawerFronts).forEach(function (f) {
      var thick = (cfg.front.doors && cfg.front.doors.thickness) || 19;
      var x = f.x;
      // Plan view has the front edge at y=0; overlay fronts project outside it, inset fronts sit flush.
      var y = f.overlay === 'inset' ? 0 : -thick;
      CS.draw.scene.add(scene, CS.draw.scene.rect(x, y, f.w, thick, { pen: 'cut', fill: frontFill }));
    });

    addDim(scene, [0, 0], [W, 0], -55, 'h');
    addDim(scene, [0, 0], [0, D], -55, 'v');
    CS.draw.scene.add(scene, CS.draw.scene.label([0, D + 30], 'PLAN SECTION', {
      size: 'small', bold: true, pen: 'dim'
    }));
    return CS.draw.scene.finalize(scene);
  }

  function copySceneItems(target, source, dx, dy) {
    (source.items || []).forEach(function (item) {
      var copy = JSON.parse(JSON.stringify(item));
      CS.draw.scene.offset({ items: [copy] }, dx, dy);
      CS.draw.scene.add(target, copy);
    });
  }

  /** All cabinets side by side, at floor/counter/wall reference lines. */
  function elevationLineup(resolved, opts) {
    opts = opts || {};
    var cabinets = (resolved && resolved.cabinets) || [];
    var scene = CS.draw.scene.scene({ view: 'front', title: 'CABINET ELEVATION LINEUP' });
    var gap = 120;
    var x = 0;
    var maxBaseHeight = 0;
    var totalWidth = 0;
    var tagLabels = [];

    cabinets.forEach(function (model) {
      var cfg = modelConfig(model);
      var panel = cabinetFront(model, { compact: true, units: opts.units });
      var y = 0;
      if (cfg.type === 'wall') y = COUNTER_HEIGHT + WALL_ABOVE_COUNTER;
      copySceneItems(scene, panel, x, y);
      tagLabels.push({ x: x + cfg.width / 2, y: y - 32, tag: cfg.tag, name: cfg.name, type: cfg.type });
      if (cfg.type !== 'wall') maxBaseHeight = Math.max(maxBaseHeight, cfg.height);
      x += cfg.width + gap;
      totalWidth += cfg.width + gap;
    });
    totalWidth = Math.max(0, totalWidth - gap);

    // Reference lines behind the cabinets.
    CS.draw.scene.add(scene, CS.draw.scene.line([-gap / 2, 0], [totalWidth + gap / 2, 0], { pen: 'cut' }));
    CS.draw.scene.add(scene, CS.draw.scene.line([-gap / 2, COUNTER_HEIGHT], [totalWidth + gap / 2, COUNTER_HEIGHT], { pen: 'dash' }));
    CS.draw.scene.add(scene, CS.draw.scene.label([-gap / 2 + 10, COUNTER_HEIGHT + 14], 'COUNTER ' + CS.units.formatDim(COUNTER_HEIGHT, opts.units), {
      size: 'tiny', pen: 'guide'
    }));
    CS.draw.scene.add(scene, CS.draw.scene.label([-gap / 2 + 10, 14], 'FLOOR', { size: 'tiny', pen: 'guide' }));

    tagLabels.forEach(function (t) {
      CS.draw.scene.add(scene, CS.draw.scene.label([t.x, t.y], t.tag, {
        size: 'large', bold: true, align: 'center', baseline: 'top'
      }));
      CS.draw.scene.add(scene, CS.draw.scene.label([t.x, t.y - 26], t.type.toUpperCase(), {
        size: 'tiny', align: 'center', baseline: 'top', pen: 'guide'
      }));
    });
    return CS.draw.scene.finalize(scene);
  }

  /** Nesting diagram for one sheet. */
  function sheetLayoutScene(layout, sheetIndex, opts) {
    opts = opts || {};
    var scene = CS.draw.scene.scene({ view: 'sheet', title: 'SHEET LAYOUT' });
    var sheet = (layout && layout.sheet) || { width: 1220, height: 2440 };
    var sheets = (layout && layout.sheets) || [];
    var current = sheets[sheetIndex || 0];
    if (!current) {
      CS.draw.scene.add(scene, CS.draw.scene.label([0, sheet.height / 2], 'No sheet layout available', {
        size: 'normal', align: 'center', baseline: 'middle', pen: 'guide'
      }));
      return CS.draw.scene.finalize(scene);
    }
    CS.draw.scene.add(scene, CS.draw.scene.rect(0, 0, sheet.width, sheet.height, { pen: 'cut', fill: 'none' }));
    (current.placements || []).forEach(function (p) {
      CS.draw.scene.add(scene, CS.draw.scene.rect(p.x, p.y, p.width, p.height, { pen: 'thin', fill: 'light' }));
      var label = p.label || p.key || '';
      if (p.width > 180 && p.height > 60) {
        CS.draw.scene.add(scene, CS.draw.scene.label([p.x + p.width / 2, p.y + p.height / 2], label, {
          size: 'tiny', align: 'center', baseline: 'middle', angle: p.rotated ? 90 : 0
        }));
        var gx1 = p.x + p.width * 0.15, gx2 = p.x + p.width * 0.85;
        var gy = p.y + Math.max(12, p.height * 0.12);
        if (p.grain === 'length' || p.grain === 'width') {
          CS.draw.scene.add(scene, CS.draw.scene.line([gx1, gy], [gx2, gy], { pen: 'guide' }));
          CS.draw.scene.add(scene, CS.draw.scene.line([gx2, gy], [gx2 - 12, gy - 5], { pen: 'guide' }));
          CS.draw.scene.add(scene, CS.draw.scene.line([gx2, gy], [gx2 - 12, gy + 5], { pen: 'guide' }));
        }
      }
    });
    CS.draw.scene.add(scene, CS.draw.scene.label([0, sheet.height + 52], (layout.materialName || '') + ' \u2014 ' + (sheet.label || (sheet.width + ' \u00d7 ' + sheet.height + ' mm')) + ' \u2014 sheet ' + ((sheetIndex || 0) + 1) + ' of ' + sheets.length, {
      size: 'small', bold: true
    }));
    CS.draw.scene.add(scene, CS.draw.scene.label([0, sheet.height + 30], 'Kerf ' + CS.units.formatDim(layout.kerf || 0, opts.units) + ' \u00b7 trim ' + CS.units.formatDim(layout.trim || 0, opts.units) + ' \u00b7 grain runs along the long sheet dimension', {
      size: 'tiny', pen: 'guide'
    }));
    CS.draw.scene.add(scene, CS.draw.scene.label([sheet.width, sheet.height + 32], 'UTILIZATION ' + ((current.utilization != null ? current.utilization : (100 - (current.wastePct || 0))).toFixed(1)) + '%', {
      size: 'small', align: 'right', pen: 'dim'
    }));
    return CS.draw.scene.finalize(scene);
  }

  /** Whole-cabinet isometric, assembled by default (or exploded via opts). */
  function cabinetIso(model, opts) {
    opts = opts || {};
    return CS.draw.iso.cabinetScene(model, {
      labels: !!opts.labels,
      highlightPartIds: opts.highlightPartIds || [],
      explodeOffsets: opts.explodeOffsets || {},
      ghost: !!opts.ghost,
      showHardware: !!opts.showHardware
    });
  }

  CS.draw.views = {
    COUNTER_HEIGHT: COUNTER_HEIGHT,
    WALL_ABOVE_COUNTER: WALL_ABOVE_COUNTER,
    cabinetFront: cabinetFront,
    cabinetSideSection: cabinetSideSection,
    cabinetPlanSection: cabinetPlanSection,
    cabinetIso: cabinetIso,
    elevationLineup: elevationLineup,
    sheetLayoutScene: sheetLayoutScene,
    sheetLayout: sheetLayoutScene, // compatibility alias
    frontPanelDetails: frontPanelDetails,
    formatSize: formatSize
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.draw.views;
})(typeof globalThis !== 'undefined' ? globalThis : this);
