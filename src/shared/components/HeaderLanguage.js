"use client";

import { useState } from "react";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import LanguageSwitcher from "./LanguageSwitcher";

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

export default function HeaderLanguage() {
  const [open, setOpen] = useState(false);
  const locale = getLocaleFromCookie();

  return (
    <>
      <button type="button"
        onClick={() => setOpen(true)}
        className="tbtn"
        title="Language"
        data-i18n-skip="true"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">{(locale || "en").split("-")[0]}</span>
      </button>

      <LanguageSwitcher
        hideTrigger
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
