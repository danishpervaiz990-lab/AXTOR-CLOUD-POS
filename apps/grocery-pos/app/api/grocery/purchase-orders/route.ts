import { bridgeSharedRoute } from "@/lib/shared-route-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bridgeSharedRoute(request, "/api/v1/purchase-orders");
}

export async function POST(request: Request) {
  return bridgeSharedRoute(request, "/api/v1/purchase-orders");
}
