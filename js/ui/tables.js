/* ═══════════════════════════════════════════════════════════════════════════
   Cabinet Studio — Tables & assembly (js/ui/tables.js)

   · Cut list tab: grouped cutting tables, totals, sheet-nesting diagrams,
     hardware schedule and the door/drawer schedule.
   · Assembly tab: per-cabinet step timeline with illustrations, part chips,
     tools, glue/fasteners and QC checks.

   Everything comes from CS.engine.resolveProject(); geometry is drawn only
   through CS.draw builders (no re-implementation here).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var doc = root.document;

  var initialized = false;
  var canvasRegistry = [];

  function app() { return CS.ui.app; }
  function el(tag, props, children) { return CS.ui.app.el(tag, props, children); }
  function icon(name, cls) { return CS.ui.app.icon(name, cls); }
  function clear(node) { return CS.ui.app.clear(node); }
  function esc(value) { return CS.ui.app.esc(value); }
  function fmt(mm) { return CS.ui.app.fmt(mm); }
  function fmtShort(mm) { return CS.ui.app.fmtShort(mm); }
  function fmtM2(v) { return CS.ui.app.fmtM2(v); }

  /** Nominal stock sizes: whole inches for imperial, whole mm for metric. */
  function fmtNominal(mm) {
    if (mm === null || mm === undefined || !isFinite(mm)) return '—';
    try {
      if (CS.units && typeof CS.units.format === 'function') {
        return CS.ui.app.unit() === 'metric'
          ? CS.units.format(mm, 'metric', { precision: 0, unitLabel: true })
          : CS.units.format(mm, 'imperial', { fraction: 1 });
      }
    } catch (err) { /* fall through */ }
    return CS.ui.app.fmtShort(mm);
  }
  function fmtPct(v) { return CS.ui.app.fmtPct(v); }
  function state() { return CS.ui.app.state; }

  function htmlNode(html) {
    var tpl = doc.createElement('template');
    tpl.innerHTML = html;
    return tpl.content.firstChild;
  }

  function materialLabel(id) {
    if (CS.ui.inspector && typeof CS.ui.inspector.optionLabel === 'function') {
      return CS.ui.inspector.optionLabel('edgeBanding', id);
    }
    return id || '—';
  }

  function optionLabel(group, id) {
    if (CS.ui.inspector && typeof CS.ui.inspector.optionLabel === 'function') {
      return CS.ui.inspector.optionLabel(group, id);
    }
    return id || '—';
  }

  function catalogMaterialName(id) {
    var cat = CS.data && CS.data.techniques;
    var materials = cat && cat.materials;
    if (Array.isArray(materials)) {
      for (var i = 0; i < materials.length; i++) {
        if (materials[i] && materials[i].id === id) return materials[i].name || materials[i].shortName || id;
      }
    }
    if (CS.ui.inspector && typeof CS.ui.inspector.materialList === 'function') {
      var list = CS.ui.inspector.materialList();
      for (var j = 0; j < list.length; j++) {
        if (list[j].value === id) return list[j].label;
      }
    }
    return id || '—';
  }

  /* ───────────────────────────── Shared: canvas mounting ───────────────────────────── */

  function cleanupCanvases() {
    canvasRegistry.forEach(function (entry) {
      if (entry.io) { try { entry.io.disconnect(); } catch (err) { /* ignore */ } }
      if (entry.ro) { try { entry.ro.disconnect(); } catch (err) { /* ignore */ } }
    });
    canvasRegistry = [];
  }

  /**
   * Mount a lazily-painted canvas into a wrapper. getScene() is called when the
   * canvas scrolls into view (and again on resize).
   */
  function mountCanvas(wrap, getScene, opts) {
    opts = opts || {};
    wrap.classList.add('scene-canvas-wrap');
    var canvas = el('canvas', { attrs: { 'aria-label': opts.label || 'Drawing' } });
    wrap.appendChild(canvas);
    var entry = { wrap: wrap, canvas: canvas, getScene: getScene, io: null, ro: null, drawn: false };
    function draw() {
      if (!entry.getScene) return;
      var scene = null;
      try { scene = entry.getScene(); }
      catch (err) {
        if (root.console && typeof root.console.error === 'function') {
          root.console.error('[Cabinet Studio] Scene build failed', err);
        }
        showCanvasMissing(wrap, 'The drawing could not be built — check the console.');
        return;
      }
      if (!scene || !scene.items || !scene.items.length) {
        showCanvasMissing(wrap, opts.emptyText || 'No drawing for this item.');
        return;
      }
      var padding = opts.padding !== undefined ? opts.padding : 14;
      var ok = false;
      if (CS.draw && CS.draw.canvas && typeof CS.draw.canvas.draw === 'function') {
        try {
          CS.draw.canvas.draw(canvas, scene, {
            padding: padding,
            background: 'rgba(0,0,0,0)',
            emptyText: opts.emptyText || ''
          });
          ok = true;
        } catch (err2) {
          if (root.console && typeof root.console.error === 'function') {
            root.console.error('[Cabinet Studio] Canvas draw failed', err2);
          }
        }
      }
      if (!ok && CS.ui.preview && typeof CS.ui.preview.drawScene === 'function') {
        ok = CS.ui.preview.drawScene(canvas, scene, { padding: padding });
      }
      if (!ok) {
        showCanvasMissing(wrap, 'The drawing module has not loaded.');
        return;
      }
      entry.drawn = true;
    }
    entry.draw = draw;
    canvasRegistry.push(entry);
    if (root.IntersectionObserver) {
      var io = new root.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            draw();
            try { io.disconnect(); } catch (err) { /* ignore */ }
            entry.io = null;
          }
        });
      }, { rootMargin: '120px' });
      io.observe(wrap);
      entry.io = io;
    }
    if (root.ResizeObserver) {
      var ro = new root.ResizeObserver(function () {
        if (entry.drawn) draw();
      });
      ro.observe(wrap);
      entry.ro = ro;
    }
    // If it is already on screen and the observer is slow, paint on the next frame.
    if (!root.IntersectionObserver) draw();
    return entry;
  }

  function showCanvasMissing(wrap, message) {
    if (!wrap) return;
    var existing = wrap.querySelector('.canvas-fallback');
    if (existing) return;
    wrap.appendChild(el('div', { className: 'canvas-fallback', text: message }));
  }

  /* ───────────────────────────── Shared: page heads ───────────────────────────── */

  function pageActions(host, items) {
    clear(host);
    items.forEach(function (item) { if (item) host.appendChild(item); });
  }

  function bannerNode(text, opts) {
    opts = opts || {};
    return el('div', { className: 'banner' + (opts.warn ? ' is-warn' : '') }, [
      icon(opts.icon || (opts.warn ? 'alert' : 'info')),
      el('span', { text: text }),
      opts.action ? el('span', { className: 'banner-actions' }, [opts.action]) : null
    ]);
  }

  function loadingState(title, text) {
    return el('div', { className: 'empty' }, [
      el('div', { className: 'empty-icon' }, el('span', { className: 'spinner' }, icon('spinner'))),
      el('div', { className: 'empty-title', text: title }),
      text ? el('p', { className: 'empty-text', text: text }) : null
    ]);
  }

  /* ───────────────────────────── Cut list ───────────────────────────── */

  function renderCutList() {
    var body = doc.getElementById('cutlist-body');
    var actions = doc.getElementById('cutlist-actions');
    var sub = doc.getElementById('cutlist-sub');
    if (!body) return;
    cleanupCanvases();
    var scrollTop = body.scrollTop;
    clear(body);

    var resolved = state().resolved;
    var engineReady = !!(CS.engine && typeof CS.engine.resolveProject === 'function');
    if (!engineReady) {
      body.appendChild(CS.ui.app.moduleNote({
        title: 'Cut list needs the cabinet engine',
        message: 'The engine turns the cabinet designs into parts, machining and sheet layouts. It has not loaded yet — the design tools keep working.',
        missing: ['CS.engine.resolveProject'],
        files: ['js/engine/index.js']
      }));
      if (sub) sub.textContent = 'Waiting for the cabinet engine.';
      if (actions) pageActions(actions, []);
      return;
    }
    if (state().resolveState === 'error') {
      body.appendChild(CS.ui.app.moduleNote({
        variant: 'error',
        title: 'The engine could not resolve this project',
        message: 'No parts or sheet layouts can be listed until that error is fixed. See the browser console for the engine message.',
        files: []
      }));
      return;
    }
    if (!resolved) {
      body.appendChild(loadingState('Resolving parts and machining…', 'The cut list appears as soon as the engine finishes.'));
      return;
    }
    var project = state().project;
    var cabinets = (project && project.cabinets) || [];
    if (!cabinets.length) {
      body.appendChild(CS.ui.app.emptyState({
        icon: 'cutlist',
        title: 'No cabinets to cut yet',
        text: 'Add a cabinet in Design and its parts will be listed here, grouped by material.',
        actions: [
          el('button', { className: 'btn btn-primary btn-sm', type: 'button', text: 'Go to Design', on: { click: function () { CS.ui.app.switchTab('design'); } } })
        ]
      }));
      return;
    }

    var cut = resolved.cutList || {};
    var groups = Array.isArray(cut.groups) ? cut.groups : [];
    var totals = cut.totals || {};
    var warnings = Array.isArray(resolved.warnings) ? resolved.warnings : [];
    var errCount = warnings.filter(function (w) { return w.severity === 'error'; }).length;
    var warnCount = warnings.filter(function (w) { return w.severity === 'warning'; }).length;

    var partCount = totals.partCount !== undefined ? totals.partCount : (resolved.stats && resolved.stats.partCount);
    var uniqueParts = totals.uniqueParts !== undefined ? totals.uniqueParts : sumRows(groups, 'qty');
    var sheetCount = totals.sheetCount !== undefined ? totals.sheetCount : (resolved.stats && resolved.stats.sheetCount);
    var areaM2 = totals.areaM2 !== undefined ? totals.areaM2 : (resolved.stats && resolved.stats.sheetAreaM2);
    var yieldPct = totals.yieldPct;
    var edgeMetres = totals.edgebandMetres !== undefined ? totals.edgebandMetres : (resolved.stats && resolved.stats.edgebandMetres);
    var hardwareCount = resolved.stats && resolved.stats.hardwareCount !== undefined
      ? resolved.stats.hardwareCount
      : (Array.isArray(resolved.hardware) ? resolved.hardware.reduce(function (n, h) { return n + (Number(h.qty) || 0); }, 0) : null);

    if (sub) {
      sub.textContent = cabinets.length + ' cabinets · ' + (partCount || 0) + ' parts · ' +
        (uniqueParts || 0) + ' unique parts · ' + (sheetCount || 0) + ' sheets';
    }
    if (actions) {
      pageActions(actions, [
        el('button', {
          className: 'btn btn-primary btn-sm', type: 'button',
          on: { click: function () { CS.ui.app.switchTab('plans'); } }
        }, [icon('download'), el('span', { text: 'Export plan set' })])
      ]);
    }

    // Warnings banner — reviewing before cutting is the whole point.
    if (errCount || warnCount) {
      var bits = [];
      if (errCount) bits.push(errCount + (errCount === 1 ? ' error' : ' errors'));
      if (warnCount) bits.push(warnCount + (warnCount === 1 ? ' warning' : ' warnings'));
      body.appendChild(bannerNode(bits.join(' · ') + ' to review before cutting.', {
        warn: true,
        icon: 'alert',
        action: el('button', {
          className: 'btn btn-secondary btn-sm', type: 'button', text: 'Review in Design',
          on: { click: function () { CS.ui.app.switchTab('design'); } }
        })
      }));
    } else {
      var infoCount = warnings.filter(function (w) { return w.severity === 'info'; }).length;
      body.appendChild(bannerNode(
        infoCount
          ? 'Checks pass with ' + infoCount + (infoCount === 1 ? ' note' : ' notes') + ' — worth a look before cutting.'
          : 'Checks pass — dimensions, reveals, slides and shelf spans are within the shop rules.',
        {
          icon: infoCount ? 'info' : 'check',
          action: infoCount ? el('button', {
            className: 'btn btn-secondary btn-sm', type: 'button', text: 'Review notes',
            on: { click: function () { CS.ui.app.switchTab('design'); } }
          }) : null
        }
      ));
    }

    // Stats strip
    body.appendChild(buildStatsStrip({
      cabinets: cabinets.length,
      parts: partCount,
      uniqueParts: uniqueParts,
      sheets: sheetCount,
      areaM2: areaM2,
      yieldPct: yieldPct,
      edgeMetres: edgeMetres,
      hardware: hardwareCount
    }));

    // Material plan (objective control + purchase/offcut guidance).
    body.appendChild(buildMaterialPlanSection(resolved));

    // 1. Cut list grouped by material
    var cutSection = el('section', { className: 'content-section', attrs: { 'aria-labelledby': 'cutlist-heading' } });
    cutSection.appendChild(el('div', { className: 'content-head' }, [
      el('h2', { className: 'content-title', attrs: { id: 'cutlist-heading' } }, [
        icon('cutlist'),
        el('span', { text: 'Cutting list' }),
        el('span', { className: 'count', text: groups.length + (groups.length === 1 ? ' material' : ' materials') })
      ]),
      el('div', { className: 'content-sub', text: 'Dimensions are cut sizes; edgeband edges are called out per part.' })
    ]));
    if (!groups.length) {
      cutSection.appendChild(CS.ui.app.emptyState({ icon: 'cutlist', title: 'No parts resolved', text: 'The engine returned no cut-list groups for this project.' }));
    } else {
      groups.forEach(function (group) {
        cutSection.appendChild(buildCutGroupCard(group));
      });
    }
    body.appendChild(cutSection);

    // 2. Sheet layout
    body.appendChild(buildSheetLayoutSection(resolved));

    // 3. Hardware schedule
    body.appendChild(buildHardwareSection(resolved));

    // 4. Door & drawer schedule
    body.appendChild(buildFrontScheduleSection(resolved));

    body.scrollTop = scrollTop;
  }

  function sumRows(groups, field) {
    var n = 0;
    (groups || []).forEach(function (g) {
      (g.rows || []).forEach(function (row) {
        if (field === 'qty') n += Number(row.qty) || 0;
      });
    });
    return n;
  }

  function buildStatsStrip(s) {
    var strip = el('div', { className: 'stat-strip', attrs: { role: 'group', 'aria-label': 'Project cut-list totals' } });
    function card(label, value, subText, accent) {
      return el('div', { className: 'stat-card' + (accent ? ' is-accent' : '') }, [
        el('div', { className: 'stat-label', text: label }),
        el('div', { className: 'stat-value' }, [el('span', { text: value === null || value === undefined ? '—' : String(value) })]),
        subText ? el('div', { className: 'stat-sub', text: subText }) : null
      ]);
    }
    strip.appendChild(card('Cabinets', s.cabinets, 'in this project'));
    strip.appendChild(card('Parts', s.parts, s.uniqueParts !== null && s.uniqueParts !== undefined ? s.uniqueParts + ' unique' : ''));
    var sheetLabel = 'stock sheets';
    try {
      var project = state().project || {};
      var settings = project.settings || {};
      if (isFinite(settings.sheetWidth) && isFinite(settings.sheetHeight)) {
        sheetLabel = fmtNominal(settings.sheetWidth) + ' × ' + fmtNominal(settings.sheetHeight) + ' stock';
      }
    } catch (err) { /* keep the label */ }
    strip.appendChild(card('Sheets', s.sheets, sheetLabel));
    strip.appendChild(card('Sheet area', fmtM2(s.areaM2), 'total stock used'));
    strip.appendChild(card('Yield', fmtPct(s.yieldPct), 'sheet utilisation', true));
    strip.appendChild(card('Edgeband', s.edgeMetres !== null && s.edgeMetres !== undefined ? (Math.round(s.edgeMetres * 10) / 10) + ' m' : '—', 'banded edges'));
    return strip;
  }

  function buildCutGroupCard(group) {
    var rows = Array.isArray(group.rows) ? group.rows : [];
    var totalQty = rows.reduce(function (n, r) { return n + (Number(r.qty) || 0); }, 0);
    var sheet = group.sheet || {};
    var head = el('div', { className: 'table-card-head' }, [
      el('div', { className: 'table-card-title' }, [
        icon('layers'),
        el('span', { text: group.materialName || catalogMaterialName(group.materialId) })
      ]),
      el('div', { className: 'table-card-meta' }, [
        group.thickness !== undefined ? el('span', { className: 'meta-chip', text: fmt(group.thickness) + ' thick' }) : null,
        (group.sheet && group.sheet.label) ? el('span', { className: 'meta-chip', text: group.sheet.label, attrs: { title: 'Stock sheet for this material' } }) :
          (sheet.width && sheet.height ? el('span', { className: 'meta-chip', text: fmtNominal(sheet.width) + ' × ' + fmtNominal(sheet.height) }) : null),
        el('span', { className: 'meta-chip is-olive', text: totalQty + (totalQty === 1 ? ' part' : ' parts') })
      ])
    ]);
    var cols = ['Part no.', 'Part', 'Qty', 'Length', 'Width', 'Thick', 'Grain', 'Edgeband', 'Notes'];
    var tbody = rows.map(function (row) {
      var labels = Array.isArray(row.labels) ? row.labels : (row.label ? [row.label] : []);
      var shownLabels = labels.slice(0, 8);
      var moreLabels = labels.length - shownLabels.length;
      var labelHtml = labels.length
        ? '<span title="' + esc(labels.join(', ')) + '">' + shownLabels.map(function (l) { return esc(l); }).join(', ') +
          (moreLabels > 0 ? ' <span class="muted-cell">+' + moreLabels + ' more</span>' : '') + '</span>'
        : '—';
      var grain = row.grain === 'length' ? 'Length' : row.grain === 'width' ? 'Width' : '—';
      return '<tr>' +
        '<td class="part-no">' + labelHtml + '</td>' +
        '<td><span class="part-name">' + esc(row.name || row.key || 'Part') + '</span></td>' +
        '<td class="qty">' + esc(row.qty || 1) + '</td>' +
        '<td class="dim">' + esc(fmt(row.length)) + '</td>' +
        '<td class="dim">' + esc(fmt(row.width)) + '</td>' +
        '<td class="dim">' + esc(fmt(row.thickness !== undefined ? row.thickness : group.thickness)) + '</td>' +
        '<td class="grain-cell">' + esc(grain) + '</td>' +
        '<td>' + edgebandCell(row.edgeband) + '</td>' +
        '<td class="muted-cell">' + esc(arrayOrString(row.notes) || row.note || '') + '</td>' +
        '</tr>';
    }).join('');
    var foot = '<tr><td colspan="2">' + rows.length + (rows.length === 1 ? ' row' : ' rows') + ' · ' + totalQty + ' parts</td>' +
      '<td class="qty">' + totalQty + '</td><td colspan="6"></td></tr>';
    var card = el('div', { className: 'table-card' });
    card.appendChild(head);
    var table = htmlNode('<div class="table-scroll"><table class="data"><thead><tr>' +
      cols.map(function (c) {
        var isNum = c === 'Qty' || c === 'Length' || c === 'Width' || c === 'Thick';
        return '<th' + (isNum ? ' class="num"' : '') + '>' + esc(c) + '</th>';
      }).join('') +
      '</tr></thead><tbody>' + (tbody || '<tr><td colspan="9" class="muted-cell">No parts in this group.</td></tr>') +
      '</tbody><tfoot>' + foot + '</tfoot></table></div>');
    card.appendChild(table);
    return card;
  }

  function arrayOrString(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join(' · ');
    return value || '';
  }

  function edgebandCell(edgeband) {
    if (!edgeband) return '<span class="muted-cell">—</span>';
    if (typeof edgeband === 'string') return '<span class="edge-chip is-band">' + esc(edgeband) + '</span>';
    var edges = Array.isArray(edgeband.edges) ? edgeband.edges : [];
    if (!edges.length) return '<span class="muted-cell">—</span>';
    var map = { left: 'L', right: 'R', front: 'F', back: 'B', top: 'T', bottom: 'B' };
    var chips = edges.map(function (e) {
      return '<span class="edge-chip is-band">' + esc(map[String(e).toLowerCase()] || String(e).charAt(0).toUpperCase()) + '</span>';
    }).join('');
    var material = edgeband.materialId ? materialLabel(edgeband.materialId) : '';
    return '<span class="edge-cell">' + chips + '</span><div class="part-note">' + esc(material) + '</div>';
  }

  /* ───────────────────────────── Material plan ───────────────────────────── */

  var CUT_OBJECTIVES = [
    { id: 'leastSheets', label: 'Fewest sheets', short: 'least material' },
    { id: 'leastCuts', label: 'Fewest saw cuts', short: 'less handling' }
  ];

  function currentCutObjective(optimization) {
    var project = state().project || {};
    var settings = project.settings || {};
    if (settings.cutOptimization === 'leastCuts' || settings.cutOptimization === 'leastSheets') return settings.cutOptimization;
    if (optimization && (optimization.objective === 'leastCuts' || optimization.objective === 'leastSheets')) return optimization.objective;
    return 'leastSheets';
  }

  function setCutObjective(objective) {
    if (objective !== 'leastSheets' && objective !== 'leastCuts') return;
    if (currentCutObjective(state().resolved && state().resolved.optimization) === objective) {
      // Re-render so the pressed state is definitely in sync.
      if (CS.ui.tables && CS.ui.tables.renderCutList) CS.ui.tables.renderCutList();
      return;
    }
    CS.ui.app.mutate(function (project) {
      project.settings = project.settings || {};
      project.settings.cutOptimization = objective;
    }, { source: 'cut-optimization', structural: false, reason: 'cut-optimization' });
    // The engine re-resolves asynchronously; the tab re-renders on resolved.
    var node = doc.getElementById('material-plan');
    if (node) node.setAttribute('data-optimizing', 'true');
    if (CS.ui.tables && CS.ui.tables.renderCutList) CS.ui.tables.renderCutList();
  }

  function buildMaterialPlanSection(resolved) {
    var optimization = resolved && resolved.optimization ? resolved.optimization : null;
    var objective = currentCutObjective(optimization);
    var section = el('section', {
      className: 'content-section material-plan',
      attrs: { id: 'material-plan', 'aria-labelledby': 'material-plan-heading' }
    });

    var head = el('div', { className: 'material-plan-head' });
    var titles = el('div', { className: 'material-plan-titles' });
    titles.appendChild(el('h2', { className: 'content-title', attrs: { id: 'material-plan-heading' } }, [
      icon('cutlist'),
      el('span', { text: 'Material plan' }),
      optimization ? el('span', { className: 'count', text: 'what to buy and how to break it down' }) : null
    ]));
    titles.appendChild(el('div', {
      className: 'content-sub',
      text: optimization
        ? 'A straight-cut panel-saw plan. Dimensions govern; the diagram is a suggestion.'
        : 'What to buy and how to break each sheet down, once the cut optimizer is ready.'
    }));
    head.appendChild(titles);

    var control = el('div', { className: 'material-plan-objective', attrs: { role: 'group', 'aria-label': 'Optimize the cut plan for', id: 'material-plan-objective' } });
    control.appendChild(el('span', { className: 'objective-label', text: 'Optimize for' }));
    var segment = el('div', { className: 'objective-segment', attrs: { id: 'material-plan-segment' } });
    CUT_OBJECTIVES.forEach(function (option) {
      var selected = option.id === objective;
      segment.appendChild(el('button', {
        className: 'objective-btn' + (selected ? ' is-selected' : ''),
        type: 'button',
        text: option.label,
        attrs: {
          'data-cut-objective': option.id,
          'aria-pressed': selected ? 'true' : 'false',
          title: option.id === 'leastSheets' ? 'Least material; may need more saw cuts' : 'Less handling; may use more sheet goods'
        },
        on: { click: function () { setCutObjective(option.id); } }
      }));
    });
    control.appendChild(segment);
    head.appendChild(control);
    section.appendChild(head);

    var planBody = el('div', { className: 'material-plan-body', attrs: { id: 'material-plan-body' } });
    section.appendChild(planBody);

    if (!optimization) {
      planBody.appendChild(el('div', { className: 'material-plan-pending', attrs: { role: 'status' } }, [
        icon('info'),
        el('div', { className: 'material-plan-pending-text' }, [
          el('strong', { text: 'Cut plan is being calculated' }),
          el('span', { text: 'The cutting list and sheet layouts below are complete and unchanged. Purchase quantities, saw-cut sequences and offcut guidance appear here when the optimizer reports.' })
        ])
      ]));
      section.appendChild(buildMaterialPlanLegend());
      return section;
    }

    renderMaterialPlanBody(planBody, resolved, optimization, objective);
    return section;
  }

  function buildMaterialPlanLegend() {
    return el('div', { className: 'material-plan-legend' }, [
      icon('info'),
      el('span', { text: 'Panel-saw plan assumes straight cuts with the stated kerf and edge trim. Verify grain direction, sheet tolerance and blade condition before cutting; offcuts shown as reusable are at least the shop threshold. Board feet add a milling allowance for dressing and snipe.' })
    ]);
  }

  function numOr(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function fmtBf(value) {
    var n = numOr(value, 0);
    return (Math.round(n * 10) / 10).toLocaleString('en-CA') + ' bf';
  }

  function fmtSignedInt(value) {
    var n = Math.round(numOr(value, 0));
    if (!n) return '0';
    return (n > 0 ? '+' : '\u2212') + Math.abs(n);
  }

  function purchaseSheetsTotal(purchase) {
    var rows = (purchase && Array.isArray(purchase.sheetGoods)) ? purchase.sheetGoods : [];
    return rows.reduce(function (n, row) { return n + numOr(row.sheets, 0); }, 0);
  }

  function solidBreakdown(solid) {
    var net = numOr(solid && solid.netBoardFeet, 0);
    var purchase = numOr(solid && solid.purchaseBoardFeet, net);
    var allowancePct = numOr(solid && solid.allowancePct, numOr(solid && solid.defectPct, 15));
    var dressingPct = numOr(solid && solid.dressingPct, null);
    var dressingBf = isFinite(Number(solid && solid.dressingBoardFeet)) ? Number(solid.dressingBoardFeet) : null;
    var defectPct = numOr(solid && solid.defectPct, allowancePct);
    var defectBf = isFinite(Number(solid && solid.defectBoardFeet)) ? Number(solid.defectBoardFeet) : null;
    var roundingBf = numOr(solid && solid.roundingBoardFeet, 0);
    // Legacy/partial shape: derive the split so the copy always explains purchase >= net.
    if (dressingBf === null && dressingPct !== null) dressingBf = net * dressingPct / 100;
    if (dressingBf === null) dressingBf = 0;
    if (defectBf === null) defectBf = (net + dressingBf) * defectPct / 100;
    return {
      net: net, purchase: purchase, allowancePct: allowancePct,
      dressingPct: dressingPct, dressingBf: dressingBf,
      defectPct: defectPct, defectBf: defectBf, roundingBf: roundingBf,
      afterDressing: net + dressingBf
    };
  }

  function cutMetricCard(metric, label, value, sub, accent) {
    return el('div', {
      className: 'cut-metric' + (accent ? ' is-accent' : ''),
      attrs: { 'data-cut-metric': metric }
    }, [
      el('div', { className: 'cut-metric-label', text: label }),
      el('div', { className: 'cut-metric-value', text: value }),
      el('div', { className: 'cut-metric-sub', text: sub })
    ]);
  }

  function buildCutMetrics(optimization, resolved) {
    var sg = optimization.sheetGoods || {};
    var solid = optimization.solidStock || {};
    var purchase = optimization.purchase || {};
    var offcuts = sg.offcuts || {};
    var cuts = sg.cuts || {};
    var totals = (resolved.cutList && resolved.cutList.totals) || {};
    var sheetCount = numOr(sg.sheetCount, numOr(totals.sheetCount, 0));
    var yieldPct = numOr(sg.yieldPct, numOr(totals.yieldPct, 0));
    var cutTotal = numOr(cuts.total, numOr(totals.cutCount, 0));
    var trimCuts = numOr(cuts.trim, numOr(totals.trimCutCount, 0));
    var reusable = numOr(offcuts.reusableCount, 0);
    var offcutCount = numOr(offcuts.count, numOr(totals.offcutCount, 0));
    var reusableArea = numOr(offcuts.reusableAreaM2, 0);
    var bf = solidBreakdown(solid);

    var strip = el('div', { className: 'cut-metrics', attrs: { role: 'group', 'aria-label': 'Material plan totals' } });
    strip.appendChild(cutMetricCard('sheets', 'Sheets', String(Math.round(sheetCount)),
      purchaseSheetsTotal(purchase) ? 'exact for this plan' : 'sheet goods required', true));
    strip.appendChild(cutMetricCard('yield', 'Yield', fmtPct(yieldPct),
      fmtM2(numOr(sg.usedAreaM2, 0)) + ' used of ' + fmtM2(numOr(sg.sheetAreaM2, 0))));
    strip.appendChild(cutMetricCard('cuts', 'Saw cuts', String(Math.round(cutTotal)),
      trimCuts ? trimCuts + ' trim cuts included' : 'straight cuts'));
    strip.appendChild(cutMetricCard('offcuts', 'Reusable offcuts', String(Math.round(reusable)),
      offcutCount + ' total · ' + fmtM2(reusableArea) + ' reusable'));
    var bfSub;
    if (bf.net > 0) {
      bfSub = 'net ' + fmtBf(bf.net) + ' \u2192 ' + fmtBf(bf.purchase) + ' to buy (';
      var allowances = [];
      if (bf.dressingPct !== null && bf.dressingPct > 0) allowances.push(bf.dressingPct + '% dressing');
      allowances.push(bf.defectPct + '% defects');
      bfSub += allowances.join(' + ') + ')';
    } else {
      bfSub = 'no solid-wood parts in this project';
    }
    strip.appendChild(cutMetricCard('boardFeet', 'Solid stock', fmtBf(bf.purchase), bfSub));
    return strip;
  }

  function readAlternative(optimization, objective) {
    var other = objective === 'leastSheets' ? 'leastCuts' : 'leastSheets';
    var alt = optimization && optimization.alternative;
    var otherLabel = other === 'leastCuts' ? 'Fewest saw cuts' : 'Fewest sheets';
    var current = optimization && optimization.tradeoff ? optimization.tradeoff[objective] : null;
    var altMetrics = null;
    if (alt && typeof alt === 'object') {
      altMetrics = alt.metrics || alt;
      if (!altMetrics.sheetCount && !altMetrics.sheets) altMetrics = null;
    }
    if (!altMetrics && optimization && optimization.tradeoff) altMetrics = optimization.tradeoff[other];
    if (!altMetrics) return null;
    var sheets = numOr(altMetrics.sheetCount, numOr(altMetrics.sheets, 0));
    var cuts = numOr(altMetrics.totalCuts, numOr(altMetrics.cuts, 0));
    var yieldPct = numOr(altMetrics.yieldPct, null);
    var curSheets = current ? numOr(current.sheetCount, sheets) : sheets;
    var curCuts = current ? numOr(current.totalCuts, cuts) : cuts;
    var delta = (alt && alt.delta && typeof alt.delta === 'object') ? alt.delta : null;
    return {
      objective: (alt && alt.objective) || other,
      label: (alt && (alt.objectiveLabel || alt.label)) || otherLabel,
      sheets: sheets, cuts: cuts, yieldPct: yieldPct,
      deltaSheets: delta && isFinite(Number(delta.sheets)) ? Number(delta.sheets) : sheets - curSheets,
      deltaCuts: delta && isFinite(Number(delta.cuts)) ? Number(delta.cuts) : cuts - curCuts
    };
  }

  function buildCutTradeoff(optimization) {
    var objective = optimization.objective === 'leastCuts' ? 'leastCuts' : 'leastSheets';
    var alt = readAlternative(optimization, objective);
    if (!alt) return null;
    var line = el('div', { className: 'cut-tradeoff', attrs: { id: 'cut-plan-alternative' } });
    line.appendChild(icon('info'));
    if (!alt.deltaSheets && !alt.deltaCuts) {
      line.appendChild(el('span', { className: 'cut-tradeoff-text', text: 'Both objectives give the same plan: ' + alt.sheets + ' sheets \u00b7 ' + alt.cuts + ' saw cuts.' }));
      return line;
    }
    var deltas = [];
    if (alt.deltaSheets) deltas.push(fmtSignedInt(alt.deltaSheets) + (Math.abs(alt.deltaSheets) === 1 ? ' sheet' : ' sheets'));
    if (alt.deltaCuts) deltas.push(fmtSignedInt(alt.deltaCuts) + (Math.abs(alt.deltaCuts) === 1 ? ' saw cut' : ' saw cuts'));
    line.appendChild(el('span', { className: 'cut-tradeoff-text' }, [
      el('span', { text: alt.label + ' alternative: ' + alt.sheets + ' sheets \u00b7 ' + alt.cuts + ' cuts' + (alt.yieldPct !== null ? ' \u00b7 ' + fmtPct(alt.yieldPct) + ' yield' : '') + '  ' }),
      el('span', { className: 'cut-tradeoff-delta', text: '(' + deltas.join(', ') + ')' })
    ]));
    var other = alt.objective;
    line.appendChild(el('button', {
      className: 'btn btn-quiet btn-sm cut-tradeoff-switch', type: 'button',
      text: 'Use this plan', attrs: { 'data-cut-alternative-switch': other, 'aria-label': 'Switch to ' + alt.label },
      on: { click: function () { setCutObjective(other); } }
    }));
    return line;
  }

  function buildPurchaseTables(optimization) {
    var sg = optimization.sheetGoods || {};
    var solid = optimization.solidStock || {};
    var purchase = optimization.purchase || {};
    var wrap = el('div', { className: 'material-plan-split' });

    var sheetRows = Array.isArray(purchase.sheetGoods) ? purchase.sheetGoods.slice() : [];
    if (!sheetRows.length) {
      sheetRows = (Array.isArray(sg.materials) ? sg.materials : []).map(function (m) {
        return { materialId: m.materialId, materialName: m.materialName, thickness: m.thickness, sheets: m.sheetCount, unit: 'sheet' };
      });
    }
    var sheetCard = el('div', { className: 'purchase-card', attrs: { 'data-purchase': 'sheetGoods' } });
    var sheetTotal = sheetRows.reduce(function (n, row) { return n + numOr(row.sheets, 0); }, 0);
    sheetCard.appendChild(el('div', { className: 'purchase-card-head' }, [
      icon('layers'),
      el('span', { className: 'purchase-card-title', text: 'Sheet goods to buy' }),
      el('span', { className: 'meta-chip', text: sheetTotal + (sheetTotal === 1 ? ' sheet' : ' sheets') })
    ]));
    if (sheetRows.length) {
      var rowsHtml = sheetRows.map(function (row) {
        return '<tr><td>' + esc(row.materialName || catalogMaterialName(row.materialId)) + '</td>' +
          '<td class="num">' + (row.thickness !== undefined ? esc(fmt(row.thickness)) : '\u2014') + '</td>' +
          '<td class="num purchase-qty">' + esc(String(Math.round(numOr(row.sheets, 0)))) + ' ' + esc(row.sheets === 1 ? 'sheet' : 'sheets') + '</td>' +
          '<td class="purchase-note">' + esc(row.note || '') + '</td></tr>';
      }).join('');
      sheetCard.appendChild(htmlNode('<div class="table-scroll"><table class="purchase-table"><thead><tr><th>Material</th><th class="num">Thick</th><th class="num">Buy</th><th>Basis</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'));
    } else {
      sheetCard.appendChild(el('div', { className: 'purchase-empty', text: 'No sheet goods in this project.' }));
    }
    if (isFinite(Number(purchase.edgebandMetres))) {
      sheetCard.appendChild(el('div', { className: 'purchase-foot' }, [
        icon('tag'),
        el('span', { text: 'Edgeband: ' + (Math.round(Number(purchase.edgebandMetres) * 10) / 10) + ' m' })
      ]));
    }
    wrap.appendChild(sheetCard);

    var solidRows = Array.isArray(purchase.solidStock) ? purchase.solidStock.slice() : [];
    var solidCard = el('div', { className: 'purchase-card', attrs: { 'data-purchase': 'solidStock' } });
    var bf = solidBreakdown(solid);
    solidCard.appendChild(el('div', { className: 'purchase-card-head' }, [
      icon('shelf'),
      el('span', { className: 'purchase-card-title', text: 'Solid stock to buy' }),
      el('span', { className: 'meta-chip', text: fmtBf(bf.purchase) })
    ]));
    if (solidRows.length) {
      var solidHtml = solidRows.map(function (row) {
        return '<tr><td>' + esc(row.materialName || catalogMaterialName(row.materialId)) + '</td>' +
          '<td class="num">' + (row.thickness !== undefined ? esc(fmt(row.thickness)) : '\u2014') + '</td>' +
          '<td class="num">' + esc(isFinite(Number(row.netBoardFeet)) ? fmtBf(row.netBoardFeet) : '\u2014') + '</td>' +
          '<td class="num purchase-qty">' + esc(fmtBf(Number(row.boardFeet) || Number(row.purchaseBoardFeet) || 0)) + '</td>' +
          '<td class="purchase-note">' + esc(row.note || '') + '</td></tr>';
      }).join('');
      solidCard.appendChild(htmlNode('<div class="table-scroll"><table class="purchase-table"><thead><tr><th>Material</th><th class="num">Thick</th><th class="num">Net</th><th class="num">Buy</th><th>Basis</th></tr></thead><tbody>' + solidHtml + '</tbody></table></div>'));
    } else {
      solidCard.appendChild(el('div', { className: 'purchase-empty', text: 'No solid stock in this project.' }));
    }
    var breakdown = 'Net ' + fmtBf(bf.net);
    if (bf.dressingBf > 0) {
      breakdown += ' \u2192 + dressing ' + (bf.dressingPct !== null ? bf.dressingPct + '%' : '') + ' (' + fmtBf(bf.dressingBf) + ')';
    }
    breakdown += ' \u2192 + ' + bf.defectPct + '% defect (' + fmtBf(bf.defectBf) + ')';
    if (bf.roundingBf > 0.0005) breakdown += ' \u2192 + rounding (' + fmtBf(bf.roundingBf) + ')';
    breakdown += ' \u2192 ' + fmtBf(bf.purchase) + ' to buy';
    solidCard.appendChild(el('div', { className: 'purchase-foot' }, [
      icon('info'),
      el('span', { text: breakdown })
    ]));
    wrap.appendChild(solidCard);
    return wrap;
  }

  function collectOffcuts(optimization, resolved) {
    var sg = optimization.sheetGoods || {};
    var items = sg.offcuts && Array.isArray(sg.offcuts.items) ? sg.offcuts.items.slice() : [];
    if (!items.length) {
      var layouts = Array.isArray(resolved.sheetLayouts) ? resolved.sheetLayouts : [];
      layouts.forEach(function (layout) {
        (layout.sheets || []).forEach(function (sheet) {
          (sheet.offcuts || []).forEach(function (offcut, i) {
            items.push({
              materialId: layout.materialId, materialName: layout.materialName,
              sheetIndex: sheet.index !== undefined ? sheet.index : i + 1,
              width: offcut.width, height: offcut.height, areaM2: offcut.areaM2, reusable: offcut.reusable
            });
          });
        });
      });
    }
    return items;
  }

  function buildOffcutBlock(optimization, resolved) {
    var sg = optimization.sheetGoods || {};
    var offcuts = sg.offcuts || {};
    var items = collectOffcuts(optimization, resolved);
    var count = numOr(offcuts.count, items.length);
    var reusable = numOr(offcuts.reusableCount, items.filter(function (i) { return i.reusable; }).length);
    var reusableArea = numOr(offcuts.reusableAreaM2, items.filter(function (i) { return i.reusable; }).reduce(function (n, i) { return n + numOr(i.areaM2, 0); }, 0));
    var minW = numOr(offcuts.minWidth, 150), minL = numOr(offcuts.minLength, 300);
    var wrap = el('div', { className: 'cut-plan-offcut-wrap' });
    wrap.appendChild(el('div', { className: 'offcut-summary', attrs: { id: 'cut-plan-offcut-summary' } }, [
      icon('tag'),
      el('span', null, [
        el('strong', { text: 'Reusable offcuts: ' + reusable + ' (' + fmtM2(reusableArea) + ')' }),
        el('span', { text: '  ' + count + ' total \u00b7 minimum 150 \u00d7 300 mm \u00b7 not deducted from the purchase' })
      ])
    ]));
    if (items.length) {
      var details = el('details', { className: 'cut-plan-offcuts', attrs: { id: 'cut-plan-offcuts' } });
      details.appendChild(el('summary', null, [
        icon('cutlist'),
        el('span', { text: 'Offcut list' }),
        el('span', { className: 'meta-chip', text: reusable + ' reusable of ' + count })
      ]));
      var rows = items.slice().sort(function (a, b) {
        var ma = a.materialName || a.materialId || '', mb = b.materialName || b.materialId || '';
        if (ma !== mb) return ma < mb ? -1 : 1;
        return (numOr(a.sheetIndex, 0) - numOr(b.sheetIndex, 0)) || (numOr(b.areaM2, 0) - numOr(a.areaM2, 0));
      }).map(function (item) {
        return '<tr><td>' + esc(item.materialName || catalogMaterialName(item.materialId)) + '</td>' +
          '<td class="num">' + esc(String(item.sheetIndex !== undefined ? item.sheetIndex : '\u2014')) + '</td>' +
          '<td class="num">' + esc(fmtShort(item.width)) + ' \u00d7 ' + esc(fmtShort(item.height)) + '</td>' +
          '<td class="num">' + esc(fmtM2(item.areaM2)) + '</td>' +
          '<td>' + (item.reusable ? '<span class="offcut-tag is-reusable">Reusable</span>' : '<span class="offcut-tag is-waste">Waste</span>') + '</td></tr>';
      }).join('');
      details.appendChild(htmlNode('<div class="table-scroll"><table class="offcut-table"><thead><tr><th>Material</th><th class="num">Sheet</th><th class="num">Size</th><th class="num">Area</th><th>Use</th></tr></thead><tbody>' + rows + '</tbody></table></div>'));
      wrap.appendChild(details);
    }
    return wrap;
  }

  function buildCutPlanNotes(optimization) {
    var purchase = optimization.purchase || {};
    var notes = Array.isArray(purchase.notes) ? purchase.notes.slice(0) : [];
    var wrap = el('div', { className: 'cut-plan-notes', attrs: { id: 'cut-plan-notes' } });
    wrap.appendChild(icon('info'));
    var body = el('div', null, [el('strong', { text: 'Cut-plan notes' })]);
    if (notes.length) {
      var ul = el('ul');
      notes.slice(0, 5).forEach(function (note) { ul.appendChild(el('li', { text: String(note) })); });
      body.appendChild(ul);
    } else {
      body.appendChild(el('p', { text: 'Straight-cut plan for a panel saw or table saw. Verify grain, blade kerf and sheet condition before cutting.' }));
    }
    wrap.appendChild(body);
    return wrap;
  }

  function renderMaterialPlanBody(planBody, resolved, optimization, objective) {
    var tradeoff = buildCutTradeoff(optimization);
    if (tradeoff) planBody.appendChild(tradeoff);
    planBody.appendChild(buildCutMetrics(optimization, resolved));
    planBody.appendChild(buildPurchaseTables(optimization));
    planBody.appendChild(buildOffcutBlock(optimization, resolved));
    planBody.appendChild(buildCutPlanNotes(optimization));
  }

  function buildSheetPlanExtras(layout, sheet, index) {
    var cuts = Array.isArray(sheet.cuts) ? sheet.cuts : [];
    var steps = sheet.cutPlan && Array.isArray(sheet.cutPlan.steps) ? sheet.cutPlan.steps : [];
    var offcuts = Array.isArray(sheet.offcuts) ? sheet.offcuts : [];
    var cutCount = sheet.cutCount !== undefined ? sheet.cutCount : (cuts.length || null);
    if (!steps.length && !cuts.length && !offcuts.length && cutCount === null) return null;
    var sheetIndex = sheet.index !== undefined ? sheet.index : index + 1;
    var wrap = el('div', {
      className: 'sheet-plan',
      attrs: {
        'data-sheet-index': String(sheetIndex),
        'data-sheet-material': layout.materialName || layout.materialId || ''
      }
    });

    var seqDetails = el('details', { className: 'sheet-plan-details', attrs: { 'data-cut-sequence': '' } });
    seqDetails.appendChild(el('summary', null, [
      icon('cutlist'),
      el('span', { text: 'Cut sequence' }),
      el('span', { className: 'meta-chip', text: (cutCount !== null ? cutCount : (steps.length || cuts.length)) + ' ' + ((cutCount !== null ? cutCount : (steps.length || cuts.length)) === 1 ? 'cut' : 'cuts') })
    ]));
    if (steps.length) {
      var list = el('ol', { className: 'cut-seq-list' });
      steps.forEach(function (step) {
        var stepText = String(step.title || '') + ' ' + String(step.detail || '');
        var kind = step.kind || step.type || (/cross-?cut/i.test(stepText) ? 'crosscut' : /rip/i.test(stepText) ? 'rip' : /trim/i.test(stepText) ? 'trim' : 'cut');
        list.appendChild(el('li', { className: 'cut-seq-item' }, [
          el('span', { className: 'cut-seq-num', text: String(step.seq !== undefined ? step.seq : '') }),
          el('span', { className: 'cut-seq-kind', text: kind === 'crosscut' ? 'Crosscut' : kind === 'rip' ? 'Rip' : kind === 'trim' ? 'Trim' : 'Cut' }),
          el('span', { className: 'cut-seq-detail' }, [
            el('span', { text: step.title || step.detail || '' }),
            step.detail && step.title ? el('span', { className: 'cut-seq-yields', text: ' \u2014 ' + step.detail }) : null
          ])
        ]));
      });
      seqDetails.appendChild(list);
    } else if (cuts.length) {
      var cutList = el('ol', { className: 'cut-seq-list' });
      cuts.forEach(function (cut) {
        var kind = cut.type === 'trim' ? 'Trim' : cut.type === 'crosscut' ? 'Crosscut' : cut.type === 'rip' ? 'Rip' : 'Cut';
        var yields = Array.isArray(cut.yields) && cut.yields.length ? cut.yields.join(', ') : '';
        cutList.appendChild(el('li', { className: 'cut-seq-item' }, [
          el('span', { className: 'cut-seq-num', text: String(cut.seq !== undefined ? cut.seq : '') }),
          el('span', { className: 'cut-seq-kind', text: kind }),
          el('span', { className: 'cut-seq-detail' }, [
            el('span', { text: 'At ' + fmtShort(cut.position) + ' \u2014 ' + fmtShort(cut.length) + ' long' }),
            yields ? el('span', { className: 'cut-seq-yields', text: ' \u00b7 yields ' + yields }) : null
          ])
        ]));
      });
      seqDetails.appendChild(cutList);
    } else {
      seqDetails.appendChild(el('div', { className: 'cut-seq-empty', text: 'No saw cuts reported for this sheet.' }));
    }
    wrap.appendChild(seqDetails);

    var offcutDetails = el('details', { className: 'sheet-plan-details', attrs: { 'data-offcuts': '' } });
    var reusable = offcuts.filter(function (o) { return o.reusable; }).length;
    offcutDetails.appendChild(el('summary', null, [
      icon('tag'),
      el('span', { text: 'Offcuts' }),
      el('span', { className: 'meta-chip', text: offcuts.length + (offcuts.length === 1 ? ' piece' : ' pieces') + (reusable ? ' \u00b7 ' + reusable + ' reusable' : '') })
    ]));
    if (offcuts.length) {
      var offcutList = el('div', { className: 'sheet-offcuts' });
      offcuts.forEach(function (offcut) {
        offcutList.appendChild(el('div', { className: 'sheet-offcut-row' }, [
          el('span', { className: 'sheet-offcut-dim', text: fmtShort(offcut.width) + ' \u00d7 ' + fmtShort(offcut.height) }),
          el('span', { className: 'muted', text: fmtM2(offcut.areaM2) }),
          offcut.reusable ? el('span', { className: 'offcut-tag is-reusable', text: 'Reusable' }) : el('span', { className: 'offcut-tag is-waste', text: 'Waste' })
        ]));
      });
      offcutDetails.appendChild(offcutList);
    } else {
      offcutDetails.appendChild(el('div', { className: 'offcut-empty', text: 'No offcuts from this sheet.' }));
    }
    wrap.appendChild(offcutDetails);
    return wrap;
  }

  /* ───────────────────────────── Sheet layout ───────────────────────────── */

  function buildSheetLayoutSection(resolved) {
    var section = el('section', { className: 'content-section', attrs: { 'aria-labelledby': 'sheets-heading' } });
    var layouts = Array.isArray(resolved.sheetLayouts) ? resolved.sheetLayouts : [];
    var totalSheets = layouts.reduce(function (n, l) { return n + (Array.isArray(l.sheets) ? l.sheets.length : 0); }, 0);
    section.appendChild(el('div', { className: 'content-head' }, [
      el('h2', { className: 'content-title', attrs: { id: 'sheets-heading' } }, [
        icon('layers'),
        el('span', { text: 'Sheet layout' }),
        el('span', { className: 'count', text: totalSheets + (totalSheets === 1 ? ' sheet' : ' sheets') })
      ]),
      el('div', { className: 'content-sub', text: 'Stock breakdown with grain direction and offcut allowance.' })
    ]));
    if (!layouts.length) {
      section.appendChild(CS.ui.app.emptyState({
        icon: 'layers',
        title: 'No sheet layout',
        text: 'The engine returned no nesting plan. Check the sheet goods settings in Project details, or whether the parts are too large for the stock.'
      }));
      return section;
    }
    layouts.forEach(function (layout) {
      var sheets = Array.isArray(layout.sheets) ? layout.sheets : [];
      var card = el('div', { className: 'table-card' });
      card.style.marginBottom = '12px';
      var sheetSize = layout.sheet || {};
      card.appendChild(el('div', { className: 'table-card-head' }, [
        el('div', { className: 'table-card-title' }, [
          icon('layers'),
          el('span', { text: layout.materialName || catalogMaterialName(layout.materialId) })
        ]),
        el('div', { className: 'table-card-meta' }, [
          (layout.sheet && layout.sheet.label) ? el('span', { className: 'meta-chip', text: layout.sheet.label }) :
            (sheetSize.width ? el('span', { className: 'meta-chip', text: fmtNominal(sheetSize.width) + ' × ' + fmtNominal(sheetSize.height) }) : null),
          layout.kerf !== undefined ? el('span', { className: 'meta-chip', text: 'kerf ' + fmt(layout.kerf) }) : null,
          layout.trim !== undefined ? el('span', { className: 'meta-chip', text: 'trim ' + fmt(layout.trim) }) : null,
          el('span', { className: 'meta-chip is-olive', text: sheets.length + (sheets.length === 1 ? ' sheet' : ' sheets') })
        ])
      ]));
      var grid = el('div', { className: 'sheet-grid', style: { padding: '11px' } });
      sheets.forEach(function (sheet, index) {
        grid.appendChild(buildSheetCard(layout, sheet, index));
      });
      if (!sheets.length) {
        grid.appendChild(el('div', { className: 'muted', style: { padding: '10px' }, text: 'No sheets for this material.' }));
      }
      card.appendChild(grid);
      if (Array.isArray(layout.unplaced) && layout.unplaced.length) {
        var note = el('div', { className: 'unplaced-note', style: { margin: '0 11px 11px' } }, [
          icon('alert'),
          el('span', { text: layout.unplaced.length + (layout.unplaced.length === 1 ? ' part does' : ' parts do') + ' not fit the stock: ' + layout.unplaced.slice(0, 6).map(function (u) { return (u && (u.label || u.name)) || 'part'; }).join(', ') + (layout.unplaced.length > 6 ? '…' : '') })
        ]);
        card.appendChild(note);
      }
      if (Array.isArray(layout.notes) && layout.notes.length) {
        card.appendChild(el('div', { className: 'table-card-foot', style: { padding: '7px 12px', borderTop: '1px solid var(--line-soft)', fontSize: '10.5px', color: 'var(--muted)' }, text: layout.notes.join(' · ') }));
      }
      section.appendChild(card);
    });
    return section;
  }

  function buildSheetCard(layout, sheet, index) {
    var placements = Array.isArray(sheet.placements) ? sheet.placements : [];
    var usedArea = Number(sheet.usedArea) || 0;
    var wastePct = Number(sheet.wastePct);
    var utilPct = Number(sheet.utilization);
    if (isFinite(utilPct)) {
      utilPct = Math.max(0, Math.min(100, utilPct));
      wastePct = 100 - utilPct;
    } else {
      if (!isFinite(wastePct)) {
        var sheetArea = (layout.sheet && layout.sheet.width && layout.sheet.height) ? layout.sheet.width * layout.sheet.height : 0;
        wastePct = sheetArea > 0 ? Math.max(0, 100 - (usedArea / sheetArea) * 100) : null;
      }
      utilPct = wastePct !== null && isFinite(wastePct) ? Math.max(0, Math.min(100, 100 - wastePct)) : null;
    }
    var card = el('div', { className: 'sheet-card' });
    var sheetCutCount = sheet.cutCount !== undefined ? sheet.cutCount : (Array.isArray(sheet.cuts) ? sheet.cuts.length : null);
    card.appendChild(el('div', { className: 'sheet-card-head' }, [
      el('strong', { text: 'Sheet ' + (sheet.index !== undefined ? sheet.index : index + 1) }),
      el('span', { className: 'meta-chip', text: placements.length + ' parts' }),
      sheetCutCount !== null ? el('span', { className: 'meta-chip', text: sheetCutCount + (sheetCutCount === 1 ? ' cut' : ' cuts') }) : null,
      utilPct !== null ? el('span', {
        className: 'meta-chip' + (utilPct < 65 ? ' is-amber' : ' is-olive'),
        text: fmtPct(utilPct) + ' used'
      }) : null
    ]));
    var wrap = el('div', { className: 'sheet-canvas-wrap' });
    card.appendChild(wrap);
    var foot = el('div', { className: 'sheet-card-foot' }, [
      el('span', null, [
        el('span', { className: 'util-bar' + (utilPct !== null && utilPct < 65 ? ' is-low' : '') }, [
          el('span', { style: { width: (utilPct === null ? 0 : Math.max(2, utilPct)) + '%' } })
        ]),
        utilPct !== null ? fmtPct(utilPct) + ' used' : 'utilised'
      ]),
      el('span', { className: 'waste', text: wastePct !== null && isFinite(wastePct) ? fmtPct(wastePct) + ' waste' : '' })
    ]);
    card.appendChild(foot);
    var planExtras = buildSheetPlanExtras(layout, sheet, index);
    if (planExtras) card.appendChild(planExtras);

    mountCanvas(wrap, function () {
      var views = CS.draw && CS.draw.views;
      if (!views) return null;
      try {
        if (typeof views.sheetLayoutScene === 'function') {
          var scene = views.sheetLayoutScene(layout, index, { labels: true });
          if (scene && Array.isArray(scene.items)) {
            var sheetHeight = (layout.sheet && layout.sheet.height) || 0;
            // The builder puts the material + utilisation title above the sheet;
            // the card header already shows both, and at diagram scale they
            // overlap. Keep the part labels inside the sheet.
            scene.items = scene.items.filter(function (item) {
              if (!item || item.t !== 'label') return true;
              return !(item.p && item.p[1] > sheetHeight + 1);
            });
            if (CS.draw.scene && typeof CS.draw.scene.finalize === 'function') CS.draw.scene.finalize(scene);
          }
          return scene;
        }
        if (typeof views.sheetLayout === 'function') {
          return views.sheetLayout(layout, sheet, { labels: true, dimensions: false });
        }
      } catch (err) {
        if (root.console) root.console.error('[Cabinet Studio] sheet layout scene failed', err);
      }
      return null;
    }, { label: 'Sheet ' + (sheet.index !== undefined ? sheet.index : index + 1) + ' layout', padding: 12, emptyText: 'Sheet layout builder has not loaded.' });
    return card;
  }

  /* ───────────────────────────── Hardware ───────────────────────────── */

  function buildHardwareSection(resolved) {
    var section = el('section', { className: 'content-section', attrs: { 'aria-labelledby': 'hardware-heading' } });
    var hardware = Array.isArray(resolved.hardware) ? resolved.hardware : [];
    section.appendChild(el('div', { className: 'content-head' }, [
      el('h2', { className: 'content-title', attrs: { id: 'hardware-heading' } }, [
        icon('wrench'),
        el('span', { text: 'Hardware schedule' }),
        el('span', { className: 'count', text: hardware.length + (hardware.length === 1 ? ' item' : ' items') })
      ]),
      el('div', { className: 'content-sub', text: 'Aggregated across the whole project.' })
    ]));
    if (!hardware.length) {
      section.appendChild(CS.ui.app.emptyState({ icon: 'wrench', title: 'No hardware scheduled', text: 'The engine returned no hardware for these cabinets.' }));
      return section;
    }
    var rows = hardware.map(function (h) {
      var tags = Array.isArray(h.cabinets) ? h.cabinets.join(', ') : Array.isArray(h.cabinetTags) ? h.cabinetTags.join(', ') : (h.cabinetTag || '');
      return '<tr>' +
        '<td><span class="part-name">' + esc(h.name || h.id || 'Hardware') + '</span>' +
        (h.notes ? '<div class="part-note">' + esc(h.notes) + '</div>' : '') + '</td>' +
        '<td class="muted-cell">' + esc(h.category || '—') + '</td>' +
        '<td class="qty">' + esc(h.qty !== undefined ? h.qty : '—') + '</td>' +
        '<td class="muted-cell">' + esc(h.unit || 'ea') + '</td>' +
        '<td class="muted-cell">' + esc(tags) + '</td>' +
        '<td class="muted-cell">' + esc(h.install || '') + '</td>' +
        '</tr>';
    }).join('');
    var card = el('div', { className: 'table-card' });
    card.appendChild(htmlNode('<div class="table-scroll"><table class="data"><thead><tr>' +
      '<th>Item</th><th>Category</th><th class="num">Qty</th><th>Unit</th><th>Cabinets</th><th>Install</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>'));
    section.appendChild(card);
    return section;
  }

  /* ───────────────────────────── Front schedule ───────────────────────────── */

  /** Human name for a pull spec (id / object) using the technique catalogue. */
  function pullLabel(pull) {
    if (!pull) return '';
    var id = typeof pull === 'object' ? (pull.id || '') : String(pull);
    if (!id) return '';
    var cat = CS.data && CS.data.techniques;
    var templates = cat && cat.hardware;
    var name = '';
    if (Array.isArray(templates)) {
      for (var i = 0; i < templates.length; i++) {
        if (templates[i] && templates[i].id === id) { name = templates[i].name || ''; break; }
      }
    }
    if (!name) name = id === 'pull-bar-128' ? 'Bar pull, 128 mm' : id === 'pull-knob-32' ? 'Knob, 32 mm' : id;
    if (typeof pull === 'object' && pull.finish) name += ' · ' + pull.finish;
    return name;
  }

  function buildFrontScheduleSection(resolved) {
    var section = el('section', { className: 'content-section', attrs: { 'aria-labelledby': 'fronts-heading' } });
    var fronts = Array.isArray(resolved.frontSchedule) ? resolved.frontSchedule : [];
    section.appendChild(el('div', { className: 'content-head' }, [
      el('h2', { className: 'content-title', attrs: { id: 'fronts-heading' } }, [
        icon('door'),
        el('span', { text: 'Door & drawer schedule' }),
        el('span', { className: 'count', text: fronts.length + (fronts.length === 1 ? ' front' : ' fronts') })
      ]),
      el('div', { className: 'content-sub', text: 'Final cut sizes for fronts, hinges and pull positions.' })
    ]));
    if (!fronts.length) {
      section.appendChild(CS.ui.app.emptyState({ icon: 'door', title: 'No fronts', text: 'All cabinets are open, or the engine has not produced a front schedule yet.' }));
      return section;
    }
    var rows = fronts.map(function (f) {
      var kind = f.kind === 'door' ? 'Door' : f.kind === 'drawer-front' ? 'Drawer front' : (f.kind || 'Front');
      var overlay = f.overlay === true || f.overlay === 'full' ? 'Full overlay'
        : f.overlay === false || f.overlay === 'inset' ? 'Inset'
          : f.overlay ? optionLabel('doorOverlay', f.overlay) : '';
      var style = f.style ? optionLabel(f.kind === 'drawer-front' ? 'drawerFrontStyle' : 'doorStyle', f.style) : '';
      var hinge = f.kind === 'door' ? (f.hingeSide || '—') : '—';
      var hingeCount = f.hingeCount !== undefined && f.hingeCount !== null ? f.hingeCount : '—';
      var pull = pullLabel(f.pull);
      return '<tr>' +
        '<td class="part-no">' + esc(f.label || '—') + '</td>' +
        '<td class="part-no">' + esc(f.cabinetTag || '—') + '</td>' +
        '<td>' + esc(kind) + '</td>' +
        '<td class="dim">' + esc(fmt(f.width)) + ' × ' + esc(fmt(f.height)) + '</td>' +
        '<td class="dim">' + esc(f.thickness !== undefined ? fmt(f.thickness) : '—') + '</td>' +
        '<td>' + esc([style, overlay].filter(Boolean).join(' · ') || '—') + '</td>' +
        '<td class="muted-cell">' + esc(catalogMaterialName(f.materialId)) + '</td>' +
        '<td class="muted-cell">' + esc(hinge) + ' / ' + esc(hingeCount) + '</td>' +
        '<td class="muted-cell">' + esc(pull) + '</td>' +
        '<td class="muted-cell">' + esc(f.note || '') + '</td>' +
        '</tr>';
    }).join('');
    var card = el('div', { className: 'table-card' });
    card.appendChild(htmlNode('<div class="table-scroll"><table class="data"><thead><tr>' +
      '<th>Label</th><th>Cab.</th><th>Kind</th><th>Size</th><th>Thick</th><th>Style</th><th>Material</th><th>Hinge</th><th>Pull</th><th>Notes</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>'));
    section.appendChild(card);
    return section;
  }

  /* ───────────────────────────── Assembly ───────────────────────────── */

  function renderAssembly() {
    var body = doc.getElementById('assembly-body');
    var actions = doc.getElementById('assembly-actions');
    var sub = doc.getElementById('assembly-sub');
    if (!body) return;
    cleanupCanvases();
    var scrollTop = body.scrollTop;
    clear(body);
    if (sub) sub.textContent = 'Follow the build order step by step — parts, tools, glue and QC checks.';
    if (actions) clear(actions);

    var engineReady = !!(CS.engine && typeof CS.engine.resolveProject === 'function');
    if (!engineReady) {
      body.appendChild(CS.ui.app.moduleNote({
        title: 'Assembly steps need the cabinet engine',
        message: 'The engine produces the build sequence. It has not loaded yet — design and project editing still work.',
        missing: ['CS.engine.resolveProject'],
        files: ['js/engine/index.js']
      }));
      return;
    }
    var resolved = state().resolved;
    if (state().resolveState === 'error') {
      body.appendChild(CS.ui.app.moduleNote({
        variant: 'error',
        title: 'The engine could not resolve this project',
        message: 'Assembly steps cannot be generated until the engine error is fixed.',
        files: []
      }));
      return;
    }
    if (!resolved) {
      body.appendChild(loadingState('Working out the build order…', 'Steps, tools and QC checks appear as soon as the engine resolves.'));
      return;
    }
    var cabinets = state().project && state().project.cabinets ? state().project.cabinets : [];
    if (!cabinets.length) {
      body.appendChild(CS.ui.app.emptyState({
        icon: 'assembly',
        title: 'No cabinets to assemble',
        text: 'Add a cabinet in Design and its step-by-step sequence will appear here.',
        actions: [el('button', { className: 'btn btn-primary btn-sm', type: 'button', text: 'Go to Design', on: { click: function () { CS.ui.app.switchTab('design'); } } })]
      }));
      return;
    }
    var models = Array.isArray(resolved.cabinets) ? resolved.cabinets : [];
    var selectedId = state().selectedCabinetId;
    var model = null;
    for (var i = 0; i < models.length; i++) {
      var cfg = models[i] && models[i].config ? models[i].config : models[i];
      if (cfg && cfg.id === selectedId) { model = models[i]; break; }
    }
    if (!model) model = models[0];
    if (!model) {
      body.appendChild(CS.ui.app.emptyState({ icon: 'assembly', title: 'No assembly data', text: 'The engine did not return a model for the selected cabinet.' }));
      return;
    }
    var modelConfig = model.config || {};
    var steps = Array.isArray(model.assembly) ? model.assembly : [];
    var modelWarnings = Array.isArray(model.warnings) ? model.warnings : [];
    var errCount = modelWarnings.filter(function (w) { return w.severity === 'error'; }).length;
    var warnCount = modelWarnings.length - errCount;
    if (sub) {
      sub.textContent = (modelConfig.tag || 'Cabinet') + ' · ' + (modelConfig.name || '') + ' · ' +
        steps.length + ' steps' + (warnCount || errCount ? ' · ' + modelWarnings.length + ' checks to review' : '');
    }
    if (actions) {
      pageActions(actions, [
        el('span', { className: 'meta-chip is-olive', text: steps.length + ' steps' }),
        errCount || warnCount ? el('span', { className: 'meta-chip is-amber', text: (errCount || warnCount) + ' to review' }) : null,
        el('button', {
          className: 'btn btn-secondary btn-sm', type: 'button',
          on: { click: function () { CS.ui.app.switchTab('plans'); } }
        }, [icon('pdf'), el('span', { text: 'Export step pages' })])
      ]);
    }

    var layout = el('div', { className: 'assembly-layout' });
    layout.appendChild(buildAssemblyRail(models, modelConfig.id));
    layout.appendChild(buildAssemblyTimeline(model, steps));
    body.appendChild(layout);
    body.scrollTop = scrollTop;
  }

  function buildAssemblyRail(models, selectedId) {
    var rail = el('aside', { className: 'assembly-rail', attrs: { 'aria-label': 'Choose a cabinet to assemble' } });
    rail.appendChild(el('div', { className: 'assembly-rail-head', text: 'Cabinets' }));
    if (!models.length) {
      rail.appendChild(el('div', { className: 'muted', style: { padding: '12px' }, text: 'No resolved cabinets.' }));
      return rail;
    }
    models.forEach(function (model) {
      var cfg = model.config || {};
      var warnings = Array.isArray(model.warnings) ? model.warnings : [];
      var errors = warnings.filter(function (w) { return w.severity === 'error'; }).length;
      var warningsOnly = warnings.length - errors;
      var steps = Array.isArray(model.assembly) ? model.assembly.length : 0;
      var btn = el('button', {
        className: 'assembly-cabinet-btn' + (cfg.id === selectedId ? ' is-selected' : ''),
        type: 'button',
        attrs: { 'aria-pressed': cfg.id === selectedId ? 'true' : 'false' },
        on: {
          click: function () {
            CS.ui.app.selectCabinet(cfg.id);
          }
        }
      }, [
        el('span', { className: 'cabinet-type', text: (cfg.type || 'base').charAt(0).toUpperCase() }),
        el('span', { className: 'grow' }, [
          el('span', { className: 'name', text: (cfg.tag || '') + ' · ' + (cfg.name || 'Cabinet') }),
          el('span', { className: 'steps', text: steps + ' steps · ' + (model.parts ? model.parts.length : 0) + ' parts' })
        ]),
        el('span', {
          className: 'warn-dot ' + (errors ? 'is-error' : warningsOnly ? '' : 'is-none'),
          title: errors ? errors + ' errors' : warningsOnly ? warningsOnly + ' warnings' : 'No warnings'
        })
      ]);
      rail.appendChild(btn);
    });
    return rail;
  }

  function buildAssemblyTimeline(model, steps) {
    var timeline = el('div', { className: 'timeline', attrs: { 'aria-label': 'Assembly steps' } });
    if (!steps.length) {
      timeline.appendChild(CS.ui.app.emptyState({
        icon: 'assembly',
        title: 'No assembly steps yet',
        text: 'The engine returned no step sequence for this cabinet. This can happen while the assembly module is still under construction.'
      }));
      return timeline;
    }
    var partsById = Object.create(null);
    (Array.isArray(model.parts) ? model.parts : []).forEach(function (part) {
      if (part && part.id) partsById[part.id] = part;
    });
    var hardwareById = Object.create(null);
    (Array.isArray(model.hardware) ? model.hardware : []).forEach(function (hw) {
      if (hw && hw.id) hardwareById[hw.id] = hw;
    });

    steps.forEach(function (step, index) {
      timeline.appendChild(buildStepCard(model, step, index, steps.length, partsById, hardwareById));
    });
    return timeline;
  }

  function buildStepCard(model, step, index, total, partsById, hardwareById) {
    var marker = el('div', { className: 'step-marker', text: String(step.order !== undefined ? step.order : index + 1) });
    var card = el('div', { className: 'step-card' + (index === 0 ? ' is-first' : '') + (index === total - 1 ? ' is-last' : '') });
    card.appendChild(marker);
    var bodyEl = el('div', { className: 'step-body' });
    var head = el('div', { className: 'step-head' }, [
      el('h3', { className: 'step-title', text: step.title || ('Step ' + (index + 1)) }),
      el('div', { className: 'step-badges' }, [
        el('span', { className: 'meta-chip', text: 'Step ' + (step.order !== undefined ? step.order : index + 1) + ' / ' + total })
      ])
    ]);
    bodyEl.appendChild(head);
    if (step.description) bodyEl.appendChild(el('p', { className: 'step-desc', text: step.description }));

    var content = el('div', { className: 'step-content' });
    var illustration = el('div', { className: 'step-illustration' });
    var caption = step.illustration && step.illustration.caption ? step.illustration.caption : (step.illustration && step.illustration.mode ? step.illustration.mode : '');
    if (caption) illustration.appendChild(el('div', { className: 'step-caption', text: caption }));
    content.appendChild(illustration);
    mountCanvas(illustration, function () {
      var draw = CS.draw && CS.draw.assembly;
      if (!draw || typeof draw.stepScene !== 'function') return null;
      try {
        return draw.stepScene(model, step, { labels: true, dimensions: false });
      } catch (err) {
        if (root.console) root.console.error('[Cabinet Studio] stepScene failed', err);
        return null;
      }
    }, { label: (step.title || 'Assembly step') + ' illustration', padding: 12, emptyText: 'Step illustration builder has not loaded.' });

    var details = el('div', { className: 'step-details' });
    var partIds = Array.isArray(step.partIds) ? step.partIds : [];
    if (partIds.length) {
      var partChips = el('div', { className: 'chip-group', attrs: { role: 'group', 'aria-label': 'Parts used in this step' } }, [
        el('span', { className: 'chip-group-label', text: 'Parts' })
      ]);
      var shownParts = partIds.slice(0, 10);
      shownParts.forEach(function (id) {
        var part = partsById[id];
        var chip = el('span', { className: 'chip' });
        chip.appendChild(el('span', { className: 'part-label', text: id }));
        chip.appendChild(el('span', { text: part && part.name ? part.name : 'Part' }));
        partChips.appendChild(chip);
      });
      if (partIds.length > shownParts.length) {
        partChips.appendChild(el('span', {
          className: 'chip is-quiet',
          text: '+' + (partIds.length - shownParts.length) + ' more on the cut list',
          attrs: { title: partIds.slice(shownParts.length).join(', ') }
        }));
      }
      details.appendChild(partChips);
    }
    var hardwareIds = Array.isArray(step.hardwareIds) ? step.hardwareIds : [];
    if (hardwareIds.length) {
      var hwChips = el('div', { className: 'chip-group', attrs: { role: 'group', 'aria-label': 'Hardware used in this step' } }, [
        el('span', { className: 'chip-group-label', text: 'Hardware' })
      ]);
      hardwareIds.forEach(function (id) {
        var hw = hardwareById[id];
        hwChips.appendChild(el('span', { className: 'chip is-hardware', text: hw && hw.name ? hw.name : String(id) }));
      });
      details.appendChild(hwChips);
    }
    var tools = Array.isArray(step.tools) ? step.tools : [];
    if (tools.length) {
      var toolChips = el('div', { className: 'chip-group', attrs: { role: 'group', 'aria-label': 'Tools' } }, [
        el('span', { className: 'chip-group-label', text: 'Tools' })
      ]);
      tools.forEach(function (tool) {
        toolChips.appendChild(el('span', { className: 'chip is-tool', text: typeof tool === 'string' ? tool : (tool && (tool.name || tool.id)) || 'Tool' }));
      });
      details.appendChild(toolChips);
    }
    var meta = el('dl', { className: 'step-meta-list' });
    if (step.glue) meta.appendChild(el('div', null, [el('dt', { text: 'Glue' }), el('dd', { text: step.glue })]));
    var fasteners = Array.isArray(step.fasteners) ? step.fasteners : [];
    if (fasteners.length) {
      meta.appendChild(el('div', null, [
        el('dt', { text: 'Fasteners' }),
        el('dd', { text: fasteners.map(function (f) { return typeof f === 'string' ? f : (f && (f.name || f.id)) || ''; }).filter(Boolean).join(', ') })
      ]));
    }
    if (meta.children.length) details.appendChild(meta);

    var qc = Array.isArray(step.qc) ? step.qc : [];
    if (qc.length) {
      var qcLabel = el('div', { className: 'chip-group' }, [el('span', { className: 'chip-group-label', text: 'QC checks' })]);
      var qcList = el('ul', { className: 'step-qc' });
      qc.forEach(function (item) {
        qcList.appendChild(el('li', null, [icon('check'), el('span', { text: typeof item === 'string' ? item : (item && (item.text || item.title)) || '' })]));
      });
      details.appendChild(el('div', null, [qcLabel, qcList]));
    }
    var notes = Array.isArray(step.notes) ? step.notes : (step.notes ? [step.notes] : []);
    notes.filter(Boolean).forEach(function (note) {
      details.appendChild(el('div', { className: 'step-note', text: typeof note === 'string' ? note : (note && note.text) || '' }));
    });
    if (!details.children.length) {
      details.appendChild(el('div', { className: 'step-note', text: 'No extra tools or QC notes for this step.' }));
    }
    content.appendChild(details);
    bodyEl.appendChild(content);
    card.appendChild(bodyEl);
    return card;
  }

  /* ───────────────────────────── Init ───────────────────────────── */

  function init() {
    if (initialized) return;
    initialized = true;
    CS.ui.app.registerTab('cutlist', renderCutList);
    CS.ui.app.registerTab('assembly', renderAssembly);
  }

  CS.ui.tables = {
    init: init,
    renderCutList: renderCutList,
    renderAssembly: renderAssembly,
    cleanupCanvases: cleanupCanvases
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
