import { ChequeStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import { reminderKeyForCheque } from "@/server/finance/cheque-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const excludedStatuses = [
  ChequeStatus.CLEARED,
  ChequeStatus.REPLACED,
  ChequeStatus.CANCELLED,
  ChequeStatus.RETURNED
];

export async function GET(request: Request) {
  const environment = getServerEnvironment();
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${environment.GROCERY_CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const lowerBound = new Date(now.getTime() - 31 * 86_400_000);
  const upperBound = new Date(now.getTime() + 31 * 86_400_000);
  const database = getDatabase();

  const cheques = await database.cheque.findMany({
    where: {
      status: { notIn: excludedStatuses },
      dueDate: { gte: lowerBound, lte: upperBound }
    },
    select: {
      id: true,
      businessId: true,
      dueDate: true
    },
    take: 5_000
  });

  let created = 0;
  let unchanged = 0;

  for (const cheque of cheques) {
    const reminderKey = reminderKeyForCheque(cheque.dueDate, now);
    if (!reminderKey) {
      unchanged += 1;
      continue;
    }

    const result = await database.chequeReminder.upsert({
      where: {
        businessId_chequeId_reminderKey: {
          businessId: cheque.businessId,
          chequeId: cheque.id,
          reminderKey
        }
      },
      create: {
        businessId: cheque.businessId,
        chequeId: cheque.id,
        reminderKey,
        scheduledAt: now
      },
      update: {},
      select: { createdAt: true }
    });

    if (result.createdAt.getTime() >= now.getTime() - 1_000) {
      created += 1;
    } else {
      unchanged += 1;
    }
  }

  return NextResponse.json({
    status: "ok",
    scanned: cheques.length,
    created,
    unchanged,
    generatedAt: now.toISOString()
  });
}
