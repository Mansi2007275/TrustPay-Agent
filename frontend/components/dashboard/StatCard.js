"use client";
import { motion } from "framer-motion";

export default function StatCard({ label, value, tone = "#fff", delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="nb-panel p-4"
      style={{ backgroundColor: tone }}
    >
      <p className="font-mono text-xs uppercase tracking-wide text-ink/70">{label}</p>
      <p className="text-3xl font-display font-bold mt-1">{value}</p>
    </motion.div>
  );
}
