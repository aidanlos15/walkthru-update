import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const bodyFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Walkthru: cinematic AI property tours",
  description:
    "Paste room photos or an Airbnb link and get a cinematic AI video tour of the property.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={bodyFont.variable}>
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
