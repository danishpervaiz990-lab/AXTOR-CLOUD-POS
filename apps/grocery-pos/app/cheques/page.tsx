import Link from "next/link";
import { redirect } from "next/navigation";
import { ChequeWorkspace } from "@/components/cheque-workspace";
import { getAuthenticatedSession } from "@/server/auth/session";
import { hasPermission } from "@/server/permissions/permissions";
import styles from "../inventory/workspace.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cheque Operations" };

export default async function ChequesPage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/login");
  const context = { businessId: session.businessId, userId: session.userId, role: session.role };
  if (!hasPermission(context, "cheques.view")) redirect("/dashboard");

  return (
    <main className={`${styles.scope} workspace-page`}>
      <header className="workspace-header">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">AG</span>
          <span className="brand-copy">AXTOR Grocery<small>Cheque Operations</small></span>
        </Link>
        <Link className="button button-secondary" href="/checkout">Open checkout</Link>
      </header>
      <ChequeWorkspace
        canCreateInward={hasPermission(context, "cheques.create_inward")}
        canCreateOutward={hasPermission(context, "cheques.create_outward")}
      />
    </main>
  );
}
