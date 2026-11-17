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

  window.cupPublic = { response, details };
})();
