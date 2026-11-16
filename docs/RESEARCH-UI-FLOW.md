# Guided UI flow and standard presets — research report

> **Lead note (2026-11-15, after implementation):** the report's 7-step recommendation was
> implemented first as **8 steps** (Fronts split into **Layout** and **Front style**), then extended
> to **9 steps** with a **Build** step between Size and Layout. The Build step exposes the researched
> carcass joints, sheet-goods panel/thickness, backs, toe kicks and face-frame joints that were
> previously only in the Advanced editor; see `docs/BUILD-METHODS.md` and `docs/UX-REDESIGN.md` §3.
> The research findings, copy principles and presets remain as written.

**Project:** Cabinet Studio, a local HTML shop-drawing generator for a serious hobbyist / small-shop cabinetmaker.
**Report date:** 2026-11-15. **Companions:** `docs/UX-REDESIGN.md` (the spec this report feeds), `js/data/presets.js` (machine-readable presets), `docs/RESEARCH-techniques.md` (construction research).
**Scope of this report:** the guided Design flow (run overview + 7-step cabinet wizard) and the North American / European presets that seed it. The other four tabs are out of scope except where their density affects the shell.

---

## 0. How to read this report

Every recommendation below carries a citation key resolved in §11. Sources were opened on **2026-11-15**. Source kinds:

- **research** — UX research/guidance from Nielsen Norman Group, Baymard, W3C WAI, Laws of UX.
- **pattern** — an official design-system pattern (GOV.UK Design System) intended for reuse.
- **publication** — a magazine, trade publisher or measured review (kitchen trade, planner reviews).
- **competitor** — a live commercial kitchen planner/design tool or its public planner guide, assessed from its own published material.
- **standard** — a normative document or official association standard (WCAG, KCMA, NKBA, DIN EN 1116).
- **manufacturer / trade** — a cabinet or hardware maker's own data, or a trade supplier's sizing guide.
- **shop** — recorded professional practice, not a published standard; labelled **shop practice**.

Claims I could not verify from an opened source are marked **unverified**. Some planning tools (IKEA's live planner, Lowe's virtual room designer) blocked automated access; where I cite them it is through a published review that describes the tool, and I say so. The structure of this report is deliberately narrow: what the evidence says, what it means for this app, and the exact changes to the spec.

---

## 1. Recommendation in one page

The current Design tab is a **professional editor presented as the first screen**. The guided redesign is the right move and the spec's 7-step shape is sound. Five changes materially improve it:

1. **Make every step answer one question, and label the button with the next answer, not "Next".** The spec's steps already do this; the copy needs to carry it ("How wide is the space?" → "Use 30 in" / "Continue to front style"). [R1][R2][R3]
2. **Preselect the standard and the size from the project units + run, and say why.** Defaults are the product for a first-time user; NN/g's warning is that users almost never change them, so they must be right, visible and explained. [R4][R5]
3. **Keep the run context visible in every step** — wall length, remaining run, counter height. The current editor has no run concept, so each cabinet is an object rather than progress. [R6][R7]
4. **Review must be a check-answers page with per-row Change links**, not just a summary card; and warnings should be grouped/filtered, not counted. [R8][R9]
5. **Fix the preset numbers before shipping.** The spec's European preset has an internal contradiction (100 mm plinth + 900 mm counter cannot both hold with a 720 mm carcass). The researched values are 150 mm plinth, 870 mm base height, 900 mm worktop (15 cm plinth + 72 cm carcass + 3 cm top). Full correction table in §8. [R24][R25][R26][R27]

The 7-step order (**Space → Standard → Box → Size → Fronts → Inside & finish → Review**) is recommended as-is, with the Step 2 reframing and the Review change links described in §7.

---

## 2. What is wrong with the current Design tab

The screenshots in `docs/screenshots/` show a 1440 × 900 desktop with three panes: a 320 px cabinet rail, a centre preview + warnings column, and a ~370 px inspector. The shell (tabs, header, typography, preview quality) is good. The problems are workflow problems, not visual-polish problems.

### 2.1 The first decision is buried

Opening the app to a sample project shows a 7-cabinet rail, a preview, ten expanded checks, and an inspector whose visible top is *identity fields* (Tag, Name, cabinet type, notes) followed by three dimension fields and a standard-size strip. The choice a new user actually wants to make — "what kind of cabinet next" — is three small buttons at the top of a side rail, the same visual weight as everything else, while the inspector presents roughly twenty controls before the construction section is even reached. This is the textbook case for progressive disclosure: the initial display should contain the few most important options and defer the specialised ones behind an explicit door. NN/g's guidance is direct: show only a few important options first, and let users ask for the specialised set. [R1]

### 2.2 The editor assumes the mental model of an expert

A novice cannot evaluate "Frameless (European / full access)" vs "Face frame", or "Confirmat" vs "Pocket screw" vs "Dado + screw", before they have decided whether they are building a base or a wall cabinet. Wizards exist precisely for occasional processes where the user lacks domain expertise; they let the computer control the flow, which is a feature, not a constraint. [R2] The current screen does the opposite: it hands over control of ~60 options at once. Hick's law explains the cost — decision time rises with the number and complexity of choices [R10] — and configurator practice says the most common mistake is presenting every option simultaneously. [R11]

### 2.3 There is no "run"

The rail lists B1–B4, W1–W2, T1, but nothing represents the wall, the gaps, or the remaining length. The user is assembling a pile of boxes, not filling a kitchen. The spec's Mode A fixes this with a proportional run strip and a remaining segment; the current design should be judged as "pre-run-context". [R6]

### 2.4 Warnings dominate without organising

The centre column has a **Checks (10)** header and three warnings visible, each with a "Go to B2" link (good) but all expanded. Ten simultaneous warnings on a sample project is a lot of red for a first-run experience, and the count badge reads as a problem rather than a checklist. Better: group by severity/cabinet, show at most three, and make "See all checks" a link. The spec already proposes top-3 plus "see all"; this report adds severity grouping and inline "fix" actions. [R8][R9]

