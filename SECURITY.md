# Security

Cabinet Studio is a static, offline HTML app. It has no server, no network calls at runtime and no
telemetry. Projects are kept in the browser (localStorage) or in files you choose to save/open.

## What is checked

- **Dependencies:** jsPDF 4.2.1 (with a clean-room MD5 replacement), nasjidwg, and pako 2.1.0 are
  bundled. jsPDF 4.2.1 includes fixes for CVE-2026-25535 and CVE-2026-31898; no known advisories
  were found for this build at audit time. nasjidwg is a local writer with no network/eval use.
- **Untrusted project files:** imported JSON is size-capped at 25 MB, normalised and rendered as
  escaped text. `__proto__`/`constructor`/`prototype` keys are ignored during normalisation; there
  is no `eval` or dynamic code execution.
- **No remote content:** no external scripts, fonts, images or fetch calls. The only URLs in the
  app are research citations in the data/docs.
- **Release hygiene:** `.qa`, local test artifacts, test tools and local paths are excluded from the
  public release. No secrets or personal data are intentionally bundled; the copyright name is the
  publisher's choice.

## Limitations

- A malicious project file can still exhaust browser memory or crash the page; do not open files
  from untrusted sources.
- Browser, operating system, PDF viewer and CAD viewer security are outside this app's scope.
- Reports are welcome via GitHub's private vulnerability reporting or an issue in the repository.

This app is provided without warranty under GPL-3.0-only (see `LICENSE`).
