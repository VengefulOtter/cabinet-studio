/* Cabinet Studio — scene renderer (model mm -> paper mm).
 *
 * Shared by the on-screen canvas previews and the PDF plan set. Backends receive
 * paper-space millimetres with y down from the top-left corner; this module owns
 * pen styles, dimension lines/arrows, leaders, balloons, hatches and text
 * placement so every output looks like the same drawing.
 *
 * Backend interface (all coordinates in paper mm, y down):
 *   line(x1,y1,x2,y2,{width,dash,color})
 *   poly(points,{closed,fill,width,dash,color})
 *   circle(cx,cy,r,{fill,width,dash,color})
 *   text(x,y,text,{size,align,baseline,angle,bold,color})
 *   measureText?(text,{size,bold}) -> width mm
 *
 * Classic script; attaches to CS.draw.render and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});
  CS.draw = CS.draw || {};

  var PENS = {
    cut: { width: 0.35, dash: null, color: '#111111' },
    thin: { width: 0.18, dash: null, color: '#111111' },
    hidden: { width: 0.18, dash: [1.6, 1.1], color: '#111111' },
    dash: { width: 0.25, dash: [2.6, 1.3], color: '#111111' },
    center: { width: 0.18, dash: [3.2, 1.0, 0.7, 1.0], color: '#111111' },
    guide: { width: 0.13, dash: null, color: '#777777' },
    dim: { width: 0.18, dash: null, color: '#333333' }
  };

  var TEXT_MM = {
    tiny: 1.8,
    small: 2.2,
    normal: 2.6,
    large: 3.4,
    heading: 5.0,
    title: 7.0
  };

  var FILLS = {
    none: null,
    paper: '#ffffff',
    light: '#eeeae2',
    medium: '#dcd5c7',
    dark: '#bdb3a0',
    solid: '#333333'
  };

  var ARROW_LEN = 2.4;   // paper mm
  var ARROW_WIDTH = 0.9; // paper mm each side
  var DIM_GAP = 0.9;     // extension line gap from geometry
  var DIM_OVER = 1.8;    // extension overshoot past dimension line
  var DIM_TEXT_GAP = 1.2;

  function penStyle(pen) {
    return PENS[pen] || PENS.cut;
  }

  function textSize(key) {
    return TEXT_MM[key] || TEXT_MM.normal;
  }

  function fillColor(fill) {
    return FILLS[fill] || null;
  }

  function finite(v) { return typeof v === 'number' && isFinite(v); }

  function measure(backend, text, size, bold) {
    if (backend.measureText) {
      var measured = backend.measureText(text, { size: size, bold: !!bold });
      if (finite(measured) && measured > 0) return measured;
    }
    return String(text).length * size * (bold ? 0.58 : 0.54);
  }

  function styleFor(pen, extra) {
    var st = penStyle(pen);
    return Object.assign({ width: st.width, dash: st.dash, color: st.color }, extra || {});
  }

  function norm(v) {
    var len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    return len > 1e-9 ? [v[0] / len, v[1] / len] : [0, 0];
  }

  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function scalePt(p, s) { return [p[0] * s, p[1] * s]; }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

  function linearDim(ctx, item, backend, format) {
    var p1 = ctx.toPaper(item.p1);
    var p2 = ctx.toPaper(item.p2);
    var orient = item.orient;
    var dx = item.p2[0] - item.p1[0];
    var dy = item.p2[1] - item.p1[1];
    if (orient === 'auto') orient = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    var offset = item.offset;
    var horizontal = orient === 'h';

    // Dimension line endpoints in model space, then to paper.
    var m1, m2, value;
    if (horizontal) {
      var lineY = Math.max(item.p1[1], item.p2[1]) + offset;
      m1 = [item.p1[0], lineY];
      m2 = [item.p2[0], lineY];
      value = item.text || format(Math.abs(dx));
    } else {
      var lineX = Math.max(item.p1[0], item.p2[0]) + offset;
      m1 = [lineX, item.p1[1]];
      m2 = [lineX, item.p2[1]];
      value = item.text || format(Math.abs(dy));
    }
    var d1 = ctx.toPaper(m1);
    var d2 = ctx.toPaper(m2);
    if (Math.abs(d1[0] - d2[0]) < 0.01 && Math.abs(d1[1] - d2[1]) < 0.01) return;

    // Extension lines with gap + overshoot.
    [p1, p2].forEach(function (p) {
      var target = horizontal ? [p[0], d1[1]] : [d1[0], p[1]];
      var v = sub(target, p);
      var len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      if (len < 0.2) return;
      var u = norm(v);
      var start = add(p, scalePt(u, DIM_GAP));
      var end = add(target, scalePt(u, DIM_OVER));
      backend.line(start[0], start[1], end[0], end[1], styleFor('dim'));
    });

    // Dimension line.
    backend.line(d1[0], d1[1], d2[0], d2[1], styleFor('dim'));

    // Arrowheads, tips touching the extension lines and pointing outward.
    var u = norm(sub(d2, d1));
    var n = [-u[1], u[0]];
    function arrow(tip, dir) {
      var base = add(tip, scalePt(dir, ARROW_LEN));
      var pts = [tip, add(base, scalePt(n, ARROW_WIDTH)), add(base, scalePt(n, -ARROW_WIDTH))];
      backend.poly(pts, { closed: true, fill: '#333333', color: '#333333', width: 0.1, dash: null });
    }
    arrow(d1, u);
    arrow(d2, [-u[0], -u[1]]);

    // Text.
    var textSizeMm = textSize(item.size || 'small');
    var textMid = mid(d1, d2);
    var align = 'center';
    var angle = 0;
    var pos;
    var baseline = 'bottom';
    if (horizontal) {
      // Put the text above the dimension line (screen y is down).
      pos = [textMid[0], textMid[1] - DIM_TEXT_GAP];
    } else {
      angle = -90;
      pos = [textMid[0] + DIM_TEXT_GAP, textMid[1]];
      align = 'center';
      baseline = 'middle';
    }
    var w = measure(backend, value, textSizeMm, false);
    if (w > Math.abs(d1[0] - d2[0]) + 4 && horizontal) {
      // Too long for the space: place it outside to the right.
      pos = [Math.max(d1[0], d2[0]) + 2, pos[1]];
      align = 'left';
    }
    backend.text(pos[0], pos[1], value, {
      size: textSizeMm, align: align, baseline: baseline, angle: angle, bold: false, color: '#111111'
    });
  }

  function drawLabel(ctx, item, backend) {
    if (!item.text) return;
    var size = textSize(item.size || 'normal');
    var p = ctx.toPaper(item.p);
    if (item.bg) {
      var w = measure(backend, item.text, size, item.bold) + 1.2;
      var h = size * 1.3;
      var x = item.align === 'center' ? p[0] - w / 2 : item.align === 'right' ? p[0] - w : p[0] - 0.6;
      var y = item.baseline === 'middle' ? p[1] - h / 2 : item.baseline === 'top' ? p[1] : p[1] - h;
      backend.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], {
        closed: true, fill: '#ffffff', color: '#ffffff', width: 0, dash: null
      });
    }
    var angle = -item.angle; // scene angle is CCW in model space, backend is clockwise on screen
    backend.text(p[0], p[1], item.text, {
      size: size, align: item.align, baseline: item.baseline, angle: angle, bold: item.bold, color: penStyle(item.pen).color
    });
  }

  function drawLeader(ctx, item, backend) {
    var from = ctx.toPaper(item.from);
    var to = ctx.toPaper(item.to);
    var size = textSize(item.size || 'small');
    var v = sub(to, from);
    var u = norm(v);
    var n = [-u[1], u[0]];
    var tip = from;
    var base = add(from, scalePt(u, ARROW_LEN));
    backend.poly([tip, add(base, scalePt(n, ARROW_WIDTH * 0.8)), add(base, scalePt(n, -ARROW_WIDTH * 0.8))], {
      closed: true, fill: '#333333', color: '#333333', width: 0.1, dash: null
    });
    var elbow = to;
    var tail = item.align === 'left' ? 8 : -8;
    var end = [elbow[0] + tail, elbow[1]];
    backend.line(tip[0], tip[1], elbow[0], elbow[1], styleFor('thin'));
    backend.line(elbow[0], elbow[1], end[0], end[1], styleFor('thin'));
    var tx = item.align === 'left' ? end[0] + 1 : end[0] - 1;
    backend.text(tx, end[1], item.text, {
      size: size, align: item.align === 'left' ? 'left' : 'right', baseline: 'bottom', angle: 0, color: '#111111'
    });
  }

  function drawBalloon(ctx, item, backend) {
    var c = ctx.toPaper(item.c);
    var r = item.r || 3.6;
    backend.circle(c[0], c[1], r, styleFor('thin', { fill: '#ffffff' }));
    backend.text(c[0], c[1], item.text, {
      size: textSize(item.size || 'small'), align: 'center', baseline: 'middle', angle: 0, color: '#111111'
    });
  }

  function drawMarker(ctx, item, backend) {
    var p = ctx.toPaper(item.p);
    var s = item.size || 6;
    if (item.kind === 'detail') {
      backend.circle(p[0], p[1], s, styleFor('thin'));
      backend.line(p[0] - s, p[1], p[0] + s, p[1], styleFor('thin'));
      backend.line(p[0], p[1] - s, p[0], p[1] + s, styleFor('thin'));
    } else if (item.kind === 'centerline') {
      backend.line(p[0] - s * 2, p[1], p[0] + s * 2, p[1], styleFor('center'));
    } else if (item.kind === 'break') {
      var pts = [
        [p[0] - s, p[1] - s * 0.4], [p[0] - s * 0.3, p[1] + s * 0.4],
        [p[0] + s * 0.3, p[1] - s * 0.4], [p[0] + s, p[1] + s * 0.4]
      ];
      backend.poly(pts, { closed: false, fill: null, width: 0.2, dash: null, color: '#111111' });
    } else {
      // section arrow
      backend.circle(p[0], p[1], s * 0.55, styleFor('thin', { fill: 'none' }));
      backend.line(p[0], p[1] - s, p[0], p[1] + s, styleFor('thin'));
    }
    if (item.label) {
      backend.text(p[0] + s * 0.9, p[1] - s * 0.6, item.label, {
        size: textSize('small'), align: 'left', baseline: 'middle', angle: 0, color: '#111111'
      });
    }
  }

  /** Hatch lines clipped to a closed polygon, in model coordinates. */
  function hatchSegments(polyClosed, angleDeg, spacing) {
    if (!polyClosed || polyClosed.length < 3) return [];
    var a = (angleDeg || 45) * Math.PI / 180;
    var cos = Math.cos(-a), sin = Math.sin(-a);
    var pts = polyClosed.map(function (p) {
      return [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
    });
    var minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var step = Math.max(0.5, spacing || 4);
    var out = [];
    for (var y = minY + step * 0.5; y < maxY; y += step) {
      var xs = [];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], q = pts[(i + 1) % pts.length];
        if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
          var t = (y - p[1]) / (q[1] - p[1]);
          xs.push(p[0] + t * (q[0] - p[0]));
        }
      }
      xs.sort(function (m, n) { return m - n; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        if (xs[k + 1] - xs[k] > 1e-6) {
          var p1 = [xs[k] * cos + y * sin, -xs[k] * sin + y * cos];
          var p2 = [xs[k + 1] * cos + y * sin, -xs[k + 1] * sin + y * cos];
          out.push([p1, p2]);
        }
      }
    }
    return out;
  }

  function render(sceneObj, backend, opts) {
    if (!sceneObj || !backend) return null;
    opts = opts || {};
    var scene = CS.draw.scene;
    var b = sceneObj.bounds || scene.bounds(sceneObj);
    var scale = finite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
    var originX = finite(opts.x) ? opts.x : 0;
    var originY = finite(opts.y) ? opts.y : 0;
    var format = opts.formatLength || (CS.units ? CS.units.formatDim : function (v) { return String(Math.round(v)); });

    function toPaper(p) {
      return [originX + (p[0] - b.minX) * scale, originY + (b.maxY - p[1]) * scale];
    }
    var ctx = { toPaper: toPaper, scale: scale, originX: originX, originY: originY };
    var drawn = 0;

    sceneObj.items.forEach(function (item) {
      if (!item) return;
      var i, pts, p;
      switch (item.t) {
        case 'line':
          if (!item.a || !item.b) return;
          p = toPaper(item.a);
          var q = toPaper(item.b);
          backend.line(p[0], p[1], q[0], q[1], styleFor(item.pen));
          break;
        case 'poly':
          if (!item.pts || item.pts.length < 2) return;
          pts = item.pts.map(toPaper);
          backend.poly(pts, {
            closed: item.closed !== false,
            fill: fillColor(item.fill),
            width: penStyle(item.pen).width,
            dash: penStyle(item.pen).dash,
            color: penStyle(item.pen).color
          });
          break;
        case 'circle':
          if (!item.c) return;
          p = toPaper(item.c);
          backend.circle(p[0], p[1], Math.max(0.01, item.r * scale), {
            fill: fillColor(item.fill),
            width: penStyle(item.pen).width,
            dash: penStyle(item.pen).dash,
            color: penStyle(item.pen).color
          });
          break;
        case 'arc':
          if (!item.c) return;
          var arcPts = [];
          var start = item.a0, end = item.a1;
          if (end < start) { var tmp = start; start = end; end = tmp; }
          var steps = Math.max(6, Math.ceil((end - start) / (Math.PI / 18)));
          for (i = 0; i <= steps; i++) {
            var ang = start + (end - start) * i / steps;
            arcPts.push(toPaper([item.c[0] + Math.cos(ang) * item.r, item.c[1] + Math.sin(ang) * item.r]));
          }
          backend.poly(arcPts, { closed: false, fill: null, width: penStyle(item.pen).width, dash: penStyle(item.pen).dash, color: penStyle(item.pen).color });
          break;
        case 'label':
          drawLabel(ctx, item, backend);
          break;
        case 'dim':
          linearDim(ctx, item, backend, format);
          break;
        case 'leader':
          drawLeader(ctx, item, backend);
          break;
        case 'balloon':
          drawBalloon(ctx, item, backend);
          break;
        case 'marker':
          drawMarker(ctx, item, backend);
          break;
        case 'hatch':
          if (!item.pts || item.pts.length < 3) return;
          var segments = hatchSegments(item.pts, item.angle, item.spacing);
          segments.forEach(function (seg) {
            var s1 = toPaper(seg[0]);
            var s2 = toPaper(seg[1]);
            backend.line(s1[0], s1[1], s2[0], s2[1], styleFor(item.pen, { width: 0.13 }));
          });
          break;
        default:
          return;
      }
      drawn++;
    });
    return { drawn: drawn, bounds: b, scale: scale };
  }

  function fit(sceneObj, box, opts) {
    opts = opts || {};
    var scene = CS.draw.scene;
    var b = sceneObj.bounds || scene.bounds(sceneObj);
    var padding = opts.padding || 0;
    var width = Math.max(1, (box.width || 1) - padding * 2);
    var height = Math.max(1, (box.height || 1) - padding * 2);
    var sx = b.width > 1e-6 ? width / b.width : 1;
    var sy = b.height > 1e-6 ? height / b.height : 1;
    var scale = Math.min(sx, sy);
    var contentW = b.width * scale;
    var contentH = b.height * scale;
    var x = (box.x || 0) + padding + (width - contentW) / 2;
    var y = (box.y || 0) + padding + (height - contentH) / 2;
    return { scale: scale, x: x, y: y, width: contentW, height: contentH, bounds: b };
  }

  CS.draw.render = {
    PENS: PENS,
    TEXT_MM: TEXT_MM,
    FILLS: FILLS,
    textSize: textSize,
    measureText: measure,
    hatchSegments: hatchSegments,
    render: render,
    fit: fit,
    styleFor: styleFor
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.draw.render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
