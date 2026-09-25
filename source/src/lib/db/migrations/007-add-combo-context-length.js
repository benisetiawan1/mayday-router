// Migration 007: add context_length column to combos.
// Idempotent — safe to re-run on databases that already have the column.
export default {
  version: 7,
  name: "add-combo-context-length",
  up(db) {
    const cols = db.all("PRAGMA table_info(combos)");
    if (!cols.some((c) => c.name === "context_length")) {
      db.exec("ALTER TABLE combos ADD COLUMN context_length INTEGER");
    }
  },
};
