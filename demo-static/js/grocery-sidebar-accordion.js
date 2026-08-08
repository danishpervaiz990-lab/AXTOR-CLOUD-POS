"use strict";

(function grocerySidebarAccordion() {
  const STORAGE_KEY = "grocerySidebarAccordionV1";
  let syncQueued = false;

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeState(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function normalizeKey(value, index) {
    const base = String(value || "group")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${base || "group"}-${index}`;
  }

  function directLinks(group) {
    return Array.from(group.children).filter(function (child) {
      return child instanceof HTMLElement && child.classList.contains("nav-link");
    });
  }

  function groupHasActiveLink(group) {
    return directLinks(group).some(function (link) {
      return link.classList.contains("active") || link.getAttribute("aria-current") === "page";
    });
  }

  function applyCollapsedState(group, collapsed) {
    const toggle = Array.from(group.children).find(function (child) {
      return child instanceof HTMLElement && child.classList.contains("grocery-nav-group-toggle");
    });
    if (!toggle) return;

    const isCollapsed = Boolean(collapsed);
    const groupName = toggle.dataset.groupName || "menu";
    group.classList.toggle("grocery-nav-collapsed", isCollapsed);
    toggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    toggle.setAttribute("aria-label", `${isCollapsed ? "Expand" : "Collapse"} ${groupName} menu`);

    directLinks(group).forEach(function (link) {
      link.hidden = isCollapsed;
      link.setAttribute("aria-hidden", isCollapsed ? "true" : "false");
    });
  }

  function enhanceGroup(group, index, stored) {
    let title = Array.from(group.children).find(function (child) {
      return child instanceof HTMLElement && child.classList.contains("nav-group-title");
    });
    if (!title) return;

    const existingName = title.dataset.groupName || title.textContent || `Group ${index + 1}`;
    const groupName = String(existingName).trim() || `Group ${index + 1}`;
    const groupKey = title.dataset.groupKey || normalizeKey(groupName, index);

    if (!(title instanceof HTMLButtonElement) || !title.classList.contains("grocery-nav-group-toggle")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-group-title grocery-nav-group-toggle";
      button.textContent = groupName;
      button.dataset.groupName = groupName;
      button.dataset.groupKey = groupKey;
      title.replaceWith(button);
      title = button;
    } else {
      title.dataset.groupName = groupName;
      title.dataset.groupKey = groupKey;
    }

    const active = groupHasActiveLink(group);
    const rememberedCollapsed = stored[groupKey] === true;
    applyCollapsedState(group, active ? false : rememberedCollapsed);
  }

  function sync() {
    syncQueued = false;
    const sideNav = document.getElementById("side-nav");
    if (!sideNav) return;

    const stored = readState();
    sideNav.querySelectorAll(".nav-scroll > .nav-group").forEach(function (group, index) {
      enhanceGroup(group, index, stored);
    });
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(sync);
  }

  function persistGroup(group, collapsed) {
    const toggle = group.querySelector(".grocery-nav-group-toggle");
    const key = toggle?.dataset.groupKey;
    if (!key) return;
    const stored = readState();
    stored[key] = Boolean(collapsed);
    writeState(stored);
  }

  document.addEventListener("click", function (event) {
    const target = event.target instanceof Element ? event.target : null;
    const toggle = target?.closest("#side-nav .grocery-nav-group-toggle");
    if (!toggle) return;

    event.preventDefault();
    event.stopPropagation();
    const group = toggle.closest(".nav-group");
    if (!group) return;

    const nextCollapsed = !group.classList.contains("grocery-nav-collapsed");
    persistGroup(group, nextCollapsed);
    applyCollapsedState(group, nextCollapsed);
  });

  document.addEventListener("click", function (event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("#side-nav [data-nav]")) return;
    queueSync();
  });

  window.addEventListener("popstate", queueSync);

  const observer = new MutationObserver(function (mutations) {
    const relevant = mutations.some(function (mutation) {
      return mutation.type === "childList" && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0);
    });
    if (relevant) queueSync();
  });

  observer.observe(document.getElementById("grocery-app") || document.body, {
    childList: true,
    subtree: true,
  });

  sync();

  window.GrocerySidebarAccordion = {
    sync,
    expandAll: function () {
      const sideNav = document.getElementById("side-nav");
      if (!sideNav) return;
      const stored = readState();
      sideNav.querySelectorAll(".nav-scroll > .nav-group").forEach(function (group) {
        const toggle = group.querySelector(".grocery-nav-group-toggle");
        const key = toggle?.dataset.groupKey;
        if (key) stored[key] = false;
        applyCollapsedState(group, false);
      });
      writeState(stored);
    },
    collapseAll: function () {
      const sideNav = document.getElementById("side-nav");
      if (!sideNav) return;
      const stored = readState();
      sideNav.querySelectorAll(".nav-scroll > .nav-group").forEach(function (group) {
        const toggle = group.querySelector(".grocery-nav-group-toggle");
        const key = toggle?.dataset.groupKey;
        if (key) stored[key] = true;
        applyCollapsedState(group, true);
      });
      writeState(stored);
    },
  };
})();
