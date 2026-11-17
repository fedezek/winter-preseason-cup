function standings(group, tournament) {
  const { matches, teams } = tournament;
  const groupMatches = matches.filter((match) => match.group === group);
  const rows = Object.entries(teams).filter(([, team]) => team.group === group)
    .map(([id]) => ({ id, played: 0, points: 0, goals: 0, against: 0, wins: 0, draws: 0, losses: 0, red: 0, yellow: 0 }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const match of groupMatches.filter((game) => game.score)) {
    match.teams.forEach((id, i) => {
      const row = byId.get(id);
      const own = match.score[i];
      const other = match.score[1 - i];
      row.played += 1;
      row.wins += Number(own > other);
      row.draws += Number(own === other);
      row.losses += Number(own < other);
      row.goals += own;
      row.against += other;
      row.points += own === other ? 1 : own > other ? 3 : 0;
      row.red = match.red && row.red !== null ? row.red + match.red[i] : null;
      row.yellow = match.yellow && row.yellow !== null ? row.yellow + match.yellow[i] : null;
    });
  }
  rows.forEach((row) => { row.diff = row.goals - row.against; });
  const complete = groupMatches.length > 0 && groupMatches.every((match) => match.score);
  // Separate tied groups at each criterion. An unknown card count leaves the
  // entire tied subset unresolved rather than ranking only the known rows.
  const shootout = tournament.shootoutOrder[group];
  const criteria = [
    (row) => row.points, (row) => row.diff, (row) => row.goals,
    (row) => row.red === null ? null : -row.red,
    (row) => row.yellow === null ? null : -row.yellow,
    (row) => complete && shootout.includes(row.id) ? -shootout.indexOf(row.id) : null,
  ];
  function orderTies(tied, criterion) {
    if (tied.length < 2 || criterion === criteria.length) return [tied];
    const value = criteria[criterion];
    if (tied.some((row) => value(row) === null)) return [tied];
    const buckets = new Map();
    tied.forEach((row) => {
      const key = value(row);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(row);
    });
    return [...buckets.keys()].sort((a, b) => b - a)
      .flatMap((key) => orderTies(buckets.get(key), criterion + 1));
  }
  const ranked = orderTies(rows, 0);
  let rank = 1;
  for (const tied of ranked) {
    tied.forEach((row) => {
      row.rank = rank;
      row.confirmed = complete && tied.length === 1;
    });
    rank += tied.length;
  }
  return { rows: ranked.flat(), complete, tied: ranked.some((set) => set.length > 1) };
}

function tournamentWithResults(base, { results, shootouts }) {
  return {
    ...base,
    shootoutOrder: shootouts,
    matches: base.matches.map((match) => match.group ? { ...match, ...results[match.id] } : { ...match }),
  };
}

function finalists(match, tableByGroup) {
  return ["A", "B"].map((group) => tableByGroup[group].rows
    .find((entry) => entry.rank === match.place && entry.confirmed)?.id ?? null);
}

function matchesFinalists(result, ids) {
  return Boolean(result?.qualifiers && ids.every((id, side) => id && id === result.qualifiers[side]));
}
