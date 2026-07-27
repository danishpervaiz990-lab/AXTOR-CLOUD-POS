import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, handleError, plain, tenant } from "../utils/http.js";

const router = Router();

const run = (fn: (req: Request, businessId: string) => Promise<any>) => async (req: Request, res: Response) => {
  try {
    const { businessId } = tenant(req);
    return res.json({ ok: true, data: plain(await fn(req, businessId)) });
  } catch (error) {
    return handleError(res, error);
  }
};

function take(req: Request): number {
  const value = Number(req.query.limit || 200);
  return Math.max(1, Math.min(500, Number.isFinite(value) ? Math.trunc(value) : 200));
}

router.get("/memberships", run(async (req, businessId) =>
  prisma.gymMembership.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.memberId) ? { memberId: cleanString(req.query.memberId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    include: { member: true, plan: true },
    orderBy: { endDate: "asc" },
    take: take(req),
  })
));

router.get("/membership-payments", run(async (req, businessId) =>
  prisma.gymMembershipPayment.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.membershipId) ? { membershipId: cleanString(req.query.membershipId) } : {}),
    },
    orderBy: { paidAt: "desc" },
    take: take(req),
  })
));

router.get("/class-bookings", run(async (req, businessId) =>
  prisma.gymClassBooking.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.classId) ? { classId: cleanString(req.query.classId) } : {}),
      ...(cleanString(req.query.memberId) ? { memberId: cleanString(req.query.memberId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    include: { gymClass: true, member: true },
    orderBy: { bookedAt: "desc" },
    take: take(req),
  })
));

router.get("/check-ins", run(async (req, businessId) =>
  prisma.gymCheckIn.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.memberId) ? { memberId: cleanString(req.query.memberId) } : {}),
    },
    include: { member: true, trainer: true },
    orderBy: { checkedInAt: "desc" },
    take: take(req),
  })
));

router.get("/program-enrollments", run(async (req, businessId) =>
  prisma.gymProgramEnrollment.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.programId) ? { programId: cleanString(req.query.programId) } : {}),
      ...(cleanString(req.query.memberId) ? { memberId: cleanString(req.query.memberId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    orderBy: { startDate: "desc" },
    take: take(req),
  })
));

router.get("/facility-enrollments", run(async (req, businessId) =>
  prisma.gymFacilityEnrollment.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.facilityId) ? { facilityId: cleanString(req.query.facilityId) } : {}),
      ...(cleanString(req.query.memberId) ? { memberId: cleanString(req.query.memberId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    orderBy: { startDate: "desc" },
    take: take(req),
  })
));

router.get("/trainer-assignments", run(async (req, businessId) =>
  prisma.gymTrainerAssignment.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.trainerId) ? { trainerId: cleanString(req.query.trainerId) } : {}),
      ...(cleanString(req.query.memberId) ? { memberId: cleanString(req.query.memberId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    orderBy: { startDate: "desc" },
    take: take(req),
  })
));

router.get("/locker-assignments", run(async (req, businessId) =>
  prisma.gymLockerAssignment.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.memberId) ? { memberId: cleanString(req.query.memberId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    orderBy: { assignedAt: "desc" },
    take: take(req),
  })
));

router.get("/measurements", run(async (req, businessId) =>
  prisma.gymMeasurement.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.memberId) ? { memberId: cleanString(req.query.memberId) } : {}),
    },
    orderBy: { measuredAt: "desc" },
    take: take(req),
  })
));

router.get("/members/:id/summary", run(async (req, businessId) => {
  const member = await prisma.gymMember.findFirst({ where: { id: req.params.id, businessId, archivedAt: null } });
  if (!member) throw new ApiError(404, "Gym member not found");
  const [memberships, payments, bookings, checkIns, programEnrollments, facilityEnrollments, trainerAssignments, lockerAssignments, measurements] = await Promise.all([
    prisma.gymMembership.findMany({ where: { businessId, memberId: member.id }, include: { plan: true }, orderBy: { endDate: "desc" } }),
    prisma.gymMembershipPayment.findMany({ where: { businessId, membershipId: { in: (await prisma.gymMembership.findMany({ where: { businessId, memberId: member.id }, select: { id: true } })).map((row) => row.id) } }, orderBy: { paidAt: "desc" } }),
    prisma.gymClassBooking.findMany({ where: { businessId, memberId: member.id }, include: { gymClass: true }, orderBy: { bookedAt: "desc" } }),
    prisma.gymCheckIn.findMany({ where: { businessId, memberId: member.id }, include: { trainer: true }, orderBy: { checkedInAt: "desc" } }),
    prisma.gymProgramEnrollment.findMany({ where: { businessId, memberId: member.id }, orderBy: { startDate: "desc" } }),
    prisma.gymFacilityEnrollment.findMany({ where: { businessId, memberId: member.id }, orderBy: { startDate: "desc" } }),
    prisma.gymTrainerAssignment.findMany({ where: { businessId, memberId: member.id }, orderBy: { startDate: "desc" } }),
    prisma.gymLockerAssignment.findMany({ where: { businessId, memberId: member.id }, orderBy: { assignedAt: "desc" } }),
    prisma.gymMeasurement.findMany({ where: { businessId, memberId: member.id }, orderBy: { measuredAt: "desc" } }),
  ]);
  return { member, memberships, payments, bookings, checkIns, programEnrollments, facilityEnrollments, trainerAssignments, lockerAssignments, measurements };
}));

export default router;
