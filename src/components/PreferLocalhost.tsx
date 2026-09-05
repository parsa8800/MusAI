"use client";

import { useEffect } from "react";

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}

/** Dev-only: LAN IPs are not a secure context, so getUserMedia is blocked. */
export function PreferLocalhost() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const { hostname, port, pathname, search, hash } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return;
    if (!isPrivateIpv4(hostname)) return;
    const destPort = port || "3000";
    window.location.replace(
      `http://127.0.0.1:${destPort}${pathname}${search}${hash}`,
    );
  }, []);
  return null;
}
