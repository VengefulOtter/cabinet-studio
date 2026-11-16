# Cabinet Studio — sheet-goods & solid-wood material planner

**Status:** v1 spec, 2026-11-15. Owner: Lead. Implementers: engine (optimizer/data), ui (Cut list
guidance), pdf (plan-set pages). Research input: `docs/RESEARCH-CUT-PLANNING.md` (concurrent).
**Why:** the app already makes a cut list and a skyline sheet layout with yield/offcut warnings, but
it does not give the owner a *cut plan* (what straight cuts, in what order), a saw-cut count, a
handleable offcut list, or solid-wood purchasing guidance. This spec adds those, so the app can
answer: **“what do I buy, how do I break it down, and where is the waste?”**

---

## 1. Product behaviour

In the **Cut list** tab, above the per-part tables, add a **Material plan** section:

```
MATERIAL PLAN                         Optimize for: [Fewest sheets ▾]
12 sheets · 72.6% yield · 84 saw cuts · 38 bf solid stock
┌ Sheet goods to buy ────────────────┐ ┌ Solid stock to buy ─────────────┐
│ 3/4 plywood  ….  7 sheets           │ │ Hard maple 4/4  22 bf           │
│ 1/2 plywood  ….  1 sheet            │ │ Poplar 4/4       4 bf           │
│ 1/4 plywood  ….  4 sheets           │ └─────────────────────────────────┘
└────────────────────────────────────┘
Reusable offcuts: 14 (1.8 m²) — list/print tags
Notes: panel-saw cut sequence assumes straight cuts; verify grain + measure twice.
```
- **Optimize for:** `Fewest sheets` (default; least material) or `Fewest saw cuts` (less handling;
  may use more sheets). Changing it re-resolves and updates the plan, metrics and PDF. The engine
  also returns the **alternative objective's** sheet/cut/yield numbers so the UI can show a one-line
  trade-off ("fewest cuts: 13 sheets / 61 cuts — +1 sheet, −23 cuts") without a second click. Include
  both the spec keys (`objective`, `sheetCount`, `cutCount`, `yieldPct`, `delta`) and the UI-friendly
  aliases (`label`, `sheets`, `cuts`) in the alternative object.
- Per material, each sheet card/tile gains:
  - sheet number, utilisation, **saw-cut count** (`cutCount`, number of breakdown cuts) and the
    separate edge-trim count;
  - an expandable **cut sequence** (numbered straight cuts: crosscut/rip, size, pieces produced);
  - the reusable offcuts for that sheet.
- The existing cut list, door/drawer schedule, hardware, nesting diagrams and exports stay.
- Honest boundary: the cut plan is a **straight-cut/guillotine plan** suitable for a panel saw or
  table saw with a straight edge; it is a suggestion, not a CNC nesting guarantee. The owner must
  verify grain, blade kerf and sheet condition.

---

## 2. Optimization rules

- Both objectives produce **guillotine-valid** layouts: every part is separated by full straight
  cuts from the remaining stock (ripping/crosscutting), not loosely packed “free” shapes.
- Grain: `grain:'length'` parts keep their length along the sheet’s grain direction; parts with
  `grain:'none'` may rotate. Kerf and edge trim apply exactly as today.
- Candidate generation: the engine may try multiple deterministic orderings/heuristics and choose
  the best candidate for the selected objective:
  - **fewest sheets**: minimise total sheets; tie-break by least wasted area, then fewest cuts.
  - **fewest cuts**: minimise total saw cuts; tie-break by fewer sheets, then less waste.
- No part may overlap, exceed a usable sheet, or be counted twice. Unplaced parts are reported with
  a reason as today.
- Solid stock is **not nested**: board footage is computed from the solid parts and a milling
  allowance, with a purchase recommendation. Glass and shop-supplied items stay non-nested.
- All numbers are deterministic and project-relative; same project → same plan.

---

## 3. Engine output contract

