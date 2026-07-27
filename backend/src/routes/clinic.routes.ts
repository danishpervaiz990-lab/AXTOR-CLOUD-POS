import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireIndustry } from "../middleware/industry-guard.middleware.js";
import { requireAnyPermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/release-ab.controller.js";
import * as f from "../controllers/release-b-final.controller.js";
import clinicOperationsRouter from "./clinic-operations.routes.js";

const router = Router();
router.use(requireAuth, requireIndustry("clinic"));

const patientWrite = requireAnyPermission(
  "industry.clinic.patient.demographics",
  "industry.clinic.patient.create",
  "industry.clinic.patient.update"
);
const appointmentWrite = requireAnyPermission("industry.clinic.appointment.create", "industry.clinic.appointment.update");
const queueWrite = requireAnyPermission("industry.clinic.queue.create", "industry.clinic.queue.update");
const encounterWrite = requireAnyPermission("industry.clinic.encounter.create", "industry.clinic.encounter.update");
const medicationWrite = requireAnyPermission("industry.clinic.medication_request.create", "industry.clinic.medication_request.update");
const clinicalAdmin = requireAnyPermission("industry.clinic.settings.manage", "clinic.settings.manage");
const billingWrite = requireAnyPermission("clinic.billing.create");
const paymentWrite = requireAnyPermission("clinic.payments.create");
const followUpWrite = requireAnyPermission("industry.clinic.encounter.create", "industry.clinic.appointment.update");
const serviceRequestWrite = requireAnyPermission("industry.clinic.encounter.update", "clinic.billing.create");

router.get("/dashboard", c.clinicDashboard);
router.get("/patients", c.clinicPatients);
router.post("/patients", patientWrite, c.clinicPatientCreate);
router.get("/practitioners", c.clinicPractitioners);
router.post("/practitioners", clinicalAdmin, c.clinicPractitionerCreate);
router.get("/appointments", c.clinicAppointments);
router.post("/appointments", appointmentWrite, c.clinicAppointmentCreate);
router.post("/consents", patientWrite, c.clinicConsentCreate);
router.get("/queue", c.clinicQueue);
router.post("/queue", queueWrite, c.clinicQueueCreate);
router.patch("/queue/:id", queueWrite, c.clinicQueueUpdate);
router.get("/services", c.clinicServices);
router.post("/services", clinicalAdmin, c.clinicServiceCreate);
router.get("/follow-ups", c.clinicFollowUps);
router.post("/follow-ups", followUpWrite, c.clinicFollowUpCreate);
router.post("/specialties", clinicalAdmin, c.clinicSpecialtyCreate);
router.post("/encounters", encounterWrite, c.clinicEncounterCreate);
router.patch("/encounters/:id", encounterWrite, c.clinicEncounterUpdate);
router.post("/service-requests", serviceRequestWrite, c.clinicServiceRequestCreate);
router.post("/medication-requests", medicationWrite, c.clinicMedicationRequestCreate);
router.get("/reports/summary", c.clinicReports);
router.post("/invoices", billingWrite, f.clinicInvoice);
router.post("/payments", paymentWrite, f.clinicPayment);
router.get("/reports/filtered", f.clinicFilteredReport);
router.get("/notification-rules", f.clinicRules);
router.put("/notification-rules", clinicalAdmin, f.clinicRuleSave);

// The operations router adds tenant-scoped read APIs and controlled update APIs.
// Apply action permissions before its PATCH handlers so direct API calls cannot
// bypass the purpose-built Clinic frontend's role-aware controls.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "PATCH") return next();
  if (/^\/patients\//.test(req.path)) return patientWrite(req, res, next);
  if (/^\/practitioners\//.test(req.path)) return clinicalAdmin(req, res, next);
  if (/^\/appointments\//.test(req.path)) return appointmentWrite(req, res, next);
  if (/^\/follow-ups\//.test(req.path)) return followUpWrite(req, res, next);
  if (/^\/medication-requests\//.test(req.path)) return medicationWrite(req, res, next);
  if (/^\/service-requests\//.test(req.path)) return serviceRequestWrite(req, res, next);
  return next();
});
router.use(clinicOperationsRouter);

export default router;
