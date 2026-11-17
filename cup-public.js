(() => {
  const meta = document.querySelector('meta[name="cup-api"]');
  const endpoint = new URL("/api/cup/pubblico", meta?.content || window.location.origin);
  const response = fetch(endpoint, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(8000) })
    .then((result) => {
      if (!result.ok) throw new Error("Risultati indisponibili");
      return result.json();
    }).catch(() => null);
  const names = {
    goal: "Gol", penalty: "Gol su rigore", own_goal: "Autogol",
    yellow: "Ammonizione", red: "Espulsione", second_yellow: "Seconda ammonizione",
  };

  function node(tag, text) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function rosterLink(team, name, player) {
    const a = node("a", name);
    const url = new URL("rose.html", location.href);
    url.searchParams.set("squadra", team);
    if (player) url.searchParams.set("giocatore", player);
    url.hash = team;
    a.href = url.href;
    return a;
  }
  function details(report) {
    const panel = node("details");
    panel.className = "cup-match-details";
    panel.append(node("summary", "Dettagli partita"));
    if (report.halfTime) panel.append(node("p", "Primo tempo " + report.halfTime.join("–")));
    if (!report.events.length) {
      panel.append(node("p", "Nessun evento registrato."));
      return panel;
    }
    const list = node("ol");
    for (const event of report.events) {
      const minute = event.minute + (event.stoppage ? "+" + event.stoppage : "");
      const line = node("li", event.fraction + "T " + minute + "′ · " + names[event.kind] + " · ");
      line.append(rosterLink(event.team, event.playerName, event.player));
      if (event.assistName) line.append(" (assist ", rosterLink(event.team, event.assistName, event.assist), ")");
      list.append(line);
    }
    panel.append(list);
    return panel;
  }

  function renderStats(value, teams) {
    const section = document.querySelector("#statistiche");
    if (!section || !Object.keys(value.reports).length) return;
    const grid = section.querySelector(".cup-stats");
    function card(title, rows) {
      const article = node("article");
      article.className = "cup-stat-card";
      const list = node("ul");
      list.replaceChildren(...rows);
      article.append(node("h3", title), rows.length ? list : node("p", "Nessun evento registrato."));
      return article;
    }
    const players = value.stats.players;
    function leaders(metric, text) {
      return players.filter((row) => metric(row) > 0).sort((a, b) => metric(b) - metric(a) || a.name.localeCompare(b.name, "it"))
        .map((row) => {
          const li = node("li");
          li.append(rosterLink(row.team, row.name, row.id), " · ", (teams[row.team]?.name ?? row.team), " · ", text(row));
          return li;
        });
    }
    const teamRows = Object.entries(value.stats.teams).map(([id, row]) => {
      const li = node("li");
      const form = row.form.map(({ goals, against }) => goals > against ? "V" : goals === against ? "N" : "P");
      li.append(rosterLink(id, teams[id].name), " · " + row.played + " PG · " + row.goals + " GF · " + row.against
        + " GS" + (form.length ? " · " + form.join(" ") : ""));
      return li;
    });
    grid.replaceChildren(
      card("Marcatori", leaders((row) => row.goals, (row) => row.goals + (row.penalties ? " (" + row.penalties + " rig.)" : ""))),
      card("Assist", leaders((row) => row.assists, (row) => String(row.assists))),
      card("Disciplina", leaders((row) => row.red * 1000 + row.yellow, (row) => row.yellow + " gialli · " + row.red + " rossi")),
      card("Squadre", teamRows),
    );
    section.hidden = false;
  }

  const playerId = new URL(location.href).searchParams.get("giocatore");
  if (playerId) response.then((value) => {
    const row = value?.stats.players.find((item) => item.id === playerId);
    const anchor = document.querySelector(".roster-hero .wrap") || document.querySelector("#roster-title")?.parentElement;
    if (!row || !anchor) return;
    const div = node("p", row.name + " · " + row.goals + " gol · " + row.assists + " assist · "
      + row.yellow + " gialli · " + row.red + " rossi");
    div.className = "wrap cup-roster-stat";
    anchor.after(div);
  });
  window.cupPublic = { response, details, renderStats };
})();
