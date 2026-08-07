import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { sharedBackendRequest } from "@/lib/shared-backend";
import {
  getAuthenticatedSession,
  getSharedBackendCredentials
} from "@/server/auth/session";
import { permissionsForRole } from "@/server/permissions/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function unwrapPayload(value: unknown): UnknownRecord {
  const root = asRecord(value);
  const data = asRecord(root.data);
  return Object.keys(data).length ? data : root;
}

function readPath(root: UnknownRecord, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    const record = asRecord(current);
    if (!(segment in record)) return undefined;
    current = record[segment];
  }
  return current;
}

function firstValue(root: UnknownRecord, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(root, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatMoney(value: unknown, currencyCode: string): string {
  const amount = numeric(value);
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function formatCount(value: unknown, suffix = ""): string {
  const count = numeric(value);
  return count === null ? "—" : `${Math.trunc(count).toLocaleString("en")}${suffix}`;
}

export default async function DashboardPage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/login");

  const credentials = await getSharedBackendCredentials();
  if (!credentials) redirect("/login");

  let mePayload: UnknownRecord = {};
  let dashboardPayload: UnknownRecord = {};

  try {
    const [me, dashboard] = await Promise.all([
      sharedBackendRequest<unknown>("/api/v1/auth/me", {
        token: credentials.token,
        businessId: credentials.businessId
      }),
      sharedBackendRequest<unknown>("/api/v1/dashboard/summary", {
        token: credentials.token,
        businessId: credentials.businessId
      })
    ]);
    mePayload = unwrapPayload(me);
    dashboardPayload = unwrapPayload(dashboard);
  } catch {
    // Authentication has already been verified above. Keep the Grocery shell usable
    // if a non-critical dashboard aggregate is temporarily unavailable.
  }

  const business = asRecord(mePayload.business);
  const businessName = String(
    business.name ?? firstValue(dashboardPayload, ["business.name", "businessName"]) ?? "Grocery Workspace"
  );
  const businessSlug = String(
    business.slug ?? firstValue(dashboardPayload, ["business.slug", "businessSlug"]) ?? session.businessId
  );
  const currency = String(
    business.currency ?? business.currencyCode ?? firstValue(dashboardPayload, ["business.currency", "business.currencyCode", "currency"]) ?? "QAR"
  ).toUpperCase();

  const salesToday = firstValue(dashboardPayload, [
    "salesToday.gross", "salesToday.total", "today.sales", "todaySales", "sales.today", "grossSalesToday"
  ]);
  const receiptsToday = firstValue(dashboardPayload, [
    "receiptsToday.total", "paymentsToday.total", "today.receipts", "todayPayments", "payments.today"
  ]);
  const lowStock = firstValue(dashboardPayload, [
    "inventory.lowStockProducts", "inventory.lowStock", "lowStockProducts", "lowStockCount"
  ]);
  const expiring = firstValue(dashboardPayload, [
    "inventory.expiringBatchesWithin30Days", "inventory.expiring", "expiringBatches", "expiryAlerts"
  ]);
  const chequeExposure = firstValue(dashboardPayload, [
    "cheques.inwardAmount", "cheques.pendingAmount", "chequeExposure", "pendingChequesAmount"
  ]);
  const chequeDue = firstValue(dashboardPayload, [
    "cheques.dueWithin30Days", "cheques.upcoming", "upcomingCheques", "chequesDue"
  ]);
  const openShifts = firstValue(dashboardPayload, [
    "operations.openShifts", "openShifts", "shifts.open", "activeShifts"
  ]);
  const transactionCount = firstValue(dashboardPayload, [
    "salesToday.count", "today.transactions", "transactionsToday", "sales.count"
  ]);

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
          <Link href="/checkout">Checkout</Link>
          <Link href="/inventory">Inventory</Link>
          <Link href="/finance">Finance</Link>
          <Link href="/cheques">Cheques</Link>
        </nav>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">{businessSlug}</span>
            <h1>{businessName}</h1>
            <p>Signed in as {session.displayName} · {session.role.replaceAll("_", " ").toLowerCase()}</p>
          </div>
          <LogoutButton />
        </header>

        <div className="status-grid" aria-label="Live grocery operating summary">
          <article className="status-card">
            <span className="eyebrow">Sales today</span>
            <strong>{formatMoney(salesToday, currency)}</strong>
            <p>{formatCount(transactionCount)} completed transactions from the shared AXTOR backend.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Posted receipts</span>
            <strong>{formatMoney(receiptsToday, currency)}</strong>
            <p>Cash, card, bank and wallet receipts remain separated for reconciliation.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Stock alerts</span>
            <strong>{formatCount(lowStock, " low")}</strong>
            <p>{formatCount(expiring)} batches/items are currently flagged by expiry monitoring.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Cheque exposure</span>
            <strong>{formatMoney(chequeExposure, currency)}</strong>
            <p>{formatCount(chequeDue)} upcoming inward/outward cheque items are due.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Registers</span>
            <strong>{formatCount(openShifts, " open")}</strong>
            <p>Cash transactions remain tied to authenticated Grocery register shifts.</p>
          </article>
          <article className="status-card">
            <span className="eyebrow">Permissions</span>
            <strong>{permissions.length} granted</strong>
            <p>Actions are tenant-scoped and authorized by the shared production backend.</p>
          </article>
        </div>

        <section className="section" aria-labelledby="workspace-modules-heading">
          <div className="section-heading">
            <h2 id="workspace-modules-heading">Grocery operations</h2>
            <p>The replacement Grocery frontend now reads production data only through the existing shared AXTOR backend.</p>
          </div>
          <div className="module-grid">
            <Link className="module-card" href="/checkout"><span>POS</span><h3>Checkout</h3><p>Barcode, PLU, weighted-item and mixed-payment grocery sales.</p></Link>
            <Link className="module-card" href="/inventory"><span>INV</span><h3>Stock and expiry</h3><p>Warehouse balances, batches, receiving, expiry and adjustments.</p></Link>
            <Link className="module-card" href="/finance"><span>PAY</span><h3>Payments</h3><p>Credit, debit, cash, bank, wallet and mixed-payment reconciliation.</p></Link>
            <Link className="module-card" href="/cheques"><span>CHQ</span><h3>Cheques</h3><p>Inward, outward, post-dated, clearing, bounced and upcoming instruments.</p></Link>
            <Link className="module-card" href="/finance"><span>CRM</span><h3>Customers</h3><p>Credit/debit balances, statements, receipts and payment history.</p></Link>
            <Link className="module-card" href="/inventory"><span>PO</span><h3>Purchasing</h3><p>Purchase orders, receiving, batches, stock and supplier balances.</p></Link>
          </div>
        </section>
      </section>
    </main>
  );
}
