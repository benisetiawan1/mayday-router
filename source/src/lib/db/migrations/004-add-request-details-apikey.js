export default {
  version: 4,
  name: "add-request-details-apikey",
  up(db) {
    const rows = db.all("PRAGMA table_info(requestDetails)");
    const cols = new Set(rows.map((r) => r.name));
    if (!cols.has("apiKey")) db.exec("ALTER TABLE requestDetails ADD COLUMN apiKey TEXT");
    if (!cols.has("apiKeyName")) db.exec("ALTER TABLE requestDetails ADD COLUMN apiKeyName TEXT");
  },
};
