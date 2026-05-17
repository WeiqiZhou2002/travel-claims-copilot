import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel Claims Copilot",
  description: "A local demo for travel dispute claim analysis."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
