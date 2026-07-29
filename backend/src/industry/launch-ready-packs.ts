import type { IndustryEntityDefinition, IndustryField, IndustryPack } from "./registry.js";

const field = (
  key: string,
  label: string,
  type: IndustryField["type"] = "text",
  required = false,
  options?: string[],
): IndustryField => ({ key, label, type, required, ...(options ? { options } : {}) });

const entity = (
  industry: string,
  type: string,
  label: string,
  icon: string,
  statuses: string[],
  fields: IndustryField[],
  permission: string,
): IndustryEntityDefinition => ({
  type,
  label,
  pluralLabel: label.endsWith("s") ? label : `${label}s`,
  icon,
  statuses,
  fields,
  permission: `industry.${industry}.${permission}`,
});

export const RESTAURANT_PACK: IndustryPack = {
  code: "restaurant",
  name: "Restaurant / Café",
  description: "Table, takeaway and delivery ordering with kitchen routing, modifiers, reservations, recipe control, wastage, billing and operational reports.",
  icon: "bi-cup-hot",
  suitableFor: ["Restaurants", "Cafés", "Cloud kitchens", "Quick-service outlets", "Bakeries"],
  catalogueHighlights: ["Floor and table service", "Kitchen preparation workflow", "Modifiers and split billing", "Recipe costing and wastage control"],
  operationalStatus: "core_ready",
  registrationEnabled: true,
  modules: ["tables", "menu", "orders", "kitchen", "reservations", "modifiers", "recipes", "wastage", "billing", "reports", "settings"],
  sidebarOrder: ["dashboard", "tables", "orders", "kitchen", "menu", "reservations", "recipes", "wastage", "reports", "settings"],
  dashboardWidgets: ["openTables", "activeOrders", "kitchenQueue", "todayRevenue", "averageTicket", "wastageValue"],
  defaultRoles: {
    "Restaurant Manager": ["industry.restaurant.*", "sales_documents.*", "payments.*", "inventory.*", "reports.*"],
    "Floor Supervisor": ["industry.restaurant.table.manage", "industry.restaurant.order.*", "industry.restaurant.reservation.*", "reports.view"],
    "Restaurant Cashier": ["industry.restaurant.order.*", "sales_documents.create", "payments.receive", "customers.view"],
    "Kitchen Staff": ["industry.restaurant.kitchen.manage", "industry.restaurant.order.view", "industry.restaurant.menu.view"],
    "Restaurant Inventory Controller": ["industry.restaurant.inventory.manage", "industry.restaurant.wastage.manage", "inventory.*", "products.view"],
  },
  defaultSettings: {
    serviceModes: ["dine_in", "takeaway", "delivery"],
    tableServiceEnabled: true,
    kitchenRoutingEnabled: true,
    allowSplitBills: true,
    requireVoidApproval: true,
    recipeStockPosting: true,
  },
  notificationRules: [
    { code: "restaurant-reservation-reminder", eventType: "restaurant.reservation.reminder", daysBefore: [1] },
    { code: "restaurant-kitchen-delay", eventType: "restaurant.kitchen.delayed" },
    { code: "restaurant-low-stock", eventType: "inventory.low_stock" },
  ],
  printFields: ["orderNo", "table", "serviceMode", "items", "modifiers", "server", "subtotal", "tax", "total"],
  reports: ["salesByServiceMode", "salesByMenuItem", "salesByCategory", "averageTicket", "tableTurnover", "kitchenTimes", "recipeCost", "wastage", "grossMargin"],
  entities: [
    entity("restaurant", "restaurant_table", "Restaurant Table", "bi-grid-3x3-gap", ["available", "occupied", "reserved", "blocked"], [
      field("name", "Table name", "text", true), field("area", "Floor / area"), field("capacity", "Capacity", "number", true), field("notes", "Notes", "textarea"),
    ], "table"),
    entity("restaurant", "restaurant_menu_item", "Menu Item", "bi-card-list", ["active", "inactive", "sold_out"], [
      field("name", "Item name", "text", true), field("category", "Category", "text", true), field("price", "Selling price", "number", true), field("taxGroup", "Tax group"), field("preparationStation", "Preparation station"),
    ], "menu"),
    entity("restaurant", "restaurant_order", "Restaurant Order", "bi-receipt", ["draft", "confirmed", "preparing", "ready", "served", "billed", "cancelled"], [
      field("serviceMode", "Service mode", "select", true, ["dine_in", "takeaway", "delivery"]), field("tableId", "Table ID"), field("customerId", "Customer ID"), field("items", "Order items JSON", "textarea", true), field("notes", "Order notes", "textarea"),
    ], "order"),
    entity("restaurant", "restaurant_reservation", "Reservation", "bi-calendar-check", ["booked", "confirmed", "arrived", "seated", "completed", "cancelled", "no_show"], [
      field("customerName", "Customer name", "text", true), field("phone", "Phone", "text", true), field("partySize", "Party size", "number", true), field("reservedAt", "Reservation time", "datetime", true), field("tableId", "Table ID"),
    ], "reservation"),
    entity("restaurant", "restaurant_wastage", "Kitchen Wastage", "bi-trash3", ["posted", "reversed"], [
      field("itemReference", "Ingredient / menu item", "text", true), field("quantity", "Quantity", "number", true), field("reason", "Reason", "text", true), field("occurredAt", "Occurred at", "datetime", true),
    ], "wastage"),
  ],
};

