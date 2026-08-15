"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTransactions, resolveTransaction } from "../../lib/api";
import RiskBadge from "../../components/shared/RiskBadge";
import DecisionBadge from "../../components/shared/DecisionBadge";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await getTransactions();
      setTransactions(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleResolve(id, action) {
    await resolveTransaction(id, action);
    load();
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-display font-bold mb-1">Transactions</h1>
      <p className="font-mono text-sm text-ink/60 mb-6">Every payment the agent has evaluated.</p>

      {loading && <p className="font-mono text-sm">Loading...</p>}
      {!loading && transactions.length === 0 && (
        <div className="nb-panel p-6 font-mono text-sm text-ink/60">
          No transactions yet. Head to Command Center or Simulation Lab to create one.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {transactions.map((tx, i) => (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="nb-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          >
            <div>
              <p className="font-display font-bold">{tx.vendor}</p>
              <p className="font-mono text-sm text-ink/60">
                ₹{Number(tx.amount).toLocaleString("en-IN")} · Invoice {tx.invoice_number}
              </p>
              <p className="font-mono text-xs text-ink/40">{new Date(tx.created_at).toLocaleString()}</p>
              {tx.policy_version_number && (
                <a
                  href="/policies"
                  className="inline-block mt-1 font-mono text-[10px] border border-ink/20 px-2 py-0.5 bg-paper hover:bg-ink hover:text-paper transition-colors"
                  title="View the policy rules active at the time this transaction was evaluated"
                >
                  ⚙️ Policy v{tx.policy_version_number}
                </a>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <RiskBadge score={tx.risk_score} />
              <DecisionBadge decision={tx.decision} />
              {tx.status === "PENDING" && (
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={() => handleResolve(tx.id, "approve")}
                    className="nb-btn bg-safe px-3 py-1.5 font-mono text-xs font-bold"
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => handleResolve(tx.id, "reject")}
                    className="nb-btn bg-danger px-3 py-1.5 font-mono text-xs font-bold"
                  >
                    ❌ Reject
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </main>
  );
}
