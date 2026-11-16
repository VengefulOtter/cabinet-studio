# Build methods and sheet-goods thickness — guided Build-step reference

**Project:** Cabinet Studio, a local HTML shop-drawing generator for a serious hobbyist / small-shop cabinetmaker.
**Date:** 2026-11-15. **Audience:** the UI teammate implementing the guided **Build** step, the engine teammate exposing carcass thickness, and the Lead integrating both.
**Basis:** the existing 42-source `docs/RESEARCH-techniques.md` (construction research) plus three additional sources opened for this document (marked `[B#]`). No new construction research was needed beyond those; every other citation (`[S#]`) resolves in `docs/RESEARCH-techniques.md` §17 with title, publisher, URL, access date **2026-11-15** and kind. The full source table for the `S` keys used here is at §14.

---

## 0. How to read this, and the evidence rule

- **`[S#]`** — a source already documented in `docs/RESEARCH-techniques.md` §17; the key is identical there.
- **`[B#]`** — a source added for this document (full citation in §14).
- **STANDARD** — a normative document or an association standard (KCMA/ANSI, DIN, APA).
- **MANUFACTURER** — a maker's own data (Blum, Hettich, Richelieu, plywood makers).
- **SHOP** — recorded professional practice (WOODWEB, Fine Woodworking, trade suppliers). Not a published standard.
- **ENGINEERING JUDGEMENT** — a rule derived from the cited constraints but not itself published; the app must present it as a warning, not a fact.

The app's **Standard** choice (North American face frame / European frameless) is set earlier in the wizard. The **Build** step must never re-ask it; it filters and defaults the methods and panels to that standard.

---

## 1. Where the Build step sits, and what it asks

Recommended position: **after Size, before Layout/Front style** (the build affects interior widths, shelf spans and hardware, and the preview is still cheap to redraw). With the current guided sequence that makes the flow:

`Space → Standard → Box → Size → Build → Layout → Front style → Inside & finish → Review`

If the team prefers to keep the step count at eight, fold Build into Size as a labelled disclosure — but the build choice changes warning counts and hardware, so a real step is cleaner. The count is not sacred; measure the flow rather than treating seven or eight as a rule.

**Step copy (proposal):**

- **H1:** "How is the box built?"
- **Helper:** "Pick the joint method and the carcass panel. The recommended pair matches your North American face-frame / European frameless standard — you can change either."
- **Two labelled groups on one screen:** "Box joint" (six cards) and "Carcass panel" (four cards + a "Light-duty panels" disclosure). This is two tightly related decisions, not two independent ones; keep the preview and the one-line build summary visible.
- **Details disclosure:** "Back, toe kick and face frame" — back style, toe kick style, face-frame joinery (face-frame only), each defaulted from the preset. Nothing here is required to continue.
- **Skip** uses the preset defaults. **Back/Continue** as in the rest of the wizard. Continue is enabled when a method and panel are selected (both always have defaults).

The Build step writes only these cabinet fields (all already in the contract): `construction.joinery`, `construction.carcassMaterial`, `construction.carcassThickness` (resolved from the material unless an Advanced override exists), `construction.backStyle`, `construction.backMaterial`, `construction.backThickness`, `construction.dadoDepth`, `toeKick.style/height/setback/material`, and `faceFrame.joinery` (face-frame only). It must not touch `construction.system`, dimensions, doors or drawers.

---

## 2. The six carcass methods

These are the contract's `carcassJoinery` ids. "Compatible system" means the method can physically be used in that system; "best" is the recommendation, not a limit.

| Id | Method | Compatible system | Strength PB/MDF/ply | Speed | Tooling | Clamps | Repairable | Exposed end | Best used when | Cautions | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `confirmat` | Confirmat 7 × 50 stepped screw: 5 mm pilot in the edge, 7 mm clearance in the face | Both; **best frameless** | High / High / Medium (splitting risk in ply) | **Very fast** — no clamp time | 7 mm step drill or line borer; 5 mm bit | No | Yes (unscrew) | No (head inside) | Melamine/PB/ply frameless boxes 16–22 mm; shop cabinets; the EU default | Can split veneer-core ply near an edge or with a dull step bit; confirmat is designed first for particleboard/MDF [S19]; heads visible inside | [S19][S15] SHOP |
| `pocket-screw` | Angled fine-thread screw through a drilled pocket, hidden face | Both; **best face frame/utility** | Medium / Medium / Medium | **Very fast** | Pocket jig + driver | No | Yes | No (pockets must be hidden) | Face frames, toe platforms, stretchers, shop boxes; the NA face-frame default for the frame | Weak in MDF end grain; can pull slightly out of flush; keep pockets off exposed faces [S14][S15] | [S14][S15] SHOP |
| `dado-screw` | Dado or rabbet + glue + screws (or clamps) | Both; **best face frame/traditional** | High / High / High (glue area) | Medium (setup + machining) | Dado stack/router, clamps | Short | No (glue) | No (through dado shows) | Fixed shelves, dividers, bottoms/tops, shop and face-frame boxes; the NA default | Through dado shows on the outside; stopped dado needs router setup; permanent [S15][S14] | [S15][S14][S16] SHOP |
| `dowel` | 6–8 mm dowels, line-bored, glue and case clamp | Both; **best frameless production/exposed-end** | High / High / High | Medium without a borer; **fast with borer + case clamp** | 32 mm line borer/dowel jig, case clamp | Yes | No | **Yes** (no visible fastener) | Exposed-end European boxes, high-volume runs, shops with the tooling | Fussy without a boring machine; glue required; dry-fit before glue [S15][S5] | [S15][S5] SHOP |
| `biscuit` | #20 biscuits (with screws) for location | Both; alignment only | Low as a sole joint / Medium with screws | Fast | Biscuit joiner | Yes for glue | No | Hidden slots | Locating parts during assembly; never the sole corner joint | Biscuits only penetrate about 1/2"; WOODWEB pros call them a poor sole corner joint [S11][S15]; use AWI spacing — max 2" from the side edge, max 6" apart [S14] | [S11][S14][S15] SHOP |
| `butt-screw` | Plain butt joint, predrilled countersunk screws from outside, glue optional | Both; hidden/budget | Low–medium / Low–medium / Low–medium | **Fastest/cheapest** | Drill + driver | No | Yes | No (visible/splitting) | Shop fixtures, hidden utility boxes | Least racking resistance; screws can split ends; needs an applied end or plugs on an exposed side [S15] | [S15] SHOP |

