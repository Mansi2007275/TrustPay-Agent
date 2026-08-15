"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    fetch(`${base}/vendors`)
      .then((r) => r.json())
      .then((data) => setVendors(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  function trustTier(score) {
    if (score >= 80) return { label: "Gold", color: "#ffde59" };
    if (score >= 50) return { label: "Silver", color: "#d9d9d9" };
    if (score >= 25) return { label: "Bronze", color: "#e0a96d" };
    return { label: "New", color: "#ff5c5c" };
  }

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-display font-bold mb-1">🏢 Vendors</h1>
      <p className="font-mono text-sm text-ink/60 mb-6">Trust profiles built from real transaction history.</p>

      {loading && <p className="font-mono text-sm">Loading...</p>}
      {!loading && vendors.length === 0 && (
        <div className="nb-panel p-6 font-mono text-sm text-ink/60">
          No vendors yet — they're created automatically the first time you pay them.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {vendors.map((v, i) => {
          const tier = trustTier(v.trust_score);
          return (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="nb-panel p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-display font-bold">{v.name}</p>
                <span
                  className="font-mono text-xs font-bold px-2 py-1 border-2 border-ink"
                  style={{ backgroundColor: tier.color }}
                >
                  {tier.label}
                </span>
              </div>
              <p className="font-mono text-sm text-ink/60">Trust Score: {v.trust_score}/100</p>
              <p className="font-mono text-sm text-ink/60">Transactions: {v.total_transactions} · Rejected: {v.total_rejected}</p>
              <p className="font-mono text-sm text-ink/60">Avg amount: ₹{Math.round(v.avg_amount || 0).toLocaleString("en-IN")}</p>
            </motion.div>
          );
        })}
      </div>
    </main>
  );
}
