export const INDUSTRY_CODE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  education: "school",
  garage: "workshop",
  distribution: "wholesale",
  hardware_paint: "hardware",
});

export function canonicalIndustryCode(value: unknown): string {
  const code = String(value || "").trim().toLowerCase();
  return INDUSTRY_CODE_ALIASES[code] || code;
}
