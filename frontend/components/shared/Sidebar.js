"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Receipt, Brain, Building2, FileText,
  ScrollText, ShieldAlert, Settings2, Bot, BarChart3, FlaskConical,
} from "lucide-react";
import AgentPulse from "./AgentPulse";

const NAV_ITEMS = [
  { href: "/command-center", label: "Command Center", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/ai-decisions", label: "AI Decisions", icon: Brain },
  { href: "/vendors", label: "Vendors", icon: Building2 },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/audit-trail", label: "Audit Trail", icon: ScrollText },
  { href: "/fraud-center", label: "Fraud Center", icon: ShieldAlert },
  { href: "/policies", label: "Policies", icon: Settings2 },
  { href: "/agent-control", label: "Agent Control", icon: Bot },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/simulation-lab", label: "Simulation Lab", icon: FlaskConical },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isStopped, setIsStopped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const res = await fetch("http://localhost:4000/api/agent-control/status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setIsStopped(Boolean(data.isEmergencyStopped));
        }
      } catch (_) {}
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // poll every 15s
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-panel border-r-[3px] border-ink flex flex-col z-50">
      <div className="p-5 border-b-[3px] border-ink flex items-center gap-3">
        <div className="w-10 h-10 bg-accent border-[3px] border-ink flex items-center justify-center font-display font-bold text-lg">
          T
        </div>
        <div>
          <p className="font-display font-bold leading-tight">TrustPay</p>
          <div className="flex items-center gap-1.5">
            {isStopped ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-danger animate-pulse" />
                <span className="text-[11px] font-mono text-danger font-bold">AGENT STOPPED</span>
              </>
            ) : (
              <>
                <AgentPulse size={8} />
                <span className="text-[11px] font-mono text-ink/60">AGENT ACTIVE</span>
              </>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 border-[3px] font-mono text-sm transition-all
                ${active
                  ? "bg-accent border-ink shadow-hard-sm translate-x-[-2px]"
                  : "border-transparent hover:border-ink hover:bg-paper"}`}
            >
              <Icon size={17} strokeWidth={2.4} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t-[3px] border-ink font-mono text-[11px] text-ink/60">
        Bounded-autonomy financial agent
      </div>
    </aside>
  );
}
