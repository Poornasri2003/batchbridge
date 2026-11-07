import { mkdir } from "node:fs/promises";
import { seed } from "./domain.mjs";
export async function createStore(url, filename = "data/batchbridge.sqlite") {
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 5 });
    await pool.query(
      "CREATE TABLE IF NOT EXISTS workspaces (id text PRIMARY KEY, document jsonb NOT NULL)",
    );
    return {
      kind: "PostgreSQL",
      async create(id) {
        await pool.query(
          "INSERT INTO workspaces(id,document) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [id, JSON.stringify(seed())],
        );
      },
      async read(id) {
        return (
          await pool.query("SELECT document FROM workspaces WHERE id=$1", [id])
        ).rows[0]?.document;
      },
      async mutate(id, fn) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const r = await c.query(
            "SELECT document FROM workspaces WHERE id=$1 FOR UPDATE",
            [id],
          );
          if (!r.rows.length) throw Error("Workspace not found");
          const s = r.rows[0].document;
          const out = fn(s);
          if (out && typeof out.then === "function")
            throw Error(
              "Network/async work is prohibited inside state transactions",
            );
          await c.query("UPDATE workspaces SET document=$2 WHERE id=$1", [
            id,
            JSON.stringify(s),
          ]);
          await c.query("COMMIT");
          return structuredClone(out);
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }
  const { DatabaseSync } = await import("node:sqlite");
  await mkdir("data", { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, document TEXT NOT NULL)",
  );
  return {
    kind: "SQLite (local)",
    async create(id) {
      db.prepare("INSERT OR IGNORE INTO workspaces VALUES(?,?)").run(
        id,
        JSON.stringify(seed()),
      );
    },
    async read(id) {
      const r = db
        .prepare("SELECT document FROM workspaces WHERE id=?")
        .get(id);
      return r ? JSON.parse(r.document) : undefined;
    },
    async mutate(id, fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = db
          .prepare("SELECT document FROM workspaces WHERE id=?")
          .get(id);
        if (!r) throw Error("Workspace not found");
        const s = JSON.parse(r.document);
        const out = fn(s);
        if (out && typeof out.then === "function")
          throw Error("Async transaction rejected");
        db.prepare("UPDATE workspaces SET document=? WHERE id=?").run(
          JSON.stringify(s),
          id,
        );
        db.exec("COMMIT");
        return structuredClone(out);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async close() {
      db.close();
    },
  };
}
