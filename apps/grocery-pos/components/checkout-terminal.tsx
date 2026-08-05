"use client";

import Decimal from "decimal.js";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Organization = {
  business: { name: string; currencyCode: string };
  branches: Array<{ id: string; code: string; name: string }>;
  warehouses: Array<{ id: string; branchId: string; code: string; name: string }>;
  registers: Array<{ id: string; branchId: string; warehouseId: string | null; code: string; name: string }>;
  currentShifts: Array<{ id: string; branchId: string; registerId: string; status: string; openedAt: string }>;
};

type Product = {
  id: string;
  sku: string;
  plu: string | null;
  name: string;
  type: "STANDARD" | "WEIGHTED" | "SERVICE";
  retailPrice: string;
  baseUnit: { symbol: string; decimalScale: number };
  barcodes: Array<{ barcode: string; isPrimary: boolean }>;
};

type Customer = {
  id: string;
  code: string;
  name: string;
  creditEnabled: boolean;
  creditLimit: string;
  creditHold: boolean;
};

type PaymentAccount = {
  id: string;
  code: string;
  name: string;
  methodType: string;
  currencyCode: string;
};

type CartLine = {
  key: string;
  product: Product;
  quantity: string;
  discountAmount: string;
};

type PaymentDraft = {
  key: string;
  accountId: string;
  amount: string;
  reference: string;
  chequeNumber: string;
  bankName: string;
  chequeDate: string;
  dueDate: string;
};

