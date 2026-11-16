/* Cabinet Studio — component (part) technical drawings.
 *
 * partFace: the face with dimensions, machining, edgeband and grain.
 * partEdge: a single edge profile (thickness) view.
 * partEdgeStrip: all four edge profiles composed into one scene.
 * machiningRows: a normalised feature table for the PDF plan set.
 *
 * Machining coordinates are millimetres from the bottom-left of the drawn face.
 * Face B views are mirrored horizontally, as if the part were flipped over.
 *
 * Classic script; attaches to CS.draw.parts and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});
  CS.draw = CS.draw || {};

  var OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left', front: 'back', back: 'front' };

  function partLength(part) { return part.length || part.width || 1; }
  function partWidth(part) { return part.width || 1; }
  function partThickness(part) { return part.thickness || 18; }
  function units(opts) { return (opts && opts.units) || 'imperial'; }

  function addLabel(scene, p, text, opts) {
    CS.draw.scene.add(scene, CS.draw.scene.label(p, text, Object.assign({
      size: 'tiny', align: 'center', baseline: 'middle'
    }, opts || {})));
  }

  function edgeName(part, edge) {
    var view = part.view || {};
    if (edge === 'top') return view.up || 'top';
    if (edge === 'bottom') return OPPOSITE[view.up || 'top'];
    if (edge === 'left') return view.left || 'left';
    if (edge === 'right') return OPPOSITE[view.left || 'left'];
    return edge;
  }

  function format(part, opts, value) {
    return CS.units.formatDim(value, units(opts));
  }

  /** Physical edge name -> drawn-face edge name ('top'/'bottom'/'left'/'right'). */
  function physicalToDrawn(part, physical) {
    var mapping = {
      top: edgeName(part, 'top'),
      bottom: edgeName(part, 'bottom'),
      left: edgeName(part, 'left'),
      right: edgeName(part, 'right')
    };
    var drawn = null;
    Object.keys(mapping).forEach(function (key) {
      if (mapping[key] === physical) drawn = key;
    });
    return drawn;
  }

  function bandedEdges(part) {
    var eb = part.edgeband;
    if (!eb) return [];
    return Array.isArray(eb.edges) ? eb.edges : [];
  }

  function drawEdgeband(scene, part, edge) {
    var L = partLength(part), W = partWidth(part);
    var pen = 'thin';
    if (edge === 'top') CS.draw.scene.add(scene, CS.draw.scene.line([0, W - 1.5], [L, W - 1.5], { pen: pen }));
    if (edge === 'bottom') CS.draw.scene.add(scene, CS.draw.scene.line([0, 1.5], [L, 1.5], { pen: pen }));
    if (edge === 'left') CS.draw.scene.add(scene, CS.draw.scene.line([1.5, 0], [1.5, W], { pen: pen }));
    if (edge === 'right') CS.draw.scene.add(scene, CS.draw.scene.line([L - 1.5, 0], [L - 1.5, W], { pen: pen }));
  }

  function mirrored(part, face, point) {
    // Face B is drawn as the part flipped about the vertical axis.
    return face === 'B' ? [partLength(part) - point[0], point[1]] : [point[0], point[1]];
  }

  function expandMachining(machining) {
    var out = [];
    (machining || []).forEach(function (m) {
      if (!m) return;
      if (m.type === 'drill-pattern') {
        var rows = Math.max(1, Math.round(m.rows || 1));
        var cols = Math.max(1, Math.round(m.cols || 1));
        for (var i = 0; i < rows; i++) {
          for (var j = 0; j < cols; j++) {
            out.push({
              type: 'hole', face: m.face || 'A',
              x: (m.x || 0) + j * (m.dx || 0),
              y: (m.y || 0) + i * (m.dy || 0),
              diameter: m.diameter || m.d || 5,
              depth: m.depth,
              purpose: m.purpose || '',
              note: m.note || ''
            });
          }
        }
      } else {
        out.push(m);
      }
    });
    return out;
  }

  function holeCircles(scene, part, machining, face) {
    machining.forEach(function (m) {
      if (m.type !== 'hole' || (m.face || 'A') !== face) return;
      var p = mirrored(part, face, [m.x || 0, m.y || 0]);
      var d = m.diameter || 5;
      CS.draw.scene.add(scene, CS.draw.scene.circle(p, d / 2, {
        pen: 'thin',
        fill: d > 20 ? 'paper' : 'none'
      }));
      if (d >= 20) {
        var r = d / 2 + 3;
        CS.draw.scene.add(scene, CS.draw.scene.line([p[0] - r, p[1]], [p[0] + r, p[1]], { pen: 'center' }));
        CS.draw.scene.add(scene, CS.draw.scene.line([p[0], p[1] - r], [p[0], p[1] + r], { pen: 'center' }));
      }
    });
  }

  function grooveShapes(scene, part, machining, face) {
    machining.forEach(function (m) {
      if (m.type !== 'groove' || (m.face || 'A') !== face) return;
      var a = mirrored(part, face, [m.x1 || 0, m.y1 || 0]);
      var b = mirrored(part, face, [m.x2 || 0, m.y2 || 0]);
      var w = m.width || 6;
      if (Math.abs(a[1] - b[1]) < 0.01) {
        // horizontal groove
        var x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]);
        CS.draw.scene.add(scene, CS.draw.scene.rect(x1, a[1] - w / 2, x2 - x1, w, { pen: 'thin', fill: 'light' }));
      } else if (Math.abs(a[0] - b[0]) < 0.01) {
        var y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]);
        CS.draw.scene.add(scene, CS.draw.scene.rect(a[0] - w / 2, y1, w, y2 - y1, { pen: 'thin', fill: 'light' }));
      }
    });
  }

  function edgeShapes(scene, part, machining, face) {
    var L = partLength(part), W = partWidth(part);
    machining.forEach(function (m) {
      if ((m.face || 'A') !== face) return;
      if (m.type === 'rabbet') {
        var w = m.width || 6, d = m.depth || 6;
        if (m.edge === 'left') CS.draw.scene.add(scene, CS.draw.scene.rect(0, 0, d, W, { pen: 'thin', fill: 'light' }));
        if (m.edge === 'right') CS.draw.scene.add(scene, CS.draw.scene.rect(L - d, 0, d, W, { pen: 'thin', fill: 'light' }));
        if (m.edge === 'top') CS.draw.scene.add(scene, CS.draw.scene.rect(0, W - d, L, d, { pen: 'thin', fill: 'light' }));
        if (m.edge === 'bottom') CS.draw.scene.add(scene, CS.draw.scene.rect(0, 0, L, d, { pen: 'thin', fill: 'light' }));
      }
      if (m.type === 'notch') {
        var nw = m.width || 10, nh = m.height || 10;
        var corner = m.corner || 'bl';
        var x = corner.charAt(1) === 'r' ? L - nw : 0;
        var y = corner.charAt(0) === 't' ? W - nh : 0;
        CS.draw.scene.add(scene, CS.draw.scene.rect(x, y, nw, nh, { pen: 'thin', fill: 'paper' }));
      }
    });
  }

  function grainArrow(scene, part) {
    if (!part.grain || part.grain === 'none') return;
    var L = partLength(part), W = partWidth(part);
    var vertical = part.grain === 'width';
    var x = L - 45, y = W - 45;
    if (vertical) {
      CS.draw.scene.add(scene, CS.draw.scene.line([x, y - 40], [x, y + 40], { pen: 'guide' }));
      CS.draw.scene.add(scene, CS.draw.scene.line([x, y + 40], [x - 6, y + 30], { pen: 'guide' }));
      CS.draw.scene.add(scene, CS.draw.scene.line([x, y + 40], [x + 6, y + 30], { pen: 'guide' }));
    } else {
      CS.draw.scene.add(scene, CS.draw.scene.line([x - 40, y], [x + 40, y], { pen: 'guide' }));
      CS.draw.scene.add(scene, CS.draw.scene.line([x - 40, y], [x - 30, y - 6], { pen: 'guide' }));
      CS.draw.scene.add(scene, CS.draw.scene.line([x - 40, y], [x - 30, y + 6], { pen: 'guide' }));
    }
    addLabel(scene, [x, y - 14], 'GRAIN', { align: 'center', pen: 'guide' });
  }

  function holeDimNotes(scene, part, machining) {
    var holes = machining.filter(function (m) { return m.type === 'hole' && (m.face || 'A') === 'A'; });
    if (!holes.length) return;
    // Hole positions are documented in the machining table; the drawing shows
    // the overall envelope plus the first-spacing clue for repetitive rows.
    if (holes.length > 2) {
      var ys = holes.map(function (h) { return h.y || 0; });
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      if (maxY - minY > 40) {
        var refY = holes[0].y || 0;
        CS.draw.scene.add(scene, CS.draw.scene.dim([0, refY], [0, 0], {
          offset: -95, orient: 'v', text: format(part, {}, refY), size: 'tiny'
        }));
      }
    }
  }

  /** Face drawing of a part: outline, machining, edgeband, grain, dims, title. */
  function partFace(part, opts) {
    opts = opts || {};
    var face = opts.face === 'B' ? 'B' : 'A';
    var L = partLength(part), W = partWidth(part), T = partThickness(part);
    var scene = CS.draw.scene.scene({ view: 'part', title: (part.label || '') + ' ' + (part.name || '') });
    var machining = expandMachining(part.machining);

    CS.draw.scene.add(scene, CS.draw.scene.rect(0, 0, L, W, { pen: 'cut', fill: 'none' }));

    bandedEdges(part).forEach(function (physicalEdge) {
      var drawnEdge = physicalToDrawn(part, physicalEdge);
      if (drawnEdge) drawEdgeband(scene, part, drawnEdge);
    });
    grooveShapes(scene, part, machining, face);
    edgeShapes(scene, part, machining, face);
    holeCircles(scene, part, machining, face);
    grainArrow(scene, part);

    if (opts.dimensions !== false) {
      CS.draw.scene.add(scene, CS.draw.scene.dim([0, 0], [L, 0], { offset: -38, orient: 'h', size: 'small' }));
      CS.draw.scene.add(scene, CS.draw.scene.dim([0, 0], [0, W], { offset: -38, orient: 'v', size: 'small' }));
      holeDimNotes(scene, part, machining);
    }

    if (opts.labels !== false) {
      addLabel(scene, [L / 2, W + 18], 'FACE ' + face, { size: 'small', bold: true });
      var up = edgeName(part, 'top'), bottom = edgeName(part, 'bottom');
      var left = edgeName(part, 'left'), right = edgeName(part, 'right');
      addLabel(scene, [L / 2, W + 40], String(up).toUpperCase(), { pen: 'guide' });
      addLabel(scene, [L / 2, -18], String(bottom).toUpperCase(), { pen: 'guide' });
      addLabel(scene, [-14, W / 2], String(left).toUpperCase(), { align: 'right', pen: 'guide' });
      addLabel(scene, [L + 14, W / 2], String(right).toUpperCase(), { align: 'left', pen: 'guide' });
      CS.draw.scene.add(scene, CS.draw.scene.label([L, W + 18], 'T ' + format(part, opts, T), {
        size: 'small', align: 'right', baseline: 'middle', pen: 'dim'
      }));
    }

    if (opts.title !== false) {
      CS.draw.scene.add(scene, CS.draw.scene.label([0, W + 74], (part.label || part.id) + '  \u00b7  ' + (part.name || ''), {
        size: 'large', bold: true, align: 'left', baseline: 'bottom'
      }));
      var meta = [];
      if (part.materialName) meta.push(part.materialName);
      if (part.thickness) meta.push(format(part, opts, part.thickness) + ' thick');
      if (part.grain && part.grain !== 'none') meta.push('grain ' + part.grain);
      CS.draw.scene.add(scene, CS.draw.scene.label([0, W + 54], meta.join('  \u00b7  '), {
        size: 'small', align: 'left', baseline: 'bottom', pen: 'guide'
      }));
      if (bandedEdges(part).length) {
        CS.draw.scene.add(scene, CS.draw.scene.label([L, W + 54], 'EDGEBAND: ' + bandedEdges(part).join(', ').toUpperCase(), {
          size: 'small', align: 'right', baseline: 'bottom', pen: 'guide'
        }));
      }
    }
    return CS.draw.scene.finalize(scene);
  }

  /**
   * One edge detail: a short excerpt of the edge shown at material thickness.
   * Full-length edge strips are unreadable at plan-set scale; the detail shows
   * the banding, rabbet and thickness the way a shop drawing does.
   */
  function partEdge(part, opts) {
    opts = opts || {};
    var physicalEdge = opts.edge || 'top';
    var T = partThickness(part);
    var excerpt = opts.excerpt || 160;
    var scene = CS.draw.scene.scene({ view: 'part', title: (part.label || '') + ' ' + physicalEdge + ' edge detail' });
    CS.draw.scene.add(scene, CS.draw.scene.rect(0, 0, excerpt, T, { pen: 'cut', fill: 'light' }));
    var banded = bandedEdges(part).indexOf(physicalEdge) >= 0;
    if (banded) {
      var bandThickness = Math.max(1.2, (part.edgeband && part.edgeband.thickness) || 0.5);
      CS.draw.scene.add(scene, CS.draw.scene.rect(0, T, excerpt, bandThickness * 6, { pen: 'thin', fill: 'dark' }));
    }
    // Rabbet on this edge shows as a step in the profile.
    expandMachining(part.machining).forEach(function (m) {
      if (m.type === 'rabbet' && m.edge === physicalEdge) {
        var w = Math.min(m.width || 6, excerpt * 0.5), d = m.depth || 6;
        CS.draw.scene.add(scene, CS.draw.scene.rect(0, T - d, w, d, { pen: 'thin', fill: 'paper' }));
      }
    });
    if (opts.dimensions !== false) {
      CS.draw.scene.add(scene, CS.draw.scene.dim([0, 0], [0, T], { offset: -24, orient: 'v', size: 'tiny', text: CS.units.formatDim(T, units(opts)) }));
      CS.draw.scene.add(scene, CS.draw.scene.label([excerpt, T + 28], 'TYP.', {
        size: 'tiny', align: 'right', baseline: 'middle', pen: 'dim'
      }));
    }
    CS.draw.scene.add(scene, CS.draw.scene.label([0, T + 28], physicalEdge.toUpperCase() + ' EDGE' + (banded ? ' \u2014 BANDED' : ''), {
      size: 'tiny', bold: true, align: 'left', baseline: 'middle'
    }));
    return CS.draw.scene.finalize(scene);
  }

  /** Compact 2x2 grid of the four edge details, for a component sheet. */
  function partEdgeStrip(part, opts) {
    opts = opts || {};
    var scene = CS.draw.scene.scene({ view: 'part', title: (part.label || '') + ' edge details' });
    var edges = opts.edges || [
      edgeName(part, 'top'), edgeName(part, 'right'), edgeName(part, 'bottom'), edgeName(part, 'left')
    ];
    var excerpt = 160;
    var cellW = excerpt + 70;
    var cellH = Math.max(80, partThickness(part) + 100);
    edges.forEach(function (edge, index) {
      if (index > 3) return;
      var sub = partEdge(part, Object.assign({}, opts, { edge: edge, title: false }));
      var col = index % 2, row = Math.floor(index / 2);
      var x = col * cellW + 24;
      var y = row * cellH + 34;
      var b = sub.bounds;
      (sub.items || []).forEach(function (item) {
        var copy = JSON.parse(JSON.stringify(item));
        // Place the sub-scene so its outer profile starts at (x, y).
        CS.draw.scene.offset({ items: [copy] }, x - b.minX, y - b.minY);
        CS.draw.scene.add(scene, copy);
      });
    });
    return CS.draw.scene.finalize(scene);
  }

  /** Simple isometric slab carrying the part label, material and grain. */
  function partIso(part, opts) {
    opts = opts || {};
    var L = partLength(part), W = partWidth(part), T = partThickness(part);
    var scene = CS.draw.iso.boxScene([
      { x: 0, y: 0, z: 0, w: L, d: T, h: W, fill: 'light', pen: 'thin' }
    ], { title: (part.label || '') + ' ' + (part.name || '') });
    CS.draw.scene.add(scene, CS.draw.scene.label([0, -T - 60], (part.label || part.id) + '  ' + (part.name || ''), {
      size: 'small', bold: true
    }));
    return CS.draw.scene.finalize(scene);
  }

  /** Normalised machining rows for the plan-set table. */
  function machiningRows(part) {
    var rows = [];
    expandMachining(part.machining).forEach(function (m) {
      if (!m) return;
      if (m.type === 'hole') {
        rows.push({
          feature: 'Hole', face: m.face || 'A', purpose: m.purpose || '',
          x: m.x || 0, y: m.y || 0,
          size: '\u00d8' + (m.diameter || 5),
          depth: m.depth ? String(m.depth) : 'through'
        });
      } else if (m.type === 'groove') {
        rows.push({
          feature: 'Groove', face: m.face || 'A', purpose: m.purpose || '',
          x: m.x1 || 0, y: m.y1 || 0,
          size: (m.width || 6) + ' wide', depth: (m.depth || 6) + ' deep',
          to: [(m.x2 == null ? m.x1 : m.x2) || 0, (m.y2 == null ? m.y1 : m.y2) || 0]
        });
      } else if (m.type === 'rabbet') {
        rows.push({
          feature: 'Rabbet', face: m.face || 'A', purpose: m.purpose || '',
          x: null, y: null, size: m.edge + ' edge', depth: (m.width || 6) + ' \u00d7 ' + (m.depth || 6)
        });
      } else if (m.type === 'notch') {
        rows.push({
          feature: 'Notch', face: m.face || 'A', purpose: m.purpose || '',
          x: null, y: null, size: (m.width || 10) + ' \u00d7 ' + (m.height || 10), depth: m.corner || ''
        });
      }
    });
    return rows;
  }

  CS.draw.parts = {
    partFace: partFace,
    partEdge: partEdge,
    partEdgeStrip: partEdgeStrip,
    partIso: partIso,
    machiningRows: machiningRows,
    edgeName: edgeName,
    physicalToDrawn: physicalToDrawn,
    expandMachining: expandMachining
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.draw.parts;
})(typeof globalThis !== 'undefined' ? globalThis : this);
