import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, dateValue, handleError, numberValue, plain, tenant } from "../utils/http.js";

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
  return Math.max(1, Math.min(500, Math.trunc(numberValue(req.query.limit, 200))));
}

function expectedRevision(body: any, current: number): number {
  const value = Number(body?.revision ?? current);
  if (!Number.isInteger(value) || value < 1) throw new ApiError(400, "A valid revision is required");
  return value;
}

router.get("/specialties", run(async (req, businessId) =>
  prisma.clinicSpecialty.findMany({
    where: { businessId, active: req.query.includeInactive === "true" ? undefined : true },
    orderBy: { name: "asc" },
    take: take(req),
  })
));

router.get("/encounters", run(async (req, businessId) =>
  prisma.clinicEncounter.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.patientId) ? { patientId: cleanString(req.query.patientId) } : {}),
      ...(cleanString(req.query.practitionerId) ? { practitionerId: cleanString(req.query.practitionerId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: take(req),
  })
));

router.get("/encounters/:id", run(async (req, businessId) => {
  const encounter = await prisma.clinicEncounter.findFirst({ where: { id: req.params.id, businessId } });
  if (!encounter) throw new ApiError(404, "Clinic encounter not found");
  const [serviceRequests, medicationRequests] = await Promise.all([
    prisma.clinicServiceRequest.findMany({ where: { businessId, encounterId: encounter.id }, orderBy: { requestedAt: "asc" } }),
    prisma.clinicMedicationRequest.findMany({ where: { businessId, encounterId: encounter.id }, orderBy: { requestedAt: "asc" } }),
  ]);
  return { ...encounter, serviceRequests, medicationRequests };
}));

router.get("/medication-requests", run(async (req, businessId) =>
  prisma.clinicMedicationRequest.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.encounterId) ? { encounterId: cleanString(req.query.encounterId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    orderBy: { requestedAt: "desc" },
    take: take(req),
  })
));

router.get("/consents", run(async (req, businessId) =>
  prisma.clinicConsent.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.patientId) ? { patientId: cleanString(req.query.patientId) } : {}),
      ...(cleanString(req.query.consentType) ? { consentType: cleanString(req.query.consentType) } : {}),
    },
    orderBy: { confirmedAt: "desc" },
    take: take(req),
  })
));

router.get("/service-requests", run(async (req, businessId) =>
  prisma.clinicServiceRequest.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.encounterId) ? { encounterId: cleanString(req.query.encounterId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    orderBy: { requestedAt: "desc" },
    take: take(req),
  })
));

router.get("/invoices", run(async (req, businessId) =>
  prisma.clinicInvoice.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.patientId) ? { patientId: cleanString(req.query.patientId) } : {}),
      ...(cleanString(req.query.status) ? { status: cleanString(req.query.status) } : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: take(req),
  })
));

router.get("/invoices/:id", run(async (req, businessId) => {
  const invoice = await prisma.clinicInvoice.findFirst({ where: { id: req.params.id, businessId } });
  if (!invoice) throw new ApiError(404, "Clinic invoice not found");
  const [items, payments] = await Promise.all([
    prisma.clinicInvoiceItem.findMany({ where: { businessId, invoiceId: invoice.id }, orderBy: { id: "asc" } }),
    prisma.clinicPayment.findMany({ where: { businessId, invoiceId: invoice.id }, orderBy: { paidAt: "asc" } }),
  ]);
  return { ...invoice, items, payments };
}));

router.get("/payments", run(async (req, businessId) =>
  prisma.clinicPayment.findMany({
    where: {
      businessId,
      ...(cleanString(req.query.invoiceId) ? { invoiceId: cleanString(req.query.invoiceId) } : {}),
    },
    orderBy: { paidAt: "desc" },
    take: take(req),
  })
));

router.get("/patients/:id/summary", run(async (req, businessId) => {
  const patient = await prisma.clinicPatient.findFirst({ where: { id: req.params.id, businessId, archivedAt: null } });
  if (!patient) throw new ApiError(404, "Clinic patient not found");
  const [appointments, consents, encounters, followUps, invoices] = await Promise.all([
    prisma.clinicAppointment.findMany({ where: { businessId, patientId: patient.id }, orderBy: { startAt: "desc" }, take: 100 }),
    prisma.clinicConsent.findMany({ where: { businessId, patientId: patient.id }, orderBy: { confirmedAt: "desc" }, take: 100 }),
    prisma.clinicEncounter.findMany({ where: { businessId, patientId: patient.id }, orderBy: { startedAt: "desc" }, take: 100 }),
    prisma.clinicFollowUp.findMany({ where: { businessId, patientId: patient.id }, orderBy: { dueAt: "desc" }, take: 100 }),
    prisma.clinicInvoice.findMany({ where: { businessId, patientId: patient.id }, orderBy: { issuedAt: "desc" }, take: 100 }),
  ]);
  return { patient, appointments, consents, encounters, followUps, invoices };
}));

