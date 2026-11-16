# Cabinet and door construction techniques — research report

**Project:** Cabinet Studio, a local HTML shop-drawing generator for a serious hobbyist / small-shop cabinetmaker.
**Report date:** 2026-11-15. **Companion machine-readable catalogue:** `js/data/techniques.js`.
**Scope:** a full kitchen-grade cabinet run built in a small shop with a table saw, router table, pocket-hole jig, drill/boring jig, and (optionally) a CNC shop for sheet cutting. The owner is a competent hobbyist, not a production line.

---

## 0. How to read this report

Every dimension, clearance or standard claim below carries a bracketed citation key (`[S1]`, `[S17]`, …) resolved in the **Bibliography** (§17). Each bibliography entry records the title, publisher, URL, access date (**2026-11-15**) and source kind. Source kinds used throughout:

- **standard** — an ANSI/AWI/KCMA/OSHA/ASME normative document or an official association standard page.
- **manufacturer** — a hardware or materials maker's own catalogue, spec sheet, product data sheet or technical guide (best evidence for clearances and boring patterns).
- **publication** — a magazine, book or professional publisher (Fine Woodworking, Popular Woodworking, Fine Homebuilding, Lost Art Press, Bob Vila, Taunton).
- **reference** — a technical reference, calculator or specification library (APA, CPA, supplier material specs, ARCAT master-spec extracts).
- **shop** — recorded professional shop practice: WOODWEB's moderated knowledge-base articles and forums, and trade discussion. These are evidence of what competent shops actually do, not of a published standard; the report labels them **shop practice**.

Claims I could not confirm from an opened source are marked **unverified**. Where credible sources disagree, the report gives both values and says which one I recommend for the app. The key numeric decisions exported to the engine are listed in §15, and the JSON catalogue is authoritative for what the app consumes.

A note on units: the shop reality is imperial (US cabinet hardware, 4×8 sheets, 3/4" stock), while cabinet hardware and the 32 mm system are metric. Cabinet Studio's model is millimetres; this report gives mm first with inch mirrors, because that is how the app, the catalogue and the exported CAD should store values. Do not round-trip through inches in code except for display.

---

## 1. Cabinet construction systems

### 1.1 The two systems, and the three front relationships

There are two carcass systems and three ways the fronts can relate to the carcass. They are independent decisions and the app should model them independently.

**Frameless (European, full-access, 32 mm system).** The carcass is the finished cabinet: 18 mm (or 19 mm) sides, top/bottom or stretchers, and an applied or captured back. Doors and drawer fronts sit **in front of** the carcass on European cup hinges and slides mounted to the system holes. There is no face frame. KCMA defines it exactly this way: a cabinet without a face frame whose doors are attached directly to the cabinet box [S1].

**Face-frame (framed, American).** A frame of stiles and rails is applied to the front of a box. KCMA: "components attached to the front of a cabinet body which overlay the edges of the cabinet body and provide an attachment point for doors and external hardware" [S1]. The frame gives the doors something continuous to seal against and lets the builder scribe and trim to the room.

**The three front relationships** (these are what actually drive door sizing and hinge choice):

| Relationship | How the door sits | Typical hinge cranking | Where it is used |
|---|---|---|---|
| **Full overlay** | Door covers the whole face frame stile or the frameless carcass side, less a reveal | 0 mm crank (frameless/full-overlay hinge) | Frameless kitchens; face-frame "full overlay" |
| **Half/partial overlay** | Door covers half of a shared partition or part of the stile | 9.5 mm crank (8 mm for 26 mm mini-hinges) | Face frame, where two doors share a stile; some frameless renos |
| **Inset** | Door sits inside the opening, flush with the face | 16 mm crank (inset hinge) | Highest-grade traditional work; demanding |

The crank values are Hettich's own definitions: inset = 16 mm cranking, full overlay = 0 mm, half overlay = 9.5 mm [S5]. That is the single most useful fact for the generator: **the overlay class of the hinge is a fixed geometric property, not a preference.** The app's `doorOverlay` enum is `full` and `inset`; half overlay must still be *documented* because a face-frame run with paired doors over a shared stile is a classic and a naive generator will produce doors that collide if it sizes them as full overlay. I recommend treating "half overlay" as a face-frame-only sizing rule added in a later version, and refusing paired doors in an opening too narrow for the reveal until then (§15).

### 1.2 Where each system wins

The practical trade-off is simple: frameless is cheaper and faster to build, gives the flattest modern fronts and is native to the 32 mm system; face frame is better at hiding an out-of-square wall, allows scribing the frame to the room, and makes inset/half-overlay traditional fronts easier. The full comparison is the decision matrix in §1.4. For the modern full-overlay kitchen this owner is likely building, frameless wins on labour and hardware flexibility; face frame wins if the walls are bad or the design is traditional. Both pass KCMA's structural tests when built competently [S1][S15].

**Recommendation for this user:** default `frameless` with a 1/2" (12 mm) applied back or a rabbeted 6 mm back plus an internal hanging rail; offer `faceframe` for the look and for walls that need scribing. The hybrid used by the New England School of Architectural Woodworking and described by Popular Woodworking — plywood carcass + applied face frame whose **inside edges are flush with the carcass inside faces** — gets the best of both: European hinges and slides work without building out the inside, and a face frame is still present [S14]. This is a strong candidate for the app's "face frame" implementation note, but the frame-vs-frameless geometry the contract already defines is correct as a v1 and should not be changed late. Flag it as a v2 preset.

### 1.3 Standard dimensions

These are the app's defaults and the dimensions the plan-set elevation should call out. Sources: KCMA definitions (base depth 24", typical counter height 36", wall depth 12", wall heights 12–42", tall 84"+) [S1]; NKBA planning clearances [S3]; stock-size survey (base height 34-1/2", widths in 3" increments, uppers 18" above counter / 54" above floor) [S39].

| Item | mm | inch mirror | Notes / source |
|---|---|---|---|
| Base cabinet box height (excl. counter) | 876.3 | 34-1/2" | Standard stock; countertop brings it to 35–36" [S39]; KCMA: typical counter height 36" [S1] |
| Base cabinet depth (carcass) | 609.6 | 24" | Excludes overlay doors/drawer fronts [S1][S39] |
| Counter height (finished) | 914.4 | 36" | KCMA typical [S1]; 25" counter depth with overhang [S39] |
| Toe kick height | 101.6 | 4" | Shop standard [S14][S40]; KCMA minimum 76 mm (3") [S1] |
| Toe kick setback/recess | 76.2 | 3" | Shop standard [S40]; KCMA minimum 51 mm (2") [S1] |
| Wall cabinet height | 762 | 30" | Most common; stock range 12–42" [S1][S39] |
| Wall cabinet depth | 304.8 | 12" | KCMA typical [S1]; 18" over microwaves, 24" over fridges [S39] |
| Wall cabinet bottom above counter | 457.2 | 18" | Standard; 54" above floor [S39] |
| Clearance cooktop to non-combustible surface | 610 | 24" | NKBA [S3] |
| Clearance cooktop to combustible surface | 762 | 30" | NKBA [S3] |
| Tall/pantry box height | 2133.6 | 84" | KCMA "84 or taller" for oven/refrigerator tall units [S1]; stock 84–96" [S39] |
| Tall cabinet depth | 609.6 | 24" | Matches base [S39] |
| Standard width increments | — | 3" (76.2 mm) | Stock base widths 12–60" in 3" steps; wall 12/18/24/30/36" [S39] |
| Minimum practical width | 228.6 | 9" | Below ~9" a cabinet with a hinged door has no usable interior; app should warn below this (shop practice, derived from stock range [S39]) |
| Maximum single-section width | 1219.2 | 48" | Larger wall units need a centre stile or divider to control shelf sag and door weight; stock uppers rarely exceed 36" [S39] |

Every one of these is a **nominal** figure. A useful check for the app: the sum of cabinet heights plus toe kick plus counter thickness must equal the design counter height; warn if the design counter is not 35–36" or if a tall cabinet top does not align with the wall-cabinet tops (a common visual error) [S39].

### 1.4 Decision matrix — construction system

| Question | Frameless | Face frame | Hybrid (frame + flush interior) |
|---|---|---|---|
| Fewest parts / shortest build | **Best** | More | Middle |
| Flattest, most modern fronts | **Best** | Possible | Possible |
| Wall scribing / old-house fit | Weak | **Best** | Good |
| Hardware choice | Full Euro range | Euro with face-frame plates; butt hinges possible | Full Euro range (carcass inside flush) |
| 32 mm system | **Native** | Needs build-outs unless interior flush | **Native** |
| Inset fronts | Hard (needs precise boxes) | Easier to frame an opening | Middle |
| CNC / sheet-yield | **Best** | Good | Good |
| Small-shop tooling burden | Low–medium | Medium (clamping, frame joinery) | Medium–high (mitered/machined frame) |
| App recommendation | **Default** | Option | Document as v2 preset |

---

## 2. Carcass joinery

The carcass is a butt-jointed box in every system; the question is what carries the joint. The options below are exactly the contract's `carcassJoinery` ids.

### 2.1 The options and what they really do

**Confirmat (7 × 50 mm stepped screw).** A threaded dowel: a 5 mm pilot hole in the edge/face of one member and a 7 mm clearance hole in the other, driven with a step drill or a boring machine [S19]. It draws and registers the joint without clamps, needs no glue, and is designed first for particleboard and MDF; it can split veneer-core plywood if drilled too close to an edge or fed with a dull, tapered step bit [S19]. WOODWEB pros call it the most economical fast method for small frameless shops and note it is an AWI premium-grade fastener (as opposed to thin assembly screws) [S15]. **Use for:** frameless melamine/PB/ply boxes at 18–19 mm, 3–4 per joint (≈64 mm from ends, ≤150–200 mm centres — shop practice, refine per screw supplier), where the outside will be covered by an adjacent cabinet or applied end panel.

**Pocket screw (fine-thread, 32 mm class).** A counterbored angled screw into a drilled pocket; fast, no clamps, cheap jigs. It pulls the joint tight and is the default for face frames and for bases/stretchers in small shops [S14][S15]. It depends on the screw holding in the receiving member's face grain, so it is weaker in MDF end grain and can misalign parts slightly; keep pockets on hidden faces and 50 mm+ from an exposed end. **Use for:** face frames, base platforms, shop cabinets, and carcass joints where the outside is hidden (never use it for the outside face of an exposed end panel).

**Dado + screw (and rabbet + screw).** A stopped or through housing plus glue and screws. This is the classic small-shop carcass joint: it locates the parts mechanically, adds glue area, stiffens the box, and squares it. The drawback is that a through dado shows on the outside; a stopped dado needs a router setup, and take-down is impossible. **Use for:** fixed shelves, dividers, bottoms of shop cabinets, and any cabinet where the outside will be covered or painted. For a kitchen run with finished ends, use it on the bottom/top and fixed shelves only.

**Dowel + clamping (32 mm line boring).** The European production standard: 6 or 8 mm dowels, line-bored, case-clamped. It is the fastest *and* strongest production method when the shop has a boring machine and case clamp; without them it is fussy and clamp-hungry [S15]. Dowels register the joint better than confirmats and do not split MDF or ply; glue is required. **Use for:** shops tooled for it, or for exposed-end cabinets where no fastener may show; not for this owner unless he buys the tooling.

**Biscuit + glue/screw.** #20 biscuits for alignment and a little strength; the Fine Woodworking door article notes biscuits for case work are a positioning aid more than a structural joint, and WOODWEB pros call biscuits a poor choice for corner joints (they only penetrate ~1/2") [S11][S15]. The Popular Woodworking method uses biscuits for **location** plus #8 screws for strength, with AWI's spacing rule: biscuit slots no more than 2" (51 mm) from the edge of the side and no more than 6" (152 mm) apart [S14]. **Use for:** locating parts during assembly while screws carry the load; not as the only joint.

**Butt + screw (glue and screw).** Simplest: predrilled countersunk screws from the outside into the edge of the mating panel, glue optional. Fast but visually intrusive, least resistant to racking, and prone to splitting at the ends. Acceptable where the outside is hidden (e.g., a base that is never seen) or for temporary/shop fixtures. **Use for:** budget/shop-only boxes; the app should warn that an exposed end with butt-and-screw needs an applied panel or plugs.

### 2.2 Strength and tooling comparison (shop practice, summarised)

| Joinery | Clamp time | Tooling | Strength in PB/MDF | Strength in ply | Repairable | Exposed-face friendly |
|---|---|---|---|---|---|---|
| Confirmat | None | Step drill / boring jig | **High** | Medium (splitting risk) | Yes (unscrew) | No |
| Pocket screw | None | Pocket jig | Medium | Medium | Yes | No |
| Dado + screw | Short | Table saw/router + clamps | **High** (glue area) | **High** | No (glue) | No (through) |
| Dowel | Long (case clamp) | Boring machine + clamp | **High** | **High** | No | Yes (line-bored) |
| Biscuit (+ screw) | Medium | Biscuit joiner | Low as sole joint | Low–medium | No | Yes (hidden slots) |
| Butt + screw | None | Drill + driver | Low–medium | Low–medium | Yes | No |

The app's default should be `confirmat` for frameless (contract default [S1]) and `pocket-screw` for face frames. The report's judgement: **for a 24" × 34-1/2" base, 3 confirmats per vertical joint plus glue at the front edge is stronger and more reliable than the same joint with biscuits; for a melamine box, use confirmats; for a painted/veneered exposed-end box, use dowels or an applied end panel.** For shelves, dado/rabbet is the structural choice.

### 2.3 Sizing the carcass parts

The contract already fixes the geometry rules; the joiner needs the mill allowances:

