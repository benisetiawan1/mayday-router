"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/shared/hooks/useTheme";
import ChangelogModal from "./ChangelogModal";
import { ConfirmModal } from "./Modal";

function MenuItem({ label, onClick, trailing, danger }) {
  return (
    <button type="button"
      onClick={onClick}
      className={`cr-sys-item ${danger ? "!text-[var(--color-danger)]" : ""}`}
    >
      <span>{label}</span>
      {trailing && <span className="k">{trailing}</span>}
    </button>
  );
}

export default function HeaderMenu({ onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const { toggleTheme, isDark } = useTheme();
  const menuRef = useRef(null);

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/version/shutdown", { method: "POST" });
    } catch (e) {
      // Expected to fail as server shuts down; ignore error
    }
    setIsShuttingDown(false);
    setShutdownOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="tbtn"
          title="Menu"
        >
          <span className="font-semibold text-[12px]">A</span>
        </button>

        {isOpen && (
          <div className="cr-sys-menu absolute right-0 top-full mt-1 z-50">
            <MenuItem
              label="Change Log"
              onClick={() => { close(); setChangelogOpen(true); }}
            />
            <MenuItem
              label="Theme"
              trailing={isDark ? "dark" : "light"}
              onClick={() => { toggleTheme(); close(); }}
            />
            <MenuItem
              label="Shutdown"
              danger
              onClick={() => { close(); setShutdownOpen(true); }}
            />
            <MenuItem
              label="Logout"
              danger
              onClick={() => { close(); onLogout(); }}
            />
          </div>
        )}
      </div>

      <ChangelogModal isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <ConfirmModal
        isOpen={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
        onConfirm={handleShutdown}
        title="Close Proxy"
        message="Are you sure you want to close the proxy server?"
        confirmText="Close"
        cancelText="Cancel"
        variant="danger"
        loading={isShuttingDown}
      />
    </>
  );
}

