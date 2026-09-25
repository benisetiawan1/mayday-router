# Mayday — Agent Skills

Drop-in skills for any AI agent (Claude, Cursor, ChatGPT, custom SDK). Just **copy a link** below and paste it to your AI — it will fetch the skill and use Mayday for you.

> Tip: start with the **mayday** entry skill — it covers setup and links to all capability skills.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | ../mayday/SKILL.md |
| Chat / code-gen | ../mayday-chat/SKILL.md |
| Image generation | ../mayday-image/SKILL.md |
| Video generation (xAI Grok Imagine) | ../mayday-video/SKILL.md |
| Text-to-speech | ../mayday-tts/SKILL.md |
| Speech-to-text | ../mayday-stt/SKILL.md |
| Embeddings | ../mayday-embeddings/SKILL.md |
| Web search | ../mayday-web-search/SKILL.md |
| Web fetch (URL → markdown) | ../mayday-web-fetch/SKILL.md |

## How to use

Paste to your AI (Claude, Cursor, ChatGPT, …):

```
Read this skill and use it: ../mayday/SKILL.md
```

Then ask normally — *"generate an image of a cat"*, *"transcribe this URL"*, etc.

## Configure your shell once

```bash
export NINEROUTER_URL="http://localhost:20128"   # local default, or your VPS / tunnel URL
export NINEROUTER_KEY="sk-..."                   # from Dashboard → Keys (only if requireApiKey=true)
```

Verify: `curl $NINEROUTER_URL/api/health` → `{"ok":true}`.

## Links

- Source: https://github.com/benisetiawan1/mayday-router
- Dashboard: https://mayday.20c.org
