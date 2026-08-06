import Decimal from "decimal.js";
import { z } from "zod";

const scaleBarcodeRuleSchema = z.object({
  prefix: z.string().regex(/^\d+$/).min(1).max(6),
  mode: z.enum(["EMBEDDED_WEIGHT", "EMBEDDED_PRICE"]),
  productCodeStart: z.number().int().min(0),
  productCodeLength: z.number().int().min(1).max(12),
  valueStart: z.number().int().min(0),
  valueLength: z.number().int().min(1).max(12),
  divisor: z.string().regex(/^\d+(\.\d+)?$/).transform((value) => new Decimal(value))
});

export type ScaleBarcodeRuleInput = z.input<typeof scaleBarcodeRuleSchema>;

export type ParsedScaleBarcode = {
  rawBarcode: string;
  prefix: string;
  productCode: string;
  mode: "EMBEDDED_WEIGHT" | "EMBEDDED_PRICE";
  embeddedValue: Decimal;
  quantity: Decimal | null;
  price: Decimal | null;
};

export function parseScaleBarcode(
  rawBarcode: string,
  ruleInputs: readonly ScaleBarcodeRuleInput[]
): ParsedScaleBarcode | null {
  const barcode = rawBarcode.trim();
  if (!/^\d+$/.test(barcode)) {
    return null;
  }

  for (const input of ruleInputs) {
    const rule = scaleBarcodeRuleSchema.parse(input);
    if (!barcode.startsWith(rule.prefix)) {
      continue;
    }

    const requiredLength = Math.max(
      rule.productCodeStart + rule.productCodeLength,
      rule.valueStart + rule.valueLength
    );
    if (barcode.length < requiredLength) {
      throw new Error("Scale barcode is shorter than the configured digit positions");
    }

    const productCode = barcode.slice(rule.productCodeStart, rule.productCodeStart + rule.productCodeLength);
    const rawValue = barcode.slice(rule.valueStart, rule.valueStart + rule.valueLength);
    const embeddedValue = new Decimal(rawValue).dividedBy(rule.divisor);

    return {
      rawBarcode: barcode,
      prefix: rule.prefix,
      productCode,
      mode: rule.mode,
      embeddedValue,
      quantity: rule.mode === "EMBEDDED_WEIGHT" ? embeddedValue : null,
      price: rule.mode === "EMBEDDED_PRICE" ? embeddedValue : null
    };
  }

  return null;
}