export const HARDWARE_PACK: IndustryPack = {
  code: "hardware",
  name: "Hardware Store",
  description: "Trade checkout, contractor projects, quotations and LPOs, unit conversions, staged delivery, backorders, rentals, warranties and credit control.",
  icon: "bi-tools",
  suitableFor: ["Hardware shops", "Building-material suppliers", "Electrical traders", "Plumbing traders", "Tool and equipment stores"],
  catalogueHighlights: ["Contractor projects and trade pricing", "Piece/box/metre conversion", "Staged delivery and backorders", "Rental, warranty and credit control"],
  operationalStatus: "core_ready",
  registrationEnabled: true,
  modules: ["terminal", "projects", "quotations", "priceLevels", "deliveries", "backorders", "rentals", "warranties", "unitConversions", "inventory", "reports", "settings"],
  sidebarOrder: ["dashboard", "terminal", "projects", "quotations", "priceLevels", "deliveries", "backorders", "rentals", "warranties", "reports", "settings"],
  dashboardWidgets: ["todayTradeSales", "openQuotations", "activeProjects", "stagedDeliveries", "backorders", "creditExposure"],
  defaultRoles: {
    "Hardware Manager": ["industry.hardware.*", "sales_documents.*", "customers.*", "inventory.*", "reports.*"],
    "Trade Salesperson": ["industry.hardware.project.*", "industry.hardware.pricing.view", "industry.hardware.quotation.*", "sales_documents.*", "customers.view"],
    "Warehouse and Delivery": ["industry.hardware.delivery.*", "industry.hardware.backorder.*", "inventory.*", "products.view"],
    "Rental Controller": ["industry.hardware.rental.*", "industry.hardware.warranty.*", "customers.view", "products.view"],
    "Hardware Read Only": ["industry.hardware.project.view", "industry.hardware.pricing.view", "industry.hardware.delivery.view", "industry.hardware.backorder.view", "industry.hardware.rental.view", "reports.view"],
  },
  defaultSettings: {
    allowPartialQuantity: true,
    allowUnitConversion: true,
    stagedDeliveryEnabled: true,
    creditCheckRequired: true,
    quotationApprovalRequired: false,
    rentalDepositRequired: true,
  },
  notificationRules: [
    { code: "hardware-backorder-due", eventType: "hardware.backorder.due" },
    { code: "hardware-delivery-due", eventType: "hardware.delivery.due", daysBefore: [1] },
    { code: "hardware-rental-overdue", eventType: "hardware.rental.overdue" },
    { code: "hardware-credit-limit", eventType: "customer.credit_limit.reached" },
  ],
  printFields: ["documentNo", "projectReference", "lpoNumber", "item", "baseUnit", "saleUnit", "conversion", "qty", "rate", "total", "deliveryStatus"],
  reports: ["tradeSales", "projectSales", "quotationConversion", "stagedDelivery", "backorders", "rentalUtilization", "warrantyClaims", "creditAging", "grossMargin", "salespersonPerformance"],
  entities: [
    entity("hardware", "hardware_project", "Contractor Project", "bi-briefcase", ["active", "on_hold", "completed", "cancelled"], [
      field("projectReference", "Project reference", "text", true), field("customerId", "Customer ID", "text", true), field("siteAddress", "Site address", "textarea"), field("priceLevel", "Price level"), field("creditTerms", "Credit terms"),
    ], "project"),
    entity("hardware", "hardware_price_level", "Trade Price Level", "bi-tags", ["active", "inactive"], [
      field("name", "Price level name", "text", true), field("discountPercent", "Discount %", "number"), field("markupPercent", "Markup %", "number"), field("minimumQuantity", "Minimum quantity", "number"),
    ], "pricing"),
    entity("hardware", "hardware_delivery", "Staged Delivery", "bi-truck", ["planned", "picking", "dispatched", "partially_delivered", "delivered", "cancelled"], [
      field("salesDocumentId", "Sales document ID", "text", true), field("projectId", "Project ID"), field("scheduledAt", "Scheduled at", "datetime", true), field("deliveryAddress", "Delivery address", "textarea", true), field("items", "Delivery items JSON", "textarea", true),
    ], "delivery"),
    entity("hardware", "hardware_backorder", "Backorder", "bi-hourglass-split", ["open", "allocated", "fulfilled", "cancelled"], [
      field("customerId", "Customer ID", "text", true), field("productId", "Product ID", "text", true), field("quantity", "Quantity", "number", true), field("requiredAt", "Required date", "date"),
    ], "backorder"),
    entity("hardware", "hardware_rental", "Equipment Rental", "bi-calendar2-range", ["reserved", "active", "returned", "overdue", "cancelled"], [
      field("customerId", "Customer ID", "text", true), field("productId", "Rental item ID", "text", true), field("startAt", "Start", "datetime", true), field("dueAt", "Due", "datetime", true), field("deposit", "Deposit", "number"),
    ], "rental"),
  ],
};

