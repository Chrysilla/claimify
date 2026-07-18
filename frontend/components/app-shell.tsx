"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardCheck,
  LayoutDashboard,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/review-queue", label: "Review Queue", icon: ClipboardCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-slate-950 px-4 py-6 lg:block">
        <div className="mb-8 flex items-center gap-3 px-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500 text-white">
            <Stethoscope size={22} />
          </span>
          <div>
            <p className="font-semibold text-white">Claimify</p>
            <p className="text-xs text-slate-400">Clinical review workspace</p>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? path === item.href
                : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white",
                )}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-6 left-4 right-4 rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-teal-300">
            <Activity size={14} />
            Demo environment
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Fictional data · Mock AI
          </p>
        </div>
      </aside>
      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur lg:px-8">
          <p className="text-sm font-medium text-slate-500">
            Clinical operations
          </p>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-slate-700">
              Jordan Lee, RN
            </span>
          </div>
        </header>
        <div className="p-5 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
