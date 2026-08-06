import { bridgeSharedRoute } from "@/lib/shared-route-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> }
) {
  const { id } = await routeContext.params;
  return bridgeSharedRoute(request, `/api/v1/purchase-orders/${encodeURIComponent(id)}/approve`);
}
