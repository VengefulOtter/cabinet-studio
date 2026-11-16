/* Cabinet Studio — project factory, sample data, normalisation and JSON I/O.
 * This file owns the canonical shape of a project. The engine resolves defaults;
 * here we make sure every project has the contract's top-level shape and every
 * cabinet has a complete, editable configuration.
 *
 * Classic script; attaches to CS.core.project and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});

  var SCHEMA_VERSION = 1;

  var TYPE_LABELS = { base: 'Base', wall: 'Wall', tall: 'Tall', pantry: 'Pantry' };
  var TYPE_PREFIX = { base: 'B', wall: 'W', tall: 'T', pantry: 'P' };
  var TYPE_ORDER = ['base', 'wall', 'tall', 'pantry'];

  var PRESETS = {
    base: { width: 762, height: 876.3, depth: 609.6 },
    wall: { width: 762, height: 762, depth: 304.8 },
    tall: { width: 609.6, height: 2133.6, depth: 609.6 },
    pantry: { width: 609.6, height: 2133.6, depth: 304.8 }
  };

  var STANDARD_WIDTHS = [228.6, 304.8, 381, 457.2, 533.4, 609.6, 685.8, 762, 838.2, 914.4, 1066.8, 1219.2];
  var WALL_HEIGHTS = [457.2, 609.6, 762, 914.4, 1066.8, 1219.2];
  var TALL_HEIGHTS = [1828.8, 1981.2, 2133.6, 2286, 2438.4];
  var DEPTHS = [304.8, 381, 457.2, 533.4, 609.6, 660.4];

  var SETTINGS_DEFAULTS = {
    shopName: '',
    date: '2026-11-15',
    defaultCarcassMaterial: 'ply-birch-18',
    defaultFaceFrameMaterial: 'hardwood-poplar',
    defaultDoorMaterial: 'hardwood-maple',
    defaultDrawerMaterial: 'ply-birch-12',
    defaultFinish: 'paint',
    edgeBanding: 'pvc-0.5',
    sheetWidth: 1220,
    sheetHeight: 2440,
    sheetTrim: 10,
    sheetKerf: 3,
    includeSheetLayout: true,
    includeAssembly: true,
    includeComponentDrawings: true,
    dwgVersion: 'r2000'
  };

  function deepClone(v) {
    if (v == null || typeof v !== 'object') return v;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(v); } catch (e) { /* noop */ }
    }
    return JSON.parse(JSON.stringify(v));
  }

  function isPlainObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v);
  }

  /** Deep merge: arrays and primitives from `patch` replace base values. */
  function mergeDeep(base, patch) {
    if (!isPlainObject(base) || !isPlainObject(patch)) {
      return patch === undefined ? deepClone(base) : deepClone(patch);
    }
    var out = {};
    var key;
    // Imported JSON is untrusted input. Do not let a project file pollute
    // Object.prototype through a __proto__ / constructor / prototype key.
    var unsafeKeys = { __proto__: true, constructor: true, prototype: true };
    for (key in base) {
      if (!Object.prototype.hasOwnProperty.call(base, key) || unsafeKeys[key]) continue;
      out[key] = deepClone(base[key]);
    }
    for (key in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, key) || unsafeKeys[key]) continue;
      if (isPlainObject(base[key]) && isPlainObject(patch[key])) {
        out[key] = mergeDeep(base[key], patch[key]);
      } else if (patch[key] === undefined) {
        out[key] = deepClone(base[key]);
      } else {
        out[key] = deepClone(patch[key]);
      }
    }
    return out;
  }

  function num(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
      var parsed = parseFloat(value);
      if (isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  function nowIso() { return new Date().toISOString(); }

  function defaultName(type) {
    return TYPE_LABELS[type] + ' \u2014 new cabinet';
  }

  function defaultToeKick(type) {
    if (type === 'wall') return { style: 'none', height: 0, setback: 0, material: 'ply-birch-18', finishedFace: false };
    return { style: 'separate-platform', height: 101.6, setback: 76.2, material: 'ply-birch-18', finishedFace: true };
  }

  function defaultInterior(type) {
    var shelves = type === 'base' ? 1 : type === 'wall' ? 2 : type === 'tall' ? 4 : 5;
    var fixed = type === 'tall' || type === 'pantry' ? 1 : 0;
    return {
      adjustableShelves: shelves,
      fixedShelves: fixed,
      shelfThickness: 18,
      shelfMaterial: 'ply-birch-18',
      shelfFrontSetback: 10,
      shelfEdgeband: 'pvc-2',
      dividers: 0
    };
  }

  function defaultDoors(type, width) {
    var count = width >= 457.2 ? 2 : 1;
    return {
      count: count,
      style: 'shaker',
      material: 'hardwood-maple',
      thickness: 19,
      overlay: 'full',
      stileWidth: 57.15,
      railWidth: 57.15,
      doorJoinery: 'cope-stick',
      panelMaterial: 'ply-birch-6',
      panelThickness: 6.35,
      panelStyle: 'recessed',
      glassThickness: 3,
      beadSpacing: 57.15,
      muntins: 0,
      hingeType: 'euro-cup',
      hingeCount: 'auto',
      hingeSide: 'auto'
    };
  }

  function defaultDrawers() {
    return {
      count: 3,
      style: 'slab',
      material: 'hardwood-maple',
      thickness: 19,
      heights: null,
      boxMaterial: 'ply-birch-12',
      boxJoinery: 'dovetail',
      boxSideThickness: 12.7,
      boxBottomThickness: 6.35,
      boxBottomJoinery: 'dado',
      boxHeightAllowance: 25,
      slide: 'undermount',
      slideLength: null,
      boxWidthClearance: null,
      boxDepthClearance: null
    };
  }

  /**
   * Create a complete cabinet configuration for a type. `overrides` is deep-merged
   * over the defaults, so callers can pass any subset of the contract fields.
   */
  function makeCabinet(type, overrides) {
    type = TYPE_LABELS[type] ? type : 'base';
    var preset = PRESETS[type];
    var width = overrides && overrides.width != null ? num(overrides.width, preset.width) : preset.width;
    var base = {
      id: null,
      tag: null,
      name: defaultName(type),
      type: type,
      width: width,
      height: preset.height,
      depth: preset.depth,
      construction: {
        system: 'frameless',
        carcassMaterial: 'ply-birch-18',
        carcassThickness: 18,
        joinery: 'confirmat',
        backStyle: 'rabbet',
        backMaterial: 'ply-birch-6',
        backThickness: 6,
        backRecess: 12,
        dadoDepth: 6,
        shelfSystem: 'adjustable-pins-32',
        shelfPinDiameter: 5,
        shelfPinSpacing: 32,
        shelfPinFrontSetback: 37,
        edgeBanding: 'pvc-0.5'
      },
      faceFrame: {
        material: 'hardwood-poplar',
        thickness: 19,
        stileWidth: 57.15,
        topRailWidth: 57.15,
        bottomRailWidth: 57.15,
        midRailWidth: 57.15,
        joinery: 'pocket-screw'
      },
      toeKick: defaultToeKick(type),
      interior: defaultInterior(type),
      front: {
        type: 'doors',
        reveal: 3,
        doors: defaultDoors(type, width),
        drawers: defaultDrawers(),
        combined: { drawerHeight: 177.8, doorsBelow: 2 }
      },
      hardware: {
        pull: { id: 'bar-128', finish: 'brushed nickel', placement: 'auto' },
        softClose: true,
        doorBumpers: true,
        shelfPins: true,
        hangingRail: type !== 'base'
      },
      finish: { id: 'paint', color: '#f1ece1', sheen: 'satin' },
      notes: ''
    };
    return mergeDeep(base, overrides || {});
  }

  function emptyProjectTemplate() {
    return {
      schemaVersion: SCHEMA_VERSION,
      id: 'prj-1',
      name: 'Untitled cabinet project',
      client: '',
      notes: '',
      units: 'imperial',
      pageSize: 'letter',
      orientation: 'landscape',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      settings: deepClone(SETTINGS_DEFAULTS),
      cabinets: []
    };
  }

  function nextTag(project, type) {
    var prefix = TYPE_PREFIX[type] || 'B';
    var max = 0;
    (project.cabinets || []).forEach(function (cab) {
      var m = new RegExp('^' + prefix + '(\\d+)$').exec(String(cab.tag || ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return prefix + (max + 1);
  }

  function nextCabinetId(project) {
    var ids = (project.cabinets || []).map(function (c) { return c.id; });
    return CS.util.uid('cab', ids);
  }

  /** Add a new cabinet to the project in place; returns the new cabinet. */
  function addCabinet(project, type, overrides) {
    type = TYPE_LABELS[type] ? type : 'base';
    var cab = makeCabinet(type, overrides || {});
    cab.id = cab.id || nextCabinetId(project);
    cab.tag = cab.tag || nextTag(project, type);
    if (!cab.name || cab.name === defaultName(type)) cab.name = TYPE_LABELS[type] + ' \u2014 ' + cab.tag;
    project.cabinets.push(cab);
    return cab;
  }

  function duplicateCabinet(project, cabinetId) {
    var index = -1;
    for (var i = 0; i < project.cabinets.length; i++) {
      if (project.cabinets[i].id === cabinetId) { index = i; break; }
    }
    if (index < 0) return null;
    var source = project.cabinets[index];
    var copy = deepClone(source);
    copy.id = nextCabinetId(project);
    copy.tag = nextTag(project, source.type);
    copy.name = source.name + ' copy';
    project.cabinets.splice(index + 1, 0, copy);
    return copy;
  }

  function removeCabinet(project, cabinetId) {
    var before = project.cabinets.length;
    project.cabinets = project.cabinets.filter(function (c) { return c.id !== cabinetId; });
    return project.cabinets.length !== before;
  }

  function findCabinet(project, cabinetId) {
    for (var i = 0; i < project.cabinets.length; i++) {
      if (project.cabinets[i].id === cabinetId) return project.cabinets[i];
    }
    return null;
  }

  /** Ensure tags are unique and non-empty, assigning type-prefixed tags as needed. */
  function ensureUniqueTags(project) {
    var used = {};
    var missing = [];
    (project.cabinets || []).forEach(function (cab) {
      var tag = String(cab.tag || '').trim();
      if (!tag || used[tag]) missing.push(cab);
      else used[tag] = true;
    });
    missing.forEach(function (cab) {
      var tag = nextTag(project, cab.type);
      while (used[tag]) tag = tag + "'";
      cab.tag = tag;
      used[tag] = true;
    });
    return project;
  }

  /** Fill project-level defaults and complete each cabinet against makeCabinet(). */
  function normalizeProject(input) {
    var warnings = [];
    var project;
    if (typeof input === 'string') {
      try {
        project = JSON.parse(input);
      } catch (e) {
        return { project: createDefaultProject(), warnings: ['Project JSON could not be parsed: ' + e.message] };
      }
    } else if (isPlainObject(input)) {
      project = deepClone(input);
    } else {
      project = {};
    }
    if (!isPlainObject(project)) project = {};

    var template = emptyProjectTemplate();
    var merged = mergeDeep(template, project);
    merged.schemaVersion = SCHEMA_VERSION;
    merged.id = merged.id || 'prj-1';
    merged.name = String(merged.name || 'Untitled cabinet project');
    merged.client = String(merged.client || '');
    merged.notes = String(merged.notes || '');
    merged.units = merged.units === 'metric' ? 'metric' : 'imperial';
    merged.pageSize = ['letter', 'tabloid', 'a4', 'a3'].indexOf(merged.pageSize) >= 0 ? merged.pageSize : 'letter';
    merged.orientation = merged.orientation === 'portrait' ? 'portrait' : 'landscape';
    merged.settings = mergeDeep(SETTINGS_DEFAULTS, merged.settings || {});
    merged.settings.sheetWidth = num(merged.settings.sheetWidth, 1220);
    merged.settings.sheetHeight = num(merged.settings.sheetHeight, 2440);
    merged.settings.sheetTrim = num(merged.settings.sheetTrim, 10);
    merged.settings.sheetKerf = num(merged.settings.sheetKerf, 3);
    merged.createdAt = merged.createdAt || nowIso();
    merged.updatedAt = merged.updatedAt || merged.createdAt;

    var rawCabinets = Array.isArray(merged.cabinets) ? merged.cabinets : [];
    var ids = {};
    var tags = {};
    merged.cabinets = rawCabinets.filter(isPlainObject).map(function (raw, index) {
      var type = TYPE_LABELS[raw.type] ? raw.type : 'base';
      var cab = mergeDeep(makeCabinet(type), raw);
      cab.type = type;
      cab.id = String(cab.id || 'cab-' + (index + 1));
      if (ids[cab.id]) {
        cab.id = nextCabinetId(merged);
        warnings.push('Duplicate cabinet id replaced with ' + cab.id);
      }
      ids[cab.id] = true;
      cab.tag = String(cab.tag || '').trim();
      if (!cab.tag || tags[cab.tag]) {
        cab.tag = nextTag({ cabinets: merged.cabinets.concat([cab]) }, type);
        warnings.push('Cabinet tag was missing or duplicated; assigned ' + cab.tag);
      }
      tags[cab.tag] = true;
      cab.name = String(cab.name || TYPE_LABELS[type] + ' \u2014 ' + cab.tag);
      ['width', 'height', 'depth'].forEach(function (key) {
        cab[key] = num(cab[key], PRESETS[type][key]);
        if (!(cab[key] > 0)) {
          cab[key] = PRESETS[type][key];
          warnings.push(cab.tag + ': invalid ' + key + ' replaced with standard value');
        }
      });
      cab.width = CS.util.clamp(cab.width, 101.6, 2438.4);
      cab.height = CS.util.clamp(cab.height, 101.6, 2743.2);
      cab.depth = CS.util.clamp(cab.depth, 101.6, 914.4);
      cab.construction.carcassThickness = num(cab.construction.carcassThickness, 18);
      cab.construction.backThickness = num(cab.construction.backThickness, 6);
      cab.faceFrame.thickness = num(cab.faceFrame.thickness, 19);
      cab.interior.adjustableShelves = Math.max(0, Math.round(num(cab.interior.adjustableShelves, 0)));
      cab.interior.fixedShelves = Math.max(0, Math.round(num(cab.interior.fixedShelves, 0)));
      cab.front.reveal = num(cab.front.reveal, 3);
      cab.front.doors.count = cab.front.doors.count === 1 ? 1 : 2;
      cab.front.drawers.count = CS.util.clamp(Math.round(num(cab.front.drawers.count, 3)), 1, 6);
      return cab;
    });
    // Empty projects are valid: the guided flow creates its first cabinet only when the
    // owner finishes the wizard. Legacy callers that need a seeded cabinet use
    // createDefaultProject() explicitly.
    return { project: merged, warnings: warnings };
  }

  /** Structural validation only. Geometry warnings are the engine's job. */
  function validateProjectShape(project) {
    var errors = [];
    if (!isPlainObject(project)) return ['Project is not an object'];
    if (!Array.isArray(project.cabinets)) errors.push('Project cabinets must be an array');
    if (!project.name) errors.push('Project name is required');
    (project.cabinets || []).forEach(function (cab) {
      var tag = cab && cab.tag ? cab.tag : '(no tag)';
      if (!cab || TYPE_LABELS[cab.type] == null) errors.push(tag + ': unknown cabinet type');
      if (!cab || !(num(cab.width, 0) > 0)) errors.push(tag + ': width must be positive');
      if (!cab || !(num(cab.height, 0) > 0)) errors.push(tag + ': height must be positive');
      if (!cab || !(num(cab.depth, 0) > 0)) errors.push(tag + ': depth must be positive');
    });
    return errors;
  }

  function createDefaultProject() {
    var project = emptyProjectTemplate();
    project.name = 'Untitled cabinet project';
    project.settings.date = new Date().toISOString().slice(0, 10);
    addCabinet(project, 'base', { tag: 'B1', name: 'Base \u2014 new cabinet' });
    return project;
  }

  /** Empty project for the guided flow: no cabinets until the first wizard run finishes. */
  function createEmptyProject(name) {
    var project = emptyProjectTemplate();
    project.name = name || 'Untitled cabinet project';
    project.settings.date = new Date().toISOString().slice(0, 10);
    return project;
  }

  /**
   * A complete, varied sample run so a new owner sees the tool's range immediately:
   * sink base with drawer over doors, drawer stack, door base, face-frame inset base,
   * wall cabinets (solid and glass) and a tall pantry.
   */
  function createSampleProject() {
    var project = emptyProjectTemplate();
    project.id = 'prj-sample';
    project.name = 'Sample kitchen run';
    project.client = 'Demo project';
    project.units = 'imperial';
    project.pageSize = 'tabloid';
    project.orientation = 'landscape';
    project.notes = 'Sample project: six cabinets showing frameless and face-frame construction, door and drawer fronts, glass and a tall pantry. Duplicate or edit any cabinet, then export the plan set.';
    project.createdAt = '2026-11-15T12:00:00.000Z';
    project.updatedAt = '2026-11-15T12:00:00.000Z';
    project.settings.shopName = 'Rocket Woodshop';
    project.settings.date = '2026-11-15';
    // Sample run context: 12 ft of wall, 8 ft ceiling, 36 in counters.
    project.space = { wallLength: 4876.8, ceilingHeight: 2438.4, counterHeight: 914.4 };

    var cabinets = [
      makeCabinet('base', {
        id: 'cab-1', tag: 'B1', name: 'Base \u2014 sink cabinet', width: 914.4,
        front: {
          type: 'door-drawer',
          doors: { count: 2, style: 'shaker', material: 'hardwood-maple' },
          drawers: { count: 1, style: 'shaker', material: 'hardwood-maple', slide: 'undermount' },
          combined: { drawerHeight: 203.2, doorsBelow: 2 }
        },
        interior: { adjustableShelves: 0, fixedShelves: 0 },
        finish: { id: 'paint', color: '#eef0e5', sheen: 'satin' }
      }),
      makeCabinet('base', {
        id: 'cab-2', tag: 'B2', name: 'Base \u2014 three drawers', width: 762,
        front: {
          type: 'drawer-stack',
          drawers: { count: 3, style: 'slab', material: 'hardwood-maple', slide: 'undermount', boxJoinery: 'dovetail' }
        },
        interior: { adjustableShelves: 0, fixedShelves: 0 },
        finish: { id: 'paint', color: '#eef0e5', sheen: 'satin' }
      }),
      makeCabinet('base', {
        id: 'cab-3', tag: 'B3', name: 'Base \u2014 doors', width: 609.6,
        front: { type: 'doors', doors: { count: 2, style: 'shaker', material: 'hardwood-maple' } },
        interior: { adjustableShelves: 1, fixedShelves: 0 },
        finish: { id: 'paint', color: '#eef0e5', sheen: 'satin' }
      }),
      makeCabinet('base', {
        id: 'cab-4', tag: 'B4', name: 'Base \u2014 face-frame inset', width: 762,
        construction: { system: 'faceframe', carcassMaterial: 'ply-birch-18', joinery: 'pocket-screw' },
        faceFrame: { material: 'hardwood-poplar', joinery: 'pocket-screw' },
        front: { type: 'doors', doors: { count: 2, style: 'shaker', overlay: 'inset', material: 'hardwood-maple' } },
        interior: { adjustableShelves: 1, fixedShelves: 0 },
        finish: { id: 'paint', color: '#f4f1e9', sheen: 'satin' }
      }),
      makeCabinet('wall', {
        id: 'cab-5', tag: 'W1', name: 'Wall \u2014 doors', width: 762, height: 762, depth: 304.8,
        front: { type: 'doors', doors: { count: 2, style: 'shaker', material: 'hardwood-maple' } },
        interior: { adjustableShelves: 2, fixedShelves: 0 },
        hardware: { hangingRail: true },
        finish: { id: 'paint', color: '#eef0e5', sheen: 'satin' }
      }),
      makeCabinet('wall', {
        id: 'cab-6', tag: 'W2', name: 'Wall \u2014 glass doors', width: 609.6, height: 762, depth: 304.8,
        front: {
          type: 'doors',
          doors: { count: 2, style: 'glass', panelStyle: 'glass', muntins: 1, material: 'hardwood-maple' }
        },
        interior: { adjustableShelves: 3, fixedShelves: 0, shelfMaterial: 'ply-birch-18' },
        hardware: { hangingRail: true },
        finish: { id: 'paint', color: '#eef0e5', sheen: 'satin' }
      }),
      makeCabinet('tall', {
        id: 'cab-7', tag: 'T1', name: 'Tall \u2014 pantry', width: 609.6, height: 2133.6, depth: 609.6,
        front: { type: 'doors', doors: { count: 2, style: 'shaker', material: 'hardwood-maple' } },
        interior: { adjustableShelves: 5, fixedShelves: 1, shelfEdgeband: 'pvc-2' },
        finish: { id: 'paint', color: '#eef0e5', sheen: 'satin' }
      })
    ];
    project.cabinets = cabinets;
    return project;
  }

  function serialize(project) {
    return JSON.stringify(project, null, 2) + '\n';
  }

  function deserialize(json) {
    var errors = [];
    var project;
    try {
      project = JSON.parse(json);
    } catch (e) {
      return { project: null, errors: ['Invalid JSON: ' + e.message] };
    }
    var shape = validateProjectShape(project);
    if (shape.length) errors = shape;
    var normalized = normalizeProject(project);
    errors = errors.concat(normalized.warnings);
    return { project: normalized.project, errors: errors };
  }

  function touch(project) {
    project.updatedAt = nowIso();
    return project;
  }

  CS.core = CS.core || {};
  CS.core.project = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    TYPE_LABELS: TYPE_LABELS,
    TYPE_ORDER: TYPE_ORDER,
    PRESETS: PRESETS,
    STANDARD_WIDTHS: STANDARD_WIDTHS,
    WALL_HEIGHTS: WALL_HEIGHTS,
    TALL_HEIGHTS: TALL_HEIGHTS,
    DEPTHS: DEPTHS,
    SETTINGS_DEFAULTS: SETTINGS_DEFAULTS,
    createDefaultProject: createDefaultProject,
    createEmptyProject: createEmptyProject,
    createSampleProject: createSampleProject,
    makeCabinet: makeCabinet,
    normalizeProject: normalizeProject,
    validateProjectShape: validateProjectShape,
    addCabinet: addCabinet,
    duplicateCabinet: duplicateCabinet,
    removeCabinet: removeCabinet,
    findCabinet: findCabinet,
    nextTag: nextTag,
    nextCabinetId: nextCabinetId,
    ensureUniqueTags: ensureUniqueTags,
    serialize: serialize,
    deserialize: deserialize,
    touch: touch,
    mergeDeep: mergeDeep
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.core.project;
})(typeof globalThis !== 'undefined' ? globalThis : this);
