export type IndustryField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "datetime" | "select" | "textarea" | "boolean";
  required?: boolean;
  sensitive?: boolean;
  options?: string[];
};

export type IndustryEntityDefinition = {
  type: string;
  label: string;
  pluralLabel: string;
  icon: string;
  permission: string;
  statuses: string[];
  fields: IndustryField[];
};

export type IndustryPack = {
  code: string;
  name: string;
  description: string;
  icon?: string;
  suitableFor?: string[];
  catalogueHighlights?: string[];
  operationalStatus?: "core_ready" | "vertical_beta" | "catalogue_preview";
  registrationEnabled?: boolean;
  modules: string[];
  sidebarOrder: string[];
  dashboardWidgets: string[];
  defaultRoles: Record<string, string[]>;
  defaultSettings: Record<string, any>;
  notificationRules: Array<{ code: string; eventType: string; daysBefore?: number[] }>;
  printFields: string[];
  reports: string[];
  entities: IndustryEntityDefinition[];
};

export const INDUSTRY_REGISTRY_VERSION = "2026.07.26-release-group-1";

const field = (
  key: string,
  label: string,
  type: IndustryField["type"] = "text",
  required = false,
  options?: string[],
  sensitive = false,
): IndustryField => ({ key, label, type, required, ...(options ? { options } : {}), ...(sensitive ? { sensitive } : {}) });

const entity = (
  type: string,
  label: string,
  icon: string,
  statuses: string[],
  fields: IndustryField[],
  permission = type,
): IndustryEntityDefinition => ({
  type,
  label,
  pluralLabel: label.endsWith("s") ? label : `${label}s`,
  icon,
  permission: `industry.${permission}`,
  statuses,
  fields,
});

const cataloguePack = (
  code: string,
  name: string,
  description: string,
  icon: string,
  suitableFor: string[],
  modules: string[],
  highlights: string[],
): IndustryPack => ({
  code,
  name,
  description,
  icon,
  suitableFor,
  catalogueHighlights: highlights,
  operationalStatus: "catalogue_preview",
  registrationEnabled: false,
  modules,
  sidebarOrder: ["dashboard", ...modules.slice(0, 6), "reports"],
  dashboardWidgets: [],
  defaultRoles: {},
  defaultSettings: {},
  notificationRules: [],
  printFields: [],
  reports: [],
  entities: [],
});

