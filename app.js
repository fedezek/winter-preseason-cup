const { teams, matches } = tournament;
const months = new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "UTC" });
const weekdays = new Intl.DateTimeFormat("it-IT", { weekday: "long", timeZone: "UTC" });
const localNow = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short",
}).format(new Date()).replace(" ", "T");
const groupNames = ["A", "B"];
const stage = (match) => match.group
  ? "Girone " + match.group
  : match.place === 1 ? "Finale 1°–2°" : "Finale 3°–4°";

function formatDate(date, long = false) {
  const day = new Date(date + "T12:00:00Z");
  const label = day.getUTCDate() + " " + months.format(day);
  return long ? weekdays.format(day) + " " + label + " " + day.getUTCFullYear() : label;
}

let tables;
let publishedReports = {};

function chooseTables() {
  tables = Object.fromEntries(groupNames.map((group) => [group, standings(group, tournament)]));
}
chooseTables();

function teamFor(match, side) {
  const id = match.teams[side] ?? publishedReports[match.id]?.teams[side];
  if (id) return { ...teams[id], id };
  const group = groupNames[side];
  const row = tables[group].rows.find((entry) => entry.rank === match.place && entry.confirmed);
  if (row) return { ...teams[row.id], id: row.id };
  const position = match.place === 1 ? "1ª" : "2ª";
  return { name: position + " Girone " + group, initials: position + " " + group };
}

function badge(team) {
  return team.id
    ? '<img class="badge" src="assets/' + team.id + '.webp" alt="" width="62" height="62">'
    : '<span class="badge fallback" aria-hidden="true">' + team.initials + '</span>';
}

function teamMarkup(team, className) {
  return '<span class="' + className + '">' + badge(team) + '<span>' + team.name + '</span></span>';
}

function fixtureStatus(match) {
  if (match.score) return "Terminata";
  if (match.date + "T" + match.time <= localNow) return "In attesa di esito";
  return "In programma";
}

function matchScore(match) {
  const time = '<time datetime="' + match.date + "T" + match.time + '">' + match.time + '</time>';
  if (!match.score) return time;
  const result = '<span class="result">' + match.score.join(" – ") + '</span>';
  const penalties = match.penalties
    ? '<span class="penalties">Rig. ' + match.penalties.join("–") + '</span>' : "";
  return result + penalties;
}

function renderMatch(match) {
  return '<div class="match" data-match="' + match.id + '"><span class="match-stage">' + stage(match) + '</span>'
    + teamMarkup(teamFor(match, 0), "team team-left") + '<span class="score">' + matchScore(match) + '</span>'
    + teamMarkup(teamFor(match, 1), "team") + '<span class="match-status' + (match.score ? " final" : "") + '">'
    + fixtureStatus(match) + '</span></div>';
}

function renderMatches(filter) {
  const visible = matches.filter((match) => filter === "all"
    || (filter === "groups" && match.group)
    || (filter === "finals" && match.place)
    || (filter === "results" && match.score));
  const list = document.querySelector("#match-list");
  if (!visible.length) {
    list.innerHTML = '<p class="empty">I risultati saranno pubblicati al termine delle partite.</p>';
    return;
  }
  const dates = [...new Set(visible.map((match) => match.date))];
  list.innerHTML = dates.map((date) => '<article class="match-day"><h3><time datetime="' + date + '">'
    + formatDate(date, true) + '</time></h3>' + visible.filter((match) => match.date === date)
      .map(renderMatch).join("") + '</article>').join("");
  for (const row of list.querySelectorAll("[data-match]")) {
    const report = publishedReports[row.dataset.match];
    if (report) row.after(window.cupPublic.details(report));
  }
}

