(function () {
  "use strict";

  const API = "/api/v1/school";
  const PAGE = document.body.dataset.page || "dashboard";
  const NAV = [
    ["school-dashboard.html", "Dashboard"],
    ["school-admissions.html", "Admissions"],
    ["school-students.html", "Students"],
    ["school-guardians.html", "Guardians"],
    ["school-classes.html", "Classes"],
    ["school-enrollments.html", "Enrollments"],
    ["school-attendance.html", "Attendance"],
    ["school-timetable.html", "Timetable"],
    ["school-fees.html", "Fees"],
    ["school-fee-payments.html", "Fee Payments"],
    ["school-assessments.html", "Assessments"],
    ["school-results.html", "Results"],
    ["school-teachers.html", "Teachers"],
    ["school-employees.html", "Employees"],
    ["school-payroll.html", "Payroll"],
    ["school-reports.html", "Reports"],
    ["school-settings.html", "Settings"],
    ["school-academic-years.html", "Academic Years"],
    ["school-subjects.html", "Subjects"],
    ["school-rooms.html", "Rooms"]
  ];

  const FIELD_MAP = {
    admissions: [
      ["applicationNo", "Application number", "text", true],
      ["fullName", "Applicant name", "text", true],
      ["requestedGrade", "Requested grade", "text", false],
      ["guardianName", "Guardian name", "text", false],
      ["guardianPhone", "Guardian phone", "text", false]
    ],
    students: [
      ["admissionNo", "Admission number", "text", true],
      ["fullName", "Student name", "text", true],
      ["dateOfBirth", "Date of birth", "date", false]
    ],
    guardians: [
      ["fullName", "Guardian name", "text", true],
      ["phone", "Phone", "text", true],
      ["email", "Email", "email", false],
      ["relation", "Relationship", "text", false]
    ],
    classes: [
      ["academicYear", "Academic year", "text", true],
      ["grade", "Grade", "text", true],
      ["section", "Section", "text", true],
      ["capacity", "Capacity", "number", true]
    ],
    enrollments: [
      ["studentId", "Student ID", "text", true],
      ["classSectionId", "Class section ID", "text", true]
    ],
    attendance: [
      ["studentId", "Student ID", "text", true],
      ["classSectionId", "Class section ID", "text", true],
      ["attendanceDate", "Attendance date", "date", true],
      ["status", "Status", "select", true, ["present", "absent", "late", "excused"]],
      ["note", "Note", "text", false]
    ],
    fees: [
      ["studentId", "Student ID", "text", true],
      ["feeHeadId", "Fee head ID", "text", true],
      ["dueDate", "Due date", "date", true],
      ["amount", "Amount", "number", true]
    ],
    "fee-payments": [
      ["studentFeeId", "Student fee ID", "text", true],
      ["amount", "Amount", "number", true],
      ["paymentMethod", "Payment method", "select", true, ["cash", "card", "bank_transfer", "cheque"]],
      ["reference", "Reference", "text", false]
    ],
    "academic-years": [
      ["name", "Academic year", "text", true],
      ["startsOn", "Starts on", "date", true],
      ["endsOn", "Ends on", "date", true],
      ["active", "Set active", "select", false, ["true", "false"]]
    ],
    subjects: [
      ["code", "Subject code", "text", true],
      ["name", "Subject name", "text", true]
    ],
    teachers: [
      ["employeeNo", "Employee number", "text", false],
      ["fullName", "Teacher name", "text", true],
      ["phone", "Phone", "text", false],
      ["email", "Email", "email", false]
    ],
    rooms: [
      ["code", "Room code", "text", true],
      ["name", "Room name", "text", true],
      ["capacity", "Capacity", "number", true]
    ],
    timetable: [
      ["classSectionId", "Class section ID", "text", true],
      ["subjectId", "Subject ID", "text", true],
      ["teacherId", "Teacher ID", "text", true],
      ["roomId", "Room ID", "text", true],
      ["weekday", "Weekday 1-7", "number", true],
      ["startMinute", "Start minute", "number", true],
      ["endMinute", "End minute", "number", true]
    ],
    assessments: [
      ["classSectionId", "Class section ID", "text", true],
      ["subjectId", "Subject ID", "text", true],
      ["termId", "Term ID", "text", false],
      ["name", "Assessment name", "text", true],
      ["maxMarks", "Maximum marks", "number", true],
      ["assessmentDate", "Assessment date", "date", false]
    ],
    results: [
      ["assessmentId", "Assessment ID", "text", true],
      ["studentId", "Student ID", "text", true],
      ["marks", "Marks", "number", true],
      ["grade", "Grade", "text", false],
      ["remarks", "Remarks", "text", false]
    ],
    employees: [
      ["employeeNo", "Employee number", "text", true],
      ["fullName", "Employee name", "text", true],
      ["roleTitle", "Role title", "text", true],
      ["monthlySalary", "Monthly salary", "number", true]
    ],
    payroll: [
      ["period", "Payroll period", "text", true],
      ["paidAmount", "Paid amount", "number", false]
    ],
    settings: [
      ["eventKey", "Event key", "text", true],
      ["channel", "Channel", "select", true, ["in_app", "email", "sms", "whatsapp"]],
      ["daysBefore", "Days before", "number", false],
      ["active", "Active", "select", false, ["true", "false"]]
    ]
  };

  const PAGE_MAP = {
    dashboard: { title: "School Operations Dashboard", subtitle: "Admissions, academics, attendance, fees and workforce control" },
    admissions: { title: "Admissions Pipeline", list: "/applicants", create: "/applicants", columns: [["applicationNo", "Application"], ["fullName", "Applicant"], ["requestedGrade", "Grade"], ["guardianName", "Guardian"], ["status", "Status"]] },
    students: { title: "Student Register", list: "/students", create: "/students", columns: [["admissionNo", "Admission"], ["fullName", "Student"], ["dateOfBirth", "DOB"], ["status", "Status"]] },
    guardians: { title: "Guardians", list: "/guardians", create: "/guardians", columns: [["fullName", "Guardian"], ["phone", "Phone"], ["email", "Email"], ["relation", "Relation"]] },
    classes: { title: "Classes & Sections", list: "/classes", create: "/classes", columns: [["academicYear", "Year"], ["grade", "Grade"], ["section", "Section"], ["capacity", "Capacity"]] },
    enrollments: { title: "Class Enrollments", list: "/enrollments", create: "/enrollments", columns: [["student.fullName", "Student"], ["classSection.grade", "Grade"], ["classSection.section", "Section"], ["status", "Status"]] },
    attendance: { title: "Attendance Register", list: "/attendance", create: "/attendance", columns: [["attendanceDate", "Date"], ["student.fullName", "Student"], ["classSection.grade", "Grade"], ["status", "Status"], ["note", "Note"]] },
    fees: { title: "Student Fees", list: "/fees", create: "/fees", columns: [["student.fullName", "Student"], ["feeHead.name", "Fee Head"], ["dueDate", "Due"], ["amount", "Amount"], ["paidAmount", "Paid"], ["status", "Status"]] },
    "fee-payments": { title: "Fee Payments", list: "/fee-payments", create: "/fee-payments", idempotent: true, columns: [["paidAt", "Paid At"], ["studentFeeId", "Fee ID"], ["amount", "Amount"], ["paymentMethod", "Method"], ["reference", "Reference"]] },
    "academic-years": { title: "Academic Years", list: "/academic-years", create: "/academic-years", columns: [["name", "Academic Year"], ["startsOn", "Starts"], ["endsOn", "Ends"], ["active", "Active"]] },
    subjects: { title: "Subjects", list: "/subjects", create: "/subjects", columns: [["code", "Code"], ["name", "Subject"], ["active", "Active"]] },
    teachers: { title: "Teachers", list: "/teachers", create: "/teachers", columns: [["employeeNo", "Employee No"], ["fullName", "Teacher"], ["phone", "Phone"], ["email", "Email"]] },
    rooms: { title: "Rooms", list: "/rooms", create: "/rooms", columns: [["code", "Code"], ["name", "Room"], ["capacity", "Capacity"]] },
    timetable: { title: "Timetable", list: "/timetable", create: "/timetable", columns: [["weekday", "Day"], ["startMinute", "Start"], ["endMinute", "End"], ["classSectionId", "Class"], ["teacherId", "Teacher"], ["roomId", "Room"]] },
    assessments: { title: "Assessments", list: "/assessments", create: "/assessments", columns: [["name", "Assessment"], ["assessmentDate", "Date"], ["classSectionId", "Class"], ["subjectId", "Subject"], ["maxMarks", "Max Marks"], ["status", "Status"]] },
    results: { title: "Results", list: "/results", create: "/results", columns: [["assessmentId", "Assessment"], ["studentId", "Student"], ["marks", "Marks"], ["grade", "Grade"], ["publishedAt", "Published"]] },
    employees: { title: "Employees", list: "/employees", create: "/employees", columns: [["employeeNo", "Employee No"], ["fullName", "Employee"], ["roleTitle", "Role"], ["monthlySalary", "Monthly Salary"]] },
    payroll: { title: "Payroll Runs", list: "/payroll-runs", create: "/payroll-runs", idempotent: true, columns: [["period", "Period"], ["grossAmount", "Gross"], ["paidAmount", "Paid"], ["status", "Status"], ["postedAt", "Posted"]] },
    reports: { title: "School Reports", subtitle: "Date-filtered fee collection, payroll and operational summaries" },
    settings: { title: "School Notification Settings", list: "/notification-rules", create: "/notification-rules", put: true, columns: [["eventKey", "Event"], ["channel", "Channel"], ["daysBefore", "Days Before"], ["active", "Active"]] },
    "student-profile": { title: "Student Profile", subtitle: "Longitudinal enrollment, guardian, attendance, fee and result history" }
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  function nestedValue(row, path) {
    return path.split(".").reduce(function (current, key) {
      return current == null ? current : current[key];
    }, row);
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(text + "T00:00:00").toLocaleDateString();
    return text;
  }

  function renderShell() {
    const config = PAGE_MAP[PAGE] || PAGE_MAP.dashboard;
    const links = NAV.map(function (item) {
      const active = item[0] === window.location.pathname.split("/").pop() ? "active" : "";
      return '<a class="' + active + '" href="' + item[0] + '">' + escapeHtml(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML =
      '<div class="school-shell">' +
        '<aside class="school-nav"><div class="school-brand">AXTOR · SCHOOL</div>' + links + "</aside>" +
        '<main class="school-main">' +
          '<section class="school-hero"><h1>' + escapeHtml(config.title) + "</h1><p>" + escapeHtml(config.subtitle || "Purpose-built school administration workspace") + "</p></section>" +
          '<div id="app"></div>' +
        "</main>" +
      "</div>";
  }

  async function verifyTenant() {
    const response = unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false })) || {};
    const code = String(response.selection?.code || response.selected?.code || "").toLowerCase();
    if (!["school", "education"].includes(code)) {
      throw new Error("This application is available only to School tenants.");
    }
  }

  function controlHtml(field) {
    const name = field[0];
    const label = field[1];
    const type = field[2];
    const required = field[3] ? " required" : "";
    let control;
    if (type === "select") {
      const options = (field[4] || []).map(function (option) {
        return '<option value="' + escapeHtml(option) + '">' + escapeHtml(option) + "</option>";
      }).join("");
      control = '<select name="' + name + '"' + required + '><option value="">Select</option>' + options + "</select>";
    } else {
      control = '<input name="' + name + '" type="' + type + '"' + required + ">";
    }
    return "<div><label>" + escapeHtml(label) + "</label>" + control + "</div>";
  }

  function formHtml() {
    const definitions = FIELD_MAP[PAGE] || [];
    if (!definitions.length) return "";
    return '<section class="school-panel"><h2>New Record</h2><form id="schoolForm" class="school-form">' +
      definitions.map(controlHtml).join("") +
      '<div class="school-actions"><button class="school-btn" type="submit">Save</button></div></form><div id="status" class="school-status"></div></section>';
  }

  function tableHtml(config) {
    const columns = config.columns || [];
    const headings = columns.map(function (column) {
      return "<th>" + escapeHtml(column[1]) + "</th>";
    }).join("");
    return '<section class="school-panel"><div class="school-toolbar"><h2>Records</h2><input id="search" class="school-search" placeholder="Search displayed records"></div>' +
      '<div class="school-table-wrap"><table class="school-table"><thead><tr>' + headings + '</tr></thead><tbody id="rows"><tr><td colspan="' + columns.length + '">Loading…</td></tr></tbody></table></div></section>';
  }

  function normalizePayload(payload) {
    const numeric = new Set(["amount", "paidAmount", "monthlySalary", "capacity", "weekday", "startMinute", "endMinute", "marks", "maxMarks", "daysBefore"]);
    Object.keys(payload).forEach(function (key) {
      if (payload[key] === "true") payload[key] = true;
      else if (payload[key] === "false") payload[key] = false;
      else if (payload[key] !== "" && numeric.has(key)) payload[key] = Number(payload[key]);
    });
    return payload;
  }

  async function loadRows() {
    const config = PAGE_MAP[PAGE];
    const rows = unwrap(await AxtorAPI.apiGet(API + config.list, { cache: false })) || [];
    const query = String(document.getElementById("search")?.value || "").toLowerCase();
    const filtered = query ? rows.filter(function (row) {
      return JSON.stringify(row).toLowerCase().includes(query);
    }) : rows;
    const body = document.getElementById("rows");
    body.innerHTML = filtered.map(function (row) {
      return "<tr>" + config.columns.map(function (column) {
        return "<td>" + escapeHtml(displayValue(nestedValue(row, column[0]))) + "</td>";
      }).join("") + "</tr>";
    }).join("") || '<tr><td class="school-empty" colspan="' + config.columns.length + '">No records found.</td></tr>';
  }

  async function submitForm(event) {
    event.preventDefault();
    const config = PAGE_MAP[PAGE];
    const payload = normalizePayload(Object.fromEntries(new FormData(event.currentTarget).entries()));
    const status = document.getElementById("status");
    status.textContent = "Saving…";
    status.className = "school-status";
    try {
      const options = config.idempotent ? {
        headers: { "Idempotency-Key": "school:" + PAGE + ":" + Date.now() + ":" + Math.random().toString(36).slice(2) }
      } : undefined;
      if (config.put) await AxtorAPI.apiPut(API + config.create, payload, options);
      else await AxtorAPI.apiPost(API + config.create, payload, options);
      status.textContent = "Saved successfully.";
      status.className = "school-status ok";
      event.currentTarget.reset();
      await loadRows();
    } catch (error) {
      status.textContent = error.message || "Save failed";
      status.className = "school-status error";
    }
  }

  async function renderDashboard() {
    const responses = await Promise.all([
      AxtorAPI.apiGet(API + "/dashboard", { cache: false }),
      AxtorAPI.apiGet(API + "/fees?limit=500", { cache: false }),
      AxtorAPI.apiGet(API + "/attendance?limit=500", { cache: false })
    ]);
    const metrics = unwrap(responses[0]) || {};
    const fees = unwrap(responses[1]) || [];
    const attendance = unwrap(responses[2]) || [];
    const outstanding = fees.reduce(function (sum, row) {
      return sum + Math.max(0, Number(row.amount || 0) - Number(row.paidAmount || 0));
    }, 0);
    document.getElementById("app").innerHTML =
      '<div class="school-kpis">' +
        '<div class="school-kpi"><span>Active Students</span><strong>' + escapeHtml(metrics.activeStudents || 0) + "</strong></div>" +
        '<div class="school-kpi"><span>Active Classes</span><strong>' + escapeHtml(metrics.activeClasses || 0) + "</strong></div>" +
        '<div class="school-kpi"><span>Current Enrollments</span><strong>' + escapeHtml(metrics.activeEnrollments || 0) + "</strong></div>" +
        '<div class="school-kpi"><span>Outstanding Fees</span><strong>' + escapeHtml(outstanding.toFixed(2)) + "</strong></div>" +
      "</div>" +
      '<section class="school-panel"><h2>Academic Operations</h2><p>Attendance records loaded: <strong>' + attendance.length + '</strong></p><div class="school-note">All School records are tenant-scoped. Use the dedicated modules for admissions, attendance, fees, timetable, assessments and payroll.</div></section>';
  }

  async function renderReports() {
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);
    document.getElementById("app").innerHTML =
      '<section class="school-panel"><form id="reportForm" class="school-form">' +
        '<div><label>From</label><input name="from" type="date" value="' + from + '"></div>' +
        '<div><label>To</label><input name="to" type="date" value="' + to + '"></div>' +
        '<div class="school-actions"><button class="school-btn" type="submit">Run Report</button></div>' +
      '</form><pre id="reportOutput"></pre></section>';

    async function runReport(event) {
      if (event) event.preventDefault();
      const query = new URLSearchParams(new FormData(document.getElementById("reportForm")));
      const report = unwrap(await AxtorAPI.apiGet(API + "/reports/filtered?" + query.toString(), { cache: false }));
      document.getElementById("reportOutput").textContent = JSON.stringify(report, null, 2);
    }
    document.getElementById("reportForm").addEventListener("submit", runReport);
    await runReport();
  }

  async function renderStudentProfile() {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) throw new Error("Student id is required.");
    const summary = unwrap(await AxtorAPI.apiGet(API + "/students/" + encodeURIComponent(id) + "/summary", { cache: false }));
    document.getElementById("app").innerHTML =
      '<section class="school-panel"><h2>' + escapeHtml(summary.student.fullName) + '</h2><p>Admission: ' + escapeHtml(summary.student.admissionNo) + '</p><pre>' + escapeHtml(JSON.stringify(summary, null, 2)) + "</pre></section>";
  }

  async function boot() {
    renderShell();
    try {
      await verifyTenant();
      if (PAGE === "dashboard") return renderDashboard();
      if (PAGE === "reports") return renderReports();
      if (PAGE === "student-profile") return renderStudentProfile();

      const config = PAGE_MAP[PAGE];
      if (!config) throw new Error("Unsupported School page.");
      document.getElementById("app").innerHTML = formHtml() + tableHtml(config);
      document.getElementById("schoolForm")?.addEventListener("submit", submitForm);
      document.getElementById("search")?.addEventListener("input", loadRows);
      await loadRows();
    } catch (error) {
      document.getElementById("app").innerHTML =
        '<section class="school-panel"><div class="school-status error">' + escapeHtml(error.message || "Unable to load School application") + "</div></section>";
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
