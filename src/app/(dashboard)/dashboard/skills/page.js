"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
  SKILLS,
  SKILLS_REPO_URL,
  getSkillRawUrl,
  getSkillBlobUrl,
} from "@/shared/constants/skills";

function CopyButton({ value, label = "Copy link" }) {
  const { copied, copy } = useCopyToClipboard(2000);
  return (
    <button type="button" onClick={() => copy(value)} className="btn" title={value}>
      <span className="material-symbols-outlined text-[14px]">
        {copied ? "check" : "content_copy"}
      </span>
      {copied ? "Copied!" : label}
    </button>
  );
}

function SkillCard({ skill }) {
  const url = getSkillRawUrl(skill.id);
  const icon = skill.icon || "extension";
  return (
    <div
      className="pcard"
      style={skill.isEntry ? { boxShadow: "inset 0 0 0 1px var(--cr-accent-line)" } : undefined}
    >
      <div className="top">
        <div
          className="plogo"
          style={{ background: skill.isEntry ? "var(--color-primary)" : "#475569" }}
        >
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </div>
        <div className="min-w-0">
          <div className="nm">{skill.name}</div>
          <div className="sid">{skill.description}</div>
          {skill.id && (
            <a
              href={getSkillBlobUrl(skill.id)}
              target="_blank"
              rel="noreferrer"
              className="sid"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%" }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {url}
              </span>
              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
            </a>
          )}
        </div>
      </div>
      <div className="ct">
        {skill.isEntry && <Badge variant="primary" size="sm">START HERE</Badge>}
        {skill.source === "custom" && <Badge variant="default" size="sm">CUSTOM</Badge>}
        {skill.endpoint && (
          <Badge variant="default" size="sm">
            <code className="text-[10px]">{skill.endpoint}</code>
          </Badge>
        )}
      </div>
      <div className="foot">
        <CopyButton value={url} />
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [customSkills, setCustomSkills] = useState([]);

  useEffect(() => {
    fetch("/api/skills", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { skills: [] }))
      .then((d) => setCustomSkills(d.skills || []))
      .catch(() => setCustomSkills([]));
  }, []);

  const builtInIds = new Set(SKILLS.map((s) => s.id));
  const extraSkills = customSkills
    .filter((s) => !builtInIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, description: s.description || "", source: "custom", icon: "extension" }));

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>01</b> · Agent Skills</span>
          <div className="acts">
            <span className="tag g">SERVED AT /SKILLS/*</span>
          </div>
        </div>
        <div className="banner">
          <span>▦</span>
          <div>
            <div>Paste this to your AI:</div>
            <div style={{ fontFamily: "var(--font-jetbrains, monospace)", wordBreak: "break-all" }}>
              Read this skill and use it: {getSkillRawUrl("mayday")}
            </div>
          </div>
        </div>
        <div className="cards">
          {SKILLS.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
          {extraSkills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>02</b> · More on GitHub</span>
          <div className="acts">
            <a
              href={`${SKILLS_REPO_URL}/tree/master/skills`}
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              View on GitHub
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            </a>
          </div>
        </div>
        <p className="dim" style={{ padding: "0 14px 12px" }}>
          Browse source, README, and examples.
        </p>
      </div>
    </div>
  );
}