export const INDUSTRY_REGISTRY: Record<string, IndustryPack> = {
  retail: {
    code: "retail",
    name: "General Retail",
    description: "General product and service retail using the core POS, inventory, purchase, customer, and accounting modules.",
    modules: ["dashboard", "terminal", "sales", "customers", "products", "inventory", "purchases", "expenses", "accounts", "reports"],
    sidebarOrder: ["dashboard", "terminal", "sales", "customers", "products", "inventory", "purchases", "reports"],
    dashboardWidgets: ["todaySales", "grossMargin", "lowStock", "outstandingReceivables"],
    defaultRoles: { "Retail Manager": ["sales_documents.*", "products.*", "inventory.*", "reports.*"], Cashier: ["sales_documents.create", "sales_documents.post", "products.view", "customers.view", "shifts.*"] },
    defaultSettings: { openShiftRequired: true, allowNegativeStock: false },
    notificationRules: [{ code: "retail-low-stock", eventType: "inventory.low_stock" }],
    printFields: ["sku", "unit", "qty", "rate", "discount", "tax", "total"],
    reports: ["salesByItem", "salesByCategory", "salesByCustomer", "grossMargin"],
    entities: [],
  },
  gym: {
    code: "gym",
    name: "Gym / Fitness",
    description: "Admissions, memberships, trainers, programs, facilities, attendance, renewal billing, and gym retail.",
    modules: ["members", "memberships", "trainers", "programs", "facilities", "classes", "checkins", "billing", "expenses", "reports"],
    sidebarOrder: ["dashboard", "members", "memberships", "checkins", "classes", "trainers", "facilities", "terminal", "reports"],
    dashboardWidgets: ["activeMembers", "renewalsDue", "todayCheckins", "classUtilization", "overdueMemberships"],
    defaultRoles: {
      "Gym Manager": ["industry.gym.*", "sales_documents.*", "reports.*"],
      Receptionist: ["industry.gym.member.*", "industry.gym.membership.view", "industry.gym.checkin.*", "payments.receive"],
      Trainer: ["industry.gym.member.view", "industry.gym.program.*", "industry.gym.class.view"],
    },
    defaultSettings: { renewalNoticeDays: [30, 14, 7, 1], gracePeriodDays: 3, medicalFieldsRestricted: true },
    notificationRules: [
      { code: "gym-membership-renewal", eventType: "gym.membership.expiring", daysBefore: [30, 14, 7, 1] },
      { code: "gym-class-reminder", eventType: "gym.class.reminder" },
    ],
    printFields: ["membershipNo", "memberName", "plan", "startDate", "endDate", "paid", "balance"],
    reports: ["memberGrowth", "renewalsDue", "attendance", "classUtilization", "trainerUtilization", "revenueByPlan", "churn", "profitability"],
    entities: [
      entity("gym_member", "Member", "bi-person-vcard", ["lead", "trial", "active", "frozen", "expired", "cancelled"], [
        field("memberNo", "Membership number", "text", true), field("fullName", "Full name", "text", true),
        field("phone", "Phone", "text", true), field("email", "Email"), field("joinDate", "Join date", "date", true),
        field("emergencyContact", "Emergency contact"), field("homeBranch", "Home club / branch"),
        field("consentConfirmed", "Consent / waiver confirmed", "boolean", true),
        field("medicalLimitations", "Medical limitations", "textarea", false, undefined, true),
      ], "gym.member"),
      entity("gym_membership", "Membership", "bi-card-checklist", ["draft", "active", "frozen", "expired", "cancelled"], [
        field("memberReference", "Member reference", "text", true), field("plan", "Membership plan", "select", true, ["daily", "weekly", "monthly", "quarterly", "annual", "custom"]),
        field("startDate", "Start date", "date", true), field("endDate", "End date", "date", true),
        field("joiningFee", "Joining fee", "number"), field("recurringAmount", "Recurring amount", "number", true),
        field("billingCycle", "Billing cycle", "select", true, ["daily", "weekly", "monthly", "quarterly", "annual", "custom"]),
        field("gracePeriodDays", "Grace period days", "number"), field("autoRenew", "Auto renew", "boolean"),
      ], "gym.membership"),
      entity("gym_trainer", "Trainer", "bi-person-workspace", ["active", "inactive", "on_leave"], [
        field("fullName", "Trainer name", "text", true), field("specialties", "Specialties", "textarea"), field("availability", "Availability", "textarea"),
        field("commissionPercent", "Commission %", "number"), field("branch", "Branch"),
      ], "gym.trainer"),
      entity("gym_program", "Program Enrollment", "bi-activity", ["planned", "active", "completed", "cancelled"], [
        field("memberReference", "Member reference", "text", true), field("trainerReference", "Trainer reference"),
        field("programName", "Program / workout plan", "text", true), field("startDate", "Start date", "date"), field("endDate", "End date", "date"),
        field("totalSessions", "Total sessions", "number"), field("sessionsUsed", "Sessions used", "number"),
      ], "gym.program"),
      entity("gym_facility_booking", "Facility Booking", "bi-calendar2-check", ["booked", "checked_in", "completed", "cancelled", "no_show"], [
        field("memberReference", "Member reference", "text", true), field("facility", "Facility", "select", true, ["pool", "sauna", "court", "studio", "locker", "equipment"]),
        field("startAt", "Start", "datetime", true), field("endAt", "End", "datetime", true), field("notes", "Notes", "textarea"),
      ], "gym.facility"),
      entity("gym_checkin", "Check-in", "bi-box-arrow-in-right", ["allowed", "denied", "checked_out"], [
        field("memberReference", "Member / QR / RFID", "text", true), field("checkInAt", "Check-in time", "datetime", true),
        field("checkOutAt", "Check-out time", "datetime"), field("deniedReason", "Denied reason"),
      ], "gym.checkin"),
    ],
  },
  clinic: {
    code: "clinic",
    name: "Clinic",
    description: "Patient registration, appointments, queues, encounters, clinical records, service billing, and follow-up.",
    modules: ["patients", "practitioners", "appointments", "queue", "encounters", "medications", "billing", "reports"],
    sidebarOrder: ["dashboard", "patients", "appointments", "queue", "encounters", "billing", "reports"],
    dashboardWidgets: ["todayAppointments", "waitingPatients", "noShows", "serviceRevenue", "receivables"],
    defaultRoles: {
      "Clinic Manager": ["industry.clinic.*", "sales_documents.*", "reports.*"],
      Receptionist: ["industry.clinic.patient.demographics", "industry.clinic.appointment.*", "industry.clinic.queue.*"],
      Practitioner: ["industry.clinic.patient.view", "industry.clinic.encounter.*", "industry.clinic.medication_request.*"],
    },
    defaultSettings: { clinicalNotesRestricted: true, consentRequired: true, retentionPolicyConfigured: false },
    notificationRules: [{ code: "clinic-appointment-reminder", eventType: "clinic.appointment.reminder", daysBefore: [1] }, { code: "clinic-follow-up", eventType: "clinic.follow_up.due" }],
    printFields: ["patientNo", "patientName", "practitioner", "services", "invoiceNo", "paid", "balance"],
    reports: ["appointments", "noShows", "practitionerProductivity", "serviceRevenue", "receivables", "expenses"],
    entities: [
      entity("clinic_patient", "Patient", "bi-person-badge", ["active", "inactive", "deceased"], [
        field("patientNo", "Patient number", "text", true), field("fullName", "Full name", "text", true), field("dateOfBirth", "Date of birth", "date"),
        field("sex", "Sex", "select", false, ["female", "male", "other", "unknown"]), field("phone", "Phone", "text", true),
        field("emergencyContact", "Emergency contact"), field("consentConfirmed", "Consent confirmed", "boolean", true),
      ], "clinic.patient"),
      entity("clinic_practitioner", "Practitioner", "bi-person-heart", ["active", "inactive", "on_leave"], [
        field("fullName", "Practitioner name", "text", true), field("specialty", "Specialty", "text", true), field("licenseReference", "License reference"),
        field("location", "Location"), field("availability", "Availability", "textarea"),
      ], "clinic.practitioner"),
      entity("clinic_appointment", "Appointment", "bi-calendar2-week", ["proposed", "booked", "confirmed", "arrived", "fulfilled", "cancelled", "no_show", "waitlist"], [
        field("patientReference", "Patient reference", "text", true), field("practitionerReference", "Practitioner reference", "text", true),
        field("service", "Service", "text", true), field("startAt", "Start", "datetime", true), field("endAt", "End", "datetime", true),
        field("location", "Room / location"), field("reason", "Reason", "textarea", false, undefined, true),
      ], "clinic.appointment"),
      entity("clinic_encounter", "Encounter", "bi-clipboard2-pulse", ["planned", "in_progress", "completed", "cancelled"], [
        field("patientReference", "Patient reference", "text", true), field("appointmentReference", "Appointment reference"),
        field("practitionerReference", "Practitioner reference", "text", true), field("startedAt", "Started", "datetime", true),
        field("vitals", "Vitals", "textarea", false, undefined, true), field("clinicalNotes", "Clinical notes", "textarea", false, undefined, true),
        field("diagnosisCodes", "Problem / diagnosis codes", "textarea", false, undefined, true),
      ], "clinic.encounter"),
      entity("clinic_medication_request", "Medication Request", "bi-capsule", ["draft", "active", "completed", "cancelled"], [
        field("patientReference", "Patient reference", "text", true), field("encounterReference", "Encounter reference"),
        field("practitionerReference", "Practitioner reference", "text", true), field("medication", "Medication", "text", true),
        field("instructions", "Practitioner instructions", "textarea", true, undefined, true),
      ], "clinic.medication_request"),
    ],
  },
  grocery: {
    code: "grocery",
    name: "Grocery / Supermarket",
    description: "Fast barcode checkout, weighted items, batch/expiry, FEFO, markdowns, waste, recalls, and replenishment.",
    modules: ["terminal", "products", "batches", "expiry", "receiving", "waste", "recalls", "promotions", "loyalty", "reports"],
    sidebarOrder: ["dashboard", "terminal", "products", "batches", "expiry", "inventory", "purchases", "promotions", "reports"],
    dashboardWidgets: ["todaySales", "nearExpiryValue", "expiredStock", "wasteValue", "lowStock"],
    defaultRoles: { "Store Manager": ["industry.grocery.*", "sales_documents.*", "inventory.*"], Cashier: ["sales_documents.*", "products.view", "industry.grocery.expiry.view"] },
    defaultSettings: { expiryNoticeDays: [90, 60, 30, 14, 7, 1], blockExpiredSale: true, allocationMethod: "FEFO" },
    notificationRules: [{ code: "grocery-near-expiry", eventType: "inventory.batch.expiring", daysBefore: [90, 60, 30, 14, 7, 1] }, { code: "grocery-low-stock", eventType: "inventory.low_stock" }],
    printFields: ["gtin", "plu", "batchNo", "expiryDate", "unit", "qty", "rate", "total"],
    reports: ["expiryExposure", "waste", "margin", "categorySales", "stockAging", "supplierPerformance"],
    entities: [
      entity("grocery_waste", "Waste / Spoilage", "bi-trash3", ["draft", "posted", "reversed"], [
        field("productReference", "Product / SKU", "text", true), field("batchNo", "Batch / lot"), field("quantity", "Quantity", "number", true),
        field("unit", "Unit", "select", true, ["piece", "pack", "carton", "kg", "gram", "litre"]), field("reason", "Reason", "select", true, ["expired", "spoilage", "breakage", "shrinkage"]),
        field("occurredAt", "Occurred at", "datetime", true),
      ], "grocery.waste"),
      entity("grocery_recall", "Product Recall", "bi-exclamation-triangle", ["open", "quarantined", "returned", "closed"], [
        field("productReference", "Product / GTIN", "text", true), field("batchNo", "Batch / lot", "text", true),
        field("supplierReference", "Supplier reference"), field("reason", "Recall reason", "textarea", true), field("openedAt", "Opened", "datetime", true),
      ], "grocery.recall"),
    ],
  },
  hardware_paint: {
    code: "hardware_paint",
    name: "Hardware and Paint",
    description: "Trade pricing, cut quantities, projects, LPO/delivery, color formulas, tinting, labels, and mix-job costing.",
    modules: ["terminal", "quotations", "projects", "tradePricing", "deliveries", "rentals", "colorFormulas", "mixJobs", "inventory", "reports"],
    sidebarOrder: ["dashboard", "terminal", "quotations", "projects", "mixJobs", "products", "inventory", "deliveries", "reports"],
    dashboardWidgets: ["openQuotations", "mixJobsToday", "creditAging", "backorders", "marginByMix"],
    defaultRoles: { "Trade Manager": ["industry.hardware_paint.*", "sales_documents.*", "customers.*"], Colorist: ["industry.hardware_paint.formula.view", "industry.hardware_paint.mix_job.*", "products.view"] },
    defaultSettings: { allowPartialQuantity: true, customMixNonReturnable: true },
    notificationRules: [{ code: "hardware-backorder", eventType: "hardware.backorder.due" }, { code: "paint-mix-ready", eventType: "paint.mix.ready" }],
    printFields: ["projectReference", "colorCode", "formulaRevision", "batchNo", "packSize", "qty", "rate", "total"],
    reports: ["creditAging", "projectSales", "stagedDelivery", "marginByMix", "formulaConsumption", "brandSales", "salespersonPerformance"],
    entities: [
      entity("hardware_project", "Customer Project", "bi-briefcase", ["active", "on_hold", "completed", "cancelled"], [
        field("projectReference", "Project / job reference", "text", true), field("customerReference", "Customer reference", "text", true),
        field("siteAddress", "Site address", "textarea"), field("priceLevel", "Trade price level"), field("creditTerms", "Credit terms"),
      ], "hardware_paint.project"),
      entity("paint_formula", "Color Formula", "bi-palette", ["draft", "approved", "superseded"], [
        field("brand", "Brand", "text", true), field("productLine", "Product line", "text", true), field("colorCode", "Color code", "text", true),
        field("colorName", "Color name"), field("base", "Base", "text", true), field("packSize", "Pack size", "text", true),
        field("revision", "Revision", "text", true), field("components", "Formula components and quantities", "textarea", true),
      ], "hardware_paint.formula"),
      entity("paint_mix_job", "Tinting / Mix Job", "bi-droplet-half", ["queued", "mixing", "quality_check", "ready", "delivered", "cancelled"], [
        field("customerReference", "Customer reference"), field("projectVehicleReference", "Project / vehicle reference"),
        field("formulaReference", "Formula reference", "text", true), field("batchNo", "Batch / lot"), field("quantity", "Quantity", "number", true),
        field("packSize", "Pack size", "text", true), field("customNonReturnable", "Custom mix — non-returnable", "boolean", true),
      ], "hardware_paint.mix_job"),
      entity("hardware_delivery", "Staged Delivery", "bi-truck", ["planned", "picking", "dispatched", "delivered", "cancelled"], [
        field("salesDocumentReference", "Invoice / quotation / LPO", "text", true), field("projectReference", "Project reference"),
        field("scheduledAt", "Scheduled", "datetime", true), field("deliveryAddress", "Delivery address", "textarea", true),
      ], "hardware_paint.delivery"),
    ],
  },
  school: {
    code: "school",
    name: "School / Education",
    description: "Admissions, guardians, enrollments, fees, attendance, timetable, exams, HR, payroll, and operations.",
    modules: ["students", "guardians", "admissions", "academics", "attendance", "fees", "timetable", "exams", "hr", "payroll", "reports"],
    sidebarOrder: ["dashboard", "admissions", "students", "academics", "attendance", "fees", "timetable", "hr", "reports"],
    dashboardWidgets: ["enrollment", "feesDue", "attendanceToday", "timetableConflicts", "payrollDue"],
    defaultRoles: {
      "School Administrator": ["industry.school.*", "reports.*"],
      Admissions: ["industry.school.student.*", "industry.school.enrollment.*"],
      Teacher: ["industry.school.student.view", "industry.school.attendance.*", "industry.school.assessment.*"],
      "School Accountant": ["industry.school.fee.*", "payments.*", "expenses.*"],
    },
    defaultSettings: { feeReminderDays: [14, 7, 1], timetableCollisionPrevention: true },
    notificationRules: [{ code: "school-fee-due", eventType: "school.fee.due", daysBefore: [14, 7, 1] }, { code: "school-fee-overdue", eventType: "school.fee.overdue" }],
    printFields: ["studentNo", "studentName", "guardian", "academicYear", "feeHead", "paid", "balance"],
    reports: ["enrollment", "feeCollection", "feeAging", "concessions", "attendance", "payroll", "expenses"],
    entities: [
      entity("school_student", "Student", "bi-mortarboard", ["applicant", "active", "transferred", "withdrawn", "graduated"], [
        field("admissionNo", "Admission number", "text", true), field("fullName", "Student name", "text", true), field("dateOfBirth", "Date of birth", "date"),
        field("guardianName", "Guardian name", "text", true), field("guardianPhone", "Guardian phone", "text", true), field("emergencyContact", "Emergency contact"),
        field("consentConfirmed", "Consent confirmed", "boolean", true),
      ], "school.student"),
      entity("school_enrollment", "Class Enrollment", "bi-journal-check", ["planned", "active", "completed", "withdrawn"], [
        field("studentReference", "Student reference", "text", true), field("academicYear", "Academic year", "text", true),
        field("term", "Term", "text", true), field("grade", "Grade", "text", true), field("classSection", "Class / section", "text", true),
      ], "school.enrollment"),
      entity("school_fee", "Student Fee", "bi-receipt", ["draft", "issued", "partial", "paid", "overdue", "cancelled"], [
        field("studentReference", "Student reference", "text", true), field("feeHead", "Fee head", "text", true),
        field("academicPeriod", "Academic period", "text", true), field("amount", "Amount", "number", true), field("dueDate", "Due date", "date", true),
        field("discount", "Discount / concession", "number"), field("lateFee", "Late fee", "number"),
      ], "school.fee"),
      entity("school_timetable", "Timetable Entry", "bi-calendar3", ["draft", "active", "cancelled"], [
        field("academicYear", "Academic year", "text", true), field("classSection", "Class / section", "text", true),
        field("subject", "Subject", "text", true), field("teacherReference", "Teacher reference", "text", true),
        field("room", "Room", "text", true), field("startAt", "Start", "datetime", true), field("endAt", "End", "datetime", true),
      ], "school.timetable"),
      entity("school_employee", "Employee / Teacher", "bi-person-lines-fill", ["active", "on_leave", "inactive"], [
        field("employeeNo", "Employee number", "text", true), field("fullName", "Full name", "text", true), field("role", "Role", "text", true),
        field("salaryStructure", "Salary structure", "textarea", false, undefined, true),
      ], "school.employee"),
    ],
  },
  pharmacy: {
    code: "pharmacy",
    name: "Pharmacy",
    description: "Batch/expiry and FEFO inventory, prescription approval, loose units, recalls, and pharmacist-controlled safety workflows.",
    modules: ["terminal", "medicines", "batches", "prescriptions", "pharmacistApproval", "expiry", "recalls", "suppliers", "reports"],
    sidebarOrder: ["dashboard", "terminal", "medicines", "batches", "prescriptions", "expiry", "inventory", "reports"],
    dashboardWidgets: ["prescriptionsAwaitingReview", "nearExpiryValue", "expiredStock", "recalls", "looseUnitVariance"],
    defaultRoles: {
      "Pharmacy Manager": ["industry.pharmacy.*", "sales_documents.*", "inventory.*", "reports.*"],
      Pharmacist: ["industry.pharmacy.prescription.*", "industry.pharmacy.batch.*", "industry.pharmacy.safety_override", "sales_documents.*"],
      "Pharmacy Cashier": ["products.view", "sales_documents.create", "industry.pharmacy.prescription.create", "industry.pharmacy.prescription.view"],
    },
    defaultSettings: { expiryNoticeDays: [90, 60, 30, 14, 7, 1], blockExpiredSale: true, pharmacistApprovalRequired: true, autonomousMedicineAdvice: false },
    notificationRules: [{ code: "pharmacy-near-expiry", eventType: "inventory.batch.expiring", daysBefore: [90, 60, 30, 14, 7, 1] }, { code: "pharmacy-prescription-review", eventType: "pharmacy.prescription.review" }],
    printFields: ["medicine", "genericName", "strength", "dosageForm", "batchNo", "expiryDate", "qty", "total"],
    reports: ["expiryExposure", "batchTraceability", "recalls", "prescriptionSales", "looseUnitVariance", "supplierPerformance", "grossMargin", "safetyOverrides"],
    entities: [
      entity("pharmacy_prescription", "Prescription", "bi-file-medical", ["draft", "awaiting_review", "approved", "rejected", "dispensed", "expired"], [
        field("patientReference", "Patient / customer", "text", true), field("prescriber", "Prescriber", "text", true),
        field("prescribedAt", "Prescription date", "date", true), field("validUntil", "Valid until", "date"),
        field("reference", "Prescription reference", "text", true), field("attachmentReference", "Protected attachment reference", "text", true),
        field("medicines", "Prescribed medicines", "textarea", true, undefined, true),
        field("pharmacistReview", "Pharmacist review", "textarea", false, undefined, true),
      ], "pharmacy.prescription"),
      entity("pharmacy_recall", "Medicine Recall", "bi-shield-exclamation", ["open", "quarantined", "supplier_returned", "closed"], [
        field("productReference", "Medicine / GTIN", "text", true), field("batchNo", "Batch / lot", "text", true),
        field("recallReference", "Recall reference", "text", true), field("reason", "Reason", "textarea", true), field("openedAt", "Opened", "datetime", true),
      ], "pharmacy.recall"),
      entity("pharmacy_safety_override", "Pharmacist Safety Override", "bi-clipboard2-check", ["recorded", "reviewed"], [
        field("saleReference", "Sale reference", "text", true), field("medicineReference", "Medicine reference", "text", true),
        field("warningType", "Warning type", "select", true, ["duplicate_ingredient", "allergy", "interaction", "contraindication", "age", "pregnancy", "restricted"]),
        field("validatedSource", "Validated knowledge source", "text", true), field("reason", "Pharmacist reason", "textarea", true),
        field("pharmacistReference", "Pharmacist", "text", true),
      ], "pharmacy.safety_override"),
    ],
  },
  hardware: cataloguePack(
    "hardware",
    "Hardware Store",
    "Trade quotations, unit conversion, cut quantities, contractor pricing, staged delivery, credit control, and warranty tracking.",
    "bi-tools",
    ["Hardware shops", "Building-material suppliers", "Electrical and plumbing traders"],
    ["terminal", "quotations", "tradePricing", "projects", "deliveries", "inventory", "reports"],
    ["Contractor quotations and LPO", "Piece/box/metre unit conversion", "Partial and staged delivery", "Trade pricing and credit aging"],
  ),
  paint: cataloguePack(
    "paint",
    "Paint Shop",
    "Paint catalogue, colour formulas, revision-controlled tinting jobs, component consumption, mix labels, and project pricing.",
    "bi-palette",
    ["Automotive paint shops", "Decorative paint retailers", "Industrial coating suppliers"],
    ["terminal", "colorFormulas", "mixJobs", "projects", "inventory", "deliveries", "reports"],
    ["Colour formula revisions", "Tinting and mix-job costing", "Component consumption", "Mixed-paint labels and history"],
  ),
  restaurant: cataloguePack(
    "restaurant",
    "Restaurant / Café",
    "Table, takeaway, delivery, kitchen routing, modifiers, split billing, recipe consumption, wastage, and shift control.",
    "bi-cup-hot",
    ["Restaurants", "Cafés", "Cloud kitchens", "Quick-service outlets"],
    ["tables", "orders", "menu", "kitchen", "recipes", "wastage", "shifts", "reports"],
    ["Floor and table service", "Kitchen tickets and preparation states", "Modifiers and split bills", "Recipe cost and wastage"],
  ),
  furniture: cataloguePack(
    "furniture",
    "Furniture Shop",
    "Stock and made-to-order furniture, variants, custom measurements, deposits, procurement, delivery, installation, and warranty.",
    "bi-lamp",
    ["Furniture showrooms", "Custom furniture makers", "Interior furnishing suppliers"],
    ["catalogue", "quotations", "customOrders", "deposits", "procurement", "delivery", "installation", "reports"],
    ["Variant and dimension catalogue", "Made-to-order approvals", "Deposit and installment tracking", "Delivery and installation scheduling"],
  ),
  workshop: cataloguePack(
    "workshop",
    "Workshop / Garage",
    "Customer assets and vehicles, inspection, estimates, job cards, technician assignment, parts, labour, warranty, and delivery.",
    "bi-wrench-adjustable-circle",
    ["Vehicle workshops", "Repair centres", "Equipment service businesses"],
    ["assets", "inspections", "estimates", "jobCards", "technicians", "parts", "warranty", "reports"],
    ["Asset and vehicle history", "Estimate approval and job cards", "Parts and labour posting", "Technician productivity"],
  ),
  wholesale: cataloguePack(
    "wholesale",
    "Wholesale / Distribution",
    "Trade customers, price lists, MOQ, bulk orders, credit approval, multi-warehouse allocation, pick-pack-dispatch, and collections.",
    "bi-boxes",
    ["Distributors", "Importers", "B2B wholesalers"],
    ["tradeCustomers", "priceLists", "salesOrders", "credit", "pickPack", "dispatch", "routes", "reports"],
    ["Customer price lists and MOQ", "Credit approval and aging", "Pick-pack-dispatch", "Route and collection control"],
  ),
  manufacturing: cataloguePack(
    "manufacturing",
    "Light Manufacturing",
    "BOM revisions, production orders, material issue, work stages, quality checkpoints, output receipt, costing, and variance.",
    "bi-gear-wide-connected",
    ["Small factories", "Assemblers", "Light production businesses"],
    ["materials", "bom", "productionOrders", "workOrders", "quality", "output", "costing", "reports"],
    ["Revision-controlled BOM", "Material reservation and issue", "Quality and output receipt", "Production cost variance"],
  ),
};

export const REQUIRED_INDUSTRY_CODES = [
  "retail",
  "grocery",
  "pharmacy",
  "hardware",
  "paint",
  "gym",
  "clinic",
  "restaurant",
  "furniture",
  "school",
  "workshop",
  "wholesale",
  "manufacturing",
] as const;

export function getIndustryPack(code: string | null | undefined): IndustryPack | null {
  return code ? INDUSTRY_REGISTRY[String(code).toLowerCase()] || null : null;
}

export function getIndustryEntity(pack: IndustryPack, entityType: string): IndustryEntityDefinition | null {
  return pack.entities.find(item => item.type === entityType) || null;
}

export function publicIndustryRegistry(): IndustryPack[] {
  return REQUIRED_INDUSTRY_CODES.map(code => INDUSTRY_REGISTRY[code]);
}