router.patch("/patients/:id", run(async (req, businessId) => {
  const current = await prisma.clinicPatient.findFirst({ where: { id: req.params.id, businessId, archivedAt: null } });
  if (!current) throw new ApiError(404, "Clinic patient not found");
  if (expectedRevision(req.body, current.revision) !== current.revision) throw new ApiError(409, "Stale patient revision", { currentRevision: current.revision });
  return prisma.clinicPatient.update({
    where: { id: current.id },
    data: {
      fullName: cleanString(req.body.fullName) || current.fullName,
      phone: req.body.phone === undefined ? current.phone : cleanString(req.body.phone),
      dateOfBirth: req.body.dateOfBirth === undefined ? current.dateOfBirth : dateValue(req.body.dateOfBirth),
      consentConfirmed: req.body.consentConfirmed === undefined ? current.consentConfirmed : req.body.consentConfirmed === true,
      status: cleanString(req.body.status) || current.status,
      revision: { increment: 1 },
    },
  });
}));

router.patch("/practitioners/:id", run(async (req, businessId) => {
  const current = await prisma.clinicPractitioner.findFirst({ where: { id: req.params.id, businessId } });
  if (!current) throw new ApiError(404, "Clinic practitioner not found");
  return prisma.clinicPractitioner.update({
    where: { id: current.id },
    data: {
      fullName: cleanString(req.body.fullName) || current.fullName,
      specialty: cleanString(req.body.specialty) || current.specialty,
      licenseReference: req.body.licenseReference === undefined ? current.licenseReference : cleanString(req.body.licenseReference),
      active: req.body.active === undefined ? current.active : req.body.active === true,
    },
  });
}));

router.patch("/appointments/:id", run(async (req, businessId) => {
  const current = await prisma.clinicAppointment.findFirst({ where: { id: req.params.id, businessId } });
  if (!current) throw new ApiError(404, "Clinic appointment not found");
  if (expectedRevision(req.body, current.revision) !== current.revision) throw new ApiError(409, "Stale appointment revision", { currentRevision: current.revision });
  const startAt = req.body.startAt === undefined ? current.startAt : dateValue(req.body.startAt);
  const endAt = req.body.endAt === undefined ? current.endAt : dateValue(req.body.endAt);
  if (!startAt || !endAt || endAt <= startAt) throw new ApiError(400, "Valid startAt and endAt are required");
  const practitionerId = cleanString(req.body.practitionerId) || current.practitionerId;
  const room = req.body.room === undefined ? current.room : cleanString(req.body.room);
  const conflict = await prisma.clinicAppointment.findFirst({
    where: {
      id: { not: current.id },
      businessId,
      practitionerId,
      status: { notIn: ["cancelled", "no_show"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (conflict) throw new ApiError(409, "Practitioner already has an appointment in this time range");
  if (room) {
    const roomConflict = await prisma.clinicAppointment.findFirst({
      where: {
        id: { not: current.id },
        businessId,
        room,
        status: { notIn: ["cancelled", "no_show"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (roomConflict) throw new ApiError(409, "Room already has an appointment in this time range");
  }
  return prisma.clinicAppointment.update({
    where: { id: current.id },
    data: {
      patientId: cleanString(req.body.patientId) || current.patientId,
      practitionerId,
      startAt,
      endAt,
      service: cleanString(req.body.service) || current.service,
      room,
      status: cleanString(req.body.status) || current.status,
      revision: { increment: 1 },
    },
  });
}));

router.patch("/follow-ups/:id", run(async (req, businessId) => {
  const current = await prisma.clinicFollowUp.findFirst({ where: { id: req.params.id, businessId } });
  if (!current) throw new ApiError(404, "Clinic follow-up not found");
  if (expectedRevision(req.body, current.revision) !== current.revision) throw new ApiError(409, "Stale follow-up revision", { currentRevision: current.revision });
  const status = cleanString(req.body.status) || current.status;
  return prisma.clinicFollowUp.update({
    where: { id: current.id },
    data: {
      status,
      dueAt: req.body.dueAt === undefined ? current.dueAt : dateValue(req.body.dueAt) || current.dueAt,
      reason: cleanString(req.body.reason) || current.reason,
      completedAt: status === "completed" ? new Date() : current.completedAt,
      revision: { increment: 1 },
    },
  });
}));

router.patch("/medication-requests/:id", run(async (req, businessId) => {
  const current = await prisma.clinicMedicationRequest.findFirst({ where: { id: req.params.id, businessId } });
  if (!current) throw new ApiError(404, "Clinic medication request not found");
  return prisma.clinicMedicationRequest.update({
    where: { id: current.id },
    data: {
      medicationText: cleanString(req.body.medicationText) || current.medicationText,
      instructions: req.body.instructions === undefined ? current.instructions : cleanString(req.body.instructions),
      status: cleanString(req.body.status) || current.status,
    },
  });
}));

router.patch("/service-requests/:id", run(async (req, businessId) => {
  const current = await prisma.clinicServiceRequest.findFirst({ where: { id: req.params.id, businessId } });
  if (!current) throw new ApiError(404, "Clinic service request not found");
  return prisma.clinicServiceRequest.update({
    where: { id: current.id },
    data: {
      quantity: req.body.quantity === undefined ? current.quantity : Math.max(0.01, numberValue(req.body.quantity, Number(current.quantity))),
      unitPrice: req.body.unitPrice === undefined ? current.unitPrice : Math.max(0, numberValue(req.body.unitPrice, Number(current.unitPrice))),
      status: cleanString(req.body.status) || current.status,
    },
  });
}));

export default router;
