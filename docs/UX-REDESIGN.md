# Cabinet Studio — slim guided redesign spec

**Status:** v1 — 2026-11-15. Owner: Lead. Implementer: `ui`. Research input: `docs/RESEARCH-UI-FLOW.md` and `js/data/presets.js` (researcher, concurrent).
**Why:** the engine and plan set are deep, but the Design tab currently puts a cabinet rail, a dense inspector and a preview on screen at once. A first-time owner must parse ~60 controls before making one decision. This spec turns Design into a guided, one-question-at-a-time flow, with the full editor available behind an explicit "Advanced editor" door.

---

## 1. Design principles

1. **One decision per screen.** A wizard step asks one question, with big visual choices. Sub-details are secondary and collapsed.
2. **Defaults do the work.** Every step opens with a recommended answer from the selected standard preset (North American or European). The user can accept and continue in one click.
3. **Context before cabinet.** First capture the run: wall length, ceiling height, counter height. Every later step uses that context (remaining run, suggested width/height).
4. **Depth on demand.** The old inspector is not deleted; it is one click away as **Advanced editor**. Nothing is lost, but nothing is in the face either.
5. **Always preview.** A live front/isometric preview and a one-line summary update as choices change, so the user never has to imagine the result.
6. **Run-aware.** Cabinets are added to a run with remaining wall length, so the user sees progress toward a finished kitchen, not a pile of objects.
7. **Plain shop language.** "Doors or drawers?", "How wide is the space?", "Built like a North American face-frame cabinet" — not field names or codes.
8. **No fake or forced steps.** Optional steps can be skipped; every step can go Back; closing the wizard discards the draft with a confirmation, never half-adds a cabinet.

---

## 2. Information architecture

### Top-level tabs (keep the existing five)
`Design · Cut list · Assembly · Plans & export · Technique library`

The other four tabs are unchanged in function; they may inherit the slimmer page header. Only Design is reworked.

### Header (slim)
- Left: brand, project name + "N cabinets" (project menu trigger).
- Right: save state · units toggle (two small buttons, as now) · **Export** primary · project menu.
- File actions (New, Open, Save JSON, Sample) live in the project menu, not as four header icons.
- Remove any duplicate status text that the Design view already explains.

### Design tab — two modes

