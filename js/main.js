/* ═══════════════════════════════════════════════════════════════════════════
   Cabinet Studio — boot (js/main.js)

   Runs last: every module defined by contract §2 has been loaded by now.
   Checks that the shell and core APIs are present, shows a clear failure
   panel when something is missing (never a blank page), then boots the UI.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CS = root.CS || (root.CS = {});
  var doc = root.document;
  var bootStarted = false;

  var UI_FILES = {
    app: 'js/ui/app.js',
    inspector: 'js/ui/inspector.js',
    preview: 'js/ui/preview.js',
    tables: 'js/ui/tables.js',
    library: 'js/ui/library.js',
    guided: 'js/ui/guided.js',
    projectIO: 'js/ui/project-io.js'
  };

  function boot() {
    if (bootStarted) return;
    bootStarted = true;
    var bootEl = doc.getElementById('boot');
    var loadErrors = Array.isArray(root.__csLoadErrors) ? root.__csLoadErrors.slice() : [];

    // 1. The shell itself must exist.
    if (!CS.ui || !CS.ui.app || typeof CS.ui.app.init !== 'function') {
      var missingShell = loadErrors.indexOf('js/ui/app.js') >= 0 ? ['js/ui/app.js'] : ['js/ui/app.js'];
      showBareFailure(missingShell, 'The application shell (js/ui/app.js) did not load.');
      return;
    }

    // 2. Every UI module must exist; missing ones are fatal for a usable shell.
    var missing = loadErrors.slice();
    Object.keys(UI_FILES).forEach(function (name) {
      var mod = CS.ui[name];
      if (!mod || typeof mod.init !== 'function') {
        if (missing.indexOf(UI_FILES[name]) < 0) missing.push(UI_FILES[name]);
      }
    });
    // Core module paths that script onerror reported are already in loadErrors.

    // 3. Boot the app. It performs its own boot audit and shows failures itself.
    var ok = false;
    try {
      var audit = CS.ui.app.bootAudit();
      if (!audit.ok) {
        CS.ui.app.showBootFailure(audit.missing.length ? audit.missing : missing);
        auditFailureLog(audit.missing);
        return;
      }
      ok = CS.ui.app.init() === true;
    } catch (err) {
      if (root.console && typeof root.console.error === 'function') {
        root.console.error('[Cabinet Studio] Boot failed', err);
      }
      showBareFailure(loadErrors, 'Cabinet Studio failed while starting: ' + (err && err.message ? err.message : String(err)));
      return;
    }
    if (!ok) return; // app.init rendered its own failure state

    // 4. Hide the boot screen for the first workspace paint. Use rAF for the
    // normal case, plus a short timeout watchdog: headless/software-rendered
    // browsers can defer animation frames by seconds, and the app must not sit
    // behind a loading screen (or block automated readiness checks) when the
    // workspace is in fact already interactive.
    var bootHidden = false;
    var hide = function () {
      if (bootHidden) return;
      bootHidden = true;
      if (bootEl) bootEl.classList.add('is-hidden');
      // Non-fatal missing modules get an honest heads-up (the app degrades).
      warnAboutOptionalModules(loadErrors);
    };
    if (root.requestAnimationFrame) root.requestAnimationFrame(hide);
    setTimeout(hide, 120);
  }

  function warnAboutOptionalModules(loadErrors) {
    if (!loadErrors || !loadErrors.length) return;
    var optional = loadErrors.filter(function (file) {
      return file.indexOf('js/vendor/') === 0 || file.indexOf('js/export/') === 0 ||
        file.indexOf('js/draw/') === 0 || file.indexOf('js/engine/') === 0 || file.indexOf('js/data/') === 0;
    });
    if (!optional.length) return;
    var hasPdf = optional.indexOf('js/vendor/jspdf.umd.min.js') >= 0;
    var hasDwg = optional.indexOf('js/vendor/nasjidwg.bundle.js') >= 0;
    var message = optional.join(', ');
    var detail = [];
    if (hasPdf) detail.push('PDF export is unavailable');
    if (hasDwg) detail.push('DWG export is unavailable');
    if (!detail.length) detail.push('some analysis or export features are unavailable');
    if (CS.ui.app && CS.ui.app.toast) {
      CS.ui.app.toast('These files did not load: ' + message + '. ' + detail.join('; ') + '.', {
        title: 'Some features are unavailable',
        type: 'warning',
        timeout: 9000
      });
    }
  }

  function auditFailureLog(missing) {
    if (missing && missing.length && root.console && typeof root.console.error === 'function') {
      root.console.error('[Cabinet Studio] Required modules are missing:', missing.join(', '));
    }
  }

  /** Failure renderer used only if the shell itself failed to load. */
  function showBareFailure(missing, detail) {
    var bootEl = doc.getElementById('boot');
    var status = doc.getElementById('boot-status');
    var errorBox = doc.getElementById('boot-error');
    if (!bootEl || !errorBox) return;
    bootEl.classList.remove('is-hidden');
    if (status) status.hidden = true;
    errorBox.hidden = false;
    while (errorBox.firstChild) errorBox.removeChild(errorBox.firstChild);
    var h3 = doc.createElement('h3');
    h3.textContent = 'Cabinet Studio could not start';
    errorBox.appendChild(h3);
    if (detail) {
      var p = doc.createElement('p');
      p.textContent = detail;
      errorBox.appendChild(p);
    }
    if (missing && missing.length) {
      var intro = doc.createElement('p');
      intro.textContent = 'These files did not load:';
      errorBox.appendChild(intro);
      var ul = doc.createElement('ul');
      missing.forEach(function (file) {
        var li = doc.createElement('li');
        var code = doc.createElement('code');
        code.textContent = file;
        li.appendChild(code);
        ul.appendChild(li);
      });
      errorBox.appendChild(ul);
    }
    var hint = doc.createElement('p');
    hint.textContent = 'Keep every file and folder from the Cabinet Studio download together, next to index.html, then reload.';
    errorBox.appendChild(hint);
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = 'Reload';
    btn.addEventListener('click', function () {
      try { root.location.reload(); } catch (err) { /* ignore */ }
    });
    errorBox.appendChild(btn);
    auditFailureLog(missing);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
