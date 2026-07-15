(function () {
  "use strict";
  var U = window.AxtorPage;
  var state = { rows: [], performance: null, payouts: [], branches: [] };

  function month() {
    return U.value("#salesmenMonth") || U.value("#targetMonth") || new Date().toISOString().slice(0, 7);
  }

  function set(id, value) {
    var element = U.q(id);
    if (element) element.textContent = value;
  }

  async function load() {
    var selectedMonth = month();
    var responses = await Promise.all([
      U.api().apiGet("/api/v1/salesmen?month=" + encodeURIComponent(selectedMonth)),
      U.api().apiGet("/api/v1/salesmen/performance?month=" + encodeURIComponent(selectedMonth)),
      U.api().apiGet("/api/v1/salesmen/payouts?month=" + encodeURIComponent(selectedMonth)),
      U.api().apiGet("/api/v1/branches")
    ]);
    state.rows = U.data(responses[0]) || [];
    state.performance = U.data(responses[1]) || null;
    state.payouts = U.data(responses[2]) || [];
    state.branches = U.data(responses[3]) || [];
    render();
  }

  function salesmanOf(row) {
    return row.salesman || row;
  }

  function render() {
    var listBody = U.q("#salesmenListBody");
    if (listBody) {
      listBody.innerHTML = state.rows.length ? state.rows.map(function (row) {
        var salesman = salesmanOf(row);
        return "<tr>" +
          "<td>" + U.esc(salesman.name) + "</td>" +
          "<td>" + U.esc(salesman.phone || "-") + "</td>" +
          "<td>" + U.esc(salesman.branchName || (salesman.branch && salesman.branch.name) || "-") + "</td>" +
          "<td>QAR " + U.money(row.actualSales) + "</td>" +
          "<td>" + U.money(row.achievementPct) + "%</td>" +
          "<td><button class=\"btn btn-sm btn-soft\" data-salesman-target=\"" + U.esc(salesman.id) + "\">Target</button></td>" +
          "</tr>";
      }).join("") : U.emptyRow(6);
    }

    var targetBody = U.q("#targetRowsBody");
    if (targetBody) {
      targetBody.innerHTML = state.rows.length ? state.rows.map(function (row) {
        var salesman = salesmanOf(row);
        return "<tr>" +
          "<td>" + U.esc(salesman.name) + "</td>" +
          "<td>QAR " + U.money(row.targetAmount) + "</td>" +
          "<td>" + U.esc(row.targetInvoices || 0) + "</td>" +
          "<td>QAR " + U.money(row.bonusAmount) + "</td>" +
          "<td><button class=\"btn btn-sm btn-soft\" data-salesman-target=\"" + U.esc(salesman.id) + "\">Edit</button></td>" +
          "</tr>";
      }).join("") : U.emptyRow(5);
    }

    var performance = state.performance || { summary: {}, rows: [] };
    set("#teamSales", "QAR " + U.money(performance.summary && performance.summary.teamSales));
    set("#avgAchievement", U.money(performance.summary && performance.summary.avgAchievement) + "%");
    set("#commissionsDue", "QAR " + U.money(performance.summary && performance.summary.commissionsDue));
    set("#topPerformer", performance.rows && performance.rows[0] ? performance.rows[0].salesman.name : "-");

    var performanceBody = U.q("#performanceBody");
    if (performanceBody) {
      performanceBody.innerHTML = (performance.rows || []).length ? performance.rows.map(function (row) {
        return "<tr><td>" + U.esc(row.salesman.name) + "</td><td>QAR " + U.money(row.targetAmount) +
          "</td><td>QAR " + U.money(row.actualSales) + "</td><td>" + U.money(row.achievementPct) +
          "%</td><td>QAR " + U.money(row.totalPayout) + "</td></tr>";
      }).join("") : U.emptyRow(5);
    }

    var payoutBody = U.q("#payoutBody");
    if (payoutBody) {
      payoutBody.innerHTML = state.payouts.length ? state.payouts.map(function (row) {
        var action = String(row.status || "").toLowerCase() === "paid" ? "<span class=\"badge-soft badge-paid\">Paid</span>" :
          "<button class=\"btn btn-sm btn-brand\" data-payout-paid=\"" + U.esc(row.id) + "\">Mark Paid</button>";
        return "<tr><td>" + U.esc(row.salesman && row.salesman.name) + "</td><td>QAR " + U.money(row.grossSales) +
          "</td><td>QAR " + U.money(row.totalPayout) + "</td><td>" + U.esc(row.status) + "</td><td>" + action + "</td></tr>";
      }).join("") : U.emptyRow(5);
    }

    U.setOptions(U.q("#salesmanBranch"), state.branches, "name", "id", false);
    U.setOptions(U.q("#salesmanBranchFilter"), state.branches, "name", "id");

    var targetSelect = U.q("#targetSalesman");
    if (targetSelect) {
      targetSelect.innerHTML = '<option value="">Select salesman</option>' + state.rows.map(function (row) {
        var salesman = salesmanOf(row);
        return '<option value="' + U.esc(salesman.id) + '">' + U.esc(salesman.name) + "</option>";
      }).join("");
    }
  }

  window.addEventListener("axtor:salesmen-migrated", function () { load().catch(function (error) { U.toast(error.message || "Unable to refresh salesmen", "error"); }); });

  U.run(async function () {
    var currentMonth = new Date().toISOString().slice(0, 7);
    ["#salesmenMonth", "#targetMonth", "#performanceMonth", "#payoutMonth"].forEach(function (id) {
      var element = U.q(id);
      if (element && !element.value) element.value = currentMonth;
    });

    await load();

    U.bind("#saveSalesmanBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/salesmen", {
          name: U.value("#salesmanName"),
          phone: U.value("#salesmanPhone"),
          email: U.value("#salesmanEmail"),
          branchId: U.value("#salesmanBranch"),
          joinDate: U.value("#salesmanJoinDate")
        });
        U.modalHide("#addSalesmanModal");
        U.toast("Salesman saved");
        await load();
      } catch (error) {
        U.error(error);
      } finally {
        done();
      }
    });

    U.bind("#saveTargetBtn", "click", async function (event) {
      var salesmanId = U.value("#targetSalesman") || U.value("#targetId");
      if (!salesmanId) return U.toast("Select salesman", "error");
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/salesmen/" + encodeURIComponent(salesmanId) + "/target", {
          month: U.value("#targetMonthInput") || month(),
          targetAmount: U.num(U.value("#targetAmount")),
          targetInvoices: U.num(U.value("#targetInvoices")),
          bonusOnTarget: U.num(U.value("#bonusOnTarget")),
          notes: U.value("#targetNotes"),
          commissionTiers: [{ from: 0, to: 99, rate: 0 }, { from: 100, to: 999, rate: 2 }]
        });
        U.modalHide("#targetModal");
        U.toast("Target saved");
        await load();
      } catch (error) {
        U.error(error);
      } finally {
        done();
      }
    });

    document.addEventListener("click", async function (event) {
      var targetButton = event.target.closest("[data-salesman-target]");
      if (targetButton) {
        var salesmanId = targetButton.dataset.salesmanTarget;
        var row = state.rows.find(function (item) { return salesmanOf(item).id === salesmanId; });
        if (!row) return;
        var salesman = salesmanOf(row);
        var targetSelect = U.q("#targetSalesman");
        targetSelect.innerHTML = '<option value="' + U.esc(salesman.id) + '">' + U.esc(salesman.name) + "</option>";
        var monthInput = U.q("#targetMonthInput");
        if (monthInput) monthInput.value = month();
        var amountInput = U.q("#targetAmount");
        if (amountInput) amountInput.value = row.targetAmount || 0;
        var invoicesInput = U.q("#targetInvoices");
        if (invoicesInput) invoicesInput.value = row.targetInvoices || 0;
        if (window.bootstrap) new bootstrap.Modal(U.q("#targetModal")).show();
      }

      var paidButton = event.target.closest("[data-payout-paid]");
      if (paidButton) {
        await U.api().apiPatch("/api/v1/salesmen/payouts/" + encodeURIComponent(paidButton.dataset.payoutPaid), {
          status: "paid",
          paidDate: new Date().toISOString(),
          paymentMethod: "cash"
        });
        U.toast("Payout marked paid");
        await load();
      }
    });

    ["#salesmenMonth", "#performanceMonth", "#payoutMonth", "#targetMonth", "#salesmanBranchFilter"].forEach(function (id) {
      U.on(U.q(id), "change", function () { load().catch(U.error); });
    });
  });
})();
