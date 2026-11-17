import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function fixtureDatabase() {
  const storage = new DatabaseSync(":memory:");
  storage.exec(readFileSync(new URL("../drizzle/0002_competitions.sql", import.meta.url), "utf8"));
  function prepare(sql, values = []) {
    const statement = storage.prepare(sql);
    return {
      bind: (...bindings) => prepare(sql, bindings),
      all: async () => ({ results: statement.all(...values) }),
      run: async () => ({ meta: { changes: statement.run(...values).changes } }),
      invoke: () => /^\s*SELECT\b/i.test(sql) ? { results: statement.all(...values) }
        : { meta: { changes: statement.run(...values).changes } },
    };
  }
  return {
    prepare,
    close: () => storage.close(),
    batch: async (statements) => {
      storage.exec("BEGIN");
      try {
        const results = statements.map((item) => item.invoke());
        storage.exec("COMMIT");
        return results;
      } catch (error) {
        storage.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