function decimal(value: string): Decimal {
  try { return new Decimal(value || "0"); } catch { return new Decimal(0); }
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CheckoutTerminal() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [openingCash, setOpeningCash] = useState("0.00");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/grocery/organization", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load workspace")))
      .then((payload) => {
        const data = payload.data as Organization;
        setOrganization(data);
        const branch = data.branches[0];
        if (branch) setBranchId(branch.id);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load workspace"));
  }, []);

  useEffect(() => {
    if (!organization || !branchId) return;
    const warehouse = organization.warehouses.find((item) => item.branchId === branchId);
    const register = organization.registers.find((item) => item.branchId === branchId);
    setWarehouseId(warehouse?.id ?? "");
    setRegisterId(register?.id ?? "");
  }, [organization, branchId]);

  useEffect(() => {
    if (!branchId) return;
    fetch(`/api/grocery/payment-accounts?branchId=${encodeURIComponent(branchId)}`, { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load payment accounts")))
      .then((payload) => setAccounts(payload.data as PaymentAccount[]))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load payment accounts"));
  }, [branchId]);

  const currentShift = organization?.currentShifts.find((shift) => shift.registerId === registerId) ?? null;
  const currency = organization?.business.currencyCode ?? "QAR";
  const grandTotal = useMemo(() => cart.reduce((total, line) => {
    const gross = decimal(line.product.retailPrice).times(decimal(line.quantity));
    return total.plus(gross.minus(decimal(line.discountAmount)));
  }, new Decimal(0)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP), [cart]);
  const allocated = useMemo(() => payments.reduce(
    (total, payment) => total.plus(decimal(payment.amount)),
    new Decimal(0)
  ), [payments]);
  const remaining = grandTotal.minus(allocated);

  async function searchProducts(event?: FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query.trim(), pageSize: "20" });
      if (warehouseId) params.set("warehouseId", warehouseId);
      const response = await fetch(`/api/grocery/products/search?${params}`, { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Product search failed");
      const rows = payload.data as Product[];
      setProducts(rows);
      if (rows.length === 1) addProduct(rows[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Product search failed");
    } finally {
      setSearching(false);
      searchRef.current?.focus();
    }
  }

  function addProduct(product: Product) {
    setCart((current) => {
      if (product.type !== "WEIGHTED") {
        const existing = current.find((line) => line.product.id === product.id);
        if (existing) {
          return current.map((line) => line.key === existing.key
            ? { ...line, quantity: decimal(line.quantity).plus(1).toFixed(0) }
            : line);
        }
      }
      return [...current, {
        key: crypto.randomUUID(),
        product,
        quantity: product.type === "WEIGHTED" ? "0.000" : "1",
        discountAmount: "0.00"
      }];
    });
    setQuery("");
    setProducts([]);
    searchRef.current?.focus();
  }

  async function searchCustomers() {
    if (!customerQuery.trim()) return;
    const response = await fetch(`/api/grocery/customers?q=${encodeURIComponent(customerQuery.trim())}&pageSize=10`, {
      credentials: "same-origin"
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Customer search failed");
      return;
    }
    setCustomers(payload.data as Customer[]);
  }

  async function openShift() {
    if (!branchId || !registerId) return;
    setError(null);
    const response = await fetch("/api/grocery/shifts/open", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, registerId, openingCash })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Shift could not be opened");
      return;
    }
    setOrganization((current) => current ? {
      ...current,
      currentShifts: [...current.currentShifts, {
        id: payload.data.id,
        branchId,
        registerId,
        status: payload.data.status,
        openedAt: payload.data.openedAt
      }]
    } : current);
    setMessage("Register shift opened.");
  }

  function addPaymentDraft() {
    setPayments((current) => [...current, {
      key: crypto.randomUUID(),
      accountId: accounts[0]?.id ?? "",
      amount: remaining.isPositive() ? remaining.toFixed(2) : "0.00",
      reference: "",
      chequeNumber: "",
      bankName: "",
      chequeDate: todayDate(),
      dueDate: todayDate()
    }]);
  }

  async function completeCheckout() {
    setError(null);
    setMessage(null);
    if (!currentShift) return setError("Open a cashier shift before completing a sale.");
    if (!branchId || !warehouseId || !registerId) return setError("Select branch, warehouse and register.");
    if (!cart.length) return setError("Add at least one grocery item.");
    if (cart.some((line) => !decimal(line.quantity).isPositive())) return setError("Every item needs a positive quantity or weight.");
    if (remaining.isNegative()) return setError("Payment components exceed the cart total.");

    const paymentPayload = payments.filter((payment) => decimal(payment.amount).isPositive()).map((payment) => {
      const account = accounts.find((item) => item.id === payment.accountId);
      if (!account) throw new Error("Choose a valid payment account.");
      return {
        accountId: account.id,
        methodType: account.methodType,
        amount: decimal(payment.amount).toFixed(4),
        reference: payment.reference || null,
        cheque: account.methodType === "CHEQUE" ? {
          chequeNumber: payment.chequeNumber,
          bankName: payment.bankName,
          chequeDate: new Date(`${payment.chequeDate}T00:00:00.000Z`).toISOString(),
          dueDate: new Date(`${payment.dueDate}T00:00:00.000Z`).toISOString()
        } : null
      };
    });

    setSubmitting(true);
    try {
      const response = await fetch("/api/grocery/sales/complete", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          branchId,
          warehouseId,
          registerId,
          customerId: customer?.id ?? null,
          dueAt: dueAt ? new Date(`${dueAt}T23:59:59.000Z`).toISOString() : null,
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: decimal(line.quantity).toFixed(4),
            discountAmount: decimal(line.discountAmount).toFixed(4)
          })),
          payments: paymentPayload
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Checkout failed");
      setMessage(`Invoice ${payload.data.invoiceNumber} completed. Posted: ${payload.data.paidTotal} ${currency}; pending cheque: ${payload.data.pendingChequeTotal} ${currency}.`);
      setCart([]);
      setPayments([]);
      setCustomer(null);
      setDueAt("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout failed");
    } finally {
      setSubmitting(false);
      searchRef.current?.focus();
    }
  }

  return (
    <div className="terminal-grid">
      <section className="terminal-catalog" aria-label="Product search and results">
        <div className="terminal-context">
          <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            {organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>
          <label>Warehouse<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            {organization?.warehouses.filter((warehouse) => warehouse.branchId === branchId).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </select></label>
          <label>Register<select value={registerId} onChange={(event) => setRegisterId(event.target.value)}>
            {organization?.registers.filter((register) => register.branchId === branchId).map((register) => (
              <option key={register.id} value={register.id}>{register.name}</option>
            ))}
          </select></label>
        </div>

        {!currentShift ? <div className="terminal-alert">
          <strong>Register shift required</strong>
          <input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="decimal" aria-label="Opening cash" />
          <button className="button button-primary" type="button" onClick={openShift}>Open shift</button>
        </div> : <div className="terminal-ready">Shift open since {new Date(currentShift.openedAt).toLocaleTimeString()}</div>}

        <form className="scan-form" onSubmit={searchProducts}>
          <label htmlFor="product-search">Scan barcode or search SKU, PLU or product</label>
          <div><input ref={searchRef} id="product-search" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus autoComplete="off" />
          <button className="button button-primary" type="submit" disabled={searching}>{searching ? "Searching…" : "Find"}</button></div>
        </form>

        <div className="search-results">
          {products.map((product) => <button type="button" key={product.id} className="product-result" onClick={() => addProduct(product)}>
            <span><strong>{product.name}</strong><small>{product.sku}{product.plu ? ` · PLU ${product.plu}` : ""}</small></span>
            <span>{product.retailPrice} {currency}/{product.baseUnit.symbol}</span>
          </button>)}
        </div>

        <div className="customer-picker">
          <label htmlFor="customer-search">Customer for credit or cheque sale</label>
          <div><input id="customer-search" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} />
          <button className="button button-secondary" type="button" onClick={searchCustomers}>Search</button></div>
          {customer ? <p><strong>{customer.name}</strong> selected · limit {customer.creditLimit} {currency}</p> : null}
          <div className="customer-results">{customers.map((row) => <button type="button" key={row.id} onClick={() => { setCustomer(row); setCustomers([]); }}>{row.name} · {row.code}</button>)}</div>
        </div>
      </section>

      <section className="terminal-cart" aria-label="Current grocery cart">
        <header><div><span className="eyebrow">Current cart</span><h1>{cart.length} lines</h1></div><strong>{grandTotal.toFixed(2)} {currency}</strong></header>
        <div className="cart-lines">
          {cart.map((line) => <article className="cart-line" key={line.key}>
            <div><strong>{line.product.name}</strong><small>{line.product.sku} · {line.product.type === "WEIGHTED" ? "weighted" : "unit item"}</small></div>
            <label>Qty/weight<input value={line.quantity} inputMode="decimal" onChange={(event) => setCart((current) => current.map((item) => item.key === line.key ? { ...item, quantity: event.target.value } : item))} /></label>
            <label>Discount<input value={line.discountAmount} inputMode="decimal" onChange={(event) => setCart((current) => current.map((item) => item.key === line.key ? { ...item, discountAmount: event.target.value } : item))} /></label>
            <span>{decimal(line.product.retailPrice).times(decimal(line.quantity)).minus(decimal(line.discountAmount)).toFixed(2)} {currency}</span>
            <button type="button" aria-label={`Remove ${line.product.name}`} onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}>×</button>
          </article>)}
          {!cart.length ? <div className="empty-cart">Scan an item to begin. Weighted lines require an entered weight before completion.</div> : null}
        </div>

        <div className="payment-drafts">
          <div className="payment-heading"><h2>Payment components</h2><button className="button button-secondary" type="button" onClick={addPaymentDraft}>Add payment</button></div>
          {payments.map((payment) => {
            const account = accounts.find((item) => item.id === payment.accountId);
            return <article className="payment-draft" key={payment.key}>
              <select value={payment.accountId} onChange={(event) => setPayments((current) => current.map((item) => item.key === payment.key ? { ...item, accountId: event.target.value } : item))}>
                <option value="">Select payment account</option>
                {accounts.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.methodType.replaceAll("_", " ")}</option>)}
              </select>
              <input value={payment.amount} inputMode="decimal" aria-label="Payment amount" onChange={(event) => setPayments((current) => current.map((item) => item.key === payment.key ? { ...item, amount: event.target.value } : item))} />
              <input value={payment.reference} placeholder="Reference" onChange={(event) => setPayments((current) => current.map((item) => item.key === payment.key ? { ...item, reference: event.target.value } : item))} />
              {account?.methodType === "CHEQUE" ? <div className="cheque-fields">
                <input value={payment.chequeNumber} placeholder="Cheque number" onChange={(event) => setPayments((current) => current.map((item) => item.key === payment.key ? { ...item, chequeNumber: event.target.value } : item))} />
                <input value={payment.bankName} placeholder="Bank" onChange={(event) => setPayments((current) => current.map((item) => item.key === payment.key ? { ...item, bankName: event.target.value } : item))} />
                <label>Cheque date<input type="date" value={payment.chequeDate} onChange={(event) => setPayments((current) => current.map((item) => item.key === payment.key ? { ...item, chequeDate: event.target.value } : item))} /></label>
                <label>Due date<input type="date" value={payment.dueDate} onChange={(event) => setPayments((current) => current.map((item) => item.key === payment.key ? { ...item, dueDate: event.target.value } : item))} /></label>
              </div> : null}
              <button type="button" onClick={() => setPayments((current) => current.filter((item) => item.key !== payment.key))}>Remove</button>
            </article>;
          })}
          <label className="due-field">Credit due date<input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
          <div className="payment-summary"><span>Allocated {allocated.toFixed(2)} {currency}</span><strong>Remaining {remaining.toFixed(2)} {currency}</strong></div>
        </div>

        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {message ? <div className="terminal-success" role="status">{message}</div> : null}
        <button className="complete-sale" type="button" onClick={completeCheckout} disabled={submitting || !cart.length}>{submitting ? "Posting transaction…" : "Complete sale"}</button>
      </section>
    </div>
  );
}