**Strength labelling note.** The strength column is the qualitative summary used in `RESEARCH-techniques.md` §2.2 (shop practice, not a test result). The only published performance benchmark in the research is KCMA A161.1: loaded shelves/bottoms at 15 lb/ft² for seven days must not deflect more than 1.6 mm per 305 mm (max 6.4 mm), and wall cabinets must take 272–363 kg depending on width — KCMA tests the cabinet, not the joint [S1] STANDARD. A joint that passes the test is acceptable regardless of method; a method that cannot keep the box square will not.

**Assembly-order effect (summary; detail in §10):**

| Method | Before assembly | At assembly | After |
|---|---|---|---|
| Confirmat | Bore 5 mm edge holes and 7 mm through-holes; sand/band edges | Square the parts, drive 3 screws per joint (≈64 mm from ends, ≤150–200 mm centres is a sensible shop default) | Check diagonals; no clamps to wait on |
| Pocket screw | Cut pockets on hidden faces | Align parts, drive 2–3 screws per joint, hold flush | Check diagonals; pockets face inside/back |
| Dado/rabbet | Cut housings; dry-fit | Glue housing, clamp, drive screws; clean squeeze-out immediately | Install the back while the box is clamped square |
| Dowel | Line-bore both members from the same reference face; dry-fit | Glue both holes and dowels, clamp or case-clamp square | Check diagonals before the glue grabs |
| Biscuit | Cut slots (AWI spacing: ≤51 mm from side edge, ≤152 mm apart) | Glue biscuits for location + drive screws for strength | Clamps/glue only where screws are not the primary load path |
| Butt + screw | Predrill and countersink | Glue (optional), drive screws from the hidden side, ≥50 mm from ends | Plug or cover heads; plan an applied end if exposed |

---

## 3. Carcass panel and thickness choices

The app's material catalogue already carries the ids below. The Build step should present the **18 mm structural** options for every cabinet and put **12 mm** behind a "Light-duty panels" disclosure with a warning. Thickness is a *material property* in the model (`construction.carcassThickness` resolves from the material, with an Advanced override) — the Build step should not expose a free thickness field; picking a panel sets it, and Advanced can override [contract §4; engine `defaults.js`].

