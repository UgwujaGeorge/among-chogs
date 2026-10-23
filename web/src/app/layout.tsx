import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import "./globals.css";

const display = Chakra_Petch({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Among Chogs",
  description: "Launch the coin. Find the Rugger. A social deduction game for Chog NFT holders on Monad.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#06040d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
