# Scaffold Planner

A web app for planning system scaffolds. It works on a phone or a PC and
produces the plan, elevations, a 3D model, the parts list, a quote and an
indicative leg-load check.

## Using it

1. **Job**: name, client, site.
2. **Scaffold**: tap the system, width and lift. Then either pick a shape (one
   wall, L shape, three sides, all round) and set length, depth and height
   with the − / + buttons, or tap **Builder's plan** to map a house plan.
3. **Builder's plan** (picker, or **Upload builder's plan** on the Plan tab):
   choose the architect PDF (or a photo), pick the floor plan
   page, then tap the outside corners of the house. Taps snap to the wall lines
   in the PDF, the scale comes from the title block (or **Set scale** off a
   known dimension), edge lengths show as you go, and steps under 0.5 m are
   smoothed to the outer face. Each wall becomes a side you can edit, and the
   drawing stays under the 2D plan, the PDF plan page and the 3D ground (toggle
   **Show builder's plan**). The drawing is kept with the page's file store.
4. Per side: work height, boarded decks, ladder bays, stair towers and
   hop-ups (Auto, none, 1 or 2 decks) and gap to the wall. Per bay: use the hand edit tools on the Plan tab.
5. **Plan**, **3D**, **Parts**, **Quote**, **Loads** show the results. **PDF**
   exports the plan, elevations, parts list and quote.

## How the scaffold is built

Every component is placed in 3D, and the parts list counts those placements,
so the 3D view and the parts list always match. The 3D view uses a CAD look
modelled on iScaf: white ground, isometric (orthographic) camera, standards
coloured by length, ledgers and transoms coloured by length with the same
colours as the plan bays, navy guardrails, maroon diagonals, grey steel decks, yellow
safety gates, red base jacks, rosettes, wedge heads and spigots, and the house
footprint on the ground. A key under the view lists the colours in use.

- **Outside corners**: the side reaching the corner gets a square corner bay
  (width × width) and the next side starts from it, sharing its standards.
  The next side's gap to the wall takes up the overshoot of the bays.
- **Inside corners**: the first side stops at the second side's inner line;
  the second starts outside the first side's outer face.
- **Angled corners**: both sides stop at the corner and the plan flags it.
- **Hop-ups**: brackets on the inner standards at every working deck with 1 or
  2 decks per bay. On **Auto** (the default) a side whose gap to the wall is
  over 300 mm gets the narrowest hop-up that leaves 300 mm or less, and the
  gap widens to fit the bracket. From a builder's plan, stretches where the
  house steps back behind the scaffold line get hop-ups on those bays only,
  when the bracket clears the wall; otherwise the checks say so.
- **Ladder access**: a ladder tower bay outside the scaffold, like a stair
  tower, never in the working deck. The first ladder climbs the tower's
  outside face from the ground through a self-closing safety gate (E04RS0533,
  on a guardrail post E04RS0501) onto a fully decked first lift. Above that
  each ladder climbs inside the tower, facing the scaffold and leaning in
  towards it so you step straight off onto the landing, and each opening has
  a tube dropper on a swivel coupler across it at guardrail height. Tower
  lifts are decked bar the opening, set in **More settings › Ladder tower
  decks**:
  - **Sideways decks**: tower-width decks laid across on the ledgers, two
    left out at one end. No extra parts.
  - **Intermediate transom**: an intermediate ledger (E04RS0020 / 0039 / 0053) carries shorter decks laid lengthwise, opening at the other end.
  - **Miss two decks**: two decks left out along the scaffold side.
    Ladders and end openings swap ends every lift, so each ladder stands on
    deck and climbs through the opening above, never through steel. Ladders are
    picked to run about 1 m past the landing (Ringscaff 2 / 3 / 4 m ladders).
    Where the tower meets a working deck, the main guardrail has a safety gate;
    at other lifts the tower is railed on the scaffold side.
- **Ties**: F-ties at the tie spacing: a tube along the inner standards
  coupled to the standard, and two tubes back to the wall anchors coupled to
  it, so three tubes and three right-angle couplers per tie. Tubes and
  couplers are placeholder parts until you enter your own.
- **Stair access**: a tower bay outside the scaffold (2.57 m bay on Ringscaff)
  with a platform stair per 2.0 m lift. The stair lane runs along the tower's
  outer face with inner and outer stair handrails on every flight (Scafom
  01040 / 01041); landing decks sit against the main scaffold. Every lift has
  guardrails on the outer face and both ends, and on the main-scaffold side
  wherever that bay has no working deck. At working decks the main guardrail
  is open onto the landing.
- **Bracing**: every corner bay is braced on both outside faces. From a
  corner the side goes skip 2, brace, skip 2, brace (brace every 3rd bay); a
  free end braces its end bay. Every diagonal rises the same way
  (bottom-left to top-right from outside). Change the spacing under More
  settings.
- **Elevations**: each side's outer face with dimension chains: bay lengths
  and overall length below, lift heights and overall height to the top
  guardrail on the left, deck levels on the right, tie levels marked T.
- **Hand edits**: on the Plan tab pick a part (brace, ladder bay, stair,
  hop-up 1 or 2, board every lift, reset) and tap bays to add or remove it, or
  drag the part onto a bay. Corner bays take braces only. Edited bays show a
  dashed outline, and edits are kept per side so they survive shape changes
  (Clear hand edits removes them).
- **Checks**: gaps over 300 mm without hop-ups or inner guardrails, missing
  catalogue sizes, and access bays that need a particular bay length.

## Systems

- **Scafom Ringscaff** (default): 0.73 / 1.09 / 1.40 m widths and 0.73–3.07 m
  bays (LA 07 dimension). Part numbers, weights and list prices come from the
  Scafom-rux RINGSCAFF price list 06/2019. Toe boards are steel (LA 07
  steel toe boards). U-ledgers carry the decks, tubular
  ledgers fill the other lifts and end guardrails. Ladders (E04RS0454–0456)
  are in the assortment but not the 2019 price list, so their hire is a
  placeholder.
- **Cuplok**: 0.8 / 1.3 m widths and 0.8–2.5 m bays (example figures).
- **Kwikstage**: 0.7 / 1.2 m widths and 0.7–2.4 m bays (example figures).

Working decks sit on the 0.5 m ring spacing: a 6.5 m deck gives lifts at
6.5, 4.5 and 2.5 m with base ledgers at 0.5 m. The plan labels every bay with
width × length (e.g. 1.09×2.57) and its deck height, colours each bay size
differently and lists the bay count per size.

Each job uses one system. Bay sizes, standards, transoms, planks, braces and
toe boards come only from that system's catalogue, so the parts list never
mixes Cuplok and Kwikstage components.

## What it calculates

| Output            | How                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bays              | Shortest combination of the system's ledger lengths that covers the wall, preferring fewer bays over a small overshoot                                                                               |
| Lifts             | Work height rounded up to whole lifts. Standards run to the top deck + 1.0 m for guardrails                                                                                                          |
| Standards         | Fewest system standard lengths that make the column height                                                                                                                                           |
| Ledgers, transoms | Base (kicker) lift plus every lift, both faces. Guardrail and mid-rail on each working deck                                                                                                          |
| Planks            | Boards per width × each boarded deck. Ladder bays deck every lift bar the opening                                                                                                                    |
| Braces            | Outer-face brace in every lift of every 2nd bay and both end bays of each side                                                                                                                       |
| Ties              | Every N standards at each tie height                                                                                                                                                                 |
| Quote             | Hire (qty × $/week × weeks) + erect and dismantle $/m² of face + cartage both ways + margin + GST                                                                                                    |
| Loads             | Worst standard per run: self weight it carries + duty load (225 / 450 / 675 kg per bay) on the loaded decks. Compared against the manufacturer's allowable leg load and the ground bearing you enter |

Not modelled yet: sheeting, loading bays, wind and tie forces, and the
inside-corner deck link (the two sides meet at a guardrail).

## Before using it on a real job

1. Open **Rates** and replace the example weights and hire rates with your
   Scafom and supplier catalogue figures. Rates are shared by every job that
   uses that system.
2. In **Loads**, enter the manufacturer's allowable leg load for your lift
   height and the site's ground bearing value.
3. The load check is indicative. A competent person must verify the design to
   AS/NZS 1576 and AS/NZS 4576.

## Run it locally

```bash
cd projects/scaffold-planner
node serve.js          # http://localhost:8080
node --test tests/*.test.js
```

Jobs save in the browser when run locally. In the hosted version they save to
the page's shared store, so everyone with edit access sees the same jobs.

## Layout

| File                | Owns                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| `src/catalog.js`    | Systems, widths, lift heights, component lengths, weights, rates        |
| `src/engine.js`     | Bay solver, column builder, parts tally, member geometry, run placement |
| `src/loads.js`      | Leg load, base pressure and freestanding checks                         |
| `src/quote.js`      | Hire, labour, cartage, margin, GST                                      |
| `src/drawing.js`    | Plan and elevation SVG                                                  |
| `src/view3d.js`     | 3D view (three.js)                                                      |
| `src/export.js`     | PDF and CSV export                                                      |
| `src/store.js`      | Saved jobs and rates                                                    |
| `src/job.js`        | Job defaults and shape presets                                          |
| `src/outline.js`    | Plan outline maths, PDF path parsing, scale and sheet detection         |
| `src/planimport.js` | PDF and photo import, page picker and corner tracing                    |
| `src/ringscaff.js`  | Scafom Ringscaff catalogue                                              |
| `src/editor.js`     | Job and scaffold input screen                                           |
| `src/views.js`      | Plan, parts, quote, loads, rates and saved-job screens                  |
| `src/ui.js`         | Shared controls (buttons, steppers, formatting)                         |
| `src/app.js`        | State, saving and input handling                                        |
