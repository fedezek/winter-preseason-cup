(() => {
  const page = document.querySelector("[data-competition-stats]");
  const roster = document.querySelector("[data-team-stats]");
  if (!page && !roster) return;

  const { teams, matches } = tournament;
  const fixtures = new Map(matches.map((match) => [match.id, match]));
  const byName = new Intl.Collator("it");
  const date = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
  const metrics = [
    ["played", "PG", "Partite giocate"], ["wins", "V", "Vittorie"], ["draws", "N", "Pareggi"],
    ["losses", "P", "Sconfitte"], ["goals", "GF", "Gol fatti"], ["against", "GS", "Gol subiti"],
    ["difference", "DR", "Differenza reti"],
  ];
  const views = {
    goals: { label: "Marcatori", columns: [["Gol", "Gol"], ["Rig.", "Gol su rigore"]], score: (p) => [p.goals], values: (p) => [p.goals, p.penalties] },
    assists: { label: "Assist", columns: [["Assist", "Assist"]], score: (p) => [p.assists], values: (p) => [p.assists] },
    cards: { label: "Disciplina", columns: [["Gialli", "Ammonizioni"], ["Rossi", "Espulsioni"]], score: (p) => [p.red, p.yellow], values: (p) => [p.yellow, p.red] },
  };

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function teamLink(id, label, player) {
    const link = node("a", label, "stats-link");
    const url = new URL("rose.html", location.href);
    url.searchParams.set("squadra", id);
    if (player) url.searchParams.set("giocatore", player);
    url.hash = "statistiche";
    link.href = url.href;
    return link;
  }

  function signed(value) {
    if (value > 0) return "+" + value;
    return value < 0 ? "−" + Math.abs(value) : "0";
  }

  function teamTotals(entry) {
    const totals = { ...entry, wins: 0, draws: 0, losses: 0, difference: entry.goals - entry.against };
    for (const match of entry.form) {
      if (match.goals > match.against) totals.wins++;
      else if (match.goals === match.against) totals.draws++;
      else totals.losses++;
    }
    return totals;
  }

  function makeTable(title, headers, rows) {
    const scroller = node("div", undefined, "stats-scroll");
    const table = node("table", undefined, "stats-table");
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", title);
    const caption = node("caption", title, "stats-sr");
    const head = table.createTHead().insertRow();
    for (const [text, label] of headers) {
      const th = node("th", text);
      th.scope = "col";
      if (label && label !== text) {
        th.title = label;
        th.setAttribute("aria-label", label);
      }
      head.append(th);
    }
    const body = table.createTBody();
    for (const row of rows) {
      const tr = body.insertRow();
      if (row.selected) tr.className = "stats-selected";
      for (const [index, value] of row.cells.entries()) {
        const cell = node(index === row.labelColumn ? "th" : "td");
        if (index === row.labelColumn) cell.scope = "row";
        cell.append(value);
        tr.append(cell);
      }
    }
    table.prepend(caption);
    scroller.append(table);
    return scroller;
  }

  function panel(title) {
    const section = node("section", undefined, "stats-panel");
    section.append(node("h2", title));
    return section;
  }

  function showEmpty(message) {
    return node("p", message, "stats-empty");
  }

  function leadNumbers(items) {
    const list = node("dl", undefined, "stats-kpis");
    for (const [label, number] of items) {
      const tile = node("div");
      tile.append(node("dt", label), node("dd", number));
      list.append(tile);
    }
    return list;
  }

  function crest(id) {
    const team = teams[id];
    if (team.crest === false) return node("span", team.initials, "stats-crest stats-monogram");
    const image = node("img", undefined, "stats-crest");
    image.src = "assets/" + id + ".webp";
    image.alt = "";
    image.width = image.height = 28;
    return image;
  }

  function teamsPanel(data) {
    const section = panel("Rendimento squadre");
    section.classList.add("stats-team-table");
    const rows = Object.keys(teams).filter((id) => data.stats.teams[id])
      .sort((a, b) => byName.compare(teams[a].group, teams[b].group) || byName.compare(teams[a].name, teams[b].name))
      .map((id) => {
        const { name, group } = teams[id];
        const totals = teamTotals(data.stats.teams[id]);
        const link = teamLink(id, name);
        link.classList.add("stats-team-link");
        link.prepend(crest(id));
        const label = node("span", undefined, "stats-team-label");
        label.append(link, node("small", "Girone " + group));
        const values = metrics.map(([key]) => key === "difference" ? signed(totals[key]) : totals[key]);
        return { labelColumn: 0, cells: [label, ...values.map(String)] };
      });
    section.append(makeTable("Rendimento di tutte le squadre", [["Squadra"], ...metrics.map(([, label, title]) => [label, title])], rows));
    section.append(node("p", "I conteggi includono le partite omologate. Per vittorie, pareggi e sconfitte vale il punteggio prima dei rigori di spareggio.", "stats-note"));
    return section;
  }

  function compareScores(a, b) {
    for (const [i, value] of a.entries()) {
      if (value !== b[i]) return b[i] - value;
    }
    return 0;
  }

  function playersPanel(players, teamId, selectedPlayer) {
    const section = panel(teamId ? "Statistiche individuali" : "Statistiche dei giocatori");
    const controls = node("div", undefined, "stats-switch");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Tipo di statistica");
    const content = node("div");
    const buttons = new Map();
    section.append(controls, content);

    function show(key) {
      const view = views[key];
      for (const [id, button] of buttons) button.setAttribute("aria-pressed", String(id === key));
      const list = players.filter((p) => view.score(p).some((v) => v > 0))
        .sort((a, b) => compareScores(view.score(a), view.score(b)) || byName.compare(a.name, b.name));
      if (!list.length) {
        const message = { goals: "Nessun gol registrato.", assists: "Nessun assist registrato.", cards: "Nessun cartellino registrato." };
        content.replaceChildren(showEmpty(message[key]));
        return;
      }
      const ranked = key !== "cards";
      let position = 0;
      const rows = list.map((player, index) => {
        if (!index || compareScores(view.score(player), view.score(list[index - 1]))) position = index + 1;
        const label = node("span", undefined, "stats-player-label");
        label.append(teamId ? node("span", player.name) : teamLink(player.team, player.name, player.id));
        if (!teamId) label.append(node("small", teams[player.team]?.name ?? player.team));
        return {
          selected: player.id === selectedPlayer, labelColumn: ranked ? 1 : 0,
          cells: [...(ranked ? [String(position)] : []), label, ...view.values(player).map(String)],
        };
      });
      content.replaceChildren(makeTable(view.label, [...(ranked ? [["#", "Posizione"]] : []), ["Giocatore"], ...view.columns], rows));
    }

    for (const [key, view] of Object.entries(views)) {
      const button = node("button", view.label);
      button.type = "button";
      button.addEventListener("click", () => show(key));
      buttons.set(key, button);
      controls.append(button);
    }
    const selected = players.find((p) => p.id === selectedPlayer);
    show(selected && !selected.goals && selected.assists ? "assists"
      : selected && !selected.goals && (selected.yellow || selected.red) ? "cards" : "goals");
    return section;
  }

  function resultsPanel(form) {
    const section = panel("Risultati della squadra");
    if (!form.length) {
      section.append(showEmpty("Nessuna partita omologata per questa squadra."));
      return section;
    }
    const rows = form.map((match) => {
      const fixture = fixtures.get(match.id);
      const day = fixture ? date.format(new Date(fixture.date + "T12:00:00Z")) : "—";
      const outcome = match.goals > match.against ? ["V", "Vittoria"] : match.goals === match.against ? ["N", "Pareggio"] : ["P", "Sconfitta"];
      const chip = node("span", outcome[0], "stats-outcome stats-outcome-" + outcome[0].toLowerCase());
      chip.title = outcome[1];
      chip.setAttribute("aria-label", outcome[1]);
      return { labelColumn: 1, cells: [day, teams[match.opponent]?.name ?? match.opponent, match.goals + "–" + match.against, chip] };
    });
    section.append(makeTable("Risultati della squadra", [["Data"], ["Avversaria"], ["Ris.", "Risultato"], ["Esito"]], rows));
    return section;
  }

  function renderPage(data) {
    if (!data) {
      page.replaceChildren(showEmpty("Statistiche momentaneamente indisponibili."));
      return;
    }
    const reports = Object.values(data.reports);
    const totals = leadNumbers([
      ["Partite omologate", reports.length],
      ["Gol segnati", reports.reduce((n, report) => n + report.score[0] + report.score[1], 0)],
      ["Assist registrati", data.stats.players.reduce((n, player) => n + player.assists, 0)],
    ]);
    const note = showEmpty("Le statistiche individuali si aggiorneranno con i primi referti omologati.");
    const overview = node("div", undefined, "stats-overview");
    overview.append(teamsPanel(data), playersPanel(data.stats.players));
    page.replaceChildren(totals, ...(!reports.length ? [note] : []), overview);
  }

  function renderRoster(data) {
    const url = new URL(location.href);
    const id = url.searchParams.get("squadra") || url.hash.slice(1);
    const valid = Object.hasOwn(teams, id);
    const jump = document.querySelector("[data-stats-jump]");
    roster.hidden = !valid;
    if (jump) jump.hidden = !valid;
    if (!valid) return;
    const content = roster.querySelector("[data-team-stats-content]");
    if (!data?.stats.teams[id]) {
      content.replaceChildren(showEmpty("Statistiche di squadra momentaneamente indisponibili."));
      return;
    }
    const totals = teamTotals(data.stats.teams[id]);
    const players = data.stats.players.filter((p) => p.team === id);
    const selected = players.find((p) => p.id === url.searchParams.get("giocatore"));
    const numbers = metrics.filter(([key]) => key !== "difference")
      .map(([key, , label]) => [label, totals[key]]);
    const selectedLine = selected ? [showEmpty(selected.name + " · " + selected.goals + " gol · "
      + selected.assists + " assist · " + selected.yellow + " gialli · " + selected.red + " rossi")] : [];
    const grid = node("div", undefined, "stats-grid");
    grid.append(resultsPanel(totals.form), playersPanel(players, id, selected?.id));
    content.replaceChildren(leadNumbers(numbers), ...selectedLine, grid);
    if (url.hash === "#statistiche") roster.scrollIntoView({ block: "start" });
  }

  window.cupPublic.response.then((data) => {
    if (page) renderPage(data);
    if (roster) {
      renderRoster(data);
      window.addEventListener("hashchange", () => {
        const url = new URL(location.href);
        if (url.searchParams.has("squadra") && url.hash === "#statistiche") return;
        renderRoster(data);
      });
    }
  });
})();