- Carcass side height = box height (base box = overall height − toe-kick height when a platform is used) [S14].
- For a base box with a **bottom panel and top stretchers**, sides run full height, bottom fits between sides, stretchers fit between sides [S14]. The Popular Woodworking cabinet uses this arrangement so the bottom can be edge-banded solid stock that acts as a door stop [S14].
- Sheet-goods kerf and trim: the app's defaults (kerf 3 mm, trim 10 mm) are sensible shop allowances; keep them visible in the cut list.
- Back: applied 1/4" back means sides are `depth − back thickness` deep; real 1/4" plywood is 5.9–6.4 mm, so do not use 6.35 mm as an exact value without a tolerance note (see §10).

---

## 3. Backs and wall attachment

### 3.1 What the back actually does

The back is not just a dust seal. It contributes:
1. **Racking resistance** — an applied back screwed to a square carcass is a shear panel.
2. **Wall attachment** — the back is the load path to the wall on wall cabinets (PWW: "the back is what supports the cabinet when it is fastened to the wall") [S14].
3. **Squareness** — a back installed while the carcass is clamped square holds it square; WOODWEB recommends a 1/4" × 1/2" dado for the back specifically because it "will ensure a flush fit and square your casework up" [S16].

KCMA's wall-cabinet static-load test is the number to design to: wall cabinets up to 36" wide must accept **272 kg (600 lb)** net load; 36–60" wide wall-hung base cabinets **363 kg (800 lb)**; > 60" **9 kg per 25.4 mm of width (20 lb/in)** without visible failure of the cabinet or mounting system [S1]. A 1/4" back stapled on with no rail will not pass that test; KCMA doesn't prescribe construction, only performance [S1].

### 3.2 The four back styles

