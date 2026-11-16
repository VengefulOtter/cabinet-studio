/* Cabinet Studio — unified export API used by the UI.
 *
 * Keeps the UI decoupled from the PDF and CAD modules: builds filenames and
 * option objects, calls the right module, and turns the result into a browser
 * download. No DOM work happens until download* is called.
 *
 * Classic script; attaches to CS.export.exports and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});
  CS.export = CS.export || {};

  function projectOf(resolved) {
    return (resolved && resolved.project) || {};
  }

  function dateOf(resolved) {
    var project = projectOf(resolved);
    return (project.settings && project.settings.date) || new Date().toISOString().slice(0, 10);
  }

  function baseName(resolved) {
    var project = projectOf(resolved);
    return (CS.util.slug(project.name || 'cabinet-project')) + '-' + dateOf(resolved);
  }

  function suggestedFilenames(resolved) {
    var base = baseName(resolved);
    return {
      pdf: base + '-plan-set.pdf',
      dxf: base + '-shop-drawings.dxf',
      dwg: base + '-shop-drawings.dwg',
      json: base + '-project.json'
    };
  }

  function pdfOptions(resolved, overrides) {
    var project = projectOf(resolved);
    var settings = project.settings || {};
    return Object.assign({
      pageSize: project.pageSize || 'letter',
      orientation: project.orientation || 'landscape',
      includeCover: true,
      includeCutList: true,
      includeNesting: !!settings.includeSheetLayout,
      includeAssembly: settings.includeAssembly !== false,
      includeComponents: settings.includeComponentDrawings !== false,
      includeSchedules: true,
      includeNotes: true,
      componentScope: 'all',
      date: dateOf(resolved),
      units: project.units || 'imperial'
    }, overrides || {});
  }

  function cadOptions(resolved, overrides) {
    return Object.assign({
      mode: 'all',
      units: 'mm',
      dxfVersion: 'r2000',
      dwgVersion: ((projectOf(resolved).settings || {}).dwgVersion) || 'r2000',
      date: dateOf(resolved)
    }, overrides || {});
  }

  function capabilities() {
    return {
      pdf: !!(CS.export.pdf && typeof CS.export.pdf.generate === 'function'),
      dxf: !!(CS.export.cadLayout && CS.export.dxf && typeof CS.export.dxf.build === 'function'),
      dwg: !!(CS.export.cadLayout && CS.export.dwg && typeof CS.export.dwg.build === 'function')
    };
  }

  function requireModule(moduleName) {
    var mod = CS.export[moduleName];
    if (!mod) throw new Error('Export module "' + moduleName + '" is not loaded.');
    return mod;
  }

  /** Build (but do not download) the PDF plan set. */
  function buildPdf(resolved, overrides) {
    var opts = pdfOptions(resolved, overrides);
    var pdf = requireModule('pdf');
    var result = pdf.generate(resolved, opts);
    var filename = result.filename || suggestedFilenames(resolved).pdf;
    var blob = result.blob;
    if (!blob && result.doc && typeof result.doc.output === 'function') {
      blob = result.doc.output('blob');
    }
    return {
      blob: blob,
      filename: filename,
      pageCount: result.pages != null ? result.pages : (result.pageCount || 0),
      warnings: result.warnings || []
    };
  }

  function buildCadDrawing(resolved, overrides) {
    var cadLayout = requireModule('cadLayout');
    return cadLayout.build(resolved, cadOptions(resolved, overrides));
  }

  function buildDxf(resolved, overrides) {
    var cadDrawing = buildCadDrawing(resolved, overrides);
    var dxf = requireModule('dxf');
    var text = dxf.build(cadDrawing, Object.assign(cadOptions(resolved, overrides), { version: overrides && overrides.dxfVersion }));
    return {
      text: text,
      filename: suggestedFilenames(resolved).dxf,
      entityCount: cadDrawing.entities ? cadDrawing.entities.length : 0
    };
  }

  function buildDwg(resolved, overrides) {
    var cadDrawing = buildCadDrawing(resolved, overrides);
    var dwg = requireModule('dwg');
    var result = dwg.build(cadDrawing, Object.assign(cadOptions(resolved, overrides), { version: overrides && overrides.dwgVersion }));
    return {
      bytes: result.data || result.bytes,
      skipped: result.skipped || [],
      downgraded: result.downgraded || [],
      filename: suggestedFilenames(resolved).dwg,
      entityCount: cadDrawing.entities ? cadDrawing.entities.length : 0
    };
  }

  function downloadPdf(resolved, overrides) {
    var built = buildPdf(resolved, overrides);
    if (!built.blob) throw new Error('PDF module returned no data.');
    CS.util.downloadBlob(built.filename, built.blob);
    return built;
  }

  function downloadDxf(resolved, overrides) {
    var built = buildDxf(resolved, overrides);
    var blob = new Blob([built.text], { type: 'application/dxf' });
    CS.util.downloadBlob(built.filename, blob);
    return built;
  }

  function downloadDwg(resolved, overrides) {
    var built = buildDwg(resolved, overrides);
    var blob = new Blob([built.bytes], { type: 'application/acad' });
    CS.util.downloadBlob(built.filename, blob);
    return built;
  }

  CS.export.exports = {
    suggestedFilenames: suggestedFilenames,
    pdfOptions: pdfOptions,
    cadOptions: cadOptions,
    capabilities: capabilities,
    buildPdf: buildPdf,
    buildDxf: buildDxf,
    buildDwg: buildDwg,
    downloadPdf: downloadPdf,
    downloadDxf: downloadDxf,
    downloadDwg: downloadDwg
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.export.exports;
})(typeof globalThis !== 'undefined' ? globalThis : this);
