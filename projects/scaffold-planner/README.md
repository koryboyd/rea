# Scaffold Planner

A web app for planning system scaffolds. It works on a phone or a PC and
produces the plan, elevations, a 3D model, the parts list, a quote and an
indicative leg-load check.

## Using it

1. **Job**: name, client, site.
2. **Scaffold**: tap the system, width and lift, then what you are
   scaffolding (one wall, L shape, three sides or all round). Set length,
   depth and work height with the − / + buttons. The sides, bays and a plan
   preview update as you go.
3. Odd walls or different heights: tap **Edit each side** to set every side
   yourself.
4. **Plan**, **3D**, **Parts**, **Quote** show the results. **PDF** at the top
   exports the plan, elevations, parts list and quote in one file.

Bracing, ties, duty class and bay size sit under **More settings** with
defaults that suit most jobs.

## Systems

- **Scafom Ringscaff** (default): 0.73 / 1.09 / 1.40 m widths and 0.73–3.07 m
  bays (LA 07 dimension). Part numbers, weights and list prices come from the
  Scafom-rux RINGSCAFF price list 06/2019. U-ledgers carry the decks, tubular
  ledgers fill the other lifts and end guardrails, and ladder bays use the
  2.57 / 3.07 m hatch deck with integrated ladder.
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
| Planks            | Boards per width × each boarded deck. Ladder bays swap two boards for a hatch deck                                                                                                                   |
| Braces            | Outer-face brace in every lift of the first bay, every Nth bay and the last bay                                                                                                                      |
| Ties              | Every N standards at each tie height                                                                                                                                                                 |
| Quote             | Hire (qty × $/week × weeks) + erect and dismantle $/m² of face + cartage both ways + margin + GST                                                                                                    |
| Loads             | Worst standard per run: self weight it carries + duty load (225 / 450 / 675 kg per bay) on the loaded decks. Compared against the manufacturer's allowable leg load and the ground bearing you enter |

Not modelled yet: corner bays (each run is counted on its own), hop-ups, stair
towers, sheeting, wind and tie forces.

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

| File             | Owns                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `src/catalog.js` | Systems, widths, lift heights, component lengths, weights, rates        |
| `src/engine.js`  | Bay solver, column builder, parts tally, member geometry, run placement |
| `src/loads.js`   | Leg load, base pressure and freestanding checks                         |
| `src/quote.js`   | Hire, labour, cartage, margin, GST                                      |
| `src/drawing.js` | Plan and elevation SVG                                                  |
| `src/view3d.js`  | 3D view (three.js)                                                      |
| `src/export.js`  | PDF and CSV export                                                      |
| `src/store.js`   | Saved jobs and rates                                                    |
| `src/job.js`     | Job defaults and shape presets                                          |
| `src/editor.js`  | Job and scaffold input screen                                           |
| `src/views.js`   | Plan, parts, quote, loads, rates and saved-job screens                  |
| `src/ui.js`      | Shared controls (buttons, steppers, formatting)                         |
| `src/app.js`     | State, saving and input handling                                        |
