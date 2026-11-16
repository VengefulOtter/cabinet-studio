/* Cabinet Studio — assembly-order illustrations.
 *
 * Turns engine AssemblySteps into isometric scenes: the parts introduced in the
 * current step are highlighted and exploded, while the parts already assembled
 * are ghosted in place. Also provides a whole-cabinet exploded scene for the
 * cover/general-arrangement sheet.
 *
 * Classic script; attaches to CS.draw.assembly and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});
  CS.draw = CS.draw || {};

  function orderedSteps(cabinetModel) {
    return ((cabinetModel && cabinetModel.assembly) || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
  }

  function stepPartIds(step) {
    var ids = [];
    if (step && step.partIds) ids = ids.concat(step.partIds);
    if (step && step.illustration && step.illustration.highlightPartIds) ids = ids.concat(step.illustration.highlightPartIds);
    return ids.filter(function (v, i) { return ids.indexOf(v) === i; });
  }

  function cumulativePartIds(cabinetModel, step) {
    var ids = [];
    orderedSteps(cabinetModel).forEach(function (s) {
      if ((s.order || 0) <= (step.order || 0)) ids = ids.concat(stepPartIds(s));
    });
    // unique
    return ids.filter(function (v, i) { return ids.indexOf(v) === i; });
  }

  /** Scene for one assembly step. */
  function stepScene(cabinetModel, step, opts) {
    opts = opts || {};
    var scene;
    var highlight = stepPartIds(step);
    var explode = (step && step.illustration && step.illustration.explodeOffsets) || {};
    if (cabinetModel && cabinetModel.parts && cabinetModel.parts.length) {
      var include = cumulativePartIds(cabinetModel, step);
      if (!include.length) include = (cabinetModel.parts || []).map(function (p) { return p.id; });
      scene = CS.draw.iso.cabinetScene(cabinetModel, {
        includePartIds: include,
        highlightPartIds: highlight,
        explodeOffsets: explode,
        ghost: true,
        labels: !!opts.labels,
        showHardware: false
      });
    } else {
      scene = CS.draw.scene.finalize(CS.draw.scene.scene({ view: 'iso' }));
    }
    var title = 'STEP ' + (step.order || '') + (step.title ? ' \u2014 ' + step.title : '');
    var bounds = scene.bounds || { minY: 0, maxY: 0 };
    CS.draw.scene.add(scene, CS.draw.scene.label([0, bounds.maxY + 40], title, {
      size: 'small', bold: true, align: 'left', baseline: 'bottom'
    }));
    if ((step.illustration && step.illustration.caption) || step.description) {
      CS.draw.scene.add(scene, CS.draw.scene.label([0, bounds.maxY + 20], (step.illustration && step.illustration.caption) || step.description, {
        size: 'tiny', align: 'left', baseline: 'bottom', pen: 'guide'
      }));
    }
    // Balloon callouts for the current step's parts (uses part labels).
    if (opts.balloons !== false && cabinetModel && cabinetModel.parts) {
      var byId = {};
      cabinetModel.parts.forEach(function (p) { byId[p.id] = p; });
      var i = 0;
      highlight.forEach(function (id) {
        var part = byId[id];
        if (!part || !part.box) return;
        var off = explode[id] || [0, 0, 0];
        var b = part.box;
        var projected = CS.draw.iso.project(
          b.x + off[0] + b.w / 2,
          b.y + off[1] + b.d / 2,
          b.z + off[2] + b.h / 2
        );
        var label = part.label || String(++i);
        CS.draw.scene.add(scene, CS.draw.scene.balloon(projected, label, { r: 3.2 }));
      });
    }
    return CS.draw.scene.finalize(scene);
  }

  function groupOffset(part) {
    switch (part.group) {
      case 'Doors': return [0, 320, 0];
      case 'Drawers': return [0, 240, 0];
      case 'Face frame': return [0, 170, 0];
      case 'Back': return [0, -220, 0];
      case 'Shelves': return [0, 0, 300];
      case 'Toe kick': return [0, 0, -180];
      case 'Hardware': return [0, 260, 120];
      default: return [0, 0, 0];
    }
  }

  /** Whole-cabinet exploded view for the general arrangement / cover pages. */
  function explodedScene(cabinetModel, opts) {
    opts = opts || {};
    var offsets = {};
    (cabinetModel.parts || []).forEach(function (p) {
      if (p.group === 'Carcass') return;
      offsets[p.id] = groupOffset(p);
    });
    var scene = CS.draw.iso.cabinetScene(cabinetModel, {
      explodeOffsets: offsets,
      labels: false,
      ghost: false,
      showHardware: false
    });
    var bounds = scene.bounds;
    CS.draw.scene.add(scene, CS.draw.scene.label([0, bounds.maxY + 40], (cabinetModel.config && cabinetModel.config.tag ? cabinetModel.config.tag + ' \u2014 ' : '') + 'EXPLODED VIEW', {
      size: 'small', bold: true
    }));
    if (opts.labels) {
      (cabinetModel.parts || []).forEach(function (p) {
        if (p.group === 'Carcass' || p.group === 'Hardware' || !p.box) return;
        var off = offsets[p.id] || [0, 0, 0];
        var b = p.box;
        var projected = CS.draw.iso.project(b.x + off[0] + b.w / 2, b.y + off[1] + b.d / 2, b.z + off[2] + b.h / 2);
        CS.draw.scene.add(scene, CS.draw.scene.balloon(projected, p.label || '', { r: 3.2 }));
      });
    }
    return CS.draw.scene.finalize(scene);
  }

  CS.draw.assembly = {
    orderedSteps: orderedSteps,
    stepScene: stepScene,
    explodedScene: explodedScene
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.draw.assembly;
})(typeof globalThis !== 'undefined' ? globalThis : this);