export const PAINT_PACK: IndustryPack = {
  code: "paint",
  name: "Paint Shop",
  description: "Colour catalogue, revision-controlled formulas, tinting and mix jobs, component stock, consumption, quality approval, labels, delivery and reversal.",
  icon: "bi-palette",
  suitableFor: ["Automotive paint shops", "Decorative paint retailers", "Industrial coating suppliers", "Colour-matching centres"],
  catalogueHighlights: ["Revision-controlled colour formulas", "Tinting and mix-job costing", "Component stock consumption", "Quality-gated labels and delivery"],
  operationalStatus: "core_ready",
  registrationEnabled: true,
  modules: ["catalogue", "colors", "formulas", "mixJobs", "componentStock", "consumption", "quality", "labels", "delivery", "reports", "settings"],
  sidebarOrder: ["dashboard", "catalogue", "formulas", "mixJobs", "componentStock", "quality", "labels", "delivery", "reports", "settings"],
  dashboardWidgets: ["mixJobsToday", "jobsAwaitingQuality", "componentShortages", "readyForDelivery", "formulaUsage", "mixMargin"],
  defaultRoles: {
    "Paint Shop Manager": ["industry.paint.*", "sales_documents.*", "inventory.*", "reports.*"],
    Colorist: ["industry.paint.catalogue.*", "industry.paint.formula.*", "industry.paint.mix_job.*", "products.view"],
    "Paint Storekeeper": ["industry.paint.component_stock.*", "inventory.*", "products.view"],
    "Paint Quality Inspector": ["industry.paint.mix_job.view", "industry.paint.quality.*", "industry.paint.catalogue.view"],
    "Paint Salesperson": ["industry.paint.catalogue.view", "industry.paint.formula.view", "industry.paint.mix_job.view", "sales_documents.*", "customers.view"],
  },
  defaultSettings: {
    customMixNonReturnable: true,
    qualityApprovalRequired: true,
    allowNegativeComponents: false,
    formulaRevisionRequired: true,
    componentPrecision: 3,
    labelBeforeDeliveryRequired: true,
  },
  notificationRules: [
    { code: "paint-mix-ready", eventType: "paint.mix.ready" },
    { code: "paint-quality-failed", eventType: "paint.quality.failed" },
    { code: "paint-component-low-stock", eventType: "paint.component.low_stock" },
  ],
  printFields: ["mixJobNo", "brand", "productLine", "colorCode", "colorName", "formulaRevision", "base", "packSize", "batchNo", "qualityStatus"],
  reports: ["mixJobStatus", "formulaConsumption", "componentVariance", "qualityResults", "mixReversals", "brandSales", "colorSales", "mixMargin", "salespersonPerformance"],
  entities: [
    entity("paint", "paint_brand", "Paint Brand", "bi-bookmark", ["active", "inactive"], [field("name", "Brand name", "text", true), field("code", "Brand code"), field("supplierId", "Supplier ID")], "catalogue"),
    entity("paint", "paint_color", "Colour", "bi-droplet", ["active", "inactive"], [field("brandId", "Brand ID", "text", true), field("colorCode", "Colour code", "text", true), field("colorName", "Colour name"), field("swatch", "Swatch value")], "catalogue"),
    entity("paint", "paint_formula", "Colour Formula", "bi-bezier2", ["draft", "approved", "superseded"], [
      field("colorId", "Colour ID", "text", true), field("productLine", "Product line", "text", true), field("base", "Base", "text", true), field("packSize", "Pack size", "text", true), field("revision", "Revision", "number", true), field("components", "Formula components JSON", "textarea", true),
    ], "formula"),
    entity("paint", "paint_mix_job", "Tinting / Mix Job", "bi-paint-bucket", ["queued", "mixing", "quality_check", "ready", "delivered", "reversed", "cancelled"], [
      field("customerId", "Customer ID"), field("formulaId", "Formula ID", "text", true), field("quantity", "Quantity", "number", true), field("packSize", "Pack size", "text", true), field("batchNo", "Batch number"), field("nonReturnableAccepted", "Non-returnable accepted", "boolean", true),
    ], "mix_job"),
    entity("paint", "paint_quality_check", "Paint Quality Check", "bi-shield-check", ["passed", "conditional", "failed"], [field("mixJobId", "Mix job ID", "text", true), field("result", "Result", "select", true, ["passed", "conditional", "failed"]), field("measurements", "Measurements", "textarea"), field("notes", "Notes", "textarea")], "quality"),
  ],
};