function renderTables() {
  const anyScore = matches.some((match) => match.group && match.score);
  document.querySelector("#table-note").textContent = anyScore
    ? "PG = partite giocate · DR = differenza reti" : "Le classifiche si aggiornano con i risultati.";
  document.querySelector("#tables").innerHTML = groupNames.map((group) => {
    const table = tables[group];
    const started = table.rows.some((row) => row.played);
    const rows = table.rows.map((row) => {
      const rank = started && table.rows.filter((entry) => entry.rank === row.rank).length === 1 ? row.rank : "–";
      const diff = row.diff > 0 ? "+" + row.diff : row.diff;
      return '<tr><td>' + rank + '</td><td>'
        + '<a class="roster-link" href="rose.html#' + row.id + '" aria-label="Rosa ' + teams[row.id].name + '">'
        + teamMarkup({ ...teams[row.id], id: row.id }, "team") + '</a>'
        + '</td><td>' + row.played + '</td><td>' + row.wins + '</td><td>' + row.draws + '</td><td>' + row.losses
        + '</td><td>' + row.goals + '</td><td>' + row.against + '</td><td>' + diff + '</td><td><strong>'
        + row.points + '</strong></td></tr>';
    }).join("");
    const note = table.complete && table.tied
      ? '<p class="table-note">Parità in attesa dello spareggio o dei dati disciplinari ufficiali.</p>' : "";
    return '<article class="table-card"><h3 id="group-' + group + '">Girone ' + group + '</h3>'
      + '<table aria-labelledby="group-' + group + '"><thead><tr><th scope="col" aria-label="Posizione">#</th>'
      + '<th scope="col">Squadra</th><th scope="col" aria-label="Partite giocate">PG</th>'
      + '<th scope="col" aria-label="Vittorie">V</th><th scope="col" aria-label="Pareggi">N</th><th scope="col" aria-label="Sconfitte">P</th>'
      + '<th scope="col" aria-label="Gol fatti">GF</th><th scope="col" aria-label="Gol subiti">GS</th>'
      + '<th scope="col" aria-label="Differenza reti">DR</th><th scope="col" aria-label="Punti">Pt</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>' + note + '</article>';
  }).join("");
}

function renderFeature() {
  const next = matches.find((match) => !match.score && match.date + "T" + match.time > localNow);
  const last = matches.filter((match) => match.score).at(-1);
  const pending = matches.filter((match) => !match.score).at(-1);
  const match = next ?? pending ?? last;
  const label = next ? "PROSSIMA PARTITA" : match.score ? "ULTIMO RISULTATO" : "IN ATTESA DI ESITO";
  const center = match.score ? match.score.join(" – ") : "VS";
  document.querySelector("#featured").innerHTML = '<div class="feature-top"><p class="eyebrow">' + label
    + '</p><time datetime="' + match.date + "T" + match.time + '">' + formatDate(match.date) + ' · ' + match.time
    + '</time></div><div class="feature-teams">' + teamMarkup(teamFor(match, 0), "feature-team")
    + '<span class="feature-center">' + center + '</span>' + teamMarkup(teamFor(match, 1), "feature-team")
    + '</div><p class="feature-bottom">' + stage(match) + ' · CIT Turin</p>';
}

document.querySelector("[data-logo]").innerHTML = '<img src="assets/winter.webp" width="42" height="46" alt="">';
const filters = [...document.querySelectorAll("[data-filter]")];
for (const button of filters) {
  button.addEventListener("click", () => {
    filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    renderMatches(button.dataset.filter);
  });
}

document.querySelector("#share").addEventListener("click", async () => {
  const url = window.location.origin + window.location.pathname;
  const status = document.querySelector("#share-status");
  try {
    if (navigator.share) {
      await navigator.share({ title: "Winter Preseason Cup", url });
    } else {
      await navigator.clipboard.writeText(url);
      status.textContent = "Link copiato.";
    }
  } catch (error) {
    if (error.name !== "AbortError") status.textContent = url;
  }
});
renderFeature();
renderMatches("all");
renderTables();


window.cupPublic.response.then((published) => {
  if (published?.tournament !== "winter") return;
  publishedReports = published.reports;
  tournament.shootoutOrder = published.shootouts;
  for (const match of matches) {
    const result = published.results[match.id];
    if (result) Object.assign(match, result);
  }
  chooseTables();
  renderFeature();
  renderMatches(filters.find((item) => item.getAttribute("aria-pressed") === "true")?.dataset.filter ?? "all");
  renderTables();
});