`CS.engine.resolveProject(project)` gains `Resolved.optimization` (existing fields remain):
```js
optimization: {
  objective: 'leastSheets' | 'leastCuts',
  sheetGoods: {
    sheetCount: 12,
    sheetAreaM2: 35.72, usedAreaM2: 25.93, wasteAreaM2: 9.79, yieldPct: 72.6,
    cuts: { total: 88, trim: 4, breakdown: 84, crosscuts: 20, rips: 64 },
    // total = trim + breakdown = trim + crosscuts + rips (all saw cuts); sheet.cutCount = breakdown
    // cuts on that sheet; sheet.trimCuts = 4 when trim > 0. The UI may show "84 breakdown + 4 trim".
    offcuts: {
      count: 14, areaM2: 1.8, reusableCount: 9, reusableAreaM2: 1.2,
      items: [{ materialId, materialName, sheetIndex, x, y, width, height, areaM2, reusable }]
    },
    materials: [{
      materialId, materialName, thickness, sheetCount, yieldPct,
      cuts: { total, trim, breakdown, crosscuts, rips },  // total = trim + breakdown
      offcuts: { count, areaM2, reusableCount },
      sheets: [ /* same shape as sheetLayouts[].sheets, see below */ ]
    }]
  },
  solidStock: {
    partsCount: 57, netBoardFeet: 25.4, dressingPct: 34, allowancePct: 15, purchaseBoardFeet: 40,
    // Board feet use finished part volume: L x W x T / 2,359,737.2 (144 in^3), solid-category parts
    // only; glass/panel/sheet goods are excluded. Purchase BF adds dressing from rough stock
    // (default 34% for 4/4 -> 19 mm) and a defect/cut allowance (default 15%), rounded up per
    // material: ceil(net x (1+dressing%) x (1+allowance%)). Settings can override both.
    materials: [{ materialId, materialName, thickness, parts, netBoardFeet, purchaseBoardFeet }]
  },
  alternative: { objective: 'leastSheets'|'leastCuts', sheetCount, cutCount, yieldPct,
                 delta: { sheets: -1, cuts: -23 } },   // the plan not selected, for comparison
  purchase: {
    sheetGoods: [{ materialId, materialName, thickness, sheets, unit: 'sheet', note }],
    solidStock: [{ materialId, materialName, thickness, boardFeet, unit: 'bf', note }],
    edgebandMetres, notes: []
  }
}
```
**Board feet** (solid parts): net `bf = length_mm × width_mm × thickness_mm / 2,359,737.2` (144 in³).
Board feet are tallied on rough stock at nominal thickness, so the finished volume is not the
purchase quantity. Net board feet sums finished part volumes. Purchase board feet per material =
`ceil(net × (1 + dressingPct/100) × (1 + allowancePct/100))`, where:
- `dressingPct` defaults to **34%** (4/4 rough ≈ 25.4 mm milled to 19 mm finished — research
  `docs/RESEARCH-CUT-PLANNING.md` §6.3); set it to 0 when buying exact 3/4" S2S stock.
- `allowancePct` defaults to **15%** for defects/cut waste; both are exposed in
  `optimization.solidStock` and can be overridden through project settings
  (`solidStockDressingPct`, `solidStockWastePct`).
Label net finished BF vs nominal purchase BF clearly. Do not present net BF as the amount to buy.
The sample baseline at 15% alone would under-buy; the default must include dressing.

