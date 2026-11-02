import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteLayout } from "@/components/layout/site-layout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Confexa — Conference Management Platform",
  description:
    "Manage conferences, submissions, and peer review in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen font-sans">
        <SiteLayout>{children}</SiteLayout>
      </body>
    </html>
  );
}
