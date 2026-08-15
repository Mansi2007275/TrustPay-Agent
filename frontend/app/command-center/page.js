"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import AgentOrb from "../../components/three/AgentOrb";
import StatCard from "../../components/dashboard/StatCard";
import ActivityFeed from "../../components/dashboard/ActivityFeed";
import { getTransactions, submitTransaction } from "../../lib/api";

export default function CommandCenter() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ vendor: "", amount: "", invoiceNumber: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getTransactions();
      setTransactions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load transactions — is the backend running on :4000?", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = {
    total: transactions.length,
    auto: transactions.filter((t) => t.decision === "AUTO_EXECUTE").length,
    pending: transactions.filter((t) => t.status === "PENDING").length,
    blocked: transactions.filter((t) => t.decision === "BLOCKED").length,
  };

  const worstRisk = transactions.reduce((max, t) => Math.max(max, t.risk_score || 0), 0);
  const orbTone = worstRisk > 80 ? "danger" : worstRisk > 40 ? "warn" : "safe";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.vendor || !form.amount) return;
    setSubmitting(true);
    try {
      await submitTransaction({
        vendor: form.vendor,
        amount: Number(form.amount),
        invoiceNumber: form.invoiceNumber || undefined,
      });
      setForm({ vendor: "", amount: "", invoiceNumber: "" });
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-center justify-between gap-6 nb-panel p-6 mb-8"
      >
        <div>
          <h1 className="text-3xl font-display font-bold">Command Center</h1>
          <p className="font-mono text-sm text-ink/60 mt-1">
            Autonomous financial agent — bounded authority, full audit trail.
          </p>
          <p className="font-mono text-xs mt-3 text-ink/50">
            {loading ? "Connecting to agent..." : "Live · connected to backend on :4000"}
          </p>
        </div>
        <div className="animate-floatY">
          <AgentOrb riskTone={orbTone} size={200} />
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Processed" value={stats.total} tone="#ffffff" delay={0} />
        <StatCard label="Auto-Executed" value={stats.auto} tone="#7ee787" delay={0.05} />
        <StatCard label="Pending Approval" value={stats.pending} tone="#ffde59" delay={0.1} />
        <StatCard label="Blocked" value={stats.blocked} tone="#ff5c5c" delay={0.15} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <ActivityFeed transactions={transactions} />

        <div className="nb-panel p-5">
          <h3 className="font-display font-bold mb-4">💸 Submit a Payment Request</h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              className="border-[3px] border-ink px-3 py-2 font-mono text-sm bg-paper focus:outline-none"
              placeholder="Vendor name"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
            <input
              className="border-[3px] border-ink px-3 py-2 font-mono text-sm bg-paper focus:outline-none"
              placeholder="Amount (₹)"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              className="border-[3px] border-ink px-3 py-2 font-mono text-sm bg-paper focus:outline-none"
              placeholder="Invoice number (optional)"
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            />
            <button type="submit" disabled={submitting} className="nb-btn bg-accent px-4 py-2.5 font-display font-bold">
              {submitting ? "Assessing risk..." : "Submit to Agent →"}
            </button>
          </form>
          <p className="font-mono text-[11px] text-ink/50 mt-3">
            Tip: try a large amount with a brand-new vendor name to see it get escalated.
          </p>
        </div>
      </div>
    </main>
  );
}
