// Risultati, in ordine casa/trasferta. Aggiungere score: [2, 1] solo dopo
// l’omologazione. Cartellini facoltativi: red: [0, 0], yellow: [1, 2].
// Nei gironi i cartellini sono necessari soltanto per risolvere una parità.
// Dopo uno spareggio, inserire in shootoutOrder i soli ID coinvolti,
// nell’ordine ufficiale. Esempio: A: ["alfieri", "galfer"].
// Nelle finali in parità aggiungere penalties: [5, 4].
const tournament = {
  shootoutOrder: { A: [], B: [] },
  teams: {
    valsalice: { name: "Valsalice", initials: "VAL", group: "A" },
    galfer: { name: "Galfer FC", initials: "GAL", group: "A" },
    alfieri: { name: "Alfieri FC", initials: "ALF", group: "A" },
    vittoria: { name: "AC Vittoria", initials: "VIT", group: "B" },
    santanna: { name: "Sant’Anna FC", initials: "SAN", group: "B" },
    cattaneo: { name: "Cattaneo FC", initials: "CAT", group: "B" },
  },
  matches: [
    { id: "a1", date: "2026-11-22", time: "20:00", group: "A", teams: ["alfieri", "galfer"] },
    { id: "b1", date: "2026-11-22", time: "21:00", group: "B", teams: ["santanna", "vittoria"] },
    { id: "a2", date: "2026-11-29", time: "20:00", group: "A", teams: ["galfer", "valsalice"] },
    { id: "b2", date: "2026-11-29", time: "21:00", group: "B", teams: ["cattaneo", "vittoria"] },
    { id: "a3", date: "2026-12-13", time: "21:00", group: "A", teams: ["alfieri", "valsalice"] },
    { id: "b3", date: "2026-12-20", time: "21:00", group: "B", teams: ["cattaneo", "santanna"] },
    { id: "f3", date: "2027-01-10", time: "20:00", place: 2, teams: [null, null] },
    { id: "f1", date: "2027-01-10", time: "21:00", place: 1, teams: [null, null] },
  ],
};