### 2.5 Duplicate/ambiguous status

The header already says "✓ 7 cabinets · 166 parts · 12 sheets", the tabs repeat counts (Design 7, Cut list 12, Assembly 15), and the preview footer repeats "30 parts". The numbers are useful, but three parallel counters with no labels teaching what they mean is noise. Keep one project-level summary in the header, keep tab counts only where they are actionable, and make the wizard preview's "12 parts · 2 sheets" read as context ("this cabinet will add ~12 parts"). [R5][R12]

### 2.6 The inspector is an excellent Advanced editor — and only that

Nothing in the inspector is wrong: it is complete, labelled, grouped and shows live resolved values (interior width, front height, carcass depth). It is exactly the right second door behind "Advanced editor" in the spec. The critique is where it sits, not what it contains. The spec's progressive-disclosure model (guided by default, inspector one click away) is the correct architecture. [R1][R13]

### 2.7 Keep these strengths

- The preview is immediate, zoomable, and shows a real front elevation with dimensions; configurator research says instant visual feedback is not a nice-to-have, it is how users trust the result. [R11]
- The checks are already actionable with cabinet tags and fix suggestions; the technique library has search + filters and cites sources; the app is local/offline with no network requests. Keep all of this.
- The shell's accessibility basics (tab roles, aria-live status, labelled groups) are a good base; the wizard must extend them, not regress them. [R14][R15]

---

## 3. Research basis

### 3.1 Progressive disclosure and wizards

Progressive disclosure defers advanced or rarely used features to a secondary screen, improving learnability, efficiency and error rate; users understand a system better when you help them prioritise features rather than dumping them all. [R1] Wizards are the right pattern for processes performed only occasionally by users who don't know the domain (e.g., configuration or setup), and the guidance is explicit: reserve wizards for novice users or infrequent processes, offer a faster alternative for expert/repeat use, show a clear mental model of the process, enforce a clear sequential order, label navigation buttons descriptively, allow exit and save state, make steps self-sufficient, and keep help next to the wizard rather than on top of it. [R2]

That maps almost one-to-one onto Cabinet Studio: guided wizard by default, Advanced editor as the expert/fast path, numbered step rail, one question per screen, Back/continue buttons named after the next action, and a close-with-confirmation. The one point where the spec diverges is save/resume: NN/g recommends allowing a mid-wizard save. For a 7-step flow that targets under 90 seconds, dropping draft persistence is defensible, but the space measurements should be persisted immediately (they are project context, not a cabinet draft) so a closed wizard never loses the wall measurement.

### 3.2 One question per screen

GOV.UK's question-page pattern says to start by asking **one question per page**, because it helps users understand what is being asked and focus on one answer. [R3] It also says: know why you are asking every question, only ask for information you need, mark optional fields "(optional)" rather than marking required fields with asterisks, and allow "I do not know" where that is a valid answer. [R3]

This report's interpretation for Cabinet Studio: **one decision per step**, but a step may contain a small form when the fields are one decision (Step 1's three measurements are a single "space" decision; Step 6 groups shelves + finish because both are "state of the inside"). Where a step contains two independent decisions (Step 5: layout and style), use internal sub-sections with their own mini-headings and progressive reveal, not a single wall of cards. [R3][R16]

### 3.3 Choice, defaults and decision load

Hick's law: decision time increases with the number and complexity of choices; the practical takeaways are to minimise choices when response time matters, break complex tasks into smaller steps, highlight recommended options and use progressive onboarding. [R10] Choice overload and the paradox of choice are the psychological background for the same advice, and the configurator literature maps it directly to staged reveal. [R11] The Iyengar & Lepper study "When choice is demotivating" (Journal of Personality and Social Psychology, 2000) is the canonical experimental reference; the record and abstract are citable via its DOI. [R17]

NN/g's "Danger of Defaults" is the other half: assume users will not change defaults and plan for it. [R4] Two consequences for the wizard:

1. The preset values shown on each step are the product. If the EU preset ships a 100 mm plinth and a 900 mm counter, most users will accept it and get a geometry inconsistency.
2. Every step needs a visible way to understand *and* change the default: a "Standard" badge, a short "Why this?" disclosure, and an obvious custom field. A default that cannot explain itself is a trap. [R4][R18]

### 3.4 Configurator UX

The configurator best-practice synthesis gives four directly relevant rules: (1) progressive disclosure and a guided sequence from the broadest to the finest choice; (2) instant visual feedback and real-time cost/spec feedback; (3) prevent invalid combinations rather than rejecting them at the end; (4) keyboard accessibility and text alternatives for visual changes. [R11] The planner-placement article adds a useful architectural point: a configurator should sit in the flow where the user is already committed to configuring, not as a detached toy, and should make the next action obvious. [R19] Cabinet Studio's local-first, one-cabinet-at-a-time wizard matches this, with the run strip as the commitment mechanism.

One caution: the same configurator article cites conversion statistics from vendor studies; those numbers are not independently verified here and should not be quoted in the product. Use the principles, not the marketing statistics. **Unverified:** the specific conversion percentages on that page.

### 3.5 Accessibility

W3C WAI's forms tutorial says long forms should be divided into logical steps and informs users about progress; multi-page forms should repeat overall instructions, split by logical groups, make optional stages easy to recognise and skip, avoid time limits, and indicate progress in the page title, main heading and/or a step indicator. [R14][R15] The wizard already plans an aria-live progress announcement and a step heading focus move; the report adds: put "Step n of 7" in the document title, make each step a labelled landmark, use real radio/button semantics for choice cards, and never rely on colour alone. [R14][R15][R20] WCAG's Focus Visible (2.4.7) requires a visible keyboard focus indicator; a card-based wizard makes this easy to lose, so card focus must be styled and tested. [R20] GOV.UK's radios guidance adds the practical details for the choice cards (fieldset + legend, one option per row, hint text rather than tooltips). [R16] Error summaries should link to the failed control and move focus to the summary, which is also the right behaviour for wizard step validation. [R9]

