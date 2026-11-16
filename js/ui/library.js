/* ═══════════════════════════════════════════════════════════════════════════
   Cabinet Studio — Technique library (js/ui/library.js)

   Reads the researched catalogue from CS.data.techniques and presents it as
   browsable cards grouped by option family: summary, pros, cons, best-for,
   tooling, shop notes and the cited sources.

   "Use in <cabinet>" writes the matching option id into the selected cabinet
   (contract §4 paths) and re-resolves through the normal app mutation path.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var doc = root.document;

  var initialized = false;
  var filter = { query: '', groupId: 'all' };

  /** Which cabinet field each catalogue option group writes. */
  var APPLY_MAP = {
    constructionSystem: { path: 'construction.system' },
    carcassJoinery: { path: 'construction.joinery' },
    backStyle: { path: 'construction.backStyle' },
    toeKickStyle: { path: 'toeKick.style' },
    shelfSystem: { path: 'construction.shelfSystem' },
    doorStyle: { path: 'front.doors.style', needs: 'doors' },
    doorJoinery: { path: 'front.doors.doorJoinery', needs: 'doors' },
    doorOverlay: { path: 'front.doors.overlay', needs: 'doors' },
    hingeType: { path: 'front.doors.hingeType', needs: 'doors' },
    drawerFrontStyle: { path: 'front.drawers.style', needs: 'drawers' },
    drawerJoinery: { path: 'front.drawers.boxJoinery', needs: 'drawers' },
    drawerBottom: { path: 'front.drawers.boxBottomJoinery', needs: 'drawers' },
    drawerSlide: { path: 'front.drawers.slide', needs: 'drawers' },
    faceFrameJoinery: { path: 'faceFrame.joinery', needs: 'faceframe' },
    edgeBanding: { path: 'construction.edgeBanding' },
    finish: { path: 'finish.id' }
  };

  function app() { return CS.ui.app; }
  function el(tag, props, children) { return CS.ui.app.el(tag, props, children); }
  function icon(name, cls) { return CS.ui.app.icon(name, cls); }
  function clear(node) { return CS.ui.app.clear(node); }

  function catalogue() {
    return CS.data && CS.data.techniques && typeof CS.data.techniques === 'object' ? CS.data.techniques : null;
  }

  /* ───────────────────────────── Data shaping ───────────────────────────── */

  function libraryGroups() {
    var cat = catalogue();
    if (!cat) return [];
    var groups = Array.isArray(cat.groups) ? cat.groups.slice() : [];
    if (groups.length) return groups;
    // Synthesise groups from the option catalogue if the presentation list is missing.
    var options = cat.options || {};
    return Object.keys(options).map(function (groupId) {
      return {
        id: groupId,
        title: prettify(groupId),
        intro: '',
        optionGroups: [groupId]
      };
    });
  }

  function prettify(id) {
    return String(id || '')
      .replace(/-/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /** Flattened, ordered list of technique entries: one per option. */
  function allEntries() {
    var cat = catalogue();
    if (!cat || !cat.options) return [];
    var entries = [];
    var seen = Object.create(null);
    libraryGroups().forEach(function (group) {
      var optionGroups = Array.isArray(group.optionGroups) ? group.optionGroups : [group.id];
      optionGroups.forEach(function (optionGroup) {
        var options = cat.options[optionGroup];
        if (!Array.isArray(options)) return;
        options.forEach(function (option) {
          if (!option || !option.id) return;
          var key = optionGroup + ':' + option.id;
          if (seen[key]) return;
          seen[key] = true;
          entries.push({
            groupId: optionGroup,
            groupTitle: group.title || prettify(optionGroup),
            libraryGroupId: group.id,
            option: option
          });
        });
      });
    });
    // Any option group not referenced by groups[] is still shown.
    Object.keys(cat.options).forEach(function (optionGroup) {
      var options = cat.options[optionGroup];
      if (!Array.isArray(options)) return;
      options.forEach(function (option) {
        if (!option || !option.id) return;
        var key = optionGroup + ':' + option.id;
        if (seen[key]) return;
        seen[key] = true;
        entries.push({ groupId: optionGroup, groupTitle: prettify(optionGroup), libraryGroupId: 'all', option: option });
      });
    });
    return entries;
  }

  function currentEntries() {
    var entries = allEntries();
    var q = filter.query.trim().toLowerCase();
    return entries.filter(function (entry) {
      if (filter.groupId !== 'all' && entry.libraryGroupId !== filter.groupId) return false;
      if (!q) return true;
      var option = entry.option;
      var haystack = [
        option.name, option.summary, entry.groupTitle,
        (option.pros || []).join(' '),
        (option.cons || []).join(' '),
        (option.bestFor || []).join(' '),
        (option.tooling || []).join(' '),
        option.shopNotes || ''
      ].join(' ').toLowerCase();
      return haystack.indexOf(q) >= 0;
    });
  }

  function sourcesFor(option) {
    var cat = catalogue();
    var sources = (cat && cat.sources) || {};
    return (option && Array.isArray(option.sourceIds) ? option.sourceIds : [])
      .map(function (id) { return sources[id] ? Object.assign({ id: id }, sources[id]) : { id: id, title: id }; });
  }

  /* ───────────────────────────── Apply-to-cabinet ───────────────────────────── */

  function applicability(groupId, cabinet) {
    if (!cabinet) return { ok: false, reason: 'Select a cabinet first.' };
    var map = APPLY_MAP[groupId];
    if (!map) return { ok: false, reason: 'This option is reference material only.' };
    var front = cabinet.front || {};
    var type = front.type || 'doors';
    if (map.needs === 'doors' && !(type === 'doors' || type === 'door-drawer')) {
      return { ok: false, reason: 'The current cabinet has no doors.' };
    }
    if (map.needs === 'drawers' && !(type === 'drawer-stack' || type === 'door-drawer')) {
      return { ok: false, reason: 'The current cabinet has no drawers.' };
    }
    if (map.needs === 'faceframe' && (cabinet.construction || {}).system !== 'faceframe') {
      return { ok: false, reason: 'Only used on face-frame cabinets.' };
    }
    if (groupId === 'toeKickStyle' && cabinet.type === 'wall') {
      return { ok: false, reason: 'Wall cabinets have no toe kick.' };
    }
    return { ok: true, reason: '' };
  }

  function currentValue(cabinet, path) {
    var parts = path.split('.');
    var cursor = cabinet;
    for (var i = 0; i < parts.length; i++) {
      if (cursor === null || cursor === undefined) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  function applyOption(entry, cabinet, button) {
    var option = entry.option;
    var map = APPLY_MAP[entry.groupId];
    var check = applicability(entry.groupId, cabinet);
    if (!check.ok) {
      CS.ui.app.toast(check.reason, { title: 'Not used by this cabinet', type: 'info', timeout: 3000 });
      return;
    }
    var path = map.path;
    var optionId = option.id;
    var cabId = cabinet.id;
    var isStructural = ['constructionSystem', 'backStyle', 'shelfSystem', 'doorStyle', 'doorOverlay', 'drawerFrontStyle', 'toeKickStyle', 'drawerSlide'].indexOf(entry.groupId) >= 0;
    CS.ui.app.mutate(function (project) {
      var target = null;
      for (var i = 0; i < project.cabinets.length; i++) {
        if (project.cabinets[i].id === cabId) { target = project.cabinets[i]; break; }
      }
      if (!target) return false;
      var parts = path.split('.');
      var cursor = target;
      for (var p = 0; p < parts.length - 1; p++) {
        if (!cursor[parts[p]] || typeof cursor[parts[p]] !== 'object') cursor[parts[p]] = {};
        cursor = cursor[parts[p]];
      }
      cursor[parts[parts.length - 1]] = optionId;
      // Paired values that keep the design coherent.
      if (entry.groupId === 'doorStyle') {
        if (!target.front.doors) target.front.doors = {};
        if (optionId === 'glass') target.front.doors.panelStyle = 'glass';
        else if (optionId === 'beadboard') target.front.doors.panelStyle = 'beadboard';
        else if (optionId === 'raised-panel') target.front.doors.panelStyle = 'raised';
        else if (optionId === 'shaker') target.front.doors.panelStyle = 'recessed';
      }
      if (entry.groupId === 'drawerFrontStyle') {
        // no paired field in v1
      }
    }, { source: 'library', cabinetId: cabId, structural: isStructural, reason: 'technique-apply' });

    CS.ui.app.setSaveState('dirty', 'Unsaved');
    CS.ui.app.toast(option.name + ' applied to ' + (cabinet.tag || 'cabinet'), {
      title: 'Technique applied', type: 'success', timeout: 3000
    });
    if (button) {
      button.textContent = 'Applied';
      button.disabled = true;
    }
    // The inspector rebuilds itself from the change event; refresh the card state.
    renderResults();
  }

  /* ───────────────────────────── Render ───────────────────────────── */

  function render() {
    var body = doc.getElementById('library-body');
    if (!body) return;
    var cat = catalogue();
    if (!cat) {
      clear(body);
      body.appendChild(CS.ui.app.moduleNote({
        title: 'The technique library is not loaded yet',
        message: 'The researched technique catalogue lives in js/data/techniques.js. Until it loads, the library tab has nothing to show — the design tools keep working.',
        missing: ['CS.data.techniques'],
        files: ['js/data/techniques.js']
      }));
      return;
    }
    var entries = allEntries();
    if (!entries.length) {
      clear(body);
      body.appendChild(CS.ui.app.emptyState({
        icon: 'library',
        title: 'No techniques catalogued',
        text: 'The catalogue loaded but contains no options yet.'
      }));
      return;
    }
    clear(body);
    var layout = el('div', { className: 'library-layout' });

    // ── Sidebar: search + group filters ──
    var side = el('div', { className: 'library-side' });
    var searchWrap = el('div', { className: 'library-search' });
    searchWrap.appendChild(icon('search'));
    var searchInput = el('input', {
      className: 'input', id: 'library-search',
      attrs: { type: 'search', placeholder: 'Search techniques…', 'aria-label': 'Search the technique library', autocomplete: 'off' }
    });
    searchInput.value = filter.query;
    searchInput.addEventListener('input', function () {
      filter.query = searchInput.value;
      renderResults();
    });
    searchInput.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape') {
        searchInput.value = '';
        filter.query = '';
        renderResults();
      }
    });
    searchWrap.appendChild(searchInput);
    side.appendChild(searchWrap);

    var groupsWrap = el('div', { className: 'library-groups', attrs: { role: 'group', 'aria-label': 'Technique families' } });
    var groups = libraryGroups();
    groupsWrap.appendChild(groupButton('all', 'All techniques', entries.length));
    groups.forEach(function (group) {
      var count = entries.filter(function (entry) { return entry.libraryGroupId === group.id; }).length;
      if (!count) return;
      groupsWrap.appendChild(groupButton(group.id, group.title || prettify(group.id), count));
    });
    side.appendChild(groupsWrap);

    var selectedCab = CS.ui.app.getSelectedCabinet();
    side.appendChild(el('div', { className: 'library-side-note' }, [
      selectedCab
        ? '“Use in cabinet” writes the option into ' + (selectedCab.tag || 'the selected cabinet') + ' and re-resolves it immediately.'
        : 'Select a cabinet in Design to apply a technique to it. You can still read everything here.'
    ]));
    var cited = countSources(entries);
    side.appendChild(el('div', { className: 'library-hint' }, [
      icon('library'),
      el('span', { text: cited + ' cited sources · ' + entries.length + ' techniques' })
    ]));
    layout.appendChild(side);

    // ── Results ──
    var main = el('div', { className: 'library-main' });
    var resultsHead = el('div', { className: 'library-results-head', id: 'library-results-head' });
    main.appendChild(resultsHead);
    main.appendChild(el('div', { className: 'library-results', id: 'library-results' }));
    layout.appendChild(main);
    body.appendChild(layout);
    renderResults();
  }

  function groupButton(id, label, count) {
    return el('button', {
      className: 'library-group-btn' + (filter.groupId === id ? ' is-active' : ''),
      type: 'button',
      attrs: { 'aria-pressed': filter.groupId === id ? 'true' : 'false' },
      dataset: { groupId: id },
      on: {
        click: function () {
          filter.groupId = id;
          var side = doc.querySelectorAll('.library-group-btn');
          Array.prototype.forEach.call(side, function (btn) {
            var active = btn.dataset.groupId === id;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
          renderResults();
        }
      }
    }, [
      el('span', { text: label }),
      el('span', { className: 'count', text: String(count) })
    ]);
  }

  function countSources(entries) {
    var cat = catalogue();
    var sources = (cat && cat.sources) || {};
    return Object.keys(sources).length;
  }

  function renderResults() {
    var results = doc.getElementById('library-results');
    var head = doc.getElementById('library-results-head');
    if (!results) return;
    var entries = currentEntries();
    var cat = catalogue();
    var cabinet = CS.ui.app.getSelectedCabinet();
    var activeGroup = libraryGroups().filter(function (g) { return g.id === filter.groupId; })[0];

    if (head) {
      clear(head);
      head.appendChild(el('div', null, [
        el('div', { className: 'library-results-title', text: filter.groupId === 'all' ? 'All construction techniques' : (activeGroup ? activeGroup.title : prettify(filter.groupId)) }),
        el('div', {
          className: 'library-results-sub',
          text: filter.query ? 'Filtered by “' + filter.query + '” · ' + entries.length + (entries.length === 1 ? ' technique' : ' techniques') : entries.length + (entries.length === 1 ? ' technique' : ' techniques')
        })
      ]));
      if (cabinet) {
        head.appendChild(el('span', { className: 'meta-chip is-olive', text: 'Applying to ' + (cabinet.tag || 'cabinet') }));
      }
    }

    clear(results);
    if (activeGroup && activeGroup.intro && filter.groupId !== 'all') {
      results.appendChild(el('p', { className: 'library-intro', text: activeGroup.intro }));
    } else if (cat && cat.meta && cat.meta.description) {
      results.appendChild(el('p', { className: 'library-intro', text: cat.meta.description }));
    }
    if (!entries.length) {
      results.appendChild(CS.ui.app.emptyState({
        icon: 'search',
        title: 'No techniques match',
        text: 'Try a different word — for example “dovetail”, “inset”, “soft-close” or “plywood”.',
        actions: [el('button', {
          className: 'btn btn-secondary btn-sm', type: 'button', text: 'Clear filters',
          on: { click: function () { filter.query = ''; filter.groupId = 'all'; render(); } }
        })]
      }));
      return;
    }

    var grid = el('div', { className: 'technique-grid' });
    entries.forEach(function (entry) {
      grid.appendChild(buildCard(entry, cabinet));
    });
    results.appendChild(grid);
  }

  function buildCard(entry, cabinet) {
    var option = entry.option;
    var check = applicability(entry.groupId, cabinet);
    var applied = false;
    if (cabinet && check.ok) {
      var map = APPLY_MAP[entry.groupId];
      applied = currentValue(cabinet, map.path) === option.id;
    }
    var card = el('article', { className: 'technique-card' + (applied ? ' is-applied' : '') });
    card.appendChild(el('div', { className: 'technique-head' }, [
      el('h3', { className: 'technique-name', text: option.name || option.id }),
      el('span', { className: 'technique-group-chip', text: entry.groupTitle })
    ]));
    if (option.summary) card.appendChild(el('p', { className: 'technique-summary', text: option.summary }));

    var lists = el('div', { className: 'technique-lists' });
    if (Array.isArray(option.pros) && option.pros.length) {
      lists.appendChild(el('div', null, [
        el('div', { className: 'technique-list-title', text: 'Pros' }),
        el('ul', { className: 'technique-list is-pros' }, option.pros.map(function (p) { return el('li', { text: p }); }))
      ]));
    }
    if (Array.isArray(option.cons) && option.cons.length) {
      lists.appendChild(el('div', null, [
        el('div', { className: 'technique-list-title', text: 'Cons' }),
        el('ul', { className: 'technique-list is-cons' }, option.cons.map(function (c) { return el('li', { text: c }); }))
      ]));
    }
    if (lists.children.length) card.appendChild(lists);

    if (Array.isArray(option.bestFor) && option.bestFor.length) {
      var best = el('div', { className: 'technique-bestfor', attrs: { role: 'group', 'aria-label': 'Best for' } }, [
        el('span', { className: 'chip-group-label', text: 'Best for' })
      ]);
      option.bestFor.forEach(function (b) { best.appendChild(el('span', { className: 'chip', text: b })); });
      card.appendChild(best);
    }

    if (option.shopNotes) {
      card.appendChild(el('div', { className: 'technique-shopnote', text: 'Shop note — ' + option.shopNotes }));
    }

    if (Array.isArray(option.tooling) && option.tooling.length) {
      var tooling = el('div', { className: 'technique-tooling', attrs: { role: 'group', 'aria-label': 'Tooling' } }, [
        el('span', { className: 'chip-group-label', text: 'Tooling' })
      ]);
      option.tooling.forEach(function (tool) { tooling.appendChild(el('span', { className: 'chip', text: tool })); });
      card.appendChild(tooling);
    }

    var sources = sourcesFor(option);
    if (sources.length) {
      var sourceWrap = el('div', { className: 'sources-list', attrs: { 'aria-label': 'Sources' } });
      sources.forEach(function (source) {
        var link = el('a', {
          className: 'technique-source',
          attrs: {
            href: source.url || '#',
            target: source.url ? '_blank' : null,
            rel: source.url ? 'noreferrer noopener' : null,
            title: source.url ? source.url : source.title
          }
        }, [icon('external'), el('span', { text: source.title || source.id })]);
        if (!source.url) link.addEventListener('click', function (evt) { evt.preventDefault(); });
        sourceWrap.appendChild(link);
      });
      card.appendChild(sourceWrap);
    }

    var foot = el('div', { className: 'technique-foot' });
    if (sources.length) {
      foot.appendChild(el('span', { className: 'technique-source', text: sources.length + (sources.length === 1 ? ' source' : ' sources') }));
    }
    var applyWrap = el('div', { className: 'technique-apply' });
    if (applied) {
      applyWrap.appendChild(el('span', { className: 'meta-chip is-olive', text: 'In use' }));
    } else if (!check.ok) {
      applyWrap.appendChild(el('span', { className: 'technique-apply-note', text: check.reason }));
      applyWrap.appendChild(el('button', {
        className: 'btn btn-secondary btn-sm', type: 'button', text: 'Use in ' + (cabinet ? (cabinet.tag || 'cabinet') : 'cabinet'),
        disabled: true, attrs: { title: check.reason, 'aria-label': check.reason }
      }));
    } else {
      var btn = el('button', {
        className: 'btn btn-secondary btn-sm', type: 'button',
        text: 'Use in ' + (cabinet ? (cabinet.tag || 'cabinet') : 'cabinet'),
        on: { click: function () { applyOption(entry, CS.ui.app.getSelectedCabinet(), btn); } }
      });
      applyWrap.appendChild(btn);
    }
    foot.appendChild(applyWrap);
    card.appendChild(foot);
    return card;
  }

  /* ───────────────────────────── Init ───────────────────────────── */

  function init() {
    if (initialized) return;
    initialized = true;
    CS.ui.app.registerTab('library', render);
    CS.ui.app.on('select', function () {
      if (CS.ui.app.state.activeTab === 'library') render();
    });
    CS.ui.app.on('project', function () {
      if (CS.ui.app.state.activeTab === 'library') render();
    });
  }

  CS.ui.library = {
    init: init,
    render: render,
    renderResults: renderResults
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
