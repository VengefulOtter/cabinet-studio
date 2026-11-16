/* Cabinet Studio — HTML canvas backend for the shared scene renderer.
 *
 * Classic script; attaches to CS.draw.canvas. Used by the app previews.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});
  CS.draw = CS.draw || {};

  var FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

  function createBackend(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available');
    var pxPerMm = opts.pxPerMm || 3.4;
    var dpr = opts.dpr || Math.min(root.devicePixelRatio || 1, 2);
    var cssW = opts.width || canvas.clientWidth || parseInt(canvas.getAttribute('width'), 10) || 640;
    var cssH = opts.height || canvas.clientHeight || parseInt(canvas.getAttribute('height'), 10) || 420;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.textBaseline = 'alphabetic';

    function px(v) { return v * pxPerMm; }

    function setStroke(style) {
      ctx.strokeStyle = style.color || '#111111';
      ctx.lineWidth = Math.max(0.55, px(style.width == null ? 0.18 : style.width));
      ctx.setLineDash((style.dash || []).map(px));
    }

    function drawPoly(points, style) {
      if (!points || points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(px(points[0][0]), px(points[0][1]));
      for (var i = 1; i < points.length; i++) ctx.lineTo(px(points[i][0]), px(points[i][1]));
      if (style.closed !== false) ctx.closePath();
      if (style.fill) {
        ctx.fillStyle = style.fill;
        ctx.fill();
      }
      if (style.width !== 0) {
        setStroke(style);
        ctx.stroke();
      }
      ctx.restore();
    }

    var backend = {
      pxPerMm: pxPerMm,
      paperWidth: cssW / pxPerMm,
      paperHeight: cssH / pxPerMm,
      cssWidth: cssW,
      cssHeight: cssH,
      line: function (x1, y1, x2, y2, style) {
        style = style || {};
        ctx.save();
        setStroke(style);
        ctx.beginPath();
        ctx.moveTo(px(x1), px(y1));
        ctx.lineTo(px(x2), px(y2));
        ctx.stroke();
        ctx.restore();
      },
      poly: function (points, style) {
        style = style || {};
        if (!points || !points.length) return;
        drawPoly(points.map(function (p) { return [p[0], p[1]]; }), style);
      },
      circle: function (cx, cy, r, style) {
        style = style || {};
        ctx.save();
        ctx.beginPath();
        ctx.arc(px(cx), px(cy), Math.max(0.2, px(r)), 0, Math.PI * 2);
        if (style.fill) {
          ctx.fillStyle = style.fill;
          ctx.fill();
        }
        if (style.width !== 0) {
          setStroke(style);
          ctx.stroke();
        }
        ctx.restore();
      },
      text: function (x, y, text, style) {
        style = style || {};
        if (!text) return;
        var size = style.size || 2.6;
        ctx.save();
        ctx.translate(px(x), px(y));
        if (style.angle) ctx.rotate(style.angle * Math.PI / 180);
        ctx.fillStyle = style.color || '#111111';
        ctx.font = (style.bold ? '600 ' : '400 ') + px(size) + 'px ' + FONT_STACK;
        ctx.textAlign = style.align === 'center' ? 'center' : style.align === 'right' ? 'right' : 'left';
        ctx.textBaseline = style.baseline === 'middle' ? 'middle' : style.baseline === 'top' ? 'top' : style.baseline === 'bottom' ? 'bottom' : 'alphabetic';
        ctx.fillText(String(text), 0, 0);
        ctx.restore();
      },
      measureText: function (text, style) {
        var size = (style && style.size) || 2.6;
        ctx.save();
        ctx.font = (style && style.bold ? '600 ' : '400 ') + px(size) + 'px ' + FONT_STACK;
        var w = ctx.measureText(String(text)).width;
        ctx.restore();
        return w / pxPerMm;
      }
    };
    return backend;
  }

  /**
   * Draw a scene (or a list of scenes, one per view) onto a canvas.
   * opts: {padding:16, pxPerMm:3.4, background:'#fffdf8', scale, label}
   */
  function draw(canvas, scene, opts) {
    opts = opts || {};
    var cssW = opts.width || canvas.clientWidth || parseInt(canvas.getAttribute('width'), 10) || 640;
    var cssH = opts.height || canvas.clientHeight || parseInt(canvas.getAttribute('height'), 10) || 420;
    var padding = opts.padding == null ? 18 : opts.padding;
    var pxPerMm = opts.pxPerMm || 3.4;
    var backend = createBackend(canvas, { pxPerMm: pxPerMm, dpr: opts.dpr, width: cssW, height: cssH });
    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = opts.background || '#fffdf8';
    ctx.fillRect(0, 0, cssW, cssH);

    if (!scene || !scene.items || !scene.items.length) {
      ctx.fillStyle = '#8a8172';
      ctx.font = '13px ' + FONT_STACK;
      ctx.textAlign = 'center';
      ctx.fillText(opts.emptyText || 'No preview yet', cssW / 2, cssH / 2);
      ctx.restore();
      return { scale: 0, x: 0, y: 0 };
    }

    var padPaper = padding / pxPerMm;
    var fit = CS.draw.render.fit(scene, {
      x: padPaper, y: padPaper,
      width: backend.paperWidth - padPaper * 2,
      height: backend.paperHeight - padPaper * 2
    }, {});
    CS.draw.render.render(scene, backend, { scale: fit.scale, x: fit.x, y: fit.y });
    ctx.restore();
    return fit;
  }

  CS.draw.canvas = {
    createBackend: createBackend,
    draw: draw
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.draw.canvas;
})(typeof globalThis !== 'undefined' ? globalThis : this);
