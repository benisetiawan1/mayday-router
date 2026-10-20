import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { makeKv } from "../helpers/kvStore.js";

const aliasKv = makeKv("modelAliases");
const customKv = makeKv("customModels");
const mitmKv = makeKv("mitmAlias");

// modelAliases: key=alias, value=modelString
export async function getModelAliases() {
  return await aliasKv.getAll();
}

export async function setModelAlias(alias, model) {
  await aliasKv.set(alias, model);
}

export async function deleteModelAlias(alias) {
  await aliasKv.remove(alias);
}

// customModels: key=`${providerAlias}|${id}|${type}`, value=full model object
function customKey(providerAlias, id, type) {
  return `${providerAlias}|${id}|${type}`;
}

export async function getCustomModels() {
  const all = await customKv.getAll();
  return Object.values(all);
}

// Atomic check-then-insert inside transaction to prevent duplicate races
export async function addCustomModel({ providerAlias, id, type = "llm", name }) {
  const k = customKey(providerAlias, id, type);
  const db = await getAdapter();
  let added = false;
  db.transaction(() => {
    const row = db.get(`SELECT 1 FROM kv WHERE scope = 'customModels' AND key = ?`, [k]);
    if (row) return;
    const value = stringifyJson({ providerAlias, id, type, name: name || id });
    db.run(`INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, value]);
    added = true;
  });
  return added;
}

export async function addCustomModelsBulk(models = []) {
  if (!Array.isArray(models) || models.length === 0) return 0;
  const db = await getAdapter();
  let addedCount = 0;
  db.transaction(() => {
    for (const item of models) {
      const { providerAlias, id, type = "llm", name } = item || {};
      if (!providerAlias || !id) continue;
      const k = customKey(providerAlias, id, type);
      const row = db.get(`SELECT 1 FROM kv WHERE scope = 'customModels' AND key = ?`, [k]);
      if (row) continue;
      const value = stringifyJson({ providerAlias, id, type, name: name || id });
      db.run(`INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, value]);
      addedCount += 1;
    }
  });
  return addedCount;
}

export async function deleteCustomModel({ providerAlias, id, type = "llm" }) {
  const exactKey = customKey(providerAlias, id, type);
  const db = await getAdapter();
  const exact = db.get(`SELECT 1 FROM kv WHERE scope = 'customModels' AND key = ?`, [exactKey]);
  if (exact) {
    await customKv.remove(exactKey);
    return true;
  }

  // Legacy-key fallback. Custom models were historically stored under the provider's OLD
  // storage alias — e.g. `dashscope-intl|kimi-k2.7-code|llm` while the provider alias is now
  // `md`. Deleting by the current alias alone matched 0 rows, the API still answered
  // success, and the dashboard X button looked broken (no disable option exists for custom
  // models). Scan for the id+type suffix and verify against the stored value before removing,
  // so a model that merely shares the id with another provider is never deleted.
  // NOTE: `_` inside an id is a LIKE wildcard; the value check below is what makes it safe.
  const candidates = db.all(
    `SELECT key, value FROM kv WHERE scope = 'customModels' AND key LIKE ?`,
    [`%|${id}|${type}`]
  );
  for (const row of candidates) {
    const stored = parseJson(row.value, null);
    if (stored && stored.providerAlias === providerAlias && stored.id === id
      && (stored.type || "llm") === type) {
      await customKv.remove(row.key);
      return true;
    }
  }
  return false;
}

// mitmAlias: key=toolName, value=mappings object
export async function getMitmAlias(toolName) {
  if (toolName) {
    const v = await mitmKv.get(toolName);
    return v || {};
  }
  return await mitmKv.getAll();
}

export async function setMitmAliasAll(toolName, mappings) {
  await mitmKv.set(toolName, mappings || {});
}
