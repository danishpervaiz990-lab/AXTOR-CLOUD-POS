import { describe, expect, it } from "vitest";
import { parseScaleBarcode } from "@/server/catalog/scale-barcode";

const rules = [
  {
    prefix: "21",
    mode: "EMBEDDED_WEIGHT" as const,
    productCodeStart: 2,
    productCodeLength: 5,
    valueStart: 7,
    valueLength: 5,
    divisor: "1000"
  },
  {
    prefix: "22",
    mode: "EMBEDDED_PRICE" as const,
    productCodeStart: 2,
    productCodeLength: 5,
    valueStart: 7,
    valueLength: 5,
    divisor: "100"
  }
];

describe("scale barcode parsing", () => {
  it("extracts 0.450 kg from an embedded-weight barcode", () => {
    const parsed = parseScaleBarcode("2101234004509", rules);
    expect(parsed?.productCode).toBe("01234");
    expect(parsed?.quantity?.toFixed(3)).toBe("0.450");
    expect(parsed?.price).toBeNull();
  });

  it("extracts an embedded price without interpreting it as weight", () => {
    const parsed = parseScaleBarcode("2209876012754", rules);
    expect(parsed?.productCode).toBe("09876");
    expect(parsed?.price?.toFixed(2)).toBe("12.75");
    expect(parsed?.quantity).toBeNull();
  });

  it("ignores nonmatching ordinary barcodes", () => {
    expect(parseScaleBarcode("6290000000001", rules)).toBeNull();
  });

  it("rejects malformed short scale barcodes", () => {
    expect(() => parseScaleBarcode("21012", rules)).toThrow(
      "Scale barcode is shorter than the configured digit positions"
    );
  });
});
