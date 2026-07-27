import type { Business, IndustryProfile } from "@prisma/client";
import { canonicalIndustryCode } from "../industry/codes.js";

export type BusinessWithIndustry = Business & {
  businessIndustry?: {
    provisioningState: string;
    industry: Pick<IndustryProfile, "code" | "name">;
  } | null;
};

export function serializeBusinessContext(business: BusinessWithIndustry) {
  const selected = business.businessIndustry?.industry || null;
  const industry = selected
    ? {
        code: canonicalIndustryCode(selected.code),
        name: selected.name,
      }
    : null;

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    status: business.status,
    timezone: business.timezone,
    currency: business.currency,
    industryCode: industry?.code || null,
    industry,
    setupRequired: !industry,
    provisioningState: business.businessIndustry?.provisioningState || null,
  };
}
