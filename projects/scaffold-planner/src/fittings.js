// Tube and fittings common to every system. Part numbers, weights and hire
// rates are placeholders until replaced with your own figures on Rates.
const tube = (length, weight, hire) => ({
  code: `TUBE-${length.toFixed(1)}`,
  name: `Scaffold tube ${length.toFixed(1)} m`,
  kind: "tube",
  length,
  weight,
  hire,
});

export const FITTINGS = [
  tube(1.5, 6.5, 0.2),
  tube(2.0, 8.7, 0.25),
  tube(3.0, 13.0, 0.35),
  {
    code: "CPL-DBL",
    name: "Double (right-angle) coupler",
    kind: "coupler",
    length: 0,
    weight: 1.0,
    hire: 0.1,
  },
  {
    code: "CPL-SWV",
    name: "Swivel coupler",
    kind: "swivel",
    length: 0,
    weight: 1.2,
    hire: 0.1,
  },
];
