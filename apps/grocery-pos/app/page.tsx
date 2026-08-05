import Link from "next/link";

const modules = [
  ["01", "Fast grocery checkout", "Keyboard-first scanning, weighted items, parked carts, split payments and register context."],
  ["02", "Fresh-stock control", "Batch, expiry, FEFO, receiving, counts, transfers, wastage and damage workflows."],
  ["03", "Purchasing and suppliers", "Purchase orders, partial receiving, supplier balances, payments and returns."],
  ["04", "Customer credit and loyalty", "Credit limits, statements, aging, loyalty earning and redemption controls."],
  ["05", "Payments and reconciliation", "Cash, credit card, debit card, bank, wallet, cheque and mixed-payment accounting."],
  ["06", "Cheque operations", "Inward and outward post-dated cheques, allocation, clearing, bounce, replacement and reminders."]
] as const;

export default function HomePage() {
  return (
    <main>
      <header className="site-header shell">
        <Link className="brand" href="/" aria-label="AXTOR Grocery POS Cloud home">
          <span className="brand-mark" aria-hidden="true">AG</span>
          <span className="brand-copy">
            AX<em>TOR</em> Grocery
            <small>POS Cloud</small>
          </span>
        </Link>
        <Link className="button button-secondary" href="/login">Secure sign in</Link>
      </header>

      <section className="hero shell">
        <div>
          <span className="eyebrow">Built only for grocery operations</span>
          <h1>From the scan beep to the bank tally.</h1>
          <p>
            A newly isolated grocery and supermarket operating system for checkout, weighted stock,
            purchasing, customer credit, payment reconciliation and post-dated cheques.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/login">Open Grocery workspace</Link>
            <a className="button button-secondary" href="/api/health">Application health</a>
          </div>
        </div>

        <div className="checkout-preview" aria-label="Illustration of a grocery checkout cart">
          <div className="scan-row"><span aria-hidden="true">⌁</span> Scan barcode, SKU, PLU or product</div>
          <div className="preview-list">
            <div className="preview-line">
              <div><strong>Roma tomatoes</strong><small>Weighted · 0.450 kg</small></div>
              <strong>Draft</strong>
            </div>
            <div className="preview-line">
              <div><strong>Fresh milk</strong><small>Pack · 2 × 1 L</small></div>
              <strong>Draft</strong>
            </div>
            <div className="preview-line">
              <div><strong>Basmati rice</strong><small>Weighted · 2.750 kg</small></div>
              <strong>Draft</strong>
            </div>
          </div>
          <div className="preview-total">
            <span><small>Payment state</small><br /><strong>Not posted</strong></span>
            <span>Real totals load from the backend</span>
          </div>
        </div>
      </section>

      <section className="section shell" aria-labelledby="operations-heading">
        <div className="section-heading">
          <h2 id="operations-heading">One grocery workflow, not a retail fallback.</h2>
          <p>
            Every operational area is designed around supermarket realities. The interface displays no
            fabricated financial values; live figures are shown only after authenticated API retrieval.
          </p>
        </div>
        <div className="module-grid">
          {modules.map(([number, title, description]) => (
            <article className="module-card" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
