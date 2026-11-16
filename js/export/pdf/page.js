/**
 * Cabinet Studio — PDF page furniture.
 *
 * A plan-set page is: a print-safe border, a slim running header, a body area for
 * drawings or tables, and a title block across the bottom. This module owns that
 * geometry and the "Sheet n of N" counter so every other PDF module draws inside a
 * consistent frame. Nothing here knows about cabinets — it is pure paper layout.
 *
 * Coordinates are paper millimetres, y down (jsPDF convention).
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});

  /** Page sizes in millimetres, portrait orientation. */
  var PAGE_SIZES = {
    letter: { width: 215.9, height: 279.4, name: 'US Letter' },
    tabloid: { width: 279.4, height: 431.8, name: 'US Tabloid 11×17' },
    a4: { width: 210, height: 297, name: 'A4' },
    a3: { width: 297, height: 420, name: 'A3' }
  };

  /** Print-safe layout constants. ≥10 mm margins per contract §7. */
  var LAYOUT = {
    margin: 12,        // outer content margin (mm)
    border: 10,        // thin page border inset (mm)
    headerHeight: 9,   // running header band
    titleBlockHeight: 22,
    titleBlockGap: 4,  // gap between body and title block
    footerHeight: 0
  };

  /** Helvetica approximate character widths, for layout decisions before a doc exists. */
  var CHAR_W = 0.52;

  function mm(value) {
    return (Math.round(value * 100) / 100);
  }

  function cleanText(value) {
    if (value === undefined || value === null) return '';
    var s = String(value);
    // jsPDF's WinAnsi encoding handles Latin-1; replace characters it cannot encode
    // so a typographic quote in a project name never turns into mojibake in the PDF.
    return s
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u2212/g, '-')
      .replace(/\u2032/g, "'")
      .replace(/\u2033/g, '"')
      .replace(/\u2009|\u202F/g, ' ')
      .replace(/[\u2192\u2190\u21D2\u2794\u27A1]/g, '->')
      .replace(/\u21D0/g, '<-')
      .replace(/\u2264/g, '<=')
      .replace(/\u2265/g, '>=')
      .replace(/\u2248/g, '~=')
      .replace(/[\u2022\u25CF\u25AA\u25A0\u25BA]/g, '-')
      .replace(/\u00A0/g, ' ')
      .replace(/[^\x09\x0A\x20-\x7E\u00A0-\u00FF]/g, '?');
  }

  function pageSizeOf(name, orientation) {
    var base = PAGE_SIZES[name] || PAGE_SIZES.letter;
    var w = base.width;
    var h = base.height;
    if (orientation === 'landscape') {
      return {
        width: Math.max(w, h),
        height: Math.min(w, h),
        name: base.name,
        orientation: 'landscape'
      };
    }
    return {
      width: Math.min(w, h),
      height: Math.max(w, h),
      name: base.name,
      orientation: 'portrait'
    };
  }

  // ---------------------------------------------------------------- text helpers

  /**
   * Wrap a paragraph into lines that fit `widthMm` at `sizeMm`. Uses the backend's
   * measureText when it exists (jsPDF gives exact Helvetica metrics), otherwise the
   * contract's 0.55×size approximation. Explicit '\n' characters force breaks.
   *
   * @param {object} backend PDF backend (or anything with measureText)
   * @param {string} text
   * @param {number} widthMm
   * @param {number} sizeMm
   * @param {object} [opts] { bold }
   * @returns {string[]}
   */
  function wrapLines(backend, text, widthMm, sizeMm, opts) {
    opts = opts || {};
    var measure = backend && typeof backend.measureText === 'function'
      ? function (s) { return backend.measureText(s, sizeMm, opts); }
      : function (s) { return s.length * sizeMm * CHAR_W; };
    var lines = [];
    var paragraphs = cleanText(text).split('\n');
    for (var p = 0; p < paragraphs.length; p++) {
      var words = paragraphs[p].split(/\s+/);
      var current = '';
      for (var i = 0; i < words.length; i++) {
        var word = words[i];
        if (!word.length) continue;
        var candidate = current ? current + ' ' + word : word;
        if (measure(candidate) <= widthMm || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
        // Very long unbroken tokens (part ids, "B1-03/side-left") are split hard so a
        // table cell can never push a column wider than the page.
        while (measure(current) > widthMm && current.length > 1) {
          var cut = current.length;
          while (cut > 1 && measure(current.slice(0, cut - 1)) > widthMm) cut--;
          if (cut <= 1) break;
          lines.push(current.slice(0, cut));
          current = current.slice(cut);
        }
      }
      if (current) lines.push(current);
    }
    if (!lines.length) lines.push('');
    return lines;
  }

  /** Truncate a single line to fit `widthMm`, with a trailing ellipsis. */
  function truncateText(backend, text, widthMm, sizeMm, bold) {
    var t = cleanText(text);
    if (!t) return '';
    var measure = function (s) {
      if (backend && typeof backend.measureText === 'function') return backend.measureText(s, { size: sizeMm, bold: !!bold });
      return s.length * sizeMm * CHAR_W;
    };
    if (measure(t) <= widthMm) return t;
    var cut = t;
    while (cut.length > 2 && measure(cut + '...') > widthMm) cut = cut.slice(0, -1);
    return cut + '...';
  }

  /**
   * Draw a wrapped paragraph and return the y coordinate just below it.
   */
  function textBlock(ctx, text, x, y, widthMm, opts) {
    opts = opts || {};
    var sizeMm = opts.sizeMm || 2.4;
    var lineHeight = opts.lineHeight || sizeMm * 1.45;
    var lines = wrapLines(ctx.backend, text, widthMm, sizeMm, { bold: !!opts.bold });
    var maxLines = opts.maxLines || lines.length;
    var drawn = 0;
    for (var i = 0; i < lines.length && drawn < maxLines; i++) {
      ctx.backend.text(x, y + i * lineHeight, lines[i], {
        sizeMm: sizeMm,
        align: opts.align || 'left',
        baseline: 'top',
        bold: !!opts.bold,
        color: opts.color
      });
      drawn++;
    }
    return y + drawn * lineHeight;
  }

  // ------------------------------------------------------------------ page context

  /**
   * Create a page context bound to one jsPDF document.
   *
   * @param {object} doc jsPDF instance (unit:'mm')
   * @param {object} cfg
   *   { pageSize:'letter'|'tabloid'|'a4'|'a3', orientation, project, options,
   *     totalPages:number|null, backend }
   * @returns {object} page context
   */
  function createContext(doc, cfg) {
    cfg = cfg || {};
    var pageSize = pageSizeOf(cfg.pageSize || 'letter', cfg.orientation || 'landscape');
    var project = cfg.project || {};
    var options = cfg.options || {};
    var backend = cfg.backend || (CS.export.pdf.backend && CS.export.pdf.backend.create(doc, {
      pageWidth: pageSize.width,
      pageHeight: pageSize.height
    }));
    var totalPages = typeof cfg.totalPages === 'number' ? cfg.totalPages : null;

    var ctx = {
      doc: doc,
      backend: backend,
      pageSize: pageSize,
      project: project,
      options: options,
      totalPages: totalPages,
      sheetIndex: 0,       // physical page number, 1-based once a sheet begins
      sheets: [],          // meta records in page order (useful for the sheet index)
      current: null,       // active sheet meta
      y: 0,                // conventional cursor for sequential content
      x: 0,
      width: 0,
      height: 0
    };

    function recompute() {
      var W = pageSize.width;
      var H = pageSize.height;
      var m = LAYOUT.margin;
      ctx.width = W;
      ctx.height = H;
      ctx.margin = m;
      ctx.inner = { x: m, y: m, width: W - 2 * m, height: H - 2 * m, right: W - m, bottom: H - m };
      ctx.header = { x: m, y: m, width: W - 2 * m, height: LAYOUT.headerHeight, bottom: m + LAYOUT.headerHeight };
      ctx.titleBlock = {
        x: m,
        y: H - m - LAYOUT.titleBlockHeight,
        width: W - 2 * m,
        height: LAYOUT.titleBlockHeight,
        right: W - m
      };
      ctx.body = {
        x: m,
        y: m + LAYOUT.headerHeight + 3,
        width: W - 2 * m,
        height: 0,
        right: W - m
      };
      ctx.body.bottom = ctx.titleBlock.y - LAYOUT.titleBlockGap;
      ctx.body.height = ctx.body.bottom - ctx.body.y;
      ctx.y = ctx.body.y;
      ctx.x = ctx.body.x;
    }
    recompute();

    /** Draw the thin page border and running header for the active page. */
    function drawChrome() {
      var W = pageSize.width;
      var H = pageSize.height;
      var b = LAYOUT.border;
      backend.rect(b, b, W - 2 * b, H - 2 * b, { pen: 'thin', widthMm: 0.25 });
      // Running header: product mark left, project/date right. The title block below
      // carries the authoritative sheet metadata.
      var h = ctx.header;
      backend.text(h.x, h.y + 2.4, 'CABINET STUDIO', { sizeMm: 3.0, bold: true, baseline: 'top' });
      backend.text(h.x, h.y + 7.0, 'Shop plan set  ·  ' + (project.name ? cleanText(project.name) : 'Untitled project'),
        { sizeMm: 2.0, baseline: 'top', color: [70, 70, 70] });
      var right = h.x + h.width;
      backend.text(right, h.y + 2.4, cleanText(project.client || project.shopName || ''), { sizeMm: 2.2, align: 'right', baseline: 'top' });
      var dateLabel = options.date || project.settings && project.settings.date || '';
      backend.text(right, h.y + 7.0, dateLabel ? 'Plan date ' + cleanText(dateLabel) : '', { sizeMm: 2.0, align: 'right', baseline: 'top', color: [70, 70, 70] });
      backend.line(h.x, h.bottom, right, h.bottom, { pen: 'thin', widthMm: 0.25 });
    }

    /** Bottom title block, per contract §7. */
    function drawTitleBlock() {
      var tb = ctx.titleBlock;
      var meta = ctx.current || {};
      var W = tb.width;
      var H = tb.height;
      var x = tb.x;
      var y = tb.y;
      var topH = 12.5;
      var bottomH = H - topH;
      var cols = [0.30, 0.29, 0.10, 0.11, 0.20]; // project | sheet | cabinet | scale | sheet no
      var xs = [x];
      for (var c = 0; c < cols.length; c++) xs.push(xs[c] + W * cols[c]);
      xs[cols.length] = x + W;

      backend.rect(x, y, W, H, { pen: 'cut', widthMm: 0.35 });

      function cell(i, rowY, rowH, label, value, opts) {
        opts = opts || {};
        backend.line(xs[i], rowY, xs[i], rowY + rowH, { pen: 'thin', widthMm: 0.18 });
        var left = xs[i] + 2.0;
        if (label) {
          backend.text(left, rowY + 3.0, label, {
            sizeMm: 1.7, baseline: 'top', color: [80, 80, 80], bold: false
          });
        }
        if (value !== undefined && value !== null && value !== '') {
          var cellSize = opts.sizeMm || 3.2;
          var available = xs[i + 1] - xs[i] - 4.0;
          backend.text(left, rowY + (label ? 6.0 : 4.0), truncateText(backend, value, available, cellSize, opts.bold), {
            sizeMm: cellSize,
            bold: !!opts.bold,
            baseline: 'top',
            align: opts.align || 'left'
          });
        }
      }

      // top row of the title block
      cell(0, y, topH, 'PROJECT', project.name || 'Untitled project', { sizeMm: 3.4, bold: true });
      backend.text(xs[0] + 2.0, y + 10.1, truncateText(backend, project.client || project.shopName || ' ', xs[1] - xs[0] - 4, 1.9), {
        sizeMm: 1.9, baseline: 'top', color: [64, 64, 64]
      });
      cell(1, y, topH, 'SHEET', meta.title || '', { sizeMm: 3.1, bold: true });
      if (meta.subtitle) {
        backend.text(xs[1] + 2.0, y + 10.1, truncateText(backend, meta.subtitle, xs[2] - xs[1] - 4, 1.8), {
          sizeMm: 1.8, baseline: 'top', color: [64, 64, 64]
        });
      }
      cell(2, y, topH, 'CABINET', meta.cabinetTag || '—', { sizeMm: 4.0, bold: true });
      cell(3, y, topH, 'SCALE', meta.scale || 'NTS', { sizeMm: 3.2, bold: true });

      // sheet number cell: the most important field on the page
      backend.line(xs[4], y, xs[4], y + H, { pen: 'thin', widthMm: 0.18 });
      backend.text(xs[4] + 2.0, y + 3.0, 'SHEET', { sizeMm: 1.8, baseline: 'top', color: [80, 80, 80] });
      backend.text(xs[4] + 2.0, y + 7.6, 'Sheet ' + ctx.sheetIndex + ' of ' + (ctx.totalPages || '—'), {
        sizeMm: 3.5, bold: true, baseline: 'top'
      });

      // bottom row: drawn-by, date, page size, units, notes
      var by = y + topH;
      backend.line(x, by, x + W, by, { pen: 'thin', widthMm: 0.18 });
      var bcols = [0.30, 0.29, 0.10, 0.11, 0.20];
      var bxs = [x];
      for (var d = 0; d < bcols.length; d++) bxs.push(bxs[d] + W * bcols[d]);
      bxs[bcols.length] = x + W;
      function bottomCell(i, label, value) {
        backend.line(bxs[i], by, bxs[i], by + bottomH, { pen: 'thin', widthMm: 0.18 });
        backend.text(bxs[i] + 2.0, by + 2.6, label, { sizeMm: 1.6, baseline: 'top', color: [80, 80, 80] });
        var available = bxs[i + 1] - bxs[i] - 4.0;
        backend.text(bxs[i] + 2.0, by + 5.9, truncateText(backend, value, available, 2.15), { sizeMm: 2.15, baseline: 'top' });
      }
      bottomCell(0, 'DRAWN BY', 'Cabinet Studio — shop drawing generator');
      bottomCell(1, 'DATE / CONTACT', (options.date || '') + (project.client ? '  ·  ' + project.client : ''));
      bottomCell(2, 'PAGE SIZE', pageSize.name);
      bottomCell(3, 'UNITS', project.units === 'metric' ? 'Metric (mm)' : 'Imperial (in)');
      bottomCell(4, 'NOTE', meta.note || 'Verify all dimensions on site before cutting');
    }

    /**
     * Start a sheet. Adds a page unless the document is still on its first blank page.
     * @param {object} meta {title, subtitle, scale, cabinetTag, note}
     * @returns {object} ctx
     */
    ctx.beginSheet = function (meta) {
      meta = meta || {};
      if (ctx.sheetIndex > 0) {
        doc.addPage([ctx.pageSize.width, ctx.pageSize.height], ctx.pageSize.orientation);
      }
      ctx.sheetIndex++;
      ctx.current = {
        index: ctx.sheetIndex,
        title: meta.title || '',
        subtitle: meta.subtitle || '',
        scale: meta.scale || 'NTS',
        cabinetTag: meta.cabinetTag || '',
        note: meta.note || ''
      };
      ctx.sheets.push(ctx.current);
      drawChrome();
      ctx.y = ctx.body.y;
      ctx.x = ctx.body.x;
      return ctx;
    };

    /** Mark the current sheet finished and stamp its title block. */
    ctx.endSheet = function () {
      if (!ctx.current) return ctx;
      drawTitleBlock();
      ctx.current = null;
      return ctx;
    };

    /**
     * Finish the current sheet and start a continuation with the same metadata.
     * Used by multi-page tables and drawing runs.
     */
    ctx.continueSheet = function (meta) {
      var base = meta || (ctx.current ? {
        title: ctx.current.title,
        subtitle: ctx.current.subtitle,
        scale: ctx.current.scale,
        cabinetTag: ctx.current.cabinetTag
      } : {});
      var title = base.title || '';
      if (title && title.indexOf('(continued)') < 0) title += ' (continued)';
      ctx.endSheet();
      ctx.beginSheet({
        title: title,
        subtitle: base.subtitle,
        scale: base.scale,
        cabinetTag: base.cabinetTag,
        note: base.note
      });
      return ctx;
    };

    /**
     * Ensure `heightMm` of vertical space remains on the current sheet.
     * Composed sections track their own y cursor; pass it as `atY` so the check is
     * against the real cursor rather than ctx.y (which tables maintain).
     */
    ctx.hasRoom = function (heightMm, atY) {
      var y = (typeof atY === 'number') ? atY : ctx.y;
      return y + heightMm <= ctx.body.bottom;
    };

    /**
     * If `heightMm` does not fit, finish the sheet and start its continuation.
     * @returns {boolean} true when a new page was started
     */
    ctx.ensureRoom = function (heightMm, meta) {
      if (ctx.hasRoom(heightMm)) return false;
      ctx.continueSheet(meta);
      return true;
    };

    // Convenience wrappers used across the plan-set composer.
    ctx.text = function (x, y, str, opts) {
      backend.text(x, y, cleanText(str), opts);
    };
    ctx.line = backend.line;
    ctx.rect = backend.rect;
    ctx.paragraph = function (text, x, y, widthMm, opts) {
      return textBlock(ctx, text, x, y, widthMm, opts);
    };
    ctx.wrapLines = function (text, widthMm, sizeMm, opts) {
      return wrapLines(backend, text, widthMm, sizeMm, opts);
    };
    /** Vertical column helper: returns x positions for fractions of the body width. */
    ctx.columns = function (fractions, startX, totalWidth) {
      var x0 = startX === undefined ? ctx.body.x : startX;
      var w = totalWidth === undefined ? ctx.body.width : totalWidth;
      var out = [];
      var acc = 0;
      for (var i = 0; i < fractions.length; i++) {
        out.push({ x: x0 + w * acc, width: w * fractions[i] });
        acc += fractions[i];
      }
      return out;
    };

    ctx.pageSize = pageSize;
    return ctx;
  }

  CS.export = CS.export || {};
  CS.export.pdf = CS.export.pdf || {};
  CS.export.pdf.page = {
    PAGE_SIZES: PAGE_SIZES,
    LAYOUT: LAYOUT,
    pageSizeOf: pageSizeOf,
    createContext: createContext,
    wrapLines: wrapLines,
    textBlock: textBlock,
    truncateText: truncateText,
    cleanText: cleanText,
    mm: mm
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.export.pdf.page;
})(typeof globalThis !== 'undefined' ? globalThis : this);
