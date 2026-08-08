"use strict";

(function grocerySidebarHotfix() {
  const mobileQuery = window.matchMedia("(max-width: 820px)");
  let lastMenuButton = null;

  function currentSideNav() {
    return document.getElementById("side-nav");
  }

  function currentMenuButton() {
    return document.getElementById("mobile-menu");
  }

  function currentBackdrop() {
    return document.querySelector(".grocery-nav-backdrop");
  }

  function setStateMenu(open) {
    try {
      if (typeof state !== "undefined" && state) state.menu = Boolean(open);
    } catch (_) {}
  }

  function setOpen(open, options) {
    const settings = options || {};
    const sideNav = currentSideNav();
    const menuButton = currentMenuButton();
    const backdrop = currentBackdrop();
    const shouldOpen = Boolean(open && mobileQuery.matches && sideNav);

    setStateMenu(shouldOpen);
    sideNav?.classList.toggle("open", shouldOpen);
    backdrop?.classList.toggle("open", shouldOpen);
    document.body.classList.toggle("grocery-nav-open", shouldOpen);

    if (menuButton) {
      menuButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      menuButton.setAttribute("aria-controls", "side-nav");
      menuButton.setAttribute("aria-label", shouldOpen ? "Close Grocery navigation" : "Open Grocery navigation");
      if (!lastMenuButton) lastMenuButton = menuButton;
    }

    if (sideNav) {
      sideNav.setAttribute("aria-hidden", mobileQuery.matches && !shouldOpen ? "true" : "false");
    }

    if (shouldOpen && settings.focusClose) {
      window.setTimeout(function () {
        currentSideNav()?.querySelector(".grocery-nav-close")?.focus();
      }, 0);
    }

    if (!shouldOpen && settings.restoreFocus) {
      window.setTimeout(function () {
        const button = currentMenuButton() || lastMenuButton;
        if (button && typeof button.focus === "function") button.focus();
      }, 0);
    }
  }

  function ensureControls() {
    const sideNav = currentSideNav();
    if (!sideNav) {
      document.body.classList.remove("grocery-nav-open");
      return;
    }

    if (!sideNav.querySelector(".grocery-nav-close")) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "grocery-nav-close";
      close.setAttribute("aria-label", "Close Grocery navigation");
      close.innerHTML = "&times;";
      sideNav.appendChild(close);
    }

    const shell = sideNav.closest(".app-shell");
    if (shell && !shell.querySelector(".grocery-nav-backdrop")) {
      const backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "grocery-nav-backdrop";
      backdrop.setAttribute("aria-label", "Close Grocery navigation");
      sideNav.insertAdjacentElement("afterend", backdrop);
    }

    const menuButton = currentMenuButton();
    if (menuButton) {
      menuButton.setAttribute("aria-controls", "side-nav");
      lastMenuButton = menuButton;
    }

    const isOpen = sideNav.classList.contains("open") && mobileQuery.matches;
    setOpen(isOpen);
  }

  document.addEventListener("click", function (event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("#mobile-menu")) {
      lastMenuButton = currentMenuButton();
      queueMicrotask(function () {
        ensureControls();
        const isOpen = Boolean(currentSideNav()?.classList.contains("open"));
        setOpen(isOpen, { focusClose: isOpen });
      });
      return;
    }

    if (target.closest(".grocery-nav-close") || target.closest(".grocery-nav-backdrop")) {
      event.preventDefault();
      setOpen(false, { restoreFocus: true });
      return;
    }

    if (mobileQuery.matches && target.closest("#side-nav [data-nav]")) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && currentSideNav()?.classList.contains("open")) {
      event.preventDefault();
      setOpen(false, { restoreFocus: true });
    }
  });

  function handleViewportChange() {
    ensureControls();
    if (!mobileQuery.matches) setOpen(false);
  }

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", handleViewportChange);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(handleViewportChange);
  }

  const observer = new MutationObserver(function () {
    ensureControls();
  });

  observer.observe(document.getElementById("grocery-app") || document.body, {
    childList: true,
    subtree: true,
  });

  ensureControls();

  window.GrocerySidebarHotfix = {
    close: function () { setOpen(false); },
    open: function () { ensureControls(); setOpen(true, { focusClose: true }); },
    sync: ensureControls,
  };
})();