| Material id | Product and actual thickness | Structural role | Geometry effect vs 18 mm | Machining | Hardware | Plan/cut-list effect | Best for | Cautions | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| `ply-birch-18` | 3/4" Baltic birch plywood; 18 mm nominal, tolerance ±0.4 mm; actual ≈17.6–18.4 | **Standard structural carcass, fixed shelves, doors/fronts** (factory guidance) | Baseline: frameless interior width = W − 2×18; door overlay per side (full overlay) = 18 − reveal; shelf span limit 900 mm | Clean machining; thin face veneer; edge-band or lip [S27]; grain direction | Hinge/slide screws have full purchase; 35 mm cup hinges suit 19 mm doors | Thickness group "18 mm"; cut list/yield; part drawings annotate 18 mm | NA and EU structural carcasses, shelves, exposed ends when banded | Do not confuse 18 mm nominal with 3/4" (19.05 mm); hinge/slide geometry uses actual thickness; face frames are 19 mm and may sit proud unless built out | [S25] STANDARD/SPEC; [B1] MANUFACTURER; [S23] MANUFACTURER |
| `ply-veneer-18` | 3/4" veneer-core cabinet plywood; 23/32 CAT = 0.703" (17.85 mm) class, sheet dims +0/−1.6 mm | Structural carcass where a paint/stain face is wanted | Same class as Baltic 18 mm; actual thickness may differ by 0.5 mm at the joint | Veneer chip-out on crosscuts; use a fine/compression blade | As 18 mm | Same 18 mm group but keep a distinct material row (different sheet/veneer) | Paint/stain-grade face frames + carcass where a specific species face is wanted | Actual thickness varies by core/mill; measure before cutting joinery; sheet squareness ±3.2 mm class | [S23] MANUFACTURER; [S24] STANDARD |
| `ply-prefinished-18` | 3/4" factory-finished plywood | Structural carcass with finished interior | As 18 mm | Factory finish chips at cut edges; edge-band after cutting | As 18 mm | Saves an interior finishing pass; still a separate 18 mm material row | Carcasses, shelves, drawer boxes where interiors are visible | Check finish compatibility with edge-band adhesive; touch-up cut edges | [S14] SHOP |
| `melamine-18` | 18 mm melamine-faced particleboard | **Frameless EU default carcass** | As 18 mm | Confirmats/system holes work well; face screwing does not; cut edges must be banded | Hinge/slide screws hold in the PB core; pilot correctly | Separate "18 mm melamine/PB" group; edgeband all exposed edges | Budget/EU frameless carcasses, shop cabinets, closets | Raw cut edges not acceptable in a kitchen; moisture swelling at unsealed edges; confirmat is the designed fastener [S19] | [S19] SHOP; [S26] REFERENCE |
| `mdf-18` | 18 mm MDF | Paint-grade doors/fronts and panels first; carcass possible but heavy | As 18 mm | Machines cleanly, no grain; dusty; edges must be sealed | Holds screws but heavier; don't use thin MDF for structural sides | Separate "MDF 18" group; plan finishing for edges | Painted doors/drawer fronts/raised panels; shop cabinets | "MDF makes an outstanding substrate for doors" [S19]; heavy for carcasses; moisture-sensitive; edges fuzz if unsealed [S26] | [S19] SHOP; [S26] REFERENCE |
| `particleboard-18` | 18 mm raw particleboard | Substrate, never exposed | As 18 mm | Confirmat/assembly-screw material; face screws poor | Confirmats designed for PB [S19] | Separate group; must be faced/banded | Shop fixtures, substrate for laminate | Do not use butt-screws or pocket screws in the face; never exposed in a kitchen [S19] | [S19] SHOP; [S26] REFERENCE |
| `ply-birch-12` | 1/2" Baltic birch ply; 12 mm nominal ±0.4 mm | **Light-duty**: drawer boxes, wall-cabinet backs when screwing to studs, shop cabinets — not a general carcass | Frameless interior width = W − 24 (12 mm wider each side than 18 mm); full-overlay door covers only 12 − reveal ≈ 9 mm of the side; shelf span limit 600 mm | Fine for joinery; more care with fasteners and pressure | Hinge/slide screws have less purchase; plate screw length matters; 12 mm is below the 1/2" (12.7 mm) lower end some under-mount runner specs quote for drawer material [S8] | Separate "12 mm" group; light-duty warning on carcass use; shelf span warning | Drawer boxes, light wall cabinets/backs, shop cabinets | Thin panel racks and strips at hinge screws; a 12 mm carcass is not a kitchen-grade structural box [B1][B2]; confirmat may still work (supplier range 12–25 mm for M7 [B3]) but test and prefer 18 mm | [B1] MANUFACTURER; [B2] TRADE; [S25] STANDARD/SPEC; [B3] TRADE |
| `mdf-12` | 1/2" MDF | Light-duty panels, backs, templates | As 12 mm | Machines cleanly; heavy dust; seal edges | Not structural; screw purchase is limited | Separate group; light-duty only | Painted panels, templates, shop fixtures | Not for wall cabinets or drawer stacks; edges must be sealed | [S26] REFERENCE; [B2] TRADE |

**Part-thickness rule of thumb (manufacturer/trade, cite [B1][B2]):** 18 mm for carcasses, fixed shelves, doors and drawer fronts; 12 mm for drawer boxes/backs; 6 mm for non-structural backs and drawer bottoms. The app's material catalogue already follows this split. The Build step's job is to stop the owner from using "12 mm because it's cheaper" on structural boxes — the failure mode in the manufacturer's example was stripped hinge screws and a bowed pantry shelf within two years [B1].

**Thickness effects the app must compute and show (engine already resolves many of these):**

