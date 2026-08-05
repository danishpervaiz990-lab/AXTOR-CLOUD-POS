"use client";

import { FormEvent, useEffect, useState } from "react";

type Branch = { id: string; name: string };
type Account = { id: string; name: string; methodType: string };
type Party = { id: string; code: string; name: string };
type ChequeRow = {
  id: string;
  direction: "INWARD" | "OUTWARD";
  status: string;
  chequeNumber: string;
  bankName: string;
  drawerOrIssuer: string | null;
  payeeOrBeneficiary: string | null;
  amount: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  currencyCode: string;
  dueDate: string;
  daysUntilDue: number;
  customer: Party | null;
  supplier: Party | null;
};

type Report = {
  totals: {
    inward: string;
    outward: string;
    netDirection: string;
    dueWithin30Days: string;
    overdue: string;
    cleared: string;
    bounced: string;
    chequeCount: number;
  };
  tally: Array<{ direction: string; status: string; amount: string; count: number }>;
  rows: ChequeRow[];
};

const transitions: Record<string, Array<{ label: string; value: string }>> = {
  RECEIVED: [{ label: "Deposit", value: "DEPOSITED" }, { label: "Return", value: "RETURNED" }, { label: "Cancel", value: "CANCELLED" }],
  ISSUED: [{ label: "Submit", value: "SUBMITTED_FOR_CLEARING" }, { label: "Stop", value: "STOPPED" }, { label: "Cancel", value: "CANCELLED" }],
  POST_DATED: [{ label: "Due today", value: "DUE_TODAY" }, { label: "Deposit", value: "DEPOSITED" }, { label: "Submit", value: "SUBMITTED_FOR_CLEARING" }, { label: "Cancel", value: "CANCELLED" }],
  DUE_TODAY: [{ label: "Deposit", value: "DEPOSITED" }, { label: "Submit", value: "SUBMITTED_FOR_CLEARING" }, { label: "Cancel", value: "CANCELLED" }],
  DEPOSITED: [{ label: "Clear", value: "CLEARED" }, { label: "Bounce", value: "BOUNCED" }, { label: "Return", value: "RETURNED" }],
  SUBMITTED_FOR_CLEARING: [{ label: "Clear", value: "CLEARED" }, { label: "Bounce", value: "BOUNCED" }, { label: "Return", value: "RETURNED" }, { label: "Stop", value: "STOPPED" }],
  BOUNCED: [{ label: "Replace", value: "REPLACED" }, { label: "Return", value: "RETURNED" }],
  RETURNED: [{ label: "Replace", value: "REPLACED" }],
  STOPPED: [{ label: "Return", value: "RETURNED" }, { label: "Replace", value: "REPLACED" }]
};

function isoDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function ChequeWorkspace({ canCreateInward, canCreateOutward }: { canCreateInward: boolean; canCreateOutward: boolean }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [direction, setDirection] = useState<"INWARD" | "OUTWARD">(canCreateInward ? "INWARD" : "OUTWARD");
  const [branchId, setBranchId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [parties, setParties] = useState<Party[]>([]);
  const [party, setParty] = useState<Party | null>(null);
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterDirection, setFilterDirection] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/grocery/organization", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load organization")))
      .then((payload) => {
        const rows = payload.data.branches as Branch[];
        setBranches(rows);
        if (rows[0]) setBranchId(rows[0].id);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load organization"));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    fetch(`/api/grocery/payment-accounts?branchId=${encodeURIComponent(branchId)}&methodTypes=CHEQUE`, { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load cheque accounts")))
      .then((payload) => {
        const rows = payload.data as Account[];
        setAccounts(rows);
        setAccountId(rows[0]?.id ?? "");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load cheque accounts"));
  }, [branchId]);

  useEffect(() => { void loadReport(); }, [filterDirection, filterStatus]);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "500" });
      if (filterDirection) params.set("direction", filterDirection);
      if (filterStatus) params.set("statuses", filterStatus);
      const response = await fetch(`/api/grocery/reports/cheques?${params}`, { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Cheque report failed");
      setReport(payload.data as Report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cheque report failed");
    } finally {
      setLoading(false);
    }
  }

  async function searchParties() {
    if (!partyQuery.trim()) return;
    const endpoint = direction === "INWARD" ? "customers" : "suppliers";
    const response = await fetch(`/api/grocery/${endpoint}?q=${encodeURIComponent(partyQuery.trim())}&pageSize=10`, { credentials: "same-origin" });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Party search failed");
    setParties(payload.data as Party[]);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const response = await fetch("/api/grocery/cheques", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        direction,
        branchId: branchId || null,
        paymentAccountId: accountId,
        customerId: direction === "INWARD" ? party?.id ?? null : null,
        supplierId: direction === "OUTWARD" ? party?.id ?? null : null,
        chequeNumber,
        bankName,
        drawerOrIssuer: direction === "INWARD" ? counterparty || null : null,
        payeeOrBeneficiary: direction === "OUTWARD" ? counterparty || null : null,
        amount,
        chequeDate: isoDate(chequeDate),
        dueDate: isoDate(dueDate)
      })
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Cheque could not be created");
    setMessage(`${direction === "INWARD" ? "Inward" : "Outward"} cheque ${payload.data.chequeNumber} created as ${payload.data.status}.`);
    setChequeNumber(""); setBankName(""); setCounterparty(""); setAmount(""); setParty(null); setParties([]);
    await loadReport();
  }

  async function transition(cheque: ChequeRow, toStatus: string) {
    const reason = window.prompt(`Reason for ${toStatus.replaceAll("_", " ").toLowerCase()}?`)?.trim();
    if (!reason) return;
    const response = await fetch(`/api/grocery/cheques/${cheque.id}/transition`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus, reason })
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Cheque transition failed");
    setMessage(`Cheque ${cheque.chequeNumber} is now ${payload.data.status}.`);
    await loadReport();
  }

  const canCreate = direction === "INWARD" ? canCreateInward : canCreateOutward;

  return (
    <section className="workspace-content">
      <div className="workspace-title"><div><span className="eyebrow">Post-dated control</span><h1>Cheque tally and clearing</h1></div><p>Recorded cheques remain pending until a permitted user clears them. Due, bounced and replacement history is retained.</p></div>

      <div className="workspace-metrics">
        <article><span>Inward</span><strong>{report?.totals.inward ?? "0.0000"}</strong></article>
        <article><span>Outward</span><strong>{report?.totals.outward ?? "0.0000"}</strong></article>
        <article><span>Due ≤ 30 days</span><strong>{report?.totals.dueWithin30Days ?? "0.0000"}</strong></article>
        <article><span>Overdue</span><strong>{report?.totals.overdue ?? "0.0000"}</strong></article>
      </div>

      <form className="workspace-filters" onSubmit={create}>
        <label>Direction<select value={direction} onChange={(event) => { setDirection(event.target.value as "INWARD" | "OUTWARD"); setParty(null); setParties([]); }}>
          {canCreateInward ? <option value="INWARD">Inward</option> : null}{canCreateOutward ? <option value="OUTWARD">Outward</option> : null}
        </select></label>
        <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Cheque account<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label>Cheque number<input value={chequeNumber} onChange={(event) => setChequeNumber(event.target.value)} required /></label>
        <label>Bank<input value={bankName} onChange={(event) => setBankName(event.target.value)} required /></label>
        <label>{direction === "INWARD" ? "Drawer" : "Beneficiary"}<input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} /></label>
        <label>Amount<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required /></label>
        <label>Cheque date<input type="date" value={chequeDate} onChange={(event) => setChequeDate(event.target.value)} required /></label>
        <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
        <label>{direction === "INWARD" ? "Customer" : "Supplier"}<input value={partyQuery} onChange={(event) => setPartyQuery(event.target.value)} placeholder="Search code or name" /></label>
        <button className="button button-secondary" type="button" onClick={searchParties}>Find party</button>
        <button className="button button-primary" type="submit" disabled={!canCreate || !accountId}>Create cheque</button>
      </form>
      {party ? <div className="terminal-ready">Selected: {party.name} · {party.code}</div> : null}
      <div className="customer-results">{parties.map((row) => <button key={row.id} type="button" onClick={() => { setParty(row); setParties([]); }}>{row.name} · {row.code}</button>)}</div>

      <div className="workspace-filters">
        <label>Report direction<select value={filterDirection} onChange={(event) => setFilterDirection(event.target.value)}><option value="">All</option><option value="INWARD">Inward</option><option value="OUTWARD">Outward</option></select></label>
        <label>Status<select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="">All</option>{["POST_DATED","DUE_TODAY","DEPOSITED","SUBMITTED_FOR_CLEARING","CLEARED","BOUNCED","RETURNED","CANCELLED","STOPPED","REPLACED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {message ? <div className="terminal-success" role="status">{message}</div> : null}
      {loading ? <div className="workspace-loading">Loading cheque report…</div> : null}
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Cheque</th><th>Party</th><th>Due</th><th>Amount</th><th>Allocation</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {report?.rows.map((row) => <tr key={row.id}><td><strong>{row.chequeNumber}</strong><small>{row.bankName} · {row.direction}</small></td><td>{row.customer?.name ?? row.supplier?.name ?? row.drawerOrIssuer ?? row.payeeOrBeneficiary ?? "—"}</td><td>{new Date(row.dueDate).toLocaleDateString()}<small>{row.daysUntilDue < 0 ? `${Math.abs(row.daysUntilDue)} days overdue` : `${row.daysUntilDue} days`}</small></td><td>{row.amount} {row.currencyCode}</td><td>{row.allocatedAmount} allocated<small>{row.unallocatedAmount} unallocated</small></td><td><span className={row.status === "CLEARED" ? "stock-ok" : row.status === "BOUNCED" ? "stock-low" : "batch-chip"}>{row.status.replaceAll("_", " ")}</span></td><td><div className="row-actions">{(transitions[row.status] ?? []).map((action) => <button className="button button-secondary" type="button" key={action.value} onClick={() => transition(row, action.value)}>{action.label}</button>)}</div></td></tr>)}
        {!loading && !report?.rows.length ? <tr><td colSpan={7}>No cheques matched these filters.</td></tr> : null}
      </tbody></table></div>
    </section>
  );
}
