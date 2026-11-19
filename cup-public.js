(() => {
  const meta = document.querySelector('meta[name="cup-api"]');
  const endpoint = new URL("/api/cup/pubblico", meta?.content || window.location.origin);
  const response = fetch(endpoint, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(8000) })
    .then((result) => {
      if (!result.ok) throw new Error("Risultati indisponibili");
      return result.json();
    }).catch(() => null);

  const events = {
    goal: ["Gol", "goal"],
    penalty: ["Gol su rigore", "goal"],
    own_goal: ["Autogol", "goal"],
    yellow: ["Ammonizione", "yellow"],
    red: ["Espulsione", "red"],
    second_yellow: ["Seconda ammonizione", "red"],
  };

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function rosterLink(team, name, player) {
    const link = node("a", name);
    const url = new URL("rose.html", location.href);
    url.searchParams.set("squadra", team);
    if (player) url.searchParams.set("giocatore", player);
    url.hash = player ? "statistiche" : team;
    link.href = url.href;
    return link;
  }

  function teamCrest(id, team) {
    const tile = node("span", undefined, "match-sheet-crest");
    if (team?.crest === false) {
      tile.textContent = team.initials;
      tile.setAttribute("aria-hidden", "true");
    } else {
      const image = node("img");
      image.src = "assets/" + id + ".webp";
      image.alt = "";
      image.width = image.height = 36;
      tile.append(image);
    }
    return tile;
  }

  function scoreTeam(id, team) {
    const link = rosterLink(id, team?.name ?? id);
    link.className = "match-sheet-team";
    link.prepend(teamCrest(id, team));
    return link;
  }

  function scoreboard(report, teams) {
    const board = node("div", undefined, "match-sheet-board");
    const scores = node("div", undefined, "match-sheet-scores");
    scores.append(node("p", "Risultato finale", "match-sheet-score-label"),
      node("strong", report.score.join("–"), "match-sheet-score"));
    if (report.halfTime) scores.append(node("p", "Primo tempo " + report.halfTime.join("–"), "match-sheet-parziale"));
    if (report.penalties) scores.append(node("p", "Rigori " + report.penalties.join("–"), "match-sheet-parziale"));
    const [home, away] = report.teams;
    board.append(scoreTeam(home, teams[home]), scores, scoreTeam(away, teams[away]));
    return board;
  }

  function eventRow(event, teams, opponents) {
    const row = node("li", undefined, "match-sheet-event");
    const minute = event.minute + (event.stoppage ? "+" + event.stoppage : "") + "′";
    const [label, colour] = events[event.kind] ?? ["Evento", ""];
    const person = rosterLink(event.team, event.playerName, event.player);
    person.className = "match-sheet-player";
    const description = node("div", undefined, "match-sheet-event-description");
    description.append(person);
    if (event.kind === "own_goal") {
      const opponent = opponents.find((id) => id !== event.team);
      description.append(node("span", "A favore di " + (teams[opponent]?.name ?? opponent), "match-sheet-assist"));
    }
    if (event.assistName) {
      const assist = node("div", "Assist ", "match-sheet-assist");
      assist.append(rosterLink(event.team, event.assistName, event.assist));
      description.append(assist);
    }
    row.append(node("span", minute, "match-sheet-minute"), description,
      node("span", label, "match-sheet-kind " + (colour ? "match-sheet-kind-" + colour : "")));
    return row;
  }

  function teamEvents(id, teams, opponents, events) {
    const lane = node("div", undefined, "match-sheet-lane");
    const title = node("h5", teams[id]?.name ?? id, "match-sheet-lane-title");
    title.prepend(teamCrest(id, teams[id]));
    lane.append(title);

    if (!events.length) {
      lane.classList.add("match-sheet-lane-empty");
      lane.append(node("p", "Nessun evento.", "match-sheet-lane-note"));
      return lane;
    }

    const list = node("ol", undefined, "match-sheet-events");
    list.setAttribute("role", "list");
    list.append(...events.map((event) => eventRow(event, teams, opponents)));
    lane.append(list);
    return lane;
  }

  function details(report) {
    const teams = tournament.teams;
    const panel = node("details", undefined, "cup-match-details");
    const summary = node("summary", undefined, "match-sheet-toggle");
    const icon = node("span", undefined, "match-sheet-chevron");
    icon.setAttribute("aria-hidden", "true");
    summary.append(node("span", "Tabellino"), icon);
    summary.setAttribute("aria-label", "Tabellino " + report.teams.map((id) => teams[id]?.name ?? id).join(" – "));
    const content = node("div", undefined, "match-sheet-content");
    content.append(scoreboard(report, teams));
    const byTime = [...report.events].sort((a, b) => a.fraction - b.fraction
      || a.minute - b.minute || a.stoppage - b.stoppage);
    if (!byTime.length) content.append(node("p", "Nessun evento registrato.", "match-sheet-empty"));
    for (const [fraction, label] of [[1, "Primo tempo"], [2, "Secondo tempo"]]) {
      const period = byTime.filter((event) => event.fraction === fraction);
      if (!period.length) continue;
      const group = node("section", undefined, "match-sheet-period");
      const lanes = node("div", undefined, "match-sheet-lanes");
      for (const id of report.teams) {
        const forTeam = period.filter((event) => event.team === id);
        lanes.append(teamEvents(id, teams, report.teams, forTeam));
      }
      group.append(node("h4", label), lanes);
      content.append(group);
    }
    panel.append(summary, content);
    return panel;
  }

  window.cupPublic = { response, details };
})();