| `backStyle` | Construction | Structural contribution | Notes |
|---|---|---|---|
| `applied` | 6 mm (1/4") back applied to the rear of the carcass, inset `backRecess` (default 12 mm) from the rear edge, screwed/stapled every 100–150 mm | Good shear if well fastened; with a 1/2" back, very stiff [S14] | Fastest; shows as a flush rear face; needs a hanging rail or nailers for wall cabinets |
| `rabbet` | Back sits in a rabbet (e.g., 6 × 6 mm, or 1/4" deep) cut in sides/top/bottom | Best squareness & shear for thin back; flush inside and out | Shop-practice standard for 1/4" backs [S16] |
| `dado` | 1/4" × 1/2" dado (6.4 × 12.7 mm) set in from the rear edge, back captured | Strongest; squares the case; can be run as a stopped groove | Adds a machining step; most robust for hanging cabinets [S16] |
| `none` | No back (open, or a separate site-applied panel) | None; needs a full frame/hanging system | Only for open shelving/appliance cabinets; warn for wall cabinets |

**Wall attachment options** the app should document:
- **Direct screw through back into studs** — fine with a 1/2" back or a 1/4" back plus a 3/4" nailer/hanging strip [S14][S16].
- **Hanging rail / French cleat** — a 3/4" rail or steel rail fixed to the wall, with a cleat or Blum-type hanging brackets on the cabinet; adjustable height/level [S16]. This is the preferred method for a long run because it lets the installer level each cabinet before locking it to the next.
- **Adjustable suspension brackets** — the WOODWEB contributor's Blum hanging brackets on a steel wall rail, adjusted with screws: best for a large run [S16].
- **KCMA load path** — whatever is chosen must transfer 600 lb for a 36" wall cabinet [S1]. The app should require a rail/nailer for wall/tall cabinets whenever `backStyle` is `applied` and back thickness < 12 mm; this is a validation rule (§15).

The report recommendation: default wall cabinets to `rabbet` back (6 mm) **plus** a factory-installed hanging rail, and warn if a wall cabinet has no rail and a back thinner than 12 mm. Applied 1/2" back is a legitimate alternative (PWW uses it) and should be offered as a "stiff back" option when the user does not want a rail.

---

## 4. Toe kicks and bases

### 4.1 Dimensions

- **Shop standard:** 4" (101.6 mm) high, 3" (76.2 mm) recess, with a 1/4" (6 mm) finished face board fitted after the cabinets are leveled and fixed; the board is scribed to the floor [S40][S14]. This is the value the contract uses and it is right for this project.
- **KCMA minimum:** if cabinets rest directly on the floor, toe space must be **at least 51 mm (2") deep** and **76 mm (3") high** [S1]. So a 3" high × 2" recess cabinet is legal under A161.1 but unusual in a custom kitchen; the app should warn below these minimums and default to 4"/3".
- A toe kick reduces the base cabinet's *interior* height. With a 876.3 mm box and a 101.6 mm toe kick, the box is 774.7 mm high. The app must size side panels from the **box** height, not the overall height.

### 4.2 The five styles

| `toeKickStyle` | What is built | Advantages | Problems |
|---|---|---|---|
| `separate-platform` | A plywood ladder platform (front/back/sides + notched stretchers), leveled, with finished facing applied and scribed to the floor. Box sits on it [S14] | Easy to level one long run; box not cut around floor; replaceable kick board; best for long runs [S14] | Extra parts and height; platform must be straight |
| `notched-sides` | Side panels extend to the floor with a notch cut at the front bottom; kick board applied between/below | Fewer parts; strong side-to-floor contact; idiomatic for face-frame cabinets | Notching every side; levelling on an uneven floor is harder; the notch weakens the bottom corner |
| `legs-levelers` | Adjustable legs/feet at the corners; a separate kick board (often clipped) | Fastest levelling on bad floors; no platform; boxes can be levelled independently | Load goes through 4–6 feet and the back rail, not the floor line; need a clip/kick system; legs can be knocked off during install |
| `flush-base` | Cabinet sits directly on the floor with no recess (or a shallow 1" recess) | Simpler box; maximum storage; good for ADA/wheelchair footrest? (not the same) | No foot room — uncomfortable at a counter; KCMA toe-space minimum not met if truly flush |
| `none` | No toe kick: box goes to the floor, fronts to the bottom (appliance/tall units, some islands) | Clean look for a furniture-style run; maximum interior | Ergonomics; floor scribe; not appropriate under a working run |

The contract's platform semantics are sound: platform depth = `depth − setback`; sides flush with cabinet sides; front face finished. One correction to the model: for `legs-levelers` there is still a **kick board** part; the contract notes "hardware line item only", which is acceptable if the app at least emits the kick face as a separate part and hardware items for the clips. A naive generator that omits the kick face will produce a cabinet with a 4" gap under it.

### 4.3 Materials and details

- Exposed kick face: matching finished material, typically 1/4"–3/4" (6–19 mm) thick; PVC/vinyl for wet areas [S40]. The app should let the kick material differ from the carcass.
- Scribe: cut the kick board to the floor, not caulk it; install it **last**, after leveling and fixing, because no floor is level [S40].
- End returns: an exposed run needs an end cap/return; a small part that is easy to miss [S40].
- Toe-kick drawers: about 3" (76 mm) of usable height; realistic for trays and baking sheets, not for volume [S40]. The generator should refuse a toe-kick drawer unless the toe height is ≥ 101.6 mm and the style leaves the recess open.
- Fasteners: brads or clips, not construction adhesive, so the kick board can be removed for service [S40].

---

## 5. Shelving and span sag

### 5.1 Fixed vs adjustable, and the 32 mm system

- **Adjustable shelves on 5 mm pins** are standard in kitchen cabinets. Hettich's system-32 guide defines the drilling pattern: **5 mm diameter holes, 32 mm spacing, hole-line centre 37 mm from the front edge of the side panel, rear hole line 37 mm from the rear edge, and the first and last holes equidistant from the panel ends** [S5]. The front setback of 37 mm is the number the app already uses; keep it.
- PWW confirms the same shop implementation: 5 mm system holes, front row 37 mm from the carcass front, back row a multiple of 32 mm from the front row (480 mm in their example), and it uses the system holes for hinge plates, drawer slides and shelf pins [S14].
- **Fixed shelves** should be dadoed/rabbeted and glued/screwed; they stiffen the case and are appropriate for a centre divider, an oven housing, or a book-heavy area.
- **Custom pin spacing** is a shop option (e.g., a 1" or 25 mm line) but loses hardware compatibility; the app should default to 32 mm and only offer custom spacing where the user has a reason, warning that slide/hinge plates expect the 32 mm line.

### 5.2 How much can a shelf span — and how to compute it

Two independent limits:

1. **KCMA deflection limit (the standard's pass/fail):** loaded shelves and bottoms at **718 Pa (15 lb/ft²) for seven days** shall not deflect more than **1.6 mm (0.0625") per 305 mm lineal foot** between supports, and never more than **6.4 mm (0.25")** between any two supports [S1]. That is a service-load test for a production cabinet.
2. **Sagulator's design target (a calculator's recommendation):** the eye notices ~1/32" (0.03") per foot, and wood shelves sag an additional ~50% over time, so target **0.02" per foot (1.7 mm/m) or less**; a fully loaded bookshelf runs 20–40 lb per running foot (35 lb/ft used for library shelving), and the tool lists the scaling rules below [S22].

The Sagulator's rules of thumb are the most useful thing to bake into the app's help text: **halving span roughly doubles stiffness; doubling span increases deflection 8×; doubling thickness reduces deflection to 1/8; doubling depth halves deflection; reducing span by one-fifth roughly halves deflection** [S22].

Practical span guidance for the catalogue defaults:

| Material / thickness | Recommended max span | Basis |
|---|---|---|
| 18 mm (3/4") plywood or MDF shelf, 15 lb/ft² kitchen load | **900 mm** (35.4") | KCMA 1.6 mm/ft limit and Sagulator target; 900 mm is conservative for 18 mm plywood at kitchen loads; the app should warn over 900 mm |
| 18 mm shelf carrying heavy cookware/books (> 20 lb/ft) | **750 mm** or add a centre support | Shop practice: step down when load exceeds the KCMA 15 lb/ft² basis |
| 25 mm (1") shelf | **1200 mm** (47.2") | Engineering estimate from deflection scaling (t³); mark as an **estimate** in the UI and recommend verifying with the Sagulator for the chosen material |
| 12 mm (1/2") shelf | **600 mm** or fixed | Shop practice; thin shelves in a kitchen need edge banding and short spans |
| Solid-wood shelf (19 mm, 300 mm deep) | 750–900 mm | Sagulator uses species E values; solid wood creeps more than plywood; mark as shop practice/estimate |

The app should implement a conservative span check using the material's category (plywood/MDF/PB/solid), thickness and the load class, not a one-size table. Suggested load classes: **light (10 lb/ft²), kitchen standard (15 lb/ft², the KCMA test load [S1]), heavy (25–35 lb/ft²)**. Warn at 900 mm for 18 mm, block at > 1050 mm for 18 mm unless a divider or support is added. **Deep shelves sag more:** the Sagulator's rule is doubling depth halves deflection, so a 400 mm deep shelf is roughly twice as stiff as a 200 mm shelf of the same thickness [S22] — the app's span check should use depth, not just span.

### 5.3 Shelf edge treatment and fit

- Adjustable shelves need **1–2 mm clearance** for pin play; the contract's 0.5 mm per side is optimistic for a wood-on-pin fit. Shop practice: 1 mm total clearance for painted shelves, 2 mm for edge-banded shelves (banding thickness adds), or use a shelf with a small chamfer. Use 0.5 mm as a *minimum* in the engine and 1.0 mm as the recommended default; emit a warning if < 0.5 mm.
- Banding: 0.5 mm PVC is the standard kitchen-shelf edge; 2 mm PVC or solid lipping on shelves that take heavy sliding loads (pots) [S28][S27]. The shelf front edge gets the most wear — band it.
- Shelf depth = interior depth − front setback (`shelfFrontSetback`, default 10 mm) − back clearance. A 24" deep base with a 12 mm front setback and a 6 mm back yields roughly 590 mm of shelf; the cut list must compute from resolved geometry, not nominal.
- Shelf pins: 5 mm steel pins in 5 mm holes [S5]; use a pin with a shoulder that bottoms on the panel, not a straight friction pin, or the shelf will wobble. Hardware catalogue has `shelf-pin-5`.

## 6. Doors

Doors are where a cabinetmaker's reputation lives and where a naive generator does the most damage: a door that fits at 45% relative humidity can jam or show a 4 mm gap at 70%. The research below separates **style geometry** (what the door looks like), **joinery** (how the frame is made) and **movement** (how the panel is allowed to expand).

### 6.1 Door styles — comparison and construction order

| `doorStyle` | What it is | Construction order | Typical use | Watch-outs |
|---|---|---|---|---|
| `slab` | One panel, usually 18–19 mm MDF, ply or solid | Cut to size → edge-band/lipping → drill cup holes (if Euro) or mortise butt hinges → finish | Modern/contemporary; drawer fronts | Single panel 600 mm+ wide and 19 mm thick will warp if unbalanced (veneer/finish both faces or use MDF); hinged slab doors over ~600 mm wide need 3+ hinges and a straight, flat panel |
| `shaker` / recessed panel | Frame (stiles/rails) with a flat or slightly recessed panel; the frame is usually 57–64 mm wide | Mill frame → rout sticking + groove → cope rails (or miter) → cut panel → dry fit → glue/clamp → sand → finish → drill hinge cups after glue-up is cured | The workhorse kitchen door | Stub tenons are the weak point; panel must float; stile grain must be straight |
| `raised-panel` | Frame with a raised/fielded solid panel (cope-and-stick or mitred frame; panel raised on a shaper/router) | Same frame process; panel is thick (19 mm+) and fielded; allow 3 mm+ per side float | Traditional / high-end kitchens | More material, more machining, panel movement is larger; the door is heavier (hinge count/weight check) |
| `beadboard` | Frame or slab with a beaded (V-groove) panel, often tongue-and-groove boards or a routed MDF panel | Bead the panel stock (or buy beaded panel) → frame it like shaker or apply as a slab face → finish | Cottage/farmhouse look | Beads collect paint/finish if sprayed wet; MDF beadboard is dimensionally stable but must be sealed on edges; individual boards shrink and open the V-grooves |
| `glass` | Frame with a rabbet or groove holding glass, glazed from the back | Mill frame with a deeper rabbet/groove → finish → insert glass → retain with glazing putty or wood stops | Display/upper cabinets | The frame alone is less stiff; glass adds little; retainers must be removable for glass replacement |
| `mullion-glass` | Glass door with vertical/horizontal muntin bars | Build outer frame → cut glass pane(s) → make muntins (half-lap or cope) → assemble with glass captured | Traditional upper cabinets | Each glass pane adds a failure point; the muntin joint must not rely on the glass; spacing must be set out from the door centre |

Sources: the styles and their trade-offs are grounded in Fine Woodworking's three door-construction methods [S11] and CMT's step-by-step raised-panel door instructions [S13]; the slab/MDF balance and finish advice is shop practice (MDF is an excellent door substrate per WOODWEB [S19] and is commonly sealed on all faces).

### 6.2 Frame-and-panel doors, step by step (cope-and-stick)

This is the sequence the app's assembly pages should use for `doorStyle: shaker` with `doorJoinery: cope-stick`:

1. **Mill the stock.** Frame stock to final thickness (19 mm / 3/4"), stiles to door height, rails to calculated length. CMT's sets are designed for 19 mm stock and accept up to 22 mm (7/8") [S13].
2. **Calculate the rail length.** *Rail length = door width − 2 × stile width + 2 × tenon length.* CMT's example: a 305 mm (12") door with 62 mm (2-7/16") stiles and 11 mm (7/16") tenons gives a 203 mm (8") rail [S13]. **The app must implement this exact formula**, not "door width − 2 × stiles" (which would make the door too narrow once coped).
3. **Rout the sticking** (profile + groove) in the stiles and rails, then **cope the rail ends** for a coped frame; a mitred frame needs a mitre at the profile corners instead [S11][S13].
4. **Cut the panel.** CMT's rule for a floating panel: **panel width = rail length − 6 mm (1/4")**, and **panel length = door length − 102 mm (4")** for 62 mm rails/stiles with 11 mm tenons; subtract another 6 mm if using space balls on top and bottom [S13]. That 6 mm is the expansion allowance across the panel width (3 mm per side) — **the app's `panelFloat` default of 2.0 mm is the minimum, not the recommendation; use 3 mm per side for solid wood and 2 mm for veneered plywood/MDF.**
5. **Dry-fit** the frame and check the panel floats with the allowance still visible. If the panel is tight, it will split the frame or bulge in humidity.
6. **Glue and clamp.** Glue the frame joints (not the panel); clamp flat and square; check diagonals. Cope-and-stick frames need clamps across both stiles and along the rails; a flat caul prevents twist.
7. **Sand and finish.** Sand to 180–220 before finishing; ease the door edges slightly (a 1 mm radius) — hinge minimum-reveal tables assume a 1 mm radius [S6][S36].
8. **Drill hinge cups after glue-up is cured** (or on a boring machine before assembly, but then the door must be assembled to its final size exactly). Bore 35 mm cups, minimum 13 mm deep [S6], cup centre set from the hinge edge by the chosen boring distance (§8).

**Frame geometry values that should drive defaults:**

| Feature | Recommended value | Basis |
|---|---|---|
| Door thickness | 19 mm (3/4") | CMT [S13]; KCMA allows 35 mm max thickness for its tests but kitchen practice is 19 mm [S1][S35] |
| Stile/rail width (doors) | 57.15 mm (2-1/4") default; 50–64 mm range | Contract default; CMT example uses 62 mm (2-7/16") [S13]; shop practice for shaker is 2-1/4"–2-1/2" |
| Panel thickness (recessed) | 6.35 mm (1/4") ply or 9–12 mm MDF | Shop practice; solid raised panels are 19 mm+ [S13] |
| Panel groove | 6 mm wide × 8–10 mm deep | CMT's set is designed for panel plus clearance; use the cutter's actual dimensions |
| Tenon (stub) | 11 mm (7/16") with CMT cope-and-stick; some sets 3/8" | CMT [S13]; FWW notes inadequate tenon length is the weak point [S11] |
| Panel float | 3 mm per side solid wood; 2 mm per side ply/MDF | CMT 6 mm total [S13]; contract minimum 2.0 mm |
| Frame glue area | Full mortise-and-tenon gives ~4× the glue area of a 3/8" stub tenon | FWW [S11] |

**Cope-and-stick vs mitred frame.** Cope-and-stick is faster and gives a strong mechanical interlock at the profile; its weaknesses are a short stub tenon and the thin, profiled edge (the moulded edge is "a weak point" [S11]). Mitred frames look better on both faces and allow a full mortise-and-tenon, but the joint is only as strong as the glue and requires precise setup [S11]. For a kitchen run, cope-and-stick with a glued-in plywood panel is the pragmatic default; for an inset door where both faces show, a mitred or dowelled frame with a full tenon is better. **The app's `doorJoinery` options (`cope-stick`, `mitered`, `dowel`, `domino`) map to these choices; `domino` is a floating-tenon variant that behaves like a dowel/mortise-tenon hybrid and needs the same stub-tenon criticism documented.**

**Glass doors.** Build the frame with a rabbet on the back (or a groove with the rear wall ripped off) and retain the glass from the rear with glazing putty or nailed/screwed wood strips [S11]. Cut the bottom retainer in two pieces so the glass can be replaced [S11]. Glass thickness: 3 mm is typical for cabinet doors (shop practice; check local glass supplier). For mullioned doors, the muntins should be mortised or coped into the frame, not merely glued to the glass, and the glass panes must be set with clearance for frame movement.

**Beadboard.** Build it exactly like a shaker door, but the panel is beaded (V-grooved) material. If using individual tongue-and-groove boards, allow for the total board shrinkage across the panel rather than a single solid panel; if using a routed MDF beadboard panel, treat it as dimensionally stable (no float needed beyond 1 mm). Beadboard is best sealed with a sprayed finish; brushing a wet film into the V-grooves causes runs and bridging (shop practice).

### 6.3 Door warping — the causes and the countermeasures

1. **Unbalanced construction.** A door finished or veneered on one face only will cup toward the dry side. Finish both faces equally, and use a balanced panel (same veneer/backer both sides) where possible. This is shop practice, consistent with KCMA's finish requirements on all exposed surfaces [S1].
2. **Bad stock.** Use straight-grained, quarter-sawn-ish stiles, mill in stages and let the parts rest between operations — PWW's door instructions make this explicit ("It's very important that the doors stay flat; using straight grain lumber, milling it in stages, and letting it rest in between stages helps accomplish this goal") [S14].
3. **Too-thin slab doors at large widths.** A 19 mm slab door over 600 mm wide is at risk; use 22 mm+ or a frame-and-panel design, or add a discreet back rail. The app should warn on slab doors wider than 600 mm.
4. **Glue-starved or over-clamped frame joints.** Starved joints creep and the door racks; over-clamping squeezes out glue. Cope-and-stick joints benefit from glue in the tenon and on the profile contact areas [S11].
5. **Moisture imbalance.** Keep the shop and the house near the same RH; acclimate stock. KCMA requires wood moisture content ≤ 10% at test [S1]; the practical shop target is 6–8% for interior work (shop practice). The app should include an assembly note: **acclimate doors and drawer fronts in the room where they will be installed for at least 48–72 hours before final hanging**, especially in a new build.
6. **Hinge-induced twist.** Too few hinges on a tall door, or hinges set too far apart (or too close together), twists the door. Blum and Salice both require that the **distance between the top and bottom hinges be greater than the door width** [S6][S35]. The app must check that rule when computing hinge positions.
7. **Panel too tight.** A panel with no float bulges the frame and warps the door; the CMT allowance exists for this reason [S13].

---

## 7. Overlay and inset math

This section is the exact arithmetic the engine must implement. The contract's formulas are correct in shape; the notes below add the values and the checks.

### 7.1 The fundamental relationships

- **Opening width** — frameless: `cabinet width − 2 × carcass thickness`; face frame: `cabinet width − 2 × stile width` (for a single opening between stiles) [Contract §4].
- **Overall front region** — base/tall: `cabinet height − toe kick height`; wall: full height; drawer/door rows share the region with `reveal` gaps between rows.
- **Full overlay (frameless)** — the door covers the carcass side except a reveal at the outside edge and a reveal between paired leaves:
  - single leaf: `width = cabinet width − 2 × reveal`; height = `front region − 2 × reveal`.
  - pair: each leaf `= (cabinet width − 2 × reveal − reveal) / 2`; i.e., one reveal at each outside edge plus one shared gap at the pair. This is the contract formula and it is right: e.g., 762 mm cabinet, 3 mm reveal → pair leaves of 376.5 mm each, 3 mm gaps at each side and 3 mm between leaves.
  - **What that means physically:** with 18 mm sides and a 3 mm reveal, each door overlays `18 − 3 = 15 mm` of the cabinet side. For a 19 mm side, 16 mm. This is the "overlay" the hinge must be adjusted to; the app should show it in the plan-set door schedule.
- **Full overlay (face frame)** — same formula from the overall width, but the cover is the stile: `overlay per side = stile width − reveal`. Example: 57.15 mm stile, 3 mm reveal → 54.15 mm overlay. European face-frame hinges and mounting plates have a limited overlay range (Blum's face-frame plates cover roughly 0–22 mm of overlay through plate height + boring distance combinations; see the overlay table in the CLIP top catalogue) [S6]. **The app must check that the selected hinge/plate can produce the required overlay** — a naive generator that sizes the door from the frame but defaults to a frameless plate will not close.
- **Half overlay (face frame, paired doors on one stile)** — each leaf covers roughly half the stile: `overlay per side ≈ stile width / 2`. With a 57.15 mm stile that is 28.6 mm, above the comfortable range of standard Euro hinges; real face-frame half-overlay practice uses a narrower stile or a compact/face-frame hinge. FHB's shop answers give the practical range: **half overlay ≈ 3/8" (9.5 mm)**, full overlay ≈ 3/4" (19 mm) on a face frame, adding an extra 1/8" (3.2 mm) between paired doors [S21]. Note that this is *shop practice* for a 1-1/2"-class frame, not a law; the app's default stile of 57.15 mm is larger than the frame in that discussion.
- **Inset** — door = opening − 2 × reveal each side; the reveal is a visible gap all around. **Minimum reveal depends on door thickness and hinge boring distance**; the Hardwaresource/Blum table for a 107° frameless inset hinge shows minimum reveals from **0.6 mm (16 mm door, 3 mm bore)** up to **2.5 mm (22 mm door, 3 mm bore)** [S36]. A practical kitchen default is **2–3 mm**; below 2 mm, door thickness and hinge choice become critical [S20][S36].
- **Drawer front sizing:** the front is sized to its opening plus overlay (or minus reveal for inset), exactly like a door leaf; the stack is laid out from the front region. Contract defaults (top drawer min(180 mm, 25% of region), min front height 90 mm) are reasonable ergonomics; warn if a drawer front is < 90 mm or > 300 mm high.

### 7.2 Reveal / gap recommendations

| Situation | Recommended gap | Evidence |
|---|---|---|
| Frameless full-overlay doors, outside edges | 3 mm (1/8") default | Shop practice; 2 mm used with 107°/120°/170° hinges [S20] |
| Between paired leaves | 3 mm (same as outside) | Contract default; shop practice uses 2–4 mm [S20] |
| Between door and drawer front rows | 3 mm | Shop practice |
| Inset doors | 2–3 mm; not below hinge minimum | Blum/Hardwaresource reveal table [S36]; 1/8" standard in shop practice [S20] |
| Face-frame full overlay | 3 mm reveal; overlay set by plate | FHB shop practice [S21] |
| Tight 1/16" (1.6 mm) reveals | **Not recommended** frameless without profiled/back-bevel edges and 107–170° hinges; callbacks likely | WOODWEB cabinetmakers: "1/16 is roughly 1.6 mm, a little tight if there is no outside profile; do 2–3 mm" [S20] |

**Hinge-vs-reveal interaction is the trap.** Euro hinges swing the door through an arc; at the hinge side the door edge must not bind on the cabinet. The minimum reveal table exists precisely because a thicker door or a smaller boring distance needs a bigger gap [S6][S36]. The app should:
1. compute the reveal the user asked for;
2. look up the **minimum reveal** for (door thickness, hinge boring distance, hinge model family);
3. if `reveal < minimum + 0.5 mm`, emit an error and suggest a smaller boring distance, a thinner door, or a larger reveal.

The default boring distance in this shop should be **5 mm**, giving a cup centre 22.5 mm from the door edge (see §8). At B = 5 mm the minimum reveal for a 19 mm door is about 1.0–1.2 mm [S6][S36], so a 3 mm reveal is comfortable. For inset doors, the standard 1/8" (3.2 mm) gap is generous and safe; a 2 mm inset gap is achievable but unforgiving.

### 7.3 Worked examples the test suite should use

1. **Frameless base, 762 mm wide, 18 mm sides, 3 mm reveal, two doors, full overlay.** Opening = 762 − 36 = 726 mm. Leaves = (762 − 6 − 3)/2 = 376.5 mm. Height: front region = 876.3 − 101.6 = 774.7 mm; door height = 774.7 − 6 = 768.7 mm. Each leaf overlays 15 mm of side.
2. **Face-frame base, 762 mm wide, 57.15 mm stiles, 3 mm reveal, two doors, full overlay.** Leaves = same 376.5 mm, but they overlay 54.15 mm of the frame each and the opening is 762 − 114.3 = 647.7 mm.
3. **Inset face-frame door in a 400 mm high opening, 3 mm reveal.** Door = 394 mm high and (opening width − 6) mm wide. Hinge: half-cranked (inset) hinge + appropriate plate; check minimum reveal for 19 mm door (≈1.2 mm) — 3 mm is fine.
4. **Paired inset doors on a shared stile.** Each door = (opening − 2 × reveal) / 2 would put the pair gap at 2 × reveal; use the correct formula: each leaf = `(opening − 2 × outsideReveal − centreGap)/2`. This is the kind of off-by-one-reveal error that ruins an inset kitchen.

---

## 8. Hinges and hinge boring

### 8.1 The standard cup hinge

Euro concealed hinge, 35 mm cup:
- **Cup diameter 35 mm**; cup depth **minimum 13 mm** ("All 35 mm and 8 mm holes must be a minimum of 13 mm deep") [S6]. The contract's 12.5 mm should be refined to **13.0 mm**. A 12.5 mm deep hole in a 19 mm door leaves only 6.5 mm of material, and the hinge cup bottom can bottom out; 13 mm is the manufacturer's minimum.
- **Cup centre distance from the door edge** depends on the boring distance B: cup centre = B + 17.5 mm. Blum's drill pattern shows B = 3–8 mm → cup centre **20.5–25.5 mm**, with B = 5 mm giving the common **22.5 mm** [S6][S7]. The Richelieu/Blum general-spec page also shows the reduced 3 mm boring distance / 20.5 mm centrepoint for Compact hinges [S7].
- **Screw pattern:** two screws; the Blum/Richelieu drawing shows a **45 mm** spacing between cup screw holes with a **9.5 mm** offset from the cup edge [S7]. The contract's `screwSpacing: 45` matches. This is the one hinge dimension I recommend the app treats as "verify against the specific hinge's drilling pattern": hinge families differ (Compact vs CLIP vs Sensys), and a wrong pattern means holes in the door. The catalogue should carry the value per hardware item.
- **Mounting plate:** the plate attaches to the cabinet side/stile on the 32 mm line with Euro screws or #6/#8 screws, or expansion dowels [S6]. Plate height + boring distance determine overlay via Blum's formula:

  **Overlay (per hinge) = fixed distance (FD) + boring distance (B) − plate height (H)** [S6]

  For CLIP top panel construction FD = 11 mm; example: B = 6, H = 0 → overlay 17 mm [S6]. The app can use this to validate a chosen hinge/plate against the door overlay computed in §7.1. **This formula is the correct way to answer "will this hinge give me the overlay I need?"** — a naive generator that only checks door size will produce doors that either rub or show a 10 mm gap.

- **Hinge adjustment ranges** (for the app's installation notes and for allowance in the drawing): side/overlay adjustment ±2 mm on Blum CLIP top; height ±2 mm; depth +3/−2 mm (Blum) [S6]. Hettich: 3D adjustment on all wing-plate hinges [S5]. This is why a 3 mm reveal plus a 2 mm adjustment range is a robust design: the installer can correct a few mm of error.

### 8.2 How many hinges

Manufacturer guidance (Salice/ARCAT master spec, which is a real manufacturer spec reproduced in an ARCAT section):

| Door condition | Hinges | Max door height | Max door width | Max weight |
|---|---|---|---|---|
| Standard light door | 2 | 36" (914 mm) | 24" (610 mm) | < 20 lb (9 kg) |
| Taller/heavier | 3 | 60" (1600 mm) | 24" (610 mm) | < 40 lb (14 kg) |
| Very tall | 4 | 84" (2000 mm) | 24" (610 mm) | < 60 lb (27 kg) |
| Extra tall | 5 | 96" (2400 mm) | 24" (610 mm) | < 60 lb (27 kg) |

Plus: **"Distance between the top and bottom hinge must be greater than the width of the door"** [S35]. Blum's chart uses the same shape (2–5 hinges vs door height 20"/40"/60"/80"/100" and weight bands 15/30/45/60 lb) [S6]. Hettich's example: a 1600 mm door gets three hinges at equal spacing [S5]. For a 19 mm chipboard door at 750 kg/m³ Hettich gives its own weight/height chart [S5].

**Recommendation for the engine:** auto hinge count by height thresholds **900 / 1600 / 2000 / 2400 mm** → 2 / 3 / 4 / 5, with a weight check (9/14/27/27 kg), and reject > 2400 mm door height for a 35 mm cup hinge. The contract's thresholds (900/1500/1900) are more conservative than the manufacturer's table; either is defensible, but the app should use the manufacturer's table and add the weight check. **Also enforce max leaf width 610 mm** [S35] and the "hinge spacing > door width" rule [S6][S35].

### 8.3 Hinge placement on the door

- Cup centre from the hinge edge: 22.5 mm default (B = 5 mm) [S6].
- Hinge vertical positions: hinges at a fixed distance from the door ends (shop practice: 75–100 mm from top/bottom for two hinges, with the top hinge typically 75–100 mm down), and middle hinges evenly spaced. For a 3-hinge door: top hinge ~80–100 mm from the top, bottom hinge ~80–100 mm from the bottom, third halfway; this satisfies the "spacing > door width" rule for doors up to ~700 mm tall. The app should calculate positions to satisfy the spacing rule for tall doors (e.g., a 1600 mm door with 3 hinges: 100 mm ends + 700 mm spacing — spacing 1400 > width, fine).
- **Inset hinges** need a half-cranked hinge plus a plate (Blum: inset application requires a half-cranked hinge and plate 175H5030.21) [S6]; the door is smaller by the reveal, so the hinge sits inside the opening.
- **Butt hinges** (alternative `hingeType`): traditional, visible, requires mortises in the door and frame; better for inset/face-frame traditional work, not for a frameless full-overlay kitchen. If the user chooses butt hinges, the app must emit mortise dimensions (length/width/depth by hinge size) and warn that the door reveal must equal the hinge knuckle clearance.
- **Zero-protrusion hinges** (for inset doors in a tight opening) and **170°/diagonal** hinges (for corner cabinets) are options the app should mention in the hardware notes, but they are not in the v1 option list.

---

## 9. Drawers

### 9.1 The box

A drawer is a five-sided box: two sides, front, back and bottom [S1]. The box carries the load; the front is decorative and attaches to the box (or is integral in a dovetailed through-front design). The main shop decisions:

**Box joinery (`drawerJoinery`):**

| Joinery | Strength | Look | Tooling / time | Best for |
|---|---|---|---|---|
| `dovetail` (through or half-blind) | Highest pull-out resistance; mechanical lock | Premium, visible on through-dovetails | Dovetail jig/router or hand; slower | Kitchen drawer boxes, especially wide/heavy drawers |
| `box-joint` (finger joint) | Very good; glued interlock | Decorative | Table saw jig or dedicated machine | Shop-made boxes, painted drawers |
| `butt-screw` | Adequate for light drawers | Visible fasteners unless hidden | Fastest | Shop fixtures, low-cost boxes; not for a kitchen showpiece |
| `dado` (rabbet/dado + glue/screw) | Good, especially with glue; resists racking | Hidden | Router/table saw + clamps | Production boxes, drawers with applied fronts |

Sources: the drawer-box joint descriptions follow the general shop practice in [S10] and [S14]; the through-dovetail detail — sides full length, front and back between or through — drives the box width formula below [S9][S10]. **For a 12.7 mm (1/2") side, dovetails are the default; box joints are the painted-cabinet alternative; butt-screw is the trap option for a kitchen.**

**Bottoms (`drawerBottom`):**

| Method | Construction | Notes |
|---|---|---|
| `dado` | 6 mm bottom in a 6 mm × 8–10 mm groove in sides and front, 25 mm up from the bottom edge | Strongest, standard for undermount slides; must be at the height the slide family requires |
| `rabbet` | Bottom sits in a rabbet around the sides, often with a centre support | Faster; less structural; fine for side-mount slides |

The bottom must be allowed to move: glue only the front edge or use a floating panel; a glued-in bottom can split the box as it expands. Recommended thickness: **6 mm (1/4") plywood** for a normal drawer [Contract], 9–12 mm for wide/heavy drawers. Side thickness: **12.7 mm (1/2")** is the shop-favourite for a fine-looking box [S9][S10]; 15.9 mm (5/8") is stronger for wide drawers; 18 mm is overkill and eats drawer width. The app should default to 12.7 mm and warn if a drawer is wider than 900 mm with 12.7 mm sides.

### 9.2 Slide sizing — the tables the generator needs

There are three slide families with completely different constraints. The single biggest source of wrong drawer boxes is substituting one family's clearance for another's.

**Undermount (Blum TANDEM 563 class):**

| Rule | Value | Source |
|---|---|---|
| **Inside** drawer width | opening width − **42 mm** (1-21/32") | Blum installation instructions quoted by PWW/Lost Art Press [S9][S10] |
| **Outside** drawer-box width (for any joinery) | inside width + 2 × side thickness = opening − 42 + 2t; with 12.7 mm sides ≈ opening − 16.6 mm (5/8" less) | derived from the rule above; PWW's shortcut "subtract 5/8" for 1/2" sides" [S9] |
| Drawer side depth | nominal slide length (21" slide = 21" sides through-dovetailed; shorten for half-blind front) | [S9][S10] |
| Bottom recess below sides | **1/2" (12.7 mm)** | [S10]; Richelieu TANDEM locking devices "designed for 13 mm drawer bottom recess" [S8] |
| Rear notch for locking devices | varies (35 mm on newer devices) | [S8] |
| Box height vs opening | box height ≤ opening − **13/16" (20.6 mm)** minimum (9/16" below + 1/4" above the sides) | [S9][S10] |
| Slide lengths | 9"–30" in **3" increments** (229–762 mm); 21" (533 mm) is the standard for a 24" base | [S9][S10] |
| Locking-device minimum inside width | 124 mm or 170 mm depending on device | [S8] |
| Cabinet rear clearance for the slide/bracket | **use ≥ 40 mm**; a nominal 24" slide does not fit a 24"-deep cabinet — use 21" | [S9][S10]; estimate for bracket clearance (mark unverified in the app help) |

**Side-mount ball-bearing (Accuride 3832 class):**

| Rule | Value | Source |
|---|---|---|
| Side space | **1/2" (12.7 mm) per side**, so box outside width = opening − 25.4 mm | Accuride 3832E product data [S37]; Lost Art Press "most require 1/2" on each side" [S10] |
| Box depth | can be shallower or deeper than the slide (only width is constrained) | [S10] |
| Height | slide profile ~1.8" (46 mm) high; drawer must clear it | [S37] |
| Load | 100 lb class (3832E) | [S37] |
| Notch/clearance | none required; drawer bottom position is free | [S10] |
| Use | shop drawers, file drawers, utility; visible when open | [S10] |

**Center-mount (Knape & Vogt 1175 class):**

| Rule | Value | Source |
|---|---|---|
| Side clearance | **1/8" (3.2 mm) each side** — total 1/4" (6.35 mm) | KV 1175 product data [S38] |
| Height | slide is 1" high; drawer bottom rides on it | [S38] |
| Box depth | drawer must be **1-1/4" (31.75 mm) shorter than cabinet depth** | [S38] |
| Use | economy drawers, rollout trays, shop cabinets | shop practice |
| App note | the contract's `centerMountClearance: 50` is **wrong as a width clearance**; it should be ~6.35 mm width and ~31.75 mm depth. Flag to the Lead; do not ship 50 mm. |  |

**Slide-length selection logic the app should use:**
1. Compute the box depth limit: frameless → interior depth (cabinet depth − back thickness − front overhang if applicable); face frame → cabinetry depth minus frame.
2. For undermount, pick the largest nominal slide length ≤ (interior depth − rear clearance, ~40 mm). For a 24" base (interior depth ≈ 590–604 mm) this yields 21" (533 mm) correctly — **a naive "largest standard length ≤ depth" would pick 600 mm and produce a box/slide that does not fit.**
3. For side-mount, box depth can equal the chosen slide length; the slide itself needs its own length in the cabinet (choose ≤ interior depth − 25 mm).
4. For center-mount, box depth = interior depth − 31.75 mm; the slide is cut to size.

### 9.3 Drawer fronts and gaps

- Front heights: stacked from the top of the front region downward, 3 mm gaps between fronts and at the edges. Contract default (top drawer min(180 mm, 25% of region), minimum 90 mm) is ergonomically sound; a 90 mm front is small for a kitchen but fine for cutlery/utensils. Warn under 90 mm (hard to pull, looks wrong).
- **Full-overlay drawer fronts** are sized like doors: front width = cabinet width − 2 × reveal (or per-opening + overlay), height = row height − reveal. **Inset drawer fronts** = row height − 2 × reveal, and the box must be positioned so the front sits inside the opening — the undermount locking devices' side/height adjustment is what makes this achievable [S10].
- **Drawer front vs box:** for applied fronts, the box is sized to the opening (per the slide family) and the front is screwed to the box from inside with washer-head or adjustable screws; do not size the box to the front. Under-mount locking devices give 3D adjustment of the face relative to the box [S8][S10] — the app should note this in the assembly step ("fit the face last, adjust, then lock").
- **Gaps:** 3 mm all around; for inset drawers, the reveal plus the slide's side adjustment range determines how tight you can go (shop practice; 2–3 mm standard).
- **Pull placement:** drawer pulls centred horizontally; vertically centred on standard drawers, raised toward the top on deep drawers; **pull length about 1/3 of the drawer width**, with two pulls once the drawer exceeds roughly 24–30" (610–762 mm) [S41]. Doors: pull on the side opposite the hinges, 50–75 mm (2–3") in from the corner: low on wall doors, high on base doors [S41]. Shaker doors: centre the pull on the stile, aligned with the inner edge of the rail [S41]. Bob Vila's "one-third rule" agrees on pull-to-face proportion [S39]. The app's `pull-bar-128` (128 mm centres) suits drawers up to ~400 mm; a wider drawer needs two pulls or a longer bar.
- **Drawer slides should be installed before the drawer front is fitted** and with the drawer box out of the cabinet where possible; undermount locking devices are easier to fit on the bench. Mounting slides on the flat panel before carcass assembly is standard frameless practice (WOODWEB) [S18].

### 9.4 5/8" vs 1/2" box sides

| Side thickness | Pros | Cons | Best use |
|---|---|---|---|
| 12.7 mm (1/2") | Lighter, more interior width, "finer" look; the shop favourite [S9][S10] | Less screw/glue area; wide drawers benefit from a stiffener; dovetail pins are small | Kitchen drawers up to ~750 mm wide |
| 15.9 mm (5/8") | Stronger; better for wide/heavy drawers, file drawers; more forgiving joinery | Heavier; loses ~6.4 mm of width; looks chunkier | Wide drawers, pull-outs, heavy pan drawers |
| 18–19 mm (3/4") | Strongest; accepts standard hardware | Loses width; overkill; heavy | Shop/utility, specialised drawers |

**Rule for the app:** default 12.7 mm; force 15.9 mm when drawer box width > 800 mm or when the drawer is a pull-out rated > 30 kg; warn if a 12.7 mm box is wider than 900 mm. Undermount slides are available for 1/2" to 3/4" sides (Richelieu TANDEM listings specify runner ranges) [S8].

---

## 10. Materials and edge treatment

### 10.1 Sheet goods — the app's material table

| Material id | Product | Nominal thickness | Actual / tolerance | Sheet size | Grain | Where it belongs |
|---|---|---|---|---|---|---|
| `ply-birch-18` | Baltic birch plywood, 18 mm, B/BB | 18 mm | 0.703" class for 23/32 nominal; Baltic spec ±0.4 mm at 18–24 mm [S25]; common 4×8 or 5×5 sheets [S25] | 1525 × 1525 and 1220 × 2440 [S25] | yes | Carcass sides, shelves, drawer boxes, exposed edges if banded |
| `ply-birch-12` | Baltic birch 12 mm | 12 mm | ±0.4 mm (18–24 class); [S25] | 1220/1525 | yes | Drawer boxes, dividers, back stiffeners |
| `ply-birch-6` | Baltic birch 6 mm | 6 mm | ±0.2 mm [S25] | 1220/1525 | yes | Backs, door panels (veneered), drawer bottoms |
| `ply-veneer-18` | Veneer-core cabinet plywood (maple/oak/birch face), 3/4" nominal | 18.3 mm (23/32 CAT = 0.703") [S23] | +0/−1.6 mm sheet tolerance [S23]; actual thickness varies with core | 1220 × 2440 | yes | Paint/stain-grade carcass where Baltic birch is unavailable |
| `mdf-18` | MDF, 18 mm | 18 mm | ~18.0–18.3 mm; stable, heavy | 1220 × 2440 | no (uniform) | Painted doors, drawer fronts, face frames, panels |
| `mdf-12` | MDF, 12 mm | 12 mm | — | 1220 × 2440 | no | Door panels, applied mouldings |
| `mdf-6` | MDF, 6 mm | 6 mm | — | 1220 × 2440 | no | Door panels, templates, back panels (paint grade) |
| `melamine-18` | Melamine-faced particleboard, 18 mm | 18 mm | PB core; TSCA/CARB compliant products available | 1220 × 2440 | no | Budget/utility carcass, shop cabinets, closet interiors |
| `particleboard-18` | Raw particleboard, 18 mm | 18 mm | — | 1220 × 2440 | no | Substrate; never exposed in a kitchen |
| `hardwood-poplar` | Poplar, 4/4 milled | 19 mm | planed to 3/4"; sold by board foot | (board stock) | yes | Painted face frames, door frames, applied mouldings |
| `hardwood-maple` | Hard maple, 4/4 milled | 19 mm | planed to 3/4" | (board stock) | yes | Stain-grade door frames, drawer fronts, face frames |
| `hardwood-oak` | Red/white oak, 4/4 milled | 19 mm | planed to 3/4" | (board stock) | yes | Stain-grade traditional work; open grain shows finish |

Sources: Baltic birch dimensions and thickness tolerances [S25]; plywood performance-category thicknesses (23/32 CAT = 0.703", 19/32 CAT = 0.578", 15/32 = 0.453", 1/4 CAT = 0.234") [S23]; APA's explanation of performance categories and labelling [S24]; MDF/particleboard properties and their ANSI standards (ANSI A208.2 MDF, ANSI A208.1 particleboard) [S26]. **Important for the app:** nominal 3/4" plywood is **not** 19.05 mm. The finished-thickness difference (17.85–18.3 mm typical) matters when a 19 mm face frame is supposed to be flush with a plywood side. The engine should use the material's actual thickness for geometry and let the face frame be 19 mm unless the user wants flush. This is a classic naive-generator bug: mixing nominal 18 mm and actual 17.85 mm produces 0.15 mm steps and, over a run, visible misalignment.

**Grain and finish implications:** sheet goods with a face veneer have a grain direction; cut list and nesting must honour `grain: true` (rotate parts only if the part can be rotated without crossing grain: e.g., a shelf can rotate relative to the sheet only if the sheet grain direction is acceptable; for a visible shelf, grain usually runs lengthwise). Baltic birch has little figure but a discernible face grain; for painted work, grain is irrelevant except for veneer checking. MDF has no grain and machines cleanly, making it the preferred substrate for painted raised-panel doors and drawer fronts [S19][S26]. Melamine/particleboard is dimensionally stable but has poor screw-holding in the face; use confirmats and system holes, not drywall screws.

### 10.2 Sheet sizes and yield

- Standard North American sheet: **1220 × 2440 mm (4 × 8 ft)**; the app's default [Contract]. Trim and kerf defaults (10 mm and 3 mm) are reasonable: a 3 mm kerf is a typical 10" cabinet blade; use 4 mm for a thin-kerf or a coarse blade.
- Baltic birch is commonly sold **1525 × 1525 mm (5 × 5 ft)** as well as 4 × 8 [S25]; the app's sheet-layout should let the user pick the sheet per material. A 5×5 sheet changes yield dramatically for carcass sides (a 762 mm-tall side fits two-up in 1525 mm with the 762 dimension along the sheet).
- Common 4×8 yield reality: the app's nesting must account for trim (10 mm off each edge), kerf, and the grain lock; a naive 100% nesting will over-promise sheets by 10–15%.

### 10.3 Edge banding

| `edgeBanding` | Thickness | How applied | Best for | Notes |
|---|---|---|---|---|
| `pvc-0.5` | 0.5 mm PVC | Iron-on or PSA (peel-and-stick) | Carcass front edges, shelves, interior edges in melamine/PB boxes | Fastest; the default [Contract]; surface can telegraph through paint; trim carefully |
| `pvc-2` | 2 mm PVC | Glue-pot edgebander or hot-air with care | Exposed shelf edges, drawer box top edges, door edges that get knocked | Durable, radiused feel; harder to apply well in a small shop; shop advice: on a hot-air bander stay ≤1 mm [S28] |
| `wood-tape` | 0.5 mm veneer/wood tape | Iron-on | Stain-grade plywood edges, shelves | Takes stain (test first); can lift at edges; finish compatibility matters |
| `none` | — | Solid lipping or paint only | Painted MDF edges (sealed), solid-wood parts | Paint-grade MDF edges must be sealed/primer + sanded or they show; a 3 mm solid lipping is an option the app should mention |

Sources: FastCap's application guidance for PVC/wood PSA and iron-on banding — 15/16" (23.8 mm) wide banding is the standard for 3/4" stock; 3/4" wide banding for 1/2" and 5/8" stock [S27]. WOODWEB's edgebander discussion confirms the common banding thicknesses (0.5/1/2 mm) and the trade-off: thin PVC bonds more easily but is less durable, thick PVC needs a glue-pot machine or careful hot-air work [S28]. **The app's `edgebandThickness` mapping is correct.**

**Edge-banding + finish interaction** (important for the plan set's finish notes):
- Band **before** finishing; trim flush, then sand the joint lightly — a proud band shows a witness line under paint.
- PVC does not take stain/paint the same way as wood; for stain-grade work use wood tape or solid lipping, and always test the finish over the banding.
- 0.5 mm PVC on a painted shelf can telegraph the substrate; 2 mm PVC gives a cleaner painted edge.
- Band the **front edges of carcass sides** (door-facing edges), shelf front edges, drawer box top edges, and any exposed gable end. The KCMA standard requires exposed edges to be edge-banded or finished ("exterior exposed surfaces and edges except the edges of sides and the edges of back panels shall be free of saw marks … filled and sanded, edge-banded or otherwise finished") [S1].

### 10.4 Solid stock notes

- Face-frame stock: 19 mm (3/4") thick, 57.15 mm stiles; poplar for paint, maple/oak for stain. PWW's method uses 13/16" (20.6 mm) face frame stock with a 1/16" bumper between door and cabinet to make the door close flush [S14] — a nuance the app can ignore in v1 (19 mm default) but should note in the report's evidence.
- **Door-frame stock must be straight-grained and milled in stages** to stay flat [S14]; the app should recommend quartersawn or rift stock for painted doors when available.
- Hardwood is sold by board foot; the cut list must roll up linear/board footage separately from sheet goods (the contract's `sheet` structure cannot express board stock; the app should add a solid-stock summary line).

---

## 11. Hardware catalogue and placement rules

The catalogue's `hardware` array should carry realistic templates. The report's hardware logic:

| Item | qty basis | Placement / install rules |
|---|---|---|
| Euro cup hinge 110° (full overlay) | 2 per door up to 900 mm high, 3 up to 1600, 4 up to 2000, 5 up to 2400; weight limits 9/14/27 kg | Cup 35 mm Ø × 13 mm deep; cup centre 22.5 mm from hinge edge (B = 5 mm); plate on the 32 mm line; hinge spacing > door width [S6][S35] |
| Euro hinge, half-cranked/inset | Same counts | Inset application needs half-cranked hinge + matching plate [S6]; check minimum reveal [S36] |
| Butt hinge | 2–3 per door; heavier doors 3 | Mortised into door edge and frame; knuckle projection determines reveal; visible |
| Undermount soft-close slide | 1 pair per drawer | Inside drawer width = opening − 42 mm; 12.7 mm bottom recess; locking devices adjustable [S8][S9] |
| Side-mount ball-bearing slide | 1 pair per drawer | 1/2" per side; box width = opening − 25.4 mm [S37] |
| Center-mount slide | 1 per drawer | 1/8"/side; box 1-1/4" shorter than cabinet depth [S38] |
| Bar pull 128 mm | 1 per door/drawer; 2 per wide drawer > ~610 mm | Drawer: centred, 1/3 of drawer width; two pulls > 24–30"; doors: opposite hinge, 2–3" from corner [S41] |
| Knob 32 mm | 1 per door/drawer | Same placement; knob projection must clear adjacent door/drawer (3 mm gap → knob must not overlap neighbour) |
| Shelf pin 5 mm | 4 per adjustable shelf (2 front/2 rear on each side) | 5 mm holes on 32 mm pitch, 37 mm front setback [S5] |
| Confirmat 7 × 50 mm | 3–4 per carcass joint | 5 mm pilot in edge, 7 mm through hole; keep ≥ 50 mm from ends (AWI 36 mm edge distance cited by shop practice [S19]) |
| Leveler foot | 4 per base (6 for wide) | Under platform corners/centres; adjustment range should cover floor variation |
| Hanging rail | 1 per wall/tall cabinet | Steel or hardwood rail fixed to wall; hook brackets or cleat on cabinet; must carry KCMA wall load [S1][S16] |
| Door bumper | 1–2 per door | On the closing edge/face frame so the door does not rattle |
| Wood dowel 8 mm | per dowel joint (2–3 per carcass joint) | With glue and clamps [S15] |
| Pocket screw 32 mm (fine thread) | 2–3 per face-frame joint | Kreg-style jig; hidden face |
| Magnet catch | 1 per non-self-closing door | Align with steel plate; not needed with spring hinges |

**Quantity rules the generator should implement:** hinges = auto by height + weight (with min 2); slides = 1 pair per drawer; shelf pins = 4 per adjustable shelf; pulls = 1 per front (2 over width threshold); confirmats = 3 per side-to-bottom and 3 per side-to-top joint for a base (adjust to length: 4 for tall sides); dowels = 2 per short joint/3 per long; levelers = 4 + 2 per extra 600 mm of width. **Hardware counts matter for the plan set and the shopping list**, and they are also a validation surface: a door with 2 hinges and 40 lb weight is a failure the app can catch before the owner drills.

---

## 12. Finishes and shop sequence

### 12.1 Paint grade vs stain grade

- **Paint grade:** poplar or MDF frames, MDF or paint-grade plywood panels; the finish hides grain and tolerates wood filler. MDF is an outstanding substrate for painted doors and raised panels because it machines cleanly and is dimensionally stable [S19][S26]. Paint-grade work needs a primer/sealer that blocks MDF edge absorption and a topcoat with enough build to hide the substrate.
- **Stain grade:** maple, oak, cherry, walnut; the finish must be chosen so it does not muddy the grain. Water-based clear coats are non-yellowing; oil-based urethanes and nitrocellulose lacquers amber over time (which may be desired on oak/cherry) [S31][S32].
- The app's finish options should carry **finish compatibility** per material (the `materials.finishCompatibility` field) and warn when a stain-grade finish is chosen on MDF or melamine (no grain; melamine needs a bonding primer or should be left as a laminate).

### 12.2 The finish menu

| `finish` | What it is | Best for | Application facts | Watch-outs |
|---|---|---|---|---|
| `paint` | Water-based or alkyd paint + primer | Paint-grade shaker/slab kitchens | Spray or brush; 1 primer + 2 topcoats; sand 220–320 between | MDF edges need sealing; brush marks on wide slabs; cure before heavy use |
| `lacquer` | Pre-catalysed nitrocellulose lacquer | Fine furniture/kitchen doors, stain-grade | Ready to spray; dry to sand 30–45 min; max properties after ~30 days [S32] | Flammable; strong solvent odour; ambering over time [S32] |
| `water-poly` | Water-based acrylic/polyurethane topcoat | Cabinets, low-odour shops, DIY-friendly | 3 coats minimum; recoat 2+ h; full cure ~21 days [S31] | Does not amber; can look "plastic" on dark woods; raised grain on first coat |
| `hardwax-oil` | Penetrating hardwax oil (Osmo Polyx class) | Natural-look oak/ash, furniture-style kitchens | Thin coats; buff out; easy spot repair | Not a film finish; lower chemical resistance than CV/lacquer; needs re-oiling; water rings possible |
| `stain-lacquer` | Stain + sealer + pre-cat or CV topcoat | Stain-grade maple/oak kitchen | Stain, seal, 2–3 lacquer coats [S32][S30] | Blotching on maple; spray equipment and ventilation |

- **Conversion varnish (acid-catalysed, 2K):** the hardest, most chemical-resistant kitchen finish; General Finishes' water-borne "Conversion Varnish" TDS gives the process pattern: catalyst 10:1, **pot life 6 hours**, 2–3 coats, sand with 320 between coats, spray application (HVLP 0.051" tip or conventional 0.40" fluid tip) [S30]. Use for a hard-working kitchen if the shop can handle the chemistry.
- **Water-based conversion varnish / 2K poly** is the modern small-shop alternative: excellent durability with lower odour; still requires spray equipment and a clean environment.
- Curing: the KCMA finish tests age the film a minimum of 10 days before testing [S1]; shop practice is to leave doors/drawers to cure 7–21 days before installation and to avoid stacking them face-to-face during cure.
- KCMA's finish tests are the specification worth quoting in the app's finish notes: 24 h at 49 °C/70% RH (shrinkage/heat), 5 hot-cold cycles, chemical spot tests (lemon/orange/grape juice, ketchup, coffee, vinegar, olive oil, 100-proof alcohol, detergent; mustard at 1 h), detergent-and-water edge soak (24 h for seam-free doors, 4 h for edgebanded/rigid-thermofoil doors), and water-holdout on interior shelves [S1]. A small shop cannot run these tests, but the **construction implication** is real: edgebanded doors are specifically tested for edge delamination, so banding quality and finish coverage on edges matter [S1].

### 12.3 What to finish before assembly

The finish schedule should minimise handling of finished parts:

1. **Prefinish interior surfaces** — carcass sides, bottom, shelves, drawer box parts — before assembly. Prefinished plywood saves a whole finishing pass and avoids spraying inside boxes [S14]. If not available, seal and topcoat the interior parts flat on a table.
2. **Finish the interior before the back goes on** (or use prefinished back material).
3. **Finish face frames and door frames before assembly where the joint will be visible**, but not the glue surfaces: mask/tape glue areas; PWW's face-frame method finishes the frame assembly before attaching it to the carcass [S14].
4. **Finish doors and drawer fronts off the cabinet**, on a flat rack, both faces and all edges; this is best practice for an even film and balanced movement [S1].
5. **Final touch-up after installation** (nail holes, scratches) is unavoidable; plan for a touch-up kit.

### 12.4 Safety (brief)

- Spray finishing of flammable coatings is regulated: OSHA 1910.107 requires a **power-ventilated spray booth** with average air velocity not less than **100 linear feet per minute** over the open booth face (60 fpm for electrostatic), noncombustible booth construction, grounding/bonding of metal parts and containers, no ignition sources in the spraying area, and approved containers for flammable liquids [S33]. A hobbyist spraying conversion varnish or lacquer in a garage is outside OSHA's employer scope but the physical hazards are the same: use an explosion-proof fan, ground the work and the gun, and keep solvent containers closed.
- Water-based finishes reduce solvent exposure but are not harmless: spray mists and isocyanates (in 2K products) require respiratory protection. Use a supplied-air or properly fitted organic-vapour/P100 respirator when spraying, and don't rely on a dust mask.
- Wood dust is a known respiratory hazard and a fire/explosion hazard in a shop; the app's finish/assembly notes should include a one-line "extraction on, mask on" reminder. (Shop safety practice; not a specific citation beyond general OSHA regulation.)

---

## 13. Assembly order

The canonical sequence below is assembled from the PWW school method [S14], the WOODWEB shop threads [S15][S16][S18] and the hardware manufacturers' installation logic [S5][S6][S8]. It is written to be directly translatable into the app's `AssemblyStep[]` data. The key principle: **do every machining operation that needs the part flat and bare before assembly** (system holes, hinge plate holes, slide screw holes, confirmat holes, dadoes), **edge band before assembly**, and **finish items before hanging**.

### 13.1 Frameless base cabinet

| # | Step | Details / QC |
|---|---|---|
| 1 | Cut and band parts | Sides, bottom, stretchers, back, shelf; band front edges of sides and shelf front; kerf/trim per sheet layout |
| 2 | Bore system holes | Drill the 5 mm line(s) in both sides: front row 37 mm from front edge, 32 mm pitch; use the same settings for hinge plate, slide and shelf-pin holes [S5][S18] |
| 3 | Machine joinery | Confirmat pilot/through holes (5/7 mm), or dowel/biscuit/dado; drill hinge plate screw holes on the 32 mm line if the plate goes on the side/top rail |
| 4 | Pre-finish interior | Seal/topcoat bare interior faces; touch up banding |
| 5 | Assemble carcass | Bottom and stretchers between sides; glue + fasteners; check square by diagonals (aim ≤ 1.5 mm difference across the front opening; PWW says within 1/16" [S14]) |
| 6 | Install back | Applied/rabbeted/dadoed; screw every 100–150 mm (PWW: every 4" on centre for a 1/2" back [S14]); re-check square |
| 7 | Toe kick / levelers | Build/level platform; fit leveler feet; kick face is cut and fitted **after** the run is level and fixed [S40] |
| 8 | Set and join cabinets | Level, shim, clamp cabinets to each other through the 32 mm holes (sleeve nuts/bolts or screws); fix to wall through the back or hanging rail [S14][S16] |
| 9 | Install slides and hinge plates | Use system holes; slide front setback per manufacturer; confirm plate heights match overlay |
| 10 | Install shelves | Pins and shelves; check shelf clearance and front setback |
| 11 | Fit drawer boxes | Insert, check slide engagement, adjust locking devices |
| 12 | Hang doors and fit fronts | Doors on hinges, drawer fronts on boxes; set reveals to 3 mm; adjust 3D |
| 13 | Pulls, bumpers, final QC | Pulls per placement rules; bumpers; check every door/drawer for rub, twist, and reveal consistency; touch up |

### 13.2 Face-frame base cabinet

Adds two operations to the frameless sequence: build the face frame (pocket screws, biscuits, dowels or mortise-tenon) and attach it to the carcass (glue + biscuits/pocket screws), then finish/flush the frame before hardware. Practical order:

1. Cut/bore/machine carcass as above; **do not bore hinge plate holes yet** if the plates mount to the face frame.
2. Assemble the face frame on a flat table; check square and rail alignment; pocket screws or biscuits + glue [S14].
3. Attach the frame to the carcass with glue and alignment biscuits/screws; flush the frame to the carcass inside and out; sand the joint; fill and finish [S14].
4. Bore hinge plate holes on the stiles (using the 32 mm line if the stiles are wide enough, or a face-frame plate pattern), and slide holes on the cabinet sides.
5. Proceed as frameless steps 7–13; scribe the frame stiles to the wall at installation [S14].
6. **If the face frame is applied as a finished assembly after the boxes are joined** (the "facing" method), the order is: build and join boxes → level and fix → apply facing → hardware → fronts. This is the fastest route for a long run [S14].

### 13.3 Wall cabinet

1. Cut and band parts; bore the 32 mm line in the sides for hinge plates and shelf pins [S5].
2. Assemble the carcass; install the back while square [S14]. If the back is 6 mm, fit a hanging rail or nailer at the top inside; if the design hangs from a steel rail, install the hanging brackets now [S16].
3. Fit the hinge plates to the sides (or face frame) and the shelf pins.
4. Finish the interior and the cabinet.
5. Install the wall rail/cleat; hang the cabinet; level and align with adjacent cabinets; join the cabinets through the system holes.
6. Fit doors; adjust reveals; fit the valance/light rail/under-cabinet skin if the design has one (PWW's upper cabinet has a 1/4" skin covering the carcass bottom [S14]).
7. Pulls and bumpers.

### 13.4 Tall / pantry cabinet

1. The tall side panels may exceed the sheet length; plan a joint or use a 2440 mm sheet with the side height ≤ 2300 mm; if the design height is 2133.6 mm, it fits a 2440 mm sheet with trim.
2. Assemble square and check square with diagonals; install the back and any fixed mid shelves.
3. **Anchor the tall cabinet to the wall at top and bottom** (anti-tip is both a safety requirement and a stability requirement; tall cabinets are the most likely to tip).
4. Fit 3–5 hinges per door (3 for ≤ 1600 mm, 4 for ≤ 2000 mm, 5 for > 2000 mm) [S35].
5. Fit adjustable shelves and hardware; final QC.

### 13.5 QC checklist (use as a validation report at the end of the plan set)

- [ ] Every carcass square within 1.5 mm on diagonals.
- [ ] Every door/drawer reveal within ±0.5 mm of the selected reveal.
- [ ] Every door closes against the stop/bumper without rocking; hinges adjusted so the door is flush with the frame.
- [ ] Every drawer runs full travel without rub; front flush and reveal consistent.
- [ ] Every shelf sits flat, front edge banded, pin clearance correct.
- [ ] All exposed edges banded or finished.
- [ ] All system holes usable (not blocked by joinery or slide screws).
- [ ] All hardware counts match the schedule (hinges per door, pairs per drawer, pulls per front).
- [ ] Backs/rails/anchors installed; wall cabinets rated for load.
- [ ] Finish cured, touch-ups done, interior clean.

---

## 14. Shop-drawing and cut-list conventions

### 14.1 What a cabinet plan set should contain

AWI's submittal standard (ANSI/AWI 0100, draft August 2025 — treat as the current published guidance available at the time of research) sets the professional expectation [S34]:

- **Drawing scales:** metric **1:20 plan/elevation/section, 1:10 section, 1:5 detail**; imperial equivalents **3/4" = 1', 1" = 1', 1-1/2" = 1', 3" = 1'** [S34].
- **Sheet size:** hard-copy sheets a minimum of **279 × 432 mm (11 × 17 in)** if the set is submitted as drawings [S34].
- **Casework drawings:** plan, elevation and section views with dimensions necessary to construct the product; a reference plan showing the location of each cabinet; a section of each cabinet type; door construction materials and dimensions; countertop sections; field dimensions and dimensions above finished floor [S34].
- **Electronic submittals in PDF** [S34]. (Cabinet Studio's PDF export is exactly this deliverable; the DWG/DXF is a bonus for the CNC shop.)
- **ANSI/ASME Y14.5** is the dimensioning-and-tolerancing standard for engineering drawings; Cabinet Studio does not need full GD&T, but should follow its principles for dimension placement, datum selection and tolerance communication [S42].

For this user's plan set, the practical contents are:

1. **Cover sheet** — project, client, date, scale list, sheet index, finish schedule, hardware schedule, construction notes.
2. **Elevations** — front elevation of every wall/run, with cabinet tags, dimensions to cabinet edges and openings, countertop/ceiling/appliance lines, wall cabinet mounting height.
3. **Plan** — cabinet layout, depths, toe-kick line, appliance openings, clearances (NKBA 42"/48" aisles, 24"/30" cooktop clearance [S3]).
4. **Cabinet typicals** — front, side section, plan section for each cabinet type; door/drawer layout; shelf layout.
5. **Component drawings** — each part: face A/B views, dimensions, machining symbols (holes with diameter/depth, grooves/rabbets with width/depth), grain direction, edgeband note, part number.
6. **Cut list** — grouped by material/thickness with part number, qty, dimensions, grain, edgeband, notes [S12].
7. **Sheet layout / yield** — nesting diagrams with kerf and trim, plus a sheet count and yield %.
8. **Assembly sequence** — illustrated steps, hardware call-outs, QC checklist.
9. **Hardware schedule** — item, model, qty, cabinet tags, install notes.
10. **Detail sheet** — door section, drawer box section, back detail, toe-kick detail, hinge boring pattern.

### 14.2 Cut-list conventions

Hank Gilpin's Fine Woodworking method is the best short statement of what makes a cut list useful [S12]:
- **A 3/4-view sketch on the same page** as the parts list — it lets anyone in the shop picture the part and its orientation.
- **A part letter** used on the sketch, the list and the workpiece; parts that are alike get the same letter. (For cabinets, the app's stable part numbers do this better than letters; keep both: a part number and a short label.)
- **Columns:** item/letter, description, quantity, thickness, width, length, rough length, material, notes. Gilpin adds detail sketches and uses the notes column for unusual joinery or shaping [S12].
- **Rough vs finished dimensions** — cabinet parts benefit from a rough-length column for solid stock and a finished-dimension column for sheet parts; the app's cut list should show both.
- **The app-specific fields** the contract already defines — material, thickness, length, width, grain, edgeband, notes — are the right set. Add: part number, cabinet tag, face/material face, banding edges, and a "check" column for shop use.

### 14.3 Part numbering and balloons

- Number parts **per cabinet with a stable key** (`B1-03`) and keep the number through every revision; the plan-set balloons reference it.
- Number orientation: front elevation balloons point to the visible part; component drawings carry the same number; the assembly illustrations use balloons for hardware and parts.
- A balloon table (legend) on the assembly sheet is better than repeating long part names on the drawing.
- **The app should also number doors/drawer fronts separately** (`B1-D1`) and list them on a front schedule, because doors are often made later (or outsourced) and their sizes/gaps must be traceable [S9][S12].

### 14.4 Dimensioning style

- Dimension to **machined faces and reference edges**, not to nominal sheet edges (a 18 mm plywood edge is not at a round number).
- Avoid chains of small dimensions that accumulate error; use a mix of overall and locating dimensions (Y14.5 principle) [S42].
- Show **openings** as the driving dimensions for front/door sizing, and show the calculated door/front size separately (with the reveal note).
- Imperial display in fractional inches to 1/32" with metric in parentheses (or vice versa) per the project's units; the app's formatting layer already does this [Contract §3].
- Do not dimension the same feature twice from two different references (conflicting dimensions are a shop error magnet).

### 14.5 Sheet layout and yield

- Nest by material and grain direction; put the largest parts first, then fill.
- Account for trim (10 mm) and kerf (3 mm) [Contract].
- Show a **sheet count** and a **yield %**; a realistic first-pass yield for cabinet parts is 70–80% (shop practice; not a standard). Warn when yield < 60%.
- Baltic birch 5×5 sheets change the nesting; let the layout choose the sheet size per material [S25].
- Off-cuts: the plan set should print a small "offcut inventory" list so the shop keeps usable pieces (shop practice).

---

## 15. What the app should offer, and what it should refuse

### 15.1 The option set (v1)

Ship exactly the contract's option ids (below), plus these **additions** I recommend after research (report to the Lead, do not rename anything):

| Group | Add | Why |
|---|---|---|
| `drawerSlide` | — (keep 3) | The three families cover the small-shop market |
| `hingeType` | suggest later: `euro-inset` / `euro-zero-protrusion` | Inset kitchens need them; v1 can model inset with the existing half-cranked hinge note |
| `doorOverlay` | keep `full` + `inset`; document `half` as a face-frame sizing rule, not a picker value | Contract says half overlay is documented in research, not a generator mode |
| `backStyle` | keep 4 | `none` should be refused for wall cabinets |
| `toeKickStyle` | keep 5 | `flush-base`/`none` should warn for base cabinets |
| Materials | add `ply-prefinished-18` (prefinished maple/birch plywood) | PWW's method depends on it [S14]; it saves a whole finishing pass |
| Hardware | add `hinge-euro-inset`, `hinge-plate-cross`, `magnet-catch`, `toe-kick-clip` | Needed by real assemblies |

Everything else required by the contract exists and is populated in `techniques.js`.

### 15.2 What the app should refuse or warn about (the traps)

A naive generator sizes boxes from nominal dimensions, computes doors from overall width, and emits no warnings. These are the failure modes to prevent:

1. **Drawer box too narrow for undermount slides.** The 42 mm rule is an *inside width* clearance; using it as an outside clearance produces a box ~25 mm too narrow that no locking device can rescue. (Contract §4 formula needs correction — see §15.3.)
2. **Slide longer than the cabinet can take.** A "largest standard ≤ depth" rule picks a 600 mm slide for a 24" base; the slide and drawer will not fit. Enforce 21" (533 mm) for a 24" box with a rear-clearance rule.
3. **Door wider than the hinge's rated leaf width, or taller than its hinge count allows.** Max leaf 610 mm and the 900/1600/2000 mm thresholds with weight limits [S35].
4. **Inset door below the minimum reveal for its thickness/boring distance**, causing binding [S36].
5. **Paired doors with a centre gap that disappears** when the two leaves' widths are rounded independently, or when the reveal is applied twice on one side.
6. **Solid-wood panel with no expansion allowance** — the door splits the frame in summer [S13].
7. **Shelf span over the material's limit** (18 mm at > 900 mm with kitchen load) — sag [S1][S22].
8. **Toe-kick drawer or door in a 4" toe space with no clearance**; or a toe kick below KCMA/ergonomic minimum.
9. **Face-frame door overlay that the chosen hinge/plate cannot reach** (plate height + boring distance vs required overlay) [S6].
10. **Wall cabinet with a thin back and no hanging rail/nailer** — pull-out failure under KCMA's 600 lb test [S1][S16].
11. **Cabinet width > 1219 mm as one section** — doors/shelves need a divider; also hard to handle.
12. **Tall cabinet side panel longer than the sheet** (e.g., 2133.6 mm side + trim/kerf on a 2440 sheet is fine; 2300 mm is not) — the app should check the part against the sheet and propose a joint or a different sheet.
13. **Hinge/slide screw holes that collide with shelf-pin holes or joinery** — the 32 mm line is shared; run a clash check.
14. **Drawer front heights that don't fit the front region** (rounding, gaps) — warn and re-distribute.
15. **Pull size/quantity wrong for the drawer width** (one 128 mm pull on a 900 mm drawer) [S41].
16. **Stain finish over MDF/melamine without a bonding primer** — finish/material incompatibility [S26][S31].
17. **Missing edge banding on exposed edges** — KCMA's finish requirement [S1].
18. **Wall cabinet above a range closer than 24"/30"** — NKBA clearance [S3].
19. **A door or drawer front whose grain direction is impossible on the available sheet** (grain-locked part wider than the sheet's usable width).
20. **Doors and drawer fronts whose cumulative gaps don't add up** to the front region (off-by-one reveals at ends vs between rows).

### 15.3 Numeric corrections to the contract defaults (report to the Lead)

These are the research-driven refinements; the catalogue's `standards` block carries the final values.

| Item | Contract value | Research value / recommendation | Evidence |
|---|---|---|---|
| Hinge cup depth | 12.5 mm | **13.0 mm minimum** | Blum: "all 35 mm and 8 mm holes must be a minimum of 13 mm deep" [S6] |
| Hinge count thresholds | 900 / 1500 / 1900 mm | **900 / 1600 / 2000 / 2400 mm**, with weight limits 9/14/27/27 kg and max leaf 610 mm | Salice/ARCAT manufacturer spec [S35]; Blum chart [S6] |
| Undermount width clearance semantics | box width = opening − 42 mm | **inside width = opening − 42 mm; box outside width = inside + 2 × side thickness** (≈ opening − 16.6 mm for 12.7 mm sides) | Blum instruction quoted by PWW [S9] and Lost Art Press [S10] |
| Undermount rear clearance | 15 mm | **≥ 40 mm** (21" slide in a 24" cabinet; 24" slide does not fit) | PWW [S9]; estimate for bracket clearance = **unverified**, recommend 40 mm |
| Side-mount width clearance | 25 mm | **25.4 mm total (12.7 mm per side)** | Accuride 3832E [S37] |
| Center-mount clearances | 50 mm width | **6.35 mm total width (1/8" per side)**; depth = cabinet depth − 31.75 mm | KV 1175 [S38] |
| Slide lengths | 250–600 mm in 50 mm steps | Keep as a UI simplification, but actual: undermount 9–30" in 3" steps (229–762 mm), side-mount 2" steps; add a per-family length map | [S9][S10][S37] |
| Toe-kick minimums | 4" high / 3" setback | Keep shop default; KCMA minimum is **3" high / 2" deep** | KCMA [S1] |
| Panel float | 2.0 mm | Keep 2.0 mm as **minimum per side**; recommend 3 mm per side for solid panels | CMT 6 mm total on panel width [S13] |
| Shelf span 18 mm | 900 mm | 900 mm is the recommended max for kitchen load; block > 1050 mm without support | KCMA deflection limit [S1]; Sagulator target [S22]; engineering estimate |
| Standard sheet | 1220 × 2440 | Keep; add 1525 × 1525 Baltic birch option | [S25] |
| Drawer box height allowance | 25 mm | 25 mm is safe; the minimum is ~20.6 mm (13/16") | [S9][S10] |

### 15.4 Top validation rules for the app

The catalogue's `validation` array carries these as machine-readable rule objects; this table is the human summary. Severity: **E** = block export, **W** = warn, **I** = info.

| # | Rule | Severity | What it catches / fix |
|---|---|---|---|
| V1 | Undermount drawer: outside box width must equal opening − 42 + 2 × side thickness (inside width = opening − 42) | **E** | Wrong-size boxes for TANDEM-class slides [S9][S10]; fix: recompute box |
| V2 | Slide nominal length + rear clearance ≤ interior depth (undermount 40 mm; side-mount 25 mm; center-mount box depth = depth − 31.75) | **E** | 24" slide in a 24" cabinet [S9][S38] |
| V3 | Drawer opening height ≥ box height + 20.6 mm (undermount) / slide profile clearance (side-mount 46 mm) | **E** | Drawer won't fit vertically [S9][S37] |
| V4 | Hinge count by height (900/1600/2000/2400) and weight (9/14/27 kg); min 2 | **E** | Drooping/tearing hinges [S35][S6] |
| V5 | Door leaf width ≤ 610 mm; for 3+ hinges, hinge vertical spacing > door width | **E** | Hinge overload/twist [S35][S6] |
| V6 | Inset door reveal ≥ minimum reveal for (door thickness, boring distance) | **E** | Door binds on opening [S36] |
| V7 | Paired door gap = reveal and both leaves computed from one formula with rounding at the end | **W/E** | Unequal gaps/overlap [Contract; S20] |
| V8 | Solid-wood panel clearance ≥ 2 mm per side (recommend 3 mm) | **E** | Panel expansion splits frame [S13] |
| V9 | Shelf span ≤ 900 mm for 18 mm at kitchen load; warn > 750 mm; block > 1050 mm without divider | **W/E** | Sag beyond KCMA/Sagulator [S1][S22] |
| V10 | Wall/tall cabinet with back < 12 mm must have a hanging rail/nailer | **E** | Wall cabinet pull-out [S1][S16] |
| V11 | Wall cabinet above cooktop ≥ 610 mm (noncombustible) / 762 mm (combustible) | **E** | NKBA clearance/fire [S3] |
| V12 | Wall cabinet bottom 457.2 mm (18") above counter (or explicit user override) | **W** | Ergonomics/reach [S39] |
| V13 | Cabinet width ≥ 228.6 mm for a hinged door; single section ≤ 1219.2 mm; wall cabinet > 914.4 mm needs centre stile/divider | **W** | No usable interior; door/shelf problems [S39] |
| V14 | Drawer front height ≥ 90 mm and ≤ 300 mm; fronts + gaps must sum to the front region | **W/E** | Unusable/ill-fitting stack [Contract] |
| V15 | Toe kick height ≥ 3" (76.2 mm) and depth ≥ 2" (50.8 mm) if a toe kick exists; toe-kick drawer needs ≥ 4" clear | **W/E** | KCMA toe space [S1]; toe drawer [S40] |
| V16 | Hinge plate and slide screw holes must not clash with shelf-pin holes or joinery | **E** | Drilling through joinery [S5][S18] |
| V17 | Exposed edges must have edgeband or finish per part | **W** | KCMA finish requirement [S1] |
| V18 | Finish/material compatibility (stain on MDF/melamine; hardwax on melamine) | **W** | Finish failure [S26][S31] |
| V19 | Part length/width ≤ sheet usable size minus trim; grain-locked parts must fit the available width | **E** | Un-buildable parts |
| V20 | Door/drawer front thickness ≥ 16 mm and ≤ 26 mm for standard cup hinges (hinge-dependent) | **E** | Hinge won't seat/too thick [S6][S35] |
| V21 | Pull count/length: 2 pulls for drawers > 610 mm; pull ≤ 1/3 drawer width | **W** | Aesthetics/function [S41] |
| V22 | Back style `none` on a wall cabinet; `flush-base` on a working base; `butt-screw` drawer joinery for a kitchen | **W** | Structural/quality trap |

**The most important warning for a naive generator:** *the 42 mm/25.4 mm numbers are not the same kind of clearance.* Undermount = inside-width clearance; side-mount = per-side outside clearance at 12.7 mm; center-mount = 3.2 mm per side plus a depth rule. If the app stores one `slideClearance` number and subtracts it from the opening in all cases, two of the three families will be wrong. Store per-family {insideWidthClearance, sideClearance, depthClearance} and compute the box in a family-specific function.

---

## 16. Evidence gaps and unverified claims

Honesty about what could not be confirmed (all marked in the catalogue notes where relevant):

1. **Hinge cup screw-hole spacing of 45 mm / 9.5 mm offset:** read from the Richelieu/Blum general-specification drawing [S7], not from a current Blum installation sheet — **verify against the exact hinge model before drilling**.
2. **Undermount rear clearance (recommended 40 mm):** derived from PWW/Blum statements that nominal slide lengths are shorter than actual and that a 24" slide will not fit a 24" cabinet [S9]; a precise bracket clearance figure should come from the current Blum installation sheet — **unverified**.
3. **Shelf max spans by material/thickness:** the 900 mm / 1200 mm values are engineering estimates consistent with KCMA's deflection limit [S1] and the Sagulator's target [S22], not a published table; the app should label them as design limits and offer the Sagulator values for the chosen species.
4. **Center-mount depth rule:** KV 1175 product data via a distributor [S38] — the primary KV installation sheet was blocked by Cloudflare; the 1-1/4" shorter rule is consistent with the product page but should be checked on the paper installation sheet.
5. **Toe-kick recess 3"–3.5":** shop practice from trade sources [S40]; KCMA only sets minimums [S1]. The contract's 3" is a good default.
6. **ANSI/AWI 0100 draft:** the AWI document available was a **draft for review** dated August 2025 [S34]; the scales and sheet-size requirements quoted are from that draft and should be re-checked when the standard is published.
7. **KCMA A161.1-2022 is the current edition found (2022)**; the standard is periodically revised [S1].
8. **Hardware model numbers** (Blum 71B3550, TANDEM 563H, Accuride 3832E, KV 1175) are examples of classes, not endorsements; quantities and clearances must follow the exact model's installation sheet in the shop.
9. **Finish cure times** vary with temperature, humidity and film thickness; the TDS numbers quoted are manufacturer guidance for their product, not universal [S30][S31][S32].
10. **NKBA guidelines:** the 2010 summary sheet used for clearance numbers [S3] is an older edition; the current 5th edition (referenced on the NKBA page [S4]) should be used for a final design; the 24"/30" cooktop clearances and the 15 lb/ft² reference are consistent with the summary but should be verified against the current edition before quoting to a client.

---

## 17. Bibliography

All sources were opened during this research on **2026-11-15**. URL access dates apply to all entries. "Kind" follows the categories in §0. The same source ids are used in `js/data/techniques.js`.

**Standards and association documents**

- **[S1]** *ANSI/KCMA A161.1-2022 — Performance and Construction Standard for Kitchen and Vanity Cabinets*. Kitchen Cabinet Manufacturers Association, 2022. https://kcma.org/sites/default/files/2024-08/KCMA%20A161.1%202022%20High%20Res.pdf — kind: **standard** Accessed: 2026-11-15.
- **[S2]** *KCMA A161.1 Quality Cabinet Certification*. Kitchen Cabinet Manufacturers Association (certification page). https://kcma.org/certifications/kcma-quality-cabinet-certification — kind: **standard** Accessed: 2026-11-15.
- **[S3]** *NKBA Kitchen Planning Guidelines* (summary sheet, 2010 edition). National Kitchen & Bath Association; reproduction hosted by Ivo Cabinets. https://www.ivocabinets.com/wp-content/uploads/2024/06/NKBA-Kitchen-Planning-Guidelines.pdf — kind: **standard** (older edition; see §16) Accessed: 2026-11-15.
- **[S4]** *NKBA Planning Guidelines* (5th edition). National Kitchen & Bath Association. https://nkba.org/planning-guidelines/ — kind: **standard** Accessed: 2026-11-15.
- **[S33]** *29 CFR 1910.107 — Spray finishing using flammable and combustible materials*. Occupational Safety and Health Administration. https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.107 — kind: **standard** Accessed: 2026-11-15.
- **[S34]** *ANSI/AWI 0100 — Submittals* (draft for review, August 2025). Architectural Woodwork Institute. http://gotoawi.com/standards/awi0100-draft-aug2025.pdf — kind: **standard** (draft; see §16) Accessed: 2026-11-15.
- **[S42]** *ASME Y14.5 — Dimensioning and Tolerancing*. American Society of Mechanical Engineers. https://www.asme.org/codes-standards/find-codes-standards/y14-5-dimensioning-tolerancing — kind: **standard** Accessed: 2026-11-15.

**Hardware and materials manufacturers**

- **[S5]** *Ratgeber für Möbeltechnik / Furniture technology guide* (May 2021). Hettich. https://web.hettich.com/fileadmin/Company_website/HDY/Media/Ratgeber_Moebeltechnik_de_en_05-2021.pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S6]** *CLIP top / CLIP top BLUMOTION concealed hinges — complete guide* (2015). Blum, Inc. https://quikdrawers.com/Product_Instructions/Blum_complete_guide.pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S7]** *Hinges — General Specifications* (Richelieu catalogue, section 3C, 2009). Richelieu Hardware (Blum Compact hinge data). http://www.richelieu.com/documents/imageCatalogue/1000517/pdf_An.pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S8]** *Slides — TANDEM / TANDEM plus BLUMOTION* (Richelieu catalogue, section 4A, 2017). Richelieu Hardware. https://www.richelieu.com/documents/imageCatalogue/1001165/pdf_Fr.pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S13]** *Step-by-step raised panel door construction* (CMT rail-and-stile and raised-panel bit instructions, item 03.60.0264). C.M.T. Utensili S.p.A. https://www.cmtorangetools.com/downloads/5912/814/03.60.0264_8-900512_2019hyper%20inches%20e%20mm.pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S23]** *Plytanium sanded AC & BC plywood specifications* (GP-TM Lit. 621669). Georgia-Pacific Wood Products LLC. https://www.buildgp.com/wp-content/uploads/2018/10/georgia-pacific-plytanium-sanded-specifications-pdf.pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S27]** *Fastedge Peel and Stick Edgebanding*. FastCap. https://www.fastcap.com/product/fastedge-peel-and-stick-edgebanding — kind: **manufacturer** Accessed: 2026-11-15.
- **[S29]** *Osmo Polyx®-Oil (hardwax oil)*. Osmo Canada. https://osmo.ca/product/polyx-oil-high-solid/ — kind: **manufacturer** Accessed: 2026-11-15.
- **[S30]** *Conversion Varnish — product data / technical data sheet* (2013). General Finishes. https://generalfinishes.com/sites/default/files/documents/files/2017-04/tech-data-ef-conversion-varnish-1-1-13-1.pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S31]** *Which GF Top Coat Should I Use?* (2017). General Finishes. https://generalfinishes.com/blog/which-gf-top-coat-should-i-use — kind: **manufacturer** Accessed: 2026-11-15.
- **[S32]** *DuraCoat™ Pre-Catalyzed Lacquer — Product Data Sheet* (2011). Mohawk Finishing Products (RPM Wood Finishes Group). https://mohawkfinishing.com/mhk_cds/product_pds/m610-2400%20duracoat%20550%20voc(6-13-11).pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S36]** *Reveal tables — Blum 107° hinge for frameless inset cabinets* (SKU 652022). HardwareSource. https://www.hardwaresource.com/mm5/graphics/00000001/moreInfo/652022_frameless_inset_min_reveal.pdf — kind: **manufacturer** Accessed: 2026-11-15.
- **[S37]** *Accuride 3832E weather-resistant slide — product data* (manufacturer data as distributed by E. B. Bradley). Accuride / E. B. Bradley Co. https://www.ebbradley.com/a3832eh-20-01.html — kind: **manufacturer** Accessed: 2026-11-15.
- **[S38]** *KV 1175P ZC center-mount drawer slide — product data* (manufacturer data as distributed by Woodworker Express). Knape & Vogt / Woodworker Express. https://www.woodworkerexpress.com/answers/6967064/Does-it-come-with-the-wheels — kind: **manufacturer** Accessed: 2026-11-15.

**Publications (magazines, books, professional publishers)**

- **[S9]** *How to Calculate the Size of Kitchen Drawers with Blum Tandem Slides*. Popular Woodworking (2017). https://www.popularwoodworking.com/editors-blog/sizing-parts-for-drawers-on-blum-tandem-slides/ — kind: **publication** Accessed: 2026-11-15.
- **[S10]** Nancy Hiller, *Kitchen Think* — free excerpt (chapters on drawer mounting and sizing). Lost Art Press, 2020. https://blog.lostartpress.com/wp-content/uploads/2020/06/KT_Free_Excerpt.pdf — kind: **publication** Accessed: 2026-11-15.
- **[S11]** Steve Latta, *Three Ways to Make Cabinet Doors*. Fine Woodworking (Taunton Press); PDF from Fine Woodworking's membership library. https://www.finewoodworking.com/membership/pdf/7727/011135075.pdf — kind: **publication** Accessed: 2026-11-15.
- **[S12]** Hank Gilpin, *The Illustrated Cutlist*, Fine Woodworking #273 (Jan/Feb 2019). https://www.finewoodworking.com/membership/pdf/261995/011273055.pdf — kind: **publication** Accessed: 2026-11-15.
- **[S14]** Greg Larson, *Kitchen Cabinet Essentials* (2026). Popular Woodworking. https://www.popularwoodworking.com/article/kitchen-cabinet-essentials/ — kind: **publication** Accessed: 2026-11-15.
- **[S39]** *Standard Kitchen Cabinet Dimensions & Sizes Guide*. Bob Vila (2026). https://www.bobvila.com/articles/standard-kitchen-cabinet-sizes/ — kind: **publication** Accessed: 2026-11-15.

**Shop-practice and trade sources**

- **[S15]** *Frameless Cabinet Carcase Fastener Choices* (2012). WOODWEB Knowledge Base. https://www.woodweb.com/knowledge_base/Frameless_Cabinet_Carcase_Fastener_Choices.html — kind: **shop** Accessed: 2026-11-15.
- **[S16]** *Cabinet Back Construction* (2005). WOODWEB Knowledge Base. https://www.woodweb.com/knowledge_base/Cabinet_Back_Construction.html — kind: **shop** Accessed: 2026-11-15.
- **[S17]** *Commercial Base Cabinet Depths* (2014). WOODWEB Knowledge Base. https://www.woodweb.com/knowledge_base/Commercial_Base_Cabinet_Depths__769687.html — kind: **shop** Accessed: 2026-11-15.
- **[S18]** *Drawer runner holes in 32mm system* (2003). WOODWEB Knowledge Base. https://www.woodweb.com/knowledge_base/Drawer_runner_holes_in_32mm_system.html — kind: **shop** Accessed: 2026-11-15.
- **[S19]** *Confirmat screw assembly* (2002). WOODWEB Knowledge Base. https://woodweb.com/knowledge_base/Confirmat_screw_assembly.html — kind: **shop** Accessed: 2026-11-15.
- **[S20]** *1/16" Versus 1/8" Cabinet Door Reveals* (2010). WOODWEB Knowledge Base. https://www.woodweb.com/knowledge_base/116_Versus_18_Cabinet_Door_Reveals.html — kind: **shop** Accessed: 2026-11-15.
- **[S21]** *Face frame: how much overlay?* Fine Homebuilding forum (2008). https://www.finehomebuilding.com/forum/face-frame-how-much-overlay — kind: **shop** Accessed: 2026-11-15.
- **[S28]** *Limitations of a Hot-Air Edgebander* (2007). WOODWEB Knowledge Base. https://www.woodweb.com/knowledge_base/Limitations_of_a_HotAir_Edgebander.html — kind: **shop** Accessed: 2026-11-15.

**Technical references and specification libraries**

- **[S22]** *The Sagulator — shelf sag calculator and notes*. WoodBin. https://woodbin.com/calcs/sagulator/ — kind: **reference** Accessed: 2026-11-15.
- **[S24]** *Panel Thickness Tolerances and Labeling* (APA Technical Topic TT-054, 2013). APA — The Engineered Wood Association. https://www.apawood.org/guides-tools-training/technical-document-library/technical-topics/panel-thickness-tolerances-and-labeling/ — kind: **reference** Accessed: 2026-11-15.
- **[S25]** *Baltic Birch Plywood (BBB & BBCP Grades) — Technical Material Specification* (v1.0). Ryxen / SupplyGrid. https://ryxen.ca/sops/supplygrid/pdf/baltic-birch-plywood-bbb-and-bbcp-grades.pdf — kind: **reference** (supplier specification; see §16) Accessed: 2026-11-15.
- **[S26]** *Particleboard & MDF — sourcing and specification guide* (2021). Composite Panel Association. https://www.compositepanel.org/wp-content/uploads/2021-SandP_Master-CPA-Content-Only.pdf — kind: **reference** Accessed: 2026-11-15.
- **[S35]** *Section 06 41 20 — Cabinet Door Hinge Hardware* (Salice America master specification, 2016). ARCAT. https://www.arcat.com/sdspecs/docxCAN04/06_41_20sal.docx — kind: **reference** (manufacturer master-spec content) Accessed: 2026-11-15.
- **[S40]** *Cabinet Toe Kicks: Dimensions, Materials and How to Fit Them* (2026). Lily Ann Cabinets. https://www.lilyanncabinets.com/cabinet-articles/cabinet-toe-kicks/ — kind: **reference** Accessed: 2026-11-15.
- **[S41]** *Cabinet Hardware Placement: Where to Put Knobs and Pulls* (2026). Lily Ann Cabinets. https://www.lilyanncabinets.com/cabinet-articles/cabinet-hardware-placement/ — kind: **reference** Accessed: 2026-11-15.

---

## Appendix A — Metric/imperial quick reference used in the catalogue

| mm | inch (approx) | | inch | mm |
|---|---|---|---|---|
| 3 | 1/8" | | 1/4" | 6.35 |
| 5 | 3/16" | | 1/2" | 12.7 |
| 6 | 1/4" | | 5/8" | 15.875 |
| 9.5 | 3/8" | | 3/4" | 19.05 |
| 12.7 | 1/2" | | 1" | 25.4 |
| 16 | 5/8" | | 18" | 457.2 |
| 18 | 3/4" (nominal) | | 21" | 533.4 |
| 19 | 3/4" | | 24" | 609.6 |
| 25.4 | 1" | | 30" | 762 |
| 32 | 1-1/4" | | 34-1/2" | 876.3 |
| 35 | 1-3/8" | | 36" | 914.4 |
| 37 | 1-7/16" | | 42" | 1066.8 |
| 42 | 1-21/32" | | 48" | 1219.2 |
| 57.15 | 2-1/4" | | 60" | 1524 |
| 101.6 | 4" | | 84" | 2133.6 |
| 228.6 | 9" | | 96" | 2438.4 |
| 609.6 | 24" | | 1220 | 48" |
| 762 | 30" | | 2440 | 96" |
| 876.3 | 34-1/2" | | | |
| 914.4 | 36" | | | |
| 2133.6 | 84" | | | |



