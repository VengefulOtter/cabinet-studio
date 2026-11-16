/* Cabinet Studio — isometric 3D-to-2D projection for cabinet and assembly views.
 *
 * Cabinet coordinates: x = left→right, y = back→front, z = up (millimetres),
 * origin at the bottom-left-back corner. Projection is a true isometric with z
 * vertical on the page. Filled boxes are painted back-to-front so a whole cabinet
 * reads clearly in both the app preview and the PDF.
 *
 * Classic script; attaches to CS.draw.iso and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});
  CS.draw = CS.draw || {};

  var COS30 = Math.cos(Math.PI / 6);
  var SIN30 = Math.sin(Math.PI / 6);

  var GROUP_FILLS = {
    'Carcass': 'light',
    'Back': 'medium',
    'Shelves': 'light',
    'Doors': 'medium',
    'Drawers': 'medium',
    'Face frame': 'medium',
    'Toe kick': 'dark',
    'Hardware': 'solid'
  };

  function project(x, y, z) {
    return [(x - y) * COS30, z - (x + y) * SIN30];
  }

  function boxCorners(box) {
    var x0 = box.x, y0 = box.y, z0 = box.z;
    var x1 = box.x + box.w, y1 = box.y + box.d, z1 = box.z + box.h;
    return {
      x0: x0, y0: y0, z0: z0, x1: x1, y1: y1, z1: z1,
      // visible faces of a front-top-right isometric
      top: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      front: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      right: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]
    };
  }

  function faceToScene(face, fill, pen) {
    var pts = face.map(function (p) { return project(p[0], p[1], p[2]); });
    return CS.draw.scene.poly(pts, { closed: true, fill: fill, pen: pen || 'thin' });
  }

  function partFill(part, opts) {
    if (opts.highlight && opts.highlight[part.id]) return 'dark';
    if (opts.ghost && !opts.ghost[part.id]) return 'paper';
    return GROUP_FILLS[part.group] || 'light';
  }

  function partBox(part) {
    return part.box || { x: 0, y: 0, z: 0, w: part.length || 1, d: part.thickness || 1, h: part.width || 1 };
  }

  /**
   * Build an isometric scene from a CabinetModel.
   * opts: { step, explodeOffsets, highlightPartIds:[], ghost:boolean, labels:boolean,
   *         showHardware:boolean, includePartIds:[], hidePartIds:[] }
   */
  function cabinetScene(cabinetModel, opts) {
    opts = opts || {};
    var scene = CS.draw.scene.scene({ view: 'iso', title: opts.title || (cabinetModel.config ? cabinetModel.config.tag : '') });
    var highlight = {};
    (opts.highlightPartIds || []).forEach(function (id) { highlight[id] = true; });
    var visible = null;
    if (opts.includePartIds) {
      visible = {};
      opts.includePartIds.forEach(function (id) { visible[id] = true; });
    }
    var hide = {};
    (opts.hidePartIds || []).forEach(function (id) { hide[id] = true; });

    var boxes = [];
    (cabinetModel.parts || []).forEach(function (part) {
      if (!part.box) return;
      if (hide[part.id]) return;
      if (part.group === 'Hardware' && !opts.showHardware) return;
      if (visible && !visible[part.id]) return;
      var off = (opts.explodeOffsets && opts.explodeOffsets[part.id]) || [0, 0, 0];
      var box = partBox(part);
      var moved = {
        x: box.x + off[0], y: box.y + off[1], z: box.z + off[2],
        w: Math.max(0.1, box.w), d: Math.max(0.1, box.d), h: Math.max(0.1, box.h)
      };
      boxes.push({ part: part, box: moved, depth: moved.x + moved.y + moved.z });
    });

    boxes.sort(function (a, b) { return a.depth - b.depth; });
    boxes.forEach(function (entry) {
      var corners = boxCorners(entry.box);
      var isHighlight = !!(opts.highlightPartIds && highlight[entry.part.id]);
      var ghost = opts.ghost && !isHighlight;
      var fill = ghost ? 'paper' : (isHighlight ? 'dark' : (GROUP_FILLS[entry.part.group] || 'light'));
      var pen = ghost ? 'guide' : (isHighlight ? 'cut' : 'thin');
      // Paint order per box: back/top, sides, front.
      CS.draw.scene.add(scene, faceToScene(corners.top, fill, pen));
      CS.draw.scene.add(scene, faceToScene(corners.right, ghost ? 'paper' : (isHighlight ? 'medium' : fill), pen));
      CS.draw.scene.add(scene, faceToScene(corners.front, ghost ? 'paper' : (isHighlight ? 'light' : fill), pen));
    });

    // Labels for highlighted parts (or all when labels requested).
    if (opts.labels) {
      boxes.forEach(function (entry) {
        var isHighlight = !opts.highlightPartIds || !opts.highlightPartIds.length || highlight[entry.part.id];
        if (!isHighlight || entry.part.group === 'Hardware') return;
        var b = entry.box;
        var c = project(b.x + b.w / 2, b.y + b.d / 2, b.z + b.h / 2);
        CS.draw.scene.add(scene, CS.draw.scene.label(c, entry.part.label || entry.part.id, {
          size: 'tiny', align: 'center', baseline: 'middle', bg: true
        }));
      });
    }
    return CS.draw.scene.finalize(scene);
  }

  /** Project a simple list of boxes: [{x,y,z,w,d,h,fill,pen}] -> Scene. */
  function boxScene(boxes, opts) {
    opts = opts || {};
    var scene = CS.draw.scene.scene({ view: 'iso', title: opts.title || '' });
    var sorted = (boxes || []).slice().sort(function (a, b) {
      return (a.x + a.y + a.z) - (b.x + b.y + b.z);
    });
    sorted.forEach(function (b) {
      var bo = { x: b.x || 0, y: b.y || 0, z: b.z || 0, w: b.w || 1, d: b.d || 1, h: b.h || 1 };
      var c = boxCorners(bo);
      var fill = b.fill || opts.fill || 'light';
      var pen = b.pen || opts.pen || 'thin';
      CS.draw.scene.add(scene, faceToScene(c.top, fill, pen));
      CS.draw.scene.add(scene, faceToScene(c.right, fill, pen));
      CS.draw.scene.add(scene, faceToScene(c.front, fill, pen));
    });
    return CS.draw.scene.finalize(scene);
  }

  /** Project a 3D point list to 2D (for line drawings and labels). */
  function projectPoints3D(points) {
    return (points || []).map(function (p) { return project(p[0], p[1], p[2]); });
  }

  CS.draw.scene = CS.draw.scene || {};
  // Convenience aliases used by earlier engine smoke tests.
  CS.draw.scene.cabinetScene = cabinetScene;
  CS.draw.scene.boxScene = boxScene;

  CS.draw.iso = {
    project: project,
    projectPoints3D: projectPoints3D,
    cabinetScene: cabinetScene,
    boxScene: boxScene,
    GROUP_FILLS: GROUP_FILLS
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.draw.iso;
})(typeof globalThis !== 'undefined' ? globalThis : this);
