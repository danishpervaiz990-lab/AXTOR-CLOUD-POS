"use client";

import { FormEvent, useEffect, useState } from "react";

type Warehouse = { id: string; branchId: string; code: string; name: string };
type InventoryRow = {
  id: string;
  sku: string;
  plu: string | null;
  name: string;
  type: string;
  baseUnit: { symbol: string };
  minimumStock: string;
  reorderQuantity: string;
  quantity: string;
  reserved: string;
  available: string;
  lowStock: boolean;
  batches: Array<{
    id: string;
    batchNumber: string;
    expiryDate: string | null;
    remainingQuantity: string;
    status: string;
  }>;
};

type InventoryPayload = {
  totals: {
    products: number;
    lowStockProducts: number;
    expiringBatches: number;
    quantity: string;
    available: string;
  };
  rows: InventoryRow[];
};

export function InventoryWorkspace({ canAdjust }: { canAdjust: boolean }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [expiryDays, setExpiryDays] = useState("30");
  const [data, setData] = useState<InventoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [adjustment, setAdjustment] = useState("0");
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch("/api/grocery/organization", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load warehouses")))
      .then((payload) => {
        const rows = payload.data.warehouses as Warehouse[];
        setWarehouses(rows);
        if (rows[0]) setWarehouseId(rows[0].id);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load warehouses"));
  }, []);

  useEffect(() => {
    if (warehouseId) void loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, lowStockOnly, expiryDays]);

  async function loadInventory(event?: FormEvent) {
    event?.preventDefault();
    if (!warehouseId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        warehouseId,
        pageSize: "250",
        lowStockOnly: String(lowStockOnly)
      });
      if (search.trim()) params.set("search", search.trim());
      if (expiryDays) params.set("expiringWithinDays", expiryDays);
      const response = await fetch(`/api/grocery/inventory?${params}`, { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Inventory could not be loaded");
      setData(payload.data as InventoryPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inventory could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  async function submitAdjustment() {
    if (!adjusting || !warehouseId) return;
    const warehouse = warehouses.find((item) => item.id === warehouseId);
    if (!warehouse) return;
    setError(null);
    const response = await fetch("/api/grocery/inventory/adjustments", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({
        branchId: warehouse.branchId,
        warehouseId,
        productId: adjusting.id,
        quantityDelta: adjustment,
        reason
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Stock adjustment failed");
      return;
    }
    setAdjusting(null);
    setAdjustment("0");
    setReason("");
    await loadInventory();
  }

  return (
    <section className="workspace-content">
      <div className="workspace-title">
        <div><span className="eyebrow">Warehouse truth</span><h1>Inventory, batches and expiry</h1></div>
        <p>Quantities are tenant-scoped and returned from immutable stock movements. No browser-only stock edits are used.</p>
      </div>

      <form className="workspace-filters" onSubmit={loadInventory}>
        <label>Warehouse<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
        </select></label>
        <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SKU, barcode, PLU or product" /></label>
        <label>Expiry window<select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}>
          <option value="7">7 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="">All batches</option>
        </select></label>
        <label className="check-field"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} /> Low stock only</label>
        <button className="button button-primary" type="submit">Apply filters</button>
      </form>

      {data ? <div className="workspace-metrics">
        <article><span>Products</span><strong>{data.totals.products}</strong></article>
        <article><span>Low stock</span><strong>{data.totals.lowStockProducts}</strong></article>
        <article><span>Expiring batches</span><strong>{data.totals.expiringBatches}</strong></article>
        <article><span>Available quantity</span><strong>{data.totals.available}</strong></article>
      </div> : null}

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {loading ? <div className="workspace-loading">Loading inventory…</div> : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>Product</th><th>Available</th><th>Minimum</th><th>Reorder</th><th>Batch / expiry</th>{canAdjust ? <th>Action</th> : null}</tr></thead>
          <tbody>
            {data?.rows.map((row) => <tr key={row.id}>
              <td><strong>{row.name}</strong><small>{row.sku}{row.plu ? ` · PLU ${row.plu}` : ""}</small></td>
              <td><span className={row.lowStock ? "stock-low" : "stock-ok"}>{row.available} {row.baseUnit.symbol}</span></td>
              <td>{row.minimumStock}</td>
              <td>{row.reorderQuantity}</td>
              <td>{row.batches.length ? row.batches.map((batch) => <div className="batch-chip" key={batch.id}>
                <strong>{batch.batchNumber}</strong> · {batch.remainingQuantity} · {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : "no expiry"}
              </div>) : <span className="muted">No tracked batch</span>}</td>
              {canAdjust ? <td><button className="button button-secondary" type="button" onClick={() => setAdjusting(row)}>Adjust</button></td> : null}
            </tr>)}
            {!loading && !data?.rows.length ? <tr><td colSpan={canAdjust ? 6 : 5}>No inventory matched these filters.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {adjusting ? <div className="modal-backdrop" role="presentation">
        <div className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="adjust-heading">
          <h2 id="adjust-heading">Adjust {adjusting.name}</h2>
          <p>Current available quantity: {adjusting.available} {adjusting.baseUnit.symbol}</p>
          <label>Quantity change<input value={adjustment} onChange={(event) => setAdjustment(event.target.value)} inputMode="decimal" /></label>
          <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} /></label>
          <div><button className="button button-secondary" type="button" onClick={() => setAdjusting(null)}>Cancel</button><button className="button button-primary" type="button" onClick={submitAdjustment}>Post adjustment</button></div>
        </div>
      </div> : null}
    </section>
  );
}