### 3.6 What the planner market does

The kitchen-planner market splits into three patterns, and Cabinet Studio sits between two of them:

| Planner | Entry flow | What it does well | What it gets wrong (for this user) |
|---|---|---|---|
| **IKEA kitchen planner** (browser 3D) | Asks a few preference questions, then gives a floor-plan grid to fill with cabinets; 3D drag/place; price runs along each step; free in-store review | Low-friction entry, instant 3D, live price, free human review; automatic fixes for small gaps [R23] | No domain guidance: storage load, clearances, collisions are not taught; dimension/clearance mistakes surface late; time-consuming; optimised for IKEA's catalogue, not custom construction [R23] |
| **Home Depot kitchen planner + designer** | 3-step process: **Get Inspired → Plan & Design → Order & Install**; guided by a human designer, in store or at home [R24] | Clear expectation-setting ("this is a project with stages"); human handoff; one place for design, order and install | Heavy retail funnel; the planner is a lead-gen on-ramp; less self-serve design autonomy |
| **CliqStudios quoting tool** | For users who already have a design: **select cabinet line → door style/finish → add cabinets to cart → compare → checkout** [R25] | Excellent self-serve flow for a decided buyer; skips design entirely; fast | Assumes the user already has a measured design and cabinet schedule — exactly what Cabinet Studio must produce |
| **Cabinets.com Create-a-Kitchen** | Guided wizard: room measurements → cabinet placement → style selection; 2D plan then 3D render; free designer review; instant quote [R26] | Step-by-step measurement-first flow; preview + designer review; save/share designs | Room-centric (floor plan first) rather than cabinet-centric; online catalogue/pricing dependency; less useful for a shop building its own cabinets |

**What to borrow:** Home Depot's expectation-setting (the wizard should say at the start "7 steps, about a minute"); IKEA's always-visible consequence of each choice (for Cabinet Studio: live drawing + dimensions + warning count, not price); Cabinets.com's measurement-first discipline (Step 1 Space); CliqStudios' "skip the design if you already have it" respect for experts (Advanced editor). **What to avoid:** drag-and-drop floor-plan editing (out of scope and high effort), catalogue funnels, and tools that hide manufacturing consequences until the end. [R23][R24][R25][R26]

---

## 4. Twelve actionable principles for the redesign

Each principle states the evidence and the concrete action for Cabinet Studio. The wording is deliberately testable.

**P1. Guided first, editor second.** New and occasional users see the wizard; the inspector is one explicit click away ("Advanced editor") and is never removed. *Why:* progressive disclosure improves learnability, efficiency and error rate; wizards suit infrequent, novice configuration; expert users need a faster path. [R1][R2][R13] *Action:* keep the spec's two modes, make Advanced reachable from the wizard footer and the run overview, and keep "Back to guided design" prominent.

**P2. One decision per step, one H1 question.** Each wizard screen has exactly one question as its H1, one helper sentence that explains why, and a single primary action. *Why:* one question per page helps users focus and understand; Hick's law favours fewer decisions per step. [R3][R10] *Action:* keep the spec's 7 steps; if a step must contain two decisions (Fronts: layout + style), split it into labelled sub-sections with progressive reveal.

**P3. Show the whole path, always.** A visible step rail with 1–7, a progress bar on narrow screens, and "Step n of 7" in the heading and document title. Completed steps are clickable; optional steps are marked. *Why:* wizards must communicate a clear mental model and progress; WAI requires progress to be indicated and optional stages to be skippable. [R2][R14][R15] *Action:* the spec's rail is right; add the step count to the page title and use the step label in the continue button.

**P4. Make the default the recommendation, and explain it.** Every step opens with a recommended answer from the selected preset, labelled "Recommended" with a one-line reason. *Why:* users rarely change defaults; defaults are the product for novices. [R4][R5] *Action:* show the "Standard" badge and a collapsed "Why this standard?" explanation; the default value must come from `presets.js`, not from copy.

**P5. Prefer visual choice cards to select menus, with a hard option ceiling.** 2–6 cards per question, each with a small line drawing, name and one-line trade-off; a recommended card is visually distinct. Never show 20 options at once. *Why:* recognition over recall; Hick's law; guided configurators narrow choices step by step. [R10][R11] *Action:* the spec's card patterns are right; cap each question at 6 cards and move the rest to a "More choices" disclosure.

**P6. Speak shop language, then teach the noun once.** "Doors or drawers?" before "full overlay"; "flat panel or frame-and-panel" before "slab/shaker"; define jargon in the helper line when it must appear. *Why:* the wizard exists because the user lacks domain expertise; plain-language question design is a GOV.UK pattern requirement. [R2][R3] *Action:* add a one-line glossary to each jargon-bearing card and keep field names out of the wizard.

**P7. Show the consequence immediately.** The live preview, the one-line spec summary ("Base · 30 in W · 34½ in H · 24 in D · shaker · full overlay"), and the warning count update on every choice. *Why:* instant visual feedback is a configurator essential; it builds trust that the design matches the result. [R11] *Action:* the spec's draft preview is right; make the summary the same component in every step and keep the preview above the fold at 1100 px.

**P8. Keep the run in view.** Every step shows wall length, cabinets so far and remaining run; the Size step offers a "Fit remaining" chip and warns on overflow without blocking. *Why:* run-aware context turns object editing into progress toward the user's actual goal; the current design has no run. [R6] *Action:* the spec's run strip and remaining segment; add a one-line "run context" header to the wizard panel.

**P9. Prevent invalid combinations; explain constraints where they appear.** Filter options that cannot work (e.g., inset on a frameless preset, a 24 in slide in a 24 in cabinet) and explain why in place; never let the user reach Review with a broken cabinet and then reject it. *Why:* configurator practice says post-hoc rejection destroys trust; engine validation already exists — surface it early. [R11] *Action:* run the draft through `CS.engine.resolveCabinet` on each step (the spec already requires this) and show only the relevant checks; use the advanced editor for the long tail.

