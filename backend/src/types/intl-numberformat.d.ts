export {};

declare global {
  namespace Intl {
    interface NumberFormat {
      resolvedOptions(): ResolvedNumberFormatOptions & { maximumFractionDigits: number };
    }
  }
}
