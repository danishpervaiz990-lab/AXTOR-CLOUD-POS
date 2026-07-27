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
const take = (req: Request) => Math.max(1, Math.min(500, Math.trunc(Number(req.query.limit) || 200)));

router.get("/enrollments", run((req, businessId) => prisma.schoolEnrollment.findMany({
  where: { businessId, ...(cleanString(req.query.studentId) ? { studentId: cleanString(req.query.studentId) } : {}), ...(cleanString(req.query.classSectionId) ? { classSectionId: cleanString(req.query.classSectionId) } : {}), ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}) },
  include: { student: true, classSection: true }, orderBy: { enrolledAt: "desc" }, take: take(req),
})));
router.get("/student-guardians", run((req, businessId) => prisma.schoolStudentGuardian.findMany({
  where: { businessId, ...(cleanString(req.query.studentId) ? { studentId: cleanString(req.query.studentId) } : {}) },
  include: { student: true, guardian: true }, take: take(req),
})));
router.get("/attendance", run((req, businessId) => prisma.schoolAttendance.findMany({
  where: { businessId, ...(cleanString(req.query.studentId) ? { studentId: cleanString(req.query.studentId) } : {}), ...(cleanString(req.query.classSectionId) ? { classSectionId: cleanString(req.query.classSectionId) } : {}), ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}) },
  include: { student: true, classSection: true }, orderBy: { attendanceDate: "desc" }, take: take(req),
})));
router.get("/fee-heads", run((req, businessId) => prisma.schoolFeeHead.findMany({ where: { businessId }, orderBy: { name: "asc" }, take: take(req) })));
router.get("/fee-payments", run((req, businessId) => prisma.schoolFeePayment.findMany({ where: { businessId, ...(cleanString(req.query.studentFeeId) ? { studentFeeId: cleanString(req.query.studentFeeId) } : {}) }, orderBy: { paidAt: "desc" }, take: take(req) })));
router.get("/fee-adjustments", run((req, businessId) => prisma.schoolFeeAdjustment.findMany({ where: { businessId, ...(cleanString(req.query.studentFeeId) ? { studentFeeId: cleanString(req.query.studentFeeId) } : {}) }, orderBy: { createdAt: "desc" }, take: take(req) })));
router.get("/applicants", run((req, businessId) => prisma.schoolApplicant.findMany({ where: { businessId, ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}) }, orderBy: { appliedAt: "desc" }, take: take(req) })));
router.get("/academic-years", run((req, businessId) => prisma.academicYear.findMany({ where: { businessId }, orderBy: { startsOn: "desc" }, take: take(req) })));
router.get("/academic-terms", run((req, businessId) => prisma.academicTerm.findMany({ where: { businessId, ...(cleanString(req.query.academicYearId) ? { academicYearId: cleanString(req.query.academicYearId) } : {}) }, orderBy: { startsOn: "desc" }, take: take(req) })));
router.get("/subjects", run((req, businessId) => prisma.schoolSubject.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" }, take: take(req) })));
router.get("/teachers", run((req, businessId) => prisma.schoolTeacher.findMany({ where: { businessId, active: true }, orderBy: { fullName: "asc" }, take: take(req) })));
router.get("/rooms", run((req, businessId) => prisma.schoolRoom.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" }, take: take(req) })));
router.get("/timetable", run((req, businessId) => prisma.schoolTimetableEntry.findMany({ where: { businessId, active: true, ...(cleanString(req.query.classSectionId) ? { classSectionId: cleanString(req.query.classSectionId) } : {}) }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }], take: take(req) })));
router.get("/assessments", run((req, businessId) => prisma.schoolAssessment.findMany({ where: { businessId, ...(cleanString(req.query.classSectionId) ? { classSectionId: cleanString(req.query.classSectionId) } : {}) }, orderBy: { assessmentDate: "desc" }, take: take(req) })));
router.get("/results", run((req, businessId) => prisma.schoolResult.findMany({ where: { businessId, ...(cleanString(req.query.assessmentId) ? { assessmentId: cleanString(req.query.assessmentId) } : {}), ...(cleanString(req.query.studentId) ? { studentId: cleanString(req.query.studentId) } : {}) }, orderBy: { publishedAt: "desc" }, take: take(req) })));
router.get("/employees", run((req, businessId) => prisma.schoolEmployee.findMany({ where: { businessId, active: true }, orderBy: { fullName: "asc" }, take: take(req) })));
router.get("/payroll-runs", run((req, businessId) => prisma.schoolPayrollRun.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: take(req) })));

router.get("/students/:id/summary", run(async (req, businessId) => {
  const student = await prisma.schoolStudent.findFirst({ where: { id: req.params.id, businessId, archivedAt: null } });
  if (!student) throw new ApiError(404, "School student not found");
  const [enrollments, guardians, attendance, fees, results] = await Promise.all([
    prisma.schoolEnrollment.findMany({ where: { businessId, studentId: student.id }, include: { classSection: true }, orderBy: { enrolledAt: "desc" } }),
    prisma.schoolStudentGuardian.findMany({ where: { businessId, studentId: student.id }, include: { guardian: true } }),
    prisma.schoolAttendance.findMany({ where: { businessId, studentId: student.id }, orderBy: { attendanceDate: "desc" }, take: 200 }),
    prisma.schoolStudentFee.findMany({ where: { businessId, studentId: student.id }, include: { feeHead: true, payments: true }, orderBy: { dueDate: "desc" } }),
    prisma.schoolResult.findMany({ where: { businessId, studentId: student.id }, orderBy: { publishedAt: "desc" }, take: 200 }),
  ]);
  return { student, enrollments, guardians, attendance, fees, results };
}));

export default router;
