import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getDatabase } from "@/lib/db";
import { getAuthenticatedSession } from "@/server/auth/session";
import { getGroceryDashboard } from "@/server/dashboard/get-dashboard";
import { permissionsForRole } from "@/server/permissions/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

function formatMoney(value: string, currencyCode: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value));
}

export default async function DashboardPage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/login");

  const business = await getDatabase().business.findUnique({
    where: { id: session.businessId },
    select: { id: true, name: true, slug: true, currencyCode: true, timezone: true, active: true }
  });
  if (!business?.active) redirect("/login");

  const permissions = permissionsForRole(session.role);
  const dashboard = await getGroceryDashboard({
    businessId: session.businessId,
    userId: session.userId,
    role: session.role
  });
  const currency = dashboard.business.currencyCode;

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
            <p>Signed in as {session.displayName} · {session.role.replaceAll("_", " ").toLowerCase()}</p>
          </div>
          <LogoutButton />
        </header>

        <div className="status-grid" aria-label="Live grocery operating summary">
          <article className="status-card">
            <span className="eyebrow">Sales today</span>
            <strong>{formatMoney(dashboard.salesToday.gross, currency)}</strong>
            <p>{dashboard.salesToday.count} completed transactions · {formatMoney(dashboard.salesToday.outstanding, currency)} outstanding</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Posted receipts</span>
            <strong>{formatMoney(dashboard.receiptsToday.total, currency)}</strong>
            <p>Only posted cash, card, bank and wallet receipts are included; pending cheques are excluded.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Stock alerts</span>
            <strong>{dashboard.inventory.lowStockProducts} low</strong>
            <p>{dashboard.inventory.expiringBatchesWithin30Days} batches expire within 30 days.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Cheque exposure</span>
            <strong>{formatMoney(dashboard.cheques.inwardAmount, currency)}</strong>
            <p>{dashboard.cheques.dueWithin30Days} due within 30 days · {dashboard.cheques.overdueCount} overdue.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Registers</span>
            <strong>{dashboard.operations.openShifts} open</strong>
            <p>Cash transactions require an authenticated open shift on the selected register.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Permissions</span>
            <strong>{permissions.length} granted</strong>
            <p>All figures and actions are tenant-scoped and backend-authorized for this role.</p>
          </article>
        </div>

        <section className="section" aria-labelledby="workspace-modules-heading">
          <div className="section-heading">
            <h2 id="workspace-modules-heading">Grocery operations</h2>
            <p>Live totals are derived from the Grocery database. Pending instruments and draft documents are not reported as cleared money.</p>
          </div>
          <div className="module-grid">
            <article className="module-card"><span>POS</span><h3>Checkout</h3><p>Barcode, PLU, weighted-item and idempotent mixed-payment posting.</p></article>
            <article className="module-card"><span>INV</span><h3>Stock and expiry</h3><p>Warehouse balance, batches, FEFO-ready expiry data, receiving and adjustments.</p></article>
            <article className="module-card"><span>PAY</span><h3>Payments</h3><p>Credit card, debit card, cash, bank and wallet reconciliation remain separate.</p></article>
            <article className="module-card"><span>CHQ</span><h3>Cheques</h3><p>Inward, outward, post-dated, clearing, bounce, replacement and reminders.</p></article>
            <article className="module-card"><span>CRM</span><h3>Customers</h3><p>Credit limits, debit-credit statements, balances and payment history.</p></article>
            <article className="module-card"><span>PO</span><h3>Purchasing</h3><p>Draft orders, approvals, partial receipts, batches and supplier payables.</p></article>
          </div>
        </section>
      </section>
    </main>
  );
}
