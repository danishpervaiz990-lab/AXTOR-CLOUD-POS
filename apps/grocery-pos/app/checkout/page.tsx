import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutTerminal } from "@/components/checkout-terminal";
import { getAuthenticatedSession } from "@/server/auth/session";
import { hasPermission } from "@/server/permissions/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/login");
  const context = { businessId: session.businessId, userId: session.userId, role: session.role };
  if (!hasPermission(context, "sales.create")) redirect("/dashboard");

  return (
    <main className="terminal-page">
      <header className="terminal-header">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">AG</span>
          <span className="brand-copy">AXTOR Grocery<small>Checkout</small></span>
        </Link>
        <div>
          <strong>{session.displayName}</strong>
          <span>{session.role.replaceAll("_", " ").toLowerCase()}</span>
        </div>
      </header>
      <CheckoutTerminal />
    </main>
  );
}
