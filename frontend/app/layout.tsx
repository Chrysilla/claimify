import "./globals.css";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = {
  title: "Claimify | Clinical review",
  description: "AI-assisted healthcare workflow starter",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
