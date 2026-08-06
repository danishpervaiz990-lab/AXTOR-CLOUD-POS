import Link from "next/link";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="sign-in-heading">
        <div className="auth-card">
          <Link className="brand" href="/" aria-label="Back to AXTOR Grocery POS Cloud home">
            <span className="brand-mark" aria-hidden="true">AG</span>
            <span className="brand-copy">AXTOR Grocery<small>POS Cloud</small></span>
          </Link>
          <h1 id="sign-in-heading">Enter your grocery workspace.</h1>
          <p>Sessions are secured in an HTTP-only cookie and tenant identity is resolved by the server.</p>
          <LoginForm />
        </div>
      </section>
      <aside className="auth-aside" aria-label="Grocery operations overview">
        <h2>Checkout speed. Stock truth. Money control.</h2>
        <p>
          One grocery-specific workspace for barcode sales, weighted items, expiry, receiving,
          split payments, shift reconciliation and post-dated cheques.
        </p>
      </aside>
    </main>
  );
}
