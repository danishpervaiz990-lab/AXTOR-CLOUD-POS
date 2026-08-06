import { NextResponse } from "next/server";
import { z } from "zod";
import { groceryApi, SharedBackendError } from "@/lib/shared-backend";
import { assertTrustedMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  workspace: z.string().trim().min(2).max(80).transform((value) => value.toLowerCase()),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200)
});

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
  } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }

  let input: z.infer<typeof loginSchema>;
  try {
    input = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const result = await groceryApi.login({
      businessSlug: input.workspace,
      email: input.email,
      password: input.password
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "AUTHENTICATION_FAILED", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "The shared POS backend is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
