(() => {
  const $ = (selector) => document.querySelector(selector);
  const api = "/api/cup/";
  const other = {
    winter: ["Prestige", "https://prestige.winterpreseasoncup.it/organizzatori"],
    prestige: ["Winter", "https://winter-preseason-cup-2026.fedezek.chatgpt.site/organizzatori"],
  };
  const kinds = {
    goal: "Gol", penalty: "Gol su rigore", own_goal: "Autogol",
    yellow: "Ammonizione", red: "Espulsione", second_yellow: "Seconda ammonizione",
  };
  const form = $("#report-form");
  const events = $("#events");
  const fixture = $("#fixture");
  const audit = $("#audit-section");
  const dialog = $("#confirm-dialog");
  const messages = $("#admin-message");
  let state;
  let pending;
  let busy = false;

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function label(text, field) {
    const node = element("label", text);
    node.append(field);
    return node;
  }
  function select(options, value) {
    const node = element("select");
    node.replaceChildren(...options.map(([id, text]) => new Option(text, id)));
    if (value != null) node.value = value;
    return node;
  }
  function input(value, min, max, required = false) {
    const node = element("input");
    node.type = "number";
    node.inputMode = "numeric";
    node.min = min;
    node.max = max;
    node.required = required;
    node.value = value ?? "";
    return node;
  }
  function current() {
    return state.matches.find(({ id }) => id === fixture.value);
  }
  function teamName(id) {
    return state.teams[id]?.name ?? "Da definire";
  }
  function playerName(id) {
    return state.players.find((player) => player.id === id)?.name ?? "";
  }
  function number(node) {
    return node.value === "" ? null : node.valueAsNumber;
  }
  function status(text, error = false) {
    messages.textContent = text;
    messages.dataset.error = String(error);
  }
  async function request(path, change) {
    const response = await fetch(api + path, change ? {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament: state.tournament, ...change }),
    } : { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Servizio temporaneamente indisponibile.");
    return body;
  }

  function addEvent(event = {}) {
    const row = element("fieldset");
    row.className = "cup-event";
    row.append(element("legend", "Evento"));
    const team = select(current().teams.map((id) => [id, teamName(id)]), event.team);
    const player = select([]);
    const assist = select([]);
    const kind = select(Object.entries(kinds), event.kind);
    const fraction = select([["1", "1° tempo"], ["2", "2° tempo"]], event.fraction);
    const minute = input(event.minute, 0, 99, true);
    const stoppage = input(event.stoppage ?? 0, 0, 30, true);
    const notes = element("input");
    notes.maxLength = 300;
    notes.value = event.notes ?? "";
    const verified = element("input");
    verified.type = "checkbox";
    verified.checked = event.verified ?? true;
    const remove = element("button", "Rimuovi evento");
    remove.type = "button";
    remove.className = "cup-button cup-secondary";
    remove.addEventListener("click", () => row.remove());
    memberOptions(event.player, event.assist);
    team.addEventListener("change", () => memberOptions());
    kind.addEventListener("change", toggleAssist);
    toggleAssist();

    function memberOptions(playerId, assistId) {
      const players = state.players.filter((person) => person.team === team.value &&
        (person.active || [playerId, assistId].includes(person.id)));
      const choices = players.map((person) => [person.id,
        person.shirt ? person.shirt + " · " + person.name : person.name]);
      player.replaceChildren(new Option("Seleziona", ""), ...choices.map(([id, name]) => new Option(name, id)));
      assist.replaceChildren(new Option("Nessun assist registrato", ""), ...choices.map(([id, name]) => new Option(name, id)));
      player.value = playerId ?? "";
      assist.value = assistId ?? "";
    }
    function toggleAssist() {
      assist.disabled = kind.value !== "goal";
      if (assist.disabled) assist.value = "";
    }

    player.required = true;
    const grid = element("div");
    grid.className = "cup-grid";
    for (const [text, field] of [
      ["Squadra", team], ["Tipo", kind], ["Giocatore", player], ["Assist", assist],
      ["Frazione", fraction], ["Minuto", minute], ["Recupero (+)", stoppage], ["Nota interna", notes],
    ]) grid.append(label(text, field));
    const check = label("Evento verificato", verified);
    check.className = "cup-check";
    row.append(grid, check, remove);
    row.reportEvent = () => ({
      team: team.value, player: player.value, assist: assist.value || null, kind: kind.value,
      fraction: Number(fraction.value), minute: number(minute), stoppage: number(stoppage),
      notes: notes.value, verified: verified.checked,
    });
    events.append(row);
  }

  function showFixture() {
    const game = current();
    const report = state.reports[game.id];
    const published = state.published.reports[game.id];
    $("#report-fields").disabled = !game.teams.every(Boolean);
    $("#report-status").textContent = !game.teams.every(Boolean) ? "In attesa delle finaliste."
      : report?.status === "draft" ? (published ? "Bozza di correzione · versione precedente online" : "Bozza salvata")
      : report ? "Omologata" : "Da refertare";
    const scores = $("#scores");
    scores.replaceChildren();
    for (const [key, title] of [["score", "Finale"], ["halfTime", "Primo tempo"], ["penalties", "Rigori"]]) {
      if (key === "penalties" && game.group) continue;
      game.teams.forEach((id, side) => {
        const field = input(report?.[key]?.[side], 0, 99, key === "score");
        field.name = key + side;
        scores.append(label(title + " · " + teamName(id), field));
      });
    }
    $("#discipline").checked = Boolean(report?.yellow && report?.red);
    events.replaceChildren();
    for (const event of report?.events ?? []) addEvent(event);
    audit.open = false;
    $("#audit").replaceChildren();
  }

  function data(status) {
    const pair = (key) => {
      const fields = [form.elements[key + 0], form.elements[key + 1]];
      if (!fields[0]) return null;
      const values = fields.map(number);
      return values.every((value) => value === null) ? null : values;
    };
    return {
      matchId: fixture.value, revision: state.reports[fixture.value]?.revision ?? 0, status,
      score: pair("score"), halfTime: pair("halfTime"), penalties: pair("penalties"),
      disciplineComplete: $("#discipline").checked, events: [...events.children].map((row) => row.reportEvent()),
    };
  }

  function preview(change) {
    const game = current();
    $("#preview-score").textContent = game.teams.map(teamName).join(" – ") + " · " + change.score.join("–")
      + (change.halfTime?.every(Number.isInteger) ? " (1T " + change.halfTime.join("–") + ")" : "")
      + (change.penalties?.every(Number.isInteger) ? " · Rigori " + change.penalties.join("–") : "");
    $("#preview-events").replaceChildren(...change.events.map((item) =>
      element("li", item.fraction + "T " + item.minute + (item.stoppage ? "+" + item.stoppage : "")
        + "′ · " + kinds[item.kind] + " · " + playerName(item.player)
        + (item.assist ? " (assist " + playerName(item.assist) + ")" : "")
        + (!item.verified ? " · Da verificare" : ""))));
    $("#preview-discipline").textContent = change.disciplineComplete ? "Disciplina verificata" : "Disciplina da completare";
    pending = change;
    dialog.showModal();
  }

  async function save(change) {
    if (busy) return;
    busy = true;
    $("#report-fields").disabled = true;
    $("#publish").disabled = true;
    try {
      await request("referto", change);
      if (dialog.open) dialog.close();
      await refresh(change.matchId);
      status(change.status === "published" ? "Referto pubblicato." : "Bozza salvata.");
    } catch (error) {
      if (dialog.open) dialog.close();
      status(error.message, true);
    } finally {
      $("#report-fields").disabled = !current().teams.every(Boolean);
      $("#publish").disabled = false;
      busy = false;
    }
  }

  function showShootout() {
    const group = $("#shootout-group").value;
    const ids = Object.keys(state.teams).filter((id) => state.teams[id].group === group);
    $("#shootout-order").replaceChildren(...[0, 1, 2].map((index) =>
      label("Ordine " + (index + 1), select([["", "—"], ...ids.map((id) => [id, teamName(id)])], state.shootouts[group][index]))));
  }

  async function refresh(selected) {
    state = await request("gestione");
    const [title, href] = other[state.tournament];
    const switcher = $("#other-cup");
    switcher.href = href;
    switcher.textContent = title;
    switcher.hidden = false;
    $("#cup-context").textContent = state.tournament === "winter" ? "Winter Preseason Cup" : "Prestige Preseason League";
    fixture.replaceChildren(...state.matches.map((item) => new Option(
      item.date.split("-").reverse().join("/") + " · " + item.time + " · " + item.teams.map(teamName).join(" – "), item.id)));
    if (selected) fixture.value = selected;
    showFixture();
    showShootout();
    form.hidden = audit.hidden = $("#shootout-section").hidden = false;
  }

  fixture.addEventListener("change", showFixture);
  $("#add-event").addEventListener("click", () => addEvent());
  $("#cancel-publish").addEventListener("click", () => dialog.close());
  $("#publish").addEventListener("click", () => save(pending));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter?.id === "save-draft") save(data("draft"));
    else preview(data("published"));
  });
  $("#shootout-group").addEventListener("change", showShootout);
  $("#shootout-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const group = $("#shootout-group").value;
    const order = [...$("#shootout-order").querySelectorAll("select")].map((node) => node.value);
    if (order.some((id, i) => id && i > 0 && !order[i - 1])) return status("Compila le posizioni in ordine.", true);
    try {
      await request("spareggio", { group, order: order.filter(Boolean), revision: state.shootoutRevisions[group] ?? 0 });
      await refresh(fixture.value);
      status("Spareggio registrato.");
    } catch (error) { status(error.message, true); }
  });
  audit.addEventListener("toggle", async () => {
    if (!audit.open) return;
    const selected = fixture.value;
    try {
      const rows = await request("cronologia?partita=" + encodeURIComponent(selected));
      if (fixture.value === selected) $("#audit").replaceChildren(...rows.map((row) =>
        element("li", new Date(row.created_at).toLocaleString("it-IT") + " · " + row.score.join("–")
          + " · " + (row.status === "published" ? "Pubblicato" : "Bozza"))));
    } catch (error) { status(error.message, true); }
  });
  refresh().then(() => status("")).catch((error) => status(error.message, true));
})();
