"use client";

import { FormEvent, useEffect, useState } from "react";

type Branch = { id: string; name: string };
type Account = { id: string; name: string; methodType: string; currencyCode: string };
type Reconciliation = {
  totals: {
    postedReceipts: string;
    postedPayments: string;
    netPostedMovement: string;
    pendingChequeReceipts: string;
    reversedAmount: string;
    distinctSales: number;
    paymentComponents: number;
  };
  buckets: Array<{
    methodType: string;
    direction: string;
    status: string;
    amount: string;
    fees: string;
    netAmount: string;
    transactionCount: number;
  }>;
  rows: Array<{
    id: string;
    postedAt: string;
    methodType: string;
    direction: string;
    status: string;
    amount: string;
    feeAmount: string;
    currencyCode: string;
    reference: string | null;
    account: { name: string };
    sale: { invoiceNumber: string } | null;
    cheque: { chequeNumber: string; status: string; dueDate: string } | null;
  }>;
};

function dateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function rangeIso(value: string, end = false): string {
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString();
}

export function FinanceWorkspace({ canPostExpense }: { canPostExpense: boolean }) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [branchId, setBranchId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(dateInput(monthStart));
  const [to, setTo] = useState(dateInput(now));
  const [methodType, setMethodType] = useState("");
  const [includePending, setIncludePending] = useState(true);
  const [report, setReport] = useState<Reconciliation | null>(null);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseTax, setExpenseTax] = useState("0");
  const [expenseDate, setExpenseDate] = useState(dateInput(now));
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
    fetch(`/api/grocery/payment-accounts?branchId=${encodeURIComponent(branchId)}`, { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load payment accounts")))
      .then((payload) => {
        const rows = payload.data as Account[];
        setAccounts(rows);
        const expenseAccount = rows.find((row) => !["CHEQUE", "CUSTOMER_CREDIT"].includes(row.methodType));
        setExpenseAccountId(expenseAccount?.id ?? "");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load payment accounts"));
  }, [branchId]);

  useEffect(() => { void loadReport(); }, [branchId]);

  async function loadReport(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: rangeIso(from),
        to: rangeIso(to, true),
        includePending: String(includePending),
        pageSize: "500"
      });
      if (branchId) params.set("branchId", branchId);
      if (accountId) params.set("accountId", accountId);
      if (methodType) params.set("methodTypes", methodType);
      const response = await fetch(`/api/grocery/reports/payment-reconciliation?${params}`, { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Reconciliation failed");
      setReport(payload.data as Reconciliation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reconciliation failed");
    } finally {
      setLoading(false);
    }
  }

  async function postExpense(event: FormEvent) {
    event.preventDefault();
    const account = accounts.find((row) => row.id === expenseAccountId);
    if (!account) return setError("Choose an expense payment account.");
    setError(null); setMessage(null);
    const response = await fetch("/api/grocery/expenses", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        branchId,
        paymentAccountId: account.id,
        methodType: account.methodType,
        category: expenseCategory,
        description: expenseDescription,
        amount: expenseAmount,
        taxAmount: expenseTax,
        incurredAt: rangeIso(expenseDate)
      })
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Expense posting failed");
    setMessage(`Expense ${payload.data.expenseNumber} posted through ${account.name}.`);
    setExpenseCategory(""); setExpenseDescription(""); setExpenseAmount(""); setExpenseTax("0");
    await loadReport();
  }

  return (
    <section className="workspace-content">
      <div className="workspace-title"><div><span className="eyebrow">Method-separated money</span><h1>Payments and reconciliation</h1></div><p>Credit cards, debit cards, cash, bank transfers, wallets and pending cheques remain separate. Sales are counted once; payment components are reconciled individually.</p></div>

      <form className="workspace-filters" onSubmit={loadReport}>
        <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Method<select value={methodType} onChange={(event) => setMethodType(event.target.value)}><option value="">All methods</option>{["CASH","CREDIT_CARD","DEBIT_CARD","BANK_TRANSFER","MOBILE_WALLET","CHEQUE","VOUCHER","LOYALTY","OTHER"].map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select></label>
        <label>Account<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label className="check-field"><input type="checkbox" checked={includePending} onChange={(event) => setIncludePending(event.target.checked)} /> Include pending</label>
        <button className="button button-primary" type="submit">Run reconciliation</button>
      </form>

      <div className="workspace-metrics">
        <article><span>Posted receipts</span><strong>{report?.totals.postedReceipts ?? "0.0000"}</strong></article>
        <article><span>Posted payments</span><strong>{report?.totals.postedPayments ?? "0.0000"}</strong></article>
        <article><span>Net movement</span><strong>{report?.totals.netPostedMovement ?? "0.0000"}</strong></article>
        <article><span>Pending cheques</span><strong>{report?.totals.pendingChequeReceipts ?? "0.0000"}</strong></article>
      </div>

      {canPostExpense ? <form className="workspace-filters" onSubmit={postExpense}>
        <label>Expense account<select value={expenseAccountId} onChange={(event) => setExpenseAccountId(event.target.value)}>{accounts.filter((row) => !["CHEQUE","CUSTOMER_CREDIT"].includes(row.methodType)).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label>Category<input value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)} required /></label>
        <label>Description<input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} required /></label>
        <label>Amount<input value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} inputMode="decimal" required /></label>
        <label>Tax<input value={expenseTax} onChange={(event) => setExpenseTax(event.target.value)} inputMode="decimal" /></label>
        <label>Date<input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
        <button className="button button-primary" type="submit">Post expense</button>
      </form> : null}

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {message ? <div className="terminal-success" role="status">{message}</div> : null}
      {loading ? <div className="workspace-loading">Calculating reconciliation…</div> : null}

      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Method</th><th>Direction</th><th>Status</th><th>Gross</th><th>Fees</th><th>Net</th><th>Components</th></tr></thead><tbody>
        {report?.buckets.map((bucket) => <tr key={`${bucket.methodType}:${bucket.direction}:${bucket.status}`}><td><strong>{bucket.methodType.replaceAll("_", " ")}</strong></td><td>{bucket.direction}</td><td>{bucket.status}</td><td>{bucket.amount}</td><td>{bucket.fees}</td><td>{bucket.netAmount}</td><td>{bucket.transactionCount}</td></tr>)}
        {!loading && !report?.buckets.length ? <tr><td colSpan={7}>No payment transactions matched this range.</td></tr> : null}
      </tbody></table></div>

      <div className="data-table-wrap" style={{ marginTop: 18 }}><table className="data-table"><thead><tr><th>Posted</th><th>Account</th><th>Method</th><th>Direction</th><th>Amount</th><th>Reference</th><th>Document</th></tr></thead><tbody>
        {report?.rows.map((row) => <tr key={row.id}><td>{new Date(row.postedAt).toLocaleString()}</td><td>{row.account.name}</td><td>{row.methodType.replaceAll("_", " ")}</td><td>{row.direction}</td><td>{row.amount} {row.currencyCode}</td><td>{row.reference ?? "—"}</td><td>{row.sale?.invoiceNumber ?? (row.cheque ? `Cheque ${row.cheque.chequeNumber} · ${row.cheque.status}` : "—")}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}
