/**
 * Cabinet Studio — PDF paper-space backend (jsPDF).
 *
 * Implements the drawing backend interface used by the plan-set renderer:
 *
 *   backend.line(x1,y1,x2,y2, style)
 *   backend.poly(pts, style)
 *   backend.circle(cx,cy,r, style)
 *   backend.arc(cx,cy,r,a0deg,a1deg, style)      // angles as seen on paper: y down
 *   backend.text(x,y,text,{sizeMm,align,baseline,angle,bold,color})
 *   backend.hatch(pts,{angle,spacing,pen,widthMm,color})
 *
 * All coordinates are paper millimetres, y DOWN from the top-left corner (the same
 * convention jsPDF uses). The shared renderer (CS.draw.render.scene) converts the
 * model-space, y-up drawing scenes into calls on this object. Keeping every line and
 * every glyph a native PDF vector op is what makes the plan set selectable and crisp
 * at any zoom, and what makes the file print cleanly in black and white.
 *
 * Pen semantics are the paper widths from CONTRACT.md §6 — the PDF must not scale
 * them to the drawing scale, otherwise a 1:20 elevation would print with hairlines.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});

  /** Millimetres per PostScript point (1 pt = 25.4/72 mm). */
  var MM_PER_PT = 25.4 / 72;

  /**
   * Pen table: the seven named pens from the contract. Widths and dash patterns are
   * paper-space millimetres. Hidden/center/guide dashes are expressed as
   * [dash, gap] (or [dash, gap, dash, gap] for the chain line).
   */
  var PENS = {
    cut:    { widthMm: 0.35, dash: null },
    thin:   { widthMm: 0.18, dash: null },
    hidden: { widthMm: 0.18, dash: [2.2, 1.4] },
    dash:   { widthMm: 0.25, dash: [4.0, 2.0] },
    center: { widthMm: 0.18, dash: [5.0, 1.2, 1.4, 1.2] },
    guide:  { widthMm: 0.13, dash: [0.9, 1.3] },
    dim:    { widthMm: 0.18, dash: null }
  };

  /** Fill tones. B/W print relies on light screens rather than colour. */
  var FILL_LIGHT = [222, 222, 222];   // 13 % black — section poche, zebra rows
  var FILL_MEDIUM = [160, 160, 160];  // 37 % black — cut material / solid sections
  var FILL_DARK = [64, 64, 64];       // 75 % black — rare emphasis blocks

  /** Parse a colour in any of the forms the scene renderer may send. */
  function colorOf(color, fallback) {
    if (color === undefined || color === null) return fallback || [0, 0, 0];
    if (Array.isArray(color)) {
      return [color[0] | 0, color[1] | 0, color[2] | 0];
    }
    if (typeof color === 'string') {
      var s = color.trim().toLowerCase();
      if (s.charAt(0) === '#') {
        var hex = s.slice(1);
        if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
        var n = parseInt(hex, 16);
        if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      if (s === 'black') return [0, 0, 0];
      if (s === 'white') return [255, 255, 255];
      if (s === 'gray' || s === 'grey') return [128, 128, 128];
      if (s === 'light' || s === 'lightgray' || s === 'lightgrey') return [210, 210, 210];
      if (s === 'dark') return [64, 64, 64];
    }
    return fallback || [0, 0, 0];
  }

  function fillColorOf(fill) {
    // The contract spells fills as keywords; CS.draw.render passes resolved colour
    // strings (e.g. '#eeeae2'). Support both so this backend works with either.
    if (fill === 'solid' || fill === 'dark') return FILL_DARK;
    if (fill === 'medium') return FILL_MEDIUM;
    if (fill === 'light') return FILL_LIGHT;
    if (typeof fill === 'string' && fill.charAt(0) === '#') return colorOf(fill, FILL_LIGHT);
    return FILL_LIGHT;
  }

  function isFill(fill) {
    if (fill === undefined || fill === null || fill === false) return false;
    if (fill === 'none') return false;
    return true;
  }

  /** Accept both the frozen {widthMm} and the renderer's {width} style spelling. */
  function styleWidth(style, fallback) {
    if (style && typeof style.widthMm === 'number') return style.widthMm;
    if (style && typeof style.width === 'number') return style.width;
    return fallback;
  }

  /**
   * Create the PDF drawing backend.
   *
   * @param {object} doc jsPDF instance created with `unit:'mm'`.
   * @param {object} [opts] { pageWidth, pageHeight } override (rarely needed).
   * @returns {object} backend implementing the §6 interface.
   */
  function create(doc, opts) {
    if (!doc || typeof doc.line !== 'function') {
      throw new Error('CS.export.pdf.backend.create: a jsPDF document is required');
    }
    opts = opts || {};
    var pageWidth = opts.pageWidth || doc.internal.pageSize.getWidth();
    var pageHeight = opts.pageHeight || doc.internal.pageSize.getHeight();

    // Appearance caches — jsPDF state changes are cheap but text-heavy pages make
    // thousands of calls, and avoiding redundant setFont/setFontSize keeps the PDF
    // byte count down and generation fast.
    var fontKey = '';       // 'helvetica|bold'
    var fontSizeMm = 0;
    var strokeKey = '';     // pen width + colour + dash
    var fillKey = '';
    var measureCache = Object.create(null);
    var savedDepth = 0;

    function setStroke(style) {
      var pen = (style && style.pen && PENS[style.pen]) || PENS.thin;
      var widthMm = styleWidth(style, pen.widthMm);
      var dash = style && 'dash' in style ? style.dash : pen.dash;
      var color = colorOf(style && style.color, [0, 0, 0]);
      var key = widthMm + '|' + color.join(',') + '|' + (dash ? dash.join(',') : '-');
      if (key !== strokeKey) {
        strokeKey = key;
        doc.setDrawColor(color[0], color[1], color[2]);
        doc.setLineWidth(widthMm);
        doc.setLineDashPattern(dash && dash.length ? dash.slice() : [], 0);
      }
    }

    function setFill(style, fallbackTone) {
      var fill = style && style.fill;
      var color = fillColorOf(fill || fallbackTone);
      var key = color.join(',');
      if (key !== fillKey) {
        fillKey = key;
        doc.setFillColor(color[0], color[1], color[2]);
      }
    }

    function setText(sizeMm, bold) {
      var font = bold ? 'bold' : 'normal';
      var key = 'helvetica|' + font + '|' + sizeMm;
      if (key !== fontKey + '|' + fontSizeMm) {
        fontKey = 'helvetica|' + font;
        fontSizeMm = sizeMm || 2.5;
        doc.setFont('helvetica', font);
        doc.setFontSize(fontSizeMm / MM_PER_PT);
      }
    }

    /** Map the contract baseline names onto jsPDF's text baseline options. */
    function baselineOf(value) {
      if (value === 'top' || value === 'hanging') return 'top';
      if (value === 'middle' || value === 'center' || value === 'centre') return 'middle';
      if (value === 'bottom' || value === 'baseline' || value === 'alphabetic') return 'alphabetic';
      return 'middle';
    }

    function validPoint(p) {
      return !!p && isFinite(p[0]) && isFinite(p[1]);
    }

    // ------------------------------------------------------------------ primitives

    function line(x1, y1, x2, y2, style) {
      if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return;
      setStroke(style);
      doc.line(x1, y1, x2, y2);
    }

    function poly(pts, style) {
      if (!pts || !pts.length) return;
      var clean = [];
      for (var i = 0; i < pts.length; i++) {
        if (validPoint(pts[i])) clean.push(pts[i]);
      }
      if (clean.length < 2) return;
      var closed = !style || style.closed !== false;
      var fill = style && isFill(style.fill) ? style.fill : null;
      var fillTone = fill === 'hatch' ? 'light' : fill;

      if (fillTone) setFill({ fill: fillTone });
      setStroke(style || {});
      // jsPDF's fill() consumes the current path, so a fill()+stroke() pair loses the
      // outline. Build the path, fill it, then rebuild it for the stroke.
      function buildPath() {
        doc.moveTo(clean[0][0], clean[0][1]);
        for (var k = 1; k < clean.length; k++) doc.lineTo(clean[k][0], clean[k][1]);
        if (closed) doc.close();
      }
      buildPath();
      if (fillTone) {
        doc.fill();
        buildPath();
      }
      doc.stroke();
    }

    function circle(cx, cy, r, style) {
      if (!isFinite(cx) || !isFinite(cy) || !isFinite(r) || r <= 0) return;
      var fill = style && isFill(style.fill) ? style.fill : null;
      var fillTone = fill === 'hatch' ? 'light' : fill;
      if (fillTone) setFill({ fill: fillTone });
      setStroke(style || {});
      doc.circle(cx, cy, r, fillTone ? 'FD' : 'S');
    }

    function arc(cx, cy, r, a0deg, a1deg, style) {
      if (!isFinite(cx) || !isFinite(cy) || !isFinite(r) || r <= 0) return;
      if (!isFinite(a0deg) || !isFinite(a1deg)) return;
      // jsPDF has no first-class arc path in every 2.x release; flattening to short
      // chords keeps it vector, deterministic and robust. 1.5° keeps radii smooth at
      // plan-set scales (a Ø35 hinge cup is only ~5 mm on paper at 1:5).
      var start = a0deg * Math.PI / 180;
      var end = a1deg * Math.PI / 180;
      while (end < start) end += Math.PI * 2;
      var sweep = end - start;
      var steps = Math.max(2, Math.ceil(sweep / (Math.PI / 120))); // ~1.5°
      var pts = [];
      for (var i = 0; i <= steps; i++) {
        var a = start + sweep * (i / steps);
        // y-down paper space: positive angles are clockwise on screen, so y increases
        // with sin(a) exactly as the contract's "screen-clockwise" wording requires.
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      poly(pts, { pen: (style && style.pen) || 'thin', widthMm: style && style.widthMm, dash: style && style.dash, color: style && style.color, fill: style && style.fill, closed: false });
    }

    function text(x, y, str, style) {
      if (!isFinite(x) || !isFinite(y) || str === undefined || str === null) return;
      str = String(str);
      if (!str.length) return;
      style = style || {};
      var sizeMm = typeof style.sizeMm === 'number' ? style.sizeMm
        : (typeof style.size === 'number' ? style.size : 2.5);
      setText(sizeMm, !!style.bold);
      var color = colorOf(style.color, [0, 0, 0]);
      // `rg` (set non-stroking colour) is shared by text and fills in PDF. Writing text
      // therefore invalidates the cached fill colour, or the next fill would silently
      // use the text colour (this turned nesting parts and balloons black).
      fillKey = '';
      doc.setTextColor(color[0], color[1], color[2]);
      var align = style.align === 'left' || style.align === 'right' || style.align === 'center'
        ? style.align : 'left';
      var textOpts = {
        align: align,
        baseline: baselineOf(style.baseline)
      };
      if (style.angle) {
        textOpts.angle = -style.angle; // scene angles are model/paper CCW; jsPDF rotates CW
        textOpts.rotationDirection = 'clockwise';
      }
      doc.text(str, x, y, textOpts);
    }

    /**
     * Measure a single-line string in paper millimetres (Helvetica).
     * Supports both contract signatures:
     *   measureText(text, sizeMm, opts)
     *   measureText(text, { size, bold })            // CS.draw.render's signature
     */
    function measureText(str, sizeOrOpts, opts) {
      if (str === undefined || str === null) return 0;
      str = String(str);
      if (!str.length) return 0;
      var sizeMm;
      var bold;
      if (sizeOrOpts && typeof sizeOrOpts === 'object') {
        sizeMm = typeof sizeOrOpts.sizeMm === 'number' ? sizeOrOpts.sizeMm
          : (typeof sizeOrOpts.size === 'number' ? sizeOrOpts.size : 2.5);
        bold = !!sizeOrOpts.bold;
      } else {
        sizeMm = typeof sizeOrOpts === 'number' ? sizeOrOpts : 2.5;
        bold = !!(opts && opts.bold);
      }
      var key = (bold ? 'b' : 'n') + '|' + sizeMm + '|' + str;
      var hit = measureCache[key];
      if (hit !== undefined) return hit;
      // getTextWidth uses the current font + size (returns document units = mm).
      var previousFont = fontKey;
      var previousSize = fontSizeMm;
      setText(sizeMm, bold);
      var width = doc.getTextWidth(str);
      // Restore rather than leaving the measuring font installed: text() caches state,
      // so restore the cache markers too.
      fontKey = previousFont;
      fontSizeMm = previousSize;
      measureCache[key] = width;
      return width;
    }

    function setDash(dash) {
      doc.setLineDashPattern(dash && dash.length ? dash.slice() : [], 0);
      strokeKey = ''; // force next setStroke to re-apply
    }

    // --------------------------------------------------------------------- hatch

    /**
     * Draw hatch lines inside an arbitrary polygon. Scanline in a rotated frame:
     * 1. rotate the polygon by -angle so hatching runs horizontally;
     * 2. for every scanline spaced `spacing` mm apart, intersect with the edges;
     * 3. sort the crossings and pair them (even-odd) into segments;
     * 4. rotate the segment ends back and draw them.
     *
     * This clips exactly to the polygon, works for concave outlines (cabinet sections
     * with a toe-kick notch) and never relies on PDF clip paths, which some print
     * workflows flatten badly.
     */
    function hatch(pts, style) {
      if (!pts || pts.length < 3) return;
      style = style || {};
      var angle = (typeof style.angle === 'number' ? style.angle : 45) * Math.PI / 180;
      var spacing = typeof style.spacing === 'number' && style.spacing > 0.2 ? style.spacing : 2.5;
      var cos = Math.cos(-angle), sin = Math.sin(-angle);
      var cleaned = [];
      var i, p;
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        if (!validPoint(p)) continue;
        cleaned.push([p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos]);
      }
      if (cleaned.length < 3) return;

      var minY = Infinity, maxY = -Infinity;
      for (i = 0; i < cleaned.length; i++) {
        if (cleaned[i][1] < minY) minY = cleaned[i][1];
        if (cleaned[i][1] > maxY) maxY = cleaned[i][1];
      }
      if (!isFinite(minY) || maxY - minY < 0.05) return;

      // Rotate back into paper space.
      var invCos = Math.cos(angle), invSin = Math.sin(angle);
      function back(x, y) {
        return [x * invCos - y * invSin, x * invSin + y * invCos];
      }

      setStroke({ pen: style.pen || 'hatch', widthMm: style.widthMm !== undefined ? style.widthMm : 0.13, dash: null, color: style.color });
      var n = cleaned.length;
      var y = minY + spacing * 0.5;
      var maxLines = 4000; // hard safety for pathological input
      var lineCount = 0;
      while (y < maxY && lineCount++ < maxLines) {
        var crossings = [];
        for (i = 0; i < n; i++) {
          var a = cleaned[i], b = cleaned[(i + 1) % n];
          var y1 = a[1], y2 = b[1];
          if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
            var t = (y - y1) / (y2 - y1);
            crossings.push(a[0] + t * (b[0] - a[0]));
          }
        }
        crossings.sort(function (m, n2) { return m - n2; });
        for (i = 0; i + 1 < crossings.length; i += 2) {
          var p1 = back(crossings[i], y);
          var p2 = back(crossings[i + 1], y);
          doc.line(p1[0], p1[1], p2[0], p2[1]);
        }
        y += spacing;
      }
    }

    // ------------------------------------------------------------ extra convenience

    function rect(x, y, w, h, style) {
      style = style || {};
      var pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      poly(pts, { pen: style.pen || 'thin', widthMm: style.widthMm, dash: style.dash,
                  color: style.color, fill: style.fill, closed: true });
    }

    /** Fill a rectangle with a light screen — used by tables/page composition. */
    function fillRect(x, y, w, h, color) {
      doc.setFillColor.apply(doc, colorOf(color, FILL_LIGHT));
      fillKey = '';
      doc.rect(x, y, w, h, 'F');
    }

    /** Graphics-state stack (used by the renderer for optional clipping). */
    function save() {
      doc.saveGraphicsState();
      savedDepth++;
    }

    function restore() {
      if (savedDepth > 0) {
        doc.restoreGraphicsState();
        savedDepth--;
        strokeKey = '';
        fillKey = '';
      }
    }

    function clipRect(x, y, w, h) {
      save();
      doc.rect(x, y, w, h);
      doc.clip();
    }

    var api = {
      doc: doc,
      pens: PENS,
      mmPerPt: MM_PER_PT,
      pageWidth: pageWidth,
      pageHeight: pageHeight,
      line: line,
      poly: poly,
      circle: circle,
      arc: arc,
      text: text,
      hatch: hatch,
      measureText: measureText,
      setDash: setDash,
      rect: rect,
      fillRect: fillRect,
      save: save,
      restore: restore,
      clipRect: clipRect
    };
    return api;
  }

  CS.export = CS.export || {};
  CS.export.pdf = CS.export.pdf || {};
  CS.export.pdf.backend = {
    create: create,
    PENS: PENS,
    MM_PER_PT: MM_PER_PT
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.export.pdf.backend;
})(typeof globalThis !== 'undefined' ? globalThis : this);
