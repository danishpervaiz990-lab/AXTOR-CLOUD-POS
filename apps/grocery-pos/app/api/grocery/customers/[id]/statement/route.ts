import { bridgeSharedRoute } from "@/lib/shared-route-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const { id } = await routeContext.params;
  return bridgeSharedRoute(request, `/api/v1/customers/${id}/statement`);
}