export const FURNITURE_PACK: IndustryPack = {
  code: "furniture",
  name: "Furniture Shop",
  description: "Stock and made-to-order furniture with measurements, approvals, production stages, deposits, procurement, delivery, installation, returns and warranty.",
  icon: "bi-lamp",
  suitableFor: ["Furniture showrooms", "Custom furniture makers", "Interior furnishing suppliers", "Joinery businesses"],
  catalogueHighlights: ["Custom orders and measurements", "Design and production approvals", "Deposits and installments", "Delivery, installation and warranty"],
  operationalStatus: "core_ready",
  registrationEnabled: true,
  modules: ["catalogue", "orders", "measurements", "production", "approvals", "payments", "procurement", "deliveries", "installations", "returns", "warranty", "reports", "settings"],
  sidebarOrder: ["dashboard", "orders", "measurements", "production", "approvals", "payments", "procurement", "deliveries", "installations", "returns", "warranty", "reports", "settings"],
  dashboardWidgets: ["openOrders", "awaitingApproval", "inProduction", "depositBalance", "deliveriesDue", "installationPending", "warrantyOpen"],
  defaultRoles: {
    "Furniture Manager": ["industry.furniture.*", "sales_documents.*", "payments.*", "purchases.*", "reports.*"],
    "Furniture Sales and Design": ["industry.furniture.order.*", "industry.furniture.approval.*", "industry.furniture.design.*", "customers.*", "products.view"],
    "Production Coordinator": ["industry.furniture.order.view", "industry.furniture.production.*", "industry.furniture.measurement.*", "inventory.view"],
    "Delivery and Installation": ["industry.furniture.order.view", "industry.furniture.delivery.*", "industry.furniture.installation.*"],
    "Furniture Accountant": ["industry.furniture.order.view", "industry.furniture.payment.*", "payments.*", "reports.*"],
    "Warranty Controller": ["industry.furniture.warranty.*", "industry.furniture.returns.*", "industry.furniture.order.view"],
  },
  defaultSettings: {
    depositRequired: true,
    minimumDepositPercent: 30,
    designApprovalRequired: true,
    measurementApprovalRequired: true,
    installationSignoffRequired: true,
    warrantyDefaultMonths: 12,
  },
  notificationRules: [
    { code: "furniture-approval-due", eventType: "furniture.approval.due" },
    { code: "furniture-production-delayed", eventType: "furniture.production.delayed" },
    { code: "furniture-delivery-reminder", eventType: "furniture.delivery.reminder", daysBefore: [1] },
    { code: "furniture-warranty-update", eventType: "furniture.warranty.updated" },
  ],
  printFields: ["orderNo", "customer", "variant", "measurements", "finish", "deposit", "balance", "productionStatus", "deliveryDate", "installationStatus"],
  reports: ["orderPipeline", "productionStatus", "approvalAging", "depositBalances", "procurementStatus", "deliveryPerformance", "installationPerformance", "returns", "warrantyClaims", "orderProfitability"],
  entities: [
    entity("furniture", "furniture_order", "Furniture Order", "bi-clipboard2", ["draft", "awaiting_approval", "approved", "in_production", "ready", "delivered", "installed", "cancelled"], [
      field("customerId", "Customer ID", "text", true), field("orderType", "Order type", "select", true, ["stock", "made_to_order"]), field("items", "Items JSON", "textarea", true), field("requiredAt", "Required date", "date"), field("depositAmount", "Deposit", "number"), field("notes", "Notes", "textarea"),
    ], "order"),
    entity("furniture", "furniture_measurement", "Custom Measurement", "bi-rulers", ["draft", "confirmed", "revised"], [field("orderId", "Order ID", "text", true), field("location", "Room / location"), field("measurements", "Measurements JSON", "textarea", true), field("confirmedBy", "Confirmed by")], "order"),
    entity("furniture", "furniture_production_stage", "Production Stage", "bi-hammer", ["planned", "in_progress", "completed", "blocked"], [field("orderId", "Order ID", "text", true), field("stage", "Stage", "text", true), field("assignedTo", "Assigned to"), field("dueAt", "Due date", "date"), field("notes", "Notes", "textarea")], "production"),
    entity("furniture", "furniture_delivery", "Furniture Delivery", "bi-truck", ["planned", "dispatched", "delivered", "failed", "cancelled"], [field("orderId", "Order ID", "text", true), field("scheduledAt", "Scheduled at", "datetime", true), field("address", "Address", "textarea", true), field("crew", "Crew")], "delivery"),
    entity("furniture", "furniture_installation", "Installation", "bi-house-check", ["planned", "in_progress", "completed", "signed_off", "cancelled"], [field("orderId", "Order ID", "text", true), field("scheduledAt", "Scheduled at", "datetime", true), field("installer", "Installer"), field("signoffName", "Customer sign-off")], "installation"),
    entity("furniture", "furniture_warranty_claim", "Warranty Claim", "bi-shield-check", ["open", "inspection", "approved", "rejected", "resolved"], [field("orderId", "Order ID", "text", true), field("issue", "Issue", "textarea", true), field("openedAt", "Opened at", "datetime", true), field("resolution", "Resolution", "textarea")], "warranty"),
  ],
};

