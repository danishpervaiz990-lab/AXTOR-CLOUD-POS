import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { getAuthenticatedSession } from "@/server/auth/session";
import { hasPermission } from "@/server/permissions/permissions";
import styles from "../inventory/workspace.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments & Reconciliation" };

export default async function FinancePage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/login");
  const context = { businessId: session.businessId, userId: session.userId, role: session.role };
  if (!hasPermission(context, "reports.financial")) redirect("/dashboard");

  return (
    <main className={`${styles.scope} workspace-page`}>
      <header className="workspace-header">
        <Link className="brand" href="/dashboard"><span className="brand-mark" aria-hidden="true">AG</span><span className="brand-copy">AXTOR Grocery<small>Payments & Reconciliation</small></span></Link>
        <div><Link className="button button-secondary" href="/cheques">Cheque tally</Link></div>
      </header>
      <FinanceWorkspace canPostExpense={hasPermission(context, "expenses.manage")} />
    </main>
  );
}
