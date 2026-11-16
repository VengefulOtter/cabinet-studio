# Third-party notices

Cabinet Studio is licensed under **GPL-3.0-only**; see `LICENSE`. This file lists the third-party
code and data shipped in the app. The app itself has no network dependency.

## jsPDF 4.2.1

`js/vendor/jspdf.umd.min.js` is jsPDF 4.2.1. The jsPDF project and yWorks GmbH license it under
the MIT License; the complete text is in `js/vendor/jspdf.LICENSE.txt`.

Copyright (c) 2010–2025 James Hall, https://github.com/MrRio/jsPDF
Copyright (c) 2015–2025 yWorks GmbH, https://www.yworks.com/

The bundle also contains the following permissively licensed pieces. Unless a separate notice is
shown below, the MIT permission text in `js/vendor/jspdf.LICENSE.txt` applies to that piece:

- MIT components: Owen Leong; Steven Spungin (TwelveTone LLC); Aras Abbasi;
  Youssef Beddad; James Robb; Dean McNamee (`omggif`); Dominik Homberger; Antti Palola;
  Eduardo Menezes de Morais; Jussi Utunen; Alex Shensis (Unicode Bidi Engine).
- **FPDF-derived code:** “FPDF is released under a permissive license: there is no usage
  restriction. You may embed it freely in your application (commercial or not), with or without
  modifications.” Reference: http://www.fpdf.org/en/script/script37.php
- **Colour parser:** Stoyan Stefanov, `http://www.phpied.com/rgb-color-parser-in-javascript/`;
  the upstream notice says “Use it if you like it”.
- **GIF/LZW code:** Copyright (c) 2008, Adobe Systems Incorporated. All rights reserved.
  Redistribution and use in source and binary forms, with or without modification, are permitted
  provided that: (1) source redistributions retain this copyright notice, list of conditions and
  disclaimer; (2) binary redistributions reproduce them in the documentation/materials; and
  (3) neither Adobe’s name nor its contributors’ names may be used to endorse or promote derived
  products without prior written permission. THIS SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF
  ANY KIND; ADOBE AND CONTRIBUTORS ARE NOT LIABLE FOR ANY DAMAGES ARISING FROM ITS USE.
- **MD5 replacement:** `js/vendor/jspdf.umd.min.js` originally carried an MD5 helper with no
  specified licence (upstream origin: Joseph Myers, accessed via jsPDF, modified by Owen Leong).
  Cabinet Studio replaced that helper with a clean-room RFC 1321 implementation. The replacement
  is Copyright (c) 2026 VengefulOtter and is MIT-licensed. See `js/vendor/jspdf.PATCH.md`.

### pako 2.1.0

`pako` is bundled inside jsPDF 4.2.1 for compression. It is MIT-licensed:
Copyright (C) 2014–2017 Vitaly Puzrin and Andrei Tuputcyn. The MIT permission text in
`js/vendor/jspdf.LICENSE.txt` applies. pako also contains zlib-licensed code:

Copyright (C) 1995–2024 Jean-loup Gailly and Mark Adler. This software is provided “as-is”,
without any express or implied warranty. In no event will the authors be held liable for any
damages arising from its use. Permission is granted to anyone to use this software for any
purpose, including commercial applications, and to alter it and redistribute it freely, subject
to these restrictions: (1) the origin of this software must not be misrepresented; (2) altered
source versions must be plainly marked as such; (3) this notice may not be removed or altered.

## nasjidwg

`js/vendor/nasjidwg.bundle.js` is MIT-licensed, Copyright (c) 2026 Ahmed Elhagar. The full MIT
text is in `js/vendor/nasjidwg/LICENSE`; the distribution notice, including the Unicode character
mapping data licence, is in `js/vendor/nasjidwg/NOTICE`. The Unicode data is used under the Unicode
License, Copyright (c) 1991–2024 Unicode, Inc. The full text is included in that NOTICE.

DWG and DXF are file formats created by Autodesk, Inc.; AutoCAD and Autodesk are trademarks of
Autodesk, Inc. nasjidwg and Cabinet Studio are not affiliated with, endorsed by, or sponsored by
Autodesk. The nasjidwg NOTICE contains the complete disclaimer.

## Research and documentation

The research reports cite third-party standards, manufacturers and trade publications. The cited
documents are not bundled; the reports contain summary/paraphrase and bibliographic links. Names
such as KCMA, NKBA, DIN, Blum, Hettich, Autodesk, AutoCAD, DWG and DXF are used nominatively and do
not imply endorsement. Standards text and trademarks remain the property of their owners.

## Test-only tools (not shipped)

The repository’s development tests may use Playwright (Apache-2.0), Chromium (BSD-style),
PyMuPDF (AGPL-3.0), LibreDWG (GPL-3.0) and ezdxf (MIT). They are not part of the app, are installed
separately, and no binaries or source from those projects are included in the public app tree.

## AI assistance

Cabinet Studio was developed with AI coding/research assistance. The maintainer selected and
reviewed the design, calculations, code and documentation, and commissioned independent testing.
AI systems can reproduce patterns from training data; no third-party source code is knowingly
included except the libraries listed above. See `README.md` for the short provenance statement.
