import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AXTOR Grocery POS Cloud",
    template: "%s | AXTOR Grocery POS Cloud"
  },
  description: "Grocery and supermarket checkout, inventory, purchasing, finance and cheque operations.",
  applicationName: "AXTOR Grocery POS Cloud",
  robots: {
    index: false,
    follow: false
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
