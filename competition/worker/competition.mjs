const MAX_BODY = 96_000;
const EVENT_KINDS = new Set(["goal", "penalty", "own_goal", "yellow", "red", "second_yellow"]);
const goalKinds = new Set(["goal", "penalty", "own_goal"]);
const epochWhere = `(? IS NULL OR ? = (SELECT count(*) FROM cup_report) + (SELECT count(*) FROM cup_shootout))`;
const asJson = (value) => value == null ? null : JSON.stringify(value);
const parse = (value) => value == null ? null : JSON.parse(value);

class CupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function cupJson(value, status = 200, headers = {}) {
  return Response.json(value, {
    status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

function organizer(request, env) {
  const actor = request.headers.get("oai-authenticated-user-id");
  const signedIn = Boolean(actor);
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const allowed = signedIn && Boolean(email) && (env.ORGANIZER_EMAIL ?? "")
    .split(",").map((entry) => entry.trim().toLowerCase()).includes(email);
  return { signedIn, allowed, actor: allowed ? actor : null };
}

async function readBody(request, limit = MAX_BODY) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new CupError("Formato richiesta non valido.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new CupError("Richiesta vuota.");
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new CupError("Richiesta troppo grande.", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const value = JSON.parse(text + decoder.decode());
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  throw new CupError("Richiesta non valida.");
}

function jsonStmt(db, sql, value) {
  return db.prepare(sql).bind(JSON.stringify(value));
}

function fixtureSeed(db, config) {
  const base = config.base;
  const teams = Object.entries(base.teams).map(([id, team]) => ({
    id, ...team, logo: team.crest === false ? null : "assets/" + id + ".webp", kit: config.kits[id] ?? null,
  }));
  const matches = base.matches;
  return [
    db.prepare("INSERT INTO cup_tournament VALUES (?, ?, ?, 'in_progress', ?) ON CONFLICT(id) DO NOTHING")
      .bind(config.id, config.name, config.season, JSON.stringify({ win: 3, draw: 1, loss: 0 })),
    db.prepare(`INSERT INTO cup_team (id, tournament_id, name, pool, crest, kit)
      SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.name'), json_extract(value,'$.group'),
        json_extract(value,'$.logo'), json_extract(value,'$.kit') FROM json_each(?) WHERE true
      ON CONFLICT(id) DO NOTHING`).bind(config.id, JSON.stringify(teams)),
    db.prepare(`INSERT INTO cup_match (id, tournament_id, date, time, pool, place, home, away)
      SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.date'), json_extract(value,'$.time'),
        json_extract(value,'$.group'), json_extract(value,'$.place'), json_extract(value,'$.teams[0]'),
        json_extract(value,'$.teams[1]') FROM json_each(?) WHERE true ON CONFLICT(id) DO NOTHING`)
      .bind(config.id, JSON.stringify(matches)),
    ...rosterChanges(db, config.players, false),
  ];
}

function rosterChanges(db, players, refresh) {
  const deactivate = refresh ? [db.prepare("UPDATE cup_player SET active = 0")] : [];
  const conflict = refresh
    ? "DO UPDATE SET name = excluded.name, shirt = excluded.shirt, position = excluded.position, duties = excluded.duties, active = 1"
    : "DO NOTHING";
  return [...deactivate, jsonStmt(db, `INSERT INTO cup_player (id, team, name, shirt, position, duties)
    SELECT json_extract(value,'$.id'), json_extract(value,'$.team'), json_extract(value,'$.name'),
      json_extract(value,'$.shirt'), json_extract(value,'$.position'), json_extract(value,'$.duties')
      FROM json_each(?) WHERE true ON CONFLICT (id) ${conflict}`, players)];
}

function playerKey(team, name) {
  const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return team + "-" + key;
}

function mapReport(row, events) {
  return {
    matchId: row.match_id, revision: row.revision, status: row.status, teams: [row.home, row.away],
    score: parse(row.score), halfTime: parse(row.half_time), penalties: parse(row.penalties),
    yellow: parse(row.yellow), red: parse(row.red), events,
  };
}

function mapEvent(row) {
  return {
    id: row.id, team: row.team, player: row.player, assist: row.assist, fraction: row.fraction,
    minute: row.minute, stoppage: row.stoppage, kind: row.kind, notes: row.notes, verified: Boolean(row.verified),
  };
}

async function readCompetition(db, config, management = false) {
  const reportView = management
    ? "(SELECT r.* FROM cup_report r WHERE r.revision = (SELECT max(h.revision) FROM cup_report h WHERE h.match_id = r.match_id))"
    : "cup_published";
  const results = await db.batch([
    db.prepare("SELECT * FROM " + reportView),
    db.prepare(`SELECT e.* FROM cup_event e JOIN ${reportView} r ON r.match_id = e.match_id
      AND r.revision = e.revision ${management ? "" : "WHERE e.verified = 1"}
      ORDER BY e.fraction, e.minute, e.stoppage, e.id`),
    db.prepare("SELECT id, team, name, shirt, position, duties, active FROM cup_player ORDER BY name, id"),
    db.prepare(`SELECT s.* FROM cup_shootout s WHERE s.revision = (SELECT max(h.revision)
      FROM cup_shootout h WHERE h.pool = s.pool)`),
    db.prepare("SELECT * FROM cup_match ORDER BY date, time"),
    db.prepare("SELECT (SELECT count(*) FROM cup_report) + (SELECT count(*) FROM cup_shootout) AS epoch"),
  ]);
  const [rows, eventRows, playerRows, shootoutRows, fixtureRows, [stamp]] = results.map((result) => result.results);
  const events = Map.groupBy(eventRows, (event) => event.match_id);
  const reports = Object.fromEntries(rows.map((row) =>
    [row.match_id, mapReport(row, (events.get(row.match_id) ?? []).map(mapEvent))]));
  const shootouts = structuredClone(config.base.shootoutOrder);
  const shootoutRevisions = {};
  for (const row of shootoutRows) {
    shootouts[row.pool] = parse(row.team_order);
    shootoutRevisions[row.pool] = row.revision;
  }
  const players = playerRows.length ? playerRows : config.players.map((player) => ({ ...player, active: 1 }));
  const matches = fixtureRows.length
    ? fixtureRows.map((row) => ({ id: row.id, date: row.date, time: row.time,
      group: row.pool, place: row.place, teams: [row.home, row.away] }))
    : config.base.matches;
  return { matches, reports, players, shootouts, shootoutRevisions, epoch: stamp.epoch };
}

function publicCompetition(state, config) {
  const players = Object.fromEntries(state.players.map((player) => [player.id, player]));
  const results = {};
  const reports = {};
  const individuals = new Map();
  const teams = Object.fromEntries(Object.keys(config.base.teams).map((id) => [id, []]));
  function stats(id) {
    if (!individuals.has(id)) {
      const { name, team } = players[id];
      individuals.set(id, { id, name, team, goals: 0, penalties: 0, assists: 0, yellow: 0, red: 0 });
    }
    return individuals.get(id);
  }
  for (const fixture of state.matches) {
    const report = state.reports[fixture.id];
    if (!report) continue;
    const { score, halfTime, penalties, yellow, red } = report;
    results[fixture.id] = { score, penalties, yellow, red, qualifiers: report.teams };
    const events = report.events.map((event) => {
      const scorer = stats(event.player);
      if (event.kind === "goal" || event.kind === "penalty") scorer.goals += 1;
      if (event.kind === "penalty") scorer.penalties += 1;
      if (event.kind === "yellow" || event.kind === "second_yellow") scorer.yellow += 1;
      if (event.kind === "red" || event.kind === "second_yellow") scorer.red += 1;
      if (event.assist) stats(event.assist).assists += 1;
      const { notes, verified, ...detail } = event;
      return { ...detail, playerName: scorer.name, assistName: event.assist ? players[event.assist].name : null };
    });
    reports[fixture.id] = { score, halfTime, penalties, teams: report.teams, events };
    report.teams.forEach((team, side) => {
      teams[team].push({ id: fixture.id, opponent: report.teams[1 - side], goals: score[side], against: score[1 - side] });
    });
  }
  const summary = Object.fromEntries(Object.entries(teams).map(([id, form]) => [id, {
    played: form.length, goals: form.reduce((total, item) => total + item.goals, 0),
    against: form.reduce((total, item) => total + item.against, 0), form,
  }]));
  return { tournament: config.id, results, reports, shootouts: state.shootouts,
    stats: { players: [...individuals.values()], teams: summary } };
}

function pair(value, label, required = false) {
  if (value == null && !required) return null;
  if (!Array.isArray(value) || value.length !== 2 ||
      !value.every((item) => Number.isInteger(item) && item >= 0 && item <= 99)) {
    throw new CupError(label + " non valido.");
  }
  return value;
}

function certifiedTeams(config, state, fixture) {
  if (fixture.group) return fixture.teams;
  const results = Object.fromEntries(Object.entries(state.reports).map(([id, r]) => [id, {
    score: r.score, red: r.red, yellow: r.yellow,
  }]));
  const base = tournamentWithResults(config.base, { results, shootouts: state.shootouts });
  const tables = Object.fromEntries(["A", "B"].map((pool) => [pool, standings(pool, base)]));
  return finalists(fixture, tables);
}

function validateReport(change, fixture, teams, players, allowIncomplete = false) {
  if (!teams.every(Boolean)) throw new CupError("Le finaliste devono essere determinate prima di inserire il referto.");
  if (!["draft", "published"].includes(change.status)) throw new CupError("Stato del referto non valido.");
  const score = pair(change.score, "Risultato finale", true);
  const halfTime = pair(change.halfTime, "Risultato del primo tempo");
  const penalties = pair(change.penalties, "Punteggio dei rigori");
  if (halfTime?.some((goals, side) => goals > score[side])) throw new CupError("Il parziale supera il risultato finale.");
  const finalDraw = !fixture.group && score[0] === score[1];
  if (penalties && (!finalDraw || penalties[0] === penalties[1])) throw new CupError("Controlla il punteggio dei rigori.");
  if (!penalties && finalDraw && change.status === "published") throw new CupError("Inserisci l’esito dei rigori.");
  if (!Array.isArray(change.events) || change.events.length > 160) throw new CupError("Elenco eventi non valido.");
  if (typeof change.disciplineComplete !== "boolean") throw new CupError("Verifica lo stato della disciplina.");

  const roster = new Map(players.map((player) => [player.id, player]));
  const counted = { score: [0, 0], halfTime: [0, 0], yellow: [0, 0], red: [0, 0] };
  const fingerprints = new Set();
  const events = change.events.map((event) => {
    const side = teams.indexOf(event?.team);
    if (side < 0 || roster.get(event.player)?.team !== event.team
        || !EVENT_KINDS.has(event.kind) || ![1, 2].includes(event.fraction)
        || !Number.isInteger(event.minute) || event.minute < 0 || event.minute > 99
        || !Number.isInteger(event.stoppage) || event.stoppage < 0 || event.stoppage > 30
        || typeof event.notes !== "string" || event.notes.length > 300
        || typeof event.verified !== "boolean") {
      throw new CupError("Controlla giocatore, frazione e minuto di ogni evento.");
    }
    if (event.assist && (event.kind !== "goal" || roster.get(event.assist)?.team !== event.team
        || event.player === event.assist)) throw new CupError("Seleziona un assistman della stessa squadra.");
    const key = [event.player, event.fraction, event.minute, event.stoppage, event.kind].join(":");
    if (fingerprints.has(key)) throw new CupError("Due eventi coincidono. Controlla i duplicati.");
    fingerprints.add(key);
    if (change.status === "published" && !event.verified) throw new CupError("Verifica tutti gli eventi prima di omologare.");
    if (goalKinds.has(event.kind)) {
      const creditedSide = event.kind === "own_goal" ? 1 - side : side;
      counted.score[creditedSide] += 1;
      if (event.fraction === 1) counted.halfTime[creditedSide] += 1;
    }
    if (["yellow", "second_yellow"].includes(event.kind)) counted.yellow[side] += 1;
    if (["red", "second_yellow"].includes(event.kind)) counted.red[side] += 1;
    return {
      id: crypto.randomUUID(), team: event.team, player: event.player, assist: event.assist || null,
      fraction: event.fraction, minute: event.minute, stoppage: event.stoppage, kind: event.kind,
      notes: event.notes.trim(), verified: event.verified,
    };
  });
  if (change.status === "published" && !allowIncomplete &&
      (score.some((value, side) => value !== counted.score[side]) ||
      halfTime?.some((value, side) => value !== counted.halfTime[side]))) {
    throw new CupError("Il punteggio deve corrispondere ai gol registrati.");
  }
  const yellow = change.disciplineComplete ? counted.yellow : null;
  const red = change.disciplineComplete ? counted.red : null;
  return { matchId: fixture.id, status: change.status, teams, score, halfTime, penalties, yellow, red, events };
}

function reportStatements(db, report, actor, revision, submission, epoch = null) {
  return [
    db.prepare(`INSERT INTO cup_report (match_id, revision, submission, actor, status, home, away,
      score, half_time, penalties, yellow, red)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE
      coalesce((SELECT max(revision) FROM cup_report WHERE match_id = ?), 0) = ? AND ${epochWhere}
      ON CONFLICT DO NOTHING`).bind(report.matchId, revision + 1, submission, actor, report.status,
      ...report.teams, ...[report.score, report.halfTime, report.penalties, report.yellow, report.red].map(asJson),
      report.matchId, revision, epoch, epoch),
    db.prepare(`INSERT INTO cup_event (match_id, revision, id, team, player, assist, fraction, minute,
      stoppage, kind, notes, verified)
      SELECT r.match_id, r.revision, json_extract(j.value,'$.id'), json_extract(j.value,'$.team'),
        json_extract(j.value,'$.player'), json_extract(j.value,'$.assist'), json_extract(j.value,'$.fraction'),
        json_extract(j.value,'$.minute'), json_extract(j.value,'$.stoppage'), json_extract(j.value,'$.kind'),
        json_extract(j.value,'$.notes'), json_extract(j.value,'$.verified')
      FROM cup_report r, json_each(?) j WHERE r.submission = ?`).bind(JSON.stringify(report.events), submission),
  ];
}

const staleReport = () => new CupError("Il referto è cambiato. Ricarica la partita prima di salvare.", 409);

async function saveReport(db, config, change, actor) {
  if (!Number.isSafeInteger(change.revision) || change.revision < 0) throw new CupError("Revisione non valida.");
  const fixture = config.base.matches.find((item) => item.id === change.matchId);
  if (!fixture) throw new CupError("Partita non trovata.", 404);
  await db.batch(fixtureSeed(db, config));
  const [current, published] = await Promise.all([readCompetition(db, config, true), readCompetition(db, config)]);
  if ((current.reports[fixture.id]?.revision ?? 0) !== change.revision) throw staleReport();
  if (current.epoch !== published.epoch) throw staleReport();
  const teams = certifiedTeams(config, published, fixture);
  const report = validateReport(change, fixture, teams, current.players);
  if (fixture.group && report.status === "published") {
    preventFinalistChange(config, published, { ...published, reports: { ...published.reports, [fixture.id]: report } });
  }
  const [written] = await db.batch(reportStatements(db, report, actor, change.revision, crypto.randomUUID(), published.epoch));
  if (written.meta.changes !== 1) throw staleReport();
  return { ...report, revision: change.revision + 1 };
}

function preventFinalistChange(config, previous, next) {
  for (const fixture of config.base.matches.filter((item) => item.place)) {
    const final = previous.reports[fixture.id];
    if (final && certifiedTeams(config, next, fixture).some((id, i) => id !== final.teams[i])) {
      throw new CupError("La modifica cambierebbe le qualificate di una finale già omologata.", 409);
    }
  }
}

async function saveShootout(db, config, change, actor) {
  const { group, order, revision } = change;
  if (!["A", "B"].includes(group) || !Array.isArray(order) || order.length === 1 || order.length > 3
      || new Set(order).size !== order.length || !order.every((id) => config.base.teams[id]?.group === group)
      || !Number.isSafeInteger(revision) || revision < 0) throw new CupError("Ordine di spareggio non valido.");
  const previous = await readCompetition(db, config);
  const completed = config.base.matches.filter((match) => match.group === group)
    .every((match) => previous.reports[match.id]);
  if (order.length && !completed) throw new CupError("Completa le partite del girone prima di registrare lo spareggio.");
  preventFinalistChange(config, previous, { ...previous, shootouts: { ...previous.shootouts, [group]: order } });
  const written = await db.prepare(`INSERT INTO cup_shootout (pool, revision, team_order, actor)
    SELECT ?, ?, ?, ? WHERE coalesce((SELECT max(revision) FROM cup_shootout WHERE pool = ?), 0) = ? AND ${epochWhere}
    ON CONFLICT DO NOTHING`).bind(group, revision + 1, asJson(order), actor, group, revision, previous.epoch, previous.epoch).run();
  if (written.meta.changes !== 1) throw staleReport();
  return { group, order, revision: revision + 1 };
}

async function bootstrapAllowed(request, env) {
  const key = env.CUP_IMPORT_KEY;
  const supplied = request.headers.get("Authorization");
  if (!key || !supplied || supplied.length > 100) return false;
  const bytes = new TextEncoder();
  const digest = (value) => crypto.subtle.digest("SHA-256", bytes.encode(value));
  const [actual, expected] = await Promise.all([digest(supplied), digest("Bearer " + key)]);
  const a = new Uint8Array(actual);
  const b = new Uint8Array(expected);
  return a.reduce((diff, value, i) => diff | (value ^ b[i]), 0) === 0;
}

const backupTables = ["cup_tournament", "cup_team", "cup_player", "cup_match", "cup_report", "cup_event", "cup_shootout"];

async function bootstrap(db, config) {
  const initial = config.initialReports ?? [];
  const seed = fixtureSeed(db, config);
  const reports = initial.map((change) => {
    const fixture = config.base.matches.find((item) => item.id === change.matchId);
    const report = validateReport(change, fixture, fixture.teams, config.players);
    return reportStatements(db, report, "import:referti-ufficiali", 0, crypto.randomUUID());
  });
  const alreadyPresent = new Set((await db.prepare("SELECT DISTINCT match_id FROM cup_report").all())
    .results.map((row) => row.match_id));
  const written = await db.batch([...seed, ...reports.flatMap((set, i) =>
    alreadyPresent.has(initial[i].matchId) ? [] : set)]);
  return {
    tournament: config.id,
    fixtures: config.base.matches.length,
    players: config.players.length,
    imported: written.slice(seed.length).filter((item, i) => i % 2 === 0 && item.meta.changes === 1).length,
  };
}

function cupHandler(config) {
  return async (request, env) => {
    const { pathname, origin } = new URL(request.url);
    if (!pathname.startsWith("/api/cup/")) return null;
    const endpoint = pathname.slice("/api/cup/".length);
    const publicRead = endpoint === "pubblico" && request.method === "GET";
    const crossOrigin = request.headers.get("origin");
    const cors = publicRead && config.origins.includes(crossOrigin)
      ? { "Access-Control-Allow-Origin": crossOrigin, Vary: "Origin" } : {};
    try {
      if (publicRead) return cupJson(publicCompetition(await readCompetition(env.DB, config), config), 200, cors);
      if (endpoint === "inizializza" && request.method === "POST" && await bootstrapAllowed(request, env)) {
        return cupJson(await bootstrap(env.DB, config));
      }
      const user = organizer(request, env);
      if (endpoint === "accesso" && request.method === "GET") {
        return cupJson({ signedIn: user.signedIn, allowed: user.allowed, tournament: config.id });
      }
      if (!user.allowed) throw new CupError("Accesso riservato agli organizzatori.", 403);
      if (request.method === "GET" && endpoint === "gestione") {
        const [working, published] = await Promise.all([readCompetition(env.DB, config, true), readCompetition(env.DB, config)]);
        const matches = working.matches.map((item) => ({ ...item, teams: certifiedTeams(config, published, item) }));
        return cupJson({ ...working, matches, teams: config.base.teams, tournament: config.id,
          published: publicCompetition(published, config) });
      }
      if (request.method === "GET" && endpoint === "backup") {
        const snapshot = await env.DB.batch(backupTables.map((table) => env.DB.prepare("SELECT * FROM " + table)));
        return cupJson({ tournament: config.id, version: 1, tables: Object.fromEntries(
          backupTables.map((table, i) => [table, snapshot[i].results])) }, 200,
        { "Content-Disposition": 'attachment; filename="' + config.id + '-backup.json"' });
      }
      if (request.method === "GET" && endpoint === "cronologia") {
        const id = new URL(request.url).searchParams.get("partita");
        if (!config.base.matches.some((item) => item.id === id)) throw new CupError("Partita non trovata.", 404);
        const audit = await env.DB.prepare(`SELECT revision, actor, created_at, status, score FROM cup_report
          WHERE match_id = ? ORDER BY revision DESC LIMIT 100`).bind(id).all();
        return cupJson(audit.results.map((row) => ({ ...row, score: parse(row.score) })));
      }
      if (request.method === "POST") {
        if (crossOrigin !== origin) throw new CupError("Origine della richiesta non valida.", 403);
        const change = await readBody(request);
        if (change.tournament !== config.id) throw new CupError("Torneo non corrispondente.", 409);
        if (endpoint === "referto") return cupJson(await saveReport(env.DB, config, change, user.actor));
        if (endpoint === "spareggio") return cupJson(await saveShootout(env.DB, config, change, user.actor));
      }
      throw new CupError("Operazione non disponibile.", 404);
    } catch (error) {
      if (error instanceof CupError) return cupJson({ error: error.message }, error.status, cors);
      console.error("Cup request failed", endpoint, error.message);
      return cupJson({ error: "Servizio temporaneamente indisponibile." }, 503, cors);
    }
  };
}

export { cupHandler, fixtureSeed, playerKey, readCompetition, publicCompetition, validateReport, reportStatements, rosterChanges, bootstrap };
