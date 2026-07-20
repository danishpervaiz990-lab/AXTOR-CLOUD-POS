<!DOCTYPE html>

<html data-theme="light" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<script>try{document.documentElement.setAttribute('data-theme', localStorage.getItem('axtorTheme') || 'light');if(localStorage.getItem('axtorThemeStyle')==='retro-pos'){document.documentElement.classList.add('theme-retro-pos');}}catch(e){document.documentElement.setAttribute('data-theme','light');}</script>
<title>Reports · Axtor POS Cloud</title>
<link href="assets/images/logo.svg" rel="icon" type="image/svg+xml"/>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&amp;display=swap" rel="stylesheet"/>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet"/>
<link href="css/style.css?v=20260618-sales-qr1" rel="stylesheet"/>
<link href="css/retro-pos-theme.css?v=20260618-sales-qr1" rel="stylesheet"/>
<link href="manifest.webmanifest" rel="manifest"/>
<meta content="#0f9f78" name="theme-color"/>
</head>
<body>
<div class="app-shell">
<aside class="sidebar">
<div class="sidebar-inner">
<a class="brand" href="index.html">
<div class="brand-mark">A</div>
<div><h1>Axtor POS Cloud</h1><span>Retail • Grocery • Pharmacy • Paint</span></div>
</a>
<nav class="nav-menu"><a class="nav-linkx" href="index.html"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a>
<a class="nav-linkx" href="terminal.html"><i class="bi bi-upc-scan"></i><span>Terminal</span></a>
<a class="nav-linkx" href="sales.html"><i class="bi bi-cart-check"></i><span>Sales</span></a>
<a class="nav-linkx" href="shifts.html"><i class="bi bi-clock-history"></i><span>Shifts / Closing</span></a>
<a class="nav-linkx" href="customer.html"><i class="bi bi-people"></i><span>Customers</span></a>
<a class="nav-linkx" href="salesmen.html"><i class="bi bi-trophy"></i><span>Salesmen &amp; Commission</span></a>
<a class="nav-linkx" href="products.html"><i class="bi bi-box-seam"></i><span>Products</span></a>
<a class="nav-linkx" href="inventory.html"><i class="bi bi-boxes"></i><span>Inventory</span></a>
<a class="nav-linkx" href="barcode-labels.html"><i class="bi bi-tags"></i><span>Barcode Labels</span></a>
<a class="nav-linkx" href="purchase.html"><i class="bi bi-bag-plus"></i><span>Purchases</span></a>
<a class="nav-linkx" href="branches.html"><i class="bi bi-building"></i><span>Branches</span></a>
<a class="nav-linkx" href="promotions.html"><i class="bi bi-percent"></i><span>Promotions</span></a>
<a class="nav-linkx" href="loyalty.html"><i class="bi bi-gem"></i><span>Loyalty</span></a>
<a class="nav-linkx" href="approvals.html"><i class="bi bi-shield-check"></i><span>Approvals</span></a>
<a class="nav-linkx active" href="reports.html"><i class="bi bi-graph-up-arrow"></i><span>Reports</span></a>
<a class="nav-linkx" href="accounts.html"><i class="bi bi-bank"></i><span>Accounts</span></a>
<a class="nav-linkx" href="expenses.html"><i class="bi bi-wallet2"></i><span>Expenses</span></a>
<a class="nav-linkx" href="setup.html"><i class="bi bi-magic"></i><span>Setup Wizard</span></a>
<a class="nav-linkx" href="notifications.html"><i class="bi bi-bell"></i><span>Notifications</span></a>
<a class="nav-linkx" href="invoice-designer.html"><i class="bi bi-file-earmark-richtext"></i><span>Invoice Designer</span></a>
<a class="nav-linkx" href="settings.html"><i class="bi bi-gear"></i><span>Settings</span></a></nav>
<div class="sidebar-footer"><span class="status-dot"></span>Customer Ready Mode<br/><small>PostgreSQL Cloud Mode</small></div>
</div>
</aside>
<div class="sidebar-backdrop"></div>
<div class="main">
<header class="topbar">
<button aria-label="Toggle menu" class="btn-icon d-xl-none" data-sidebar-toggle=""><i class="bi bi-list"></i></button>
<div class="page-title"><h2>Reports</h2><p>Business reports with filters and preview cards.</p></div>
<button class="search-pill" data-search-open=""><i class="bi bi-search"></i><span>Search invoice, customer, stock...</span><kbd class="shortcut">F8</kbd></button>
<a class="btn-icon" href="notifications.html" title="Notifications"><i class="bi bi-bell"></i></a>
<div class="user-chip"><div class="avatar">O</div><span class="fw-bold">Owner</span></div>
</header>
<main class="page">
<div class="row g-3 mb-4">
<div class="col-xl-8">
<div class="cardx">
<div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
<div>
<h5 class="cardx-title">Profit overview</h5>
<p class="text-muted mb-0">Six-month demo profitability trend. Use the report cards below for live localStorage previews.</p>
</div>
<button class="btn btn-soft btn-sm" id="reportTopPrintBtn" type="button"><i class="bi bi-printer"></i> Export PDF</button>
</div>
<div style="height:320px"><canvas id="reportsProfitChart"></canvas></div>
</div>
</div>
<div class="col-xl-4">
<div class="cardx" id="reportFilterPanel">
<div class="d-flex justify-content-between align-items-start mb-2">
<div>
<h5 class="cardx-title mb-1">Report filters</h5>
<p class="text-muted small mb-0" id="reportFilterHint">Choose a report card, then apply filters.</p>
</div>
<span class="badge-soft badge-paid" id="activeReportBadge">Daily Sale</span>
</div>
<div class="row g-2">
<div class="col-12"><label class="form-label">Date range</label><select class="form-select" id="reportDateRange"><option value="this_month">This month</option><option value="today">Today</option><option value="this_week">This week</option><option value="this_year">This year</option><option value="custom">Custom date from/to</option><option value="all">All demo data</option></select></div>
<div class="col-6 report-custom-date"><label class="form-label">From</label><input class="form-control" id="reportDateFrom" type="date"/></div>
<div class="col-6 report-custom-date"><label class="form-label">To</label><input class="form-control" id="reportDateTo" type="date"/></div>
<div class="col-6 report-month-filter"><label class="form-label">Month</label><input class="form-control" id="reportMonth" type="month"/></div>
<div class="col-6 report-year-filter"><label class="form-label">Year</label><input class="form-control" id="reportYear" max="2099" min="2020" type="number"/></div>
<div class="col-12 report-branch-filter"><label class="form-label">Branch</label><select class="form-select" id="reportBranch"></select></div>
<div class="col-12 report-customer-filter"><label class="form-label">Customer</label><select class="form-select" id="reportCustomer"></select></div>
<div class="col-12 report-product-filter"><label class="form-label">Product</label><select class="form-select" id="reportProduct"></select></div>
<div class="col-12 report-supplier-filter"><label class="form-label">Supplier</label><select class="form-select" id="reportSupplier"></select></div>
<div class="col-12 report-salesman-filter"><label class="form-label">Salesman</label><select class="form-select" id="reportSalesman"></select></div>
</div>
<div class="d-flex gap-2 mt-3 flex-wrap">
<button class="btn btn-brand flex-fill" id="applyReportFilters" type="button"><i class="bi bi-funnel"></i> Apply Filters</button>
<button class="btn btn-soft flex-fill" id="resetReportFilters" type="button"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
</div>
</div>
</div>
</div>
<div class="row g-3" id="reportCards">
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="profit-loss" href="#report-preview"><div class="quick-icon"><i class="bi bi-file-earmark-bar-graph"></i></div><div><strong>Profit &amp; Loss Report</strong><span>Income, COGS, expenses and net profit</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="daily-sales" href="#report-preview"><div class="quick-icon"><i class="bi bi-calendar-check"></i></div><div><strong>Daily Sale Report</strong><span>Invoices by selected date range</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="sale-products" href="#report-preview"><div class="quick-icon"><i class="bi bi-box-seam"></i></div><div><strong>Sale Report by Products</strong><span>Qty, sales and profit by item</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="sales-by-category" href="#report-preview"><div class="quick-icon"><i class="bi bi-grid-3x3-gap"></i></div><div><strong>Sale Report by Category</strong><span>Qty, sales, cost and profit by category</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="salesman-sales" href="#report-preview"><div class="quick-icon"><i class="bi bi-person-badge"></i></div><div><strong>Salesman Sales Report</strong><span>Sales, received amount and outstanding</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="sale-customer" href="#report-preview"><div class="quick-icon"><i class="bi bi-people"></i></div><div><strong>Sale Report by Customer</strong><span>Customer sales, paid and balance</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="sales-return" href="#report-preview"><div class="quick-icon"><i class="bi bi-arrow-return-left"></i></div><div><strong>Sales Return Report</strong><span>Return and exchange history</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="stock-valuation" href="#report-preview"><div class="quick-icon"><i class="bi bi-boxes"></i></div><div><strong>Stock Valuation Report</strong><span>Stock value and estimated cost</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="purchase-report" href="#report-preview"><div class="quick-icon"><i class="bi bi-bag-plus"></i></div><div><strong>Purchase Report</strong><span>Supplier bills and payable status</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="tax-report" href="#report-preview"><div class="quick-icon"><i class="bi bi-receipt-cutoff"></i></div><div><strong>Tax Report</strong><span>Invoice subtotal, tax and total</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="trial-balance" href="#report-preview"><div class="quick-icon"><i class="bi bi-journal-check"></i></div><div><strong>Trial Balance demo</strong><span>Demo debit and credit balances</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="balance-sheet" href="#report-preview"><div class="quick-icon"><i class="bi bi-bank"></i></div><div><strong>Balance Sheet demo</strong><span>Assets, liabilities and equity</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="expense-report" href="#report-preview"><div class="quick-icon"><i class="bi bi-wallet2"></i></div><div><strong>Expense Report</strong><span>Expenses from demo localStorage data</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="general-ledger" href="#report-preview"><div class="quick-icon"><i class="bi bi-list-columns-reverse"></i></div><div><strong>General Ledger Report</strong><span>Sales, receipts, purchases and expense entries</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="salesman-commission" href="#report-preview"><div class="quick-icon"><i class="bi bi-cash-coin"></i></div><div><strong>Salesman Commission Report</strong><span>Commission earned and payout</span></div></a></div>
<div class="col-md-6 col-xl-3"><a class="quick-card" data-report-id="customer-profit-loss" href="#report-preview"><div class="quick-icon"><i class="bi bi-person-lines-fill"></i></div><div><strong>Customer Profit/Loss Report</strong><span>Customer sales, COGS and outstanding</span></div></a></div>
</div>
<section class="section-anchor mt-4" id="report-preview">
<div class="cardx">
<div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
<div>
<h5 class="cardx-title" id="activeReportTitle">Daily Sale Report</h5>
<p class="text-muted mb-0" id="activeReportMeta">LocalStorage demo data</p>
</div>
<div class="d-flex gap-2 no-print flex-wrap">
<button class="btn btn-soft" id="copyActiveReport" type="button"><i class="bi bi-clipboard"></i> Copy Report</button>
<button class="btn btn-brand" id="printActiveReport" type="button"><i class="bi bi-printer"></i> Export PDF</button>
</div>
</div>
<div class="row g-3 mb-3" id="activeReportSummary"></div>
<div class="table-wrap"><table class="table"><thead id="activeReportHead"></thead><tbody id="activeReportBody"></tbody></table></div>
</div>
</section>
</main>
</div>
</div>
<div class="search-overlay" id="globalSearch">
<div class="search-box">
<div class="search-head"><i class="bi bi-search fs-4 text-brand"></i><input autocomplete="off" id="globalSearchInput" placeholder="Type to search pages, sections, invoices..."/><button class="btn-icon" data-search-close=""><i class="bi bi-x-lg"></i></button></div>
<div class="search-results" id="globalSearchResults"></div>
</div>
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script src="js/axtor-api.js?v=20260712-full-backend-v2"></script><script src="js/core-data.js?v=20260712-full-backend-v2"></script>
<script src="js/charts.js?v=20260712-full-backend-v2"></script>
<script src="js/main.js?v=20260712-full-backend-v2"></script>
<script src="js/theme-switcher.js?v=20260712-full-backend-v2"></script>
<script src="js/app-data.js?v=20260712-full-backend-v2"></script>
<script src="js/retail-advanced.js?v=20260712-full-backend-v2"></script>
<script src="js/invoice-templates.js?v=20260712-full-backend-v2"></script>


<script src="js/backend-page-utils.js?v=20260712-full-backend-v2"></script><script src="js/reports-backend.js?v=20260712-full-backend-v2"></script></body>
</html>
