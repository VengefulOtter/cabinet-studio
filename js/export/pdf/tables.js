/**
 * Cabinet Studio — PDF tables.
 *
 * One table engine for the whole plan set: cabinet schedule, cut list, sheet
 * nesting totals, door/drawer schedule, hardware schedule, notes and sign-off.
 * It draws in paper millimetres with wrapped cells, repeated headers on
 * continuation pages, group rows and zebra striping, and it never lets a cell
 * overflow its column or the page body (the page title block is always respected).
 *
 * The composer in plan-set.js calls draw(ctx, spec); ctx is the page context from
 * page.js, so a multi-page table automatically gains "Sheet n of N" numbering.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});

  var PAD_X = 1.4;       // horizontal cell padding (mm)
  var PAD_Y = 1.1;       // vertical cell padding (mm)
  var LINE = 1.32;       // line-height factor for wrapped cell text

  function pageModule() {
    return CS.export.pdf.page;
  }

  function clean(value) {
    if (value === undefined || value === null) return '';
    return String(value);
  }

  function isNumberLike(value) {
    return typeof value === 'number' && isFinite(value);
  }

  /** Resolve column widths (mm or fractions of the table width). */
  function resolveColumns(columns, width) {
    var fixed = 0;
    var flex = 0;
    var out = [];
    for (var i = 0; i < columns.length; i++) {
      var col = columns[i] || {};
      var w = col.width;
      var entry = {
        key: col.key,
        title: col.title === undefined ? col.key : col.title,
        align: col.align || 'left',
        wrap: col.wrap !== false,
        sizeMm: col.sizeMm || null,
        bold: !!col.bold,
        format: col.format || null,
        value: col.value || null,
        width: 0,
        flex: 0
      };
      if (typeof w === 'number') {
        if (w < 1) { entry.flex = w; flex += w; }
        else { entry.width = w; fixed += w; }
      } else {
        entry.flex = 1;
        flex += 1;
      }
      out.push(entry);
    }
    var remaining = Math.max(1, width - fixed);
    var scale = flex > 0 ? remaining / flex : 0;
    for (var j = 0; j < out.length; j++) {
      if (out[j].flex) out[j].width = out[j].flex * scale;
    }
    return out;
  }

  function cellValue(row, col, rowIndex) {
    if (col.value) return col.value(row, rowIndex);
    var v = row ? row[col.key] : '';
    if (col.format) return col.format(v, row, rowIndex);
    return v;
  }

  /**
   * Measure the row height needed for one row.
   * @returns {{height:number, cells:string[][]}}
   */
  function measureRow(ctx, columns, row, bodySizeMm, opts) {
    var sizeMm = opts.sizeMm || bodySizeMm;
    var lineHeight = sizeMm * (opts.lineHeightFactor || LINE);
    var lines = [];
    var maxLines = 1;
    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      var text = clean(cellValue(row, col, opts.__rowIndex || 0));
      var colSize = col.sizeMm || sizeMm;
      var colLineHeight = colSize * (opts.lineHeightFactor || LINE);
      var innerWidth = col.width - 2 * PAD_X;
      var wrapped = (col.wrap || text.indexOf(' ') >= 0)
        ? pageModule().wrapLines(ctx.backend, text, innerWidth, colSize, { bold: col.bold })
        : [text];
      lines.push(wrapped);
      var needed = Math.ceil(wrapped.length * colLineHeight / lineHeight);
      if (needed > maxLines) maxLines = needed;
    }
    return {
      height: Math.max(opts.minRowHeight || 6.4, maxLines * lineHeight + 2 * PAD_Y),
      cells: lines
    };
  }

  /** Draw one row's cell text and optional zebra fill. */
  function drawRow(ctx, columns, cells, x, y, height, opts) {
    var sizeMm = opts.sizeMm || 2.2;
    var lineHeight = sizeMm * (opts.lineHeightFactor || LINE);
    var zebra = opts.zebra && opts.__rowIndex % 2 === 1;
    if (zebra) {
      var fill = [236, 236, 236];
      if (typeof ctx.backend.fillRect === 'function') {
        ctx.backend.fillRect(x, y, opts.width, height, fill);
      } else {
        ctx.backend.poly([[x, y], [x + opts.width, y], [x + opts.width, y + height], [x, y + height]],
          { pen: 'guide', widthMm: 0.1, fill: 'light', closed: true });
      }
    }
    var cx = x;
    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      var colSize = col.sizeMm || sizeMm;
      var colLineHeight = colSize * (opts.lineHeightFactor || LINE);
      var align = col.align;
      var tx = align === 'right' ? cx + col.width - PAD_X : (align === 'center' ? cx + col.width / 2 : cx + PAD_X);
      for (var l = 0; l < cells[i].length; l++) {
        ctx.backend.text(tx, y + PAD_Y + l * colLineHeight, cells[i][l], {
          sizeMm: colSize,
          align: align,
          baseline: 'top',
          bold: col.bold || opts.bold
        });
      }
      cx += col.width;
    }
    // hairline rule under each row
    if (opts.rowRules !== false) {
      ctx.backend.line(x, y + height, x + opts.width, y + height, {
        pen: 'guide', widthMm: opts.rowRulePen === false ? 0.1 : 0.13
      });
    }
  }

  /** Draw the bold header row (repeated on every continuation page). */
  function drawHeader(ctx, columns, x, y, opts) {
    var sizeMm = opts.headerSizeMm || 2.15;
    var lineHeight = sizeMm * 1.25;
    var headerRows = [];
    var maxLines = 1;
    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      var wrapped = pageModule().wrapLines(ctx.backend, clean(col.title), col.width - 2 * PAD_X, sizeMm, { bold: true });
      headerRows.push(wrapped);
      if (wrapped.length > maxLines) maxLines = wrapped.length;
    }
    var height = maxLines * lineHeight + 2 * PAD_Y;
    var cx = x;
    for (var j = 0; j < columns.length; j++) {
      var c = columns[j];
      var tx = c.align === 'right' ? cx + c.width - PAD_X : (c.align === 'center' ? cx + c.width / 2 : cx + PAD_X);
      for (var l = 0; l < headerRows[j].length; l++) {
        ctx.backend.text(tx, y + PAD_Y + l * lineHeight, headerRows[j][l], {
          sizeMm: sizeMm,
          align: c.align,
          baseline: 'top',
          bold: true
        });
      }
      cx += c.width;
    }
    ctx.backend.line(x, y + height, x + opts.width, y + height, { pen: 'cut', widthMm: 0.3 });
    return height + (opts.headerGap || 0);
  }

  /** Draw a table title (optional) and return the new y. */
  function drawTitle(ctx, title, x, y, width, opts) {
    if (!title) return y;
    var sizeMm = opts.titleSizeMm || 3.6;
    ctx.backend.text(x, y, pageModule().cleanText(title), { sizeMm: sizeMm, bold: true, baseline: 'top' });
    if (opts.subtitle) {
      var subSize = (opts.subtitleSizeMm || 2.2);
      ctx.backend.text(x, y + sizeMm + 1.3, pageModule().cleanText(opts.subtitle), {
        sizeMm: subSize, baseline: 'top', color: [70, 70, 70]
      });
      return y + sizeMm + 1.3 + subSize + 2.4;
    }
    return y + sizeMm + 2.6;
  }

  /** Draw a group header row spanning the full table width. */
  function drawGroupRow(ctx, text, x, y, width, opts) {
    var sizeMm = opts.groupSizeMm || 2.2;
    var height = sizeMm * 1.3 + 2 * PAD_Y + 0.6;
    if (typeof ctx.backend.fillRect === 'function') {
      ctx.backend.fillRect(x, y, width, height, [222, 222, 222]);
    }
    ctx.backend.text(x + PAD_X, y + PAD_Y + 0.3, pageModule().cleanText(text), {
      sizeMm: sizeMm, bold: true, baseline: 'top'
    });
    ctx.backend.line(x, y + height, x + width, y + height, { pen: 'thin', widthMm: 0.25 });
    return height;
  }

  /**
   * Draw a table.
   *
   * @param {object} ctx page context from page.js (must be inside a begun sheet)
   * @param {object} spec
   *   title, subtitle, x, y, width,
   *   columns: [{key,title,width(mm|fraction),align,wrap,sizeMm,bold,format,value}],
   *   rows: [object],
   *   groupBy: 'key' | function(row) -> string,
   *   groupLabel: function(groupValue, rows) -> string,
   *   footers: [{cells:{key:value}|array, bold, rule}],
   *   zebra, minRowHeight, sizeMm, headerSizeMm, meta (continuation sheet meta),
   *   emptyText
   * @returns {{y:number, rowCount:number}}
   */
  function draw(ctx, spec) {
    spec = spec || {};
    var rows = spec.rows || [];
    var x = spec.x === undefined ? ctx.body.x : spec.x;
    var y = spec.y === undefined ? ctx.y : spec.y;
    var width = spec.width === undefined ? ctx.body.width : spec.width;
    var opts = {
      sizeMm: spec.sizeMm || 2.2,
      headerSizeMm: spec.headerSizeMm || 2.15,
      lineHeightFactor: spec.lineHeightFactor || LINE,
      zebra: spec.zebra === undefined ? true : !!spec.zebra,
      minRowHeight: spec.minRowHeight || 6.2,
      rowRules: spec.rowRules !== false,
      width: width,
      __rowIndex: 0
    };
    var columns = resolveColumns(spec.columns || [], width);
    var bottom = ctx.body.bottom;
    var meta = spec.meta || {};

    // Table title
    y = drawTitle(ctx, spec.title, x, y, width, {
      titleSizeMm: spec.titleSizeMm,
      subtitle: spec.subtitle,
      subtitleSizeMm: spec.subtitleSizeMm
    });

    // Totals / footer height is reserved *after* the rows, so we simply append.
    var idx = 0;
    var groupCursor = undefined;
    var headerHeight = null;

    function ensureHeader() {
      if (headerHeight !== null) return;
      // If even the header + one row cannot fit, start a continuation page.
      var est = (spec.minRowHeight || 6.2) + 8;
      if (!ctx.hasRoom(est)) {
        ctx.continueSheet(meta);
        x = spec.x === undefined ? ctx.body.x : spec.x;
        y = ctx.body.y;
        if (spec.title && spec.continueTitle !== false) {
          y = drawTitle(ctx, spec.title, x, y, width, {
            titleSizeMm: spec.titleSizeMm,
            subtitle: null
          });
        }
      }
      headerHeight = drawHeader(ctx, columns, x, y, opts);
      y += headerHeight;
    }

    ensureHeader();

    for (; idx < rows.length; idx++) {
      var row = rows[idx];
      opts.__rowIndex = idx;

      // group header rows
      if (spec.groupBy) {
        var gv = typeof spec.groupBy === 'function' ? spec.groupBy(row) : row[spec.groupBy];
        if (gv !== groupCursor) {
          groupCursor = gv;
          var label = spec.groupLabel ? spec.groupLabel(gv, row) : clean(gv);
          var gh = 0;
          // group header needs the row after it, so keep 1 row worth of space
          var need = 8 + (spec.minRowHeight || 6.2);
          if (!ctx.hasRoom(need)) {
            ctx.continueSheet(meta);
            x = spec.x === undefined ? ctx.body.x : spec.x;
            y = ctx.body.y;
            headerHeight = drawHeader(ctx, columns, x, y, opts);
            y += headerHeight;
          }
          gh = drawGroupRow(ctx, label, x, y, width, { groupSizeMm: spec.groupSizeMm });
          y += gh;
        }
      }

      var measured = measureRow(ctx, columns, row, opts.sizeMm, opts);
      if (y + measured.height > bottom) {
        ctx.continueSheet(meta);
        x = spec.x === undefined ? ctx.body.x : spec.x;
        y = ctx.body.y;
        if (spec.title && spec.continueTitle !== false) {
          y = drawTitle(ctx, spec.title, x, y, width, {
            titleSizeMm: spec.titleSizeMm,
            subtitle: null
          });
        }
        headerHeight = drawHeader(ctx, columns, x, y, opts);
        y += headerHeight;
        if (spec.groupBy && groupCursor !== undefined) {
          // redraw the group label so a continued page is self-explanatory
          var gl = spec.groupLabel ? spec.groupLabel(groupCursor, row) : clean(groupCursor);
          y += drawGroupRow(ctx, gl, x, y, width, { groupSizeMm: spec.groupSizeMm });
        }
      }
      drawRow(ctx, columns, measured.cells, x, y, measured.height, opts);
      y += measured.height;
      ctx.y = y;
    }

    if (!rows.length && spec.emptyText) {
      ctx.backend.text(x + PAD_X, y + 3, pageModule().cleanText(spec.emptyText), {
        sizeMm: 2.4, baseline: 'top', color: [80, 80, 80]
      });
      y += 7;
      ctx.y = y;
    }

    // Footer/total rows: bold, with a heavier rule above the first one.
    var footers = spec.footers || [];
    for (var f = 0; f < footers.length; f++) {
      var footer = footers[f] || {};
      var footerCells = [];
      var footerHeight = footer.height || 7.2;
      if (!ctx.hasRoom(footerHeight + 2)) {
        ctx.continueSheet(meta);
        x = spec.x === undefined ? ctx.body.x : spec.x;
        y = ctx.body.y;
      }
      if (footer.rule !== false) {
        ctx.backend.line(x, y, x + width, y, { pen: 'cut', widthMm: 0.35 });
        y += 1.4;
      }
      // Build a pseudo row for measurement
      var values = footer.cells || footer;
      var cells = [];
      var maxLines = 1;
      var footerSize = footer.sizeMm || opts.sizeMm;
      var flh = footerSize * opts.lineHeightFactor;
      for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        var raw;
        if (Array.isArray(values)) raw = values[c];
        else raw = values[col.key];
        raw = clean(raw);
        var wrapped = pageModule().wrapLines(ctx.backend, raw, col.width - 2 * PAD_X, footerSize, { bold: true });
        cells.push(wrapped);
        if (wrapped.length > maxLines) maxLines = wrapped.length;
      }
      var fh = maxLines * flh + 2 * PAD_Y;
      var cx = x;
      for (var ci = 0; ci < columns.length; ci++) {
        var c2 = columns[ci];
        var tx = c2.align === 'right' ? cx + c2.width - PAD_X : (c2.align === 'center' ? cx + c2.width / 2 : cx + PAD_X);
        for (var li = 0; li < cells[ci].length; li++) {
          ctx.backend.text(tx, y + PAD_Y + li * flh, cells[ci][li], {
            sizeMm: footer.sizeMm || opts.sizeMm,
            align: c2.align,
            baseline: 'top',
            bold: footer.bold !== false
          });
        }
        cx += c2.width;
      }
      y += fh + 0.6;
      ctx.y = y;
    }

    return { y: y, rowCount: rows.length };
  }

  /**
   * Draw a table that must fit inside a fixed vertical band (a card on a nesting
   * page, for example). Draws the title, header and as many rows as fit before
   * `spec.maxY`, then returns `{y, drawn, remaining}` so the caller can continue the
   * remainder elsewhere. Never splits a row and never draws past maxY.
   */
  function drawBounded(ctx, spec) {
    spec = spec || {};
    var rows = spec.rows || [];
    var x = spec.x === undefined ? ctx.body.x : spec.x;
    var y = spec.y === undefined ? ctx.y : spec.y;
    var width = spec.width === undefined ? ctx.body.width : spec.width;
    var maxY = spec.maxY === undefined ? ctx.body.bottom : spec.maxY;
    var opts = {
      sizeMm: spec.sizeMm || 1.85,
      headerSizeMm: spec.headerSizeMm || 1.75,
      lineHeightFactor: spec.lineHeightFactor || LINE,
      zebra: spec.zebra === undefined ? false : !!spec.zebra,
      minRowHeight: spec.minRowHeight || 4.6,
      rowRules: spec.rowRules !== false,
      width: width,
      __rowIndex: 0
    };
    var columns = resolveColumns(spec.columns || [], width);
    if (spec.title) {
      y = drawTitle(ctx, spec.title, x, y, width, { titleSizeMm: spec.titleSizeMm, subtitle: null });
    }
    if (y + 5.6 > maxY) {
      return { y: y, drawn: 0, remaining: rows.slice() };
    }
    y += drawHeader(ctx, columns, x, y, opts);
    var drawn = 0;
    for (; drawn < rows.length; drawn++) {
      opts.__rowIndex = drawn;
      var measured = measureRow(ctx, columns, rows[drawn], opts.sizeMm, opts);
      if (y + measured.height > maxY + 0.01) break;
      drawRow(ctx, columns, measured.cells, x, y, measured.height, opts);
      y += measured.height;
    }
    return { y: y, drawn: drawn, remaining: rows.slice(drawn) };
  }

  /**
   * Simple two-column key/value block — used for drawing notes panels.
   * Returns the y below the block.
   */
  function keyValue(ctx, x, y, width, pairs, opts) {
    opts = opts || {};
    var labelW = opts.labelWidth || width * 0.32;
    var sizeMm = opts.sizeMm || 2.2;
    var lh = sizeMm * 1.4;
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i] || [];
      var label = clean(pair[0]);
      var value = clean(pair[1]);
      var lines = pageModule().wrapLines(ctx.backend, value, width - labelW - 2, sizeMm, {});
      ctx.backend.text(x, y + i * lh, label, {
        sizeMm: sizeMm, baseline: 'top', color: opts.labelColor || [90, 90, 90], bold: !!opts.boldLabels
      });
      for (var l = 0; l < lines.length; l++) {
        ctx.backend.text(x + labelW, y + (i + l) * lh, lines[l], { sizeMm: sizeMm, baseline: 'top', bold: !!opts.bold });
      }
    }
    return y + pairs.length * lh;
  }

  CS.export = CS.export || {};
  CS.export.pdf = CS.export.pdf || {};
  CS.export.pdf.tables = {
    draw: draw,
    drawBounded: drawBounded,
    keyValue: keyValue,
    resolveColumns: resolveColumns,
    PAD_X: PAD_X,
    PAD_Y: PAD_Y
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.export.pdf.tables;
})(typeof globalThis !== 'undefined' ? globalThis : this);