export const WORKSHOP_PACK: IndustryPack = {
  code: "workshop",
  name: "Workshop / Garage",
  description: "Vehicle and asset intake, inspections, estimates, job cards, technician work, parts reservation, quality, invoicing, payment, reminders and delivery.",
  icon: "bi-wrench-adjustable-circle",
  suitableFor: ["Vehicle workshops", "Repair centres", "Equipment service businesses", "Auto-electrical workshops"],
  catalogueHighlights: ["Vehicle and service history", "Inspection, estimate and job card", "Parts and labour posting", "Quality-gated delivery"],
  operationalStatus: "core_ready",
  registrationEnabled: true,
  modules: ["vehicles", "inspections", "estimates", "jobs", "parts", "quality", "invoices", "payments", "reminders", "delivery", "reports", "settings"],
  sidebarOrder: ["dashboard", "vehicles", "inspections", "estimates", "jobs", "parts", "quality", "invoices", "payments", "reminders", "delivery", "reports", "settings"],
  dashboardWidgets: ["vehiclesToday", "estimatesAwaitingApproval", "activeJobs", "partsShortages", "qualityPending", "readyForDelivery", "unpaidInvoices"],
  defaultRoles: {
    "Workshop Manager": ["industry.workshop.*", "sales_documents.*", "payments.*", "inventory.*", "reports.*"],
    "Service Advisor": ["industry.workshop.vehicle.*", "industry.workshop.inspection.*", "industry.workshop.estimate.*", "industry.workshop.job.*", "customers.*"],
    Technician: ["industry.workshop.job.view", "industry.workshop.job.manage", "industry.workshop.parts.view", "industry.workshop.inspection.view"],
    "Parts Controller": ["industry.workshop.parts.*", "inventory.*", "products.view"],
    "Quality Inspector": ["industry.workshop.job.view", "industry.workshop.quality.*", "industry.workshop.inspection.view"],
    "Workshop Cashier": ["industry.workshop.billing.*", "industry.workshop.payment.*", "sales_documents.*", "payments.receive"],
  },
  defaultSettings: {
    estimateApprovalRequired: true,
    stockReservationRequired: true,
    allowNegativeParts: false,
    qualityApprovalBeforeDelivery: true,
    odometerRequired: true,
    serviceReminderEnabled: true,
  },
  notificationRules: [
    { code: "workshop-estimate-approval", eventType: "workshop.estimate.awaiting_approval" },
    { code: "workshop-job-due", eventType: "workshop.job.due", daysBefore: [1] },
    { code: "workshop-ready-delivery", eventType: "workshop.vehicle.ready" },
    { code: "workshop-service-reminder", eventType: "workshop.service.due", daysBefore: [30, 14, 7] },
  ],
  printFields: ["jobNo", "vehicle", "registration", "odometer", "customer", "complaint", "inspection", "parts", "labour", "tax", "total", "qualityStatus"],
  reports: ["jobPipeline", "technicianProductivity", "partsUsage", "labourRevenue", "estimateConversion", "qualityResults", "vehicleHistory", "serviceReminders", "receivables", "jobProfitability"],
  entities: [
    entity("workshop", "workshop_vehicle", "Vehicle / Asset", "bi-car-front", ["active", "inactive", "sold"], [field("customerId", "Customer ID", "text", true), field("registrationNo", "Registration number", "text", true), field("vin", "VIN / serial number"), field("make", "Make"), field("model", "Model"), field("year", "Year", "number"), field("odometer", "Odometer", "number")], "vehicle"),
    entity("workshop", "workshop_inspection", "Vehicle Inspection", "bi-clipboard2-check", ["draft", "completed", "approved"], [field("vehicleId", "Vehicle ID", "text", true), field("odometer", "Odometer", "number", true), field("checklist", "Inspection checklist JSON", "textarea", true), field("findings", "Findings", "textarea")], "inspection"),
    entity("workshop", "workshop_estimate", "Repair Estimate", "bi-file-earmark-text", ["draft", "sent", "approved", "rejected", "expired"], [field("vehicleId", "Vehicle ID", "text", true), field("inspectionId", "Inspection ID"), field("parts", "Parts JSON", "textarea"), field("labour", "Labour JSON", "textarea"), field("validUntil", "Valid until", "date")], "estimate"),
    entity("workshop", "workshop_job", "Workshop Job Card", "bi-wrench", ["open", "in_progress", "waiting_parts", "quality_check", "completed", "delivered", "cancelled"], [field("vehicleId", "Vehicle ID", "text", true), field("estimateId", "Estimate ID"), field("technician", "Technician"), field("complaint", "Customer complaint", "textarea"), field("dueAt", "Due date", "datetime")], "job"),
    entity("workshop", "workshop_quality_check", "Workshop Quality Check", "bi-shield-check", ["passed", "failed", "rework"], [field("jobId", "Job ID", "text", true), field("result", "Result", "select", true, ["passed", "failed", "rework"]), field("roadTest", "Road test completed", "boolean"), field("notes", "Notes", "textarea")], "quality"),
  ],
};