**P10. Review is check-answers, not a card.** Each decision is a row with the answer and a **Change** link back to its step; unresolved warnings appear above the primary action. *Why:* the check-answers pattern makes it safe to review and change without re-walking the flow. [R8] *Action:* implement the GOV.UK-style summary list with Change links (the spec's summary card is a good start but lacks per-row edit).

**P11. Escape is safe.** Back always works; close/Escape confirms if anything changed; no cabinet is created until "Add cabinet to run"; space measurements persist even if the wizard is closed. *Why:* wizards should allow exit and resume; half-created objects are a trust failure. [R2] *Action:* keep the spec's confirm-discard rule; persist `project.space` after Step 1, not only at finish.

**P12. Accessibility is structural, not a checklist at the end.** Labelled landmark per step, real radio/button semantics, legend text for choice groups, focus moves to the step heading, aria-live progress, visible focus ring, Escape close with confirmation, no time limits, reduced-motion respected. *Why:* WCAG and WAI form/multi-page guidance; focus visible and labels are basic conformance. [R14][R15][R20][R20] *Action:* use the spec's accessibility notes as acceptance tests, not intentions; add a keyboard-only pass and a test at 200% zoom.

**P13 (bonus). Measure the flow, not just the feature.** Track (locally, no network) time to first cabinet, step completion/backtracking, warnings per step, and how often Advanced is opened from the wizard. *Why:* the wizard's acceptance criterion is a 90-second default run; only measurement shows whether the defaults are right. Label: **recommendation**, not a cited standard.

---

## 5. Competitor/planner comparison table

| Dimension | Current Cabinet Studio Design | Best practice seen in market | Recommendation |
|---|---|---|---|
| Entry | Sample project opens a dense 3-pane editor | IKEA asks a few questions then gives a canvas; Home Depot frames a 3-stage project; Cabinets.com starts with measurements [R23][R24][R26] | Guided wizard first; run overview for existing projects; empty project opens wizard |
| Mental model | "Object editor" with 60 controls | Wizard/sequence with progress (NN/g) or staged project (Home Depot) [R2][R24] | 7-step rail + "Step n of 7"; advanced editor behind one door |
| Effort per decision | All choices at once | One question per page, visual cards, recommended default [R3][R10] | One H1 question, ≤6 cards, default marked Recommended |
| Context | No run/wall; no remaining length | IKEA floor plan; Cabinets.com room measurements; Home Depot designer takes room context [R23][R26] | Persistent run strip; remaining length in steps and review |
| Feedback | Rich preview + expanded warnings | Instant visual + price/spec feedback is a configurator standard [R11] | Live preview + one-line spec + warnings top-3 |
| Review | Summary exists only as an editor state | GOV.UK check-answers with Change links [R8] | Summary list with per-row Change |
| Expert path | The editor is the only path | NN/g: offer a faster path for repeat/expert users [R2] | Advanced editor + remember last-used preset |
| Handoff | PDF/DXF/DWG export (strong) | IKEA/HD route to human designer/installer; CliqStudios routes to quote [R23][R24][R25] | Keep exports; add "Export plan set" CTA in success state |

---

## 6. Recommended step order, content and copy tone

The spec's order is recommended: **1 Space → 2 Standard → 3 Box → 4 Size → 5 Fronts → 6 Inside & finish → 7 Review**. The logic: context first (nothing else can be sized without it), then the preset (which seeds every later default), then the object (type), then the numeric decision the user uniquely owns (size), then appearance, then interior details, then confirmation. This follows the configurator rule of moving from the broadest to the finest decision and keeps the number of decisions per screen low. [R11][R3]

| Step | Question (H1) | Helper sentence | Primary control | Preset default | Skip/optional | Preview emphasis |
|---|---|---|---|---|---|---|
| 1 Space | "What are you filling?" | "Measure the wall you want to fill; we'll fit cabinets to it." | Wall length (3 preset chips + field), ceiling, counter | 10 ft wall, 8 ft ceiling, 36 in counter (imperial); 3000 mm, 2440 mm, 900 mm (metric) [R24][R27] | Counter can be "not sure" for wall-only projects [R3] | Small run elevation with the wall dimension |
| 2 Standard | "Which cabinet tradition should we start from?" | "Both are common in Canada. You can change any detail later." | Two cards: NA face frame / EU frameless; "Recommended" by units; "Compare" accordion | Preselected by project units [R4] | No — but preselected and changeable later | Section sketch of the joint style |
| 3 Box | "What kind of cabinet are you adding?" | "Pick the box you're building next. Dimensions come next." | 4 cards: Base, Wall, Tall, Pantry | Type suggested by the run (base first) [R6] | No | Small dimensioned box sketch |
| 4 Size | "How big should it be?" | "We've picked the usual size for a ___. Adjust if your space needs it." | Width chips + field; height chips; depth chips; "Fit remaining" | From preset dims per type [R27][R28] | Advanced details collapsed | Front elevation with W×H×D and run fit |
| 5 Fronts | "What's on the front?" | "Choose the look; every door and drawer is sized to the box." | 5a layout cards; 5b style cards; count/overlay/material (conditionally revealed) | Preset door style + count [R27][R28] | "Fine-tune hardware later in Advanced" | Front view with the chosen layout/style |
| 6 Inside & finish | "What's inside, and how should it look?" | "Shelves, drawer slides and the finish. The defaults suit most kitchens." | Shelves chips; slide type (only if drawers); finish cards + sheen | Preset shelves/slide/finish [R27][R28] | Yes (skip keeps preset) | Section/elevation accent on shelves and finish swatch |
| 7 Review | "Ready to add this cabinet?" | "Check the summary and the live drawing, then add it to the run." | Check-answers list with Change links; top-3 warnings; remaining run | — | No | Large preview + run strip with the new cabinet |

### 6.1 Copy tone rules (from the evidence)

- **Questions, sentence case, second person.** "How wide is the space?" not "Width". [R3]
- **Helper text explains why, not what.** "We'll fit the run to this measurement" rather than "Enter the wall length." [R3]
- **Buttons name the next state, not the mechanism.** "Use 30 in", "Continue to front style", "Add cabinet to run" — descriptive labels have stronger information scent than Next/Previous. [R2]
- **No abbreviations or codes in user-facing copy.** "34½ in" not "876.3 mm" in imperial mode; engine stores mm. Units follow the project toggle.
- **Warnings are actionable and blameless.** "This cabinet is 6 in wider than the space left. You can still add it, or choose 36 in." No "Oops", no exclamation marks, no "invalid" without a fix. [R3][R8]
- **"Recommended" gets a reason.** "Recommended — matches your imperial units and the common Canadian kitchen." [R4]
- **Optional means optional and says so.** "(optional)" on the label or legend, never a mandatory asterisk. [R3]
- **Standard names explain themselves.** "European frameless — no face frame, clean full-overlay fronts, 32 mm shelf system, 90 cm counters." [R2][R3]

---

## 7. Specific critiques of the current design and changes to the spec

These are the concrete, numbered changes I recommend to `docs/UX-REDESIGN.md`. Several are already implemented by the guided module; they are listed as verification points.

1. **Persist space immediately.** The spec writes `project.space` "only when the first cabinet is added or on review save". NN/g recommends allowing users to exit a wizard without losing work; measurements are project context, not a cabinet draft. Persist space when Step 1 is continued; keep the draft cabinet in memory only. [R2]
2. **Add per-row Change links to Review.** The spec's summary card is a read-out; the check-answers pattern expects each row to link back to its step with the entered value editable. [R8]
3. **Show the step count in the document title and H1** ("Step 3 of 7 · Box") and announce step changes with `aria-live="polite"`. [R14][R15]
4. **Reframe Step 2 by outcome, not construction jargon.** Keep both cards, but lead each with the visual outcome ("Familiar painted face-frame kitchens" / "Clean, flat frameless kitchens") and put the construction terms in the hint line. [R2][R3]
5. **Make Step 1 the only place units change for the wizard.** The header toggle currently changes units globally; in the wizard, units should be a segmented control on Step 1 that updates the project and later defaults, with the imperial/metric recommendation for the standard. The spec says this; verify the header toggle doesn't silently switch a draft mid-flow.
6. **Do not group two independent decisions without sub-headings.** Step 5's layout + style + count + overlay + material is a lot; render layout first, then reveal style/count/material after a layout is chosen, and keep the preview pinned. [R1][R3]
7. **Cap choices and add "More choices" disclosure.** Five door styles is fine; if the list grows (e.g., 13 finishes), show 6 cards and a disclosure. [R10][R11]
8. **Warnings: group and filter.** The current Checks (10) panel lists everything. In the wizard, show at most 3 (errors first, then warnings, then info) and a "See all checks" link; in Advanced, add severity filters and a "only this cabinet" filter. [R8]
9. **Header de-duplication.** Move New/Open/Save into the project menu (the spec already says this), keep one project summary ("7 cabinets · 166 parts · 12 sheets"), and drop the duplicate count in the preview footer. [R5][R12]
10. **Advanced editor must remember where you were.** From the wizard footer, "Advanced editor" should open the draft cabinet, and "Back to guided design" should return to the same step/cabinet, not the overview. [R1][R2]
11. **Empty-project behaviour.** Auto-open the wizard once on a brand-new project; after that, the run overview with a big "Design a cabinet" CTA (not a loop). [R2]
12. **Run strip must scroll, not shrink.** At 1100 px, proportional widths can make labels illegible; the spec's horizontal scroll with clear edges is right — verify at 1100 px and 1440 px. [R15]
13. **Keyboard-complete by test.** Tab order: step rail → question → cards → Back/Continue; arrow keys within a radio group; Escape closes with confirmation; focus returns to the triggering control on close. WCAG Focus Visible must pass. [R20][R20]
14. **No timers, no forced animation.** WAI multi-page forms: no time limits; respect `prefers-reduced-motion`. [R14][R15]
15. **"Why this?" disclosures should be one line plus a source note**, not a wall of text — the app has a rich technique library for depth. [R1][R13]
16. **Stage the success state.** "B2 added · 3 ft 6 in left" with Add another / View run / Open plans is the right shape; make "Add another" reopen at Step 3 with the same space and standard (the spec already says this). [R2][R6]

Two areas are explicitly out of scope but should stay on the roadmap: multi-cabinet run creation in one wizard pass, and a space/room editor. The evidence supports both eventually (IKEA/Cabinets.com are room-first; Home Depot is project-first), but v1's one-cabinet-at-a-time with a run strip is the cheaper correct step. [R23][R24][R26]

---

## 8. North American vs European presets

The presets are implemented in `js/data/presets.js` as a classic-script UMD object on `CS.data.presets`. Shape: `{ meta, sources, northAmerican, european, presetIds, list(), byId(id), forUnits(units), cabinetPatch(presetId, type) }`. Each preset carries `id/label/summary/units/sourceIds`, `construction`, `faceFrame`, `toeKick`, `interior`, `fronts.doors`/`fronts.drawers`, `hardware`, `finish`, per-type `dims` (base/wall/tall/pantry), `heights`/`depths`/`standardWidths` chip lists, `counterHeight` and 3–5 UI `bullets`. The guided module (`js/ui/guided.js`) deep-merges these values over its own fallbacks, so a partial preset is safe and extra fields are ignored; `cabinetPatch()` is an optional convenience that assembles the cabinet overrides for one type. Section 8.1 is the human-readable comparison the spec asks for. Both resolve through the real engine with no errors (North American: info-level only — adapter-plate note, minimal panel float, sheet yield; European: one low-yield warning). Values below are millimetres.

### 8.1 Comparison table

| Setting | North American (face frame) | European (frameless, 32 mm) | Evidence |
|---|---|---|---|
| Units | imperial | metric | project convention |
| Construction system | face frame | frameless | KCMA definitions; Hettich 32 mm guide [R27][R28] |
| Carcass | 18 mm (3/4 in) plywood | 18 mm melamine-faced PB | PWW / KCMA; EU melamine practice [R27][R29] |
| Carcass joinery | dado + screw | confirmat | shop practice; WOODWEB / PWW [R27] |
| Back | 6 mm rabbeted | 6 mm rabbeted | shop practice |
| Toe kick | 101.6 mm high × 76.2 mm setback | **150 mm high × 60 mm setback** | spec said 100×60; corrected by German/UK sources [R25][R26][R27] |
| Base height (incl. toe kick) | 876.3 mm (34½ in) | **870 mm (720 carcass + 150 plinth)** | KCMA typical; German 90 cm standard = 15 + 72 + 3 cm [R27][R25] |
| Counter height | 914.4 mm (36 in) | 900 mm | KCMA; DIN EN 1116 / German standard [R27][R25][R24] |
| Base depth (carcass) | 609.6 mm (24 in) | 560 mm | KCMA typical 24 in; UK/EU 560–570 carcass under 600 worktop [R27][R26] |
| Wall cabinet | 762 mm high × 304.8 mm deep | 720 mm high × 350 mm deep | KCMA / Bob Vila; German 65–72 cm high, 35 cm deep [R27][R30][R25] |
| Wall bottom above counter | 457.2 mm (18 in) | 550 mm (50–60 cm, 55 recommended) | Bob Vila; German trade guidance [R30][R25] |
| Tall / pantry | 2133.6 mm high, 609.6 / 304.8 deep | 2100 mm high, 560 / 350 deep | KCMA "84 in or taller"; German 200–220 cm [R27][R25] |
| Doors | shaker maple, 19 mm, full overlay | slab lacquered MDF, 19 mm, full overlay (3 mm reveal) | spec + techniques; EU slab/shaker common [R27] |
| Hinges | 35 mm cup | 35 mm cup | same hardware system both sides [R28] |
| Shelves | adjustable 5 mm pins, 32 mm pitch | same | Hettich [R28] |
| Drawers | dovetail box, undermount slides | box joint, undermount slides | shop practice; EU machine box |
| Finish | paint | lacquer (EU factory-look) | GF/techniques; **melamine/laminate is a front material, not a finish id** |
| Standard widths | 9–48 in (228.6–1219.2 mm) | 300–1200 mm | stock conventions [R30][R26] |

### 8.2 Key numeric defaults and corrections to the spec (§4 table)

| Spec value | Research value / recommendation | Why |
|---|---|---|
| EU toe kick 100 mm × 60 mm | **150 mm high × 60 mm setback** | German standard working height is 90 cm = 15 cm plinth + 72 cm carcass + ~3 cm worktop; plinth is adjustable ~10–19 cm [R25]. A 100 mm plinth with a 720 mm carcass gives an 820 mm box, which cannot reach a 900 mm worktop without an 80 mm top. |
| EU base height 720 + 100 = 820 | **870 mm** (720 carcass + 150 plinth) | Follows from the 90 cm standard [R25]; engine model counts toe kick inside height. |
| EU counter 900 mm | **900 mm** (unchanged) but add note: 30 mm worktop over 870 mm base | Arithmetic must resolve: 870 + 30 = 900 [R25]. |
| EU wall height 600–720, depth 350 | **720 mm high default × 350 mm deep**, height chips 720/900, bottom 550 mm above worktop | German trade: wall cabinets 65–72 cm high, 35 cm deep, underside 50–60 cm above worktop (55–60 comfortable) [R25]; UK: 720/900 mm high, 300–330 mm carcass deep, 450–600 mm gap [R26]. |
| EU base depth 560/600 | **560 mm carcass** (600 mm worktop, doors/overlay add ~20 mm) | UK trade: carcass 560–570 mm so unit + door + overhang fit under a 600 mm worktop [R26]; Nobilia side depth 582 mm incl. front [R31]. |
| EU tall 2000–2200 / 560–600 | **2100 mm high / 560 mm deep** | German tall cabinets 200–220 cm; 240 cm available for high ceilings [R25]. |
| EU finish "melamine/laminate" | **lacquer** preset default; melamine is a carcass/front material | The engine's finish ids are paint, lacquer, water-poly, hardwax-oil, stain-lacquer; "laminate" is not a valid finish id and would fail validation. Add a finish id or treat laminate as a front material. **Spec correction.** |
| EU toe kick style | presets use `separate-platform` (150 mm) | European kitchens normally stand on adjustable feet with a clipped plinth; the engine's `legs-levelers` currently emits hardware only (no plinth part), so the platform is the buildable v1 choice. Recommend a follow-up so `legs-levelers` also emits a plinth face part. |
| NA toe kick 101.6 × 76.2 | confirmed (shop standard); KCMA minimum 76.2 high × 50.8 deep | KCMA minimum is lower; the shop standard is larger [R27]. |

### 8.3 Shop-practice vs standard labelling in the presets

- **Standard-backed:** base depth 24 in / counter 36 in (KCMA); wall depth 12 in / wall heights 12–42 in (KCMA); tall 84 in+ (KCMA); European coordination categories and worktop/plinth/depth/width clauses (DIN EN 1116 table of contents); 32 mm holes, cup diameter/borings (Hettich).
- **Trade/measurement-backed:** European 90 cm worktop = 15 + 72 + 3 cm; wall cabinet 35 cm depth and 55–60 cm clearance; 560–570 mm EU carcass depth; 720/900 mm wall heights; UK width families.
- **Shop practice:** NA 2¼ in stiles/rails, full-overlay shaker, dado+glue+screw carcass, 76.2 mm toe setback; EU melamine carcass with confirmat, clipped plinth, 3 mm reveal, box-joint drawer boxes.
- **Unverified:** a single numeric EN 1116 value set (the standard body is paywalled); exact EU plinth setback (50–70 mm range); exact EU wall-unit depth varies 300–400 mm by manufacturer. These are marked in `presets.js` notes.

---

## 9. Acceptance and measurement recommendations

The spec's acceptance criteria are good; add these measurable ones:

1. **Default run ≤ 90 s**: cold-start to "cabinet added", accepting every default, one tester, 5 runs. The 7-step copy should be tested for comprehension ("what will this step ask?").
2. **Step success**: ≥ 90% of testers complete a cabinet without opening Advanced; those who do open it should return to the wizard successfully. (This is a recommendation/benchmark, not a published standard.)
3. **No project mutation before Finish**: automated check — close the wizard mid-flow and confirm `project.cabinets` is unchanged while `project.space` persists. [R2]
4. **Keyboard completeness**: complete the whole wizard with Tab/Enter/Escape only; visible focus never lost. [R20][R20]
5. **Progress comprehension**: ask testers "how many steps are left?" after Step 2; all should answer correctly (rail + title). [R14][R15]
6. **Default audit**: every step's default must be the preset value, and a "Recommended" badge must be visible on at least the Standard and Size steps. [R4]
7. **Warning discipline**: never show more than 3 warnings in a wizard step; "See all" must be a working link. [R8]
8. **1100 px and 200% zoom**: no horizontal scroll, choice cards still readable, preview visible above the fold.

---

## 10. Open questions / unverified

1. **EN 1116 numerics.** We verified the standard's existence, scope and clause structure from the DIN table of contents; the numeric clauses are behind a paywall. The numeric EU defaults in this report come from German/UK trade sources that describe the standard's practical values, not from the standard text. **Unverified:** exact normative values; treat the preset as "typical EU practice", not "EN 1116 compliant".
2. **IKEA and Lowe's live planners** were blocked to automated access (Cloudflare/Access Denied). IKEA's planner is described through a published review [R23]; Lowe's is not cited beyond noting the block. **Unverified:** any specific Lowe's flow claims.
3. **Baymard's configurator research** is membership-gated; its public page describes the research programme but not the findings. Claims in this report rely on NN/g, GOV.UK, W3C and configurator synthesis instead. **Unverified:** Baymard-specific configurator findings.
4. **The conversion percentages** cited by the configurator synthesis (e.g., +40% conversion) are vendor claims and are **not** verified here; do not quote them in product copy.
5. **European variety.** EU kitchens differ by country (German 72 cm/15 cm, UK 72 cm/15 cm, IKEA 80 cm frames); one "European" preset cannot be exact for every market. The preset states its assumptions in `presets.js` notes; the wizard should show the chosen standard's bullets so the user can spot a mismatch.
6. **NA tall/pantry heights** are not standardised beyond "84 in or taller" (KCMA); the preset offers 84/90/96 in chips as shop-common values.

---

## 11. Bibliography

All sources opened 2026-11-15. Keys `[R#]` are used inline; the same ids are not used by other files (the construction report uses `[S#]`).

**Research and pattern guidance**

- **[R1]** *Progressive Disclosure*. Nielsen Norman Group. https://www.nngroup.com/articles/progressive-disclosure/ — kind: research. Accessed 2026-11-15.
- **[R2]** *Wizards: Definition and Design Recommendations*. Nielsen Norman Group. https://www.nngroup.com/articles/wizards/ — kind: research. Accessed 2026-11-15.
- **[R3]** *Question pages*. GOV.UK Design System. https://design-system.service.gov.uk/patterns/question-pages/ — kind: pattern. Accessed 2026-11-15.
- **[R4]** *The Danger of Defaults* (video). Nielsen Norman Group. https://www.nngroup.com/videos/the-danger-of-defaults/ — kind: research. Accessed 2026-11-15.
- **[R5]** *Website Forms Usability: Top 10 Recommendations*. Nielsen Norman Group. https://www.nngroup.com/articles/web-form-design/ — kind: research. Accessed 2026-11-15.
- **[R6]** *Progressive disclosure / run context* — synthesised from [R1] and the cabinet-run model in `docs/UX-REDESIGN.md`; no separate source.
- **[R7]** *Home Depot Kitchen Planner* (plan-and-design stage). The Home Depot Canada. PDF: https://www.homedepot.ca/content/dam/homedepot/pdf/categories/kitchen/kitchen-planning-guide.pdf — kind: competitor. Accessed 2026-11-15.
- **[R8]** *Check answers*. GOV.UK Design System. https://design-system.service.gov.uk/patterns/check-answers/ — kind: pattern. Accessed 2026-11-15.
- **[R9]** *Error summary*. GOV.UK Design System. https://design-system.service.gov.uk/components/error-summary/ — kind: pattern. Accessed 2026-11-15.
- **[R10]** *Hick's Law*. Laws of UX (Jon Yablonski). https://lawsofux.com/hicks-law/ — kind: research. Accessed 2026-11-15.
- **[R11]** *Configurator UX Best Practices: Designing for Conversion*. configurator.tech. https://configurator.tech/blogs/configurator-ux-best-practices-designing-conversion/ — kind: publication (vendor synthesis; statistics unverified — see §10). Accessed 2026-11-15.
- **[R12]** *10 Usability Heuristics for User Interface Design*. Nielsen Norman Group. https://www.nngroup.com/articles/ten-usability-heuristics/ — kind: research. Accessed 2026-11-15.
- **[R13]** *Wizard vs. advanced editor* — synthesised from [R1] and [R2]; no separate source.
- **[R14]** *Forms Tutorial*. W3C Web Accessibility Initiative. https://www.w3.org/WAI/tutorials/forms/ — kind: research/standard. Accessed 2026-11-15.
- **[R15]** *Multi-page Forms*. W3C Web Accessibility Initiative. https://www.w3.org/WAI/tutorials/forms/multi-page/ — kind: research/standard. Accessed 2026-11-15.
- **[R16]** *Radios*. GOV.UK Design System. https://design-system.service.gov.uk/components/radios/ — kind: pattern. Accessed 2026-11-15.
- **[R17]** Iyengar, S. S., & Lepper, M. R. (2000). *When choice is demotivating: Can one desire too much of a good thing?* Journal of Personality and Social Psychology, 79(6), 995–1006. DOI: https://doi.org/10.1037/0022-3514.79.6.995 (record verified via Crossref, https://api.crossref.org/works/10.1037/0022-3514.79.6.995) — kind: research/primary study. Accessed 2026-11-15.
- **[R18]** *Default values in presets* — synthesised from [R4], [R27] and `js/data/presets.js`; no separate source.
- **[R19]** *Where the configurator should sit: product page, menu and collections*. The Planner Studio. https://theplanner.studio/success/where-the-configurator-sits/ — kind: publication. Accessed 2026-11-15.
- **[R20]** *Understanding Success Criterion 2.4.7: Focus Visible*. W3C WAI. https://w3c.github.io/wcag/understanding/focus-visible.html — kind: standard. Accessed 2026-11-15.
- **[R20]** *WCAG 2.2 Understanding 2.4.7 (Focus Visible)* — same as [R20]; cited for keyboard visibility.
- **[R9]** *Error summary* pattern — see [R9].

**Competitor planners**

- **[R23]** *IKEA Küchenplaner im Test: Traumküche oder Kostenfalle?* Küchen Design Magazin. https://www.kuechen-design-magazin.de/was-kann-der-ikea-kuechenplaner-und-was-nicht-ueberblick/ — kind: publication (review of IKEA's planner; the live IKEA planner blocked automated access). Accessed 2026-11-15.
- **[R24]** *5 Steps to Your Dream Kitchen* / *Kitchen Planner* (Get Inspired → Plan & Design → Order & Install). The Home Depot Canada. PDF: https://www.homedepot.ca/content/dam/homedepot/pdf/categories/kitchen/kitchen-planning-guide.pdf — kind: competitor. Accessed 2026-11-15.
- **[R25]** *Already Have a Kitchen Design? Try Our New Quoting Tool*. CliqStudios. https://cliqstudios.com/blog/cabinet-quoting-tool/ — kind: competitor. Accessed 2026-11-15.
- **[R26]** *Cabinets.com Create-a-Kitchen: Free 3D Kitchen Cabinet Design Tool with Expert Support*. Redesign Tools. https://redesign.blog/cabinets-com-create-a-kitchen-free-3d-kitchen-cabinet-design-tool-with-expert-support/ — kind: competitor review. Accessed 2026-11-15.

**Standards and construction data used for presets**

- **[R27]** *ANSI/KCMA A161.1-2022 Performance and Construction Standard for Kitchen and Vanity Cabinets*. Kitchen Cabinet Manufacturers Association. https://kcma.org/sites/default/files/2024-08/KCMA%20A161.1%202022%20High%20Res.pdf — kind: standard. Accessed 2026-11-15.
- **[R28]** *Ratgeber für Möbeltechnik / Furniture technology guide* (System 32: 5 mm holes, 32 mm pitch, 37 mm setback; hinge cranking 0/9.5/16 mm). Hettich, May 2021. https://web.hettich.com/fileadmin/Company_website/HDY/Media/Ratgeber_Moebeltechnik_de_en_05-2021.pdf — kind: manufacturer. Accessed 2026-11-15.
- **[R29]** *Frameless Cabinet Carcase Fastener Choices* and *Kitchen Cabinet Essentials* (construction practice). WOODWEB Knowledge Base, Popular Woodworking; summarised in `docs/RESEARCH-techniques.md` §2, §13. https://www.woodweb.com/knowledge_base/Frameless_Cabinet_Carcase_Fastener_Choices.html — kind: shop. Accessed 2026-11-15.
- **[R30]** *Standard Kitchen Cabinet Dimensions & Sizes Guide*. Bob Vila. https://www.bobvila.com/articles/standard-kitchen-cabinet-sizes/ — kind: publication. Accessed 2026-11-15.
- **[R31]** *Nobilia kitchen programme brochure* (carcass heights 720/792/864 mm; 582 mm side depth). Nobilia Möbelwerke. https://nobiliabutor.gazmodulweisz.hu/images/brosura/doc/1695801364j7AOh.pdf — kind: manufacturer. Accessed 2026-11-15.
- **[R32]** *DIN EN 1116:2018-03 (E) — Furniture — Kitchen furniture — Coordinating sizes for kitchen furniture and kitchen appliances* (table of contents: worktop height, plinth height, unit depth, wall-unit depth, widths). DIN. https://www.din.de/de/mitwirken/normenausschuesse/nhm/wdc-beuth:din21:275325871/toc-2830247/download — kind: standard. Accessed 2026-11-15.
- **[R33]** *E DIN EN 1116:2016-10 (D/E)* (draft, table of contents). DIN. https://www.din.de/de/mitwirken/normenausschuesse/nhm/entwuerfe/wdc-beuth:din21:254904175/toc-2514085/download — kind: standard. Accessed 2026-11-15.
- **[R34]** *Küchenhöhe Standard: Maße, Ergonomie & Planung 2026* (90 cm worktop = 15 cm plinth + 72 cm carcass + ~3 cm top; plinth adjustable 10–19 cm; wall cabinets 65–72 cm high, 35 cm deep, 50–60 cm above worktop; tall 200–220 cm). Lieblingskuechen.de. https://www.lieblingskuechen.de/arbeitshoehe-kueche/ — kind: trade/publication. Accessed 2026-11-15.
- **[R35]** *Kitchen Cabinet Sizes UK | Standard Base, Wall & Tall Units* (720 mm carcass, 560–570 mm depth, 150 mm plinth, 900–910 mm worktop, 720/900 mm wall units, 300–330 mm wall depth, 450–600 mm gap). Cut & Edge Express. https://www.cutandedgexpress.com/guides/kitchen-cabinet-sizes/ — kind: trade. Accessed 2026-11-15.

> Note: [R28]–[R35] were opened for the construction research earlier on 2026-11-15 and are reused here for preset values; the UX sources [R1]–[R26] were opened for this sprint.
