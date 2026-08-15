"use client";
import { motion, AnimatePresence } from "framer-motion";
import RiskBadge from "../shared/RiskBadge";
import DecisionBadge from "../shared/DecisionBadge";

export default function ActivityFeed({ transactions = [] }) {
  return (
    <div className="nb-panel p-0 overflow-hidden">
      <div className="px-4 py-3 border-b-[3px] border-ink bg-accent">
        <h3 className="font-display font-bold">🤖 Agent Activity</h3>
      </div>
      <div className="divide-y-[2px] divide-ink/10 max-h-[420px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {transactions.length === 0 && (
            <p className="p-4 font-mono text-sm text-ink/50">No transactions yet — submit one or run a simulation.</p>
          )}
          {transactions.map((tx, i) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className="p-4 flex items-center justify-between gap-3 flex-wrap"
            >
              <div>
                <p className="font-display font-bold">{tx.vendor} — ₹{Number(tx.amount).toLocaleString("en-IN")}</p>
                <p className="font-mono text-xs text-ink/50">{new Date(tx.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <RiskBadge score={tx.risk_score} />
                <DecisionBadge decision={tx.decision} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