#### Mode A — Run overview (default)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ Kitchen run                                   Wall 12' 0" · ceiling 8' 0"  │
│                                               counter 36"     [Edit space]  │
│                                                                            │
│  [ B1 36" ][ B2 30" ][ B3 24" ][ B4 30" ][ ···· remaining 3' 6" ···· ]      │
│                                                                            │
│  ┌ Add the next cabinet ─────────────────────┐  ┌ Selected: B2 ───────────┐ │
│  │  [ + Design a cabinet ]  [Advanced editor]│  │ Base · 30" · 3 drawers  │ │
│  └───────────────────────────────────────────┘  │ [Edit] [Duplicate] [×]  │ │
│                                                 └─────────────────────────┘ │
│  Checks (3) · last export · quick links                                     │
└────────────────────────────────────────────────────────────────────────────┘
```
- Run strip is proportional to the **run footprint**: base/tall/pantry widths plus 3 mm gaps. Wall cabinets sit above the base run and do **not** add to the horizontal footprint; if a project has only wall cabinets, use their widths. Remaining segment is dashed with `wallLength − Σ(footprint widths + 3 mm gaps)`.
- Big primary **Design a cabinet** opens the wizard.
- Secondary **Advanced editor** shows the old 3-pane design view (rail + preview + inspector) and a "Back to guided" button.
- Cabinet cards/rows are compact; Edit opens wizard in **edit mode**; Duplicate/Delete as now.
- Empty project: hero card "Start your first cabinet" with the same primary CTA and a space summary; optionally auto-open the wizard on a fresh project.
- If `project.space` is missing (old projects), show "Set up your space" CTA instead of fake dimensions.

#### Mode B — Guided wizard (full Design area)
Desktop layout:
```
┌ step rail ─┐ ┌ question panel ───────────────────────────┐ ┌ live preview ─────┐
│ 1 Space ✓  │ │ STEP 3 OF 7                                │ │  [front / iso]    │
│ 2 Standard │ │ What kind of cabinet?                      │ │   line drawing    │
│ 3 Box      │ │ Pick the box you want to build next.       │ │                   │
│ 4 Size     │ │                                            │ │  BASE · 30" W     │
│ 5 Fronts   │ │ [ Base ] [ Wall ] [ Tall ] [ Pantry ]      │ │  34½" H · 24" D   │
│ 6 Inside   │ │ card  card  card  card                     │ │  face frame       │
│ 7 Review   │ │                                            │ │  shaker · full    │
│            │ │ [Why?]                                     │ │                   │
│            │ │                              [Back] [Next] │ │  12 parts · 2 sheets│
└────────────┘ └────────────────────────────────────────────┘ └───────────────────┘
```
- Step rail: numbered, current highlighted, completed with check; clicking a completed step goes back. On <1050 px it collapses to a compact "Step 3 of 7 · Box" + progress bar.
- Question panel: eyebrow `STEP n OF 7`, one H1 question, one helper sentence, then choice cards. Optional "Why this?" expands a short explanation and source note.
- Choice cards: illustration/line drawing, name, one-line description, optional "Recommended" badge; selected state clear; keyboard: Tab/Enter/Space; one choice required for required steps.
- Footer: **Back**, optional **Skip** (only optional steps), **Continue**; keyboard Enter continues when a choice is selected; Esc closes wizard (confirm discard if draft changed).
- Preview panel: live front elevation by default, toggle Front/Iso; one-line spec summary; small "Open full preview" optional. Preview uses the existing draw/views modules on a **draft cabinet model** resolved through `CS.engine.resolveCabinet`, never mutating the project.
- "Advanced editor" link in the wizard footer/ellipsis: closes wizard after confirm and opens the old editor for the draft (or the existing cabinet in edit mode).

---

## 3. Wizard steps (9 total)

Step numbering shown to the user is 1–9. **9 steps total**: Space → Standard → Box → Size → **Build** → **Layout** → **Front style** → Inside & finish → Review. Build is a real construction decision (carcass joint, sheet-goods panel/thickness, back, toe kick, face-frame joint) and sits after Size because the cabinet type must be known before toe-kick/face choices and thickness is construction, not envelope. Layout and front style stay separate so the fronts screen does not become a long scroll. Research for the Build choices: `docs/BUILD-METHODS.md` and `docs/RESEARCH-techniques.md`.

### Step 1 — Space
**Question:** "What are you filling?"
**Helper:** "Measure the wall you want to fill, then we'll fit cabinets to it."
Fields:
- Project name (new project only; default "Kitchen project").
- Units: Imperial / Metric segmented control. Changing it updates all later values and the project unit setting.
- Wall length: primary field, presets `8'`, `10'`, `12'`, `14'` (or metric equivalents). Placeholder `10' 0"`.
- Ceiling height: default `8' 0"` (2440 mm).
- Counter height: default `36"` (914 mm) for base/tall context; can be marked "skip" for wall-only projects.
- Optional "What room?" chips: Kitchen / Vanity / Laundry / Shop / Other. This only changes copy suggestions, not geometry; include only if it stays light. **Recommended:** omit room type from v1 to reduce noise; keep three measurements.
- Buttons: "Use typical kitchen" fills 10' wall, 8' ceiling, 36" counter; Continue.
- Validation: wall length > 0; ceiling ≥ 6' (warning if lower than planned cabinet); counter 28"–48" (warning outside).
- Writes `project.space = { wallLength, ceilingHeight, counterHeight }` only when the first cabinet is added or on review save. For an existing project, pre-fill from it and allow editing.

### Step 2 — Standard
**Question:** "Which cabinet tradition should we start from?"
**Helper:** "Both are common in Canada. You can change any detail later."
Two large cards:
- **North American face frame**
  - Illustration: face-frame cabinet with stiles/rails.
  - Bullets: face frame, 3/4" plywood box, full-overlay shaker doors, 4" toe kick, 24" base depth, 36" counters.
  - Badge **Recommended** when project units are imperial.
- **European frameless (32 mm system)**
  - Illustration: clean frameless box, full overlay.
  - Bullets: no face frame, 18 mm panels, 32 mm shelf-pin system, 100 mm plinth, 600 mm base depth, cleaner lines.
  - Badge **Recommended** when project units are metric.
- Optional "Compare the two" accordion with a compact table (carcass, doors, toe kick, depth, shelf system, typical material).
- Choosing sets the **preset** used to seed all later defaults and stores `project.settings.standard = 'northAmerican' | 'european'`. It does **not** force units; values display in the project's unit.
- Source note: link to `docs/RESEARCH-techniques.md` and the preset comparison, not external URLs in the wizard.

### Step 3 — Box
**Question:** "What kind of cabinet are you adding?"
**Helper:** "Pick the box you're building next. Dimensions come next."
Four cards:
- **Base** — "Counter-height cabinet for the main run." Typical 34½" H × 24" D.
- **Wall** — "Above the counter, for plates and glassware." Typical 30" H × 12" D.
- **Tall** — "Full-height storage or an oven/pantry column." Typical 84" H × 24" D.
- **Pantry** — "Shallow full-height storage." Typical 84" H × 12" D.
- Show examples/line drawing; selected card clearly marked.
- Optional smart suggestion: if run has base cabinets only, label base "Most likely next"; if wall run empty and ceiling tall, suggest wall; keep this subtle (small tag, not an extra question).
- Choosing a type loads its preset dimensions into Step 4.

### Step 4 — Size
**Question:** "How big should it be?"
**Helper:** "We've picked the usual size for a ___. Adjust if your space needs it."
- **Width**: chips for standard widths (9", 12", 15", 18", 21", 24", 27", 30", 33", 36", 42", 48"; metric equivalents 300–1200 mm in standard steps) plus a "Fit remaining" chip when the remaining run is ≥ min width. Free numeric input with unit suffix. Inline note: `Fits with 3' 6" left in the run` or `This is 6" wider than the remaining run` (warning, not blocking).
- **Height**: preset chips for the type/standard; free input. Show ceiling/counter reference: "Top of cabinet at 34½\" — counter at 36\"" for base; "Bottom 18\" above counter" for wall.
- **Depth**: preset chips for the type/standard; free input. Explain the depth convention in one line: "Depth shown is the box, not the door."
- Default values come from the preset; a small "Standard sizes" badge explains.
- Advanced details (optional accordion, only if needed in v1): carcass thickness, toe kick height, reveal. Defaults are enough.

### Step 5 — Build
**Question:** "How is the box built?" / "How should the box be built?"
**Helper:** "Pick the joint method and the carcass panel. The recommended pair matches your standard; the preview, cut list and plan set follow."
- **Carcass joint** — six cards: confirmat, pocket screw, dado + screws, dowels, biscuit alignment (with screws/clamps), butt + screws. Defaults: NA face frame `dado-screw`, EU frameless `confirmat`.
- **Carcass panel** — 18 mm structural sheet goods (Baltic birch ply, veneer-core ply, prefinished ply, melamine PB, MDF, particleboard) and **12 mm light-duty** ply/MDF behind a disclosure. The panel sets `construction.carcassMaterial` and the real `construction.carcassThickness`; a 12 mm base/tall/frame gets honest warnings (engine `construction.thinCarcass`, `faceFrame.thinCarcass`, `back.thinDado`).
- **Details** — back (applied/rabbet/dado/none), toe kick (base/tall only), face-frame joint (face-frame only); defaults from the preset. Continue works without touching details.
- The engine re-resolves on every choice: interior width, parts, machining, shelf spans, warnings, assembly sequence, cut list, sheet layouts/cut plan and PDF prints all change with the panel thickness and joint method.

### Step 6 — Layout
**Question:** "What's on the front?" 
**Helper:** "Choose doors, drawers or both; we'll size every front to the box."
Four cards:
- **Doors** (two doors on wider cabinets, one on narrow)
- **Drawers** (stack)
- **Drawer + doors** (top drawer, doors below)
- **Open** (no fronts; shelves/niche)

### Step 7 — Front style
**Question:** "How should the doors and drawers look?"
**Helper:** "Pick a style; we'll trim it to fit and show the result live."
Style controls for the relevant layout:
- Door style cards: **Slab**, **Shaker**, **Raised panel**, **Beadboard**, **Glass**; each with a mini line drawing and a one-line trade-off ("Shaker — frame and panel, classic; strongest paint finish").
- Door count: 1 / 2 (default based on width ≥ 18").
- Overlay: **Full overlay** (default) / **Inset** (face-frame only; explain 3 mm reveal). European preset shows full overlay only.
- Drawer style: **Slab** / **Shaker**; count 2/3/4 with a sentence ("3 drawers: shallow top, deep bottom").
- Material: **Paint-grade maple** / **Oak** / **Poplar** / **MDF** depending preset; one select, no wall of text.
- Pulls/hinges stay at preset defaults in the wizard; link "Fine-tune hardware and machining in Advanced editor" appears under the step.
- Preview must update immediately with the style; layout card selection should show a representative drawing.

### Step 8 — Inside & finish
**Question:** "What's inside, and how should it look?"
This step groups two short sections; keep the visual weight low.
- **Inside**:
  - Shelves: 0 / 1 / 2 / 3 / 4 (default by type: base doors 1, wall 2, tall 4); "Adjustable (32 mm pins)" as the default, fixed shelves note only in advanced.
  - Slide type: **Undermount (recommended)** / **Side-mount** / **Centre-mount** only when drawers exist; this is the one hardware choice worth surfacing.
- **Finish**:
  - Cards: **Paint**, **Lacquer**, **Water-based poly**, **Stain + lacquer**, **Laminate**; default from preset (NA: paint; EU: laminate/melamine).
  - If paint/stain: colour swatches + custom hex? Keep 6 preset swatches plus "match later"; advanced can set colour.
  - Sheen: Satin / Matte / Gloss as three chips only when paint/lacquer.
- Both sections have a "Standard" badge and can be skipped; no material ids shown.

### Step 9 — Review
**Question:** "Ready to add this cabinet?"
- Summary card: tag (auto, editable in a small field), name (auto: "Base — sink" etc., editable), dimensions, standard, construction summary, front summary, shelves/slide, finish.
- Live preview large (front + iso tabs if space).
- **Checks:** if the draft resolves with warnings/errors, show the top 3 with severity and fix suggestions; a link "See all checks" after adding.
- **Remaining run:** "This adds 30\" to your 12' 0\" run — 3' 6\" stays free." (footprint = base/tall/pantry; wall cabinets do not consume extra horizontal space). If it overflows, warn but allow ("You can still add it; the run is a planning guide").
- Primary **Add cabinet to run**.
- Secondary: Back, Save as draft? Do not add draft-saving complexity in v1; no draft persistence beyond the open wizard.
- On add:
  - Create the cabinet with the chosen config (preset + wizard overrides), tag/name, project space/settings standard updated.
  - Show success state: "B2 added · 3' 6\" left" with **Add another cabinet** (reopen wizard at Step 3 with same space/standard), **View run**, **Open plans**.
  - Clear wizard draft; select the new cabinet in run overview.

---

## 4. Preset mapping (filled by `js/data/presets.js`)

Both presets must be complete enough that a wizard run **without touching Advanced** produces a buildable cabinet.

| Setting | North American preset | European preset |
|---|---|---|
| Construction | face frame | frameless / 32 mm |
| Carcass | 18 mm (3/4") plywood | 18 mm melamine-faced PB / plywood |
| Carcass joinery | pocket screws / confirmat | confirmat / dowels |
| Back | 6 mm applied/rabbet | 6 mm rabbeted |
| Toe kick | 101.6 mm × 76.2 mm | 150 mm × 60 mm |
| Base height | 876.3 mm (34½") | 870 mm = 720 mm carcass + 150 mm plinth; 900 mm counter with 30 mm worktop |
| Base depth | 609.6 mm (24") | 560 mm carcass (600 mm with worktop) |
| Wall height / depth | 762 mm (30") / 304.8 mm (12") | 720 mm / 350 mm, bottom 550 mm above counter |
| Tall height / depth | 2133.6 mm (84") / 609.6 mm (24") | 2100 mm / 560 mm |
| Doors | shaker maple, full overlay | slab/shaker, full overlay, 3 mm reveal |
| Hinges | 35 mm cup | 35 mm cup |
| Shelves | adjustable 5 mm pins, 32 mm | adjustable 5 mm pins, 32 mm |
| Drawer slide | undermount | undermount |
| Finish | paint | lacquer (melamine is the carcass material; the finish enum has no laminate id yet) |
| Units | imperial | metric |
| Standard widths | 9–48 in | 300–1200 mm |

`js/data/presets.js` (UMD classic script, `CS.data.presets`) should expose:
```js
CS.data.presets = {
  northAmerican: { id, label, summary, units, sourceIds, construction, dims:{base,wall,tall,pantry},
                   fronts:{doors,drawers}, hardware, finish, standardWidths, heights, depths },
  european: { … },
  list() / byId(id)
}
```
The wizard applies a preset to a fresh cabinet through the same mappings the core/engine already accept. Do **not** duplicate engine standards; preset values are the *starting point* shown in the wizard, then normal engine defaults resolve the rest. Sources: link to the research report and the preset comparison.

---

## 5. Interaction + integration notes for the implementer

**Files:**
- `js/ui/guided.js` — new module: wizard state, step renderers, run overview, draft resolve/preview, preset application, launch/close/edit modes.
- `cabinet-studio.html` — add `js/data/presets.js` after techniques; add `js/ui/guided.js` before project-io/main; add `#guided-root` inside `#panel-design`, keep `.design-grid` in DOM hidden when guided.
- `css/app.css` — new `.guided-*` styles; keep existing design-grid styles for Advanced.
- `js/ui/app.js` — add `designMode` state (`guided`/`advanced`), a public `setDesignMode`, hook `guided.render()` on project/select/resolved/tab events; allow `addCabinet(type, overrides)` or a `addCabinetFromConfig(cfg)` path so the wizard can apply preset values; ensure the existing advanced editor still renders exactly as before.
- `js/ui/project-io.js` — new project flow starts the wizard (empty project with project.space unset); sample project opens run overview; header file actions can move into the project menu.
- `js/ui/preview.js` — reuse its canvas painting? The guided preview can call `CS.draw.canvas` directly with a resolved draft; do not couple guided to the advanced preview's DOM state.
- `js/ui/inspector.js` — unchanged behavior; add a "Back to guided design" control when in Advanced mode (app can render it).
- `js/main.js` — no boot sequence change except the guided module must be in `UI_FILES` if it has init; keep graceful module-missing messages.

**State/events:**
- Wizard draft is local to guided.js; do not write the project until Finish.
- Draft cabinet config built from `CS.core.project.makeCabinet(type, overrides)` or current app `buildCabinetConfig(type)` + preset overrides; resolve with `CS.engine.resolveCabinet(project, draft)` (or engine `resolveCabinet` equivalent) for preview/warnings. The engine API is stable; do not change it.
- On finish: mutate project once (add/edit cabinet, set `project.space`, `project.settings.standard`), then `CS.ui.app.selectCabinet(newId)`, `scheduleResolve`, render run.
- Run context: `project.space` fields; remaining = wallLength − Σ(cabinet widths + 3 mm gaps). No new engine fields needed.
- Existing projects without `project.space`: show "Set up your space" and use safe defaults for suggestions; do not block editing.
- Verify all old controls remain reachable in Advanced; no engine/PDF/CAD logic changes.
- Presets must never set an invalid combination; after applying, the engine's own defaults and validation win. If a preset value conflicts, show the resolved value's warning in Review.

**Accessibility:**
- Wizard is a landmark region with `aria-labelledby`; focus moves to the step heading on step change; choices are real buttons/radio semantics; progress announced (`aria-live="polite"`); Escape closes with confirmation; all controls labelled; no keyboard traps; visible focus.
- Cards have text labels, not colour-only state.
- Reduced-motion respected; no animation required for correctness.

**Responsive:**
- ≥1280 px: 3-column wizard (rail / question / preview).
- 1024–1279 px: 2-column (progress horizontal top; question + preview).
- <1024 px: single column, preview above question or collapsible; no horizontal scrolling.
- The run strip scrolls horizontally with clear edges rather than shrinking labels.

**Slimming / removal:**
- In guided mode hide the old `design-rail` and `inspector-panel` entirely.
- Hide redundant toolbar icons; move New/Open/Save into the project menu.
- Keep warnings but collapse to the top 3 with "See all".
- Do not remove any tab or export capability.

---

## 6. Copy rules

- Questions are sentence case and direct: "How wide is the space?", "What kind of cabinet?", "What's on the front?"
- Helper text explains *why*, not the field: "We'll fit the run to this measurement."
- Standard names explain themselves: "North American face frame — familiar face-frame kitchens; 3/4" plywood box, shaker doors."
- Avoid abbreviations in user copy: use "34½ in" not "876.3 mm" in imperial mode; the engine stores mm.
- Warnings are actionable: "This cabinet is 6 in wider than the space left. You can still add it, or choose 36 in."
- No exclamation marks, no "Oops", no blaming the user.

---

## 7. Acceptance criteria (QA signs off against these)

1. Fresh project → guided wizard; user can complete a cabinet in under ~90 seconds by accepting defaults.
2. Wizard steps: Space → Standard → Box → Size → Build → Layout → Front style → Inside & finish → Review; one clear question each; Back works; Escape/close confirmed; no project mutation before Finish.
3. North American and European presets produce visibly and structurally different cabinets (construction system, dimensions, fronts, materials, units), both valid in the engine with no errors.
4. Space values persist in the project, run strip shows remaining run, and width suggestions use remaining length.
5. Run overview is the default Design view for a project with cabinets; it shows the run and a big "Design a cabinet" CTA; editing a cabinet reopens the wizard at Review or appropriate step.
6. Advanced editor opens the existing full inspector; "Back to guided design" returns; all old fields remain reachable.
7. All existing functionality still works: project save/load/autosave, units, sample/new, cut list, assembly, technique library, plans; PDF/DXF/DWG downloads unchanged and valid.
8. file:// and offline: zero console errors, zero network requests, no missing modules; automated browser checks pass at 1440×900 and 1100×800; no horizontal overflow.
9. Accessibility: labelled controls, keyboard-completable wizard, focus moved per step, progress spoken, no traps.
10. Visual review: new screenshots in `docs/screenshots/` show the slim overview and all wizard steps; desktop and 1100 px.
11. No new dependencies, no network, no build step; all files load in contract order.

---

## 8. Out of scope for this iteration

- Drag-and-drop room layout / floor plan editing.
- Auto-generating a full run in one shot (the wizard adds one cabinet at a time and shows remaining run).
- Touching the engine geometry, PDF sheet composition, CAD output, or the researched construction catalogue.
- Multi-project library UI beyond the existing open/save/autosave.
- Mobile phone layout (desktop/tablet is the target; the wizard should still fit at 1100 px).
