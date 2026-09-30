"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Button from "./Button";
import { ConfirmModal } from "./Modal";
import NineRemotePromoModal from "./NineRemotePromoModal";
import UpdateModal from "./UpdateModal";
import ThemeToggle from "./ThemeToggle";
import HeaderLanguage from "./HeaderLanguage";
import HeaderMenu from "./HeaderMenu";
import DonateModal from "./DonateModal";
import { HeaderSearch } from "./Header";

const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt"];
const COMBINED_WEB_ITEM = { id: "web", label: "Web Fetch & Search", icon: "travel_explore", href: "/dashboard/media-providers/web" };

const navItems = [
  { href: "/dashboard/endpoint", label: "Endpoint & Key", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combos", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
  { href: "/dashboard/translator", label: "Translator", icon: "translate" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/proxy-fitness", label: "Proxy Fitness", icon: "network_check" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
  { href: "/dashboard/extended", label: "Extended", icon: "widgets" },
];

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [sysOpen, setSysOpen] = useState(false);
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUpdateNowModal, setShowUpdateNowModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const { copied, copy } = useCopyToClipboard(2000);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) window.location.assign("/login");
    } catch { /* logout failed */ }
  };

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => { if (data.enableTranslator) setEnableTranslator(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => { if (data.hasUpdate) setUpdateInfo(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sysOpen) return;
    const onEsc = (e) => { if (e.key === "Escape") setSysOpen(false); };
    const onClick = (e) => { if (!e.target.closest("[data-sys-menu]")) setSysOpen(false); };
    document.addEventListener("keydown", onEsc);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.removeEventListener("click", onClick);
    };
  }, [sysOpen]);

  const isActive = (href) => {
    if (href === "/dashboard/endpoint") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
  };

  const handleUpdate = () => {
    setShowUpdateModal(false);
    setIsUpdating(true);
  };

  const handleCopyAndShutdown = async () => {
    try { await navigator.clipboard.writeText(INSTALL_CMD); } catch { /* clipboard blocked */ }
    copy(INSTALL_CMD);
    let remaining = UPDATER_CONFIG.shutdownCountdownSec;
    setShutdownCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setShutdownCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        fetch("/api/version/shutdown", { method: "POST" }).catch(() => {});
        setIsDisconnected(true);
      }
    }, 1000);
  };

  const handleCancelUpdate = () => {
    setIsUpdating(false);
    setShutdownCountdown(0);
  };

  const sysActive =
    pathname.startsWith("/dashboard/media-providers") ||
    pathname.startsWith("/dashboard/proxy") ||
    pathname.startsWith("/dashboard/skills") ||
    pathname.startsWith("/dashboard/extended") ||
    pathname.startsWith("/dashboard/console-log") ||
    pathname.startsWith("/dashboard/translator") ||
    pathname.startsWith("/dashboard/profile") ||
    pathname.startsWith("/dashboard/pxpipe") ||
    pathname.startsWith("/dashboard/mitm") ||
    pathname.startsWith("/dashboard/basic-chat");

  return (
    <>
      {/* Control Room v3 topbar */}
      <div className="cr-topbar relative z-30">
        <Link href="/dashboard" className="cr-brand">
          <div className="cr-brand-block">M</div>
          <div className="cr-brand-name">
            {APP_CONFIG.name} <em>Control</em>
          </div>
        </Link>
        <span className="chip">v{APP_CONFIG.version}</span>
        <div className="cr-live hidden md:flex">
          <span className="led ok pulse"></span>
          <span className="txt">Operational</span>
        </div>

        <div className="right">
          {updateInfo && (
            <>
              <button
                onClick={async () => {
                  // tarball installs get the one-click updater; docker/npm keep the manual flow
                  try {
                    const res = await fetch("/api/update/status", { cache: "no-store" });
                    const s = await res.json();
                    if (s.installMode === "tarball") {
                      setShowUpdateNowModal(true);
                      return;
                    }
                  } catch { /* fall through to manual flow */ }
                  setShowUpdateModal(true);
                }}
                className="tag g cursor-pointer"
                title="Update available"
              >
                ↑ v{updateInfo.latestVersion}
              </button>
              <button
                onClick={() => copy(updateInfo.installCommand || INSTALL_CMD)}
                title="Copy install command"
                className="chip cursor-pointer hover:border-brand-500/40 min-w-0 max-w-[220px]"
              >
                <code className="block truncate">
                  {copied ? "✓ copied!" : (updateInfo.installCommand || INSTALL_CMD)}
                </code>
              </button>
            </>
          )}
          <HeaderSearch />
          <button
            type="button"
            onClick={() => setDonateOpen(true)}
            className="tbtn"
            aria-label="Donate Me :3"
            title="Donate"
          >
            ♥
          </button>
          <HeaderLanguage />
          <ThemeToggle />
          <HeaderMenu onLogout={handleLogout} />
        </div>
      </div>

      {/* Control Room v3 tabrow — tabs scroll in their own container so the
          SYSTEM dropdown is never clipped by overflow-x */}
      <div className="cr-tabrow relative z-20">
        <div className="cr-tabs-scroll">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn("cr-tab", isActive(item.href) && "active")}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* System dropdown */}
        <div className="cr-sys-wrap" data-sys-menu>
          <button
            onClick={() => setSysOpen((v) => !v)}
            className={cn("cr-tab", (sysOpen || sysActive) && "active")}
          >
            System ▾
          </button>

          {sysOpen && (
            <div className="cr-sys-menu">
              <div className="cr-sys-label">Media Providers</div>
              {MEDIA_PROVIDER_KINDS.filter((k) => VISIBLE_MEDIA_KINDS.includes(k.id)).map((kind) => (
                <Link
                  key={kind.id}
                  href={`/dashboard/media-providers/${kind.id}`}
                  onClick={() => setSysOpen(false)}
                  className="cr-sys-item"
                >
                  <span>{kind.label}</span>
                </Link>
              ))}
              <Link
                href={COMBINED_WEB_ITEM.href}
                onClick={() => setSysOpen(false)}
                className="cr-sys-item"
              >
                <span>{COMBINED_WEB_ITEM.label}</span>
              </Link>

              <div className="cr-sys-label">System</div>
              {systemItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSysOpen(false)}
                  className="cr-sys-item"
                >
                  <span>{item.label}</span>
                </Link>
              ))}
              {debugItems.map((item) => {
                const show = item.href !== "/dashboard/translator" || enableTranslator;
                return show ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSysOpen(false)}
                    className="cr-sys-item"
                  >
                    <span>{item.label}</span>
                  </Link>
                ) : null;
              })}
              <button
                onClick={() => { setShowRemoteModal(true); setSysOpen(false); }}
                className="cr-sys-item"
              >
                <span>Remote</span>
              </button>
              <Link
                href="/dashboard/profile"
                onClick={() => setSysOpen(false)}
                className="cr-sys-item"
              >
                <span>Settings</span>
              </Link>

              <div className="cr-sys-label">Hidden routes</div>
              <Link href="/dashboard/pxpipe" onClick={() => setSysOpen(false)} className="cr-sys-item hid">
                <span>PXPipe</span><span className="k">off-nav</span>
              </Link>
              <Link href="/dashboard/mitm" onClick={() => setSysOpen(false)} className="cr-sys-item hid">
                <span>MITM</span><span className="k">off-nav</span>
              </Link>
              <Link href="/dashboard/basic-chat" onClick={() => setSysOpen(false)} className="cr-sys-item hid">
                <span>Basic Chat</span><span className="k">off-nav</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      <NineRemotePromoModal isOpen={showRemoteModal} onClose={() => setShowRemoteModal(false)} />
      <DonateModal isOpen={donateOpen} onClose={() => setDonateOpen(false)} />
      <UpdateModal
        isOpen={showUpdateNowModal}
        onClose={() => setShowUpdateNowModal(false)}
        latestVersion={updateInfo?.latestVersion}
      />

      <ConfirmModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onConfirm={handleUpdate}
        title="Update Mayday"
        message={`Show install command for v${updateInfo?.latestVersion || ""}? You can copy it and shutdown to install manually.`}
        confirmText="Show Command"
        cancelText="Cancel"
        variant="primary"
      />

      {(isDisconnected || isUpdating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          {isUpdating ? (
            <ManualUpdatePanel
              latestVersion={updateInfo?.latestVersion}
              installCmd={INSTALL_CMD}
              copied={copied}
              onCopyAndShutdown={handleCopyAndShutdown}
              onCancel={handleCancelUpdate}
              countdown={shutdownCountdown}
              isDisconnected={isDisconnected}
            />
          ) : (
            <div className="text-center p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4">
                <span className="material-symbols-outlined text-[32px]">power_off</span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Server Disconnected</h2>
              <p className="text-text-muted mb-6">The proxy server has been stopped.</p>
              <Button variant="secondary" onClick={() => globalThis.location.reload()}>
                Reload Page
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ManualUpdatePanel({ latestVersion, installCmd, copied, onCopyAndShutdown, onCancel, countdown, isDisconnected }) {
  const isCountingDown = countdown > 0;
  return (
    <div className="w-full max-w-lg rounded-xl bg-neutral-900/95 border border-white/10 p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center size-11 rounded-full bg-amber-500/20 text-amber-400">
          <span className="material-symbols-outlined text-[24px]">content_copy</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Update Mayday{latestVersion ? ` to v${latestVersion}` : ""}</h2>
          <p className="text-xs text-white/60">
            {isDisconnected
              ? "Server stopped. Paste the command into a terminal to install."
              : isCountingDown
                ? `Command copied. Server will stop in ${countdown}s...`
                : "Click the button below to copy the install command and shutdown."}
          </p>
        </div>
      </div>

      <p className="text-sm text-white/80 mb-2">Install command:</p>
      <div className="w-full px-3 py-2 rounded bg-white/5 mb-4">
        <code className="text-xs font-mono text-amber-400 break-all">{installCmd}</code>
      </div>

      <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside mb-4">
        <li>Click <strong>Copy & Shutdown</strong> below.</li>
        <li>Paste the command into your terminal and press Enter.</li>
        <li>Run <code className="px-1 rounded bg-white/10 text-green-400">mayday</code> again after install.</li>
      </ol>

      {isDisconnected ? (
        <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
          Reload Page
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isCountingDown}>
            Cancel
          </Button>
          <Button variant="primary" fullWidth onClick={onCopyAndShutdown} disabled={isCountingDown}>
            {copied ? "✓ Copied — shutting down..." : isCountingDown ? `Shutting down in ${countdown}s` : "Copy & Shutdown"}
          </Button>
        </div>
      )}
    </div>
  );
}