`sheetLayouts` gains, per sheet:
```js
sheet = {
  index, placements, usedArea, wastePct,
  cutCount,                       // total straight cuts for this sheet
  cuts: [{
    seq,                          // 1..n execution order
    type: 'trim'|'crosscut'|'rip',
    axis: 'x'|'y',                // direction of the cut line in sheet coordinates
    position: 123.4,              // absolute mm in the untrimmed sheet frame
    length: 1200,                 // length of the cut (mm)
    width: 4,                     // kerf used for the cut, mm
    piece: 'strip 2',             // human label for the parent piece
    from: [123.4, 10],            // absolute start/end of the cut segment (machine-checkable)
    to: [123.4, 1210],
    yields: ['B1-03','B2-05'],    // part labels freed, if any
    note: ''
  }],
  offcuts: [{ x, y, width, height, areaM2, reusable }],
  cutPlan: {                     // compact, optional helper for UI/PDF
    steps: [{ seq, title, detail }],
    totalCuts: 7
  }
}
```
`CutList.totals` gains `cutCount`, `offcutCount`, `solidBoardFeet`, `purchaseSheets` (kept alongside
existing totals). `project.settings.cutOptimization` (`leastSheets` default / `leastCuts`) selects
the objective; `project.settings.solidStockDressingPct` defaults to 34 and
`project.settings.solidStockWastePct` defaults to 15 (existing old projects get these defaults).

**Cut-plan rules (binding for validation):**
- Coordinates are the same frame as `placements`: x right, y up, origin at the **untrimmed sheet
  bottom-left**. The usable region starts at `(trim, trim)` with size
  `(sheet.width - 2*trim) × (sheet.height - 2*trim)`; placements are in this absolute sheet frame
  (the first placement is typically at x=trim, y=trim). `position` is an absolute coordinate in
  this frame. `axis:'x'` is a **vertical cut line** at `x = position` that splits a piece into
  left/right; `axis:'y'` is a **horizontal line** at `y = position` that splits bottom/top.
  `length` is the cut length along the other axis (the parent piece’s span); `kerf` is the saw kerf
  removed by that cut. `piece` is a human label for the parent piece; `yields` lists part labels
  released by this cut if convenient.
- A sequence is a real guillotine breakdown: start with the usable rectangle at `(trim,trim)`, apply
  cuts in `seq` order. Each cut must intersect **exactly one current piece** and must span that
  piece fully; it splits that piece into two along the kerf. `from`/`to` are the machine-readable
  absolute endpoints of the cut segment and must agree with `axis`/`position`/`length`; they
  disambiguate a cut line that would otherwise touch several pieces. If a line hits more than one
  current piece, emit separate cuts (one per piece in the sequence), never a batch cut. After all
  cuts, every placement must be a leaf piece (same width/height, allowing the documented grain
  rotation) and every remaining leaf is an offcut or waste. No overlaps, no duplicates, no placed
  part outside the sheet. This is the invariant QA will reconstruct independently.
- Trim is not part of the guillotine tree: `sheet.cutCount` and `cuts[]` count **breakdown cuts
  only**; `trimCuts` = 4 when trim > 0 (one per edge) is reported separately. At aggregate level,
  `cuts.total = cuts.trim + cuts.breakdown` (all saw cuts), with `cuts.breakdown = cuts.crosscuts +
  cuts.rips`; the UI/PDF may show “N cuts incl. 4 edge trims”.
- Include the cut length for the saw operator. Label pieces/strips with the parts they yield.
- Keep the sequence short and understandable; deterministic ordering. A sheet may have several
  offcuts; list all.
- Offcuts are the leftover leaf rectangles after the sequence. `reusable` is orientation-independent:
  `(width >= offcutMinWidth && height >= offcutMinLength) || (width >= offcutMinLength && height >= offcutMinWidth)`.
  Defaults are `settings.offcutMinWidth = 150`, `offcutMinLength = 300`; engine defaults apply when
  the project does not set them.

**Purchase notes:** exact sheets required by the chosen plan; no hidden spare sheets. The UI/PDF may
suggest keeping a spare sheet for defects but must not add it to the required count. Board feet
recommendation must show net vs purchase/allowance.

---

## 4. UI (Cut list tab)

