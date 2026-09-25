"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

// Resolve chatLanguageModels.json path per OS
const getConfigPath = () => {
  const home = os.homedir();
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(process.env.APPDATA || home, "Code", "User", "chatLanguageModels.json");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Code", "User", "chatLanguageModels.json");
  }
  return path.join(home, ".config", "Code", "User", "chatLanguageModels.json");
};

const readConfig = async () => {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    // Tolerate JSONC (trailing commas) and treat unparseable files as "no config"
    // rather than throwing a 500 that the UI misreads as "tool not installed".
    const stripped = content.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  } catch (error) {
    return null;
  }
};

const hasMaydayConfig = (config) => {
  if (!Array.isArray(config)) return false;
  return config.some((entry) => entry.name === "Mayday");
};

const getMaydayEntry = (config) => {
  if (!Array.isArray(config)) return null;
  return config.find((entry) => entry.name === "Mayday") || null;
};

// GET - Read current copilot config
export async function GET() {
  try {
    const config = await readConfig();
    const entry = getMaydayEntry(config);

    return NextResponse.json({
      installed: true,
      config,
      hasMayday: hasMaydayConfig(config),
      configPath: getConfigPath(),
      currentModel: entry?.models?.[0]?.id || null,
      currentUrl: entry?.models?.[0]?.url || null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to check copilot settings" }, { status: 500 });
  }
}

// POST - Apply Mayday config to chatLanguageModels.json
export async function POST(request) {
  try {
    const { baseUrl, apiKey, models } = await request.json();

    if (!baseUrl || !models?.length) {
      return NextResponse.json({ error: "baseUrl and models are required" }, { status: 400 });
    }

    const configPath = getConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    // Read existing config array
    const parsed = await readConfig();
    let config = Array.isArray(parsed) ? parsed : [];

    const endpointUrl = `${baseUrl}/chat/completions#models.ai.azure.com`;
    const keyToUse = apiKey || "sk_mayday";

    const newEntry = {
      name: "Mayday",
      vendor: "azure",
      apiKey: keyToUse,
      models: models.map((id) => ({
        id,
        name: id,
        url: endpointUrl,
        toolCalling: true,
        vision: false,
        maxInputTokens: 128000,
        maxOutputTokens: 16000,
      })),
    };

    // Replace existing Mayday entry or append
    const idx = config.findIndex((e) => e.name === "Mayday");
    if (idx >= 0) {
      config[idx] = newEntry;
    } else {
      config.push(newEntry);
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Copilot settings applied! Reload VS Code to take effect.",
      configPath,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update copilot settings" }, { status: 500 });
  }
}

// DELETE - Remove Mayday entry from chatLanguageModels.json
export async function DELETE() {
  try {
    const configPath = getConfigPath();

    let config = [];
    const parsed = await readConfig();
    if (!parsed) {
      return NextResponse.json({ success: true, message: "No config file to reset" });
    }
    config = Array.isArray(parsed) ? parsed : [];

    config = config.filter((e) => e.name !== "Mayday");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Mayday removed from Copilot config",
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to reset copilot settings" }, { status: 500 });
  }
}
