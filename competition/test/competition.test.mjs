import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureDatabase } from "./sqlite.mjs";

const build = process.env.WINTER_WORKER_ARTIFACT;
if (!build) throw new Error("Imposta WINTER_WORKER_ARTIFACT al modulo ESM compilato.");
const { default: worker } = await import(build);
const origin = "https://stage.example.test";
const env = { ORGANIZER_EMAIL: "organizer@example.test", CUP_IMPORT_KEY: "local-fixture-key" };
const organizer = {
  "oai-authenticated-user-id": "operator-01",
  "oai-authenticated-user-email": env.ORGANIZER_EMAIL,
};
const fixture = (id, change = {}) => ({
  tournament: "winter", matchId: id, revision: 0, score: [0, 0], halfTime: [0, 0],
  penalties: null, disciplineComplete: true, status: "published", events: [], ...change,
});
function event(player, kind, fraction, minute, assist) {
  return { player: player.id, team: player.team, kind, fraction, minute, assist: assist?.id ?? null,
    stoppage: 0, verified: true, notes: "appunto visibile solo agli organizzatori" };
}
function connection(DB) {
  return async function request(path, change, identity = organizer, from = origin) {
    return worker.fetch(new Request(origin + path, {
      ...(change === undefined ? {} : { method: "POST", body: JSON.stringify(change) }),
      headers: { ...identity, origin: from, "Content-Type": "application/json" },
    }), { ...env, DB });
  };
}
const api = "/api/cup/";
const publicPath = api + "pubblico";
const management = api + "gestione";
const report = api + "referto";

test("Winter del 22 novembre: bozza, vittoria, pareggio, eventi, correzione, cronologia e ripristino staging", async () => {
  const DB = fixtureDatabase();
  const request = connection(DB);
  const { matches, players } = await (await request(management)).json();
  assert.deepEqual(matches.slice(0, 2).map(({ id, date, time }) => [id, date, time]), [
    ["a1", "2026-11-22", "20:00"], ["b1", "2026-11-22", "21:00"],
  ]);
  assert.equal(players.length, 142);
  const alc = players.filter(({ team }) => team === "alfieri");
  const gal = players.filter(({ team }) => team === "galfer");
  const san = players.filter(({ team }) => team === "santanna");
  const vit = players.filter(({ team }) => team === "vittoria");
  const scoreEvents = [
    event(alc[0], "goal", 1, 5, alc[1]), event(alc[0], "penalty", 2, 20),
    event(gal[0], "yellow", 1, 8), event(gal[1], "red", 2, 22),
  ];
  const first = fixture("a1", { score: [2, 0], halfTime: [1, 0], events: scoreEvents });
  assert.equal((await request(report, { ...first, status: "draft" })).status, 200);
  assert.deepEqual((await (await request(publicPath)).json()).results, {});
  assert.equal((await request(report, { ...first, revision: 1 })).status, 200);
  assert.equal((await request(report, first)).status, 409);
  const second = fixture("b1", {
    score: [1, 1], halfTime: [0, 0], events: [event(san[0], "goal", 2, 5), event(vit[0], "goal", 2, 7)],
  });
  assert.equal((await request(report, second)).status, 200);
  const published = await (await request(publicPath)).json();
  assert.deepEqual(published.results.a1.score, [2, 0]);
  assert.deepEqual(published.results.b1.score, [1, 1]);
  assert.equal(published.results.a1.yellow[1], 1);
  assert.equal(published.results.a1.red[1], 1);
  assert.equal(published.stats.players.find((p) => p.id === alc[0].id).penalties, 1);
  assert.equal(published.stats.players.find((p) => p.id === alc[1].id).assists, 1);
  assert.equal(published.stats.teams.alfieri.goals, 2);
  assert.equal(published.stats.teams.galfer.against, 2);
  assert.equal(published.reports.a1.events[0].notes, undefined);
  const correction = { ...first, revision: 2, score: [1, 0], events: scoreEvents.filter((item) => item.kind !== "penalty") };
  assert.equal((await request(report, { ...correction, status: "draft" })).status, 200);
  assert.deepEqual((await (await request(publicPath)).json()).results.a1.score, [2, 0]);
  assert.equal((await request(report, { ...correction, revision: 3 })).status, 200);
  const corrected = await (await request(publicPath)).json();
  assert.equal(corrected.stats.teams.alfieri.goals, 1);
  assert.equal(corrected.stats.players.find((p) => p.id === alc[0].id).penalties, 0);
  const audit = await (await request(api + "cronologia?partita=a1")).json();
  assert.deepEqual(audit.map(({ revision, status }) => [revision, status]),
    [[4, "published"], [3, "draft"], [2, "published"], [1, "draft"]]);
  const backup = await (await request(api + "backup")).json();
  assert.equal(backup.tables.cup_report.length, 5);
  assert.equal(backup.tables.cup_match.length, 8);
  assert.equal(backup.tables.cup_player.length, 142);
  DB.close();
  const clean = fixtureDatabase();
  assert.deepEqual((await (await connection(clean)(publicPath)).json()).results, {});
  clean.close();
});

test("autorizzazione, isolamento dei tornei, coerenza del referto e concorrenza", async () => {
  const DB = fixtureDatabase();
  const request = connection(DB);
  assert.equal((await request(management, undefined, {})).status, 403);
  assert.equal((await request("/organizzatori", undefined, {})).status, 302);
  assert.equal((await request("/organizzatori", undefined, {
    ...organizer, "oai-authenticated-user-email": "guest@example.test",
  })).status, 403);
  assert.equal((await request("/organizzatori")).status, 200);
  assert.equal((await request(report, fixture("a1"), {})).status, 403);
  assert.equal((await request(report, fixture("a1"), organizer, "https://other.example.test")).status, 403);
  assert.equal((await request(report, fixture("a1", { tournament: "prestige" }))).status, 409);
  assert.equal((await request(report, fixture("m1"))).status, 404);
  assert.equal((await request(report, fixture("a1", { score: [1, 0] }))).status, 400);
  assert.equal((await request(report, fixture("f1"))).status, 400);
  const result = await Promise.all([request(report, fixture("a1")), request(report, fixture("a1"))]);
  assert.deepEqual(result.map((item) => item.status).sort(), [200, 409]);
  const publicCors = await request(publicPath, undefined, {}, "https://winterpreseasoncup.it");
  assert.equal(publicCors.headers.get("Access-Control-Allow-Origin"), "https://winterpreseasoncup.it");
  assert.equal((await request(publicPath, undefined, {}, "https://other.example.test")).headers.get("Access-Control-Allow-Origin"), null);
  assert.equal((await request("/rose.html")).status, 200);
  assert.equal((await request("/tournament.js")).status, 200);
  DB.close();
});

test("inizializzazione ripetibile e vincoli relazionali", async () => {
  const DB = fixtureDatabase();
  const request = connection(DB);
  const path = api + "inizializza";
  assert.equal((await request(path, {}, {})).status, 403);
  const key = { Authorization: "Bearer " + env.CUP_IMPORT_KEY };
  for (let i = 0; i < 2; i++) {
    const response = await request(path, {}, key);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { tournament: "winter", fixtures: 8, players: 142, imported: 0 });
  }
  const snapshot = await (await request(api + "backup")).json();
  assert.equal(snapshot.tables.cup_team.length, 6);
  await assert.rejects(DB.prepare("INSERT INTO cup_player VALUES ('p','unknown','name',null,'ruolo',null,1)").run(), /FOREIGN KEY/);
  DB.close();
});
