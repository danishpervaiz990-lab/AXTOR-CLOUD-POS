export type BillingCheckoutInput = { businessId: string; planCode: string; billingCycle: "MONTHLY" | "ANNUAL" | "CUSTOM"; returnUrl?: string };
export type BillingCheckoutResult = { provider: string; reference: string; redirectUrl?: string; status: "pending" | "manual_review" };

export interface BillingProvider {
  readonly name: string;
  createCheckout(input: BillingCheckoutInput): Promise<BillingCheckoutResult>;
  verify(reference: string): Promise<{ paid: boolean; raw?: unknown }>;
}

export class ManualBillingProvider implements BillingProvider {
  readonly name = "manual";
  async createCheckout(input: BillingCheckoutInput): Promise<BillingCheckoutResult> {
    return { provider: this.name, reference: `manual:${input.businessId}:${Date.now()}`, status: "manual_review" };
  }
  async verify(): Promise<{ paid: boolean }> { return { paid: false }; }
}

export type RateQuote = { baseCode: string; quoteCode: string; rate: number; source: string; timestamp: Date };
export interface ExchangeRateProvider { readonly name: string; quote(baseCode: string, quoteCode: string, at?: Date): Promise<RateQuote>; }

export class ManualExchangeRateProvider implements ExchangeRateProvider {
  readonly name = "manual";
  constructor(private readonly rate: number, private readonly timestamp = new Date()) {}
  async quote(baseCode: string, quoteCode: string): Promise<RateQuote> {
    if (!Number.isFinite(this.rate) || this.rate <= 0) throw new Error("A positive manual exchange rate is required");
    return { baseCode, quoteCode, rate: this.rate, source: this.name, timestamp: this.timestamp };
  }
}
