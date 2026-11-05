"use client";

import { useEffect } from "react";
import { isStandalonePwa, savePendingReferral } from "../lib/referral-install";

/** Keep older shared invite URLs working while new links go straight to signup. */
export function ReferralEntryRouter() {
  useEffect(() => {
    const incomingCode = new URLSearchParams(window.location.search).get("ref");
    if (!incomingCode) return;
    const code = savePendingReferral(incomingCode);
    if (!code) return;

    if (isStandalonePwa()) {
      window.location.replace(`/sign-up?ref=${encodeURIComponent(code)}`);
      return;
    }

    window.requestAnimationFrame(() => document.getElementById("download")?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  return null;
}
