# Sheet-goods cut planning and solid-wood purchasing — research report

**Project:** Cabinet Studio, a local HTML shop-drawing generator for a serious hobbyist / small-shop cabinetmaker.
**Report date:** 2026-11-15. **Companion spec:** `docs/CUT-PLANNING-SPEC.md` (material planner, guillotine cut plan, purchase quantities). **Related:** `docs/RESEARCH-techniques.md` (materials, sheet sizes, tolerances) and `docs/RESEARCH-UI-FLOW.md` (flow/copy).
**Scope:** how a small shop should plan straight-line sheet breakdown, what the cut plan must tell the sawyer, how to compute board feet and solid-wood purchase quantities, how to present the *fewest sheets vs fewest cuts* trade-off, and the defaults the engine should ship. No app code in this deliverable.

---

## 0. How to read this report

Every numeric recommendation carries a citation key resolved in §13. All sources were opened on **2026-11-15**. Source kinds:

- **standard** — an official standard or normative reference (APA labelling, board-foot definition references).
- **research** — an optimisation reference (cutting-stock problem, kerf definition, board-foot unit).
- **manufacturer** — a sheet-goods maker's specification (Georgia-Pacific).
- **trade** — a commercial optimisation tool's published guide or a trade article; useful but often vendor-claimed, so labelled.
- **shop** — recorded professional practice from WOODWEB, Fine Woodworking forums and the tool documentation written for small shops.
- **government** — USDA Forest Service research on rough-mill yield.

Claims that could not be confirmed from an opened source are marked **unverified**. Vendor yield percentages are **trade claims** and are not treated as guaranteed values. Published standards and shop practice are separated explicitly: this report does not present shop rules of thumb as standards.

**Bottom line for the engine:** keep the spec's 150 × 300 mm offcut threshold and 10 mm trim, refine the kerf to a process profile (saw 3.2 mm, thin/track 2.2–2.4 mm, CNC 6.35/9.5/12.7 mm), keep the 15% solid-wood allowance only as a *defect/cut* allowance, and add a **dressing allowance** from rough thickness to finished thickness — otherwise 4/4 rough stock for 19 mm parts under-buys by about a third. Details, formulas and worked numbers in §§5–6.

---

## 1. Recommended defaults at a glance

