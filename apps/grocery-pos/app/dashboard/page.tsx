import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getDatabase } from "@/lib/db";
import { getAuthenticatedSession } from "@/server/auth/session";
import { permissionsForRole } from "@/server/permissions/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getAuthenticatedSession();
  if (!session) {
    redirect("/login");
  }

  const business = await getDatabase().business.findUnique({
    where: { id: session.businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      currencyCode: true,
      timezone: true,
      active: true
    }
  });

  if (!business?.active) {
    redirect("/login");
  }

  const permissions = permissionsForRole(session.role);

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-nav">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">AG</span>
          <span className="brand-copy">AXTOR Grocery<small>POS Cloud</small></span>
        </Link>
        <nav aria-label="Grocery workspace navigation">
          <Link href="/dashboard" aria-current="page">Dashboard</Link>
        </nav>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">{business.slug}</span>
            <h1>{business.name}</h1>
            <p>
              Signed in as {session.displayName} · {session.role.replaceAll("_", " ").toLowerCase()}
            </p>
          </div>
          <LogoutButton />
        </header>

        <div className="status-grid" aria-label="Workspace security and data status">
          <article className="status-card">
            <span className="eyebrow">Tenant</span>
            <strong>Server resolved</strong>
            <p>The business context came from the verified session, not from a browser-supplied ID.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Permissions</span>
            <strong>{permissions.length} granted</strong>
            <p>Every write remains subject to backend permission checks for the current role.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Accounting</span>
            <strong>{business.currencyCode}</strong>
            <p>Financial records use Decimal storage and the workspace timezone is {business.timezone}.</p>
          </article>
        </div>

        <section className="section" aria-labelledby="workspace-modules-heading">
          <div className="section-heading">
            <h2 id="workspace-modules-heading">Grocery operations</h2>
            <p>
              Checkout, inventory, purchasing, customers, payments and cheques will appear here only as
              their authenticated APIs and permission tests pass. No placeholder totals are displayed.
            </p>
          </div>
          <div className="module-grid">
            <article className="module-card"><span>POS</span><h3>Checkout</h3><p>Barcode, PLU, weighted-item and mixed-payment workflow.</p></article>
            <article className="module-card"><span>INV</span><h3>Stock and expiry</h3><p>Warehouse balance, batches, FEFO, receiving, counts and wastage.</p></article>
            <article className="module-card"><span>PAY</span><h3>Payments</h3><p>Method-separated receipts, payments, reversals and reconciliation.</p></article>
            <article className="module-card"><span>CHQ</span><h3>Cheques</h3><p>Inward, outward, post-dated, clearing, bounce and reminder controls.</p></article>
            <article className="module-card"><span>CRM</span><h3>Customers</h3><p>Credit limits, statements, balances, aging and loyalty history.</p></article>
            <article className="module-card"><span>PO</span><h3>Purchasing</h3><p>Orders, approvals, partial receiving, batches and supplier ledgers.</p></article>
          </div>
        </section>
      </section>
    </main>
  );
}
