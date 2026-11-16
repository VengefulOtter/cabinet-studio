/**
 * Cabinet Studio — PDF plan-set export entry point.
 *
 *   CS.export.pdf.generate(resolved, options) -> { doc, pages, filename, warnings }
 *   CS.export.pdf.download(resolved, options) -> { filename, pages, warnings }
 *
 * Generation is a two-pass render. Pass 1 draws the whole sheet list into a scratch
 * document purely to learn the final page count (and the real sheet list used by the
 * cover's sheet index). Pass 2 draws the same sheet list into the returned document,
 * stamping "Sheet n of N" on every title block. Scene construction is cached by the
 * plan-set planner, so pass 2 reuses the geometry built in pass 1.
 *
 * jsPDF is expected on the global as `window.jspdf.jsPDF` (browser) or
 * `globalThis.jspdf.jsPDF` (Node test loader) — exactly as the vendored UMD sets it.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});

  /** Loaded jsPDF constructor, from the browser or Node global. */
  function getJsPDF() {
    if (root.jspdf && typeof root.jspdf.jsPDF === 'function') return root.jspdf.jsPDF;
    if (typeof root.jsPDF === 'function') return root.jsPDF;
    // Node fallback: load the vendored UMD directly (never runs in the browser, where
    // `require` is undefined — the contract's global is the primary path).
    if (typeof require === 'function') {
      try {
        var mod = require('../../vendor/jspdf.umd.min.js');
        if (mod && typeof mod.jsPDF === 'function') return mod.jsPDF;
      } catch (e) { /* fall through to the error below */ }
    }
    throw new Error('CS.export.pdf.generate: jsPDF is not loaded. Include js/vendor/jspdf.umd.min.js before the PDF modules.');
  }

  function slug(text) {
    if (CS.util && typeof CS.util.slug === 'function') return CS.util.slug(text);
    return String(text || 'cabinet-project')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^[-]+|[-]+$/g, '') || 'cabinet-project';
  }

  function dateOf(resolved) {
    var project = (resolved && resolved.project) || {};
    return (project.settings && project.settings.date) || new Date().toISOString().slice(0, 10);
  }

  /** Stable 32-hex-char PDF file id (jsPDF otherwise randomises /ID on every run). */
  function deterministicFileId(seed) {
    var h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x85ebca6b, h4 = 0xc2b2ae35;
    for (var i = 0; i < seed.length; i++) {
      var c = seed.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0; h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + c * (i + 1)) >>> 0; h2 = (h2 * 2246822519) >>> 0;
      h3 = (h3 ^ (c << (i % 13))) >>> 0; h3 = (h3 * 3266489917) >>> 0;
      h4 = (h4 + (c ^ (h4 >>> 7))) >>> 0; h4 = (h4 * 668265263) >>> 0;
    }
    function hex(v) { return ('0000000' + (v >>> 0).toString(16)).slice(-8); }
    return (hex(h1) + hex(h2) + hex(h3) + hex(h4)).toUpperCase();
  }

  /** PDF date string (fixed timezone) so re-exporting identical input is byte-stable. */
  function pdfDateString(dateText) {
    var digits = String(dateText || '').replace(/[^0-9]/g, '');
    if (digits.length < 8) digits = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    digits = digits.slice(0, 8);
    return 'D:' + digits + '000000+00\'00';
  }

  function filenameFor(resolved, options) {
    var project = (resolved && resolved.project) || {};
    return slug(project.name || 'cabinet-project') + '-' + dateOf(resolved) + '-plan-set.pdf';
  }

  /** Draw an error box on the current page when one sheet's draw function throws. */
  function drawSheetError(ctx, error, sheet) {
    var box = {
      x: ctx.body.x,
      y: ctx.body.y,
      width: ctx.body.width,
      height: Math.min(40, ctx.body.height)
    };
    ctx.backend.rect(box.x, box.y, box.width, box.height, { pen: 'thick', widthMm: 0.5, fill: 'light' });
    ctx.text(box.x + 3, box.y + 3.5, 'SHEET COULD NOT BE DRAWN', { sizeMm: 3.4, bold: true, baseline: 'top' });
    var message = (error && error.message) ? error.message : String(error);
    ctx.paragraph('Sheet "' + (sheet.title || '') + '" failed: ' + message +
      '. The rest of the plan set is unaffected; report this to the Cabinet Studio maintainers.', box.x + 3, box.y + 8.5, box.width - 6, { sizeMm: 2.3, lineHeight: 3.4, maxLines: 6 });
  }

  /**
   * Render every sheet of the plan into a page context.
   * @returns {Array} runtime warnings (sheet-level failures)
   */
  function renderSheets(planned, ctx, passState) {
    var runtimeWarnings = [];
    planned.sheets.forEach(function (sheet, index) {
      try {
        ctx.beginSheet({
          title: sheet.title,
          subtitle: sheet.subtitle,
          scale: sheet.scale,
          cabinetTag: sheet.cabinetTag,
          note: sheet.note
        });
        sheet.draw(ctx, passState);
      } catch (e) {
        try { drawSheetError(ctx, e, sheet); } catch (e2) { /* never fail the whole export for one page */ }
        runtimeWarnings.push({
          id: 'pdf-sheet-' + (index + 1),
          severity: 'error',
          title: 'Sheet failed: ' + (sheet.title || ''),
          message: (e && e.message) ? e.message : String(e),
          rule: 'pdf-sheet',
          fix: 'Report this sheet to the Cabinet Studio maintainers; other sheets are still usable.'
        });
      } finally {
        try { ctx.endSheet(); } catch (e3) { /* ignore */ }
      }
    });
    return runtimeWarnings;
  }

  /**
   * Generate the PDF plan set.
   *
   * @param {object} resolved Resolved project (CS.engine.resolveProject output)
   * @param {object} [options] see CONTRACT.md §7
   * @returns {{doc:object, pages:number, filename:string, warnings:Array, options:object}}
   */
  function generate(resolved, options) {
    if (!resolved || typeof resolved !== 'object') {
      throw new Error('CS.export.pdf.generate: a resolved project is required (got ' + (resolved === null ? 'null' : typeof resolved) + ').');
    }
    if (!CS.export.pdf.planSet || typeof CS.export.pdf.planSet.plan !== 'function') {
      throw new Error('CS.export.pdf.generate: plan-set composer is not loaded.');
    }
    var jsPDF = getJsPDF();
    var planned = CS.export.pdf.planSet.plan(resolved, options);
    var pageOpts = planned.options;
    var project = planned.options.project || {};

    // ---- pass 1: count pages + capture the real sheet list for the cover index
    var scratchDoc = new jsPDF({
      unit: 'mm',
      format: pageOpts.pageSize,
      orientation: pageOpts.orientation,
      compress: true
    });
    var scratchCtx = CS.export.pdf.page.createContext(scratchDoc, {
      pageSize: pageOpts.pageSize,
      orientation: pageOpts.orientation,
      project: project,
      options: pageOpts,
      totalPages: null
    });
    var runtimeWarnings = renderSheets(planned, scratchCtx, { pass: 1, totalPages: null, sheetList: null });
    var totalPages = Math.max(1, scratchCtx.sheetIndex);
    var sheetList = scratchCtx.sheets.map(function (sheet) {
      return { index: sheet.index, title: sheet.title };
    });
    // release the scratch document (large plan sets hold a lot of vector state)
    scratchCtx = null;
    scratchDoc = null;

    // ---- pass 2: the delivered document
    var doc = new jsPDF({
      unit: 'mm',
      format: pageOpts.pageSize,
      orientation: pageOpts.orientation,
      compress: true
    });
    doc.setCreationDate(pdfDateString(pageOpts.date || dateOf(resolved)));
    doc.setFileId(deterministicFileId(
      (project.name || 'cabinet-project') + '|' + (pageOpts.date || '') + '|' + pageOpts.pageSize + '|' + pageOpts.orientation
    ));
    doc.setProperties({
      title: (project.name || 'Cabinet project') + ' — shop plan set',
      subject: 'Cabinet Studio plan set — cabinet, component and assembly drawings with cut list and schedules',
      author: 'Cabinet Studio',
      creator: 'Cabinet Studio (local, self-contained cabinet design app)',
      keywords: 'cabinet, plan set, shop drawings, cut list, nesting, assembly'
    });
    var ctx = CS.export.pdf.page.createContext(doc, {
      pageSize: pageOpts.pageSize,
      orientation: pageOpts.orientation,
      project: project,
      options: pageOpts,
      totalPages: totalPages
    });
    var pass2Warnings = renderSheets(planned, ctx, {
      pass: 2,
      totalPages: totalPages,
      sheetList: sheetList
    });

    var warnings = planned.warnings.concat(runtimeWarnings, pass2Warnings);
    var filename = filenameFor(resolved, pageOpts);
    return {
      doc: doc,
      pages: ctx.sheetIndex,
      filename: filename,
      warnings: warnings,
      options: pageOpts
    };
  }

  /**
   * Generate the plan set and trigger a browser download.
   * @returns {{filename:string, pages:number, warnings:Array}}
   */
  function download(resolved, options) {
    var result = generate(resolved, options);
    if (!result.doc || typeof result.doc.save !== 'function') {
      throw new Error('CS.export.pdf.download: jsPDF document has no save().');
    }
    result.doc.save(result.filename);
    return {
      filename: result.filename,
      pages: result.pages,
      warnings: result.warnings
    };
  }

  CS.export = CS.export || {};
  CS.export.pdf = CS.export.pdf || {};
  CS.export.pdf.generate = generate;
  CS.export.pdf.download = download;
  CS.export.pdf.filenameFor = filenameFor;

  if (typeof module === 'object' && module.exports) {
    module.exports = { generate: generate, download: download, filenameFor: filenameFor };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
