/* Cabinet Studio — small shared helpers.
 * Classic script; attaches to CS.util and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, decimals) {
    var p = Math.pow(10, decimals == null ? 0 : decimals);
    return Math.round(value * p) / p;
  }

  function approx(a, b, tolerance) {
    return Math.abs(a - b) <= (tolerance == null ? 0.5 : tolerance);
  }

  function sum(list, getter) {
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      var v = getter ? getter(list[i], i) : list[i];
      if (isFinite(v)) total += v;
    }
    return total;
  }

  function sortBy(list, getter) {
    return list.slice().sort(function (a, b) {
      var av = getter(a), bv = getter(b);
      if (av === bv) return 0;
      return av < bv ? -1 : 1;
    });
  }

  function deepClone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (e) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  /** Deterministic sequential id: prefix-1, prefix-2, ... given existing ids. */
  function uid(prefix, existingIds) {
    var max = 0;
    var re = new RegExp('^' + String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)$');
    (existingIds || []).forEach(function (id) {
      var m = re.exec(String(id));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return prefix + '-' + (max + 1);
  }

  function uniqueBy(list, getter) {
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      var key = getter(item);
      if (!seen[key]) { seen[key] = true; out.push(item); }
    });
    return out;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slug(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  }

  function formatDate(value, style) {
    var d = value instanceof Date ? value : new Date(value == null ? Date.now() : value);
    if (isNaN(d.getTime())) d = new Date();
    if (style === 'iso') return d.toISOString().slice(0, 10);
    try {
      return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(self, args); }, wait == null ? 120 : wait);
    };
  }

  /** Trigger a browser download for a Blob (file:// safe). */
  function downloadBlob(filename, blob) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      return { ok: false, reason: 'Not running in a browser' };
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { document.body.removeChild(a); } catch (e) { /* ignore */ }
      URL.revokeObjectURL(url);
    }, 4000);
    return { ok: true, url: url };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function nowIso() { return new Date().toISOString(); }

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  CS.util = {
    clamp: clamp,
    round: round,
    approx: approx,
    sum: sum,
    sortBy: sortBy,
    deepClone: deepClone,
    uid: uid,
    uniqueBy: uniqueBy,
    escapeHtml: escapeHtml,
    slug: slug,
    formatDate: formatDate,
    debounce: debounce,
    downloadBlob: downloadBlob,
    pad2: pad2,
    nowIso: nowIso,
    isNumber: isNumber
  };

  if (typeof module === 'object' && module.exports) module.exports = CS.util;
})(typeof globalThis !== 'undefined' ? globalThis : this);
