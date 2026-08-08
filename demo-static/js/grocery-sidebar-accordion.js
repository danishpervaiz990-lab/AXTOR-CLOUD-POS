"use strict";

(function grocerySidebarAccordion() {
  const STORAGE_KEY = "grocerySidebarAccordionV1";
  const SCROLL_KEY = "grocerySidebarScrollTopV1";
  let syncQueued = false;
  let scrollWriteQueued = false;

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeState(next) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
  }

  function readScrollTop() {
    try {
      const value = Number(sessionStorage.getItem(SCROLL_KEY) || localStorage.getItem(SCROLL_KEY) || 0);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch (_) { return 0; }
  }

  function writeScrollTop(value) {
    const top = Math.max(0, Number(value) || 0);
    try {
      sessionStorage.setItem(SCROLL_KEY, String(top));
      localStorage.setItem(SCROLL_KEY, String(top));
    } catch (_) {}
  }

  function rememberCurrentScroll() {
    const nav = document.querySelector("#side-nav .nav-scroll");
    if (nav) writeScrollTop(nav.scrollTop);
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

  function keepActiveVisible(nav) {
    const active = nav.querySelector(".nav-link.active,[aria-current='page']");
    if (!active) return;
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const clippedAbove = activeRect.top < navRect.top + 4;
    const clippedBelow = activeRect.bottom > navRect.bottom - 4;
    if (clippedAbove || clippedBelow) active.scrollIntoView({ block:"nearest", inline:"nearest" });
  }

  function restoreScrollAndActive(nav) {
    const remembered = readScrollTop();
    if (Math.abs(nav.scrollTop - remembered) > 1) nav.scrollTop = remembered;
    requestAnimationFrame(function () {
      keepActiveVisible(nav);
      writeScrollTop(nav.scrollTop);
    });
  }

  function sync() {
    syncQueued = false;
    const sideNav = document.getElementById("side-nav");
    if (!sideNav) return;
    const nav = sideNav.querySelector(".nav-scroll");
    if (!nav) return;

    const stored = readState();
    nav.querySelectorAll(":scope > .nav-group").forEach(function (group, index) {
      enhanceGroup(group, index, stored);
    });
    restoreScrollAndActive(nav);
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

  // Capture scroll before the element-level data-nav click handler replaces the
  // Grocery shell. This prevents deep navigation from snapping back to the top.
  document.addEventListener("click", function (event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("#side-nav [data-nav]")) rememberCurrentScroll();
  }, true);

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
    rememberCurrentScroll();
  });

  document.addEventListener("click", function (event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("#side-nav [data-nav]")) return;
    queueSync();
  });

  document.addEventListener("scroll", function (event) {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches("#side-nav .nav-scroll")) return;
    if (scrollWriteQueued) return;
    scrollWriteQueued = true;
    requestAnimationFrame(function () {
      scrollWriteQueued = false;
      writeScrollTop(target.scrollTop);
    });
  }, true);

  window.addEventListener("popstate", queueSync);
  window.addEventListener("pagehide", rememberCurrentScroll);

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
    rememberScroll: rememberCurrentScroll,
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
      rememberCurrentScroll();
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
      rememberCurrentScroll();
    },
  };
})();
