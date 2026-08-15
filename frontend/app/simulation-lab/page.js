"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { runSimulation } from "../../lib/api";
import RiskBadge from "../../components/shared/RiskBadge";
import DecisionBadge from "../../components/shared/DecisionBadge";

const SCENARIOS = [
  { id: "normal", label: "Normal Payment", icon: "✅", desc: "Routine payment matching vendor history" },
  { id: "new_vendor_large", label: "New Vendor, Large Amount", icon: "🆕", desc: "₹4,00,000 to a vendor with zero history" },
  { id: "bank_account_changed", label: "Bank Account Changed", icon: "🏦", desc: "Trusted vendor, but destination account just changed" },
  { id: "night_payment", label: "Odd-Hour Payment", icon: "🌙", desc: "Payment triggered outside normal business hours" },
];

export default function SimulationLab() {
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);

  async function handleRun(id) {
    setRunning(id);
    setResult(null);
    try {
      const data = await runSimulation(id);
      // small delay so the "thinking" state is visible — real reasoning already happened server-side
      await new Promise((r) => setTimeout(r, 500));
      setResult(data);
    } finally {
      setRunning(null);
    }
  }

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-display font-bold mb-1">🧪 Simulation Lab</h1>
      <p className="font-mono text-sm text-ink/60 mb-6">
        Run canned scenarios through the real risk engine — no live data touched.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => handleRun(s.id)}
            disabled={running === s.id}
            className="nb-btn nb-panel text-left p-4 flex items-start gap-3"
          >
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className="font-display font-bold">{s.label}</p>
              <p className="font-mono text-xs text-ink/60 mt-1">{s.desc}</p>
              {running === s.id && <p className="font-mono text-xs mt-2 animate-pulse">Agent thinking...</p>}
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={result.scenario}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="nb-panel p-6"
          >
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="font-display font-bold text-lg">🧠 Agent Assessment</h3>
              <div className="flex gap-2">
                <RiskBadge score={result.riskScore} />
                <DecisionBadge decision={result.decision} />
              </div>
            </div>

            <p className="font-mono text-sm bg-paper border-[2.5px] border-ink p-3 mb-4">
              {result.reasoning}
            </p>

            <p className="font-mono text-xs uppercase text-ink/50 mb-2">Risk Factor Breakdown</p>
            <div className="flex flex-col gap-2">
              {Object.entries(result.factors).map(([key, val]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="font-mono text-xs w-40 shrink-0">{key}</span>
                  <div className="flex-1 h-3 border-2 border-ink bg-white overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${val}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full"
                      style={{ backgroundColor: val > 60 ? "#ff5c5c" : val > 30 ? "#ffb700" : "#7ee787" }}
                    />
                  </div>
                  <span className="font-mono text-xs w-8 text-right">{val}</span>
                </div>
              ))}
            </div>

            <p className="font-mono text-xs text-ink/50 mt-4">
              Confidence: {result.confidenceScore}%
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
