"use client";

import { useState } from "react";

export function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    }).catch(() => undefined);
    window.location.assign("/login");
  }

  return (
    <button className="button button-secondary" type="button" onClick={logout} disabled={submitting}>
      {submitting ? "Signing out…" : "Sign out"}
    </button>
  );
}
