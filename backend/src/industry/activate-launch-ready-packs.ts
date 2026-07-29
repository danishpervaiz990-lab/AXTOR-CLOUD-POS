import { INDUSTRY_REGISTRY, REQUIRED_INDUSTRY_CODES, type IndustryPack } from "./registry.js";
import { RELEASE_C_D_LAUNCH_READY_PACKS } from "./launch-ready-packs.js";
import { MANUFACTURING_PACK } from "./manufacturing-release.js";

Object.assign(INDUSTRY_REGISTRY, RELEASE_C_D_LAUNCH_READY_PACKS, {
  manufacturing: MANUFACTURING_PACK,
});

// The original six production packs predate explicit readiness flags. Normalize them
// without weakening the launch contract used by registration and CI.
for (const code of REQUIRED_INDUSTRY_CODES) {
  const pack = INDUSTRY_REGISTRY[code];
  if (!pack) continue;
  pack.operationalStatus = "core_ready";
  pack.registrationEnabled = true;
}

export const ONBOARDING_READY_INDUSTRY_CODES = Object.freeze([...REQUIRED_INDUSTRY_CODES]);

export type IndustryLaunchReadiness = {
  ready: boolean;
  errors: string[];
};

export function industryLaunchReadiness(pack: IndustryPack | null | undefined): IndustryLaunchReadiness {
  if (!pack) return { ready: false, errors: ["pack_missing"] };

  const errors: string[] = [];
  if (pack.operationalStatus !== "core_ready") errors.push("operational_status_not_core_ready");
  if (pack.registrationEnabled !== true) errors.push("registration_disabled");
  if (!pack.modules?.length) errors.push("modules_missing");
  if (!pack.sidebarOrder?.length) errors.push("sidebar_missing");
  if (!pack.dashboardWidgets?.length) errors.push("dashboard_widgets_missing");
  if (!Object.keys(pack.defaultRoles || {}).length) errors.push("default_roles_missing");
  if (!Object.keys(pack.defaultSettings || {}).length) errors.push("default_settings_missing");
  if (!pack.notificationRules?.length) errors.push("notification_rules_missing");
  if (!pack.printFields?.length) errors.push("print_fields_missing");
  if (!pack.reports?.length) errors.push("reports_missing");

  const roleProblems = Object.entries(pack.defaultRoles || {}).filter(
    ([name, permissions]) => !name.trim() || !Array.isArray(permissions) || permissions.length === 0,
  );
  if (roleProblems.length) errors.push("invalid_default_role");

  const invalidEntity = (pack.entities || []).some(entity =>
    !entity.type || !entity.label || !entity.permission || !entity.statuses?.length ||
    !entity.fields?.length || entity.fields.some(field => !field.key || !field.label),
  );
  if (invalidEntity) errors.push("invalid_form_schema");

  return { ready: errors.length === 0, errors };
}

export function assertAllIndustriesLaunchReady(): void {
  const failures = ONBOARDING_READY_INDUSTRY_CODES.flatMap(code => {
    const result = industryLaunchReadiness(INDUSTRY_REGISTRY[code]);
    return result.ready ? [] : [`${code}: ${result.errors.join(", ")}`];
  });
  if (failures.length) {
    throw new Error(`Industry onboarding readiness failed: ${failures.join("; ")}`);
  }
}

assertAllIndustriesLaunchReady();
