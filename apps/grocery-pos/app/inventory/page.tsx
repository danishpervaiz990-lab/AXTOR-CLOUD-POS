import Link from "next/link";
import { redirect } from "next/navigation";
import { InventoryWorkspace } from "@/components/inventory-workspace";
import { getAuthenticatedSession } from "@/server/auth/session";
import { hasPermission } from "@/server/permissions/permissions";
import styles from "./workspace.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory & Expiry" };

export default async function InventoryPage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/login");
  const context = { businessId: session.businessId, userId: session.userId, role: session.role };
  if (!hasPermission(context, "inventory.view")) redirect("/dashboard");

  return (
    <main className={`${styles.scope} workspace-page`}>
      <header className="workspace-header">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">AG</span>
          <span className="brand-copy">AXTOR Grocery<small>Inventory & Expiry</small></span>
        </Link>
        <Link className="button button-secondary" href="/checkout">Open checkout</Link>
      </header>
      <InventoryWorkspace canAdjust={hasPermission(context, "inventory.adjust")} />
    </main>
  );
}