| Consequence | 18 mm default | 12 mm choice | Where it shows |
|---|---|---|---|
| Frameless interior width | W − 36 mm | W − 24 mm (+12 mm interior) | Preview, shelf length, drawer opening, cut list |
| Full-overlay door coverage per side (frameless) | 18 − reveal (≈15 mm) | 12 − reveal (≈9 mm) | Door schedule + "hinge plate overlay" check (`check.js` already checks face-frame plate overlay; extend to frameless plate range) |
| Hinge plate screw purchase | Full (plate screws 12 mm deep default) | Reduced; verify screw length/pilot and don't break through | Machining notes + warning |
| Shelf span limit | 900 mm for ply/MDF 18 | **600 mm** for 12 mm (engine's `shelfSpan.recommendedByMaterial` already has `ply-birch-12: 600`, `mdf-12: 550`) | Shelf warning `check.js` |
| Back dado depth | 6 mm of 18 = one third | 6 mm of 12 = half the panel; engine clamps dado depth to ≤ half thickness | Back detail drawing + warning |
| Back style suitability | All styles | Rabbet/applied preferred; dado weak | Build "Details" defaults |
| Confirmat suitability | Designed range | Supplier range says 12–25 mm for M7 [B3], but less material around the 7 mm clearance hole; test | Info/warning |
| Face frame on the carcass | Frame glues/fastens to 18 mm side | 19 mm frame sits proud of a 12 mm side (7 mm step); screws get less purchase | End-view drawing + warning |
| Cut list / purchase | "18 mm" group | Separate "12 mm" group; sheets bought separately | Cut list, material plan, PDF |
| Edge banding | 0.5/2 mm PVC on 18 mm; 2 mm for high-wear edges [S27][S28] | Same banding; edge appears thinner | Edge-band schedule |

The thickness override already exists in the contract (`carcassThickness` explicit override allowed). The engine warns when the override differs from the material's catalogue thickness (existing `check.js` rule: "Carcass thickness differs from the material"). The Build step should avoid that warning by deriving thickness from the chosen material and leaving override to Advanced.

---

## 4. Back styles

`backStyle` ids are `applied`, `rabbet`, `dado`, `none`. The back is a shear panel, a squaring aid and the wall load path for wall cabinets [S14][S16]; KCMA's wall-cabinet static-load requirement is 272 kg up to 36" wide, 363 kg for 36–60", and 9 kg per 25.4 mm above 60" [S1] STANDARD.

| Id | Construction | Structural contribution | Best used when | Cautions | Thickness interaction | Evidence |
|---|---|---|---|---|---|---|
| `applied` | 6 mm back applied to the rear, inset from the edge | Good shear if well fastened; 1/2" back is stiff | Base cabinets; cabinets with an internal hanging rail | A thin applied back alone is **not** a wall-cabinet load path; engine already errors when back <12 mm and no hanging rail | With 12 mm sides, sides shorten by back thickness; back easier to fasten | [S14][S16][S1] |
| `rabbet` | Back in a 6 × 6 mm rabbet in sides/top/bottom | Squares and stiffens; flush inside/out | **Default for all systems**, wall cabinets with a rail | Needs a clean rabbet and actual back thickness | Works with 12 mm sides (6 mm rabbet leaves 6 mm) but verify | [S16] SHOP |
| `dado` | 6 mm × 12 mm dado set in from the rear; back captured | Stiffest; squares the case | Wall/tall cabinets, heavy cases | Most machining; dado depth ≤ half the side thickness (6 mm on 12 mm) | On 12 mm sides the dado takes half the panel — prefer rabbet/applied, or 18 mm | [S16] SHOP |
| `none` | No back | None; needs a frame/hanging system | Open shelving, appliance cabinets | **Error on wall/tall/pantry** in a kitchen run; dust and racking; no wall load path | Independent, but excludes wall cabinets | [S16][S1] |

Recommended defaults: `rabbet` for both presets (matches `js/data/presets.js`), 6 mm back material; wall/tall cabinets get a hanging rail (hardware.hangingRail). Advanced options: applied 12 mm back for a no-rail build; dado for a wall cabinet where maximum stiffness is wanted.

---

## 5. Toe-kick styles

`toeKickStyle` ids: `separate-platform`, `notched-sides`, `legs-levelers`, `flush-base`, `none`. Shop standard is 101.6 mm high × 76.2 mm recess with a finished board fitted last and scribed to the floor [S40][S14] SHOP; KCMA minimum (for cabinets resting on the floor) is 76.2 mm high × 50.8 mm deep [S1] STANDARD.

| Id | What is built | Best used when | Cautions | NA/EU default | Evidence |
|---|---|---|---|---|---|
| `separate-platform` | Plywood ladder platform, levelled, finished face applied and scribed | Long runs, uneven floors, the default for a kitchen | Extra parts/height; platform must be straight; use 18 mm platform material | **Both presets** (EU real practice is adjustable feet + clipped plinth; the app models it as a platform so the plinth part still exists) | [S14][S40] |
| `notched-sides` | Side panels extended to the floor with a front-bottom notch | Face-frame cabinets, short runs | Notching every side; weaker bottom corner; 12 mm sides are a poor choice for the notch | Alternative for NA face frame | [S40][S1] |
| `legs-levelers` | Adjustable legs + separate kick board | Bad floors, fast installs, frameless boxes | Engine currently emits hardware only for this style — make sure the kick **board part** is still generated; legs can be knocked | EU alternative (closest to real EU practice) | [S14][S40] |
| `flush-base` | No recess (or shallow 1") | Furniture-style islands, appliance housings | No foot room at a working counter; does not meet KCMA toe-space minimums if truly flush | Not for a working base run | [S1][S40] |
| `none` | No toe kick | Wall cabinets, wall-hung vanities | Not valid for a floor-standing working base | Wall cabinets only | [S1][S40] |

Build-step "Details" should show this as a secondary control with the preset default, plus the KCMA/ergonomic warning when `flush-base`/`none` is chosen on a `base` cabinet. The kick board is a separate part and must be fitted after levelling [S40].

---

## 6. Face-frame joinery

Only relevant when `construction.system = faceframe`. Frame stock is 19 mm thick, stiles/rails 57.15 mm (2-1/4") in the contract; the PWW method uses 13/16" frame stock with a bumper and AWI biscuit spacing rules [S14] SHOP.

| Id | Method | Strength | Speed | Tooling | Cautions | Evidence |
|---|---|---|---|---|---|---|
| `pocket-screw` | Fine-thread pocket screws, hidden on the back | Good enough for frames | **Fastest** | Pocket jig, clamp, square | Pockets must not interfere with carcass fitting; check diagonals before glue sets | [S14] SHOP |
| `biscuit` | Biscuits + glue (+ screws) | Medium; alignment | Fast | Biscuit joiner, clamps | Biscuits locate, not clamp; add screws at joints that carry doors; AWI spacing ≤51 mm from ends, ≤152 mm apart | [S14] SHOP |
| `dowel` | 2–3 dowels per joint + glue | High | Medium | Dowel jig, clamps | Reference every joint from the same face; dry-fit the frame | [S15] SHOP |
| `mortise-tenon` | Traditional mortise-and-tenon | **Highest** | Slowest | Mortiser/router jig, tenoning jig | Overkill for painted kitchen frames; best for stain-grade/furniture work | [S11] SHOP |

Frame-to-carcass attachment (not part of `faceFrameJoinery` but part of the same build): glue + alignment biscuits and/or pocket screws, then flush and finish [S14]. Warn if the frame is biscuit-only *and* carries doors; warn if a frame member is too narrow for the hinge plate.

---

## 7. Recommended defaults per standard

These align with `js/data/presets.js` (which the wizard already deep-merges over its fallbacks). The Build step must mark the preset's value **Recommended** and let the user change it.

| Setting | North American face frame | European frameless | Evidence / note |
|---|---|---|---|
| Carcass method (`construction.joinery`) | **`dado-screw`** (glue + screws; classic face-frame box) | **`confirmat`** (fast, designed for melamine/PB) | [S14][S19]; presets.js set these |
| Carcass panel | **`ply-birch-18`** (3/4" plywood) | **`melamine-18`** | [S14][S19][S26]; presets.js |
| Carcass thickness | 18 mm (from material) | 18 mm (from material) | Contract default; derived from material |
| Back style / material | **`rabbet`** / 6 mm ply | **`rabbet`** / 6 mm | [S16]; presets.js |
| Toe kick | **`separate-platform`**, 101.6 × 76.2 mm | **`separate-platform`**, 150 × 60 mm (EU plinth reality; see note) | [S40][S14]; presets.js; EU plinth research in `RESEARCH-UI-FLOW.md` §8 |
| Face-frame joinery | **`pocket-screw`** | — (no frame) | [S14]; presets.js |
| Doors | Shaker, 19 mm maple, full overlay | Slab, 19 mm lacquered MDF, full overlay | presets.js; RESEARCH-techniques §6 |
| Drawers | Dovetail box, undermount slides | Box-joint box, undermount slides | presets.js; RESEARCH-techniques §9 |
| Panel upgrade options | Veneer-core ply (species face), prefinished ply | Prefinished ply, Baltic birch for visible ends | [S23][S25][S14] |
| Light-duty panel | 12 mm ply/MDF only for wall boxes/open shelves/shop units | same | [B1][B2]; engineering judgement for kitchen-grade use |

**EU toe-kick note (spec correction carried from `RESEARCH-UI-FLOW.md` §8):** European kitchens normally stand on adjustable feet with a clipped plinth, and German standard worktop height is 90 cm = 15 cm plinth + 72 cm carcass + ~3 cm worktop. The preset models the plinth as a 150 mm platform because the engine's `legs-levelers` style currently emits hardware only and would drop the plinth part. If `legs-levelers` is fixed to emit a plinth face part, switch the EU default to it.

**12 mm is not a preset default in either system.** Offer it only under a "Light-duty panel" disclosure, and warn (see §8).

---

## 8. Combinations that should warn (and two that should block)

Severities follow the app's `Warning.severity` (`error` blocks export, `warning` warns, `info` advises). Messages are copy-ready; rationale cites the constraint.

| # | Combination | Severity | Message (copy) | Rationale / evidence |
|---|---|---|---|---|
| W1 | 12 mm carcass on `base`, `wall`, `tall` or `pantry` | **warning** (block for `wall`/`tall` with doors/drawers if engine cannot verify) | "12 mm is a light-duty panel. Kitchen carcasses are normally 18 mm — thin sides strip hinge and slide screws and rack more easily." | [B1][B2] manufacturer/trade; KCMA performance [S1] |
| W2 | 12 mm carcass with a drawer stack | **warning** | "12 mm carcass with drawers: under-mount slides and drawer hardware assume a stiffer box. Use 18 mm or add a fixed shelf/backing." | [S8] under-mount hardware; [B1] |
| W3 | 12 mm carcass + `dado` back | **warning** | "A 6 mm back dado takes half of a 12 mm side. Use a rabbeted or applied back, or an 18 mm side." | [S16]; engine clamps dado depth to half thickness |
| W4 | 12 mm carcass + face frame | **warning** | "A 19 mm face frame stands 7 mm proud of a 12 mm carcass and gets little screw purchase. Use an 18 mm carcass or an applied end panel." | engineering judgement from frame 19 mm/carcass 12 mm geometry [S14] |
| W5 | 12 mm carcass with shelf span over 600 mm | **warning** | "Shelves in a 12 mm carcass should not span more than about 600 mm; add a divider or use 18 mm." | engine span table; KCMA deflection [S1]; Sagulator scaling [S22] |
| W6 | 12 mm platform/toe base for a long run | **warning** | "Use 18 mm for the toe-kick platform; 12 mm sags between levelers." | engineering judgement; platform practice [S14] |
| W7 | `confirmat` with 12 mm panels | **info/warning** | "Confirmats will work in 12 mm panels but leave little material around the hole — test on scrap; dowels/dado or 18 mm are safer." | supplier range 12–25 mm for M7 [B3] TRADE; splitting risk [S19] |
| W8 | `confirmat` on veneer-core ply | **info** | "Confirmat in veneer-core ply can split near an edge — drill a test hole and keep screws away from the end." | [S19] SHOP |
| W9 | `pocket-screw` in melamine/PB carcass | **warning** | "Pocket screws are weak in particleboard/MDF end grain. For frameless melamine use confirmats or dowels." | [S14][S15][S19] |
| W10 | `biscuit` as the only carcass joint | **warning** (existing engine rule) | "Biscuits align but do not clamp a carcass on their own; add screws or a dado." | [S11][S14][S15] |
| W11 | `butt-screw` with an exposed end | **warning** | "Butt-and-screw has visible heads and the least racking resistance. Plan an applied end panel or plugs." | [S15] |
| W12 | `dowel` without clamps or a case clamp | **info** | "Dowel joints need glue and clamping to close square; a case clamp makes this quick." | [S15] |
| W13 | `backStyle: none` on `wall`/`tall`/`pantry` | **error** | "A wall or tall cabinet needs a back or a full frame/hanging system." | [S16][S1] |
| W14 | `applied` back <12 mm with no hanging rail on `wall`/`tall` | **error** (existing engine rule) | "A thin applied back is not a load path for a wall cabinet; add a hanging rail or a structural back." | KCMA wall loads [S1]; [S16] |
| W15 | `flush-base` or `none` toe kick on a `base` working run | **warning** | "A working base run needs toe space — KCMA minimums are 3 in high × 2 in deep; most kitchens use 4 in × 3 in." | [S1][S40] |
| W16 | `carcassThickness` override differs from the material's thickness | **warning** (existing engine rule) | "Configured thickness differs from the panel material; the cut list will use the override." | `check.js` existing; contract |
| W17 | MDF/PB carcass in a sink base / wet area | **warning** | "MDF and particleboard swell at unsealed edges; seal all edges and consider plywood near the sink." | [S26]; [S1] finish requirements |
| W18 | 12 mm door/frame? n/a (door thickness set on front step) — instead: 12 mm carcass + inset doors | **warning** | "Inset doors on a 12 mm carcass: hinge plate screws have little purchase. Use 18 mm sides or a face frame." | engineering judgement; [S6] |
| W19 | Face frame narrower than the hinge plate needs | **warning** | "The frame member is too narrow for a standard hinge plate; widen it or use a face-frame plate/adapter." | [S21][S6]; existing engine face-frame overlay check |
| W20 | `legs-levelers` with no kick-board part generated | **warning** (engine gap) | "This toe-kick style should still produce a kick face; check the cut list for the plinth board." | spec correction in RESEARCH-techniques §4.2; [S40] |

**Should block (error) rather than warn:** (a) any wall/tall cabinet with no back and no frame/rail; (b) a carcass method incompatible with the selected hardware in a way the engine cannot fix (e.g., a frame-and-panel door method with a 12 mm carcass and inset doors needing plate screws the panel cannot hold — engine should warn first and only block export if unresolved); (c) a carcass thickness below the minimum the engine can machine safely (e.g., <12 mm). Keep warnings recoverable and actionable; do not silently clamp thickness.

---

## 9. Assembly-sequence differences and notes

The shared sequence (from `RESEARCH-techniques.md` §13): cut and edge-band parts → bore system holes while flat (5 mm, 32 mm pitch, 37 mm front line) [S5][S18] → machine joinery → pre-finish interior faces where possible [S14] → assemble carcass and check square → install back → build/level toe base → install hardware → fronts → QC.

| Method | Sequence differences to write into the assembly page | Short assembly copy (for the plan/assembly page) |
|---|---|---|
| `confirmat` | Mark left/right and front/top; drill 5 mm edge holes and 7 mm through-holes; no clamps; drive after dry-fit | "Drill 5 mm pilot in the edge and 7 mm through the face; three screws per joint, about 64 mm from the ends. No clamps needed — check the diagonals." |
| `pocket-screw` | Pockets on hidden faces; mark the receiving member; drive from the back; clock pockets away from the outside face | "Cut pockets on the hidden face, two or three screws per joint, and keep the outside face flush while you drive." |
| `dado-screw` | Cut the housings; dry-fit the whole box; glue, clamp, screw; wipe squeeze-out before it sets; install the back while clamped | "Dry-fit the housings, then glue and screw; clean the squeeze-out before it sets and fit the back while the box is clamped square." |
| `dowel` | Line-bore both members from the same reference; dry-fit; glue both hole and dowel; clamp or case-clamp; check diagonals before the glue grabs | "Bore both parts from the same face, dry-fit, glue and clamp square — a case clamp is the fast way." |
| `biscuit` | Cut slots (AWI spacing); glue biscuits for alignment and drive screws for strength; clamp where the joint relies on glue | "Biscuits locate; screws carry the load. Keep slots within 2 in of the side edge and 6 in apart." |
| `butt-screw` | Predrill and countersink; glue optional; drive from the hidden side; 50 mm from ends; plug/applied end | "Predrill and countersink, keep screws 50 mm from the ends, and plan an applied end or plugs if the side shows." |

**Thickness-specific assembly notes** (add to the assembly page when any 12 mm part exists):

- Lower clamp pressure and check for panel bow; 12 mm sides flex more while driving.
- Verify hinge-plate and slide screw lengths so they do not break through the thin side.
- Dado/rabbet depth must not exceed half the panel thickness (engine clamps to this; the sawyer needs the same rule).
- Edge-band before assembly; the thinner edge shows banding width more.
- For 12 mm backs used as a wall screw-through panel, screw into studs/rail, not just the back [B1].

**Back, toe kick and face frame assembly notes:** back installed while the carcass is clamped square, then re-check diagonals [S14][S16]; toe-kick platform levelled first, kick board cut and scribed **last** [S40]; face frame glued/clamped with alignment biscuits and pocket screws, then flushed and finished before hardware [S14].

---

## 10. Plan-set, cut-list and purchase implications

The Build step changes the plan set in these specific places; the UI/PDF should make each visible rather than hiding it behind the Advanced editor:

- **Cut list:** parts are grouped by material **and thickness**; a 12 mm carcass creates a separate material group and sheet purchase line; the part `thickness` field shows on every row.
- **Sheet layouts:** 18 mm and 12 mm parts cannot share a sheet; the material plan must show each thickness separately; kerf/trim unchanged.
- **Purchase list:** the 12 mm option changes sheet count/area; solid stock unchanged. If the selected panel is a 5×5 Baltic birch sheet rather than 4×8, the plan must re-resolve (sheet size is a material/sheet property).
- **Component drawings:** annotate the actual thickness ("18 mm Baltic birch ply" / "12 mm ply — light duty"); show machining (confirmat 5/7 mm holes, system holes, dado/rabbet depth) and edge-banding note. A 12 mm casing stamp should carry a light-duty note on the drawing.
- **Whole-cabinet views:** side section shows the carcass thickness and back/rabbet/dado detail; face-frame end view shows the frame-to-carcass step (warn when 19 mm frame on 12 mm carcass).
- **Assembly page:** the method name and the sequence difference in §9 appear as the step's tools/notes; the QC checklist adds "check screw lengths on thin panels" when 12 mm is used.
- **Checks/warnings:** W1–W20 above appear in Review and the plan-set checks; errors block export, warnings do not.
- **Material plan:** purchase quantities already count the chosen material/thickness; the plan note should state the carcass panel and method (e.g., "Build: dado/rabbet + glue + screws · 3/4 in Baltic birch ply").

---

## 11. Guided card copy (short, copy-ready)

The card titles/descriptions below follow the app's existing card style (title + one line, no codes, sentence case). The **Recommended** badge comes from the preset, not the copy.

**Step 5 — Build**

- **H1:** "How is the box built?"
- **Helper:** "Pick the joint method and the carcass panel. The recommended pair matches your [North American face-frame / European frameless] standard."
- **Group heading 1:** "Box joint" · **Group heading 2:** "Carcass panel"
- **Details disclosure:** "Back, toe kick and face frame" → "Back style", "Toe kick", "Face-frame joinery" (face-frame only).

**Box-joint cards**

| Id | Title | Card description | Badge |
|---|---|---|---|
| `confirmat` | Confirmat screws | "Stepped screws for melamine and particleboard — fast, no clamps, the frameless default." | Recommended (EU frameless) |
| `pocket-screw` | Pocket screws | "Angled screws from hidden pockets — fast and cheap; best for face frames and utility boxes." | Recommended (NA face frame) |
| `dado-screw` | Dado or rabbet + glue + screws | "Housings, glue and screws — the strongest classic small-shop box; needs a saw/router setup." | Recommended (NA alternative) |
| `dowel` | Dowels | "Bored dowels and glue — strongest when you have a line borer and case clamps; no visible fasteners." | — |
| `biscuit` | Biscuits + screws | "Biscuits locate, screws carry the load — never a carcass joint on its own." | — |
| `butt-screw` | Butt joint + screws | "Fastest and cheapest — needs a hidden side; weakest against racking." | — |

**Carcass-panel cards** (show 4 by preset; the rest under "More panels"; 12 mm under "Light-duty")

| Material id | Title | Card description | Badge |
|---|---|---|---|
| `ply-birch-18` | 3/4 in Baltic birch plywood | "Strong, stable, takes edging — the standard carcass." | Recommended (NA) |
| `ply-veneer-18` | 3/4 in veneer-core plywood | "Paint or stain grade; check the actual thickness before joinery." | — |
| `ply-prefinished-18` | 3/4 in prefinished plywood | "Factory-finished interior — skip the inside finishing pass." | — |
| `melamine-18` | 3/4 in melamine-faced board | "Clean interior, good with confirmats; edges must be banded." | Recommended (EU) |
| `mdf-18` | 3/4 in MDF | "Heavy and smooth — better for painted doors than carcasses." | — |
| `particleboard-18` | 3/4 in particleboard | "Cheap substrate; never exposed; band or face every edge." | — |
| `ply-birch-12` | 1/2 in plywood — light duty | "Drawer boxes, backs and shop units; not a kitchen carcass." | Warning on any carcass |
| `mdf-12` | 1/2 in MDF — light duty | "Painted panels and templates; not structural." | Warning on any carcass |

**Details cards (secondary):**

- **Back:** "Rabbeted (recommended)" / "Applied" / "Captured in a dado" / "No back — open only". Helper: "The back squares the box and carries wall cabinets; applied thin backs need a hanging rail."
- **Toe kick:** "Separate platform (recommended)" / "Notched sides" / "Legs and levelers" / "Flush base" / "None". Helper: "A 4 in × 3 in recess is the shop standard; KCMA minimum is 3 in × 2 in."
- **Face-frame joinery (face frame only):** "Pocket screws (recommended)" / "Biscuits + glue" / "Dowels" / "Mortise and tenon". Helper: "Pocket screws are fastest; mortise-and-tenon is strongest and slowest."

**Copy rules** (from the workspace wizard guidance): question heading, reason-giving helper, button names the outcome ("Use dado + screws", "Continue to front layout"), blameless warnings with a specific fix, no codes/abbreviations, define a term once.

---

## 12. What the Build step should not do

- It should not change the construction **system** (that is the Standard step) or any dimension.
- It should not expose a free thickness field in guided mode; choose a panel, let the engine resolve thickness. Advanced may override, with W16.
- It should not hide the consequence: the preview and the build summary must update when the method/panel changes, and Review must show the choices with Change links.
- It should not claim CNC nesting or a specific sheet count from the build choice; the material plan handles quantities.
- It should not block on a recoverable choice. The only blocking errors are the structural ones in §8 (no back on a wall cabinet, thin applied back without a rail, thickness below the engine minimum); everything else is a warning with a fix.

---

## 13. Open questions / unverified

1. **12 mm carcass** — no published kitchen-cabinet standard sets a minimum side thickness; KCMA is performance-based [S1]. The "light-duty only" recommendation is engineering judgement supported by manufacturer/trade guidance [B1][B2] and the hardware constraints ([S8] runner range, hinge plate screw purchase). The app must present it as a warning, not a standard.
2. **Confirmat in 12 mm** — the supplier selection guide lists M7 confirmats for 12–25 mm panels [B3] (trade source, not the screw manufacturer's own installation sheet); the existing WOODWEB evidence only mentions 16/19/22 mm jigs [S19]. Test on scrap; do not present 12 mm confirmat as "fine".
3. **MDF/particleboard as structural carcass** — MDF is well documented as a door substrate [S19] and PB as the designed confirmat material [S19][S26]; using either for a kitchen carcass is shop practice, not a standard. Warn on wet areas.
4. **EU toe-kick style** — real EU practice (adjustable feet + clipped plinth) is not the same as the engine's `separate-platform`; the preset models the plinth as a platform until `legs-levelers` emits a plinth part. Flagged in `RESEARCH-UI-FLOW.md` §8.
5. **Frame-step aesthetics with 12 mm carcass** — the 7 mm step is geometry, but whether it matters is a design call; warn, don't block.
6. **Thickness tolerances** — GP/APA tolerance values are for the GP sanded-plywood class [S22? no: S23/S24]; Baltic birch ±0.4 mm [S25]; melamine/PB thickness varies by mill. The app should carry per-material tolerance notes rather than one global value.
7. **Step count/placement** — where Build sits (8 vs 9 steps, before or after Layout) is a UX call to be measured with five users, not a research fact; the workspace wizard guidance says to measure rather than assert the count.

---

## 14. Sources

### 14.1 Added sources `[B#]` (opened 2026-11-15 for this document)

- **[B1]** *Cabinet Plywood Thickness: 18mm Boxes, 12mm Drawers*. Liyuan Plywood (manufacturer technical article). https://liyuanplywood.com/cabinet-plywood-thickness/ — kind: **manufacturer/trade**. Accessed 2026-11-15. Notes: 18 mm for boxes/carcasses/fixed shelves/doors/fronts; 12 mm for drawer boxes and wall-cabinet backs; 6 mm for backs/bottoms; 18 mm metric is 0.709", not true 3/4"; thin-carcass failure points (hinge screws, shelf sag).
- **[B2]** *Best Plywood Thickness for Cabinets: Avoid These Costly Mistakes*. ThePlywood.com (trade article). https://theplywood.com/best-plywood-thickness-for-cabinets/ — kind: **trade**. Accessed 2026-11-15. Notes: 3/4" for carcass sides/tops/bottoms/shelves; backs commonly 1/2" or 1/4"; drawer boxes 1/2" or 5/8"; common thickness mistakes.
- **[B3]** *Selection of Confirmat Screw Specifications*. QMJ Fasteners (fastener supplier technical article). https://www.qmjgjfasteners.com/news/selection-of-confirmat-screw-specifications-343527.html — kind: **trade/manufacturer**. Accessed 2026-11-15. Notes: M7 confirmat for 12–25 mm panels (heavy-duty/kitchen cabinet bodies), M6.3 for 8–20 mm; length rule (penetrate the fastened plate + embed ≥1/3 of the base plate thickness); 30–50 mm conventional lengths. Cross-check against the specific screw supplier before use.

### 14.2 Existing `[S#]` sources used here

Full citations (title, publisher, URL, accessed 2026-11-15, kind) are in `docs/RESEARCH-techniques.md` §17. The keys used in this document:

| Key | Source | Kind |
|---|---|---|
| S1 | ANSI/KCMA A161.1-2022 kitchen cabinet performance standard | standard |
| S5 | Hettich furniture technology guide (System 32, hinges) | manufacturer |
| S6 | Blum CLIP top / BLUMOTION hinge guide (cup, overlay, reveal) | manufacturer |
| S8 | Richelieu Blum TANDEM slides catalogue (runner/material thickness range) | manufacturer |
| S11 | Fine Woodworking — Three Ways to Make Cabinet Doors | publication |
| S14 | Popular Woodworking — Kitchen Cabinet Essentials | publication |
| S15 | WOODWEB — Frameless Cabinet Carcase Fastener Choices | shop |
| S16 | WOODWEB — Cabinet Back Construction | shop |
| S18 | WOODWEB — Drawer runner holes in the 32 mm system | shop |
| S19 | WOODWEB — Confirmat screw assembly | shop |
| S21 | Fine Homebuilding forum — Face frame: how much overlay? | shop |
| S22 | The Sagulator (shelf deflection rules) | reference |
| S23 | Georgia-Pacific Plytanium sanded plywood specifications | manufacturer |
| S24 | APA panel thickness tolerances and labeling (TT-054) | standard/reference |
| S25 | Baltic birch plywood technical material specification | reference |
| S26 | Composite Panel Association — particleboard & MDF guide | reference |
| S27 | FastCap edgebanding application guidance | manufacturer |
| S28 | WOODWEB — Limitations of a Hot-Air Edgebander | shop |
| S40 | Cabinet toe kicks: dimensions, materials and fitting | reference |

**Internal references (not counted as external sources):** `js/engine/defaults.js` (thickness resolution, warning rules), `js/engine/check.js` (existing warnings), `js/data/presets.js` (NA/EU preset defaults), and `docs/RESEARCH-UI-FLOW.md` §8 (EU plinth correction).