| Setting | Spec value | Recommended value | Evidence | Kind |
|---|---|---|---|---|
| Saw kerf (panel saw / table saw) | 3.0 mm (current engine default) | **3.2 mm** (1/8" full-kerf); 2.2–2.4 mm for thin/track blades | Table saw full kerf ≈3.2 mm, track saw 2.2 mm, portable circular saw ≈3 mm [C16]; full kerf ≈1/8", thin kerf ≈3/32" [C18]; kerf definition includes blade set/wobble, not just plate thickness [C11] | shop / trade |
| CNC router kerf | — (not modelled) | **6.35 / 9.5 / 12.7 mm** depending on bit; 9.5 mm (3/8") common for nested cabinet parts, 12.7 mm faster but wastes more (6.35 mm is a common smaller bit — shop practice) | WOODWEB CNC operators run 3/8" or 1/2" compression tooling; 3/8" chosen for yield, 1/2" for speed [C19] | shop |
| Sheet trim (per edge) | 10 mm (current engine default) | **10 mm** default; 0 for clean factory sheets; 15–20 mm for damaged edges or CNC vacuum hold-down | Trim is edge material removed each side; leave at zero when sheets are cut cleanly; kerf comes on top [C16]; a 4×8 sheet has ±1.6 mm length/width tolerance and ±3.2 mm squareness on the GP class [C22] | shop / manufacturer |
| Reusable offcut threshold | 150 × 300 mm | **150 × 300 mm** confirmed as a realistic minimum (6" × 12"); optional second tier ~100 × 200 mm for small parts | Fine Woodworking shop practice: pieces at least 6" × 12" × 3/4" are kept "eligible for rails" [C17]; CutListLab makes minimum offcut configurable by short side [C16] | shop |
| Minimum "good yield" warning | yield <60%? | **warn <60%**, note 60–70%, typical 75–90%; flag >95% as suspicious (check kerf/trim/grain) | Guillotine plans commonly 75–90%, CNC nesting 85–95% on paper [C14]; row-based plans 85–92% claimed [C13] | trade (vendor claims) |
| Solid-wood allowance | 15% | **15% defect/cut allowance + dressing allowance** from rough thickness ÷ finished thickness; if the engine keeps a single percentage, **default 35%** and label it | 4/4 nominal = 1" (25.4 mm); standard surfaced thickness for ≤1.5" lumber subtracts 3/16" (4/4 → 13/16" ≈ 20.6 mm) [C21]; rough-mill part yields commonly 38–60% [C9]; shop waste factors 1.5–2× net for random-width lumber and +10–15% extra for straightline ripping/width loss [C6][C3] | standard / government / shop |
| Sheet count in purchase list | exact sheets required | Keep exact; optional "spare sheet" is a separate note, never added | Spec §2/§3 already correct | spec |
| Board-foot formula | `L·W·T (mm³) / 2,359,737.2` | **Correct**; 1 BF = 144 in³ = 2,359,737.216 mm³ | Board foot = 1 ft × 1 ft × 1 in = 144 in³ [C12]; AHEC formula W(in) × L(ft) × D(in) ÷ 12 [C21] | standard |
| Offcut tagging | reusable flag | Material + thickness + grain + date; do not auto-subtract offcuts from purchase | Offcut tracking only pays on expensive/slow-moving material; most shops cannot keep inventory accurate [C2][C5] | shop |

---

## 2. What a “cut plan” is, and what it is not

The app already nests rectangles with a skyline algorithm and reports yield and offcuts. The spec adds three things that matter in a real shop:

1. **A guillotine-valid breakdown** — every part separated from the stock by full straight cuts, so the plan can be executed on a panel saw, table saw with a straight edge, or track saw. [C10][C13][C14]
2. **A sequencable cut list** — numbered crosscuts/rips with positions, lengths, and the parts each cut frees.
3. **Purchasing guidance** — sheets by material/thickness and board feet for solid stock, net vs purchase.

It is **not** a CNC nesting guarantee. Free nesting can place parts at any angle and cut interior shapes; a saw cannot reproduce that. [C13][C14] The spec's "honest boundary" is correct and should appear in the UI and PDF: *a straight-cut plan for a panel saw; verify grain, kerf and sheet condition.*

Two different optimisation problems are often conflated:

- **Cutting-stock / bin-packing:** minimise material (or sheets) — NP-hard, and degenerate (many equal-waste solutions exist). [C10]
- **Sequencing:** minimise the number of cuts/handling operations. The cutting-stock literature treats minimum-pattern-count and minimum-knife-change as separate, harder objectives. [C10]

That literature is the reason the "fewest sheets vs fewest cuts" toggle is not a gimmick: they are genuinely different goals, and the spec's tie-break rules (sheets first, then waste, then cuts; or cuts first, then sheets, then waste) are sensible. The app should say so in one line.

---

## 3. Panel saw / guillotine breakdown vs CNC nesting

### 3.1 The three practical processes

| Process | What it can do | Typical sheet yield (claim) | Best for |
|---|---|---|---|
| **Table saw / track saw / vertical panel saw (guillotine)** | Straight through-cuts only; every cut splits the remaining piece; strip/row-based packing | **75–90%** on paper [C14]; row-based plans 85–92% claimed by a cutting-calculator vendor [C13] | Small shops, 1–30 parts, rectangular cabinet parts, jobs cut today |
| **Beam saw (NC panel saw)** | Straight cuts, stacked sheets (book heights), optimiser sequencing | Beam saw is claimed to improve yield 30–40% over a sliding table saw and reduce waste 4–6% in a production shop [C1] | Repeated runs, many sheets, production |
| **CNC router (nesting)** | Any-angle placement, curves, notches, interior cut-outs; vacuum hold-down | **85–95%** on paper [C14]; free nesting gains "a few percent" over row plans [C13] | 50+ parts/run, shaped parts, labour reduction, unattended cutting |

The key economic insight for a small shop (from a cut-planning vendor's worked example): a 5–15% paper yield gain from nesting only becomes money when it **removes a whole sheet from the purchase order**. In their example, 34 cabinet parts packed to 6 sheets at ~82% by guillotine, while an 88% CNC nest still needed 6 sheets because 4.9 sheets of part area ÷ 0.88 = 5.6, which rounds up. Same material cost; the gain was in labour and offcut size. [C14] For this app's owner, with straight rectangular cabinet parts and no CNC, the guillotine plan is the right default — and the app must not promise nesting-grade yield.

WOODWEB's flat-table CNC versus pod-and-rail/beam-saw thread makes the same split from the machine's point of view: a flat-table router is the nesting tool, while pod-and-rail machines and beam saws suit different production shapes and setups — so the choice is a workflow decision, not just a yield percentage. [C4]

**Note on the vendor numbers:** the 75–90% / 85–95% ranges and "5–15%" gap come from tool vendors and trade articles, not from a controlled study. Treat them as planning guidance, not guarantees. **Unverified.**

### 3.2 What changes when the customer has a CNC shop

The owner may hand DXF to a CNC shop. In that case the geometry in the CAD export remains part outlines; the cut plan is a saw plan. The app should say, on the plan page and in the PDF note:

> "This is a guillotine (panel-saw) breakdown. A CNC nesting shop may use fewer sheets; give them the DXF and the part list."

That is exactly the honest boundary in the spec, and it matches the trade reality that nesting software and saw optimisers consume different outputs (DXF/G-code vs a PDF cut sheet). [C14]

---

## 4. Geometry rules: kerf, trim, grain, cut counting

### 4.1 Kerf

Kerf is the width of material a saw removes — it depends on tooth set, blade plate, wobble and material, not just blade thickness. [C11] Practical values:

- table saw, full kerf ≈ **1/8" = 3.2 mm**;
- thin-kerf table saw ≈ **3/32" = 2.2–2.4 mm**;
- track saw standard blade ≈ **2.2 mm**;
- circular saw ≈ **3 mm**. [C16][C18]

The app currently uses **3 mm** as its default `sheetKerf`. Recommend making 3.2 mm the saw default (the common full-kerf blade) and offering 2.2–2.4 mm for thin/track blades. The engine's current geometry (pad each part by kerf, trim the outside) is correct in principle: a cut consumes kerf once between adjacent parts, and the trim cut comes before the first part measurement. [C16]

**Kerf is not trivial at sheet scale.** A 3.2 mm full-length cut across a 2420 mm usable sheet removes ≈ 7,744 mm² (≈77 cm²) of material. Twenty such cuts remove ≈ 0.155 m² — about 5% of a 4×8 sheet, before trim or offcuts. This is why cut count matters, and why a "fewest cuts" objective is legitimate.

**CNC:** the effective kerf is the cutter diameter. 3/8" (9.5 mm) and 1/2" (12.7 mm) compression bits are common for nested cabinet parts; the 3/8" bit "wastes less" and is chosen for yield, while 1/2" runs faster. [C19] If CNC cuts are planned, the kerf must be set to the bit diameter. A 1/4" (6.35 mm) bit is common for smaller or thinner parts — **shop practice, not verified from the opened sources**; confirm the bit you will actually run.

### 4.2 Trim

Trim removes the factory or damaged edge before measuring parts. CutListLab's guidance: trim reduces the usable sheet size and is not applied to offcuts; set it to zero when sheets are cut cleanly, and use it when edges are rough or damaged; kerf applies on top of trim. [C16] The spec's **10 mm per edge** is a reasonable shop default (20 mm off each sheet dimension) because 4×8 panels have real dimensional/squaring tolerances and handling damage. For CNC vacuum tables, a larger margin (15–20 mm) is often used so the sheet seals and clamps; that is **shop practice (unverified for specific machines)** and should be configurable, not baked in.

### 4.3 Grain and rotation

Grain-locked parts must not rotate. This is already in the spec and is the single biggest source of a plan that "nests" beautifully but cannot be built. The material model has `grain:true` and parts have `grain:'length'|'width'|'none'`; the plan must treat grain as a hard constraint, not a tie-break. Cut-plan tooling exposes exactly this switch (grain on = parts may not rotate) [C16]; the construction research covers which materials are grain-bearing (veneer-faced sheet goods, solid stock) versus non-grain (MDF, particleboard, melamine) — see `docs/RESEARCH-techniques.md` §10.

### 4.4 Cut counting — define it before comparing objectives

A "cut" in the spec is a straight through-cut: trim, rip or crosscut. For the plan to be honest:

- Count **full through-cuts** in the guillotine sequence (one per cut line), not blade lifts, not per part side.
- Count the trim cuts separately (`cuts.trim`) so the UI can show "84 cuts (4 trim)".
- Include the cut length so the operator knows the fence travel.
- Do **not** count saw-setup changes, sheet turns or blade changes as cuts; they are handling, not cutting. If the app later wants a "handling" metric, add it separately.
- Every cut must map to a piece boundary that yields at least one named part or a trimmed edge, or be a deliberate offcut-creating cut. This is how a validator can reconstruct the plan. [spec §3]

The spec's cut record (`seq/type/axis/position/length/width/piece/yields/note`) is therefore the right shape; keep position measured from the usable (trimmed) origin, as it says.

---

## 5. Formula and allowance table

This is the reference sheet for the engine. All lengths in mm unless noted; board feet in BF.

| Quantity | Formula | Notes / worked check |
|---|---|---|
| **Sheet usable area** | `(W − 2·T) × (H − 2·T)` | 1220 × 2440 sheet, T = 10 → 1200 × 2420 = 2,904,000 mm² = 2.904 m² |
| **Full-sheet area** | `W × H` | 1220 × 2440 = 2,976,800 mm² = 2.9768 m² |
| **Part area** | `L × W` (each placement) | rectangle parts only |
| **Yield (spec basis)** | `usedPartArea / fullSheetArea × 100` | Spec's `sheetAreaM2` example: 12 × 2.9768 = 35.72 m²; 25.93 used → 72.6% — includes trim, kerf and offcuts as "waste" |
| **Usable-area utilisation** | `usedPartArea / usableArea × 100` | Optional second figure; shows how much of the trimmed sheet is parts |
| **Kerf area per cut** | `kerf × cutLength` | 3.2 mm × 2420 mm = 7,744 mm² ≈ 77 cm² |
| **Trimming loss** | `2T(W + H) − 4T²` (approx.) | 4×8, T = 10 → ≈ 72,800 mm² ≈ 0.073 m²/sheet |
| **Offcut area** | `Σ(w × h)` of leftover rectangles | Each offcut is a rectangle after the cut sequence |
| **Offcut reusable** | `min(w,h) ≥ 150 && max(w,h) ≥ 300` | Spec default; shop evidence 6" × 12" minimum for rails [C17] |
| **Sheet count** | From the optimiser; purchase count = exact required (no spare) | Spec's rule is correct; spare sheet only as a note |
| **Board feet (app constant)** | `L_mm × W_mm × T_mm ÷ 2,359,737.2` | 2,359,737.216 mm³ = 144 in³; verified by [C12] |
| **Board feet (imperial)** | `W_in × L_ft × T_in ÷ 12` | AHEC formula [C21]; equivalently `W×L×T ÷ 144` with all inches |
| **BF check example** | 1000 × 100 × 19 mm part | 1,900,000 ÷ 2,359,737.2 = 0.805 BF |
| **Dressing factor** | `roughThickness ÷ finishedThickness` | 4/4 rough ≈ 25.4 mm; finished 19 mm → 1.337 (+33.7%) |
| **Surfaced thickness rule** | Nominal − 3/16" for ≤ 1.5"; − 1/4" for ≥ 1.75" | 4/4 → 13/16" ≈ 20.64 mm; 5/4 → 1-1/16" ≈ 27.0 mm [C21] |
| **Defect/cut allowance** | `purchaseBF = ceil(netBF × dressing × (1 + w))` | w = 15% default (spec); see §6 for why this is a *defect/cut* allowance, not the whole story |
| **Combined allowance (single percentage)** | `purchaseBF = ceil(netBF × (1 + a))` | If not modelling rough thickness: `a ≈ 35%` default for 4/4 → 19 mm; expose 20–60% |
| **Nominal vs net board feet** | Supplier may bill rough/nominal BF; dressed tally can be lower | Shops report ~7% shrinkage from green to KD, plus 10–15% straightline/ripping loss [C3][C20]; AHEC net vs green tally [C21] |

**Defining "yield" matters.** The spec's formula uses full sheet area, so trim (2.904/2.9768 = 97.6% of sheet) plus kerf plus offcuts all count as "waste". That is defensible and conservative, and it is what a shop compares to the sheet price. Label it "yield vs full sheet" and optionally show "usable-area utilisation" beside it so a 73% yield is not misread as a bad nest when 3% is trim.

**Worked sheet example (for the test suite).** 4×8 18 mm sheet, trim 10 mm, kerf 3.2 mm. Suppose the plan places 9 parts totalling 2.10 m² and produces 4 offcuts totalling 0.52 m². Full sheet 2.9768 m²; yield = 2.10/2.9768 = 70.5%. Usable area 2.904 m²; utilisation = 72.3%. Remaining area is trim (≈0.073 m²), kerf strips, and small waste (≈0.28 m²). The engine's invariant should be: placements + offcuts + kerf area + trim area + residual waste = full sheet area (within rounding).

---

## 6. Solid-wood purchasing: board feet, dressing and waste

### 6.1 Board-foot conventions the app must not blur

- A board foot is **1 ft × 1 ft × 1 in = 144 in³** (2.359737216 L), i.e. `W_in × L_ft × T_in ÷ 12`. [C12][C21]
- Hardwood is measured and graded in **nominal/rough dimensions**. Rough lumber is measured at its full sawn size; surfaced lumber is still bought on nominal thickness (a "4/4" board is billed as 1 in thick even after planing). [C12][C21]
- **Kiln-dried net tally vs green/gross tally:** net tally is the board feet after drying; green tally is before drying and the buyer can expect about **7% less** board feet after kiln drying. [C21][C3]
- **Surfacing rule:** for lumber 1½" and under, standard finished thickness is nominal minus **3/16"**; for 1¾" and over, minus **1/4"**. So 4/4 → **13/16" ≈ 20.64 mm**; 5/4 → 1-1/16" ≈ 27.0 mm. [C21] This is the *surfaced* thickness the mill delivers, not the 19 mm a cabinetmaker planes to.
- **Supplier practices vary:** some yards tally dressed lumber on the rough board footage and add a straightline-ripping charge (a reported example: 10.6 BF charged for a board whose nominal count was under 10 BF, explained as "×115% for straightlining"), and shops report 10–15% losses from straightline ripping and kiln/planing. [C20] Ask for the tally basis, and do not compare board-foot prices without it.

**App implication:** the engine computes `netBoardFeet` from **finished part volumes**. That number is a *net finished-volume* figure, not what the yard will invoice. Label it clearly ("net finished board feet") and compute purchase board feet with explicit allowances (§6.3). Never present net BF as a purchase quantity.

### 6.2 How much solid wood does a shop actually need?

Evidence on solid-wood yield is strong and consistent: the USDA rough-mill guide's worked examples and baseline use yields from **38% to 60%** for furniture/cabinet dimension parts, depending on lumber grade, cutting bill and operator skill. [C9] The USDA rough-mill guide gives worked examples at 38% and 53% yields and discusses a 60% yield baseline; the point of yield improvement is that a 1% gain pays back quickly on lumber cost. [C9] Research on No. 3A Common red oak found part yields varying by cutting bill and rough-mill method, with shorter/narrower parts improving yield. [C8] Gatchell's paper explains that lumber grade, cutting bill and operator efficiency are the three dominant yield factors, and that the percentage of clear face guaranteed by the grade sets the ceiling. [C7]

At the small-shop end, WOODWEB practitioners use **waste factors of 1.5–2× net** for random-width lumber, plus **10–15%** for straightline ripping, plus **15%** for ripping to width and **10%** for cutting lengths; one worked example went from 493 usable feet to 666 BF, i.e. **+35%**. [C6][C3] Another thread notes a supplier's R1E loss of 10–25% and a guarantee of ≤7% for straightline ripping one edge. [C3]

These numbers are not contradictory once you separate the stages:

| Stage | What it removes | Typical allowance | Evidence |
|---|---|---|---|
| Kiln drying | moisture shrinkage | ~7% (green → KD) | [C21][C3] |
| Surfacing (planing) 4/4 → 13/16" | thickness | ~18.7% of thickness already gone by the mill; further planing to 19 mm removes another ~8% | [C21] |
| Straightline ripping / squaring | edge waste | 10–15% | [C3][C6][C20] |
| Ripping to width | width waste | ~15% | [C6] |
| Crosscutting and defects | length/defect waste | 10% + grade-dependent | [C6][C7] |
| Yield from rough lumber to parts | all of the above | 38–60% overall (i.e. 67–163% extra) | [C9] |

For Cabinet Studio's owner — a small shop buying a few boards, not a rough-mill line — the practical purchase rule is: **buy the finished volume plus the dressing factor plus 10–20% for defects/end trim**, and add more for lower grades, figured wood or long clear requirements. The app should show *net* and *purchase* board feet side by side; the shop decides the grade and the extra.

### 6.3 The 15% spec allowance: keep it, but make it a defect/cut allowance

The spec sets **`solidStockWastePct = 15`** and computes `purchaseBF = ceil(netBF × 1.15)`. That is **too low as a total allowance for 4/4 rough stock**, because the board-foot unit is nominal 1" thick and the finished part is 19 mm:

- Net finished volume: `netBF`.
- Dressing factor for 4/4 rough → 19 mm: `25.4 / 19 = 1.337` (**+33.7%**).
- Defect/cut allowance 15%: `× 1.15`.
- Purchase: `netBF × 1.337 × 1.15 = netBF × 1.538` (**+53.8%**).

For the spec's example of 25.4 net BF this gives **40 BF**, not 30 BF:

`ceil(25.4 × 1.337 × 1.15) = ceil(39.05) = 40 BF`

If the shop buys **surfaced 13/16" (20.64 mm)** stock and planes to 19 mm, the dressing factor drops to `20.64/19 = 1.086`, giving `ceil(25.4 × 1.086 × 1.15) = ceil(31.72) = 32 BF`. If it buys exact 3/4" stock, the spec's 15% is fine (`ceil(29.21) = 30 BF`). If it buys 4/4 for a finished 19 mm part, 30 BF is a guaranteed shortfall.

**Recommendation to the engine/Lead (spec correction):**

1. Keep `solidStockWastePct` **15%**, but define it as the *defect/cut* allowance, not the total allowance.
2. Add `roughThicknessMm` to solid materials or to the solid-stock settings (4/4 = 25.4 mm; 5/4 = 31.75 mm; or the surfaced thickness if buying S2S, e.g. 20.64 mm).
3. Compute `purchaseBF = ceil(netBF × (roughThicknessMm / finishedThicknessMm) × (1 + wastePct/100))`.
4. If the engine cannot model rough thickness in v1, use a **single default allowance of 35%** (4/4 → 19 mm with ~1% rounding room) rather than 15%, expose the field, and say on the UI: "includes dressing from rough 4/4; lower it if you buy surfaced stock."

This is the most important numeric correction in this report. The 15% figure is a sensible defect/cut margin; it is not a rough-to-finished allowance.

### 6.4 What the board-foot number should show

The purchase table should show, per material:

- **Net finished BF** (sum of part volumes; label as "finished parts").
- **Allowance %** and **purchase BF** (rounded up).
- Basis note: rough thickness used for dressing (4/4, 5/4, S2S 13/16, etc.), and whether the allowance includes defects.
- Quantity in whole board feet; optionally "≈ N boards of 8 ft × 6 in" for the yard (shop practice; board widths are random so this is an estimate only).
- A caution line: "Board feet are nominal; random widths/grades vary. Check the tally basis with your lumberyard. [C20][C21]"

Do not compute board feet from **sheet** sizes or from linear feet; the spec correctly says solid stock is not nested.

---

## 7. Offcut management and reuse

### 7.1 The threshold

The spec's **150 × 300 mm** reusable threshold is confirmed by shop practice: a Fine Woodworking thread on which cut-offs to keep gives **6" × 12" × 3/4"** as the minimum that makes it into bins because it is "eligible for rails". [C17] A 6 × 12 in piece is 152 × 305 mm. That is the same size class as the app's default.

Recommendation:

- `reusable = (min(width,height) ≥ 150 && max(width,height) ≥ 300)`. Keep the spec's two-axis rule; do not reduce it to area alone (a 100 × 900 strip has area but is not a useful cabinet blank).
- Optionally add a second tier for "small parts" (e.g. 100 × 200 mm) only if the owner wants to track it; otherwise count it as waste. CutListLab exposes the minimum offcut as a single short-side threshold with the rest counted as waste — a simpler UI that works. [C16]
- Tag each reusable offcut with material, thickness, grain direction, sheet index and date; that is what makes it findable later. [C5][C2]
- **Do not auto-credit offcuts against the purchase quantity.** The plan should say "these offcuts could cover small parts in a future job", not "buy one fewer sheet". Offcut inventory is only real if the shop tracks it; professional shops report that the cost of managing an offcut inventory often exceeds the value for cheap materials, and that large pieces are worth tracking while small MDF/melamine pieces are not. [C2] The same thread notes that if someone uses an offcut without recording it, the optimiser's inventory is wrong. [C2]

### 7.2 Offcut economics for presentation

A useful UI rule (shop practice, supported by the thread): show the reusable offcut count and total area per material, but **treat the value as a future option**, not as a discount. If the app later adds an offcut inventory, it should allow "optimise using existing offcuts" as an explicit mode, never silently.

A practical offcut budget for a kitchen run: most 4×8 sheet plans produce a handful of usable offcuts (drawer bottoms, shelf strips, stretchers), and a shop that does not store them will throw them away. The printable offcut list/tags in the spec are the right feature; keep the list short (e.g. top 10 by area per material) so the shop floor uses it.

---

## 8. What a useful shop cut plan must say

The spec's output contract is close; this checklist is what a cabinetmaker actually needs at the saw:

**Headline / purchase**

- [ ] Material plan summary: sheets by material/thickness, total yield, saw-cut count, offcut count/area, solid BF net vs purchase.
- [ ] Purchase list with exact quantities (sheets, board feet), unit, and a note that no spare sheet is included.
- [ ] Objective used (fewest sheets / fewest cuts) and a one-line reason for the plan.
- [ ] Kerf and trim assumptions, and the blade/bit profile they correspond to.

**Per sheet**

- [ ] Sheet number, material, thickness, sheet size, grain direction.
- [ ] Visual layout **and** the numbers: yield, cut count, offcut list.
- [ ] Numbered cut sequence: step, type (trim/crosscut/rip), axis, fence/position, cut length, what it frees (part labels), note. The sawyer should be able to work top-to-bottom without re-reading the drawing.
- [ ] Part labels matching the cut list and the part balloons (`B1-03` etc.), with final size; if a part is cut oversize for later machining, say so (the spec doesn't do oversize in v1; CutListLab exposes it as a separate setting, which is a good future option). [C16]
- [ ] Offcuts: dimensions, area, reusable flag, material/grain tag.
- [ ] Warning if any part is unplaced or if the sheet is only partially usable (e.g. leftover strip too small to count).

**Across the plan**

- [ ] How the plan was created: "guillotine/straight-cut plan for panel saw or table saw; not a CNC nest" — the spec's honest boundary.
- [ ] Measurement note: dimensions govern, not the drawing (common shop convention; print at a stated scale, but never scale from the picture). [C15]
- [ ] A small 3/4-view sketch or part orientation reference is what makes a paper cut list usable in a furniture context; for cabinet part lists the per-part drawings carry this, but the nesting pages should keep the part-number labels. [C15]
- [ ] Solid-wood note: net vs purchase BF, allowance basis, and "check board widths/grades; board feet are nominal". [C20][C21]

---

## 9. Presenting the “fewest sheets vs fewest cuts” trade-off

### 9.1 What the two objectives actually change

- **Fewest sheets** minimises material: smaller layouts per sheet, more parts per sheet, more cuts (more strips/rows and more rips), possibly more handling. It is the default because sheet goods are usually the largest single material cost and the spec's tie-break (fewest sheets, then least waste, then fewest cuts) is defensible. [spec §2]
- **Fewest cuts** minimises saw operations: larger/simpler strips, fewer cuts, but it may use an extra sheet or accept more waste. In a small shop the arithmetic is familiar: an extra 3/4" sheet is a real material cost, while 20 fewer cuts saves handling time — which one dominates is the shop's call (the data model has no prices). This trade-off is real and is why the toggle exists; the cutting-stock literature treats pattern count and sequencing as separate objectives. [C10]
- The vendor guide's rounding insight is worth surfacing: a small yield gain often does not change the sheet count; what matters is whether the plan crosses a whole-sheet boundary. [C14]

### 9.2 Recommended UI/PDF presentation

1. **Show both results even when one is selected.** E.g. under the objective toggle: "Fewest sheets: **12 sheets · 84 cuts** · 72.6% | Fewest cuts: **13 sheets · 61 cuts** · 68.1% (+1 sheet, −23 cuts)." This makes the trade-off legible without making the user re-run a plan. The spec's live re-resolve is right; adding the alternative as preview text is a cheap improvement.
2. **Default to fewest sheets**, with the explanation "least material; usually the cheapest for sheet goods". The spec already defaults this way.
3. **Explain the difference in one sentence**, not a modal: "The fewest-cuts plan uses larger strips and one more sheet, saving 23 saw cuts." If the two objectives produce the same sheet count/plan, say "Both objectives give the same plan."
4. **Warn when the chosen objective is dominated**: if fewest cuts uses more sheets and the extra material costs more than the saved cuts at the app's defaults (no prices in the data model), phrase it as "+1 sheet for −23 cuts; your call" — never pretend to know prices. (The spec excludes material cost from the data model, so the app should not invent a break-even.)
5. **Rounding note when yield improves but sheets do not change**: "The layout is 4% tighter on paper; it still needs the same 12 sheets."
6. **Purchase quantities are exact by objective**: the purchase table follows the selected plan; the spare-sheet idea is a note only. The spec says this and it is right.
7. **Use the honest boundary on both UI and PDF**: "Panel-saw plan (guillotine); a CNC nest may differ." [C13][C14]

### 9.3 Suggested copy tone

- Objective control label: "Optimize for" → "Fewest sheets" (helper: "least material") / "Fewest cuts" (helper: "simplest cutting, may use more sheets").
- Result line: "12 sheets · 72.6% yield · 84 saw cuts (4 trim)".
- Trade-off line: "Fewest cuts: 13 sheets · 61 cuts · +1 sheet / −23 cuts".
- Offcut line: "Reusable offcuts: 14 (1.8 m²) — print tags; offcuts are not deducted from the purchase."
- Solid line: "Hard maple 4/4: 25.4 bf finished → 40 bf to buy (dressing 4/4→3/4 + 15% for defects/end trim)".
- Boundary: "Straight-cut plan for a panel saw or table saw. Verify grain, blade kerf and sheet condition before cutting."

---

## 10. Risks and mitigations

| Risk | What goes wrong | Mitigation / app behaviour |
|---|---|---|
| Grain direction | Parts rotated against the face grain; visible mismatch on doors/shelves | Hard constraint from `grain` flags; show grain arrow on the sheet diagram; refuse to rotate locked parts [C15][techniques §10] |
| Sheet thickness tolerance | Nominal 18 mm sheet is 17.85 mm (23/32 CAT) or another class; joinery/edge-banding fits wrong | Use actual material thickness in geometry; show thickness tolerance in the material note; trim/kerf unaffected but part fit changes [C22][C23] |
| Sheet squareness/dimensions | 4×8 sheet can be +0/−1.6 mm on length/width and ±3.2 mm squareness on the GP class | Trim 10 mm per edge; measure the first sheet; don't assume 1220×2440 exactly [C22] |
| Kerf mismeasure | Last parts come out short; plan over/under-packs | Offer kerf profile presets and a "measure your blade" hint (cut a test piece, measure both halves, subtract) [C16]; default 3.2 mm full kerf [C18] |
| Trim omitted | Damaged/rough edges become part edges | Default 10 mm; expose 0 for clean factory-cut sheets; note trim is not applied to offcuts [C16] |
| Blade wander / squaring | Parts not square even though layout is right | Plan assumes straight, square cuts; note "check the saw fence and blade" (shop practice); keep a squareness note in the plan |
| Offcut inflation | Offcuts counted as value but never used | Report reusable area, don't deduct from purchase; tag material/grain; treat as future option [C2][C5] |
| Solid-wood grade/defects | 15% allowance buys too little; knots/checks in clear parts | Add dressing + defect allowance; show net vs purchase; recommend extra for lower grades/figured stock; inspect/grade at the yard [C9][C21] |
| Board-foot tally disagreements | Yard bills rough/nominal BF and straightline fees; buyer gets less than expected | Show net vs purchase BF, note tally conventions (net vs green −7%, R1E losses 10–15%) [C20][C21][C3] |
| CNC nesting claims | UI over-promises sheet savings; owner hands plan to a CNC shop expecting it to match | Label plan as guillotine; CNC may differ; no nesting guarantee [C13][C14] |
| Measurement/typing errors | Wrong part list → wrong plan | Keep the existing checks; show part dims on the plan; dims govern, not the drawing [C15] |
| "Fewest cuts" hides material cost | User picks fewer cuts and buys an extra sheet unknowingly | Show both objective outcomes and the delta; default fewest sheets [C10][C14] |

---

## 11. Recommendations to the spec / engine

Numbered, in priority order for the Lead and the engine working in parallel:

1. **Solid-wood allowance (must fix).** Keep `solidStockWastePct = 15` as a *defect/cut* allowance, add `roughThicknessMm`/`dressingAllowance` to solid materials or solid settings, and compute `purchaseBF = ceil(netBF × rough/finished × (1 + waste/100))`. If not modelling rough thickness in v1, **change the single default to 35%** and label it. Spec's example (25.4 net BF → 30 BF at 15%) becomes 40 BF for 4/4 rough, 32 BF for S2S 13/16". This is the one change that prevents a real material shortfall. [C21][C9][C3][C6]
2. **Kerf profile, not a single number.** Add `kerfProfiles`: `tableSawFull: 3.2`, `tableSawThin: 2.4`, `trackSaw: 2.2`, `panelSaw: 3.2`, `cnc_6mm: 6.35`, `cnc_9_5mm: 9.5`, `cnc_12_7mm: 12.7` (mm). Default the saw plan to 3.2; keep 3.0 as a round metric fallback only if the UI says so. [C16][C18][C19][C11]
3. **Trim semantics.** Keep 10 mm default per edge; add 0 (clean sheets) and 15–20 mm (damaged edges / CNC vacuum) options. State in the plan note that trim is removed before the first part and applies to the sheet, not to offcuts. [C16]
4. **Offcut threshold.** Keep 150 × 300 mm (confirmed by 6" × 12" shop practice) as a two-dimension test; add material/thickness/grain/date tags to the offcut record; do not subtract offcuts from purchase. [C17][C16][C2]
5. **Board-foot formula and labels.** The constant 2,359,737.2 is correct (144 in³). Label `netBoardFeet` as "net finished board feet"; add a `nominalPurchaseBoardFeet` figure (with allowance) and a note on nominal/rough tally conventions. [C12][C21][C20]
6. **Cut counting definition.** Count full through-cuts; trims separate; every cut maps to piece boundaries or a deliberate offcut; no lifted-blade/per-part counting. Include cut length and a "total cuts" roll-up per sheet and per material. [C10][spec §3]
7. **Objective presentation.** Keep the two objectives and the spec's tie-breaks; show both outcomes and the delta; default fewest sheets; one-line explanation; no invented material prices. [C10][C14]
8. **Purchase quantities.** Exact sheets/board feet for the selected plan; optional spare sheet as a separate note only; do not add spares to the required count. [spec §3]
9. **Honest boundary.** Label the plan "guillotine/straight-cut, panel saw or table saw"; add "CNC nesting may differ; DXF is available for a CNC shop". Do not promise nesting-grade yield. [C13][C14]
10. **Yield warnings.** Warn below 60%, note 60–70%, flag above 95% as suspicious (likely wrong kerf/trim/grain or bad sheet size), show "yield vs full sheet" and optionally "usable-area utilisation". [C14][C16]
11. **Offcut list UX.** Keep per-sheet offcuts with size/reusable flag; also give one aggregated printable offcut list per material (top N by area) so the shop can tag and store them; mention the cost/benefit of tracking only expensive/large pieces. [C5][C2]
12. **Sheet choices.** Support 1220×2440 (default), 1525×1525 Baltic birch, and 49×97 / 4×10 where the user buys them; a different sheet size changes the plan and must re-resolve. [C22]
13. **PDF/plan pages.** Per sheet: number, utilisation, cut count, numbered sequence, offcuts; plus the material-plan block and the boundary note. Keep dimension text authoritative; paginate long sequences without clipping. [spec §5]
14. **Future (not v1):** oversize/rough-cutting allowance per part (CutListLab's "oversize" setting), offcut inventory as an explicit optimisation input, and a handling/setup metric separate from cut count. [C16][C2]

---

## 12. Open questions and unverified claims

1. **Vendor yield ranges.** The guillotine 75–90%, CNC 85–95%, "5–15% better" and "85–92% row plans" figures come from optimisation-tool vendors [C13][C14] — planning guidance, not measured guarantees. **Unverified as universal values.**
2. **Beam-saw yields.** The claim that a beam saw improves yield 30–40% over a sliding table saw and reduces waste 4–6% [C1] is a shop claim in a WOODWEB thread; the exact basis is not given. **Unverified.**
3. **Rough-mill yields.** The USDA yield range 38–60% applies to furniture/cabinet dimension parts from graded lumber under specific cutting bills and mill practices [C9][C7][C8]; a small shop buying select-and-better S2S with simple rectangular parts should obtain better than a rough mill's average, so the app's allowance must stay user-adjustable. The exact figure for this owner's material is **unknowable without their lumber and cutting bill**.
4. **Offcut threshold.** 150 × 300 mm matches reported shop practice (6" × 12") [C17] but is not a standard. CutListLab treats the minimum offcut as a single configurable short-side threshold [C16]; the app's two-dimension test is stricter and fine. **Shop practice.**
5. **Trim values.** 10 mm is shop practice; 0 is right for clean factory-cut sheets [C16]; CNC hold-down margins vary by machine and vacuum. **Unverified for CNC specifics.**
6. **Board-foot tally.** Yards differ on net/green tally, straightline charges and rounding; NHLA grading rules are sold as a book and were not opened in full (AHEC's public summary is cited instead). The app should not claim a specific tally convention. [C20][C21]
7. **Kerf.** Full-kerf 1/8" and thin-kerf 3/32" are well established [C18]; actual kerf varies with the blade, saw and material [C11]. The app must let the user measure and override.
8. **Cut-sequence optimality.** The spec asks for a deterministic, understandable guillotine plan, not a mathematically optimal solution. "Fewest sheets" is NP-hard in general [C10]; the engine's heuristic candidates are acceptable if they are deterministic, valid, and labelled as a plan (not an optimum).
9. **Sheet tolerance.** GP's published performance categories and tolerances are for their sanded plywood class [C22]; other products (Baltic birch, MDF, melamine PB) have their own tolerances, and the app's material notes should carry them rather than assume one class.

---

## 13. Bibliography

All sources opened 2026-11-15. Keys `[C#]` are used inline.

**Shop practice and trade sources**

- **[C1]** *Machinery Dilemma: CNC or Beam Saw?* WOODWEB Knowledge Base (2005). https://www.woodweb.com/knowledge_base/Machinery_Dilemma_CNC_or_Beam_Saw.html — kind: shop. Accessed 2026-11-15.
- **[C2]** *Material Utilization*. WOODWEB Knowledge Base (2011). https://www.woodweb.com/knowledge_base/Material_Utilization__760961.html — kind: shop. Accessed 2026-11-15.
- **[C3]** *Yield Loss in Ripped-One-Edge Lumber*. WOODWEB Knowledge Base (2007). https://www.woodweb.com/knowledge_base/Yield_Loss_in_RippedOneEdge_Lumber.html — kind: shop. Accessed 2026-11-15.
- **[C4]** *Flat-Table CNC Versus Pod and Rail or Beam Saw*. WOODWEB Knowledge Base. https://www.woodweb.com/knowledge_base/FlatTable_CNC_Versus_Pod_and_Rail_or_Beam_Saw.html — kind: shop. Accessed 2026-11-15.
- **[C5]** *Plywood Offcut Organizing Systems*. WOODWEB Knowledge Base (2008). https://www.woodweb.com/knowledge_base/Plywood_Offcut_Organizing_Systems.html — kind: shop. Accessed 2026-11-15.
- **[C6]** *Figuring Rough Stock for Moulding Manufacture*. WOODWEB Knowledge Base (2008). https://www.woodweb.com/knowledge_base/Figuring_Rough_Stock_for_Moulding.html — kind: shop. Accessed 2026-11-15.
- **[C11]** *Saw* (kerf definition and measurement). Wikipedia. https://en.wikipedia.org/wiki/Kerf — kind: reference. Accessed 2026-11-15.
- **[C13]** *Guillotine vs Free Nesting: How Sheet Cutting Really Works*. NestingCalc. https://nestingcalc.com/guides/guillotine-vs-nesting/ — kind: trade. Accessed 2026-11-15.
- **[C14]** *CNC Nesting vs Manual Cut Lists: Complete Comparison Guide*. CutPlan (Guy Bader, 2026). https://cutplan.ai/en/blog/cnc-nesting-vs-manual-cut-list.html — kind: trade. Accessed 2026-11-15.
- **[C15]** Hank Gilpin, *The Illustrated Cutlist*, Fine Woodworking #273 (Jan/Feb 2019). https://www.finewoodworking.com/membership/pdf/261995/011273055.pdf — kind: publication. Accessed 2026-11-15.
- **[C16]** *Settings* (saw kerf, minimum offcut, trim, oversize). CutListLab manual. https://cutlistlab.com/manual/settings.html — kind: trade (small-shop tool documentation). Accessed 2026-11-15.
- **[C17]** *Cut-offs...which to keep?* Fine Woodworking forum (2005). https://www.finewoodworking.com/forum/cut-offs-which-to-keep — kind: shop. Accessed 2026-11-15.
- **[C18]** *Kerfing Saw Blade: Full vs. Thin Kerf (+ Bending Spacing)*. Woodworking Advisor. https://woodworkingadvisor.com/kerfing-saw-blade/ — kind: trade/publication. Accessed 2026-11-15.
- **[C19]** *Compression Bit Size: What's Best*. WOODWEB Knowledge Base (2005). https://www.woodweb.com/knowledge_base/Compression_Bit_Size_Whats_Best.html — kind: shop. Accessed 2026-11-15.
- **[C20]** *Lumber Tally: Rough Versus Milled*. WOODWEB Knowledge Base (2012). https://www.woodweb.com/knowledge_base/Lumber_Tally_Rough_Versus_Milled.html — kind: shop. Accessed 2026-11-15.

**Standard, government and manufacturer documents**

- **[C7]** Charles J. Gatchell, *Rethinking the Design of the Furniture Rough Mill*. USDA Forest Service, Northeastern Forest Experiment Station (1987). https://www.fs.usda.gov/ne/newtown_square/publications/other_publishers/OCR/ne_1987_gatchell001.pdf — kind: government. Accessed 2026-11-15.
- **[C8]** Brian P. Shepley, Jan Wiedenbeck, Robert L. Smith, *Opportunities for Expanded and Higher Value Utilization of No. 3A Common Hardwood Lumber*. USDA Forest Service, Northeastern Research Station (2004). https://www.fs.usda.gov/ne/newtown_square/publications/other_publishers/OCR/ne_2004_shepley001.pdf — kind: government. Accessed 2026-11-15.
- **[C9]** Philip H. Mitchell, Jan Wiedenbeck, Bobby Ammerman, *Rough Mill Improvement Guide for Managers and Supervisors*, General Technical Report NE-329. USDA Forest Service, Northeastern Research Station (2005). https://www.fs.usda.gov/ne/newtown_square/publications/technical_reports/pdfs/2005/ne_gtr329.pdf — kind: government. Accessed 2026-11-15.
- **[C10]** *Cutting stock problem*. Wikipedia (definitions, guillotine restriction, 2-D problem, NP-hardness, minimum-pattern objectives). https://en.wikipedia.org/wiki/Cutting_stock_problem — kind: reference. Accessed 2026-11-15.
- **[C12]** *Board foot*. Wikipedia (144 in³; nominal vs surfaced measurement). https://en.wikipedia.org/wiki/Board_foot — kind: reference. Accessed 2026-11-15.
- **[C21]** *Grading sawn lumber — Measurement* (board foot formula, surface measure, standard rough/surfaced thicknesses, net vs green tally). American Hardwood Export Council. https://americanhardwood.org/en/node/138 — kind: standard/trade reference. Accessed 2026-11-15.
- **[C22]** *Plytanium sanded AC & BC plywood specifications* (performance categories 23/32 CAT = 0.703" / 17.85 mm; length/width tolerance +0/−1.6 mm; squareness ±3.2 mm; 4×8 sheets). Georgia-Pacific Wood Products LLC. https://www.buildgp.com/wp-content/uploads/2018/10/georgia-pacific-plytanium-sanded-specifications-pdf.pdf — kind: manufacturer. Accessed 2026-11-15.
- **[C23]** *Panel Thickness Tolerances and Labeling* (APA Technical Topic TT-054, revised 2013). APA — The Engineered Wood Association. https://www.apawood.org/guides-tools-training/technical-document-library/technical-topics/panel-thickness-tolerances-and-labeling/ — kind: standard/reference. Accessed 2026-11-15.

**Internal project references (not counted as external sources):** `docs/CUT-PLANNING-SPEC.md`, `docs/RESEARCH-techniques.md` (materials, sheet sizes, grain, edge banding), `docs/RESEARCH-UI-FLOW.md` (UI copy patterns).