export const WHOLESALE_PACK: IndustryPack = {
  code: "wholesale",
  name: "Wholesale / Distribution",
  description: "B2B pricing, bulk orders, customer credit, multi-warehouse allocation, picking, packing, route dispatch, proof of delivery and collections.",
  icon: "bi-boxes",
  suitableFor: ["Distributors", "Importers", "B2B wholesalers", "FMCG distribution", "Trade suppliers"],
  catalogueHighlights: ["Customer price lists and bulk units", "Credit approval and aging", "Pick-pack-dispatch", "Route, POD and collection control"],
  operationalStatus: "core_ready",
  registrationEnabled: true,
  modules: ["priceLists", "unitConversions", "orders", "allocation", "packing", "routes", "dispatch", "proofOfDelivery", "collections", "credit", "ageing", "reports", "settings"],
  sidebarOrder: ["dashboard", "priceLists", "orders", "allocation", "packing", "routes", "dispatch", "proofOfDelivery", "collections", "credit", "ageing", "reports", "settings"],
  dashboardWidgets: ["openOrders", "awaitingAllocation", "packingQueue", "dispatchesToday", "deliveryCompletion", "collectionsDue", "creditExposure"],
  defaultRoles: {
    "Wholesale Manager": ["industry.wholesale.*", "sales_documents.*", "payments.*", "inventory.*", "customers.*", "reports.*"],
    "B2B Salesperson": ["industry.wholesale.pricing.view", "industry.wholesale.order.*", "industry.wholesale.credit.view", "customers.view", "products.view"],
    "Warehouse Allocator": ["industry.wholesale.order.view", "industry.wholesale.allocation.*", "inventory.*", "products.view"],
    "Dispatch Controller": ["industry.wholesale.dispatch.*", "industry.wholesale.delivery.*", "industry.wholesale.order.view"],
    "Collection Officer": ["industry.wholesale.collection.*", "industry.wholesale.credit.view", "payments.receive", "customers.view"],
    "Credit Controller": ["industry.wholesale.credit.*", "industry.wholesale.order.view", "customers.credit.manage", "reports.view"],
  },
  defaultSettings: {
    minimumOrderQuantityEnforced: true,
    creditCheckRequired: true,
    allowPartialAllocation: true,
    proofOfDeliveryRequired: true,
    collectionReferenceRequired: true,
    multiWarehouseAllocation: true,
  },
  notificationRules: [
    { code: "wholesale-order-allocation", eventType: "wholesale.order.awaiting_allocation" },
    { code: "wholesale-dispatch-due", eventType: "wholesale.dispatch.due", daysBefore: [1] },
    { code: "wholesale-collection-due", eventType: "wholesale.collection.due", daysBefore: [7, 3, 1] },
    { code: "wholesale-credit-limit", eventType: "wholesale.credit.limit_reached" },
  ],
  printFields: ["orderNo", "customer", "priceList", "warehouse", "items", "cartons", "route", "dispatchNo", "podReference", "amount", "balance"],
  reports: ["salesOrders", "orderFillRate", "allocationStatus", "packingAccuracy", "dispatchPerformance", "proofOfDelivery", "routePerformance", "collections", "receivablesAging", "creditExposure", "customerProfitability"],
  entities: [
    entity("wholesale", "wholesale_price_list", "Customer Price List", "bi-tags", ["draft", "active", "inactive"], [field("name", "Price list name", "text", true), field("currency", "Currency", "text", true), field("effectiveFrom", "Effective from", "date"), field("effectiveTo", "Effective to", "date"), field("items", "Price list items JSON", "textarea", true)], "pricing"),
    entity("wholesale", "wholesale_order", "Wholesale Sales Order", "bi-box-seam", ["draft", "confirmed", "allocated", "partially_allocated", "packed", "dispatched", "delivered", "cancelled"], [field("customerId", "Customer ID", "text", true), field("priceListId", "Price list ID"), field("items", "Order items JSON", "textarea", true), field("requiredAt", "Required date", "date"), field("warehouseId", "Warehouse ID")], "order"),
    entity("wholesale", "wholesale_packing_list", "Packing List", "bi-box2", ["draft", "packed", "dispatched"], [field("orderId", "Order ID", "text", true), field("items", "Packed items JSON", "textarea", true), field("cartonCount", "Carton count", "number"), field("weight", "Weight", "number")], "allocation"),
    entity("wholesale", "wholesale_dispatch", "Distribution Dispatch", "bi-truck", ["planned", "dispatched", "partially_delivered", "delivered", "failed", "cancelled"], [field("routeId", "Route ID"), field("orders", "Order IDs JSON", "textarea", true), field("driver", "Driver"), field("vehicle", "Vehicle"), field("dispatchedAt", "Dispatched at", "datetime")], "dispatch"),
    entity("wholesale", "wholesale_collection", "Customer Collection", "bi-cash-stack", ["posted", "reversed"], [field("customerId", "Customer ID", "text", true), field("amount", "Amount", "number", true), field("referenceNo", "Reference number", "text", true), field("receivedAt", "Received at", "datetime", true)], "collection"),
  ],
};

export const RELEASE_C_D_LAUNCH_READY_PACKS: Record<string, IndustryPack> = {
  restaurant: RESTAURANT_PACK,
  hardware: HARDWARE_PACK,
  paint: PAINT_PACK,
  furniture: FURNITURE_PACK,
  workshop: WORKSHOP_PACK,
  wholesale: WHOLESALE_PACK,
};
