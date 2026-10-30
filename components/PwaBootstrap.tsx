"use client";

import { useEffect } from "react";

export function PwaBootstrap() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.error("EchoVest service worker registration failed", error);
    });
  }, []);

  return null;
}
