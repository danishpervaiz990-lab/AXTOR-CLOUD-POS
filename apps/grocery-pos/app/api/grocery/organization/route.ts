import { NextResponse } from "next/server";
import {
  SharedBackendError,
  sharedBackendRequest
} from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedEnvelope<T> = { ok?: boolean; data?: T } & Record<string, unknown>;

type SharedBranch = {
  id: string;
  code?: string | null;
  name: string;
  active?: boolean;
  warehouses?: Array<{
    id: string;
    branchId?: string | null;
    code?: string | null;
    name: string;
    active?: boolean;
  }>;
  counters?: Array<{
    id: string;
    branchId?: string | null;
    code?: string | null;
    name: string;
    status?: string | null;
  }>;
};

type SharedShift = {
  id: string;
  branchId?: string | null;
  counterId?: string | null;
  status?: string | null;
  openingCash?: string | number | null;
  expectedCash?: string | number | null;
  openedAt: string;
};

function unwrap<T>(payload: SharedEnvelope<T> | T): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as SharedEnvelope<T>).data as T;
  }
  return payload as T;
}

export async function GET(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const [sessionPayload, branchesPayload, shiftPayload] = await Promise.all([
      sharedBackendRequest<{
        ok?: boolean;
        business: Record<string, unknown>;
        user: Record<string, unknown>;
      }>("/api/v1/auth/me", { token, businessId }),
      sharedBackendRequest<SharedEnvelope<SharedBranch[]>>("/api/v1/branches", {
        token,
        businessId
      }),
      sharedBackendRequest<SharedEnvelope<SharedShift | null>>("/api/v1/shifts/current", {
        token,
        businessId
      })
    ]);

    const sharedBusiness = sessionPayload.business ?? {};
    const branches = unwrap(branchesPayload) ?? [];
    const currentShift = unwrap(shiftPayload);
    const status = String(sharedBusiness.status ?? "ACTIVE").toUpperCase();

    return NextResponse.json(
      {
        data: {
          business: {
            id: String(sharedBusiness.id ?? businessId ?? ""),
            slug: String(sharedBusiness.slug ?? ""),
            name: String(sharedBusiness.name ?? "Grocery workspace"),
            currencyCode: String(
              sharedBusiness.currencyCode ?? sharedBusiness.currency ?? "QAR"
            ),
            timezone: String(sharedBusiness.timezone ?? "Asia/Qatar"),
            active: status === "ACTIVE" || status === "TRIAL"
          },
          branches: branches
            .filter((branch) => branch.active !== false)
            .map((branch) => ({
              id: branch.id,
              code: branch.code ?? branch.id,
              name: branch.name
            })),
          warehouses: branches.flatMap((branch) =>
            (branch.warehouses ?? [])
              .filter((warehouse) => warehouse.active !== false)
              .map((warehouse) => ({
                id: warehouse.id,
                branchId: warehouse.branchId ?? branch.id,
                code: warehouse.code ?? warehouse.id,
                name: warehouse.name
              }))
          ),
          registers: branches.flatMap((branch) =>
            (branch.counters ?? [])
              .filter((counter) => String(counter.status ?? "ACTIVE").toUpperCase() !== "INACTIVE")
              .map((counter) => ({
                id: counter.id,
                branchId: counter.branchId ?? branch.id,
                warehouseId: null,
                code: counter.code ?? counter.id,
                name: counter.name
              }))
          ),
          currentShifts: currentShift
            ? [{
                id: currentShift.id,
                branchId: currentShift.branchId ?? "",
                registerId: currentShift.counterId ?? "",
                status: currentShift.status ?? "OPEN",
                openingCash: String(currentShift.openingCash ?? "0"),
                expectedCash: String(currentShift.expectedCash ?? "0"),
                openedAt: currentShift.openedAt
              }]
            : []
        }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "Workspace context could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
