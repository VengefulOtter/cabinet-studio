# jsPDF vendor patch — MD5 replacement

**Vendored file:** `js/vendor/jspdf.umd.min.js` (jsPDF 4.2.1 UMD)
**Patch date:** 2026-11-16

**Why this version:** 4.2.1 includes the fixes for GHSA-67pg-wm7f-q7fj
(CVE-2026-25535, GIF-dimension denial of service) and GHSA-7x6v-j9x4-qf24
(CVE-2026-31898, PDF annotation object injection). The previous 2.5.2 bundle was replaced.

**Why this patch:** upstream still bundles a small MD5 helper marked “Joseph Myers does not
specify a particular license for his work”. It was imported for jsPDF’s optional PDF encryption
support; its origin is `myersdaily.org/joseph/javascript/md5.js`, and the 2020 jsPDF commit that
added it did not include a licence grant. It cannot be relicensed by the jsPDF MIT licence.

**What changed:** only the MD5 helper was replaced with a clean-room RFC 1321 implementation
written for Cabinet Studio. The replacement returns the same 16-byte binary digest used by jsPDF’s
encryption module. jsPDF itself, its API and its other bundled code are unchanged.

**Licence:** the replacement is MIT, Copyright (c) 2026 VengefulOtter. It is compatible with the
MIT-licensed jsPDF bundle and Cabinet Studio’s GPL-3.0-only licence. Full notices:
`THIRD_PARTY_NOTICES.md`.

**Validation:** `node tests/pdf/run.js` — 12/12 plan sets pass (sample 95 pages); the browser PDF
export was exercised too. Cabinet Studio does not call jsPDF encryption APIs; the patch exists so
the shipped bundle carries neither the unlicensed MD5 code nor the older known-vulnerable jsPDF.
