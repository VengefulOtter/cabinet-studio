/*
 * Cabinet Studio — researched technique catalogue.
 * Classic-script / CommonJS dual UMD. No ES modules, no build step, no runtime dependencies.
 * Loads from file:// in the browser (attaches to CS.data.techniques) and from Node (module.exports).
 *
 * Evidence base: docs/RESEARCH-techniques.md. Every numeric claim and recommendation is traceable to
 * a source id in `sources`; source ids also appear on every option, material and hardware template.
 * Accessed dates are the research date 2026-11-15. Values are millimetres unless noted.
 *
 * Source-kind taxonomy: standard | manufacturer | publication | reference | shop.
 * "shop" means recorded professional shop practice (WOODWEB / trade discussion), not a published
 * standard — the UI should present it as such.
 */
(function (root, factory) {
  'use strict';
  var catalogue = factory();
  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = catalogue;
  }
  if (root) {
    root.CS = root.CS || {};
    root.CS.data = root.CS.data || {};
    root.CS.data.techniques = catalogue;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  var T = {};

  T.meta = {
    version: '1.0.0',
    updated: '2026-11-15',
    description: 'Researched cabinet and door construction techniques, materials, hardware and ' +
      'shop standards for Cabinet Studio. Values in millimetres; imperial mirrors and notes in ' +
      'standards.imperial and standards.notes. Evidence base: docs/RESEARCH-techniques.md.',
    units: 'mm',
    report: 'docs/RESEARCH-techniques.md',
    accessDate: '2026-11-15'
  };

  /* ------------------------------------------------------------------ *
   * Sources — opened during research on 2026-11-15.
   * ------------------------------------------------------------------ */
  T.sources = {
    'kcma-a1611-2022': {
      title: 'ANSI/KCMA A161.1-2022 Performance and Construction Standard for Kitchen and Vanity Cabinets',
      publisher: 'Kitchen Cabinet Manufacturers Association',
      url: 'https://kcma.org/sites/default/files/2024-08/KCMA%20A161.1%202022%20High%20Res.pdf',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'kcma-quality-cert': {
      title: 'KCMA A161.1 Quality Cabinet Certification',
      publisher: 'Kitchen Cabinet Manufacturers Association',
      url: 'https://kcma.org/certifications/kcma-quality-cabinet-certification',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'nkba-guidelines-2010': {
      title: 'NKBA Kitchen Planning Guidelines (summary sheet, 2010 edition)',
      publisher: 'National Kitchen & Bath Association (reproduction hosted by Ivo Cabinets)',
      url: 'https://www.ivocabinets.com/wp-content/uploads/2024/06/NKBA-Kitchen-Planning-Guidelines.pdf',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'nkba-planning-guidelines': {
      title: 'NKBA Planning Guidelines (5th edition)',
      publisher: 'National Kitchen & Bath Association',
      url: 'https://nkba.org/planning-guidelines/',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'hettich-furniture-tech': {
      title: 'Ratgeber fuer Moebeltechnik / Furniture technology guide (May 2021)',
      publisher: 'Hettich',
      url: 'https://web.hettich.com/fileadmin/Company_website/HDY/Media/Ratgeber_Moebeltechnik_de_en_05-2021.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'blum-clip-top-guide-2015': {
      title: 'CLIP top / CLIP top BLUMOTION concealed hinges - complete guide (2015)',
      publisher: 'Blum, Inc.',
      url: 'https://quikdrawers.com/Product_Instructions/Blum_complete_guide.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'richelieu-blum-hinges-2009': {
      title: 'Hinges - General Specifications (Richelieu catalogue section 3C, 2009; Blum Compact hinge data)',
      publisher: 'Richelieu Hardware',
      url: 'http://www.richelieu.com/documents/imageCatalogue/1000517/pdf_An.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'richelieu-blum-tandem-2017': {
      title: 'Slides - TANDEM / TANDEM plus BLUMOTION (Richelieu catalogue section 4A, 2017)',
      publisher: 'Richelieu Hardware',
      url: 'https://www.richelieu.com/documents/imageCatalogue/1001165/pdf_Fr.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'pww-tandem-sizing': {
      title: 'How to Calculate the Size of Kitchen Drawers with Blum Tandem Slides',
      publisher: 'Popular Woodworking',
      url: 'https://www.popularwoodworking.com/editors-blog/sizing-parts-for-drawers-on-blum-tandem-slides/',
      accessed: '2026-11-15',
      kind: 'publication'
    },
    'lostart-kitchen-think': {
      title: 'Kitchen Think - free excerpt (drawer mounting and sizing chapters)',
      publisher: 'Lost Art Press (Nancy Hiller)',
      url: 'https://blog.lostartpress.com/wp-content/uploads/2020/06/KT_Free_Excerpt.pdf',
      accessed: '2026-11-15',
      kind: 'publication'
    },
    'fww-three-ways-doors': {
      title: 'Three Ways to Make Cabinet Doors',
      publisher: 'Fine Woodworking (Taunton Press), Steve Latta',
      url: 'https://www.finewoodworking.com/membership/pdf/7727/011135075.pdf',
      accessed: '2026-11-15',
      kind: 'publication'
    },
    'fww-illustrated-cutlist': {
      title: 'The Illustrated Cutlist (Fine Woodworking #273, Jan/Feb 2019)',
      publisher: 'Fine Woodworking (Taunton Press), Hank Gilpin',
      url: 'https://www.finewoodworking.com/membership/pdf/261995/011273055.pdf',
      accessed: '2026-11-15',
      kind: 'publication'
    },
    'cmt-rail-stile': {
      title: 'Step-by-step raised panel door construction (CMT rail-and-stile/raised-panel bit instructions)',
      publisher: 'C.M.T. Utensili S.p.A.',
      url: 'https://www.cmtorangetools.com/downloads/5912/814/03.60.0264_8-900512_2019hyper%20inches%20e%20mm.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'pww-kitchen-cabinet-essentials': {
      title: 'Kitchen Cabinet Essentials',
      publisher: 'Popular Woodworking (Greg Larson)',
      url: 'https://www.popularwoodworking.com/article/kitchen-cabinet-essentials/',
      accessed: '2026-11-15',
      kind: 'publication'
    },
    'woodweb-frameless-fasteners': {
      title: 'Frameless Cabinet Carcase Fastener Choices',
      publisher: 'WOODWEB Knowledge Base',
      url: 'https://www.woodweb.com/knowledge_base/Frameless_Cabinet_Carcase_Fastener_Choices.html',
      accessed: '2026-11-15',
      kind: 'shop'
    },
    'woodweb-back-construction': {
      title: 'Cabinet Back Construction',
      publisher: 'WOODWEB Knowledge Base',
      url: 'https://www.woodweb.com/knowledge_base/Cabinet_Back_Construction.html',
      accessed: '2026-11-15',
      kind: 'shop'
    },
    'woodweb-base-depths': {
      title: 'Commercial Base Cabinet Depths',
      publisher: 'WOODWEB Knowledge Base',
      url: 'https://www.woodweb.com/knowledge_base/Commercial_Base_Cabinet_Depths__769687.html',
      accessed: '2026-11-15',
      kind: 'shop'
    },
    'woodweb-32mm-holes': {
      title: 'Drawer runner holes in 32mm system',
      publisher: 'WOODWEB Knowledge Base',
      url: 'https://www.woodweb.com/knowledge_base/Drawer_runner_holes_in_32mm_system.html',
      accessed: '2026-11-15',
      kind: 'shop'
    },
    'woodweb-confirmat': {
      title: 'Confirmat screw assembly',
      publisher: 'WOODWEB Knowledge Base',
      url: 'https://woodweb.com/knowledge_base/Confirmat_screw_assembly.html',
      accessed: '2026-11-15',
      kind: 'shop'
    },
    'woodweb-reveals': {
      title: '1/16" Versus 1/8" Cabinet Door Reveals',
      publisher: 'WOODWEB Knowledge Base',
      url: 'https://www.woodweb.com/knowledge_base/116_Versus_18_Cabinet_Door_Reveals.html',
      accessed: '2026-11-15',
      kind: 'shop'
    },
    'fhb-overlay-forum': {
      title: 'Face frame: how much overlay?',
      publisher: 'Fine Homebuilding forum',
      url: 'https://www.finehomebuilding.com/forum/face-frame-how-much-overlay',
      accessed: '2026-11-15',
      kind: 'shop'
    },
    'sagulator': {
      title: 'The Sagulator - shelf sag calculator and notes',
      publisher: 'WoodBin',
      url: 'https://woodbin.com/calcs/sagulator/',
      accessed: '2026-11-15',
      kind: 'reference'
    },
    'gp-plytanium': {
      title: 'Plytanium sanded AC & BC plywood specifications (GP-TM Lit. 621669)',
      publisher: 'Georgia-Pacific Wood Products LLC',
      url: 'https://www.buildgp.com/wp-content/uploads/2018/10/georgia-pacific-plytanium-sanded-specifications-pdf.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'apa-tt-054': {
      title: 'Panel Thickness Tolerances and Labeling (APA Technical Topic TT-054)',
      publisher: 'APA - The Engineered Wood Association',
      url: 'https://www.apawood.org/guides-tools-training/technical-document-library/technical-topics/panel-thickness-tolerances-and-labeling/',
      accessed: '2026-11-15',
      kind: 'reference'
    },
    'baltic-birch-spec': {
      title: 'Baltic Birch Plywood (BBB & BBCP Grades) - Technical Material Specification v1.0',
      publisher: 'Ryxen / SupplyGrid',
      url: 'https://ryxen.ca/sops/supplygrid/pdf/baltic-birch-plywood-bbb-and-bbcp-grades.pdf',
      accessed: '2026-11-15',
      kind: 'reference'
    },
    'cpa-sandp': {
      title: 'Particleboard & MDF sourcing and specification guide (2021)',
      publisher: 'Composite Panel Association',
      url: 'https://www.compositepanel.org/wp-content/uploads/2021-SandP_Master-CPA-Content-Only.pdf',
      accessed: '2026-11-15',
      kind: 'reference'
    },
    'fastcap-fastedge': {
      title: 'Fastedge Peel and Stick Edgebanding',
      publisher: 'FastCap',
      url: 'https://www.fastcap.com/product/fastedge-peel-and-stick-edgebanding',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'woodweb-hotair-edgebander': {
      title: 'Limitations of a Hot-Air Edgebander',
      publisher: 'WOODWEB Knowledge Base',
      url: 'https://www.woodweb.com/knowledge_base/Limitations_of_a_HotAir_Edgebander.html',
      accessed: '2026-11-15',
      kind: 'shop'
    },
    'osmo-polyx': {
      title: 'Osmo Polyx-Oil (hardwax oil) product page',
      publisher: 'Osmo Canada',
      url: 'https://osmo.ca/product/polyx-oil-high-solid/',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'gf-conversion-varnish': {
      title: 'Conversion Varnish - technical data sheet',
      publisher: 'General Finishes',
      url: 'https://generalfinishes.com/sites/default/files/documents/files/2017-04/tech-data-ef-conversion-varnish-1-1-13-1.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'gf-topcoat-guide': {
      title: 'Which GF Top Coat Should I Use?',
      publisher: 'General Finishes',
      url: 'https://generalfinishes.com/blog/which-gf-top-coat-should-i-use',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'mohawk-precat-lacquer': {
      title: 'DuraCoat Pre-Catalyzed Lacquer - product data sheet',
      publisher: 'Mohawk Finishing Products (RPM Wood Finishes Group)',
      url: 'https://mohawkfinishing.com/mhk_cds/product_pds/m610-2400%20duracoat%20550%20voc(6-13-11).pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'osha-1910-107': {
      title: '29 CFR 1910.107 - Spray finishing using flammable and combustible materials',
      publisher: 'Occupational Safety and Health Administration',
      url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.107',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'awi-0100-draft': {
      title: 'ANSI/AWI 0100 - Submittals (draft for review, August 2025)',
      publisher: 'Architectural Woodwork Institute',
      url: 'http://gotoawi.com/standards/awi0100-draft-aug2025.pdf',
      accessed: '2026-11-15',
      kind: 'standard'
    },
    'arcat-salice-hinges': {
      title: 'Section 06 41 20 - Cabinet Door Hinge Hardware (Salice America master specification)',
      publisher: 'ARCAT',
      url: 'https://www.arcat.com/sdspecs/docxCAN04/06_41_20sal.docx',
      accessed: '2026-11-15',
      kind: 'reference'
    },
    'hardwaresource-inset-reveal': {
      title: 'Reveal tables - Blum 107 degree hinge for frameless inset cabinets (SKU 652022)',
      publisher: 'HardwareSource',
      url: 'https://www.hardwaresource.com/mm5/graphics/00000001/moreInfo/652022_frameless_inset_min_reveal.pdf',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'accuride-3832e': {
      title: 'Accuride 3832E weather-resistant slide - product data (distributed by E. B. Bradley)',
      publisher: 'Accuride / E. B. Bradley Co.',
      url: 'https://www.ebbradley.com/a3832eh-20-01.html',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'kv-1175': {
      title: 'KV 1175P ZC center-mount drawer slide - product data (distributed by Woodworker Express)',
      publisher: 'Knape & Vogt / Woodworker Express',
      url: 'https://www.woodworkerexpress.com/answers/6967064/Does-it-come-with-the-wheels',
      accessed: '2026-11-15',
      kind: 'manufacturer'
    },
    'bobvila-standard-sizes': {
      title: 'Standard Kitchen Cabinet Dimensions & Sizes Guide',
      publisher: 'Bob Vila',
      url: 'https://www.bobvila.com/articles/standard-kitchen-cabinet-sizes/',
      accessed: '2026-11-15',
      kind: 'publication'
    },
    'lilyann-toe-kicks': {
      title: 'Cabinet Toe Kicks: Dimensions, Materials and How to Fit Them',
      publisher: 'Lily Ann Cabinets',
      url: 'https://www.lilyanncabinets.com/cabinet-articles/cabinet-toe-kicks/',
      accessed: '2026-11-15',
      kind: 'reference'
    },
    'lilyann-hardware-placement': {
      title: 'Cabinet Hardware Placement: Where to Put Knobs and Pulls',
      publisher: 'Lily Ann Cabinets',
      url: 'https://www.lilyanncabinets.com/cabinet-articles/cabinet-hardware-placement/',
      accessed: '2026-11-15',
      kind: 'reference'
    },
    'asme-y14-5': {
      title: 'ASME Y14.5 - Dimensioning and Tolerancing',
      publisher: 'American Society of Mechanical Engineers',
      url: 'https://www.asme.org/codes-standards/find-codes-standards/y14-5-dimensioning-tolerancing',
      accessed: '2026-11-15',
      kind: 'standard'
    }
  };

  /* ------------------------------------------------------------------ *
   * Technique library presentation order.
   * ------------------------------------------------------------------ */
  T.groups = [
    {
      id: 'construction-system',
      title: 'Construction system',
      intro: 'Frameless or face frame, and how the fronts relate to the box. This is the first decision: ' +
        'it changes every part, the hardware and the assembly order.',
      optionGroups: ['constructionSystem', 'doorOverlay']
    },
    {
      id: 'carcass',
      title: 'Carcass, backs and joinery',
      intro: 'How the box is held together, how the back is fitted and how the back transfers load to the wall.',
      optionGroups: ['carcassJoinery', 'backStyle', 'faceFrameJoinery']
    },
    {
      id: 'base-and-toe-kick',
      title: 'Base and toe kick',
      intro: 'How the cabinet stands on the floor and how the toe space is built and finished.',
      optionGroups: ['toeKickStyle']
    },
    {
      id: 'interior',
      title: 'Interior and shelving',
      intro: 'Adjustable or fixed shelves, the 32 mm line and the span limits that keep shelves from sagging.',
      optionGroups: ['shelfSystem']
    },
    {
      id: 'doors',
      title: 'Doors',
      intro: 'Door style, frame joinery and the hinge that carries the door. Door sizing and hinge boring follow from these choices.',
      optionGroups: ['doorStyle', 'doorJoinery', 'hingeType']
    },
    {
      id: 'drawers',
      title: 'Drawers',
      intro: 'Drawer box joinery, bottom construction, front style and the slide family that fixes the box size.',
      optionGroups: ['drawerFrontStyle', 'drawerJoinery', 'drawerBottom', 'drawerSlide']
    },
    {
      id: 'materials-and-edges',
      title: 'Materials and edges',
      intro: 'Sheet goods, solid stock and how exposed edges are treated and finished.',
      optionGroups: ['edgeBanding']
    },
    {
      id: 'finish',
      title: 'Finish',
      intro: 'Paint grade or stain grade, and the finish system that suits the material, the shop and the wear.',
      optionGroups: ['finish']
    }
  ];

  /* ------------------------------------------------------------------ *
   * Options. Required ids from CONTRACT.md section 5 are reproduced exactly.
   * Each option: id, name, group, summary, pros, cons, bestFor, tooling, shopNotes, sourceIds.
   * ------------------------------------------------------------------ */
  T.options = {};

  T.options.constructionSystem = [
    {
      id: 'frameless',
      name: 'Frameless (European / full access)',
      group: 'constructionSystem',
      summary: 'Carcass is the finished cabinet: 18-19 mm sides plus top/bottom or stretchers, with doors and drawer fronts mounted in front on cup hinges and slides. No face frame.',
      pros: ['Fewest parts and fastest box build', 'Native to the 32 mm system: hinge plates, slides and shelf pins all land on the same hole line', 'Full-overlay fronts give the flattest, most modern face', 'Best sheet yield and CNC friendliness'],
      cons: ['Depends on the back and hanging rail for wall strength', 'Harder to scribe to an out-of-square wall; exposed gables need applied ends or careful finishing', 'No frame to hide a slightly out-of-square opening'],
      bestFor: ['Modern full-overlay kitchens', 'Shops without a case clamp', 'CNC-cut or sheet-optimised runs'],
      tooling: ['Table saw / track saw', '32 mm boring jig or line borer', 'Pocket-hole or confirmat drilling', 'Drill/driver'],
      shopNotes: 'Bore the 32 mm line in both sides before assembly, with the front row 37 mm from the front edge. Hardware mounted on the flat panels before the box goes together is the speed advantage of frameless construction.',
      sourceIds: ['kcma-a1611-2022', 'pww-kitchen-cabinet-essentials', 'woodweb-frameless-fasteners']
    },
    {
      id: 'faceframe',
      name: 'Face frame (framed)',
      group: 'constructionSystem',
      summary: 'A frame of stiles and rails is applied to the front of the box, giving the doors a continuous surface and the installer a scribe edge.',
      pros: ['Frame stiles can be scribed to the wall, hiding wall irregularity', 'Makes traditional inset, half-overlay and raised-panel work easier to fit', 'Frame stiffens the front of the cabinet', 'Euro hinges work with face-frame mounting plates'],
      cons: ['More parts and more clamping than frameless', 'Hinges and slides need the box interior flush with the frame, or build-outs/rear brackets', 'Frame joinery and flushing add labour'],
      bestFor: ['Traditional kitchens with inset or half-overlay fronts', 'Old houses with out-of-square walls', 'Painted cabinetry where the frame is part of the look'],
      tooling: ['Pocket-hole jig, biscuit joiner or dowel jig', 'Clamps and cauls', 'Router/table saw for frame profiles', 'Block plane for flushing'],
      shopNotes: 'The easiest face frame for a first run is a plywood carcass with the inside faces flush with the frame: standard 32 mm hardware then works with no build-outs. Glue and clamp the frame with alignment biscuits, then flush and finish before hanging doors.',
      sourceIds: ['kcma-a1611-2022', 'pww-kitchen-cabinet-essentials', 'fhb-overlay-forum']
    }
  ];

  T.options.carcassJoinery = [
    {
      id: 'confirmat',
      name: 'Confirmat screws (7 x 50 mm)',
      group: 'carcassJoinery',
      summary: 'Stepped assembly screw: 5 mm pilot in the edge/face member and a 7 mm clearance hole in the mating panel. Draws and registers the joint with no clamps.',
      pros: ['Fast: drill, screw, done; no clamp time', 'Strong in particleboard and MDF; an AWI premium-grade fastener', 'Can be disassembled and re-driven', 'Cheap tooling (step drill or boring jig)'],
      cons: ['Can split veneer-core plywood near an edge or with a dull tapered bit', 'Visible head on the inside face unless plugged', 'Needs accurate hole alignment for a flush joint'],
      bestFor: ['Frameless melamine/particleboard/ply carcasses at 18-19 mm', 'Small shops without a case clamp', 'Kitchen boxes where the outside is covered by another cabinet or applied end'],
      tooling: ['7 mm step drill or dedicated confirmat bit', 'Drill/driver with torque control', 'Boring jig for alignment'],
      shopNotes: 'Use 5 mm in the edge member and 7 mm through the face member; three screws per side-to-bottom joint, about 64 mm from the ends and no more than about 200 mm apart. Add glue at the front edge where it will be finished.',
      sourceIds: ['woodweb-confirmat', 'woodweb-frameless-fasteners', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'pocket-screw',
      name: 'Pocket screws (fine-thread)',
      group: 'carcassJoinery',
      summary: 'Angled, counterbored screws driven through a drilled pocket. Extremely fast, no clamps, and the small-shop default for face frames and bases.',
      pros: ['No clamps and minimal setup', 'Very cheap jig and screws', 'Strong enough for face frames and stretchers', 'Easy to learn and repeat'],
      cons: ['Screw holds in face grain, so weaker in MDF end grain', 'Pockets must be on hidden faces', 'Can pull a joint slightly out of alignment if the pocket is not seated'],
      bestFor: ['Face frames', 'Toe-kick platforms and stretchers', 'Shop cabinets and utility boxes'],
      tooling: ['Pocket-hole jig', 'Clamp or vise for the jig', 'Square-drive bit'],
      shopNotes: 'Keep pockets at least 50 mm from an exposed end and drive with a clutch so the screw seats without crushing the pocket shoulder. Fine-thread screws are for hardwood; coarse-thread for softwood and plywood.',
      sourceIds: ['pww-kitchen-cabinet-essentials', 'woodweb-frameless-fasteners']
    },
    {
      id: 'dado-screw',
      name: 'Dado or rabbet + glue + screws',
      group: 'carcassJoinery',
      summary: 'A housing (dado) or rebate (rabbet) cut to receive the mating panel, glued and screwed. Locates the parts, adds glue area and squares the case.',
      pros: ['Mechanically locates and squares the box', 'Lots of glue area; very stiff joint', 'Ideal for fixed shelves and dividers', 'No special fastener head to hide'],
      cons: ['Through dadoes show on the outside; stopped dadoes need router setup', 'Permanent: cannot be taken apart', 'More machining time per part'],
      bestFor: ['Fixed shelves and dividers', 'Bottoms and tops of shop/exposed-end cabinets', 'Any box where stiffness and squareness matter most'],
      tooling: ['Table saw dado stack or router bit', 'Router table', 'Clamps and glue'],
      shopNotes: 'Cut the dado 0.2-0.3 mm shallower than the panel thickness so the fit is snug without bottoming. For a fixed shelf, put the dado behind the door line so the shelf front can be edge-banded and show.',
      sourceIds: ['woodweb-frameless-fasteners', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'dowel',
      name: 'Dowel joints (line-bored)',
      group: 'carcassJoinery',
      summary: '6 or 8 mm dowels into line-bored holes, glued and case-clamped. The European production standard for carcass assembly.',
      pros: ['Best registration and strength when line-bored', 'Does not split MDF or plywood', 'No visible fastener head', 'Very fast with a boring machine and case clamp'],
      cons: ['Needs a boring machine and case clamp to be fast', 'Clamp-heavy and slow without the tooling', 'Glue and clamp time per box'],
      bestFor: ['Shops tooled for 32 mm production', 'Exposed-end cabinets where no fastener may show', 'High-volume runs'],
      tooling: ['Line borer / dowel jig', 'Case clamp or many clamps', 'Glue applicator'],
      shopNotes: 'Use glue on both the dowel and the hole walls, and keep the dowel holes on the same 32 mm line as shelf pins and hardware where possible. With no case clamp, dry-fit and square with a diagonal check before the glue grabs.',
      sourceIds: ['woodweb-frameless-fasteners', 'hettich-furniture-tech']
    },
    {
      id: 'biscuit',
      name: 'Biscuits (with screws)',
      group: 'carcassJoinery',
      summary: 'A #20 biscuit in matching slots locates the joint; screws (or clamps and glue) carry the load. Best used as an alignment aid, not the only joint.',
      pros: ['Good alignment/registration', 'Fast to cut with a biscuit joiner', 'Cheap consumables', 'Hidden inside the joint'],
      cons: ['Penetrates only about 12 mm into each member; poor as a sole corner joint', 'Swells the joint slightly (biscuits add moisture)', 'Needs screws or clamps for real strength'],
      bestFor: ['Aligning carcass parts during glue-up and screw assembly', 'Face-frame joints that are also pocket-screwed', 'Dust frames and applied parts'],
      tooling: ['Biscuit joiner', 'Biscuits and glue', 'Screws/clamps'],
      shopNotes: 'Follow the AWI spacing rule used in the PWW method: biscuit slots no more than 2" (51 mm) from the edge of the side and no more than 6" (152 mm) apart. Mark the slot positions on the outside of both sides so the joints line up.',
      sourceIds: ['pww-kitchen-cabinet-essentials', 'woodweb-frameless-fasteners', 'fww-three-ways-doors']
    },
    {
      id: 'butt-screw',
      name: 'Butt joint + screws (glue and screw)',
      group: 'carcassJoinery',
      summary: 'Plain butt joint with predrilled countersunk screws from the outside, glue optional. The simplest and cheapest option.',
      pros: ['Fastest and cheapest', 'No special tooling', 'Easy to repair or disassemble', 'Fine where the outside is hidden'],
      cons: ['Least resistant to racking', 'Screw heads visible / need plugs on exposed faces', 'Prone to splitting near panel ends', 'Not appropriate for a kitchen showpiece'],
      bestFor: ['Shop cabinets and utility boxes', 'Hidden structural parts (toe-kick platforms)', 'Temporary or budget work'],
      tooling: ['Drill with countersink', 'Driver'],
      shopNotes: 'Predrill and countersink, keep screws at least 50 mm from ends, and glue the joint if it will ever be asked to carry load. On an exposed end, plan an applied panel or a finished plug from the start.',
      sourceIds: ['woodweb-frameless-fasteners', 'kcma-a1611-2022']
    }
  ];

  T.options.backStyle = [
    {
      id: 'applied',
      name: 'Applied back (inset from rear edge)',
      group: 'backStyle',
      summary: 'A 6 mm (or 12 mm) back panel applied to the rear of the carcass, usually inset a little from the rear edges.',
      pros: ['Fast and simple', 'Good shear panel when screwed/stapled at close centres', 'Lets a service gap or hanging-rail recess sit behind the cabinet', 'Easy to replace'],
      cons: ['Thin 1/4" backs contribute little without a hanging rail or nailer', 'Applied back reduces interior depth by its thickness', 'Staples can show on the inside'],
      bestFor: ['Frameless base cabinets', 'Cabinets with an internal hanging rail', 'Painted or melamine interiors'],
      tooling: ['Screw gun/stapler', 'Square and clamps', 'Glue (optional)'],
      shopNotes: 'Fasten every 100-150 mm with a back that is a structural panel; for a 1/2" back, PWW screws every 4" on centre. Install the back while the carcass is clamped square and check the diagonals after.',
      sourceIds: ['pww-kitchen-cabinet-essentials', 'woodweb-back-construction', 'kcma-a1611-2022']
    },
    {
      id: 'rabbet',
      name: 'Rabbeted back',
      group: 'backStyle',
      summary: 'The back sits in a rabbet cut in the sides/top/bottom, so it is flush on both faces and held on all four edges.',
      pros: ['Squares and stiffens the carcass better than an applied back', 'Flush inside and out', 'No fasteners needed through the back face', 'Good compromise for 1/4" backs'],
      cons: ['A machining step on every side', 'Rabbet must match the actual back thickness', 'Less rear depth tolerance than a simple applied back'],
      bestFor: ['Wall cabinets and tall cabinets', 'Cabinets that will be handled or moved', 'Frameless boxes with a 6 mm back'],
      tooling: ['Router/table saw with rabbeting bit', 'Clamps', 'Screws/staples or glue'],
      shopNotes: 'Cut the rabbet 6 x 6 mm for a nominal 6 mm back and test with the actual sheet; plywood thickness varies. Glue the back and check square immediately after fitting.',
      sourceIds: ['woodweb-back-construction', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'dado',
      name: 'Dadoed (captured) back',
      group: 'backStyle',
      summary: 'The back is captured in a 1/4" x 1/2" dado set in from the rear edge, giving the stiffest connection and the best squareness.',
      pros: ['Stiffest, squarest back connection for a thin panel', 'No fasteners through the visible back', 'Good for hanging cabinets', 'Can hide the back edge of the sides'],
      cons: ['Most machining; stopped dadoes are fiddly', 'Must be assembled before the carcass is glued', 'Little tolerance for an out-of-size back'],
      bestFor: ['Wall and tall cabinets', 'Heavy or wide cabinets', 'Shop-built cases that must stay square'],
      tooling: ['Router/table saw dado setup', 'Clamps/glue'],
      shopNotes: 'Use a 6 mm deep, 12 mm wide dado (1/4" x 1/2") set in from the rear edge. Cut the back to the actual dado-to-dado size and dry-fit before gluing — the back doubles as a squaring panel.',
      sourceIds: ['woodweb-back-construction']
    },
    {
      id: 'none',
      name: 'No back',
      group: 'backStyle',
      summary: 'Open frame or a back panel added on site. Saves material and depth but contributes no shear panel and no wall-load path.',
      pros: ['Saves material and interior depth', 'Access for plumbing/electrical', 'Required for some open shelving designs'],
      cons: ['No racking resistance', 'No wall attachment through the back; needs a full frame or rail', 'Dust/insects/light enter from the wall cavity'],
      bestFor: ['Open shelving', 'Service cabinets with wall-mounted equipment', 'Appliance garages and open visible interiors'],
      tooling: ['Frame/rail assembly', 'Wall anchors'],
      shopNotes: 'Never use a backless cabinet as a wall cabinet without a full frame and a rail fixed to the wall; the back is the main load path in a standard hanging cabinet.',
      sourceIds: ['woodweb-back-construction', 'kcma-a1611-2022']
    }
  ];

  T.options.toeKickStyle = [
    {
      id: 'separate-platform',
      name: 'Separate toe-kick platform',
      group: 'toeKickStyle',
      summary: 'A plywood ladder platform built and levelled separately, with a finished/scribed kick face applied after the cabinets are set. The box sits on the platform.',
      pros: ['Level one long run, then set the boxes on it', 'The box is never cut around the floor', 'Kick face is replaceable and easy to scribe', 'Best method for a long base run'],
      cons: ['Extra parts and height', 'Platform must be straight and flat', 'Loses 4" of interior height'],
      bestFor: ['Long kitchen base runs', 'Uneven floors', 'Separate platform construction with a finished face'],
      tooling: ['Saw', 'Level/laser', 'Leveler feet or shims', 'Screw gun'],
      shopNotes: 'Build the platform like a ladder with notched stretchers, install it level, then fit the kick face last so it can be scribed to the floor. A standard toe base is 4" high with the frame at 3-1/2" for shimming.',
      sourceIds: ['pww-kitchen-cabinet-essentials', 'lilyann-toe-kicks', 'kcma-a1611-2022']
    },
    {
      id: 'notched-sides',
      name: 'Notched side panels',
      group: 'toeKickStyle',
      summary: 'The side panels extend to the floor with a notch cut out at the front bottom, and the kick face is applied between or over them.',
      pros: ['Fewer parts than a platform', 'Strong side-to-floor contact', 'Traditional for face-frame cabinets', 'Easy to understand'],
      cons: ['Every side panel needs a notch', 'Levelling on an uneven floor is harder', 'The notch removes material at the bottom-front corner'],
      bestFor: ['Face-frame cabinets', 'Short runs and single cabinets', 'Traditional construction'],
      tooling: ['Table saw/router for notch', 'Block plane', 'Shims/levelers'],
      shopNotes: 'Cut the notch after the side is cut to size, using a stopped cut and chisel to finish the corner. A 3-1/2" high x 3" deep notch leaves the toe space while keeping the side solid behind it.',
      sourceIds: ['kcma-a1611-2022', 'lilyann-toe-kicks']
    },
    {
      id: 'legs-levelers',
      name: 'Adjustable legs / levelers',
      group: 'toeKickStyle',
      summary: 'Adjustable legs or feet at the corners and centre, with a clip-on or screwed kick board; no platform and no notched sides.',
      pros: ['Fastest levelling on bad floors', 'Cabinets are independently adjustable', 'No platform parts', 'Good for frameless boxes with a clip-on toe kick'],
      cons: ['Load goes through the feet and back rail, not the floor line', 'Legs can be knocked or broken during install', 'Needs a clip/board system and a kick face part'],
      bestFor: ['Frameless cabinets', 'Bad floors', 'Fast installs with a clip-on toe kick'],
      tooling: ['Leveler legs', 'Kick clips', 'Screw gun', 'Level'],
      shopNotes: 'Install leg levellers at the four corners plus centres on wide cabinets, leave access to adjust them through the front before the kick board goes on, and always model the kick board as a separate part in the cut list.',
      sourceIds: ['pww-kitchen-cabinet-essentials', 'lilyann-toe-kicks']
    },
    {
      id: 'flush-base',
      name: 'Flush base (no recess)',
      group: 'toeKickStyle',
      summary: 'The cabinet front runs to the floor with no toe recess (or a shallow 1" recess). Maximum interior volume, no toe room.',
      pros: ['Maximum storage/interior', 'Simple box front', 'Furniture-style look for islands/vanities'],
      cons: ['Uncomfortable at a working counter (no foot room)', 'Does not meet KCMA toe-space minimums if fully flush', 'Floor scribing is unavoidable'],
      bestFor: ['Furniture-style islands', 'Appliance/tall housings where a front is not used as a work station', 'Statement pieces'],
      tooling: ['Standard box tooling', 'Scribe/moulding'],
      shopNotes: 'If the user chooses a flush base under a work counter, warn: KCMA requires at least a 2" deep x 3" high toe space when cabinets rest on the floor, and ergonomically the toe kick is what lets you stand close to the counter.',
      sourceIds: ['kcma-a1611-2022', 'lilyann-toe-kicks']
    },
    {
      id: 'none',
      name: 'No toe kick',
      group: 'toeKickStyle',
      summary: 'No toe-kick feature; fronts run to the floor or the cabinet is wall-hung.',
      pros: ['Simplest box', 'Correct for wall cabinets', 'Nothing to fit or scribe'],
      cons: ['Not suitable for a working base run', 'Floor contact needs a scribe or a plinth', 'Loses the ergonomic recess'],
      bestFor: ['Wall cabinets', 'Wall-hung vanities', 'Exposed furniture-style bases (with a plinth or scribe)'],
      tooling: ['Standard box tooling'],
      shopNotes: 'Only valid for wall cabinets and hanging units; for any floor-standing cabinet a toe kick (or a deliberate plinth) should be modelled, even if the choice is "none".',
      sourceIds: ['kcma-a1611-2022', 'lilyann-toe-kicks']
    }
  ];

  T.options.shelfSystem = [
    {
      id: 'adjustable-pins-32',
      name: 'Adjustable shelves on the 32 mm system',
      group: 'shelfSystem',
      summary: '5 mm shelf pins in line-bored holes: 32 mm pitch, front hole line 37 mm from the front edge, rear line 37 mm from the rear edge.',
      pros: ['Standard system holes take shelf pins, hinge plates and slides', 'Shelves move to suit contents', 'Cheap and simple', 'Easy to add/remove shelves later'],
      cons: ['Pins are a wear/point-load item', 'Shelf can wobble on cheap pins', 'Holes must be drilled consistently on both sides'],
      bestFor: ['Kitchen base and wall cabinets', 'Pantries and tall storage', 'Any cabinet where contents change'],
      tooling: ['32 mm boring jig or line borer', '5 mm brad-point bit', 'Drill stop'],
      shopNotes: 'Bore both sides from the same reference (the bottom edge) so the shelves are level; front row 37 mm from the front edge, rear row 37 mm from the rear edge, 32 mm pitch. Add a couple of extra holes at each end so shelves can move.',
      sourceIds: ['hettich-furniture-tech', 'woodweb-32mm-holes', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'adjustable-pins-custom',
      name: 'Adjustable shelves, custom pin spacing',
      group: 'shelfSystem',
      summary: 'Shelf pins on a non-standard spacing (e.g., 25 mm or 1"), used when the design warrants finer adjustment or the shop has its own jig.',
      pros: ['Finer adjustment than 32 mm', 'Can align shelves to design features', 'Kinder to a specific collection of items'],
      cons: ['Breaks hardware compatibility with the 32 mm line', 'Needs a custom jig and consistent setup', 'More chance of error on a long run'],
      bestFor: ['Specialty cabinets', 'Bookcases and display', 'Shops with a dedicated drilling jig'],
      tooling: ['Custom pin-hole jig or CNC', 'Drill stop'],
      shopNotes: 'Keep the front setback (37 mm) the same as system 32 so shelf depth still works with hinge plates. Document the spacing on the plan set; a future owner will not guess it.',
      sourceIds: ['hettich-furniture-tech', 'woodweb-32mm-holes']
    },
    {
      id: 'fixed-dado',
      name: 'Fixed shelves (dadoed)',
      group: 'shelfSystem',
      summary: 'Shelves housed in dadoes/rabbets and glued or screwed, becoming part of the carcass structure.',
      pros: ['Stiffens the cabinet; excellent span capability', 'No pins to fail; holds heavy loads', 'Can be edge-banded and show as a design feature'],
      cons: ['Not adjustable', 'Permanent joint', 'More machining and assembly time'],
      bestFor: ['Heavy storage (pots, books, appliances)', 'Tall/oven cabinets', 'Divider walls between bays'],
      tooling: ['Dado stack/router', 'Clamps and glue'],
      shopNotes: 'A fixed shelf is the right answer for any span over the material limit; rather than a thicker shelf, add a fixed mid shelf or centre divider and keep the rest adjustable.',
      sourceIds: ['woodweb-frameless-fasteners', 'kcma-a1611-2022']
    },
    {
      id: 'none',
      name: 'No shelves (open compartment)',
      group: 'shelfSystem',
      summary: 'An open compartment with no shelf — for appliance garages, waste bins, tall items or open display.',
      pros: ['Holds tall items', 'Fewer parts', 'Cheaper'],
      cons: ['No storage efficiency for small items', 'A full-height compartment may need a mid-rail/divider for door support'],
      bestFor: ['Appliance garages', 'Waste/recycling pull-outs', 'Broom and tall-item storage'],
      tooling: ['Standard box tooling'],
      shopNotes: 'If the cabinet has doors, check that the door height/hinge count still works with no mid rail; tall panels may need 3+ hinges.',
      sourceIds: ['kcma-a1611-2022']
    }
  ];

  T.options.doorStyle = [
    {
      id: 'slab',
      name: 'Slab door',
      group: 'doorStyle',
      summary: 'A single flat panel, usually 18-19 mm MDF, veneered plywood or solid stock, cut to size and edge-banded/lipped.',
      pros: ['Cheapest and fastest to make', 'Modern, clean look; easy to clean', 'Few joints to fail', 'Great for painted finishes and drawer fronts'],
      cons: ['Large flat panels can warp if unbalanced or too thin', 'No profile to hide a poor fit', 'Wide slabs look heavy'],
      bestFor: ['Modern/contemporary kitchens', 'Painted finishes', 'Budget-conscious runs'],
      tooling: ['Table saw/panel saw', 'Edge bander or iron', 'Drill/boring jig for hinge cups'],
      shopNotes: 'Use 18-19 mm MDF or a balanced veneered panel; finish both faces equally. Warn over 600 mm wide: use 22 mm+, three hinges, or switch to a frame-and-panel door.',
      sourceIds: ['lostart-kitchen-think', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'shaker',
      name: 'Shaker (recessed-panel) door',
      group: 'doorStyle',
      summary: 'A frame of stiles and rails with a flat or slightly recessed floating panel; the workhorse kitchen door and the default for this project.',
      pros: ['Classic, blends with many kitchens', 'Frame hides panel movement; panel floats', 'Strong, repairable, familiar to every cabinetmaker', 'Works with painted and stained finishes'],
      cons: ['Cope-and-stick stub tenons are the weak point', 'More machining and glue-up than a slab', 'Panel float must be right or the door bows'],
      bestFor: ['Kitchen-grade runs', 'Painted or stained cabinetry', 'Doors 300-750 mm wide'],
      tooling: ['Cope-and-stick router bits or matched set', 'Router table', 'Clamps and cauls', 'Panel-raising bit (if raised)'],
      shopNotes: 'Rail length = door width - 2 x stile width + 2 x tenon length. Cut the panel 6 mm narrower than the rail length (3 mm per side) and let it float. Glue the frame, not the panel.',
      sourceIds: ['cmt-rail-stile', 'fww-three-ways-doors', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'raised-panel',
      name: 'Raised-panel door',
      group: 'doorStyle',
      summary: 'A frame with a solid, fielded panel raised on a shaper/router; the traditional kitchen and furniture door.',
      pros: ['Classic, substantial look', 'Solid wood panel can be refinished/restored', 'Works with cope-and-stick or mitred frame', 'Good for formal kitchens'],
      cons: ['Heavier: needs more hinges and stronger boxes', 'Panel movement is larger; float allowance critical', 'More material and machining cost'],
      bestFor: ['Traditional and formal kitchens', 'Stain-grade hardwood', 'Doors where the panel is a feature'],
      tooling: ['Raised-panel bit', 'Cope-and-stick/matched set', 'Router table/shaper', 'Clamps'],
      shopNotes: 'Use a 19 mm+ panel, raised with a back-cut relief, and allow 3 mm+ float per side. Weigh/height-check the finished door before choosing the hinge count.',
      sourceIds: ['cmt-rail-stile', 'fww-three-ways-doors']
    },
    {
      id: 'beadboard',
      name: 'Beadboard door',
      group: 'doorStyle',
      summary: 'A frame or slab face with a beaded (V-grooved) panel, either routed MDF beadboard or tongue-and-groove boards.',
      pros: ['Cottage/farmhouse character', 'Inexpensive panel material', 'Hides surface imperfections well in paint', 'Works with a simple frame'],
      cons: ['Beads collect finish if sprayed wet', 'Individual boards shrink and open the V-grooves', 'MDF panel edges must be sealed'],
      bestFor: ['Cottage/farmhouse kitchen', 'Painted cabinetry', 'Pantry and utility doors'],
      tooling: ['Beading bit/beadboard panel', 'Frame joinery tooling', 'Spray or brush finish'],
      shopNotes: 'Rout the bead before assembly and seal the panel before finish. If using individual boards, allow for total panel shrinkage across the width, not just a single panel allowance.',
      sourceIds: ['fww-three-ways-doors', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'glass',
      name: 'Glass door',
      group: 'doorStyle',
      summary: 'A frame with a rabbet or groove holding glass, glazed from the rear with putty or removable wood stops.',
      pros: ['Displays contents; makes small kitchens feel larger', 'Lightweight', 'Frame can match other doors exactly'],
      cons: ['Less stiff than a panelled door', 'Glass must be removed/replaced from the back', 'Retainers/finish take time'],
      bestFor: ['Upper display cabinets', 'China/glassware storage', 'Kitchen runs that need visual variety'],
      tooling: ['Frame joinery tooling', 'Rabbeting bit', 'Glass cutter/glazier'],
      shopNotes: 'Cut the bottom retainer in two pieces so the glass can be replaced without dismantling the door. Glaze with putty or screw-on stops; do not glue glass into a moving wood frame.',
      sourceIds: ['fww-three-ways-doors']
    },
    {
      id: 'mullion-glass',
      name: 'Mullioned glass door',
      group: 'doorStyle',
      summary: 'A glass door with muntin bars forming panes, either as part of the frame or as an applied grid.',
      pros: ['Traditional, furniture-like detail', 'Breaks up large glass panes', 'Matches period kitchens'],
      cons: ['Each pane and muntin joint is a failure point', 'Spacing/setting-out errors are visible', 'More machining and assembly time'],
      bestFor: ['Traditional upper cabinets', 'Period kitchens', 'Feature cabinets'],
      tooling: ['Frame tooling', 'Half-lap/cope jigs for muntins', 'Glazing tools'],
      shopNotes: 'Set muntins out from the door centreline so the panes are symmetric, and capture them in the frame; never rely on the glass to hold the muntins. Use the same frame thickness as the other doors.',
      sourceIds: ['fww-three-ways-doors']
    }
  ];

  T.options.doorJoinery = [
    {
      id: 'cope-stick',
      name: 'Cope-and-stick frame',
      group: 'doorJoinery',
      summary: 'Matched router bits cut the sticking profile/groove on the stiles and rails and the matching cope (with a stub tenon) on the rail ends.',
      pros: ['Fast, repeatable, strong mechanical interlock', 'One setup produces the entire frame', 'Standard for kitchen doors', 'Works with many profiles'],
      cons: ['Stub tenon is short (often 11 mm / 7/16") and is the weak point', 'Profiled edge can split under abuse', 'Bits are expensive; setup takes tuning'],
      bestFor: ['Kitchen shaker and raised-panel doors', 'Small-shop production', 'Paint or stain grade'],
      tooling: ['Cope-and-stick matched set or reversible/combination bits', 'Router table with fence', 'Backer blocks', 'Clamps'],
      shopNotes: 'Glue a plywood panel into the grooves to reinforce the stub-tenon frame, and keep a sample joint from the final setup as a reference. Check the cope/stick fit on scrap at the full stock thickness before running door parts.',
      sourceIds: ['cmt-rail-stile', 'fww-three-ways-doors']
    },
    {
      id: 'mitered',
      name: 'Mitred frame',
      group: 'doorJoinery',
      summary: 'The frame members meet at 45-degree mitres, giving a clean profile on both faces; often combined with a mortise-and-tenon, domino or spline for strength.',
      pros: ['Clean look on both faces (good for inset/furniture doors)', 'No end-grain showing at the joint', 'Works with an elegant back profile'],
      cons: ['Glue-only mitres are weak; needs a tenon/spline/domino', 'Mitres must be perfect or the joint opens', 'More clamping and setup time'],
      bestFor: ['Furniture-grade and inset doors', 'Doors seen from both sides', 'High-end kitchens'],
      tooling: ['Table saw/router mitre setup', 'Domino/tenoner/spline jig', 'Clamping squares and cauls'],
      shopNotes: 'Reinforce every mitre mechanically: a domino or a spline in the mitre is the difference between a door that lasts and one that opens in a dry winter. Mirror the grain around the frame when cutting from the same board.',
      sourceIds: ['fww-three-ways-doors']
    },
    {
      id: 'dowel',
      name: 'Dowelled frame',
      group: 'doorJoinery',
      summary: 'Dowel joints at the frame corners, often with a stub or through tenon; a traditional, strong alternative to cope-and-stick.',
      pros: ['Strong, hidden joint', 'No expensive router profile required', 'Works with mitred or butt-corner frames', 'Repairable-ish'],
      cons: ['Alignment depends on accurate dowel holes', 'Slower than cope-and-stick', 'Glue and clamp every joint'],
      bestFor: ['Shops without cope-and-stick tooling', 'Painted frame doors', 'Custom/one-off doors'],
      tooling: ['Dowel jig', 'Drill press', 'Clamps'],
      shopNotes: 'Use a dowel jig referenced from the same face for every joint, and dry-fit the whole door before glue. Two 8 mm dowels per corner is a minimum; three for wide rails.',
      sourceIds: ['fww-three-ways-doors', 'cmt-rail-stile']
    },
    {
      id: 'domino',
      name: 'Floating-tenon (domino) frame',
      group: 'doorJoinery',
      summary: 'Loose floating tenons cut with a Domino-style machine join the frame corners; effectively a fast mortise-and-tenon.',
      pros: ['Strong, glue-friendly joint', 'Fast and repeatable with the machine', 'Allow mitred or butt corners', 'Clean, hidden joint'],
      cons: ['Machine cost/availability', 'Tenon length limited by cutter and door thickness', 'Still needs accurate layout'],
      bestFor: ['Shops with a Domino', 'Mitred or furniture-grade frames', 'Custom doors and drawer fronts'],
      tooling: ['Domino/loose-tenon machine', 'Clamps/cauls'],
      shopNotes: 'Use the longest tenon that fits the frame section (typical door stock 19 mm) and glue both mortise and tenon. Treat the resulting joint like a mortise-and-tenon when calculating strength, not like a stub tenon.',
      sourceIds: ['fww-three-ways-doors']
    }
  ];

  T.options.doorOverlay = [
    {
      id: 'full',
      name: 'Full overlay',
      group: 'doorOverlay',
      summary: 'The door covers the whole carcass side or face-frame stile less a reveal; the modern default and the easiest to build in frameless construction.',
      pros: ['Flat, modern face with no frame visible', 'Maximum opening access', 'Standard Euro hinges and plates cover the required overlay', 'Forgiving of minor box-size errors'],
      cons: ['Reveal gaps show; requires door alignment to stay consistent', 'A pair of doors needs a shared reveal and enough hinge clearance', 'Face-frame full overlay requires a hinge/plate that can reach the overlay'],
      bestFor: ['Frameless kitchens', 'Modern/full-access design', 'The default for this project'],
      tooling: ['Euro cup hinge + plates', '32 mm line boring', 'Door and cabinet assembly tooling'],
      shopNotes: 'Frameless full overlay: each door overlays (side thickness - reveal). With 18 mm sides and a 3 mm reveal that is 15 mm per side; with 19 mm sides, 16 mm. Verify the hinge plate height against that overlay using the manufacturer formula.',
      sourceIds: ['hettich-furniture-tech', 'blum-clip-top-guide-2015', 'fhb-overlay-forum']
    },
    {
      id: 'inset',
      name: 'Inset',
      group: 'doorOverlay',
      summary: 'The door sits inside the opening flush with the face frame/carcass, with a controlled reveal all round. The most demanding and most traditional relationship.',
      pros: ['Furniture-grade look; the whole face plane is visible', 'Door thickness reads as part of the design', 'Works with butt or inset Euro hinges'],
      cons: ['Requires precise box and door sizes plus a hinge that gives the needed reveal', 'Small errors show directly as uneven gaps', 'Minimum reveal depends on door thickness and boring distance'],
      bestFor: ['Traditional/fine kitchens', 'Face-frame or precisely built frameless boxes', 'Furniture-style islands and pantries'],
      tooling: ['Inset/cranked Euro hinges or butt hinges', 'Precise boring jig', 'Scribing/planing skill', 'Clamps'],
      shopNotes: 'Size the door = opening - 2 x reveal, and check the reveal against the hinge minimum-reveal table for the door thickness. A 2-3 mm inset gap is achievable; below 2 mm, door thickness and hinge choice become critical.',
      sourceIds: ['hardwaresource-inset-reveal', 'blum-clip-top-guide-2015', 'woodweb-reveals']
    }
  ];

  T.options.hingeType = [
    {
      id: 'euro-cup',
      name: 'Euro concealed cup hinge (35 mm)',
      group: 'hingeType',
      summary: 'A concealed hinge with a 35 mm cup bored in the door and a mounting plate on the cabinet; 3D adjustable and the standard for kitchen cabinets.',
      pros: ['Invisible when the door is closed', '3D adjustment (overlay, height, depth)', 'Fast to install with system holes', 'Wide range of overlay/cranking options and soft-close'],
      cons: ['Needs a 35 mm cup bore (minimum 13 mm deep)', 'Hinge count/weight must be respected', 'Door must be thick enough for the cup'],
      bestFor: ['Frameless and face-frame kitchen doors', 'Shaker/slab/raised-panel doors', 'Any door 16-26 mm thick'],
      tooling: ['35 mm Forstner/hinge bit', 'Drilling jig or boring machine', 'Drill for plate screws', 'Screwdriver for adjustment'],
      shopNotes: 'Bore the cup 35 mm diameter and at least 13 mm deep, cup centre 22.5 mm from the hinge edge for a 5 mm boring distance. Mount the plate on the 32 mm line. Use the manufacturer overlay formula (FD + boring distance - plate height = overlay) to check the door will close with the intended gap.',
      sourceIds: ['blum-clip-top-guide-2015', 'hettich-furniture-tech', 'richelieu-blum-hinges-2009']
    },
    {
      id: 'butt',
      name: 'Butt hinge',
      group: 'hingeType',
      summary: 'A traditional visible hinge mortised into the door edge and the frame/cabinet side; the classic choice for inset and face-frame furniture.',
      pros: ['Traditional look appropriate to inset/face-frame work', 'Strong and repairable', 'No cup boring required', 'Works where a cup hinge cannot (thin/ornate doors)'],
      cons: ['Visible when closed', 'Requires accurate mortises in door and frame', 'Reveal must clear the knuckle; less adjustable than a Euro hinge'],
      bestFor: ['Inset face-frame cabinets', 'Furniture-style pantries and islands', 'Period/restoration work'],
      tooling: ['Butt-hinge router jig or chisel', 'Marking gauge', 'Screwdriver'],
      shopNotes: 'Choose the hinge first, then size the reveal to clear the knuckle. Mortise depth equals the leaf thickness, and the door reveal must allow the door to swing without binding on the frame.',
      sourceIds: ['lostart-kitchen-think', 'fww-three-ways-doors']
    }
  ];

  T.options.drawerFrontStyle = [
    {
      id: 'slab',
      name: 'Slab drawer front',
      group: 'drawerFrontStyle',
      summary: 'A flat front panel matching the slab door style; the standard for modern drawer stacks.',
      pros: ['Simple, cheap, easy to align', 'Modern look', 'Easy to clean', 'Works with any pull placement'],
      cons: ['No profile to hide a slightly proud box or uneven gap', 'Large flat fronts can telegraph imperfections'],
      bestFor: ['Modern kitchens', 'Painted fronts', 'Deep pan drawers'],
      tooling: ['Table saw', 'Edge bander/boring for pull holes'],
      shopNotes: 'Cut the front from the same sheet/batch as the doors so the finish matches, and drill pull holes after the front is fitted to the box so they line up with the drawer centreline.',
      sourceIds: ['pww-kitchen-cabinet-essentials', 'lostart-kitchen-think']
    },
    {
      id: 'shaker',
      name: 'Shaker drawer front',
      group: 'drawerFrontStyle',
      summary: 'A frame-and-panel drawer front matching the shaker doors; the panel is usually flat and the frame is the same width as the door stiles.',
      pros: ['Matches shaker doors exactly', 'Frame stiffens the front', 'Traditional look'],
      cons: ['More parts and glue-up than a slab', 'Frame joints must align with the door pattern', 'Heavier'],
      bestFor: ['Shaker kitchens', 'Stain-grade hardwood', 'Visible drawer stacks'],
      tooling: ['Cope-and-stick/door tooling', 'Frame clamps', 'Boring for pulls'],
      shopNotes: 'Make the drawer fronts in the same batch as the doors and lay out the stiles/rails so the horizontal lines line up across doors and drawers. Use the same panel float rules as doors.',
      sourceIds: ['cmt-rail-stile', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'raised-panel',
      name: 'Raised-panel drawer front',
      group: 'drawerFrontStyle',
      summary: 'A frame-and-panel front with a raised/fielded panel, matching raised-panel doors.',
      pros: ['Traditional, high-end look', 'Matches raised-panel doors', 'Substantial feel'],
      cons: ['Heaviest front option; box/slide load must be checked', 'More machining', 'Panel movement to allow for'],
      bestFor: ['Traditional kitchens', 'Formal furniture-style runs', 'Stain-grade hardwood'],
      tooling: ['Raised-panel bit', 'Frame tooling', 'Clamps'],
      shopNotes: 'Keep the front thickness consistent so the pull projection and box clearance stay right, and check the drawer slide load rating with the heavier front weight.',
      sourceIds: ['cmt-rail-stile', 'fww-three-ways-doors']
    }
  ];

  T.options.drawerJoinery = [
    {
      id: 'dovetail',
      name: 'Dovetail box',
      group: 'drawerJoinery',
      summary: 'Through or half-blind dovetails at the box corners; the strongest pull-out joint and the kitchen default.',
      pros: ['Best resistance to pull-out forces', 'Mechanical lock plus glue', 'Premium look on through dovetails', 'Very durable'],
      cons: ['Slower; needs a jig or hand skill', 'Layout must allow for the front/back dimensions', 'Harder to repair if broken'],
      bestFor: ['Kitchen drawer boxes', 'Wide/heavy drawers', 'Visible drawer interiors'],
      tooling: ['Dovetail jig or hand saw/chisels', 'Router', 'Clamps and glue'],
      shopNotes: 'Through dovetails let the sides run the full slide length; half-blind dovetails at the front keep the drawer face clean but shorten the sides by the joint allowance. Size the box from the slide family clearance, then lay out the dovetails.',
      sourceIds: ['lostart-kitchen-think', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'box-joint',
      name: 'Box (finger) joint',
      group: 'drawerJoinery',
      summary: 'Interlocking square fingers at the corners, glued; strong, decorative and jig-friendly.',
      pros: ['Strong, glued interlock', 'Fast with a table-saw or dedicated jig', 'Decorative look', 'No special router bits'],
      cons: ['Fingers show; needs a clean setup', 'Slightly less pull-out resistance than a dovetail (glue-dependent)', 'Indexing jig setup time'],
      bestFor: ['Painted drawer boxes', 'Shop cabinets', 'Boxes where the joint is a feature'],
      tooling: ['Table-saw box-joint jig or dado stack', 'Clamps and glue'],
      shopNotes: 'Glue is doing the work in a box joint: size the fingers for a snug fit and clamp square. Use it where the drawer interior will be painted, because the exposed end grain takes paint differently.',
      sourceIds: ['lostart-kitchen-think']
    },
    {
      id: 'butt-screw',
      name: 'Butt joint + screws',
      group: 'drawerJoinery',
      summary: 'Plain butt joints with screws (and glue if you like). The cheapest box, with visible fasteners and the least strength.',
      pros: ['Fastest and cheapest', 'No jig', 'Adequate for light utility drawers'],
      cons: ['Low strength under pull-out load', 'Screws can split the box sides', 'Not acceptable for a kitchen showpiece'],
      bestFor: ['Shop/utility drawers', 'Low-cost temporary boxes'],
      tooling: ['Drill and driver', 'Countersink'],
      shopNotes: 'Not recommended for a kitchen run: the drawer front pull-out load is carried entirely by the screws in end grain. If used, glue the joint and keep the drawer light.',
      sourceIds: ['woodweb-frameless-fasteners']
    },
    {
      id: 'dado',
      name: 'Dado/rabbet drawer box',
      group: 'drawerJoinery',
      summary: 'Sides housed in dadoes or rabbets in the front/back, glued and/or screwed; a strong production box requiring no special corner joint.',
      pros: ['Strong with glue; lots of glue area', 'Fast on a table saw', 'Hidden joint', 'Good for applied-front drawers'],
      cons: ['A through dado shows on the drawer outside', 'Needs setup per drawer size', 'Glue and clamp time'],
      bestFor: ['Production drawer boxes', 'Painted/utility drawers', 'Shops without a dovetail jig'],
      tooling: ['Table saw dado stack', 'Router', 'Clamps and glue'],
      shopNotes: 'Housing the sides in a stopped dado keeps the drawer front and back solid; run the bottom groove at the same time so the box goes together in one glue-up.',
      sourceIds: ['lostart-kitchen-think', 'woodweb-frameless-fasteners']
    }
  ];

  T.options.drawerBottom = [
    {
      id: 'dado',
      name: 'Dadoed drawer bottom',
      group: 'drawerBottom',
      summary: 'The bottom is captured in a groove in the sides and front, typically 6 mm up from the bottom edge; the standard for undermount slides.',
      pros: ['Strongest bottom attachment', 'Allows the bottom to float/move', 'Fits under-mount slide requirements', 'No fasteners through the bottom'],
      cons: ['A groove on every side; less strong if too near the bottom edge', 'Bottom thickness must match the groove', 'Less depth inside the drawer'],
      bestFor: ['Kitchen drawer boxes', 'Undermount slides (12 mm bottom recess)', 'Dovetail boxes'],
      tooling: ['Table saw/router groove setup', 'Clamps and glue'],
      shopNotes: 'Standard is a 6 mm bottom in a groove about 12 mm up from the bottom (the TANDEM locking devices expect a 13 mm bottom recess); glue only the front edge so the bottom can move.',
      sourceIds: ['richelieu-blum-tandem-2017', 'lostart-kitchen-think', 'pww-kitchen-cabinet-essentials']
    },
    {
      id: 'rabbet',
      name: 'Rabbeted drawer bottom',
      group: 'drawerBottom',
      summary: 'The bottom sits in a rabbet around the underside of the box, often nailed/screwed; quicker than a dado but less structural.',
      pros: ['Faster to machine', 'Easy to replace', 'Works with side-mount slides', 'Slightly more interior depth'],
      cons: ['Less structural than a dado', 'Fasteners visible from below', 'Bottom can move/rattle if not sized well'],
      bestFor: ['Side-mount/center-mount drawer boxes', 'Shop/utility drawers', 'Painted boxes'],
      tooling: ['Router/table saw rabbeting setup', 'Nailer/screw gun'],
      shopNotes: 'Leave 1 mm of movement room and fasten through the rabbet, not the bottom panel centre. Not the best choice for an undermount slide that needs a 12 mm bottom recess and a flat, strong bottom.',
      sourceIds: ['lostart-kitchen-think']
    }
  ];

  T.options.drawerSlide = [
    {
      id: 'undermount',
      name: 'Undermount soft-close slide (Blum TANDEM class)',
      group: 'drawerSlide',
      summary: 'Concealed, full-extension undermount slide with integrated soft-close; the kitchen default. The slide fixes the drawer box geometry precisely.',
      pros: ['Invisible, smooth and quiet with soft-close', 'Full extension; excellent adjustability via locking devices', 'Very stable under load', 'The premium kitchen choice'],
      cons: ['Strict box sizing: inside width = opening - 42 mm, bottom recess, rear notch', 'More expensive', 'Less forgiving of a box built to a different slide rule'],
      bestFor: ['Kitchen drawer stacks', 'Pan drawers', 'Any drawer where the hardware should disappear'],
      tooling: ['Drill/driver', 'Slide installation jigs (recommended)', 'Boring for locking-device holes'],
      shopNotes: 'Inside drawer width must equal opening width minus 42 mm; for 12.7 mm sides that makes the outside box width opening minus 16.6 mm (5/8" less). Bottom recess 12.7 mm; box depth = nominal slide length (21" slide for a 24" base). Install the slides before the drawer front and adjust the face with the locking devices.',
      sourceIds: ['pww-tandem-sizing', 'lostart-kitchen-think', 'richelieu-blum-tandem-2017', 'blum-clip-top-guide-2015']
    },
    {
      id: 'side-mount',
      name: 'Side-mount ball-bearing slide (Accuride 3832 class)',
      group: 'drawerSlide',
      summary: 'Two-part ball-bearing slides screwed to the cabinet side and the drawer side; 1/2" of side space each, full extension and 100 lb class.',
      pros: ['Cheap, dependable and easy to install', 'Only width is constrained; box depth can vary', 'Works with any bottom construction', 'Full extension and lever disconnect'],
      cons: ['Visible when the drawer is open', 'Not silent (metal-on-metal)', 'Takes 1/2" of width each side', 'No integrated soft-close on basic models'],
      bestFor: ['Shop/utility drawers', 'File and deep drawers', 'Budgets where undermount is not justified'],
      tooling: ['Drill/driver', 'Slide jig or spacer blocks'],
      shopNotes: 'Box outside width = opening - 25.4 mm (1/2" per side). Mount the cabinet member level and square to the face, or the drawer will rub. Allow for the slide profile height when sizing the drawer.',
      sourceIds: ['accuride-3832e', 'lostart-kitchen-think']
    },
    {
      id: 'center-mount',
      name: 'Center-mount (single-track) slide',
      group: 'drawerSlide',
      summary: 'A single nylon roller slide under the drawer centre, with the rail cut to the cabinet depth; the cheapest drawer slide type.',
      pros: ['Very cheap', 'Simple installation', 'Tolerant of imperfect drawer boxes', 'Good for lightweight trays'],
      cons: ['Tilts/racks if the drawer is loaded off-centre', 'Partial extension (typically 3/4)', 'Not soft-close', 'Drawer must be shorter than the cabinet'],
      bestFor: ['Economy drawers', 'Rollout trays', 'Shop cabinets and utility storage'],
      tooling: ['Stapler/screw gun', 'Rail cutter', 'Level'],
      shopNotes: 'KV 1175 class: 1/8" side clearance each side, 1" high slide, and the drawer must be 1-1/4" shorter than the cabinet depth. Do not use the 42 mm undermount clearance for a centre-mount drawer.',
      sourceIds: ['kv-1175', 'lostart-kitchen-think']
    }
  ];

  T.options.faceFrameJoinery = [
    {
      id: 'pocket-screw',
      name: 'Pocket-screw face frame',
      group: 'faceFrameJoinery',
      summary: 'Face-frame rails and stiles joined with fine-thread pocket screws; fast, strong enough, and the common small-shop method.',
      pros: ['Fast, no clamps, cheap jig', 'Strong enough for face frames', 'Easy to learn', 'Pockets hidden on the back of the frame'],
      cons: ['Pockets on the back must not interfere with carcass fitting', 'Screw holding in end grain is moderate', 'Care needed at 45-degree mitres'],
      bestFor: ['Face-frame kitchens', 'Painted frames', 'Small-shop production'],
      tooling: ['Pocket-hole jig', 'Clamp', 'Square'],
      shopNotes: 'Lay out the frame on a flat table, clamp it square, and pocket-screw from the back so the pockets are hidden. Check diagonals before the glue sets.',
      sourceIds: ['pww-kitchen-cabinet-essentials', 'woodweb-frameless-fasteners']
    },
    {
      id: 'biscuit',
      name: 'Biscuit-joined face frame',
      group: 'faceFrameJoinery',
      summary: 'Biscuits plus glue/screws at the frame joints; good alignment, needs clamping.',
      pros: ['Good alignment', 'Hidden joint', 'Cheap consumables'],
      cons: ['Needs clamps/glue time', 'Biscuits alone are not strong enough for stress joints', 'Swelling can show at the joint'],
      bestFor: ['Painting-grade face frames', 'Shop-assembled frames with clamp time'],
      tooling: ['Biscuit joiner', 'Clamps and glue'],
      shopNotes: 'Use biscuits for alignment with glue and add a screw or two at the joints that will carry door weight. Keep biscuits 50 mm+ from the frame ends to avoid blow-out.',
      sourceIds: ['pww-kitchen-cabinet-essentials', 'fww-three-ways-doors']
    },
    {
      id: 'dowel',
      name: 'Dowelled face frame',
      group: 'faceFrameJoinery',
      summary: 'Dowel joints in the face-frame rails/stiles; strong, hidden, and traditional.',
      pros: ['Strong, hidden joint', 'No pocket holes on the back', 'Traditional'],
      cons: ['Accurate dowel alignment needed', 'Glue and clamp time', 'Slower than pocket screws'],
      bestFor: ['Stain-grade face frames', 'Shops with a dowel jig', 'High-quality painted frames'],
      tooling: ['Dowel jig', 'Clamps and glue'],
      shopNotes: 'Reference every joint from the face side and dry-fit the whole frame before glue. Two 8 mm dowels per rail end is a sensible minimum.',
      sourceIds: ['fww-three-ways-doors', 'hettich-furniture-tech']
    },
    {
      id: 'mortise-tenon',
      name: 'Mortise-and-tenon face frame',
      group: 'faceFrameJoinery',
      summary: 'Traditional mortise-and-tenon face frames; the strongest and most furniture-like frame joint, with the most hand work.',
      pros: ['Strongest frame joint', 'Traditional and repairable', 'Good for stained hardwood frames', 'Mechanical interlock plus glue'],
      cons: ['Most time and skill', 'Needs accurate mortises/tenons', 'Overkill for painted kitchen frames'],
      bestFor: ['Fine furniture-style kitchens', 'Stain-grade hardwood frames', 'Visible/inset frame work'],
      tooling: ['Mortiser or router jig', 'Tenoning jig/table saw', 'Chisels', 'Clamps'],
      shopNotes: 'Size the tenon at about one-third the rail thickness and use a haunched tenon at the top rail where the frame meets a cabinet side. Pin or draw-bore only if the design asks for it.',
      sourceIds: ['fww-three-ways-doors', 'pww-kitchen-cabinet-essentials']
    }
  ];

  T.options.edgeBanding = [
    {
      id: 'pvc-0.5',
      name: '0.5 mm PVC edge banding',
      group: 'edgeBanding',
      summary: 'Thin PVC banding, iron-on or PSA, applied to exposed panel edges; the standard economical choice for melamine/plywood carcasses.',
      pros: ['Cheap and fast', 'Wide colour/finish range', 'Durable enough for interior edges', 'Easy to trim'],
      cons: ['Can telegraph through paint', 'Less impact-resistant than thicker banding', 'Adhesive can fail on a poor edge prep'],
      bestFor: ['Carcass front edges', 'Interior shelf edges', 'Melamine/PB boxes'],
      tooling: ['Iron or PSA applicator', 'Edge trimmer', 'Roller'],
      shopNotes: 'Sand the panel edge flat and clean before banding; trim with the grain and roll the band hard. On painted work, a 0.5 mm band shows a witness line — use 2 mm PVC or wood tape on exposed edges.',
      sourceIds: ['fastcap-fastedge', 'woodweb-hotair-edgebander', 'kcma-a1611-2022']
    },
    {
      id: 'pvc-2',
      name: '2 mm PVC edge banding',
      group: 'edgeBanding',
      summary: 'Thick PVC banding for exposed and high-wear edges: shelf fronts, drawer tops, doors that get knocked.',
      pros: ['Much more impact-resistant', 'Radiused edge feels better', 'Better painted edge', 'Hides minor edge damage'],
      cons: ['Needs a glue-pot edgebander or careful hot-air work', 'Harder to trim flush in a small shop', 'Colour match can be limited'],
      bestFor: ['Exposed shelf fronts', 'Drawer box top edges', 'Doors and drawer fronts on high-wear cabinets'],
      tooling: ['Glue-pot edgebander, or hot-air bander used within its limits', 'Flush trimmer', 'File/radius tool'],
      shopNotes: 'Hot-air banders struggle above about 1 mm; if that is the only machine, use 1 mm flexible PVC on exposed edges instead of 2 mm, and keep the banding at room temperature before feeding.',
      sourceIds: ['woodweb-hotair-edgebander', 'fastcap-fastedge']
    },
    {
      id: 'wood-tape',
      name: 'Wood veneer tape / iron-on wood banding',
      group: 'edgeBanding',
      summary: 'A thin wood veneer strip that accepts stain and finish like the face veneer; used for stain-grade plywood edges.',
      pros: ['Takes stain/finish; blends with veneer', 'Cheap and available in common species', 'Easy to trim with a knife'],
      cons: ['Can lift or telegraph at the joint', 'Thin and easy to sand through', 'Adhesive line can show under clear finish'],
      bestFor: ['Stain-grade plywood shelves and carcass edges', 'Furniture-grade work', 'Small shops without a PVC machine'],
      tooling: ['Iron', 'Utility knife', 'Sanding block'],
      shopNotes: 'Test the finish over the tape before committing; some tapes take stain darker than the face veneer. Seal the edge first on porous cores so the adhesive does not soak in and starve the bond.',
      sourceIds: ['fastcap-fastedge', 'kcma-a1611-2022']
    },
    {
      id: 'none',
      name: 'No edge banding (solid lipping or sealed edges)',
      group: 'edgeBanding',
      summary: 'Exposed edges are solid wood lipping, painted/sealed MDF edges or deliberately exposed plywood edges; no tape/banding applied.',
      pros: ['No banding to fail or show', 'Solid lipping can be shaped and repaired', 'Honest plywood-edge look if the design wants it'],
      cons: ['MDF edges must be sealed/primed or they fuzz and show', 'Plywood edges show voids/layers unless filled', 'More labour on a solid lipping'],
      bestFor: ['Painted MDF parts with a good sealer/primer', 'Solid-wood lipped shelves', 'Designs that expose plywood edges deliberately'],
      tooling: ['Primer/sealer', 'Edge sander/block plane', 'Solid lipping + clamps if used'],
      shopNotes: 'Never leave a raw MDF or particleboard edge exposed to a kitchen: it swells at the first spill. Seal with a sanding sealer/primer and sand, or lip it with solid stock.',
      sourceIds: ['kcma-a1611-2022', 'fastcap-fastedge']
    }
  ];

  T.options.finish = [
    {
      id: 'paint',
      name: 'Water-based or alkyd paint',
      group: 'finish',
      summary: 'Primer plus 2-3 topcoats of a quality cabinet paint, sprayed or brushed; the default for paint-grade kitchens.',
      pros: ['Hides grain and species differences', 'Easy to retouch', 'Huge colour range', 'Modern look'],
      cons: ['Shows surface imperfections and witness lines', 'Brush marks on large flat doors', 'Cure before heavy use; MDF edges must be sealed'],
      bestFor: ['Paint-grade shaker/slab kitchens', 'MDF and poplar doors', 'DIY-friendly finishing'],
      tooling: ['HVLP sprayer or quality brush/roller', 'Sanding blocks', 'Tack cloth', 'Respirator'],
      shopNotes: 'Prime MDF edges with a sanding sealer, sand 220-320 between coats, and finish doors flat before hanging. Allow the film to cure before installing heavy hardware.',
      sourceIds: ['gf-topcoat-guide', 'kcma-a1611-2022']
    },
    {
      id: 'lacquer',
      name: 'Pre-catalysed lacquer',
      group: 'finish',
      summary: 'A spray-only nitrocellulose lacquer with a pre-blended catalyst; fast-drying, repairable and traditional for fine cabinetry.',
      pros: ['Very fast dry and recoat', 'Repairable/rubbable', 'Good depth on stain-grade wood', 'Professional spray finish'],
      cons: ['Flammable, strong odour; needs a proper spray area', 'Ambers over time', 'Less chemical resistance than CV/2K poly'],
      bestFor: ['Stain-grade furniture-style kitchens', 'Spray-equipped shops', 'Doors and drawer fronts finished off the cabinet'],
      tooling: ['Spray gun (HVLP/conventional)', 'Spray booth/ventilation', 'Respirator', 'Sanding supplies'],
      shopNotes: 'Spray light coats, sand 320-400 between, and allow maximum properties about 30 days. Do not stack freshly finished fronts face to face.',
      sourceIds: ['mohawk-precat-lacquer', 'gf-topcoat-guide']
    },
    {
      id: 'water-poly',
      name: 'Water-based polyurethane topcoat',
      group: 'finish',
      summary: 'A clear water-based acrylic/polyurethane topcoat; low odour, non-yellowing and DIY-friendly.',
      pros: ['Low odour, soap-and-water cleanup', 'Does not yellow', 'Good for cabinets and furniture', 'Spray or brush'],
      cons: ['Can look plastic/blue on dark wood', 'Raises grain on first coat', 'Lower solvent resistance than lacquer/CV'],
      bestFor: ['DIY kitchen finishing', 'Light-coloured woods', 'Shops without spray equipment'],
      tooling: ['Quality brush/HVLP', 'Sanding supplies', 'Tack cloth'],
      shopNotes: '3 coats minimum, light sand between; full cure about 21 days. Seal end grain and edges first — water-based finishes raise grain, especially on plywood edges and MDF.',
      sourceIds: ['gf-topcoat-guide', 'kcma-a1611-2022']
    },
    {
      id: 'hardwax-oil',
      name: 'Hardwax oil',
      group: 'finish',
      summary: 'A penetrating oil/wax finish that leaves a natural, low-build look and can be spot-repaired; popular for oak/ash furniture-style kitchens.',
      pros: ['Natural look and feel', 'Easy spot repair', 'No film to peel', 'Low odour products available'],
      cons: ['Lower chemical/water resistance than film finishes', 'Needs periodic re-oiling', 'Water rings/stains possible', 'Not ideal for a hard-working wet kitchen'],
      bestFor: ['Natural oak/ash kitchens', 'Furniture-style islands and open shelving', 'Low-maintenance-look interiors'],
      tooling: ['Cloth/roller', 'Buffing pad', 'Sanding supplies'],
      shopNotes: 'Apply thin coats and buff off the excess; two coats minimum, more on end grain. Warn the owner it is a maintenance finish, not a permanent barrier — good for open shelves, questionable for a busy sink run.',
      sourceIds: ['osmo-polyx']
    },
    {
      id: 'stain-lacquer',
      name: 'Stain + lacquer (stain-grade schedule)',
      group: 'finish',
      summary: 'Dye/stain, sealer and a clear topcoat (usually pre-cat lacquer or conversion varnish) for stain-grade hardwood.',
      pros: ['Rich, deep look on oak/maple/cherry', 'Traditional kitchen aesthetic', 'Sealer controls blotching', 'Topcoat gives durability'],
      cons: ['More steps and skill', 'Blotching on maple; test panels essential', 'Spray equipment needed for the best result'],
      bestFor: ['Stain-grade hardwood kitchens', 'Traditional and transitional styles', 'Doors and face frames in maple/oak'],
      tooling: ['Spray gun', 'Stain applicators', 'Sealer/sanding supplies', 'Test panels'],
      shopNotes: 'Make a full finish sample on the actual species and sheen before starting; maple blotches and cherry darkens. Seal before glaze/stain where the schedule requires it, and keep the topcoat compatible with the stain.',
      sourceIds: ['mohawk-precat-lacquer', 'gf-conversion-varnish', 'gf-topcoat-guide']
    }
  ];

  /* ------------------------------------------------------------------ *
   * Materials. Thickness and sheet sizes are millimetres. Solid stock is
   * represented as a nominal board (152.4 x 2438.4 mm) and is sold by board foot.
   * ------------------------------------------------------------------ */
  T.materials = [
    {
      id: 'ply-birch-18',
      name: '3/4" Baltic birch plywood (18 mm)',
      shortName: 'Baltic birch 18',
      category: 'sheet',
      thickness: 18,
      sheet: { width: 1220, height: 2440 },
      grain: true,
      edgeband: 'pvc-0.5',
      uses: ['Carcass sides, top/bottom, stretchers', 'Shelves', 'Drawer boxes', 'Exposed-end cabinets when banded'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly', 'stain-lacquer', 'hardwax-oil'],
      cost: 4,
      notes: 'Void-free multi-ply core, strong and stable; commonly 1220 x 2440 (4x8) and also 1525 x 1525 (5x5). Actual thickness tolerance +/-0.4 mm at 18-24 mm. Face veneer is thin: sand carefully.'
    },
    {
      id: 'ply-birch-12',
      name: '1/2" Baltic birch plywood (12 mm)',
      shortName: 'Baltic birch 12',
      category: 'sheet',
      thickness: 12,
      sheet: { width: 1220, height: 2440 },
      grain: true,
      edgeband: 'pvc-0.5',
      uses: ['Drawer boxes', 'Dividers', 'Back stiffeners', 'Jigs'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly', 'hardwax-oil'],
      cost: 3,
      notes: 'Standard drawer-box material for undermount slides when 1/2" sides are wanted; check actual thickness against the slide runner range (1/2"-3/4").'
    },
    {
      id: 'ply-birch-6',
      name: '1/4" Baltic birch plywood (6 mm)',
      shortName: 'Baltic birch 6',
      category: 'sheet',
      thickness: 6,
      sheet: { width: 1220, height: 2440 },
      grain: true,
      edgeband: 'none',
      uses: ['Backs', 'Door panels (veneered)', 'Drawer bottoms', 'Jigs/templates'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly', 'hardwax-oil'],
      cost: 2,
      notes: 'Actual thickness about 5.9-6.4 mm. Use a captured/rabbeted back or a hanging rail; a bare 1/4" back does not carry a wall cabinet on its own.'
    },
    {
      id: 'ply-veneer-18',
      name: '3/4" veneer-core cabinet plywood (18.3 mm actual)',
      shortName: 'Veneer-core ply 18',
      category: 'sheet',
      thickness: 18.3,
      sheet: { width: 1220, height: 2440 },
      grain: true,
      edgeband: 'wood-tape',
      uses: ['Paint/stain-grade carcass', 'Shelves', 'Exposed-end panels', 'Face-frame boxes'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly', 'stain-lacquer', 'hardwax-oil'],
      cost: 3,
      notes: 'Nominal 3/4" is 23/32 CAT = 0.703" (17.85 mm) in Georgia-Pacific class panels; actual varies by core and mill. Thickness tolerance +0/-1.6 mm on sheet dimensions. Treat actual thickness as the geometry value, not 19.05 mm.'
    },
    {
      id: 'ply-prefinished-18',
      name: '3/4" prefinished maple/birch plywood (18 mm)',
      shortName: 'Prefinished ply 18',
      category: 'sheet',
      thickness: 18,
      sheet: { width: 1220, height: 2440 },
      grain: true,
      edgeband: 'pvc-0.5',
      uses: ['Carcass sides, bottoms, stretchers', 'Shelves', 'Drawer boxes where interiors are visible'],
      finishCompatibility: ['none (factory finished)'],
      cost: 4,
      notes: 'Saves an entire interior finishing pass and avoids spraying inside assembled boxes. Used by the PWW/NESAW cabinet method. Check that the factory finish is compatible with edge banding adhesive.'
    },
    {
      id: 'mdf-18',
      name: '3/4" MDF (18 mm)',
      shortName: 'MDF 18',
      category: 'sheet',
      thickness: 18,
      sheet: { width: 1220, height: 2440 },
      grain: false,
      edgeband: 'none',
      uses: ['Painted doors and drawer fronts', 'Raised panels', 'Face frames', 'Applied mouldings'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly'],
      cost: 2,
      notes: 'Dimensionally stable, machines cleanly, excellent painted substrate. Edges must be sealed/primed or they fuzz and swell. Do not use for structural carcass parts in a wet area.'
    },
    {
      id: 'mdf-12',
      name: '1/2" MDF (12 mm)',
      shortName: 'MDF 12',
      category: 'sheet',
      thickness: 12,
      sheet: { width: 1220, height: 2440 },
      grain: false,
      edgeband: 'none',
      uses: ['Door panels', 'Applied mouldings', 'Templates'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly'],
      cost: 2,
      notes: 'Good stable panel for painted recessed/raised panels; seal both faces and edges.'
    },
    {
      id: 'mdf-6',
      name: '1/4" MDF (6 mm)',
      shortName: 'MDF 6',
      category: 'sheet',
      thickness: 6,
      sheet: { width: 1220, height: 2440 },
      grain: false,
      edgeband: 'none',
      uses: ['Door panels (paint grade)', 'Backs for painted cabinets', 'Templates'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly'],
      cost: 2,
      notes: 'Paint-grade panel only; seal edges. Not structural.'
    },
    {
      id: 'melamine-18',
      name: '3/4" melamine-faced particleboard (18 mm)',
      shortName: 'Melamine 18',
      category: 'panel',
      thickness: 18,
      sheet: { width: 1220, height: 2440 },
      grain: false,
      edgeband: 'pvc-0.5',
      uses: ['Budget carcasses', 'Shop cabinets', 'Closet interiors', 'Cabinets where interiors are not seen'],
      finishCompatibility: ['none (factory finished)'],
      cost: 1,
      notes: 'Dimensionally stable and cheap. Confirmats and system holes work; drywall screws and face screwing do not. Edges must be banded or sealed; exposed cut edges are not acceptable in a kitchen.'
    },
    {
      id: 'particleboard-18',
      name: '3/4" particleboard (18 mm)',
      shortName: 'Particleboard 18',
      category: 'panel',
      thickness: 18,
      sheet: { width: 1220, height: 2440 },
      grain: false,
      edgeband: 'none',
      uses: ['Substrate for laminate/melamine-faced panels', 'Shop fixtures'],
      finishCompatibility: ['none (must be faced)'],
      cost: 1,
      notes: 'Confirmat/assembly-screw material. Low screw-holding in the face; never use butt-screws or pocket screws in the face. Not exposed in a kitchen.'
    },
    {
      id: 'hardwood-poplar',
      name: 'Poplar, 4/4 milled to 3/4"',
      shortName: 'Poplar',
      category: 'solid',
      thickness: 19,
      sheet: { width: 152.4, height: 2438.4 },
      grain: true,
      edgeband: 'none',
      uses: ['Painted face frames', 'Painted door frames', 'Applied mouldings', 'Solid lipping'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly'],
      cost: 2,
      notes: 'Sold by board foot (nominal 4/4 board, milled 3/4"). Paint-grade; straight-grained stock is important for flat doors. Board stock: the cut list should report board footage separately from sheet goods.'
    },
    {
      id: 'hardwood-maple',
      name: 'Hard maple, 4/4 milled to 3/4"',
      shortName: 'Maple',
      category: 'solid',
      thickness: 19,
      sheet: { width: 152.4, height: 2438.4 },
      grain: true,
      edgeband: 'none',
      uses: ['Stain-grade door frames', 'Face frames', 'Drawer fronts', 'Solid lipping'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly', 'stain-lacquer', 'hardwax-oil'],
      cost: 4,
      notes: 'Hard, close-grained, takes a fine finish but blotches with stain — seal/test first. Sold by board foot; milled to 3/4".'
    },
    {
      id: 'hardwood-oak',
      name: 'Red/white oak, 4/4 milled to 3/4"',
      shortName: 'Oak',
      category: 'solid',
      thickness: 19,
      sheet: { width: 152.4, height: 2438.4 },
      grain: true,
      edgeband: 'none',
      uses: ['Stain-grade traditional doors and frames', 'Face frames', 'Drawer fronts'],
      finishCompatibility: ['paint', 'lacquer', 'water-poly', 'stain-lacquer', 'hardwax-oil'],
      cost: 3,
      notes: 'Open grain, strong, traditional. Weighs more than poplar; hinge-count/weight check matters on tall doors. Sold by board foot.'
    }
  ];

  /* ------------------------------------------------------------------ *
   * Hardware templates. Quantities and placement are computed by the engine;
   * these templates carry the realistic install rules.
   * ------------------------------------------------------------------ */
  T.hardware = [
    {
      id: 'hinge-euro-110',
      name: 'Euro concealed cup hinge, 110 deg, full overlay (Blum CLIP top / Hettich Sensys class)',
      category: 'hinge',
      unit: 'ea',
      notes: '35 mm cup, minimum 13 mm deep; cup centre 22.5 mm from the hinge edge at a 5 mm boring distance; two cup screws; mounting plate on the 32 mm line.',
      installRules: [
        '2 hinges for doors up to 900 mm high and under 9 kg; 3 up to 1600 mm and 14 kg; 4 up to 2000 mm and 27 kg; 5 up to 2400 mm and 27 kg',
        'Distance between top and bottom hinges must be greater than the door width',
        'Maximum leaf width 610 mm',
        'Overlay = fixed distance + boring distance - plate height; verify against the selected plate',
        'Cup hole 35 mm diameter x 13 mm minimum depth'
      ]
    },
    {
      id: 'hinge-euro-inset',
      name: 'Euro concealed hinge, inset application (half-cranked + inset plate)',
      category: 'hinge',
      unit: 'ea',
      notes: 'For inset doors: half-cranked hinge plus matching plate (e.g., Blum inset plate 175H5030.21 class). Check the minimum reveal for the door thickness and boring distance before drilling.',
      installRules: [
        'Door size = opening - 2 x reveal',
        'Reveal must be at least the hinge minimum reveal for the door thickness/boring distance',
        'Use a half-cranked hinge; a full-overlay hinge cannot be used for inset',
        'Hinge count follows the same height/weight table as overlay hinges'
      ]
    },
    {
      id: 'hinge-plate-cross',
      name: 'Cross/wing mounting plate (32 mm system)',
      category: 'hinge',
      unit: 'ea',
      notes: 'Plate height determines overlay: overlay = fixed distance + boring distance - plate height. Mounts on the 32 mm line with Euro screws or #6/#8 screws.',
      installRules: [
        'Match plate height to the required overlay',
        'Use the same plate system as the hinge brand/family',
        'Mounting screws must not clash with shelf-pin holes'
      ]
    },
    {
      id: 'hinge-butt',
      name: 'Butt hinge (traditional, mortised)',
      category: 'hinge',
      unit: 'ea',
      notes: 'Visible hinge mortised into the door edge and frame; typical 2-3 hinges per door, sized to the door thickness and weight.',
      installRules: [
        'Mortise depth = leaf thickness',
        'Reveal/knuckle clearance must allow the door to swing',
        'Use 3 hinges on doors over 1600 mm or heavy doors'
      ]
    },
    {
      id: 'slide-undermount-softclose',
      name: 'Undermount soft-close full-extension slide (Blum TANDEM 563H class)',
      category: 'slide',
      unit: 'set',
      notes: 'Concealed; inside drawer width = opening - 42 mm; 12.7 mm bottom recess; box depth = nominal slide length; lengths 9"-30" (229-762 mm) in 3" steps.',
      installRules: [
        'Inside drawer width = opening width - 42 mm',
        'Outside box width = inside width + 2 x side thickness (opening - 16.6 mm for 12.7 mm sides)',
        'Drawer bottom recess 12.7 mm; rear notch per locking device',
        'Box height must leave at least 20.6 mm (13/16") clearance in the opening',
        '21" slide for a standard 24" base cabinet; 24" slide will not fit a 24" cabinet',
        'Install slides before fronts; adjust the face with the locking devices'
      ]
    },
    {
      id: 'slide-side-mount',
      name: 'Side-mount ball-bearing full-extension slide (Accuride 3832 class)',
      category: 'slide',
      unit: 'pair',
      notes: '1/2" side space each side; 100 lb class; lever disconnect; cabinet and drawer members adjustable.',
      installRules: [
        'Box outside width = opening - 25.4 mm (1/2" per side)',
        'Cabinet member must be level and square to the face',
        'Box depth may vary; the slide length must fit the cabinet depth',
        'Allow for the slide profile height (about 46 mm) above the drawer bottom'
      ]
    },
    {
      id: 'slide-center-mount',
      name: 'Center-mount single-track slide (Knape & Vogt 1175 class)',
      category: 'slide',
      unit: 'ea',
      notes: 'Single nylon roller under the drawer centre; 3/4 extension typically; cheapest option.',
      installRules: [
        'Side clearance 1/8" (3.2 mm) each side',
        'Drawer must be 1-1/4" (31.75 mm) shorter than the cabinet depth',
        'Slide height 1"; drawer bottom rides on the slide',
        'Not suitable for heavy or wide drawers'
      ]
    },
    {
      id: 'pull-bar-128',
      name: 'Bar pull, 128 mm (5") centres',
      category: 'pull',
      unit: 'ea',
      notes: 'Standard drawer/door pull. 128 mm centres suits drawers up to about 400 mm; use two pulls or a longer bar on wider drawers.',
      installRules: [
        'Drawer: centred horizontally; vertically centred on standard drawers, higher on deep drawers',
        'Door: side opposite the hinges, 50-75 mm (2-3") in from the corner; low on wall doors, high on base doors',
        'Shaker doors: centre on the stile, aligned with the inner edge of the rail',
        'Two pulls once the drawer exceeds about 610-762 mm wide'
      ]
    },
    {
      id: 'pull-knob-32',
      name: 'Knob, 32 mm (1-1/4")',
      category: 'pull',
      unit: 'ea',
      notes: 'Single-screw knob; check projection against adjacent doors/drawers (3 mm reveal).',
      installRules: [
        'Same placement rules as pulls',
        'Knob projection must clear the neighbouring front when both are open/closed'
      ]
    },
    {
      id: 'shelf-pin-5',
      name: 'Shelf pin, 5 mm, with shoulder',
      category: 'shelf',
      unit: 'ea',
      notes: '5 mm pin in a 5 mm hole on the 32 mm line; 4 per adjustable shelf.',
      installRules: [
        '32 mm hole pitch, front row 37 mm from the front edge',
        '4 pins per shelf (2 front, 2 rear)',
        'Use shouldered pins so the shelf bears on the shoulder, not the hole'
      ]
    },
    {
      id: 'confirmat-50',
      name: 'Confirmat assembly screw, 7 x 50 mm',
      category: 'fastener',
      unit: 'ea',
      notes: '5 mm pilot in the edge member, 7 mm clearance through the face member; 3 per joint (4 on tall sides).',
      installRules: [
        'Keep at least 50 mm from the end of a panel (AWI edge distance cited in shop practice: 36 mm minimum)',
        'No glue needed; glue optional at finished edges',
        'Use a step drill or boring machine for alignment'
      ]
    },
    {
      id: 'pocket-screw-32',
      name: 'Pocket screw, 32 mm fine thread',
      category: 'fastener',
      unit: 'ea',
      notes: 'For face frames, stretchers and platforms; 2-3 per joint.',
      installRules: [
        'Pockets on hidden faces only',
        'Keep pockets at least 50 mm from exposed ends',
        'Use fine thread in hardwood, coarse in softwood/ply'
      ]
    },
    {
      id: 'wood-dowel-8',
      name: 'Wood dowel, 8 mm x 30-40 mm',
      category: 'fastener',
      unit: 'ea',
      notes: 'For carcass and frame joints; 2-3 per joint with glue and clamps.',
      installRules: [
        'Line-bore or use a dowel jig from the same reference face',
        'Glue both the hole and the dowel',
        'Dry-fit the assembly before glue-up'
      ]
    },
    {
      id: 'leveler-foot',
      name: 'Adjustable leveler foot / leg',
      category: 'leveler',
      unit: 'ea',
      notes: 'Under the toe-kick platform or cabinet corners; 4 per cabinet, +2 per extra 600 mm of width.',
      installRules: [
        'Set the high point of the floor and shim/level the rest to it',
        'Leave front access for adjustment before the toe-kick board goes on',
        'Use clip-on or screwed toe-kick board, never construction adhesive'
      ]
    },
    {
      id: 'hanging-rail',
      name: 'Hanging rail / French cleat / suspension rail',
      category: 'mounting',
      unit: 'm',
      notes: 'Wall-fixed steel or hardwood rail with cabinet cleats/brackets; the structural alternative to screwing through a thin back.',
      installRules: [
        'Required for wall/tall cabinets with a back thinner than 12 mm',
        'Rail fixed to studs; cabinet brackets adjustable for level',
        'Design for KCMA wall-cabinet load: 600 lb up to 36" wide, 800 lb 36-60", 20 lb/in over 60"'
      ]
    },
    {
      id: 'door-bumper',
      name: 'Self-adhesive door bumper',
      category: 'accessory',
      unit: 'ea',
      notes: '1-2 per door on the closing edge; stops rattle and protects the finish.',
      installRules: [
        'Place where the door meets the frame/adjacent door, not on the hinge side',
        'Use clear or matching-colour bumpers'
      ]
    },
    {
      id: 'magnet-catch',
      name: 'Magnetic catch and strike',
      category: 'accessory',
      unit: 'set',
      notes: 'For doors without self-closing hinges; one set per door.',
      installRules: [
        'Align catch and strike with the door closed',
        'Do not use where a soft-close hinge already provides hold'
      ]
    },
    {
      id: 'toe-kick-clip',
      name: 'Toe-kick clip / clip-on base board fastener',
      category: 'accessory',
      unit: 'ea',
      notes: 'Clips the finished toe-kick board to the leveller legs or cabinet base; removable for service.',
      installRules: [
        'One clip every 300-400 mm',
        'Fit the kick board after leveling and fixing the cabinets',
        'Scribe the bottom edge to the floor'
      ]
    }
  ];

  /* ------------------------------------------------------------------ *
   * Standards. Millimetres; imperial mirrors and notes are provided in
   * standards.imperial and standards.notes. Source ids per section in
   * standards.sourceIds. Required shape from CONTRACT.md section 5 is preserved.
   * ------------------------------------------------------------------ */
  T.standards = {
    dims: {
      base: {
        height: 876.3,
        toeKick: 101.6,
        depth: 609.6,
        counterHeight: 914.4,
        minWidth: 152.4,
        maxWidth: 1219.2
      },
      wall: {
        height: 762,
        depth: 304.8,
        aboveCounter: 457.2,
        minWidth: 152.4,
        maxWidth: 1219.2
      },
      tall: {
        height: 2133.6,
        depth: 609.6,
        minWidth: 304.8,
        maxWidth: 1219.2
      },
      standardWidths: [228.6, 304.8, 381, 457.2, 533.4, 609.6, 685.8, 762, 838.2, 914.4, 1066.8, 1219.2]
    },
    reveal: 3.0,
    door: {
      thickness: 19,
      panelThickness: 6.35,
      stileWidth: 57.15,
      railWidth: 57.15,
      panelFloat: 2.0,
      maxLeafWidth: 609.6,
      hingeCup: {
        diameter: 35,
        depth: 13,
        edgeDistance: 22.5,
        screwSpacing: 45
      }
    },
    shelf: {
      thickness: 18,
      pinDiameter: 5,
      pinSpacing: 32,
      frontSetback: 37,
      maxSpanByThickness: { 18: 900, 19: 900, 25: 1200 }
    },
    drawer: {
      boxSideThickness: 12.7,
      boxBottomThickness: 6.35,
      // Nominal undermount lengths in 3" (76.2 mm) increments; see drawerFamilies for others.
      slideLengths: [229, 305, 381, 457, 533, 610, 686, 762],
      undermountClearance: 42,
      sideMountClearance: 25.4,
      centerMountClearance: 6.35,
      // Clearance needed behind the drawer box/slide when choosing a length.
      rearClearance: { undermount: 40, 'side-mount': 25, 'center-mount': 31.75 }
    },
    sheetGoods: { sheet: { width: 1220, height: 2440 }, trim: 10, kerf: 3 },
    edgebandThickness: { 'pvc-0.5': 0.5, 'pvc-2': 2, 'wood-tape': 0.5 },

    /* --- Extra evidence-backed values (safe for the engine to ignore) --- */
    toeKick: {
      height: 101.6,
      setback: 76.2,
      kcmaMinHeight: 76.2,
      kcmaMinDepth: 50.8,
      kickBoardThickness: 6,
      toeKickDrawerUsableHeight: 76.2
    },
    hinge: {
      cupDiameter: 35,
      cupMinDepth: 13,
      cupCentreByBoringDistance: { 3: 20.5, 4: 21.5, 5: 22.5, 6: 23.5, 7: 24.5, 8: 25.5 },
      defaultBoringDistance: 5,
      defaultCupCentre: 22.5,
      screwSpacing: 45,
      fixedDistancePanel: 11,
      countByHeight: [
        { maxHeight: 900, hinges: 2, maxWeightKg: 9 },
        { maxHeight: 1600, hinges: 3, maxWeightKg: 14 },
        { maxHeight: 2000, hinges: 4, maxWeightKg: 27 },
        { maxHeight: 2400, hinges: 5, maxWeightKg: 27 }
      ],
      maxLeafWidth: 609.6,
      minRevealByThickness: {
        '16': { 3: 0.6, 4: 0.6, 5: 0.6, 6: 0.6 },
        '18': { 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.0 },
        '19': { 3: 1.3, 4: 1.3, 5: 1.2, 6: 1.2 },
        '20': { 3: 1.7, 4: 1.6, 5: 1.5, 6: 1.4 },
        '22': { 3: 2.5, 4: 2.4, 5: 2.2, 6: 2.0 }
      }
    },
    drawerFamilies: {
      undermount: {
        widthRule: 'insideWidth = opening - 42',
        insideWidthClearance: 42,
        outsideWidthFormula: 'opening - 42 + 2 * sideThickness',
        bottomRecess: 12.7,
        boxDepthEqualsSlideNominal: true,
        rearClearance: 40,
        minVerticalClearance: 20.6,
        lockDeviceMinInsideWidth: 124,
        bottomGrooveHeight: 12.7,
        lengthsMm: [229, 305, 381, 457, 533, 610, 686, 762]
      },
      sideMount: {
        widthRule: 'outsideWidth = opening - 25.4',
        sideClearancePerSide: 12.7,
        outsideWidthClearance: 25.4,
        profileHeight: 46,
        lengthsMm: [254, 305, 356, 406, 457, 508, 559, 610, 660, 711],
        rearClearance: 25
      },
      centerMount: {
        widthRule: 'outsideWidth = opening - 6.35',
        sideClearancePerSide: 3.2,
        outsideWidthClearance: 6.35,
        depthRule: 'boxDepth = cabinetDepth - 31.75',
        rearClearance: 31.75,
        slideHeight: 25.4
      }
    },
    shelfSpan: {
      loadBasisKcma: '15 lb/ft2 (718 Pa) for 7 days',
      kcmaMaxDeflectionPerFoot: 1.6,
      kcmaMaxTotalDeflection: 6.4,
      sagulatorTargetPerMetre: 1.7,
      recommendedByMaterial: {
        'ply-birch-18': 900,
        'ply-veneer-18': 900,
        'mdf-18': 850,
        'ply-birch-12': 600,
        'mdf-12': 550
      },
      blockWithoutSupport: 1050
    },
    faceFrame: {
      stileWidth: 57.15,
      railWidth: 57.15,
      overlayTypicalInches: { half: 0.375, full: 0.75 },
      maxBiscuitSpacingFromEdge: 50.8,
      maxBiscuitSpacing: 152.4
    },
    doorFrame: {
      railLengthFormula: 'doorWidth - 2 * stileWidth + 2 * tenonLength',
      tenonLength: 11,
      panelWidthAllowance: 6,
      panelLengthAllowance: 102,
      glueAreaRatioStubToFullTenon: 0.25
    },
    wallAttachment: {
      backThicknessStructuralMin: 12,
      nailerHeight: 76.2,
      kcmaWallLoad: { upTo36in: 272, upTo60in: 363, perInchOver60in: 9 },
      railFastenerSpacing: 100
    },
    finishing: {
      conversionVarnishPotLifeHours: 6,
      conversionVarnishCatalystRatio: '10:1',
      waterPolyCureDays: 21,
      lacquerCureDays: 30,
      kcmaFinishAgeDays: 10,
      coatsMinimum: { paint: 3, waterPoly: 3, lacquer: 2, conversionVarnish: 2, hardwaxOil: 2 }
    },
    edgeband: {
      pvcThin: 0.5,
      pvcThick: 2,
      woodTape: 0.5,
      hotAirMaxPractical: 1.0
    },
    cutList: {
      trim: 10,
      kerf: 3,
      typicalYieldPct: 75,
      warnYieldBelowPct: 60
    },

    /* Imperial display mirrors (inches). */
    imperial: {
      dims: {
        base: { height: 34.5, toeKick: 4, depth: 24, counterHeight: 36, minWidth: 6, maxWidth: 48 },
        wall: { height: 30, depth: 12, aboveCounter: 18, minWidth: 6, maxWidth: 48 },
        tall: { height: 84, depth: 24, minWidth: 12, maxWidth: 48 },
        standardWidths: [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48]
      },
      reveal: 0.1181,
      door: { thickness: 0.75, panelThickness: 0.25, stileWidth: 2.25, railWidth: 2.25, panelFloat: 0.0787, maxLeafWidth: 24, hingeCup: { diameter: 1.378, depth: 0.512, edgeDistance: 0.886, screwSpacing: 1.772 } },
      shelf: { thickness: 0.7087, pinDiameter: 0.1969, pinSpacing: 1.2598, frontSetback: 1.4567 },
      drawer: { boxSideThickness: 0.5, boxBottomThickness: 0.25, lengths: [9.84, 11.81, 13.78, 15.75, 17.72, 19.69, 21.65, 23.62], undermountClearance: 1.6535, sideMountClearance: 1, centerMountClearance: 1.9685 },
      toeKick: { height: 4, setback: 3, kcmaMinHeight: 3, kcmaMinDepth: 2 },
      drawerFamilies: { undermount: { insideWidthClearance: 1.6535, bottomRecess: 0.5, rearClearance: 1.5748 }, sideMount: { sideClearancePerSide: 0.5, outsideWidthClearance: 1 }, centerMount: { sideClearancePerSide: 0.125, outsideWidthClearance: 0.25, depthClearance: 1.25 } },
      hinge: { cupDiameter: 1.378, cupMinDepth: 0.512, cupCentreAt5mmBore: 0.886 }
    },

    /* Human-readable notes per section, with source ids. */
    notes: {
      dims: 'Base 876.3 mm box height + counter = 914.4 mm counter height; 609.6 mm depth excludes overlay fronts. Wall cabinets bottom 457.2 mm above counter (54 in AFF). KCMA defines typical 24 in base depth, 36 in counter height, 12 in wall depth, 84 in+ tall units; stock sizes come in 3 in width increments. Toe-kick shop standard is 4 in high x 3 in deep; KCMA minimum is 3 in high x 2 in deep.',
      reveal: '3 mm is the shop default; 2 mm is achievable with 107-170 degree hinges and a profiled/rounded door edge; 1/16 in (1.6 mm) reveals are not recommended for frameless doors without testing.',
      door: '19 mm door stock with 6.35 mm panels is the shop default; CMT cope-and-stick sets are designed for 19 mm stock and 11 mm tenons; solid panels need at least 2-3 mm float per side. Hinge cup 35 mm dia at least 13 mm deep; cup centre 22.5 mm at 5 mm boring distance (range 20.5-25.5 mm for 3-8 mm boring distance); 45 mm screw spacing per Blum/Richelieu drawing - verify against the chosen hinge.',
      shelf: '32 mm system: 5 mm holes, 32 mm pitch, front line 37 mm from the front edge, rear line 37 mm from the rear edge. KCMA shelf deflection limit is 1.6 mm per 305 mm (max 6.4 mm) at 15 lb/ft2; Sagulator target is 0.02 in per foot (1.7 mm/m) allowing for ~50 percent long-term creep. Max spans by thickness are conservative design limits, not a published table.',
      drawer: 'Undermount inside width = opening - 42 mm; side-mount outside width = opening - 25.4 mm; center-mount width = opening - 6.35 mm and box depth = cabinet depth - 31.75 mm. Undermount bottom recess 12.7 mm; minimum vertical clearance 20.6 mm. Standard undermount lengths are 9-30 in in 3 in increments; a 24 in cabinet takes a 21 in slide. Contract-supplied slideLengths of 250-600 mm in 50 mm steps are a UI simplification - prefer drawerFamilies lengths for accuracy.',
      sheetGoods: '1220 x 2440 mm (4x8) is the default; Baltic birch is also sold 1525 x 1525 mm (5x5). Trim 10 mm and 3 mm kerf are sensible shop allowances; nominal 3/4 in plywood is 17.85-18.3 mm actual, not 19.05 mm.',
      edgeband: '0.5 mm PVC is the standard interior edge; 2 mm PVC for high-wear/exposed edges (hot-air banders practical limit about 1 mm); wood tape for stain-grade. Edge banding is required by KCMA finishing requirements on exterior exposed edges.',
      toeKick: '4 in high x 3 in deep is the shop standard; kick face installed last and scribed to the floor; toe-kick drawers need about 3 in of usable height.',
      hinge: 'Hinge count by height (900/1600/2000/2400 mm) and weight (9/14/27/27 kg), max leaf 610 mm, hinge spacing greater than door width. Minimum reveal depends on door thickness and boring distance (table from Blum/HardwareSource).',
      wallAttachment: 'Wall cabinets with backs thinner than 12 mm need a rail/nailer. KCMA wall-cabinet static-load requirement: 272 kg up to 36 in wide, 363 kg for 36-60 in, 9 kg per inch above 60 in.',
      finishing: 'Conversion varnish: 10:1 catalyst, 6 h pot life, 2-3 coats, sand 320 between. Water-based poly: 3 coats, 21-day cure. Pre-cat lacquer: 30-45 min to sand/recoat, 30-day full cure. KCMA ages finishes 10 days before testing.',
      cutList: 'Trim 10 mm, kerf 3 mm; a realistic first-pass yield for cabinet parts is about 75 percent; warn below 60 percent.'
    },
    sourceIds: {
      dims: ['kcma-a1611-2022', 'bobvila-standard-sizes', 'lilyann-toe-kicks'],
      reveal: ['woodweb-reveals', 'blum-clip-top-guide-2015', 'hardwaresource-inset-reveal', 'fhb-overlay-forum'],
      door: ['cmt-rail-stile', 'blum-clip-top-guide-2015', 'richelieu-blum-hinges-2009', 'fww-three-ways-doors'],
      shelf: ['hettich-furniture-tech', 'woodweb-32mm-holes', 'kcma-a1611-2022', 'sagulator'],
      drawer: ['pww-tandem-sizing', 'lostart-kitchen-think', 'richelieu-blum-tandem-2017', 'accuride-3832e', 'kv-1175'],
      sheetGoods: ['gp-plytanium', 'apa-tt-054', 'baltic-birch-spec', 'cpa-sandp'],
      edgeband: ['fastcap-fastedge', 'woodweb-hotair-edgebander', 'kcma-a1611-2022'],
      toeKick: ['kcma-a1611-2022', 'lilyann-toe-kicks', 'pww-kitchen-cabinet-essentials'],
      hinge: ['blum-clip-top-guide-2015', 'arcat-salice-hinges', 'hardwaresource-inset-reveal'],
      wallAttachment: ['kcma-a1611-2022', 'woodweb-back-construction', 'pww-kitchen-cabinet-essentials'],
      finishing: ['gf-conversion-varnish', 'gf-topcoat-guide', 'mohawk-precat-lacquer', 'osha-1910-107', 'kcma-a1611-2022'],
      cutList: ['fww-illustrated-cutlist', 'awi-0100-draft', 'asme-y14-5'],
      materials: ['baltic-birch-spec', 'gp-plytanium', 'cpa-sandp', 'apa-tt-054'],
      hardware: ['blum-clip-top-guide-2015', 'richelieu-blum-tandem-2017', 'accuride-3832e', 'kv-1175', 'lilyann-hardware-placement'],
      construction: ['kcma-a1611-2022', 'pww-kitchen-cabinet-essentials', 'woodweb-frameless-fasteners', 'woodweb-base-depths']
    }
  };

  /* ------------------------------------------------------------------ *
   * Validation rules. Severity: 'error' blocks export, 'warning' warns,
   * 'info' is advisory. Params/resolver fields are hints for the engine.
   * ------------------------------------------------------------------ */
  T.validation = [
    {
      id: 'V1-undermount-box-width',
      severity: 'error',
      group: 'drawer',
      title: 'Undermount drawer box width does not match the slide rule',
      message: 'Blum TANDEM-class undermount slides require the INSIDE drawer width to equal opening width - 42 mm. The outside box width is inside width + 2 x side thickness (about opening - 16.6 mm for 12.7 mm sides).',
      params: { slide: 'undermount', insideWidthClearance: 42 },
      fix: 'Recompute the drawer box width as opening - 42 + 2 * boxSideThickness.',
      sourceIds: ['pww-tandem-sizing', 'lostart-kitchen-think']
    },
    {
      id: 'V2-slide-depth',
      severity: 'error',
      group: 'drawer',
      title: 'Drawer slide/box is too long for the cabinet',
      message: 'The chosen slide nominal length plus rear clearance must fit the interior depth. A 24 in base cabinet takes a 21 in undermount slide; a nominal 24 in slide will not fit. Center-mount drawers must be 1-1/4 in shorter than cabinet depth.',
      params: { undermountRearClearance: 40, sideMountRearClearance: 25, centerMountDepthClearance: 31.75 },
      fix: 'Choose a shorter standard slide length or reduce the box depth.',
      sourceIds: ['pww-tandem-sizing', 'kv-1175', 'lostart-kitchen-think']
    },
    {
      id: 'V3-drawer-vertical-fit',
      severity: 'error',
      group: 'drawer',
      title: 'Drawer opening is too short for the drawer box',
      message: 'Undermount drawers need at least 20.6 mm (13/16 in) of vertical clearance above the box; side-mount slides need about 46 mm of profile height. Box height = opening height - clearance.',
      params: { undermountMinClearance: 20.6, sideMountProfile: 46 },
      fix: 'Reduce the box height or increase the opening/front height.',
      sourceIds: ['pww-tandem-sizing', 'lostart-kitchen-think', 'accuride-3832e']
    },
    {
      id: 'V4-hinge-count',
      severity: 'error',
      group: 'door',
      title: 'Not enough hinges for the door',
      message: 'Hinge count must follow door height and weight: 2 hinges up to 900 mm / 9 kg, 3 up to 1600 mm / 14 kg, 4 up to 2000 mm / 27 kg, 5 up to 2400 mm / 27 kg. Minimum 2 hinges per door.',
      params: { countByHeight: [{ maxHeight: 900, hinges: 2, maxWeightKg: 9 }, { maxHeight: 1600, hinges: 3, maxWeightKg: 14 }, { maxHeight: 2000, hinges: 4, maxWeightKg: 27 }, { maxHeight: 2400, hinges: 5, maxWeightKg: 27 }] },
      fix: 'Add hinges or split the door.',
      sourceIds: ['arcat-salice-hinges', 'blum-clip-top-guide-2015']
    },
    {
      id: 'V5-hinge-geometry',
      severity: 'error',
      group: 'door',
      title: 'Door leaf too wide, or hinge spacing too close',
      message: 'A single door leaf should not exceed 610 mm for a 35 mm cup hinge, and the distance between the top and bottom hinges must be greater than the door width.',
      params: { maxLeafWidth: 609.6 },
      fix: 'Split the door, reduce the width, or add a hinge if the spacing rule is violated.',
      sourceIds: ['arcat-salice-hinges', 'blum-clip-top-guide-2015']
    },
    {
      id: 'V6-inset-min-reveal',
      severity: 'error',
      group: 'door',
      title: 'Inset door reveal is below the hinge minimum',
      message: 'The reveal must be at least the minimum reveal for the door thickness and boring distance (0.6 mm at 16 mm/3 mm through 2.5 mm at 22 mm/3 mm).',
      params: { minRevealByThickness: { '16': { 3: 0.6 }, '18': { 3: 1.0 }, '19': { 3: 1.3, 5: 1.2 }, '20': { 3: 1.7 }, '22': { 3: 2.5 } } },
      fix: 'Increase the reveal, reduce the boring distance, or choose a thinner door.',
      sourceIds: ['hardwaresource-inset-reveal', 'blum-clip-top-guide-2015']
    },
    {
      id: 'V7-paired-door-gap',
      severity: 'warning',
      group: 'door',
      title: 'Paired door gap / leaf rounding',
      message: 'Two leaves sharing an opening must be computed from one formula (one outside reveal each side plus one centre gap) and rounded only at the end, or the centre gap will be wrong.',
      params: { formula: 'leafWidth = (opening - 2 * outsideReveal - centreGap) / 2' },
      fix: 'Recompute both leaves with the same reveal and round once.',
      sourceIds: ['woodweb-reveals']
    },
    {
      id: 'V8-panel-float',
      severity: 'error',
      group: 'door',
      title: 'Solid panel has insufficient expansion allowance',
      message: 'A solid-wood raised/recessed panel needs at least 2 mm (recommended 3 mm) float per side. CMT recommends a panel 6 mm narrower than the rail length and 102 mm shorter than the door.',
      params: { minPanelFloatPerSide: 2, recommendedPerSide: 3, cmtPanelWidthAllowance: 6, cmtPanelLengthAllowance: 102 },
      fix: 'Cut the panel smaller, or use a dimensionally stable panel (plywood/MDF).',
      sourceIds: ['cmt-rail-stile']
    },
    {
      id: 'V9-shelf-span',
      severity: 'warning',
      group: 'shelf',
      title: 'Shelf span may exceed the material limit',
      message: 'KCMA limits loaded shelf deflection to 1.6 mm per 305 mm (max 6.4 mm) at 15 lb/ft2; the Sagulator target is 0.02 in per foot allowing for creep. Recommended limits: 18 mm plywood 900 mm, 18 mm MDF 850 mm, 12 mm 600 mm; add a divider/support over 1050 mm.',
      params: { recommendedByMaterial: { 'ply-birch-18': 900, 'mdf-18': 850, 'ply-birch-12': 600 }, blockWithoutSupport: 1050 },
      fix: 'Add a mid support/divider, use a thicker shelf, or reduce the span.',
      sourceIds: ['kcma-a1611-2022', 'sagulator']
    },
    {
      id: 'V10-wall-back-support',
      severity: 'error',
      group: 'back',
      title: 'Wall/tall cabinet has a thin back and no hanging rail',
      message: 'KCMA wall cabinets must carry 272-363 kg static load. A 6 mm applied back without a rail/nailer is not an adequate load path.',
      params: { backThicknessStructuralMin: 12 },
      fix: 'Add a hanging rail/nailer or use a thicker/deeper-dadoed back.',
      sourceIds: ['kcma-a1611-2022', 'woodweb-back-construction']
    },
    {
      id: 'V11-range-clearance',
      severity: 'error',
      group: 'layout',
      title: 'Wall cabinet too close to the cooking surface',
      message: 'NKBA: at least 24 in above a protected non-combustible surface and 30 in above an unprotected/combustible surface.',
      params: { minNonCombustible: 609.6, minCombustible: 762 },
      fix: 'Raise the cabinet or provide a non-combustible surface/hood.',
      sourceIds: ['nkba-guidelines-2010']
    },
    {
      id: 'V12-counter-clearance',
      severity: 'warning',
      group: 'layout',
      title: 'Wall cabinet bottom is not the standard height above the counter',
      message: 'The standard is 18 in (457.2 mm) above the counter, 54 in above the floor. Over-range cabinets have a different rule.',
      params: { aboveCounter: 457.2 },
      fix: 'Confirm the intended mounting height or adjust.',
      sourceIds: ['bobvila-standard-sizes']
    },
    {
      id: 'V13-width-limits',
      severity: 'warning',
      group: 'cabinet',
      title: 'Cabinet width outside practical limits',
      message: 'Below about 228.6 mm (9 in) a hinged cabinet has little usable interior. Above 1219.2 mm (48 in) a single section needs a divider; wall cabinets over 914.4 mm (36 in) should have a centre stile or divider.',
      params: { minHingedWidth: 228.6, maxSection: 1219.2, wallMaxWithoutDivider: 914.4 },
      fix: 'Change width, split the cabinet, or add a divider.',
      sourceIds: ['bobvila-standard-sizes', 'kcma-a1611-2022']
    },
    {
      id: 'V14-drawer-front-heights',
      severity: 'warning',
      group: 'drawer',
      title: 'Drawer front heights do not fit the front region',
      message: 'Fronts plus reveals must equal the front region. Minimum sensible front height 90 mm; maximum about 300 mm for a single pull.',
      params: { minFrontHeight: 90, maxFrontHeight: 300 },
      fix: 'Re-distribute the drawer stack heights.',
      sourceIds: ['pww-tandem-sizing']
    },
    {
      id: 'V15-toe-kick',
      severity: 'warning',
      group: 'toeKick',
      title: 'Toe kick below minimum or conflicting with a toe-kick drawer',
      message: 'KCMA minimum toe space is 3 in high x 2 in deep; the shop standard is 4 in x 3 in. A toe-kick drawer needs about 3 in of clear height.',
      params: { kcmaMinHeight: 76.2, kcmaMinDepth: 50.8, shopHeight: 101.6, shopSetback: 76.2 },
      fix: 'Increase the toe kick or remove the toe-kick drawer.',
      sourceIds: ['kcma-a1611-2022', 'lilyann-toe-kicks']
    },
    {
      id: 'V16-machining-clash',
      severity: 'error',
      group: 'machining',
      title: 'Hinge plate / slide screw holes clash with shelf-pin holes or joinery',
      message: 'All those holes are on the same 32 mm line. A slide screw or hinge plate screw landing in a shelf-pin hole, confirmat or dado will split or weaken the part.',
      params: {},
      fix: 'Shift the hardware to the next 32 mm increment or adjust the shelf-pin pattern.',
      sourceIds: ['hettich-furniture-tech', 'woodweb-32mm-holes']
    },
    {
      id: 'V17-exposed-edge-treatment',
      severity: 'warning',
      group: 'finish',
      title: 'Exposed edge has no edge banding or finish',
      message: 'KCMA requires exterior exposed edges to be finished, edge-banded or otherwise treated; raw MDF/PB edges swell at the first spill.',
      params: {},
      fix: 'Add edgebanding or a solid lipping/finish note to the part.',
      sourceIds: ['kcma-a1611-2022', 'fastcap-fastedge']
    },
    {
      id: 'V18-finish-compatibility',
      severity: 'warning',
      group: 'finish',
      title: 'Finish is not compatible with the selected material',
      message: 'Stain-lacquer on MDF/melamine is not a grain finish; melamine needs a bonding primer or should be left factory-finished; hardwax oil is a maintenance finish, not a barrier finish for a wet sink run.',
      params: {},
      fix: 'Switch material or finish, or add a bonding-primer step.',
      sourceIds: ['cpa-sandp', 'gf-topcoat-guide', 'osmo-polyx']
    },
    {
      id: 'V19-sheet-fit',
      severity: 'error',
      group: 'cutList',
      title: 'Part does not fit the available sheet (with trim and grain)',
      message: 'Part length/width must be <= sheet usable size minus trim. Grain-locked parts must fit the available width in the grain direction; a 5x5 Baltic birch sheet changes the nesting.',
      params: { trim: 10, kerf: 3 },
      fix: 'Split the part, choose a different sheet size, or rotate non-grain parts.',
      sourceIds: ['baltic-birch-spec', 'gp-plytanium', 'fww-illustrated-cutlist']
    },
    {
      id: 'V20-door-thickness',
      severity: 'error',
      group: 'door',
      title: 'Door thickness outside the hinge range',
      message: 'Standard 35 mm cup hinges are designed for door thicknesses of about 16-26 mm (Blum CLIP top up to 26 mm; Salice spec up to 35 mm for some models). Very thin or very thick doors need a different hinge.',
      params: { minThickness: 16, maxThickness: 26 },
      fix: 'Change the door thickness or the hinge model.',
      sourceIds: ['blum-clip-top-guide-2015', 'arcat-salice-hinges']
    },
    {
      id: 'V21-pull-placement',
      severity: 'warning',
      group: 'hardware',
      title: 'Pull count/size does not suit the drawer width',
      message: 'A single pull should be about one-third of the drawer width; use two pulls or a longer bar once the drawer exceeds about 610-762 mm. Doors: pull opposite the hinges, 2-3 in from the corner.',
      params: { twoPullWidth: 610, maxRatio: 0.33 },
      fix: 'Add a second pull or use a longer pull.',
      sourceIds: ['lilyann-hardware-placement', 'bobvila-standard-sizes']
    },
    {
      id: 'V22-construction-traps',
      severity: 'warning',
      group: 'construction',
      title: 'Construction option is a trap for this cabinet type',
      message: 'Back style none on a wall cabinet, flush-base under a working counter, butt-screw drawer joinery in a kitchen, or biscuits as the sole carcass joint are all selections the tool should challenge.',
      params: {},
      fix: 'Switch to a structural back/rail, add a toe kick, or change the joinery.',
      sourceIds: ['kcma-a1611-2022', 'woodweb-frameless-fasteners', 'woodweb-back-construction']
    }
  ];

  return T;
}));

