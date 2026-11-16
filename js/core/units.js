/* Cabinet Studio — units and formatting.
 * Internal geometry is always millimetres. This module is the only place that
 * converts to/from inches and formats dimensions for humans.
 *
 * Classic script (no modules); attaches to CS.units and exports for Node tests.
 */
(function (root) {
  'use strict';
  var CS = root.CS || (root.CS = {});

  var MM_PER_IN = 25.4;
  var MM_PER_FT = 304.8;

  var UNICODE_FRACTIONS = {
    '\u00bd': ' 1/2', '\u00bc': ' 1/4', '\u00be': ' 3/4', '\u215b': ' 1/8',
    '\u215c': ' 3/8', '\u215d': ' 5/8', '\u215e': ' 7/8', '\u2150': ' 1/7',
    '\u2151': ' 1/9', '\u2152': ' 1/10', '\u2153': ' 1/3', '\u2154': ' 2/3',
    '\u2155': ' 1/5', '\u2156': ' 2/5', '\u2157': ' 3/5', '\u2158': ' 4/5',
    '\u2159': ' 1/6', '\u215a': ' 5/6', '\u215b': ' 1/8'
  };

  function toIn(mm) { return mm / MM_PER_IN; }
  function toMm(inches) { return inches * MM_PER_IN; }
  function toFt(mm) { return mm / MM_PER_FT; }

  function round(value, decimals) {
    var p = Math.pow(10, decimals == null ? 0 : decimals);
    return Math.round(value * p) / p;
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a || 1;
  }

  function cleanNumber(value) {
    if (!isFinite(value)) return '0';
    var rounded = Math.round(value * 100) / 100;
    return String(rounded);
  }

  /** Reduce and render a fraction, e.g. (16, 32) -> "1/2". */
  function fractionString(num, den) {
    num = Math.round(num); den = Math.round(den);
    if (!den || !num) return '';
    var g = gcd(num, den);
    return (num / g) + '/' + (den / g);
  }

  /** Nearest fraction of `den` for a positive value, returned as {whole,num,den,value}. */
  function nearestFraction(value, den) {
    den = den || 32;
    var total = Math.round(value * den);
    var whole = Math.floor(total / den);
    var num = total - whole * den;
    var g = gcd(num, den);
    return { whole: whole, num: num ? num / g : 0, den: num ? den / g : 1, value: total / den };
  }

  /**
   * Parse a length entered by a human into millimetres.
   * Accepts: "876", "876 mm", "87.6cm", "0.876 m", "34.5\"", "34 1/2\"",
   * "2' 10 1/2\"", "2 ft 10 in", "34-1/2 in", "2.5'". Bare numbers use
   * `unit` ('imperial' => inches, 'metric' => mm). Returns null when invalid.
   */
  function parse(input, unit) {
    if (typeof input === 'number') {
      if (!isFinite(input)) return null;
      return unit === 'metric' ? input : toMm(input);
    }
    if (input == null) return null;
    var s = String(input).trim();
    if (!s) return null;
    var mode = unit === 'metric' ? 'metric' : 'imperial';

    // Normalise typography and spacing.
    s = s.replace(/[\u2032\u2019\u2018]/g, "'");
    s = s.replace(/[\u2033\u201d\u201c]/g, '"');
    s = s.replace(/[\u00a0,]/g, ' ');
    Object.keys(UNICODE_FRACTIONS).forEach(function (ch) {
      s = s.split(ch).join(UNICODE_FRACTIONS[ch]);
    });
    // "34-1/2" -> "34 1/2"
    s = s.replace(/(\d)-\s*(?=\d+\s*\/)/g, '$1 ');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^\+/, '');
    var negative = /^-/.test(s);
    if (negative) s = s.replace(/^-/, '').trim();

    // Explicit metric units.
    var metric = /^([0-9]*\.?[0-9]+)\s*(mm|cm|m|millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?)$/i.exec(s);
    if (metric) {
      var v = parseFloat(metric[1]);
      if (!isFinite(v)) return null;
      var u = metric[2].toLowerCase();
      var mm = u.indexOf('mm') === 0 || u.indexOf('milli') === 0 ? v
        : u.indexOf('cm') === 0 || u.indexOf('centi') === 0 ? v * 10
          : v * 1000;
      return negative ? -mm : mm;
    }

    // Explicit imperial units / feet-inches notation.
    var hasFeet = /'|ft\b|foot\b|feet\b/i.test(s);
    var hasInch = /"|in\b|inch(?:es)?\b/i.test(s);
    if (hasFeet || hasInch || mode === 'imperial') {
      var feet = 0;
      var feetMatch = /^([0-9]*\.?[0-9]+)\s*(?:'|ft\b|foot\b|feet\b)\s*/i.exec(s);
      if (feetMatch) {
        feet = parseFloat(feetMatch[1]);
        if (!isFinite(feet)) return null;
        s = s.slice(feetMatch[0].length).trim();
      }
      s = s.replace(/(?:"|in\b|inch(?:es)?\b)\s*$/i, '').trim();
      var inches = parseInchPart(s);
      if (inches == null) {
        if (feet || hasFeet) inches = 0;
        else return null;
      }
      var total = feet * 12 + inches;
      return negative ? -toMm(total) : toMm(total);
    }

    // Bare number in metric mode.
    var bare = /^([0-9]*\.?[0-9]+)$/.exec(s);
    if (bare) {
      var n = parseFloat(bare[1]);
      return negative ? -n : n;
    }
    return null;
  }

  /** Parse an inches expression: "10", "10.5", "10 1/2", "1/2", "10-1/2". */
  function parseInchPart(s) {
    s = (s || '').trim();
    if (!s) return 0;
    var wholeFrac = /^([0-9]*\.?[0-9]+)\s+([0-9]+)\s*\/\s*([0-9]+)$/.exec(s);
    if (wholeFrac) {
      var den = parseFloat(wholeFrac[3]);
      if (!den) return null;
      return parseFloat(wholeFrac[1]) + parseFloat(wholeFrac[2]) / den;
    }
    var fracOnly = /^([0-9]+)\s*\/\s*([0-9]+)$/.exec(s);
    if (fracOnly) {
      var d2 = parseFloat(fracOnly[2]);
      if (!d2) return null;
      return parseFloat(fracOnly[1]) / d2;
    }
    var decimal = /^([0-9]*\.?[0-9]+)$/.exec(s);
    if (decimal) return parseFloat(decimal[1]);
    return null;
  }

  /**
   * Format millimetres for humans.
   * opts: { fraction:32, feet:false, plus:false, precision:1, trim:true,
   *         suffix:true, unitLabel:false, unicode:false, sign:false }
   */
  function format(mm, unit, opts) {
    opts = opts || {};
    if (mm == null || !isFinite(mm)) return '\u2014';
    var imperial = unit !== 'metric';
    var negative = mm < 0;
    var abs = Math.abs(mm);
    var out;
    if (imperial) {
      var den = opts.fraction || 32;
      var inches = abs / MM_PER_IN;
      var rounded = Math.round(inches * den) / den;
      var whole = Math.floor(rounded + 1e-9);
      var num = Math.round((rounded - whole) * den);
      var g = gcd(num, den);
      num = num ? num / g : 0;
      var useDen = num ? den / g : den;
      var frac = num ? num + '/' + useDen : '';
      var feet = 0;
      var rem = whole;
      if (opts.feet && whole >= 12) {
        feet = Math.floor(whole / 12);
        rem = whole % 12;
      }
      if (feet > 0) {
        out = feet + "'";
        if (rem || frac) out += ' ' + rem;
        if (frac) out += ' ' + frac;
        out += '"' ;
      } else {
        out = whole > 0 ? String(whole) : (frac ? '' : '0');
        if (whole > 0 && frac) out += ' ';
        out += frac;
        if (opts.suffix !== false) out += '"';
      }
      if (opts.unitLabel) out = out.replace(/"$/, ' in');
      if (!out || out === '"') out = '0"';
      if (opts.plus && !negative && abs > 1e-9) out = '+' + out;
    } else {
      var decimals = opts.precision == null ? 1 : opts.precision;
      var v = round(abs, decimals);
      out = cleanNumber(v);
      if (opts.unitLabel !== false) out += ' mm';
      if (opts.plus && !negative && abs > 1e-9) out = '+' + out;
    }
    if (negative) out = '-' + out;
    return out;
  }

  /** Drawing dimension text: imperial as a 1/32" fraction, metric as whole mm. */
  function formatDim(mm, unit) {
    if (unit === 'metric') return format(mm, 'metric', { precision: 0, unitLabel: false });
    return format(mm, 'imperial', { fraction: 32, suffix: true });
  }

  /** Short length for tables, e.g. 34 1/2" or 876 mm. */
  function formatLengthShort(mm, unit) {
    if (unit === 'metric') return format(mm, 'metric', { precision: 0, unitLabel: false });
    return format(mm, 'imperial', { fraction: 16, suffix: true });
  }

  function formatArea(mm2, unit) {
    if (!isFinite(mm2)) return '\u2014';
    if (unit === 'metric') return (mm2 / 1e6).toFixed(2) + ' m\u00b2';
    return (mm2 / (MM_PER_IN * MM_PER_IN) / 144).toFixed(1) + ' ft\u00b2';
  }

  function formatVolume(mm3, unit) {
    if (!isFinite(mm3)) return '\u2014';
    if (unit === 'metric') return (mm3 / 1e9).toFixed(3) + ' m\u00b3';
    return (mm3 / (MM_PER_IN * MM_PER_IN * MM_PER_IN) / 1728).toFixed(2) + ' ft\u00b3';
  }

  /** "34 1/2 in" (no quote) for prose. */
  function formatInches(mm, den) {
    return format(mm, 'imperial', { fraction: den || 32, suffix: false, unitLabel: false }) + ' in';
  }

  CS.units = {
    MM_PER_IN: MM_PER_IN,
    MM_PER_FT: MM_PER_FT,
    toIn: toIn,
    toMm: toMm,
    toFt: toFt,
    round: round,
    gcd: gcd,
    parse: parse,
    format: format,
    formatDim: formatDim,
    formatLengthShort: formatLengthShort,
    formatArea: formatArea,
    formatVolume: formatVolume,
    formatInches: formatInches,
    fractionString: fractionString,
    nearestFraction: nearestFraction
  };

  // Compatibility alias used by some UI code; the canonical path is CS.units.
  CS.core = CS.core || {};
  CS.core.units = CS.units;

  if (typeof module === 'object' && module.exports) module.exports = CS.units;
})(typeof globalThis !== 'undefined' ? globalThis : this);
