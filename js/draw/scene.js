/* Cabinet Studio — semantic 2D drawing scene.
 *
 * A Scene is a list of drawing primitives in model millimetres (y up). It is
 * rendered to canvas, PDF or any other paper backend by CS.draw.render, which
 * converts model coordinates to paper millimetres and draws annotation text at
 * a fixed paper size (so drawings stay legible at any scale).
 *
 * Classic script; attaches to CS.draw.scene and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});
  CS.draw = CS.draw || {};

  var PENS = ['cut', 'thin', 'hidden', 'dash', 'center', 'guide', 'dim'];
  var LABEL_SIZES = ['tiny', 'small', 'normal', 'large', 'heading', 'title'];
  var FILLS = ['none', 'paper', 'light', 'medium', 'dark', 'solid', 'hatch'];
  var ALIGNS = ['left', 'center', 'right'];
  var BASELINES = ['top', 'middle', 'bottom'];

  function finite(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function point(p) {
    return Array.isArray(p) && finite(p[0]) && finite(p[1]) ? [p[0], p[1]] : null;
  }

  function pick(value, allowed, fallback) {
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function add(scene, item) {
    if (!item || !scene) return null;
    if (item.t !== 'label' && item.t !== 'text') {
      // Guard geometry against NaN; surface the count for QA rather than drawing junk.
      if (item.t === 'line' && (!point(item.a) || !point(item.b))) { scene.meta.invalid = (scene.meta.invalid || 0) + 1; return null; }
      if ((item.t === 'poly') && (!Array.isArray(item.pts) || item.pts.some(function (p) { return !point(p); }))) { scene.meta.invalid = (scene.meta.invalid || 0) + 1; return null; }
      if (item.t === 'circle' && (!point(item.c) || !finite(item.r))) { scene.meta.invalid = (scene.meta.invalid || 0) + 1; return null; }
      if (item.t === 'arc' && (!point(item.c) || !finite(item.r))) { scene.meta.invalid = (scene.meta.invalid || 0) + 1; return null; }
      if (item.t === 'dim' && (!point(item.p1) || !point(item.p2) || !finite(item.offset))) { scene.meta.invalid = (scene.meta.invalid || 0) + 1; return null; }
      if (item.t === 'leader' && (!point(item.from) || !point(item.to))) { scene.meta.invalid = (scene.meta.invalid || 0) + 1; return null; }
      if (item.t === 'balloon' && !point(item.c)) { scene.meta.invalid = (scene.meta.invalid || 0) + 1; return null; }
      if (item.t === 'hatch' && (!Array.isArray(item.pts) || item.pts.some(function (p) { return !point(p); }))) { scene.meta.invalid = (scene.meta.invalid || 0) + 1; return null; }
    }
    scene.items.push(item);
    return item;
  }

  function scene(meta) {
    return {
      width: 0,
      height: 0,
      items: [],
      meta: Object.assign({ view: 'front', title: '' }, meta || {})
    };
  }

  function line(a, b, opts) {
    opts = opts || {};
    return { t: 'line', a: point(a), b: point(b), pen: pick(opts.pen, PENS, 'cut') };
  }

  function poly(pts, opts) {
    opts = opts || {};
    return {
      t: 'poly',
      pts: (pts || []).map(point).filter(Boolean),
      closed: opts.closed !== false,
      pen: pick(opts.pen, PENS, 'cut'),
      fill: pick(opts.fill, FILLS, 'none')
    };
  }

  function rect(x, y, w, h, opts) {
    return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], Object.assign({ closed: true }, opts || {}));
  }

  function circle(c, r, opts) {
    opts = opts || {};
    return { t: 'circle', c: point(c), r: r, pen: pick(opts.pen, PENS, 'cut'), fill: pick(opts.fill, FILLS, 'none') };
  }

  function arc(c, r, a0, a1, opts) {
    opts = opts || {};
    return { t: 'arc', c: point(c), r: r, a0: a0, a1: a1, pen: pick(opts.pen, PENS, 'cut') };
  }

  function label(p, text, opts) {
    opts = opts || {};
    return {
      t: 'label',
      p: point(p),
      text: String(text == null ? '' : text),
      size: pick(opts.size, LABEL_SIZES, 'normal'),
      align: pick(opts.align, ALIGNS, 'left'),
      baseline: pick(opts.baseline, BASELINES, 'bottom'),
      angle: finite(opts.angle) ? opts.angle : 0,
      bold: !!opts.bold,
      pen: pick(opts.pen, PENS, 'cut'),
      bg: !!opts.bg
    };
  }

  function dim(p1, p2, opts) {
    opts = opts || {};
    return {
      t: 'dim',
      p1: point(p1),
      p2: point(p2),
      offset: finite(opts.offset) ? opts.offset : 20,
      orient: opts.orient === 'h' || opts.orient === 'v' ? opts.orient : 'auto',
      text: opts.text == null ? null : String(opts.text),
      size: pick(opts.size, LABEL_SIZES, 'small'),
      pen: 'dim'
    };
  }

  function leader(from, to, text, opts) {
    opts = opts || {};
    return {
      t: 'leader',
      from: point(from),
      to: point(to),
      text: String(text == null ? '' : text),
      size: pick(opts.size, LABEL_SIZES, 'small'),
      align: pick(opts.align, ALIGNS, 'left'),
      pen: pick(opts.pen, PENS, 'thin')
    };
  }

  function balloon(c, text, opts) {
    opts = opts || {};
    return {
      t: 'balloon',
      c: point(c),
      r: finite(opts.r) ? opts.r : 3.6, // paper millimetres
      text: String(text == null ? '' : text),
      size: pick(opts.size, LABEL_SIZES, 'small'),
      pen: pick(opts.pen, PENS, 'thin')
    };
  }

  function hatch(pts, opts) {
    opts = opts || {};
    return {
      t: 'hatch',
      pts: (pts || []).map(point).filter(Boolean),
      angle: finite(opts.angle) ? opts.angle : 45,
      spacing: finite(opts.spacing) ? opts.spacing : 4,
      pen: pick(opts.pen, PENS, 'thin')
    };
  }

  function marker(kind, p, opts) {
    opts = opts || {};
    return {
      t: 'marker',
      kind: kind,
      p: point(p),
      angle: finite(opts.angle) ? opts.angle : 0,
      label: opts.label == null ? '' : String(opts.label),
      size: finite(opts.size) ? opts.size : 6,
      pen: pick(opts.pen, PENS, 'thin')
    };
  }

  function pointsOf(item) {
    switch (item.t) {
      case 'line': return [item.a, item.b];
      case 'poly': return item.pts;
      case 'circle': return [[item.c[0] - item.r, item.c[1] - item.r], [item.c[0] + item.r, item.c[1] + item.r]];
      case 'arc': {
        var pts = [];
        for (var a = item.a0; a <= item.a1 + 0.001; a += Math.PI / 18) {
          pts.push([item.c[0] + Math.cos(a) * item.r, item.c[1] + Math.sin(a) * item.r]);
        }
        return pts;
      }
      case 'label': case 'leader': case 'balloon': case 'marker': case 'dim': return [item.p1 || item.p || item.from || item.c];
      case 'hatch': return item.pts;
      default: return [];
    }
  }

  function bounds(sceneObj) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function visit(p) {
      if (!p) return;
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
    (sceneObj.items || []).forEach(function (item) {
      pointsOf(item).forEach(visit);
      if (item.t === 'dim') {
        // include the offset extension line so dimensions are not clipped
        if (item.orient === 'v') {
          visit([item.p1[0] + item.offset, item.p1[1]]);
          visit([item.p2[0] + item.offset, item.p2[1]]);
        } else if (item.orient === 'h') {
          visit([item.p1[0], item.p1[1] + item.offset]);
          visit([item.p2[0], item.p2[1] + item.offset]);
        } else {
          visit([item.p1[0], item.p1[1] + item.offset]);
          visit([item.p2[0], item.p2[1] + item.offset]);
        }
      }
      if (item.t === 'balloon') {
        visit([item.c[0] - item.r, item.c[1] - item.r]);
        visit([item.c[0] + item.r, item.c[1] + item.r]);
      }
    });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, width: maxX - minX, height: maxY - minY };
  }

  function finalize(sceneObj) {
    var b = bounds(sceneObj);
    sceneObj.bounds = b;
    sceneObj.width = b.width;
    sceneObj.height = b.height;
    sceneObj.meta.itemCount = sceneObj.items.length;
    return sceneObj;
  }

  function offset(sceneObj, dx, dy) {
    (sceneObj.items || []).forEach(function (item) {
      switch (item.t) {
        case 'line': item.a = [item.a[0] + dx, item.a[1] + dy]; item.b = [item.b[0] + dx, item.b[1] + dy]; break;
        case 'poly': case 'hatch': item.pts = item.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; }); break;
        case 'circle': case 'arc': item.c = [item.c[0] + dx, item.c[1] + dy]; break;
        case 'label': item.p = [item.p[0] + dx, item.p[1] + dy]; break;
        case 'leader': item.from = [item.from[0] + dx, item.from[1] + dy]; item.to = [item.to[0] + dx, item.to[1] + dy]; break;
        case 'balloon': item.c = [item.c[0] + dx, item.c[1] + dy]; break;
        case 'dim': item.p1 = [item.p1[0] + dx, item.p1[1] + dy]; item.p2 = [item.p2[0] + dx, item.p2[1] + dy]; break;
        case 'marker': item.p = [item.p[0] + dx, item.p[1] + dy]; break;
      }
    });
    return sceneObj;
  }

  function merge(scenes, opts) {
    opts = opts || {};
    var out = scene(opts.meta || {});
    var x = opts.x || 0, y = opts.y || 0;
    (scenes || []).forEach(function (s) {
      if (!s) return;
      var b = bounds(s);
      s.items.forEach(function (item) {
        var copy = JSON.parse(JSON.stringify(item));
        offset({ items: [copy] }, x - b.minX, y - b.minY);
        add(out, copy);
      });
      if (opts.advance === 'row') x += b.width + (opts.gap || 0);
      else if (opts.advance === 'column') y += b.height + (opts.gap || 0);
    });
    return finalize(out);
  }

  CS.draw.scene = {
    PENS: PENS,
    LABEL_SIZES: LABEL_SIZES,
    FILLS: FILLS,
    scene: scene,
    add: add,
    line: line,
    poly: poly,
    rect: rect,
    circle: circle,
    arc: arc,
    label: label,
    dim: dim,
    leader: leader,
    balloon: balloon,
    hatch: hatch,
    marker: marker,
    bounds: bounds,
    finalize: finalize,
    offset: offset,
    merge: merge
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.draw.scene;
})(typeof globalThis !== 'undefined' ? globalThis : this);
