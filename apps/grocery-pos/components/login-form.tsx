"use client";

import { FormEvent, useState } from "react";

type LoginError = {
  error?: string;
  message?: string;
};

export function LoginForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        workspace: form.get("workspace"),
        email: form.get("email"),
        password: form.get("password")
      })
    });

    if (response.ok) {
      window.location.assign("/dashboard");
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as LoginError;
    setError(payload.message ?? "Sign-in could not be completed.");
    setSubmitting(false);
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="workspace">Workspace</label>
        <input
          id="workspace"
          name="workspace"
          autoComplete="organization"
          required
          minLength={2}
          maxLength={80}
          placeholder="green-basket-demo"
        />
      </div>
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          placeholder="owner@example.com"
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          maxLength={200}
        />
      </div>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <button className="button button-primary" type="submit" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in securely"}
      </button>
    </form>
  );
}
