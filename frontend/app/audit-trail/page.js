"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getAuditLog } from "../../lib/api";

const EVENT_ICONS = {
  risk_calculated: "🧠",
  telegram_sent: "📨",
  auto_executed: "✅",
  blocked: "🛑",
  approved: "✅",
  rejected: "❌",
};

export default function AuditTrailPage() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLog().then((data) => {
      setLog(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-display font-bold mb-1">📜 Audit Trail</h1>
      <p className="font-mono text-sm text-ink/60 mb-8">
        Every decision, hash-chained and timestamped. Nothing happens off the record.
      </p>

      {loading && <p className="font-mono text-sm">Loading...</p>}
      {!loading && log.length === 0 && (
        <div className="nb-panel p-6 font-mono text-sm text-ink/60">No audit events yet.</div>
      )}

      <div className="relative pl-8">
        <div className="absolute left-[11px] top-0 bottom-0 w-[3px] bg-ink" />
        <div className="flex flex-col gap-6">
          {log.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className="relative"
            >
              <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-accent border-[3px] border-ink flex items-center justify-center text-xs">
                {EVENT_ICONS[entry.event] || "•"}
              </div>
              <div className="nb-panel p-3">
                <p className="font-mono text-xs text-ink/50">{new Date(entry.created_at).toLocaleString()}</p>
                <p className="font-display font-bold">{entry.event.replace(/_/g, " ")}</p>
                <p className="font-mono text-sm text-ink/70">{entry.detail}</p>
                <p className="font-mono text-[10px] text-ink/30 mt-1 truncate">hash: {entry.hash}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </main>
  );
}
