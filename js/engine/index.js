/**
 * Cabinet Studio engine — public API (contract §4).
 *
 *   CS.engine.resolveProject(project)            -> Resolved
 *   CS.engine.resolveCabinet(project, cabinet)   -> CabinetModel
 *   CS.engine.defaults                           -> defaults / standards / materials API
 *   CS.engine.suggestDrawerHeights(cabinet)      -> [mm, ...] top drawer first
 *   CS.engine.suggestCabinetDimensions(type)     -> {width, height, depth}
 *   CS.engine.optionIds                          -> valid option id sets for UI pickers
 *
 * This aggregator also owns error containment: a cabinet that cannot be resolved never breaks the
 * project — it produces an error warning and an empty model so the UI, PDF and CAD stages can
 * carry on and report the problem honestly.
 */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var defaults = CS.engine && CS.engine.defaults;
  var cabinetMod = CS.engine && CS.engine.cabinet;
  var cutlistMod = CS.engine && CS.engine.cutlist;
  var checkMod = CS.engine && CS.engine.check;
  if (!defaults || !cabinetMod || !cutlistMod) {
    throw new Error('CabinetStudio engine load order: defaults.js, cabinet.js and cutlist.js must load before index.js');
  }

  var U = defaults.util;
  var round = U.round, num = U.num;

  /** Minimal CabinetModel used when one cabinet fails to resolve. */
  function emptyModel(config, warning) {
    return {
      config: config,
      dims: {
        width: config.width, height: config.height, depth: config.depth,
        carcassHeight: 0, carcassDepth: 0, interiorWidth: 0, interiorHeight: 0, interiorDepth: 0,
        boxTopZ: config.height, frontBottomZ: 0, frontHeight: 0, toeKickHeight: 0,
        sideDepth: 0, sidePanelHeight: 0, sidePanelZ0: 0, reveal: config.front ? config.front.reveal : 3,
        carcassThickness: 0, faceFrameThickness: 0, backThickness: 0, boxBottomZ: 0
      },
      parts: [],
      hardware: [],
      frontSchedule: [],
      assembly: [],
      warnings: [warning],
      openings: [],
      frontLayout: { doors: [], drawerFronts: [] },
      faceFrameLayout: { members: [] },
      shelves: { fixed: [], adjustable: [] },
      drawerBoxes: [],
      stats: {
        partCount: 0, partTypeCount: 0, machiningCount: 0, hardwareCount: 0,
        frontCount: 0, doorCount: 0, drawerCount: 0, areaM2: 0, edgebandMetres: 0
      }
    };
  }

  function cabinetFailureWarning(config, error) {
    return {
      id: 'cabinet.resolve',
      severity: 'error',
      cabinetId: config ? config.id : null,
      cabinetTag: config ? config.tag : null,
      partIds: [],
      title: 'Cabinet could not be resolved',
      message: 'The engine hit an error resolving ' + (config ? config.tag + ' (' + config.name + ')' : 'a cabinet') + ': ' + (error && error.message ? error.message : String(error)),
      rule: 'engine.resolve',
      fix: 'Check the cabinet settings; if the inputs look valid this is a generator bug — report the cabinet.'
    };
  }

  function resolveOne(project, cabinet, index) {
    var norm = defaults.normalizeCabinet(project, cabinet, index);
    try {
      var resolvedModel = cabinetMod.resolveCabinet(project, norm.config, index);
      // resolveCabinet normalises again internally; surface the caller-level warnings (e.g. invalid
      // option ids) ahead of the model warnings.
      if (norm.warnings.length) {
        resolvedModel.warnings = norm.warnings.concat(resolvedModel.warnings);
      }
      return resolvedModel;
    } catch (e) {
      var model = emptyModel(norm.config, cabinetFailureWarning(norm.config, e));
      // Keep any normalisation warnings so the UI still explains bad inputs.
      for (var i = 0; i < norm.warnings.length; i++) model.warnings.push(norm.warnings[i]);
      return model;
    }
  }

  /**
   * Resolve a whole project into buildable models, cut list, sheet layouts, hardware schedule,
   * front schedule and warnings.
   *
   * @param {Object} project project object (partial allowed; defaults are filled)
   * @returns {Object} Resolved (contract §4)
   */
  function resolveProject(project) {
    var projectNorm = defaults.normalizeProject(project);
    var proj = projectNorm.project;
    var standards = defaults.standards();
    var warnings = projectNorm.warnings.slice();
    var cabinets = [];
    var i;

    for (i = 0; i < proj.cabinets.length; i++) {
      var model = resolveOne(proj, proj.cabinets[i], i);
      cabinets.push(model);
      for (var w = 0; w < model.warnings.length; w++) warnings.push(model.warnings[w]);
    }

    // Material plan: cut list -> guillotine layouts for the selected objective -> totals and the
    // Resolved.optimization block (see docs/CUT-PLANNING-SPEC.md).
    var cutList = cutlistMod.buildCutList(cabinets, proj);
    var includeLayout = !proj.settings || proj.settings.includeSheetLayout !== false;
    var materialPlan = cutlistMod.buildMaterialPlan(cutList, proj);
    var sheetLayouts = materialPlan.layouts;
    var optimization = materialPlan.optimization;
    if (!includeLayout) {
      // Totals/optimization still describe the material requirement; the layout pages are simply
      // not included in the plan set.
      sheetLayouts = [];
    }

    var hardware = cutlistMod.aggregateHardware(cabinets);
    var frontSchedule = [];
    for (i = 0; i < cabinets.length; i++) {
      if (cabinets[i].frontSchedule) frontSchedule = frontSchedule.concat(cabinets[i].frontSchedule);
    }

    var resolved = {
      project: proj,
      cabinets: cabinets,
      cutList: cutList,
      sheetLayouts: sheetLayouts,
      optimization: optimization,
      hardware: hardware,
      frontSchedule: frontSchedule,
      warnings: warnings,
      stats: {
        cabinetCount: cabinets.length,
        partCount: 0,
        sheetCount: cutList.totals.sheetCount,
        sheetAreaM2: cutList.totals.sheetAreaM2,
        edgebandMetres: cutList.totals.edgebandMetres,
        hardwareCount: 0,
        cutCount: cutList.totals.cutCount,
        offcutCount: cutList.totals.offcutCount,
        solidBoardFeet: cutList.totals.solidBoardFeet,
        purchaseBoardFeet: cutList.totals.purchaseBoardFeet,
        purchaseSheets: cutList.totals.purchaseSheets
      }
    };

    // Project-level validation.
    if (checkMod && typeof checkMod.validateProject === 'function') {
      try {
        var projectWarnings = checkMod.validateProject(resolved, proj, standards);
        for (i = 0; i < projectWarnings.length; i++) resolved.warnings.push(projectWarnings[i]);
      } catch (e) {
        resolved.warnings.push({
          id: 'project.check',
          severity: 'warning',
          cabinetId: null,
          cabinetTag: null,
          partIds: [],
          title: 'Project validation did not run',
          message: 'Project validation failed: ' + (e && e.message ? e.message : String(e)),
          rule: 'engine.check',
          fix: 'Report this project so the validation can be fixed.'
        });
      }
    }

    // Stats.
    resolved.stats.partCount = cutList.totals.partCount;
    var hwQty = 0;
    for (i = 0; i < hardware.length; i++) {
      // Count pieces; metre-measured items (hanging rail) are lengths, not counts.
      if (hardware[i].unit !== 'm') hwQty += num(hardware[i].qty, 0);
    }
    resolved.stats.hardwareCount = round(hwQty, 2);
    resolved.stats.uniqueParts = cutList.totals.uniqueParts;
    resolved.stats.frontCount = frontSchedule.length;
    resolved.stats.doorCount = frontSchedule.filter(function (f) { return f.kind === 'door'; }).length;
    resolved.stats.drawerCount = frontSchedule.filter(function (f) { return f.kind === 'drawer-front'; }).length;
    resolved.stats.machiningCount = cabinets.reduce(function (a, m) {
      return a + m.parts.reduce(function (b, p) { return b + p.machining.length; }, 0);
    }, 0);
    resolved.stats.warningCount = resolved.warnings.length;
    resolved.stats.errorCount = resolved.warnings.filter(function (w) { return w.severity === 'error'; }).length;
    return resolved;
  }

  /**
   * Resolve a single cabinet out of its project (or standalone).
   * @param {Object} project
   * @param {Object} cabinet
   * @returns {Object} CabinetModel
   */
  function resolveCabinet(project, cabinet) {
    return resolveOne(project, cabinet, 0);
  }

  function suggestDrawerHeights(cabinet) {
    return cabinetMod.suggestDrawerHeights(cabinet);
  }

  function suggestCabinetDimensions(type) {
    return cabinetMod.suggestCabinetDimensions(type);
  }

  // Public API.
  CS.engine.resolveProject = resolveProject;
  CS.engine.resolveCabinet = resolveCabinet;
  CS.engine.suggestDrawerHeights = suggestDrawerHeights;
  CS.engine.suggestCabinetDimensions = suggestCabinetDimensions;
  CS.engine.optionIds = defaults.optionIds;
  CS.engine.standards = defaults.standards;

  var api = {
    resolveProject: resolveProject,
    resolveCabinet: resolveCabinet,
    defaults: defaults,
    suggestDrawerHeights: suggestDrawerHeights,
    suggestCabinetDimensions: suggestCabinetDimensions,
    optionIds: defaults.optionIds
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
