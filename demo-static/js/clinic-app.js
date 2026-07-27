(function () {
  "use strict";

  const U = window.AxtorPage;
  const API = () => window.AxtorAPI;
  const page = document.body.dataset.clinicPage || "dashboard";
  const state = {
    context: null,
    dashboard: {},
    patients: [],
    practitioners: [],
    appointments: [],
    queue: [],
    encounters: [],
    services: [],
    serviceRequests: [],
    medications: [],
    consents: [],
    followUps: [],
    invoices: [],
    payments: [],
    currency: "QAR"
  };

  const NAV = [
    ["dashboard", "Clinic Dashboard", "clinic-dashboard.html", "bi-speedometer2"],
    ["patients", "Patients", "clinic-patients.html", "bi-people"],
    ["practitioners", "Practitioners", "clinic-practitioners.html", "bi-person-vcard"],
    ["appointments", "Appointments", "clinic-appointments.html", "bi-calendar2-check"],
    ["calendar", "Appointment Calendar", "clinic-appointment-calendar.html", "bi-calendar3"],
    ["queue", "Queue & Check-in", "clinic-queue.html", "bi-person-lines-fill"],
    ["encounters", "Encounters", "clinic-encounters.html", "bi-clipboard2-pulse"],
    ["services", "Services", "clinic-services.html", "bi-heart-pulse"],
    ["service-requests", "Service Requests", "clinic-service-requests.html", "bi-journal-medical"],
    ["medications", "Medications", "clinic-medications.html", "bi-capsule"],
    ["consents", "Consents", "clinic-consents.html", "bi-shield-check"],
    ["billing", "Billing", "clinic-billing.html", "bi-receipt"],
    ["invoices", "Invoices", "clinic-invoices.html", "bi-file-earmark-medical"],
    ["payments", "Payments", "clinic-payments.html", "bi-cash-coin"],
    ["follow-ups", "Follow-ups", "clinic-follow-ups.html", "bi-bell"],
    ["reports", "Clinic Reports", "clinic-reports.html", "bi-graph-up-arrow"],
    ["settings", "Settings", "clinic-settings.html", "bi-gear"]
  ];

  const PAGE_META = {
    dashboard: ["Clinic Dashboard", "Live clinic operations and patient flow"],
    patients: ["Patients", "Patient registration and searchable records"],
    "new-patient": ["New Patient", "Register a patient with consent"],
    "patient-profile": ["Patient Profile", "Longitudinal clinic account summary"],
    practitioners: ["Practitioners", "Clinical team and specialties"],
    "practitioner-profile": ["Practitioner Profile", "Schedule and workload overview"],
    appointments: ["Appointments", "Book, reschedule and manage visits"],
    calendar: ["Appointment Calendar", "Weekly practitioner schedule"],
    "appointment-form": ["Appointment Form", "Create or reschedule an appointment"],
    queue: ["Queue & Check-in", "Live waiting-room workflow"],
    "check-in": ["Patient Check-in", "Add a patient to today’s queue"],
    encounters: ["Encounters", "Practitioner worklist and visit status"],
    "encounter-view": ["Encounter", "Clinical notes, services and medication requests"],
    "clinical-notes": ["Clinical Notes", "Restricted practitioner notes"],
    services: ["Clinic Services", "Service catalogue and pricing"],
    "service-requests": ["Service Requests", "Services requested during encounters"],
    medications: ["Medication Requests", "Practitioner-authorized operational requests"],
    consents: ["Patient Consents", "Consent history and expiry"],
    billing: ["Service Billing", "Create a clinic invoice from services"],
    invoices: ["Clinic Invoices", "Invoice status and outstanding balances"],
    payments: ["Clinic Payments", "Record and review invoice payments"],
    "follow-ups": ["Follow-ups", "Pending callbacks and review appointments"],
    reports: ["Clinic Reports", "Operational and financial summaries"],
    settings: ["Clinic Settings", "Notification rules and clinic preferences"]
  };

  const PAGE_NAV_KEY = {
    "new-patient": "patients",
    "patient-profile": "patients",
    "practitioner-profile": "practitioners",
    "appointment-form": "appointments",
    "check-in": "queue",
    "encounter-view": "encounters",
    "clinical-notes": "encounters"
  };

  function unwrap(value) { return U.data(value) ?? value; }
  function list(value) {
    const data = unwrap(value) || [];
    return Array.isArray(data) ? data : (data.items || data.records || data.documents || []);
  }
  function q(selector, root) { return U.q(selector, root); }
  function qa(selector, root) { return U.qa(selector, root); }
  function esc(value) { return U.esc(value); }
  function num(value) { return Number(value || 0); }
  function fmtDate(value) { return value ? U.date(value) : "—"; }
  function fmtDateTime(value) { return value ? U.datetime(value) : "—"; }
  function dateKey(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function localDateTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function money(value) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: state.currency }).format(num(value)); }
    catch (_) { return `${state.currency} ${num(value).toFixed(2)}`; }
  }
  function idempotency(prefix) { return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`; }
  function queryValue(name) { return new URLSearchParams(location.search).get(name) || ""; }
  function statusClass(status) {
    const value = String(status || "").toLowerCase();
    if (["cancelled", "no_show", "inactive", "deceased", "expired", "rejected"].includes(value)) return "danger";
    if (["partial", "pending", "proposed", "waitlist", "called", "draft", "on_leave"].includes(value)) return "warn";
    if (["completed", "fulfilled", "paid", "active", "confirmed", "arrived", "in_service", "booked"].includes(value)) return "";
    return "neutral";
  }
  function badge(status) {
    return `<span class="clinic-badge ${statusClass(status)}">${esc(String(status || "unknown").replaceAll("_", " "))}</span>`;
  }
  function showError(error) {
    const box = q("#clinicError");
    if (!box) return;
    box.textContent = error?.message || String(error || "Request failed");
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function clearError() { const box = q("#clinicError"); if (box) box.hidden = true; }
  function setBusy(button, text) { return U.loading(button, text || "Saving…"); }
  function apiGet(path, options) { return API().apiGet(path, options).then(unwrap); }
  function apiPost(path, body, options) { return API().apiPost(path, body, options).then(unwrap); }
  function apiPatch(path, body, options) { return API().apiPatch(path, body, options).then(unwrap); }
  function postIdempotent(path, body, prefix) {
    return apiPost(path, body, { headers: { "Idempotency-Key": idempotency(prefix) } });
  }
  function optionRows(rows, selected, label) {
    return rows.map((row) => `<option value="${esc(row.id)}" ${row.id === selected ? "selected" : ""}>${esc(label(row))}</option>`).join("");
  }
  function patientById(id) { return state.patients.find((row) => row.id === id); }
  function practitionerById(id) { return state.practitioners.find((row) => row.id === id); }
  function encounterById(id) { return state.encounters.find((row) => row.id === id); }
  function invoiceBalance(row) { return Math.max(0, num(row.total) - num(row.paidAmount)); }

  function permissions() { return state.context?.access?.permissions || []; }
  function hasPermission(permission) {
    const access = state.context?.access;
    if (access?.isOwner || access?.isAdmin || permissions().includes("*")) return true;
    if (permissions().includes(permission)) return true;
    const parts = String(permission || "").split(".");
    for (let index = parts.length - 1; index > 0; index -= 1) {
      if (permissions().includes(parts.slice(0, index).join(".") + ".*")) return true;
    }
    return false;
  }
  function canAny() { return Array.from(arguments).some(hasPermission); }
  function canPatientWrite() { return canAny("industry.clinic.patient.demographics", "industry.clinic.patient.create", "industry.clinic.patient.update"); }
  function canAppointmentWrite() { return canAny("industry.clinic.appointment.create", "industry.clinic.appointment.update"); }
  function canQueueWrite() { return canAny("industry.clinic.queue.create", "industry.clinic.queue.update"); }
  function canEncounterWrite() { return canAny("industry.clinic.encounter.create", "industry.clinic.encounter.update"); }
  function canMedicationWrite() { return canAny("industry.clinic.medication_request.create", "industry.clinic.medication_request.update"); }
  function canBillingWrite() { return hasPermission("clinic.billing.create"); }
  function canPaymentWrite() { return hasPermission("clinic.payments.create"); }
  function canSettingsWrite() { return canAny("industry.clinic.settings.manage", "clinic.settings.manage"); }

  function shell() {
    const active = PAGE_NAV_KEY[page] || page;
    q("#clinicNav").innerHTML = NAV.map(([key, label, href, icon]) =>
      `<a class="${active === key ? "active" : ""}" href="${href}"><i class="bi ${icon}"></i><span>${esc(label)}</span></a>`
    ).join("");
    const meta = PAGE_META[page] || ["Clinic", "Dedicated clinic operations"];
    q("#clinicTopTitle").textContent = meta[0];
    q("#clinicTopSubtitle").textContent = meta[1];
    const user = state.context?.user || {};
    const business = state.context?.business || {};
    q("#clinicUserName").textContent = user.name || user.email || "User";
    q("#clinicUserAvatar").textContent = String(user.name || user.email || "U").charAt(0).toUpperCase();
    q("#clinicBusinessName").textContent = business.name || "Axtor Clinic";
    q("#clinicBranchText").textContent = `${business.name || "Clinic"} · ${state.context?.plan?.name || "Plan"}`;
  }

  function bindShell() {
    q("#clinicMenuBtn")?.addEventListener("click", () => q(".clinic-shell")?.classList.toggle("sidebar-open"));
    q(".clinic-sidebar-backdrop")?.addEventListener("click", () => q(".clinic-shell")?.classList.remove("sidebar-open"));
    q("#clinicLogout")?.addEventListener("click", async () => {
      try { await API().apiPost("/api/v1/auth/logout", {}); } catch (_) {}
      API().clearAuthSession();
      location.replace("login.html");
    });
  }

  function hero(title, copy, actions) {
    return `<section class="clinic-hero"><span class="clinic-eyebrow">Dedicated Clinic Frontend</span><h2>${esc(title)}</h2><p>${esc(copy)}</p>${actions ? `<div class="clinic-hero-actions">${actions}</div>` : ""}</section>`;
  }
  function card(title, copy, body, extraClass) {
    return `<section class="clinic-card ${extraClass || ""}"><div class="clinic-section-head"><div><h3>${esc(title)}</h3>${copy ? `<p>${esc(copy)}</p>` : ""}</div></div>${body || ""}</section>`;
  }
  function kpi(label, value, detail) {
    return `<article class="clinic-card clinic-kpi"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(detail || "")}</span></article>`;
  }
  function empty(cols, message) { return `<tr><td colspan="${cols}" class="clinic-empty">${esc(message)}</td></tr>`; }
  function table(headers, rows, mapper, minimumWidth) {
    return `<div class="clinic-table-wrap"><table class="clinic-table" style="min-width:${minimumWidth || 760}px"><thead><tr>${headers.map((head) => `<th>${esc(head)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${mapper(row).map((cell) => `<td>${cell?.html ? cell.html : esc(cell?.value ?? cell ?? "")}</td>`).join("")}</tr>`).join("") : empty(headers.length, "No records found")}</tbody></table></div>`;
  }
  function actionLink(href, label, icon, kind) {
    return `<a class="clinic-btn ${kind || "clinic-btn-primary"}" href="${href}"><i class="bi ${icon}"></i>${esc(label)}</a>`;
  }
  function denied(action) {
    return `<div class="clinic-alert"><strong>Read-only access.</strong> Your role does not allow ${esc(action)}. The backend also enforces this restriction.</div>`;
  }

  async function loadCore() {
    const [context, session] = await Promise.all([
      apiGet("/api/v1/commercial/context", { cache: false }),
      apiGet("/api/v1/auth/me", { cache: false })
    ]);
    state.context = context || {};
    state.context.user = state.context.user || session?.user || {};
    state.context.business = state.context.business || session?.business || {};
    const code = String(state.context?.industry?.industry?.code || state.context?.business?.industryCode || state.context?.business?.industry?.code || "").toLowerCase();
    if (code !== "clinic") throw new Error("This dedicated frontend is restricted to authenticated Clinic tenants.");
    state.currency = state.context?.business?.currency || session?.business?.currency || "QAR";
  }
  async function loadPatients(search) { state.patients = list(await apiGet(`/api/v1/clinic/patients?limit=500${search ? `&search=${encodeURIComponent(search)}` : ""}`)); return state.patients; }
  async function loadPractitioners() { state.practitioners = list(await apiGet("/api/v1/clinic/practitioners?limit=500")); return state.practitioners; }
  async function loadAppointments() { state.appointments = list(await apiGet("/api/v1/clinic/appointments?limit=500")); return state.appointments; }
  async function loadQueue() { state.queue = list(await apiGet("/api/v1/clinic/queue?limit=500")); return state.queue; }
  async function loadEncounters() { state.encounters = list(await apiGet("/api/v1/clinic/encounters?limit=500")); return state.encounters; }
  async function loadServices() { state.services = list(await apiGet("/api/v1/clinic/services?limit=500")); return state.services; }
  async function loadServiceRequests() { state.serviceRequests = list(await apiGet("/api/v1/clinic/service-requests?limit=500")); return state.serviceRequests; }
  async function loadMedications() { state.medications = list(await apiGet("/api/v1/clinic/medication-requests?limit=500")); return state.medications; }
  async function loadConsents() { state.consents = list(await apiGet("/api/v1/clinic/consents?limit=500")); return state.consents; }
  async function loadFollowUps() { state.followUps = list(await apiGet("/api/v1/clinic/follow-ups?limit=500")); return state.followUps; }
  async function loadInvoices() { state.invoices = list(await apiGet("/api/v1/clinic/invoices?limit=500")); return state.invoices; }
  async function loadPayments() { state.payments = list(await apiGet("/api/v1/clinic/payments?limit=500")); return state.payments; }

  async function renderDashboard() {
    const root = q("#clinicContent");
    root.innerHTML = hero("Clinic Operations Dashboard", "Today’s appointments, queue, encounters, follow-ups and service billing from tenant-scoped PostgreSQL data.");
    const [dashboard, patients, practitioners, appointments, queue, encounters, followUps, invoices] = await Promise.all([
      apiGet("/api/v1/clinic/dashboard"), loadPatients(), loadPractitioners(), loadAppointments(), loadQueue(), loadEncounters(), loadFollowUps(), loadInvoices()
    ]);
    state.dashboard = dashboard || {};
    const today = dateKey();
    const todayAppointments = appointments.filter((row) => dateKey(row.startAt) === today && row.status !== "cancelled");
    const noShows = todayAppointments.filter((row) => row.status === "no_show").length;
    const completed = encounters.filter((row) => dateKey(row.startedAt) === today && row.status === "completed").length;
    const waiting = queue.filter((row) => ["waiting", "called", "in_service"].includes(row.status));
    const receivables = invoices.reduce((sum, row) => sum + invoiceBalance(row), 0);
    const todayRevenue = invoices.filter((row) => dateKey(row.issuedAt) === today).reduce((sum, row) => sum + num(row.total), 0);
    const actions = `${canAppointmentWrite() ? actionLink("clinic-appointment-form.html", "New appointment", "bi-calendar-plus") : ""}${canPatientWrite() ? actionLink("clinic-new-patient.html", "Register patient", "bi-person-plus", "clinic-btn-soft") : ""}`;
    root.innerHTML = hero("Clinic Operations Dashboard", "Today’s appointments, queue, encounters, follow-ups and service billing from tenant-scoped PostgreSQL data.", actions)
      + `<div class="clinic-grid clinic-kpis">
        ${kpi("Appointments today", todayAppointments.length, "All non-cancelled visits")}
        ${kpi("Waiting patients", waiting.filter((row) => row.status === "waiting").length, "Live waiting room")}
        ${kpi("Checked-in / called", waiting.filter((row) => row.status !== "waiting").length, "Called or in service")}
        ${kpi("Completed encounters", completed, "Today")}
        ${kpi("No-shows", noShows, "Today")}
        ${kpi("Active practitioners", dashboard.activePractitioners ?? practitioners.length, "Clinical team")}
        ${kpi("Service revenue", money(todayRevenue), "Invoices issued today")}
        ${kpi("Receivables", money(receivables), "Outstanding clinic invoices")}
      </div>
      <div class="clinic-two-col">
        ${card("Today’s appointments", "Ordered by scheduled time", table(["Time", "Patient", "Practitioner", "Service", "Status"], todayAppointments.slice(0, 12), (row) => [fmtDateTime(row.startAt), row.patient?.fullName || patientById(row.patientId)?.fullName || row.patientId, row.practitioner?.fullName || practitionerById(row.practitionerId)?.fullName || row.practitionerId, row.service, { html: badge(row.status) }]))}
        ${card("Operational attention", "Items that need staff action", `<div class="clinic-attention-list">
          <a href="clinic-queue.html"><strong>${waiting.length}</strong><span>Active queue entries</span></a>
          <a href="clinic-follow-ups.html"><strong>${followUps.length}</strong><span>Pending follow-ups</span></a>
          <a href="clinic-invoices.html"><strong>${invoices.filter((row) => invoiceBalance(row) > 0).length}</strong><span>Outstanding invoices</span></a>
          <a href="clinic-patients.html"><strong>${patients.length}</strong><span>Registered patients</span></a>
        </div>`)}
      </div>`;
  }

  function patientForm(patient) {
    const current = patient || {};
    return `<form id="patientForm" class="clinic-form-grid">
      <div class="clinic-field"><label>Patient number</label><input id="patientNo" class="form-control" value="${esc(current.patientNo || "")}" ${patient ? "readonly" : "required"}></div>
      <div class="clinic-field"><label>Full name</label><input id="patientName" class="form-control" value="${esc(current.fullName || "")}" required></div>
      <div class="clinic-field"><label>Phone</label><input id="patientPhone" class="form-control" value="${esc(current.phone || "")}" required></div>
      <div class="clinic-field"><label>Date of birth</label><input id="patientDob" type="date" class="form-control" value="${current.dateOfBirth ? esc(String(current.dateOfBirth).slice(0, 10)) : ""}"></div>
      <div class="clinic-field"><label>Status</label><select id="patientStatus" class="form-select"><option value="active">Active</option><option value="inactive" ${current.status === "inactive" ? "selected" : ""}>Inactive</option><option value="deceased" ${current.status === "deceased" ? "selected" : ""}>Deceased</option></select></div>
      <div class="clinic-field clinic-check"><label><input id="patientConsent" type="checkbox" ${current.consentConfirmed ? "checked" : ""} required> Consent confirmed</label><small>Registration is blocked until consent is confirmed.</small></div>
      <div class="wide clinic-actions"><button class="clinic-btn clinic-btn-primary" type="submit">${patient ? "Update patient" : "Register patient"}</button>${patient ? `<a class="clinic-btn clinic-btn-soft" href="clinic-patient-profile.html?id=${encodeURIComponent(patient.id)}">Open profile</a>` : ""}</div>
    </form>`;
  }

  async function renderPatients() {
    const root = q("#clinicContent");
    const rows = await loadPatients();
    root.innerHTML = hero("Patient Register", "Search the clinic’s patient register and open a longitudinal patient profile.", canPatientWrite() ? actionLink("clinic-new-patient.html", "Register patient", "bi-person-plus") : "")
      + `<section class="clinic-card mt-3"><div class="clinic-toolbar"><input id="patientSearch" class="form-control" placeholder="Search patient number, name or phone"><select id="patientStatusFilter" class="form-select"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="deceased">Deceased</option></select></div><div id="patientTable"></div></section>`;
    const draw = () => {
      const search = q("#patientSearch").value.toLowerCase().trim();
      const status = q("#patientStatusFilter").value;
      const filtered = rows.filter((row) => (!status || row.status === status) && (!search || [row.patientNo, row.fullName, row.phone].join(" ").toLowerCase().includes(search)));
      q("#patientTable").innerHTML = table(["Patient no.", "Patient", "Phone", "Date of birth", "Consent", "Status", "Actions"], filtered, (row) => [row.patientNo, row.fullName, row.phone || "—", fmtDate(row.dateOfBirth), row.consentConfirmed ? { html: badge("confirmed") } : { html: badge("missing") }, { html: badge(row.status) }, { html: `<div class="clinic-actions"><a class="clinic-btn-soft" href="clinic-patient-profile.html?id=${encodeURIComponent(row.id)}">Profile</a><a class="clinic-btn-soft" href="clinic-appointment-form.html?patient=${encodeURIComponent(row.id)}">Appointment</a></div>` }], 950);
    };
    q("#patientSearch").addEventListener("input", draw);
    q("#patientStatusFilter").addEventListener("change", draw);
    draw();
  }

  async function renderNewPatient() {
    const root = q("#clinicContent");
    root.innerHTML = hero("Register New Patient", "Create a patient record only after explicit consent is confirmed.")
      + `<div class="clinic-two-col mt-3">${card("Patient details", "Demographic information used by clinic operations", canPatientWrite() ? patientForm() : denied("patient registration"))}${card("Privacy boundary", "Operational safety", `<div class="clinic-alert">Store only information required for clinic operations. Access to clinical notes and medication requests remains role-restricted.</div><ul class="clinic-help-list"><li>Patient number must be unique within the tenant.</li><li>Consent is mandatory before registration.</li><li>All records remain tenant-scoped.</li></ul>`)}</div>`;
    if (!canPatientWrite()) return;
    q("#patientForm").addEventListener("submit", async (event) => {
      event.preventDefault(); clearError(); const done = setBusy(event.submitter, "Registering…");
      try {
        const patient = await apiPost("/api/v1/clinic/patients", {
          patientNo: q("#patientNo").value.trim(), fullName: q("#patientName").value.trim(), phone: q("#patientPhone").value.trim(),
          dateOfBirth: q("#patientDob").value || null, consentConfirmed: q("#patientConsent").checked
        });
        U.toast("Patient registered"); location.href = `clinic-patient-profile.html?id=${encodeURIComponent(patient.id)}`;
      } catch (error) { showError(error); } finally { done(); }
    });
  }

  async function renderPatientProfile() {
    const id = queryValue("id");
    if (!id) throw new Error("Patient id is required.");
    const summary = await apiGet(`/api/v1/clinic/patients/${encodeURIComponent(id)}/summary`);
    const patient = summary.patient;
    state.patients = [patient];
    const root = q("#clinicContent");
    const balance = (summary.invoices || []).reduce((sum, row) => sum + invoiceBalance(row), 0);
    root.innerHTML = hero(patient.fullName, `${patient.patientNo} · ${patient.phone || "No phone"}`, `${actionLink(`clinic-appointment-form.html?patient=${encodeURIComponent(patient.id)}`, "Book appointment", "bi-calendar-plus")}${actionLink(`clinic-check-in.html?patient=${encodeURIComponent(patient.id)}`, "Check in", "bi-person-check", "clinic-btn-soft")}`)
      + `<div class="clinic-grid clinic-kpis">${kpi("Appointments", summary.appointments.length, "All recorded visits")}${kpi("Encounters", summary.encounters.length, "Clinical work records")}${kpi("Pending follow-ups", summary.followUps.filter((row) => row.status === "pending").length, "Needs action")}${kpi("Account balance", money(balance), "Outstanding clinic invoices")}</div>
      <div class="clinic-two-col">
        ${card("Patient record", "Demographics and consent", canPatientWrite() ? patientForm(patient) : denied("patient editing"))}
        ${card("Recent activity", "Latest patient-linked records", `<div class="clinic-tabs" id="profileTabs"><button class="active" data-profile-tab="appointments">Appointments</button><button data-profile-tab="encounters">Encounters</button><button data-profile-tab="consents">Consents</button><button data-profile-tab="invoices">Invoices</button><button data-profile-tab="followups">Follow-ups</button></div><div id="profileTabBody"></div>`)}
      </div>`;
    const renderTab = (tab) => {
      const host = q("#profileTabBody");
      if (tab === "appointments") host.innerHTML = table(["Date", "Service", "Status"], summary.appointments.slice(0, 20), (row) => [fmtDateTime(row.startAt), row.service, { html: badge(row.status) }], 520);
      if (tab === "encounters") host.innerHTML = table(["Started", "Status", "Action"], summary.encounters.slice(0, 20), (row) => [fmtDateTime(row.startedAt), { html: badge(row.status) }, { html: `<a class="clinic-btn-soft" href="clinic-encounter-view.html?id=${encodeURIComponent(row.id)}">Open</a>` }], 520);
      if (tab === "consents") host.innerHTML = table(["Type", "Confirmed", "Expires"], summary.consents.slice(0, 20), (row) => [row.consentType, row.confirmed ? "Yes" : "No", fmtDate(row.expiresAt)], 520);
      if (tab === "invoices") host.innerHTML = table(["Invoice", "Total", "Balance", "Status"], summary.invoices.slice(0, 20), (row) => [row.invoiceNo, money(row.total), money(invoiceBalance(row)), { html: badge(row.status) }], 600);
      if (tab === "followups") host.innerHTML = table(["Due", "Reason", "Status"], summary.followUps.slice(0, 20), (row) => [fmtDateTime(row.dueAt), row.reason, { html: badge(row.status) }], 560);
    };
    q("#profileTabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-profile-tab]"); if (!button) return;
      qa("button", q("#profileTabs")).forEach((node) => node.classList.remove("active")); button.classList.add("active"); renderTab(button.dataset.profileTab);
    });
    renderTab("appointments");
    if (canPatientWrite()) {
      q("#patientForm").addEventListener("submit", async (event) => {
        event.preventDefault(); const done = setBusy(event.submitter, "Updating…");
        try {
          await apiPatch(`/api/v1/clinic/patients/${encodeURIComponent(patient.id)}`, {
            revision: patient.revision, fullName: q("#patientName").value.trim(), phone: q("#patientPhone").value.trim(),
            dateOfBirth: q("#patientDob").value || null, consentConfirmed: q("#patientConsent").checked, status: q("#patientStatus").value
          });
          U.toast("Patient updated"); location.reload();
        } catch (error) { showError(error); } finally { done(); }
      });
    }
  }

  function practitionerForm(row) {
    return `<form id="practitionerForm" class="clinic-form-grid">
      <div class="clinic-field"><label>Full name</label><input id="practitionerName" class="form-control" required value="${esc(row?.fullName || "")}"></div>
      <div class="clinic-field"><label>Specialty</label><input id="practitionerSpecialty" class="form-control" required value="${esc(row?.specialty || "")}"></div>
      <div class="clinic-field"><label>License reference</label><input id="practitionerLicense" class="form-control" value="${esc(row?.licenseReference || "")}"></div>
      ${row ? `<div class="clinic-field clinic-check"><label><input id="practitionerActive" type="checkbox" ${row.active ? "checked" : ""}> Active practitioner</label></div>` : ""}
      <div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">${row ? "Update practitioner" : "Add practitioner"}</button></div>
    </form>`;
  }

  async function renderPractitioners() {
    const rows = await loadPractitioners();
    const root = q("#clinicContent");
    root.innerHTML = hero("Practitioners", "Maintain the clinical team, specialties and license references.")
      + `<div class="clinic-two-col mt-3">${card("Clinical team", "Active practitioners", `<div id="practitionerTable"></div>`)}${card("Add practitioner", "Manager-only clinical setup", canSettingsWrite() ? practitionerForm() : denied("practitioner administration"))}</div>`;
    q("#practitionerTable").innerHTML = table(["Practitioner", "Specialty", "License", "Status", "Profile"], rows, (row) => [row.fullName, row.specialty, row.licenseReference || "—", { html: badge(row.active ? "active" : "inactive") }, { html: `<a class="clinic-btn-soft" href="clinic-practitioner-profile.html?id=${encodeURIComponent(row.id)}">Open</a>` }], 650);
    if (canSettingsWrite()) q("#practitionerForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const done = setBusy(event.submitter);
      try { await apiPost("/api/v1/clinic/practitioners", { fullName: q("#practitionerName").value.trim(), specialty: q("#practitionerSpecialty").value.trim(), licenseReference: q("#practitionerLicense").value.trim() }); U.toast("Practitioner added"); location.reload(); }
      catch (error) { showError(error); } finally { done(); }
    });
  }

  async function renderPractitionerProfile() {
    const id = queryValue("id");
    await Promise.all([loadPractitioners(), loadAppointments(), loadQueue(), loadEncounters()]);
    const row = practitionerById(id); if (!row) throw new Error("Practitioner not found.");
    const appointments = state.appointments.filter((item) => item.practitionerId === id);
    const activeQueue = state.queue.filter((item) => item.practitionerId === id);
    const encounters = state.encounters.filter((item) => item.practitionerId === id);
    const root = q("#clinicContent");
    root.innerHTML = hero(row.fullName, `${row.specialty} · ${row.licenseReference || "No license reference"}`, actionLink(`clinic-appointment-calendar.html?practitioner=${encodeURIComponent(id)}`, "View schedule", "bi-calendar3"))
      + `<div class="clinic-grid clinic-kpis">${kpi("Appointments", appointments.length, "Recorded schedule")}${kpi("Active queue", activeQueue.length, "Waiting, called or in service")}${kpi("Encounters", encounters.length, "Clinical work records")}${kpi("Status", row.active ? "Active" : "Inactive", "Practitioner availability")}</div>
      <div class="clinic-two-col">${card("Practitioner record", "Specialty and license", canSettingsWrite() ? practitionerForm(row) : denied("practitioner editing"))}${card("Upcoming appointments", "Next scheduled patients", table(["Date", "Patient", "Service", "Status"], appointments.filter((item) => new Date(item.startAt) >= new Date()).slice(0, 20), (item) => [fmtDateTime(item.startAt), item.patient?.fullName || patientById(item.patientId)?.fullName || item.patientId, item.service, { html: badge(item.status) }], 600))}</div>`;
    if (canSettingsWrite()) q("#practitionerForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const done = setBusy(event.submitter);
      try { await apiPatch(`/api/v1/clinic/practitioners/${encodeURIComponent(row.id)}`, { fullName: q("#practitionerName").value.trim(), specialty: q("#practitionerSpecialty").value.trim(), licenseReference: q("#practitionerLicense").value.trim(), active: q("#practitionerActive").checked }); U.toast("Practitioner updated"); location.reload(); }
      catch (error) { showError(error); } finally { done(); }
    });
  }

  function appointmentForm(row) {
    const patientId = row?.patientId || queryValue("patient");
    const start = row?.startAt ? localDateTime(row.startAt) : localDateTime();
    const end = row?.endAt ? localDateTime(row.endAt) : localDateTime(new Date(Date.now() + 30 * 60000));
    return `<form id="appointmentForm" class="clinic-form-grid">
      <div class="clinic-field"><label>Patient</label><select id="appointmentPatient" class="form-select" required><option value="">Select patient…</option>${optionRows(state.patients, patientId, (item) => `${item.patientNo} — ${item.fullName}`)}</select></div>
      <div class="clinic-field"><label>Practitioner</label><select id="appointmentPractitioner" class="form-select" required><option value="">Select practitioner…</option>${optionRows(state.practitioners, row?.practitionerId || "", (item) => `${item.fullName} — ${item.specialty}`)}</select></div>
      <div class="clinic-field"><label>Service</label><input id="appointmentService" class="form-control" required value="${esc(row?.service || "Consultation")}"></div>
      <div class="clinic-field"><label>Room</label><input id="appointmentRoom" class="form-control" value="${esc(row?.room || "")}"></div>
      <div class="clinic-field"><label>Start</label><input id="appointmentStart" type="datetime-local" class="form-control" required value="${esc(start)}"></div>
      <div class="clinic-field"><label>End</label><input id="appointmentEnd" type="datetime-local" class="form-control" required value="${esc(end)}"></div>
      ${row ? `<div class="clinic-field"><label>Status</label><select id="appointmentStatus" class="form-select">${["booked", "confirmed", "arrived", "fulfilled", "cancelled", "no_show", "waitlist"].map((status) => `<option value="${status}" ${row.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}</select></div>` : ""}
      <div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">${row ? "Update appointment" : "Book appointment"}</button></div>
    </form>`;
  }

  async function renderAppointments() {
    await Promise.all([loadPatients(), loadPractitioners(), loadAppointments()]);
    const root = q("#clinicContent");
    root.innerHTML = hero("Appointments", "Search, confirm, check in, reschedule or cancel clinic visits.", canAppointmentWrite() ? `${actionLink("clinic-appointment-form.html", "Book appointment", "bi-calendar-plus")}${actionLink("clinic-appointment-calendar.html", "Calendar", "bi-calendar3", "clinic-btn-soft")}` : "")
      + `<section class="clinic-card mt-3"><div class="clinic-toolbar"><input id="appointmentSearch" class="form-control" placeholder="Search patient, practitioner or service"><select id="appointmentStatusFilter" class="form-select"><option value="">All statuses</option>${["booked", "confirmed", "arrived", "fulfilled", "cancelled", "no_show", "waitlist"].map((value) => `<option value="${value}">${value.replaceAll("_", " ")}</option>`).join("")}</select></div><div id="appointmentTable"></div></section>`;
    const draw = () => {
      const search = q("#appointmentSearch").value.toLowerCase().trim(); const status = q("#appointmentStatusFilter").value;
      const rows = state.appointments.filter((row) => (!status || row.status === status) && (!search || [row.patient?.fullName, row.practitioner?.fullName, row.service, row.room].join(" ").toLowerCase().includes(search)));
      q("#appointmentTable").innerHTML = table(["Date & time", "Patient", "Practitioner", "Service", "Room", "Status", "Actions"], rows, (row) => [fmtDateTime(row.startAt), row.patient?.fullName || patientById(row.patientId)?.fullName || row.patientId, row.practitioner?.fullName || practitionerById(row.practitionerId)?.fullName || row.practitionerId, row.service, row.room || "—", { html: badge(row.status) }, { html: `<div class="clinic-actions"><a class="clinic-btn-soft" href="clinic-appointment-form.html?id=${encodeURIComponent(row.id)}">Edit</a>${canQueueWrite() && ["booked", "confirmed"].includes(row.status) ? `<a class="clinic-btn-primary" href="clinic-check-in.html?appointment=${encodeURIComponent(row.id)}">Check in</a>` : ""}</div>` }], 1050);
    };
    q("#appointmentSearch").addEventListener("input", draw); q("#appointmentStatusFilter").addEventListener("change", draw); draw();
  }

  async function renderAppointmentForm() {
    await Promise.all([loadPatients(), loadPractitioners(), loadAppointments()]);
    const id = queryValue("id"); const row = state.appointments.find((item) => item.id === id) || null;
    const root = q("#clinicContent");
    root.innerHTML = hero(row ? "Reschedule Appointment" : "Book Appointment", "Practitioner and room conflicts are validated by the shared backend.")
      + `<div class="clinic-two-col mt-3">${card("Appointment details", "Patient, practitioner, service and time", canAppointmentWrite() ? appointmentForm(row) : denied("appointment changes"))}${card("Scheduling rules", "Backend-enforced integrity", `<ul class="clinic-help-list"><li>End time must be after start time.</li><li>Practitioners cannot be double-booked.</li><li>A room cannot host overlapping appointments.</li><li>Tenant ownership is checked for patient and practitioner IDs.</li></ul>`)}</div>`;
    if (!canAppointmentWrite()) return;
    q("#appointmentForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const done = setBusy(event.submitter, row ? "Updating…" : "Booking…");
      try {
        const body = { patientId: q("#appointmentPatient").value, practitionerId: q("#appointmentPractitioner").value, service: q("#appointmentService").value.trim(), room: q("#appointmentRoom").value.trim(), startAt: q("#appointmentStart").value, endAt: q("#appointmentEnd").value };
        if (row) { body.revision = row.revision; body.status = q("#appointmentStatus").value; await apiPatch(`/api/v1/clinic/appointments/${encodeURIComponent(row.id)}`, body); }
        else await apiPost("/api/v1/clinic/appointments", body);
        U.toast(row ? "Appointment updated" : "Appointment booked"); location.href = "clinic-appointments.html";
      } catch (error) { showError(error); } finally { done(); }
    });
  }

  async function renderCalendar() {
    await Promise.all([loadPatients(), loadPractitioners(), loadAppointments()]);
    const practitionerFilter = queryValue("practitioner");
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay() + 1);
    const days = Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * 86400000));
    const root = q("#clinicContent");
    root.innerHTML = hero("Appointment Calendar", "A weekly clinic schedule grouped by day and practitioner.", canAppointmentWrite() ? actionLink("clinic-appointment-form.html", "Book appointment", "bi-calendar-plus") : "")
      + `<section class="clinic-card mt-3"><div class="clinic-toolbar"><select id="calendarPractitioner" class="form-select"><option value="">All practitioners</option>${optionRows(state.practitioners, practitionerFilter, (item) => `${item.fullName} — ${item.specialty}`)}</select></div><div id="calendarGrid" class="clinic-calendar"></div></section>`;
    const draw = () => {
      const selected = q("#calendarPractitioner").value;
      q("#calendarGrid").innerHTML = days.map((day) => {
        const key = dateKey(day);
        const rows = state.appointments.filter((row) => dateKey(row.startAt) === key && (!selected || row.practitionerId === selected));
        return `<article class="clinic-day"><h4>${esc(day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))}</h4>${rows.map((row) => `<a class="clinic-slot" href="clinic-appointment-form.html?id=${encodeURIComponent(row.id)}"><strong>${esc(new Date(row.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</strong><br>${esc(row.patient?.fullName || patientById(row.patientId)?.fullName || "Patient")}<br><small>${esc(row.practitioner?.fullName || practitionerById(row.practitionerId)?.fullName || "Practitioner")}</small></a>`).join("") || `<span class="text-muted small">No appointments</span>`}</article>`;
      }).join("");
    };
    q("#calendarPractitioner").addEventListener("change", draw); draw();
  }

  function checkInForm() {
    const appointmentId = queryValue("appointment");
    const appointment = state.appointments.find((row) => row.id === appointmentId);
    const patientId = queryValue("patient") || appointment?.patientId || "";
    const practitionerId = appointment?.practitionerId || "";
    return `<form id="checkInForm" class="clinic-form-grid">
      <div class="clinic-field"><label>Patient</label><select id="checkInPatient" class="form-select" required><option value="">Select patient…</option>${optionRows(state.patients, patientId, (item) => `${item.patientNo} — ${item.fullName}`)}</select></div>
      <div class="clinic-field"><label>Practitioner</label><select id="checkInPractitioner" class="form-select"><option value="">Unassigned</option>${optionRows(state.practitioners, practitionerId, (item) => `${item.fullName} — ${item.specialty}`)}</select></div>
      <div class="clinic-field wide"><label>Appointment</label><select id="checkInAppointment" class="form-select"><option value="">Walk-in / no appointment</option>${state.appointments.filter((row) => ["booked", "confirmed", "arrived"].includes(row.status)).map((row) => `<option value="${esc(row.id)}" ${row.id === appointmentId ? "selected" : ""}>${esc(`${fmtDateTime(row.startAt)} — ${row.patient?.fullName || patientById(row.patientId)?.fullName || row.patientId}`)}</option>`).join("")}</select></div>
      <div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">Check patient in</button></div>
    </form>`;
  }

  async function renderQueue() {
    await Promise.all([loadPatients(), loadPractitioners(), loadAppointments(), loadQueue()]);
    const root = q("#clinicContent");
    root.innerHTML = hero("Live Patient Queue", "Call the next patient, start service and complete waiting-room entries.", canQueueWrite() ? actionLink("clinic-check-in.html", "Check in patient", "bi-person-check") : "")
      + `<section class="clinic-card mt-3"><div class="clinic-section-head"><div><h3>Current queue</h3><p>Waiting duration is calculated from check-in time.</p></div><button id="queueRefresh" class="clinic-btn clinic-btn-soft"><i class="bi bi-arrow-clockwise"></i>Refresh</button></div><div id="queueList" class="clinic-queue-list"></div></section>`;
    const draw = () => {
      q("#queueList").innerHTML = state.queue.length ? state.queue.map((row) => {
        const minutes = Math.max(0, Math.floor((Date.now() - new Date(row.checkedInAt).getTime()) / 60000));
        return `<article class="clinic-queue-item"><div class="clinic-token">#${esc(row.queueNo)}</div><div><strong>${esc(row.patient?.fullName || patientById(row.patientId)?.fullName || row.patientId)}</strong><br><small>${esc(row.patient?.patientNo || patientById(row.patientId)?.patientNo || "")}</small></div><div><span>${esc(row.practitioner?.fullName || practitionerById(row.practitionerId)?.fullName || "Unassigned")}</span><br><small>${minutes} min waiting · ${fmtDateTime(row.checkedInAt)}</small></div><div class="clinic-actions">${badge(row.status)}${canQueueWrite() && row.status === "waiting" ? `<button class="clinic-btn-soft" data-queue-status="called" data-id="${esc(row.id)}">Call</button>` : ""}${canQueueWrite() && row.status === "called" ? `<button class="clinic-btn-primary" data-queue-status="in_service" data-id="${esc(row.id)}">Start</button>` : ""}${canQueueWrite() && row.status === "in_service" ? `<button class="clinic-btn-primary" data-queue-status="completed" data-id="${esc(row.id)}">Complete</button>` : ""}${canEncounterWrite() && row.status === "in_service" ? `<a class="clinic-btn-soft" href="clinic-encounters.html?patient=${encodeURIComponent(row.patientId)}&practitioner=${encodeURIComponent(row.practitionerId || "")}&appointment=${encodeURIComponent(row.appointmentId || "")}">Encounter</a>` : ""}</div></article>`;
      }).join("") : `<div class="clinic-empty">No active queue entries.</div>`;
    };
    q("#queueRefresh").addEventListener("click", async () => { await loadQueue(); draw(); });
    q("#queueList").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-queue-status]"); if (!button) return;
      const done = setBusy(button, "Updating…"); try { await apiPatch(`/api/v1/clinic/queue/${encodeURIComponent(button.dataset.id)}`, { status: button.dataset.queueStatus }); await loadQueue(); draw(); U.toast("Queue updated"); } catch (error) { showError(error); } finally { done(); }
    });
    draw();
  }

  async function renderCheckIn() {
    await Promise.all([loadPatients(), loadPractitioners(), loadAppointments()]);
    const root = q("#clinicContent");
    root.innerHTML = hero("Patient Check-in", "Create a numbered queue entry for an appointment or walk-in patient.")
      + `<div class="clinic-two-col mt-3">${card("Check-in details", "Patient, practitioner and optional appointment", canQueueWrite() ? checkInForm() : denied("patient check-in"))}${card("Queue workflow", "Operational statuses", `<ol class="clinic-help-list"><li>Waiting</li><li>Called</li><li>In service</li><li>Completed</li></ol>`)}</div>`;
    if (!canQueueWrite()) return;
    q("#checkInForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const done = setBusy(event.submitter, "Checking in…");
      try { await apiPost("/api/v1/clinic/queue", { patientId: q("#checkInPatient").value, practitionerId: q("#checkInPractitioner").value || null, appointmentId: q("#checkInAppointment").value || null }); U.toast("Patient checked in"); location.href = "clinic-queue.html"; }
      catch (error) { showError(error); } finally { done(); }
    });
  }

  function encounterForm() {
    const patientId = queryValue("patient"); const practitionerId = queryValue("practitioner"); const appointmentId = queryValue("appointment");
    return `<form id="encounterForm" class="clinic-form-grid">
      <div class="clinic-field"><label>Patient</label><select id="encounterPatient" class="form-select" required><option value="">Select patient…</option>${optionRows(state.patients, patientId, (item) => `${item.patientNo} — ${item.fullName}`)}</select></div>
      <div class="clinic-field"><label>Practitioner</label><select id="encounterPractitioner" class="form-select" required><option value="">Select practitioner…</option>${optionRows(state.practitioners, practitionerId, (item) => `${item.fullName} — ${item.specialty}`)}</select></div>
      <div class="clinic-field wide"><label>Appointment</label><select id="encounterAppointment" class="form-select"><option value="">No linked appointment</option>${state.appointments.map((row) => `<option value="${esc(row.id)}" ${row.id === appointmentId ? "selected" : ""}>${esc(`${fmtDateTime(row.startAt)} — ${row.patient?.fullName || patientById(row.patientId)?.fullName || row.patientId}`)}</option>`).join("")}</select></div>
      <div class="clinic-field wide"><label>Practitioner notes</label><textarea id="encounterNotes" class="form-control" rows="5" placeholder="Restricted clinical notes"></textarea></div>
      <div class="clinic-field clinic-check"><label><input id="encounterFollowUp" type="checkbox"> Follow-up required</label></div>
      <div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">Start encounter</button></div>
    </form>`;
  }

  async function renderEncounters() {
    await Promise.all([loadPatients(), loadPractitioners(), loadAppointments(), loadEncounters()]);
    const root = q("#clinicContent");
    root.innerHTML = hero("Clinical Encounters", "Start a visit, maintain restricted practitioner notes and complete clinical work.")
      + `<div class="clinic-two-col mt-3">${card("Encounter worklist", "Most recent encounters", table(["Started", "Patient", "Practitioner", "Status", "Action"], state.encounters, (row) => [fmtDateTime(row.startedAt), patientById(row.patientId)?.fullName || row.patientId, practitionerById(row.practitionerId)?.fullName || row.practitionerId, { html: badge(row.status) }, { html: `<a class="clinic-btn-soft" href="clinic-encounter-view.html?id=${encodeURIComponent(row.id)}">Open</a>` }], 760))}${card("Start encounter", "Practitioner-only workflow", canEncounterWrite() ? encounterForm() : denied("encounter creation"))}</div>`;
    if (!canEncounterWrite()) return;
    q("#encounterForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const done = setBusy(event.submitter, "Starting…");
      try { const encounter = await apiPost("/api/v1/clinic/encounters", { patientId: q("#encounterPatient").value, practitionerId: q("#encounterPractitioner").value, appointmentId: q("#encounterAppointment").value || null, practitionerNotes: q("#encounterNotes").value.trim(), followUpRequired: q("#encounterFollowUp").checked }); U.toast("Encounter started"); location.href = `clinic-encounter-view.html?id=${encodeURIComponent(encounter.id)}`; }
      catch (error) { showError(error); } finally { done(); }
    });
  }

  async function renderEncounterView() {
    const id = queryValue("id"); if (!id) throw new Error("Encounter id is required.");
    await Promise.all([loadPatients(), loadPractitioners(), loadServices()]);
    const encounter = await apiGet(`/api/v1/clinic/encounters/${encodeURIComponent(id)}`);
    const patient = patientById(encounter.patientId); const practitioner = practitionerById(encounter.practitionerId);
    const root = q("#clinicContent");
    root.innerHTML = hero(`Encounter · ${patient?.fullName || encounter.patientId}`, `${practitioner?.fullName || encounter.practitionerId} · ${fmtDateTime(encounter.startedAt)}`, `${actionLink(`clinic-clinical-notes.html?id=${encodeURIComponent(id)}`, "Clinical notes", "bi-journal-medical")}${actionLink(`clinic-billing.html?patient=${encodeURIComponent(encounter.patientId)}&encounter=${encodeURIComponent(id)}`, "Create invoice", "bi-receipt", "clinic-btn-soft")}`)
      + `<div class="clinic-grid clinic-kpis">${kpi("Status", encounter.status, "Encounter workflow")}${kpi("Services requested", encounter.serviceRequests.length, "Encounter-linked")}${kpi("Medication requests", encounter.medicationRequests.length, "Practitioner-authorized")}${kpi("Follow-up", encounter.followUpRequired ? "Required" : "Not required", "Current encounter")}</div>
      <div class="clinic-two-col">
        ${card("Clinical record", "Restricted practitioner notes", canEncounterWrite() ? `<form id="encounterUpdateForm"><div class="clinic-field"><label>Status</label><select id="encounterStatus" class="form-select"><option value="open">Open</option><option value="in_progress" ${encounter.status === "in_progress" ? "selected" : ""}>In progress</option><option value="completed" ${encounter.status === "completed" ? "selected" : ""}>Completed</option><option value="cancelled" ${encounter.status === "cancelled" ? "selected" : ""}>Cancelled</option></select></div><div class="clinic-field mt-3"><label>Practitioner notes</label><textarea id="encounterNotes" class="form-control" rows="8">${esc(encounter.practitionerNotes || "")}</textarea></div><div class="clinic-check mt-3"><label><input id="encounterFollowUp" type="checkbox" ${encounter.followUpRequired ? "checked" : ""}> Follow-up required</label></div><button class="clinic-btn clinic-btn-primary mt-3" type="submit">Update encounter</button></form>` : denied("clinical note changes"))}
        ${card("Requested services and medications", "Operational requests linked to this encounter", `<div class="clinic-tabs" id="encounterTabs"><button class="active" data-encounter-tab="services">Services</button><button data-encounter-tab="medications">Medications</button></div><div id="encounterTabBody"></div>`)}
      </div>
      <div class="clinic-two-col mt-3">
        ${card("Add service request", "Select a configured clinic service", canEncounterWrite() || canBillingWrite() ? `<form id="serviceRequestForm" class="clinic-form-grid"><div class="clinic-field wide"><label>Service</label><select id="serviceRequestService" class="form-select" required><option value="">Select service…</option>${optionRows(state.services, "", (item) => `${item.code} — ${item.name} (${money(item.price)})`)}</select></div><div class="clinic-field"><label>Quantity</label><input id="serviceRequestQty" type="number" min="0.01" step="0.01" value="1" class="form-control"></div><div class="clinic-field"><label>Unit price</label><input id="serviceRequestPrice" type="number" min="0" step="0.01" class="form-control"></div><div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">Add service</button></div></form>` : denied("service requests"))}
        ${card("Add medication request", "No autonomous prescribing; practitioner authorization is mandatory", canMedicationWrite() ? `<form id="medicationRequestForm" class="clinic-form-grid"><div class="clinic-field wide"><label>Medication</label><input id="medicationText" class="form-control" required></div><div class="clinic-field wide"><label>Practitioner instructions</label><textarea id="medicationInstructions" class="form-control" rows="4"></textarea></div><div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">Create request</button></div></form>` : denied("medication requests"))}
      </div>`;
    const drawTab = (tab) => {
      q("#encounterTabBody").innerHTML = tab === "services"
        ? table(["Service", "Qty", "Unit price", "Status"], encounter.serviceRequests, (row) => [state.services.find((service) => service.id === row.serviceId)?.name || row.serviceId, String(row.quantity), money(row.unitPrice), { html: badge(row.status) }], 560)
        : table(["Medication", "Instructions", "Status", "Requested"], encounter.medicationRequests, (row) => [row.medicationText, row.instructions || "—", { html: badge(row.status) }, fmtDateTime(row.requestedAt)], 620);
    };
    q("#encounterTabs").addEventListener("click", (event) => { const button = event.target.closest("[data-encounter-tab]"); if (!button) return; qa("button", q("#encounterTabs")).forEach((node) => node.classList.remove("active")); button.classList.add("active"); drawTab(button.dataset.encounterTab); }); drawTab("services");
    if (canEncounterWrite()) q("#encounterUpdateForm").addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter); try { await apiPatch(`/api/v1/clinic/encounters/${encodeURIComponent(encounter.id)}`, { revision: encounter.revision, status: q("#encounterStatus").value, practitionerNotes: q("#encounterNotes").value.trim(), followUpRequired: q("#encounterFollowUp").checked }); U.toast("Encounter updated"); location.reload(); } catch (error) { showError(error); } finally { done(); } });
    q("#serviceRequestService")?.addEventListener("change", () => { const service = state.services.find((row) => row.id === q("#serviceRequestService").value); q("#serviceRequestPrice").value = service ? Number(service.price).toFixed(2) : ""; });
    q("#serviceRequestForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter); try { await apiPost("/api/v1/clinic/service-requests", { encounterId: encounter.id, serviceId: q("#serviceRequestService").value, quantity: q("#serviceRequestQty").value, unitPrice: q("#serviceRequestPrice").value }); U.toast("Service requested"); location.reload(); } catch (error) { showError(error); } finally { done(); } });
    q("#medicationRequestForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter); try { await apiPost("/api/v1/clinic/medication-requests", { encounterId: encounter.id, medicationText: q("#medicationText").value.trim(), instructions: q("#medicationInstructions").value.trim() }); U.toast("Medication request created"); location.reload(); } catch (error) { showError(error); } finally { done(); } });
  }

  async function renderClinicalNotes() {
    const id = queryValue("id"); if (!id) throw new Error("Encounter id is required.");
    await Promise.all([loadPatients(), loadPractitioners()]);
    const encounter = await apiGet(`/api/v1/clinic/encounters/${encodeURIComponent(id)}`);
    const root = q("#clinicContent");
    root.innerHTML = hero("Clinical Notes", `${patientById(encounter.patientId)?.fullName || encounter.patientId} · ${practitionerById(encounter.practitionerId)?.fullName || encounter.practitionerId}`)
      + `<div class="clinic-two-col mt-3">${card("Restricted note", "Only authorized practitioners may update this content", canEncounterWrite() ? `<form id="notesForm"><textarea id="clinicalNotes" class="form-control" rows="16">${esc(encounter.practitionerNotes || "")}</textarea><button class="clinic-btn clinic-btn-primary mt-3" type="submit">Save notes</button></form>` : denied("clinical notes"))}${card("Safety boundary", "Clinical decision support is not provided", `<div class="clinic-alert">This system stores operational notes entered by authorized practitioners. It does not diagnose patients or generate autonomous medicine advice.</div><a class="clinic-btn clinic-btn-soft" href="clinic-encounter-view.html?id=${encodeURIComponent(id)}">Back to encounter</a>`)}</div>`;
    q("#notesForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter); try { await apiPatch(`/api/v1/clinic/encounters/${encodeURIComponent(id)}`, { revision: encounter.revision, status: encounter.status, practitionerNotes: q("#clinicalNotes").value.trim(), followUpRequired: encounter.followUpRequired }); U.toast("Clinical notes saved"); location.href = `clinic-encounter-view.html?id=${encodeURIComponent(id)}`; } catch (error) { showError(error); } finally { done(); } });
  }

  async function renderServices() {
    const rows = await loadServices(); const root = q("#clinicContent");
    root.innerHTML = hero("Clinic Service Catalogue", "Configure billable services used by encounters and clinic invoices.")
      + `<div class="clinic-two-col mt-3">${card("Active services", "Tenant-specific service pricing", table(["Code", "Service", "Price", "Status"], rows, (row) => [row.code, row.name, money(row.price), { html: badge(row.active ? "active" : "inactive") }], 560))}${card("Add service", "Manager-only setup", canSettingsWrite() ? `<form id="serviceForm" class="clinic-form-grid"><div class="clinic-field"><label>Code</label><input id="serviceCode" class="form-control" required></div><div class="clinic-field"><label>Name</label><input id="serviceName" class="form-control" required></div><div class="clinic-field wide"><label>Price</label><input id="servicePrice" type="number" min="0" step="0.01" class="form-control" required></div><div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">Add service</button></div></form>` : denied("service catalogue changes"))}</div>`;
    q("#serviceForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter); try { await apiPost("/api/v1/clinic/services", { code: q("#serviceCode").value.trim(), name: q("#serviceName").value.trim(), price: q("#servicePrice").value }); U.toast("Service added"); location.reload(); } catch (error) { showError(error); } finally { done(); } });
  }

  async function renderServiceRequests() {
    await Promise.all([loadServices(), loadEncounters(), loadServiceRequests(), loadPatients()]); const root = q("#clinicContent");
    root.innerHTML = hero("Service Requests", "Monitor services requested during clinical encounters.")
      + `<section class="clinic-card mt-3"><div class="clinic-toolbar"><select id="serviceRequestStatus" class="form-select"><option value="">All statuses</option><option value="requested">Requested</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div><div id="serviceRequestTable"></div></section>`;
    const draw = () => { const status = q("#serviceRequestStatus").value; const rows = state.serviceRequests.filter((row) => !status || row.status === status); q("#serviceRequestTable").innerHTML = table(["Requested", "Patient", "Service", "Qty", "Price", "Status", "Action"], rows, (row) => { const encounter = encounterById(row.encounterId); return [fmtDateTime(row.requestedAt), patientById(encounter?.patientId)?.fullName || encounter?.patientId || "—", state.services.find((item) => item.id === row.serviceId)?.name || row.serviceId, String(row.quantity), money(row.unitPrice), { html: badge(row.status) }, { html: canEncounterWrite() || canBillingWrite() ? `<button class="clinic-btn-soft" data-service-request="${esc(row.id)}" data-status="${row.status === "completed" ? "requested" : "completed"}">${row.status === "completed" ? "Reopen" : "Complete"}</button>` : "—" }]; }, 900); };
    q("#serviceRequestStatus").addEventListener("change", draw); q("#serviceRequestTable").addEventListener("click", async (event) => { const button = event.target.closest("[data-service-request]"); if (!button) return; const done = setBusy(button); try { await apiPatch(`/api/v1/clinic/service-requests/${encodeURIComponent(button.dataset.serviceRequest)}`, { status: button.dataset.status }); await loadServiceRequests(); draw(); U.toast("Service request updated"); } catch (error) { showError(error); } finally { done(); } }); draw();
  }

  async function renderMedications() {
    await Promise.all([loadMedications(), loadEncounters(), loadPatients()]); const root = q("#clinicContent");
    root.innerHTML = hero("Medication Requests", "Review practitioner-authorized operational medication requests. No autonomous prescribing is performed.")
      + `<div class="clinic-alert mt-3">Sensitive medication records require least-privilege access, configured consent and jurisdiction-specific validation.</div><section class="clinic-card"><div class="clinic-toolbar"><select id="medicationStatus" class="form-select"><option value="">All statuses</option><option value="requested">Requested</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div><div id="medicationTable"></div></section>`;
    const draw = () => { const status = q("#medicationStatus").value; const rows = state.medications.filter((row) => !status || row.status === status); q("#medicationTable").innerHTML = table(["Requested", "Patient", "Medication", "Instructions", "Status", "Action"], rows, (row) => { const encounter = encounterById(row.encounterId); return [fmtDateTime(row.requestedAt), patientById(encounter?.patientId)?.fullName || encounter?.patientId || "—", row.medicationText, row.instructions || "—", { html: badge(row.status) }, { html: canMedicationWrite() ? `<button class="clinic-btn-soft" data-medication="${esc(row.id)}" data-status="${row.status === "completed" ? "active" : "completed"}">${row.status === "completed" ? "Reopen" : "Complete"}</button>` : "—" }]; }, 950); };
    q("#medicationStatus").addEventListener("change", draw); q("#medicationTable").addEventListener("click", async (event) => { const button = event.target.closest("[data-medication]"); if (!button) return; const done = setBusy(button); try { await apiPatch(`/api/v1/clinic/medication-requests/${encodeURIComponent(button.dataset.medication)}`, { status: button.dataset.status }); await loadMedications(); draw(); U.toast("Medication request updated"); } catch (error) { showError(error); } finally { done(); } }); draw();
  }

  async function renderConsents() {
    await Promise.all([loadPatients(), loadConsents()]); const root = q("#clinicContent");
    root.innerHTML = hero("Patient Consents", "Maintain explicit consent history with optional expiry dates.")
      + `<div class="clinic-two-col mt-3">${card("Consent history", "Most recent confirmations first", table(["Patient", "Consent type", "Confirmed", "Confirmed at", "Expires"], state.consents, (row) => [patientById(row.patientId)?.fullName || row.patientId, row.consentType, row.confirmed ? "Yes" : "No", fmtDateTime(row.confirmedAt), fmtDate(row.expiresAt)], 760))}${card("Record consent", "Patient-linked consent event", canPatientWrite() ? `<form id="consentForm" class="clinic-form-grid"><div class="clinic-field wide"><label>Patient</label><select id="consentPatient" class="form-select" required><option value="">Select patient…</option>${optionRows(state.patients, queryValue("patient"), (item) => `${item.patientNo} — ${item.fullName}`)}</select></div><div class="clinic-field"><label>Consent type</label><input id="consentType" class="form-control" value="treatment" required></div><div class="clinic-field"><label>Expires</label><input id="consentExpiry" type="date" class="form-control"></div><div class="clinic-field wide"><label>Note</label><textarea id="consentNote" class="form-control" rows="3"></textarea></div><div class="clinic-field clinic-check"><label><input id="consentConfirmed" type="checkbox" checked> Confirmed</label></div><div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">Record consent</button></div></form>` : denied("consent recording"))}</div>`;
    q("#consentForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter); try { await apiPost("/api/v1/clinic/consents", { patientId: q("#consentPatient").value, consentType: q("#consentType").value.trim(), expiresAt: q("#consentExpiry").value || null, note: q("#consentNote").value.trim(), confirmed: q("#consentConfirmed").checked }); U.toast("Consent recorded"); location.reload(); } catch (error) { showError(error); } finally { done(); } });
  }

  function invoiceForm() {
    const patientId = queryValue("patient"); const encounterId = queryValue("encounter");
    return `<form id="invoiceForm">
      <div class="clinic-form-grid"><div class="clinic-field"><label>Invoice number</label><input id="invoiceNo" class="form-control" required value="CL-${Date.now().toString().slice(-8)}"></div><div class="clinic-field"><label>Patient</label><select id="invoicePatient" class="form-select" required><option value="">Select patient…</option>${optionRows(state.patients, patientId, (item) => `${item.patientNo} — ${item.fullName}`)}</select></div><div class="clinic-field wide"><label>Encounter</label><select id="invoiceEncounter" class="form-select"><option value="">No linked encounter</option>${state.encounters.map((row) => `<option value="${esc(row.id)}" ${row.id === encounterId ? "selected" : ""}>${esc(`${fmtDateTime(row.startedAt)} — ${patientById(row.patientId)?.fullName || row.patientId}`)}</option>`).join("")}</select></div></div>
      <div class="clinic-section-head mt-4"><div><h3>Invoice services</h3><p>Service-based billing, not a retail product cart.</p></div><button id="addInvoiceLine" class="clinic-btn clinic-btn-soft" type="button"><i class="bi bi-plus"></i>Add line</button></div>
      <div id="invoiceLines"></div>
      <div class="clinic-form-grid mt-3"><div class="clinic-field"><label>Discount</label><input id="invoiceDiscount" type="number" min="0" step="0.01" value="0" class="form-control"></div><div class="clinic-total-box"><span>Total</span><strong id="invoiceTotal">${money(0)}</strong></div></div>
      <button class="clinic-btn clinic-btn-primary mt-3" type="submit">Create clinic invoice</button>
    </form>`;
  }

  async function renderBilling() {
    await Promise.all([loadPatients(), loadEncounters(), loadServices(), loadInvoices()]); const root = q("#clinicContent");
    root.innerHTML = hero("Service Billing", "Create a patient invoice from clinic services and encounter activity.", actionLink("clinic-invoices.html", "View invoices", "bi-file-earmark-medical", "clinic-btn-soft"))
      + `<div class="clinic-two-col mt-3">${card("New clinic invoice", "Service-based billing", canBillingWrite() ? invoiceForm() : denied("clinic invoice creation"))}${card("Outstanding accounts", "Invoices with remaining balance", table(["Invoice", "Patient", "Balance", "Status"], state.invoices.filter((row) => invoiceBalance(row) > 0).slice(0, 30), (row) => [row.invoiceNo, patientById(row.patientId)?.fullName || row.patientId, money(invoiceBalance(row)), { html: badge(row.status) }], 560))}</div>`;
    if (!canBillingWrite()) return;
    const lines = [{ serviceId: "", description: "Consultation", quantity: 1, unitPrice: 0 }];
    const drawLines = () => {
      q("#invoiceLines").innerHTML = lines.map((line, index) => `<div class="clinic-invoice-line"><select class="form-select" data-line-service="${index}"><option value="">Custom service</option>${optionRows(state.services, line.serviceId, (item) => `${item.code} — ${item.name}`)}</select><input class="form-control" data-line-description="${index}" value="${esc(line.description)}" placeholder="Description"><input class="form-control" data-line-qty="${index}" type="number" min="0.01" step="0.01" value="${esc(line.quantity)}"><input class="form-control" data-line-price="${index}" type="number" min="0" step="0.01" value="${esc(line.unitPrice)}"><button class="clinic-btn clinic-btn-danger" type="button" data-line-remove="${index}"><i class="bi bi-x"></i></button></div>`).join("");
      const total = Math.max(0, lines.reduce((sum, line) => sum + num(line.quantity) * num(line.unitPrice), 0) - num(q("#invoiceDiscount")?.value)); q("#invoiceTotal").textContent = money(total);
    };
    q("#addInvoiceLine").addEventListener("click", () => { lines.push({ serviceId: "", description: "", quantity: 1, unitPrice: 0 }); drawLines(); });
    q("#invoiceLines").addEventListener("input", (event) => { const target = event.target; const index = Number(target.dataset.lineDescription ?? target.dataset.lineQty ?? target.dataset.linePrice); if (!Number.isInteger(index)) return; if (target.dataset.lineDescription !== undefined) lines[index].description = target.value; if (target.dataset.lineQty !== undefined) lines[index].quantity = target.value; if (target.dataset.linePrice !== undefined) lines[index].unitPrice = target.value; drawLines(); });
    q("#invoiceLines").addEventListener("change", (event) => { const index = Number(event.target.dataset.lineService); if (!Number.isInteger(index)) return; const service = state.services.find((row) => row.id === event.target.value); lines[index].serviceId = service?.id || ""; if (service) { lines[index].description = service.name; lines[index].unitPrice = Number(service.price); } drawLines(); });
    q("#invoiceLines").addEventListener("click", (event) => { const button = event.target.closest("[data-line-remove]"); if (!button) return; if (lines.length === 1) return U.toast("At least one invoice line is required", "error"); lines.splice(Number(button.dataset.lineRemove), 1); drawLines(); });
    q("#invoiceDiscount").addEventListener("input", drawLines); drawLines();
    q("#invoiceForm").addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter, "Creating…"); try { const invoice = await postIdempotent("/api/v1/clinic/invoices", { invoiceNo: q("#invoiceNo").value.trim(), patientId: q("#invoicePatient").value, encounterId: q("#invoiceEncounter").value || null, discount: q("#invoiceDiscount").value, items: lines.map((line) => ({ serviceId: line.serviceId || null, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })) }, "clinic-invoice"); U.toast("Clinic invoice created"); location.href = `clinic-invoices.html?id=${encodeURIComponent(invoice.id)}`; } catch (error) { showError(error); } finally { done(); } });
  }

  async function renderInvoices() {
    await Promise.all([loadPatients(), loadInvoices()]); const root = q("#clinicContent"); const selectedId = queryValue("id");
    root.innerHTML = hero("Clinic Invoices", "Review service invoices, paid amounts and outstanding patient balances.", canBillingWrite() ? actionLink("clinic-billing.html", "New invoice", "bi-plus-circle") : "")
      + `<section class="clinic-card mt-3"><div class="clinic-toolbar"><input id="invoiceSearch" class="form-control" placeholder="Search invoice or patient"><select id="invoiceStatus" class="form-select"><option value="">All statuses</option><option value="due">Due</option><option value="partial">Partial</option><option value="paid">Paid</option></select></div><div id="invoiceTable"></div></section><div id="invoiceDetail" class="mt-3"></div>`;
    const draw = () => { const search = q("#invoiceSearch").value.toLowerCase().trim(); const status = q("#invoiceStatus").value; const rows = state.invoices.filter((row) => (!status || row.status === status) && (!search || [row.invoiceNo, patientById(row.patientId)?.fullName].join(" ").toLowerCase().includes(search))); q("#invoiceTable").innerHTML = table(["Invoice", "Issued", "Patient", "Total", "Paid", "Balance", "Status", "Action"], rows, (row) => [row.invoiceNo, fmtDateTime(row.issuedAt), patientById(row.patientId)?.fullName || row.patientId, money(row.total), money(row.paidAmount), money(invoiceBalance(row)), { html: badge(row.status) }, { html: `<a class="clinic-btn-soft" href="clinic-invoices.html?id=${encodeURIComponent(row.id)}">View</a>${invoiceBalance(row) > 0 ? `<a class="clinic-btn-primary" href="clinic-payments.html?invoice=${encodeURIComponent(row.id)}">Pay</a>` : ""}` }], 1050); };
    q("#invoiceSearch").addEventListener("input", draw); q("#invoiceStatus").addEventListener("change", draw); draw();
    if (selectedId) { const detail = await apiGet(`/api/v1/clinic/invoices/${encodeURIComponent(selectedId)}`); q("#invoiceDetail").innerHTML = card(`Invoice ${detail.invoiceNo}`, `${fmtDateTime(detail.issuedAt)} · ${patientById(detail.patientId)?.fullName || detail.patientId}`, `${table(["Description", "Qty", "Unit price", "Line total"], detail.items, (row) => [row.description, String(row.quantity), money(row.unitPrice), money(row.lineTotal)], 620)}<div class="clinic-invoice-summary"><span>Subtotal <strong>${money(detail.subtotal)}</strong></span><span>Discount <strong>${money(detail.discount)}</strong></span><span>Total <strong>${money(detail.total)}</strong></span><span>Paid <strong>${money(detail.paidAmount)}</strong></span><span>Balance <strong>${money(invoiceBalance(detail))}</strong></span></div>${detail.payments.length ? `<h4 class="mt-4">Payments</h4>${table(["Paid at", "Method", "Reference", "Amount"], detail.payments, (row) => [fmtDateTime(row.paidAt), row.paymentMethod, row.reference || "—", money(row.amount)], 560)}` : ""}`); }
  }

  async function renderPayments() {
    await Promise.all([loadPatients(), loadInvoices(), loadPayments()]); const root = q("#clinicContent"); const selected = queryValue("invoice");
    root.innerHTML = hero("Clinic Payments", "Allocate payments to outstanding clinic invoices with idempotency protection.")
      + `<div class="clinic-two-col mt-3">${card("Payment history", "Most recent payments", table(["Paid at", "Invoice", "Patient", "Method", "Amount"], state.payments, (row) => { const invoice = state.invoices.find((item) => item.id === row.invoiceId); return [fmtDateTime(row.paidAt), invoice?.invoiceNo || row.invoiceId, patientById(invoice?.patientId)?.fullName || invoice?.patientId || "—", row.paymentMethod, money(row.amount)]; }, 720))}${card("Record payment", "Outstanding invoices only", canPaymentWrite() ? `<form id="paymentForm" class="clinic-form-grid"><div class="clinic-field wide"><label>Invoice</label><select id="paymentInvoice" class="form-select" required><option value="">Select invoice…</option>${state.invoices.filter((row) => invoiceBalance(row) > 0).map((row) => `<option value="${esc(row.id)}" ${row.id === selected ? "selected" : ""}>${esc(`${row.invoiceNo} — ${patientById(row.patientId)?.fullName || row.patientId} — ${money(invoiceBalance(row))}`)}</option>`).join("")}</select></div><div class="clinic-field"><label>Amount</label><input id="paymentAmount" type="number" min="0.01" step="0.01" class="form-control" required></div><div class="clinic-field"><label>Method</label><select id="paymentMethod" class="form-select"><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option><option value="online">Online</option></select></div><div class="clinic-field wide"><label>Reference</label><input id="paymentReference" class="form-control"></div><div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">Record payment</button></div></form>` : denied("clinic payments"))}</div>`;
    const syncAmount = () => { const invoice = state.invoices.find((row) => row.id === q("#paymentInvoice")?.value); if (invoice) q("#paymentAmount").value = invoiceBalance(invoice).toFixed(2); };
    q("#paymentInvoice")?.addEventListener("change", syncAmount); if (selected) syncAmount();
    q("#paymentForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter, "Recording…"); try { await postIdempotent("/api/v1/clinic/payments", { invoiceId: q("#paymentInvoice").value, amount: q("#paymentAmount").value, paymentMethod: q("#paymentMethod").value, reference: q("#paymentReference").value.trim() }, "clinic-payment"); U.toast("Payment recorded"); location.reload(); } catch (error) { showError(error); } finally { done(); } });
  }

  async function renderFollowUps() {
    await Promise.all([loadPatients(), loadPractitioners(), loadFollowUps()]); const root = q("#clinicContent");
    root.innerHTML = hero("Patient Follow-ups", "Schedule and complete practitioner-linked follow-up actions.")
      + `<div class="clinic-two-col mt-3">${card("Pending follow-ups", "Ordered by due time", `<div id="followUpTable"></div>`)}${card("Schedule follow-up", "Patient callback or review", canEncounterWrite() || canAppointmentWrite() ? `<form id="followUpForm" class="clinic-form-grid"><div class="clinic-field wide"><label>Patient</label><select id="followUpPatient" class="form-select" required><option value="">Select patient…</option>${optionRows(state.patients, queryValue("patient"), (item) => `${item.patientNo} — ${item.fullName}`)}</select></div><div class="clinic-field wide"><label>Practitioner</label><select id="followUpPractitioner" class="form-select"><option value="">Unassigned</option>${optionRows(state.practitioners, "", (item) => `${item.fullName} — ${item.specialty}`)}</select></div><div class="clinic-field"><label>Due</label><input id="followUpDue" type="datetime-local" class="form-control" required value="${localDateTime(new Date(Date.now() + 86400000))}"></div><div class="clinic-field"><label>Reason</label><input id="followUpReason" class="form-control" required></div><div class="wide"><button class="clinic-btn clinic-btn-primary" type="submit">Schedule follow-up</button></div></form>` : denied("follow-up scheduling"))}</div>`;
    const draw = () => { q("#followUpTable").innerHTML = table(["Due", "Patient", "Practitioner", "Reason", "Status", "Action"], state.followUps, (row) => [fmtDateTime(row.dueAt), row.patient?.fullName || patientById(row.patientId)?.fullName || row.patientId, row.practitioner?.fullName || practitionerById(row.practitionerId)?.fullName || "Unassigned", row.reason, { html: badge(row.status) }, { html: (canEncounterWrite() || canAppointmentWrite()) ? `<button class="clinic-btn-soft" data-follow-up="${esc(row.id)}" data-revision="${esc(row.revision)}">Complete</button>` : "—" }], 900); };
    q("#followUpTable").addEventListener("click", async (event) => { const button = event.target.closest("[data-follow-up]"); if (!button) return; const done = setBusy(button); try { await apiPatch(`/api/v1/clinic/follow-ups/${encodeURIComponent(button.dataset.followUp)}`, { revision: Number(button.dataset.revision), status: "completed" }); await loadFollowUps(); draw(); U.toast("Follow-up completed"); } catch (error) { showError(error); } finally { done(); } }); draw();
    q("#followUpForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const done = setBusy(event.submitter); try { await apiPost("/api/v1/clinic/follow-ups", { patientId: q("#followUpPatient").value, practitionerId: q("#followUpPractitioner").value || null, dueAt: q("#followUpDue").value, reason: q("#followUpReason").value.trim() }); U.toast("Follow-up scheduled"); location.reload(); } catch (error) { showError(error); } finally { done(); } });
  }

  async function renderReports() {
    const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10); const defaultTo = new Date().toISOString().slice(0, 10);
    const root = q("#clinicContent"); root.innerHTML = hero("Clinic Reports", "Filter operational and financial summaries by date range.")
      + `<section class="clinic-card mt-3"><form id="reportForm" class="clinic-toolbar"><div><label class="form-label">From</label><input id="reportFrom" type="date" class="form-control" value="${defaultFrom}"></div><div><label class="form-label">To</label><input id="reportTo" type="date" class="form-control" value="${defaultTo}"></div><button class="clinic-btn clinic-btn-primary align-self-end" type="submit">Run report</button></form><div id="reportOutput"></div></section>`;
    const run = async () => { const [filtered, summary] = await Promise.all([apiGet(`/api/v1/clinic/reports/filtered?from=${encodeURIComponent(q("#reportFrom").value)}&to=${encodeURIComponent(q("#reportTo").value)}`), apiGet("/api/v1/clinic/reports/summary")]); q("#reportOutput").innerHTML = `<div class="clinic-grid clinic-kpis">${kpi("Patients", summary.patients || 0, "Registered")}${kpi("Encounters", summary.encounters || 0, "All time")}${kpi("Pending follow-ups", summary.pendingFollowUps || 0, "Current")}${kpi("Invoices", filtered.invoiceCount || 0, "Selected period")}${kpi("Invoiced", money(filtered.invoiced), "Selected period")}${kpi("Invoice paid", money(filtered.invoicePaid), "Allocated to invoices")}${kpi("Payments received", money(filtered.payments), "Selected period")}${kpi("Collection rate", num(filtered.invoiced) ? `${Math.round(num(filtered.invoicePaid) / num(filtered.invoiced) * 100)}%` : "0%", "Paid ÷ invoiced")}</div>`; };
    q("#reportForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await run(); } catch (error) { showError(error); } }); await run();
  }

  async function renderSettings() {
    const rules = list(await apiGet("/api/v1/clinic/notification-rules")); const root = q("#clinicContent");
    root.innerHTML = hero("Clinic Settings", "Configure reminder rules without changing other industry frontends.")
      + `<div class="clinic-two-col mt-3">${card("Notification rules", "Appointment and follow-up reminders", `<div id="ruleList">${rules.length ? rules.map((rule) => `<form class="clinic-rule" data-rule-form><input type="hidden" name="eventKey" value="${esc(rule.eventKey)}"><div><strong>${esc(rule.eventKey.replaceAll("_", " "))}</strong><small>${esc(rule.channel)}</small></div><input name="daysBefore" type="number" min="0" class="form-control" value="${esc(rule.daysBefore)}"><label><input name="active" type="checkbox" ${rule.active ? "checked" : ""}> Active</label>${canSettingsWrite() ? `<button class="clinic-btn clinic-btn-soft" type="submit">Save</button>` : ""}</form>`).join("") : `<div class="clinic-empty">No notification rules configured.</div>`}</div>`)}${card("Frontend release", "Independent Clinic branch", `<dl class="clinic-definition"><dt>Branch</dt><dd>frontend-clinic</dd><dt>API</dt><dd>${esc(API().getApiBaseUrl())}</dd><dt>Industry</dt><dd>Clinic only</dd><dt>Backend</dt><dd>Shared tenant-scoped PostgreSQL</dd></dl><div class="clinic-alert">A Clinic frontend fix can be released without changing Pharmacy, Gym, School or Retail frontend code.</div>`)}</div>`;
    q("#ruleList").addEventListener("submit", async (event) => { const form = event.target.closest("[data-rule-form]"); if (!form) return; event.preventDefault(); const button = form.querySelector("button"); const done = setBusy(button); try { await API().apiPut("/api/v1/clinic/notification-rules", { eventKey: form.elements.eventKey.value, daysBefore: form.elements.daysBefore.value, channel: "in_app", active: form.elements.active.checked }); U.toast("Notification rule saved"); } catch (error) { showError(error); } finally { done(); } });
  }

  const renderers = {
    dashboard: renderDashboard,
    patients: renderPatients,
    "new-patient": renderNewPatient,
    "patient-profile": renderPatientProfile,
    practitioners: renderPractitioners,
    "practitioner-profile": renderPractitionerProfile,
    appointments: renderAppointments,
    calendar: renderCalendar,
    "appointment-form": renderAppointmentForm,
    queue: renderQueue,
    "check-in": renderCheckIn,
    encounters: renderEncounters,
    "encounter-view": renderEncounterView,
    "clinical-notes": renderClinicalNotes,
    services: renderServices,
    "service-requests": renderServiceRequests,
    medications: renderMedications,
    consents: renderConsents,
    billing: renderBilling,
    invoices: renderInvoices,
    payments: renderPayments,
    "follow-ups": renderFollowUps,
    reports: renderReports,
    settings: renderSettings
  };

  U.run(async function () {
    try {
      if (!API()?.getToken?.()) { API().goToLogin("authentication-required", { clearToken: false }); return; }
      await loadCore(); shell(); bindShell();
      const render = renderers[page]; if (!render) throw new Error(`Unsupported Clinic page: ${page}`);
      await render();
    } catch (error) { showError(error); }
  });
})();