- Add **Material plan** section after the stat strip, before the per-part cutting list:
  - Objective segmented control/select: **Fewest sheets** / **Fewest saw cuts**, with a one-line
    explanation and live values. Changing it mutates `project.settings.cutOptimization` and
    re-resolves.
  - Summary cards: sheets, yield, total saw cuts, reusable offcuts, solid board feet.
  - Purchase tables (sheet goods, solid stock) with material, thickness, quantity + unit, notes.
  - A short legend/note: panel-saw plan; kerf/trim; offcut reuse; board-foot allowance.
- Per-sheet layout cards:
  - show sheet number, yield/utilization, cut count;
  - an expandable **Cut sequence** list (`1. Crosscut at 600 mm — strip 1 (B1-01, B1-02)` etc.)
    and **Offcuts** (size + reusable flag);
  - keep the visual nesting diagram.
- Cut-list tab must remain usable with 12+ sheets and at 1100px; use collapsible details per sheet.
- If a material is solid stock/glass, show its purchase line and the explanation, not a fake sheet.
- The existing "checks notes" banner should include optimizer warnings (unplaced, low yield, etc.).
- Stable QA hooks: `#material-plan`; objective buttons `[data-cut-objective="leastSheets"|"leastCuts"]`;
  metrics `[data-cut-metric="sheets|yield|cuts|offcuts|boardFeet"]`;
  purchase tables `[data-purchase="sheetGoods"|"solidStock"]`; per-sheet cards
  `[data-sheet-index]` containing `[data-cut-sequence]` and `[data-offcuts]`; notes `#cut-plan-notes`.
- No new tabs; no network/dependencies; file://.

---

## 5. PDF

- **Cut list pages**: add a Material-plan block before/after the material summary:
  - objective used; sheets; yield; saw cuts; offcut count/area; solid board footage and purchase
    allowance; purchase lists; notes.
- **Nesting pages**: for every sheet show:
  - sheet number, material, utilisation, saw-cut count;
  - numbered cut sequence lines (crosscut/rip, size, parts produced);
  - offcut list with reusable flags.
  - Keep the nesting diagram; add a note that dimensions govern, not the diagram.
- Fit long sequences by paginating; never clip. Keep the existing page sizes/orientations and all
  existing sections. PDF text must stay selectable/vector.
- The sheet layout pages are already "not to scale"; cut lengths/dimensions are the authority.

---

## 6. Acceptance criteria

1. Engine emits a guillotine-valid cut plan for every nested sheet; a validator can reconstruct all
   placements from the cut sequence (or equivalent structural check), with no overlaps, no out-of-
   sheet parts, correct trim/kerf.
2. Both objectives work and differ where the trade-off exists: `Fewest sheets` minimises sheets,
   `Fewest saw cuts` minimises cuts; both are deterministic and expose the resulting metrics.
3. Offcuts are listed with dimensions/area/reusable flag; sum of placements + offcuts + trim/kerf
   waste explains the sheet area (within rounding).
4. Solid-stock board feet are computed from solid parts only; glass/shop items are excluded. The
   purchase quantity includes rough dressing (default 34%) and defect allowance (default 15%),
   rounded up per material; net finished BF is never presented as the purchase amount.
5. Cut list UI shows Material plan, objective control, purchase tables, offcut summary, per-sheet
   cut sequence; changing objective updates all values; no console errors; works at 1440 and 1100.
6. PDF plan set includes the material plan and per-sheet cut sequences/offcuts on the cut-list and
   nesting pages; validators confirm pages/text/margins/no clipping; page counts may grow.
7. Guided flow, engine geometry, CAD outputs, PDF other sections and all exports remain regression-
   clean; QA full suite PASS.
8. No new dependencies, no network, file://; documentation/README updated with what the optimizer
   does and its limits.

---

## 7. Out of scope (v1)

- CNC-specific toolpath files; G-code; DXF cut sequencing (CAD remains part outlines).
- Optimizing solid-wood rip layouts across board widths (board-foot purchasing guidance only).
- Real-time drag-and-drop nesting; manual layout editing.
- Material cost/prices (not in the data model); quantities only.
