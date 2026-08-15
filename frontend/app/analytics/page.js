"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ExternalLink, RefreshCw, BarChart3 } from "lucide-react";
import { getRiskDistribution, getDecisionTrend, getTopFlaggedVendors } from "../../lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────
const WINDOWS = ["7d", "30d", "90d"];
const WINDOW_LABELS = { "7d": "Last 7 Days", "30d": "Last 30 Days", "90d": "Last 90 Days" };

const BUCKET_COLORS = {
  "0–20":   "#7ee787", // green
  "21–40":  "#b5f2a4",
  "41–60":  "#ffb700", // amber
  "61–80":  "#ff8c42", // orange
  "81–100": "#dc2626", // red
};

const DECISION_COLORS = {
  AUTO_EXECUTE:   "#7ee787",
  HUMAN_APPROVAL: "#ffb700",
  BLOCKED:        "#dc2626",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

function fmtDate(d) {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}`;
}

// ─── Window Selector ──────────────────────────────────────────────────────────
function WindowSelector({ value, onChange }) {
  return (
    <div className="flex border-[3px] border-ink overflow-hidden">
      {WINDOWS.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={`px-4 py-1.5 font-mono text-xs font-bold transition-colors ${
            value === w ? "bg-accent text-ink" : "bg-paper text-ink/60 hover:bg-panel"
          }`}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ window: win }) {
  return (
    <div className="nb-panel p-10 text-center">
      <p className="text-3xl mb-3">📭</p>
      <p className="font-display font-bold text-lg mb-2">Not enough data for {WINDOW_LABELS[win]}</p>
      <p className="font-mono text-sm text-ink/60">
        Submit more transactions via <strong>Command Center</strong> or run a batch in{" "}
        <strong>Simulation Lab</strong> / <strong>Fraud Center Attack Mode</strong> to see real data here.
      </p>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function NbTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="nb-panel p-3 text-xs font-mono min-w-[140px]" style={{ boxShadow: "4px 4px 0 #0a0a0a" }}>
      <p className="font-bold mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Risk Distribution Chart ──────────────────────────────────────────────────
function RiskDistributionSection({ window: win }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getRiskDistribution(win);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [win]);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary;
  const isEmpty = !data?.distribution?.length;

  const TrendIcon = summary?.trend === "up" ? TrendingUp : summary?.trend === "down" ? TrendingDown : Minus;
  const trendColor = summary?.trend === "up" ? "text-danger" : summary?.trend === "down" ? "text-safe" : "text-ink/50";

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <span className="w-2 h-6 bg-accent inline-block" />
          Risk Score Distribution
        </h2>
        <button onClick={load} className="nb-btn bg-paper px-3 py-1.5 font-mono text-xs flex items-center gap-1.5">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Summary stat card */}
      {summary && !isEmpty && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="nb-panel p-4 mb-4 bg-panel flex flex-wrap gap-6 items-center"
        >
          <div>
            <p className="font-mono text-[10px] text-ink/50 mb-0.5">AVG RISK SCORE ({WINDOW_LABELS[win]})</p>
            <p className="font-display font-bold text-3xl">{summary.avgRiskScore ?? "—"}<span className="text-base text-ink/40">/100</span></p>
          </div>
          <div className={`flex items-center gap-2 font-mono text-sm font-bold ${trendColor}`}>
            <TrendIcon size={18} />
            {summary.trend === "insufficient_data" ? "Not enough prior data to compare" :
             summary.trend === "up" ? `↑ Up from ${summary.priorAvgRiskScore} (prior ${win})` :
             summary.trend === "down" ? `↓ Down from ${summary.priorAvgRiskScore} (prior ${win})` :
             "Stable vs. prior window"}
          </div>
          <div className="ml-auto font-mono text-xs text-ink/40">
            {summary.totalTransactions} transactions
          </div>
        </motion.div>
      )}

      {loading && (
        <div className="nb-panel p-8 text-center font-mono text-sm text-ink/50 animate-pulse">
          Loading risk distribution...
        </div>
      )}
      {error && <div className="nb-panel p-4 bg-danger/10 font-mono text-sm text-danger">Error: {error}</div>}
      {!loading && !error && isEmpty && <EmptyState window={win} />}
      {!loading && !error && !isEmpty && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="nb-panel p-5 bg-panel"
        >
          {/* Bucket legend */}
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(BUCKET_COLORS).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className="w-3 h-3 inline-block border border-ink/30" style={{ backgroundColor: color }} />
                {label}
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.distribution} margin={{ top: 4, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} tickFormatter={fmtDate} />
              <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<NbTooltip />} />
              {Object.entries(BUCKET_COLORS).map(([bucket, color]) => (
                <Area
                  key={bucket}
                  type="monotone"
                  dataKey={bucket}
                  stackId="1"
                  stroke={color}
                  fill={color}
                  strokeWidth={1.5}
                  fillOpacity={0.85}
                  name={bucket}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </section>
  );
}

// ─── Decision Trend Chart ─────────────────────────────────────────────────────
function DecisionTrendSection({ window: win }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDecisionTrend(win);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [win]);

  useEffect(() => { load(); }, [load]);

  const isEmpty = !data?.trend?.length;
  const rates = data?.rates;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <span className="w-2 h-6 bg-warn inline-block" />
          Decision Trend
        </h2>
        <button onClick={load} className="nb-btn bg-paper px-3 py-1.5 font-mono text-xs flex items-center gap-1.5">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Rate breakdown */}
      {rates && !isEmpty && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="nb-panel p-4 mb-4 bg-panel flex flex-wrap gap-4 items-center"
        >
          {[
            { label: "Auto-Executed", pct: rates.autoExecPct, count: rates.autoExec, color: "bg-safe" },
            { label: "Escalated", pct: rates.humanApprovalPct, count: rates.humanApproval, color: "bg-warn" },
            { label: "Blocked", pct: rates.blockedPct, count: rates.blocked, color: "bg-danger text-white" },
          ].map(({ label, pct, count, color }) => (
            <div key={label} className={`nb-panel px-4 py-2 ${color}`}>
              <p className="font-mono text-[10px] mb-0.5">{label}</p>
              <p className="font-display font-bold text-2xl">{pct}%</p>
              <p className="font-mono text-[10px] text-ink/60">{count} txns</p>
            </div>
          ))}
          <div className="ml-auto font-mono text-xs text-ink/40">{rates.total} total transactions</div>
        </motion.div>
      )}

      {loading && (
        <div className="nb-panel p-8 text-center font-mono text-sm text-ink/50 animate-pulse">
          Loading decision trend...
        </div>
      )}
      {error && <div className="nb-panel p-4 bg-danger/10 font-mono text-sm text-danger">Error: {error}</div>}
      {!loading && !error && isEmpty && <EmptyState window={win} />}
      {!loading && !error && !isEmpty && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="nb-panel p-5 bg-panel"
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.trend} margin={{ top: 4, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} tickFormatter={fmtDate} />
              <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<NbTooltip />} />
              <Legend wrapperStyle={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
              <Line type="monotone" dataKey="AUTO_EXECUTE" name="Auto-Executed" stroke={DECISION_COLORS.AUTO_EXECUTE}
                strokeWidth={2.5} dot={{ r: 4, fill: DECISION_COLORS.AUTO_EXECUTE, stroke: "#0a0a0a", strokeWidth: 1.5 }}
                activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="HUMAN_APPROVAL" name="Escalated" stroke={DECISION_COLORS.HUMAN_APPROVAL}
                strokeWidth={2.5} dot={{ r: 4, fill: DECISION_COLORS.HUMAN_APPROVAL, stroke: "#0a0a0a", strokeWidth: 1.5 }}
                activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="BLOCKED" name="Blocked" stroke={DECISION_COLORS.BLOCKED}
                strokeWidth={2.5} dot={{ r: 4, fill: DECISION_COLORS.BLOCKED, stroke: "#0a0a0a", strokeWidth: 1.5 }}
                activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </section>
  );
}

// ─── Top Flagged Vendors ──────────────────────────────────────────────────────
function TopFlaggedVendorsSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getTopFlaggedVendors();
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vendors = data?.vendors || [];

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <span className="w-2 h-6 bg-danger inline-block" />
          Top Flagged Vendors — {data?.month || "This Month"}
        </h2>
        <button onClick={load} className="nb-btn bg-paper px-3 py-1.5 font-mono text-xs flex items-center gap-1.5">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading && (
        <div className="nb-panel p-8 text-center font-mono text-sm text-ink/50 animate-pulse">
          Loading vendor data...
        </div>
      )}
      {error && <div className="nb-panel p-4 bg-danger/10 font-mono text-sm text-danger">Error: {error}</div>}
      {!loading && !error && vendors.length === 0 && (
        <div className="nb-panel p-10 text-center">
          <p className="text-3xl mb-3">🏷️</p>
          <p className="font-display font-bold text-lg mb-2">No flagged vendors this month</p>
          <p className="font-mono text-sm text-ink/60">
            No transactions were escalated or blocked this calendar month. Submit transactions to see vendor risk profiles.
          </p>
        </div>
      )}
      {!loading && !error && vendors.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2 font-mono text-[10px] text-ink/50 uppercase tracking-wider border-b-2 border-ink/10">
            <span className="col-span-1">#</span>
            <span className="col-span-3">Vendor</span>
            <span className="col-span-2 text-right">Flagged</span>
            <span className="col-span-2 text-right">Amount</span>
            <span className="col-span-4">Top Reason</span>
          </div>

          {vendors.map((v, i) => (
            <motion.div
              key={v.vendorId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="nb-panel p-4 bg-panel hover:translate-x-[-2px] hover:translate-y-[-2px] transition-transform cursor-pointer group"
              onClick={() => window.location.href = `/vendors`}
            >
              <div className="grid grid-cols-12 gap-3 items-center">
                {/* Rank */}
                <div className="col-span-1 font-display font-bold text-2xl text-ink/20">
                  {i + 1}
                </div>

                {/* Vendor name + fraud badge */}
                <div className="col-span-3">
                  <p className="font-display font-bold text-sm">{v.vendor}</p>
                  {v.inFraudCenter && (
                    <span className="inline-flex items-center gap-1 mt-1 font-mono text-[9px] font-bold bg-danger/10 text-danger border border-danger px-1.5 py-0.5">
                      <AlertTriangle size={9} /> IN FRAUD CENTER
                    </span>
                  )}
                </div>

                {/* Count */}
                <div className="col-span-2 text-right">
                  <span className={`font-display font-bold text-xl ${
                    v.flaggedCount >= 5 ? "text-danger" : v.flaggedCount >= 3 ? "text-warn" : "text-ink"
                  }`}>{v.flaggedCount}</span>
                  <p className="font-mono text-[9px] text-ink/40">transactions</p>
                </div>

                {/* Amount */}
                <div className="col-span-2 text-right">
                  <p className="font-mono text-sm font-bold">{formatINR(v.flaggedAmount)}</p>
                  <p className="font-mono text-[9px] text-ink/40">total flagged</p>
                </div>

                {/* Reason */}
                <div className="col-span-3 font-mono text-[10px] text-ink/60 leading-relaxed line-clamp-2">
                  {v.reason}
                </div>

                {/* Link */}
                <div className="col-span-1 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink size={14} className="text-ink/40" />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [window, setWindow] = useState("7d");

  return (
    <main className="p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="nb-panel p-6 mb-8 bg-panel flex flex-wrap justify-between items-start gap-4"
      >
        <div>
          <h1 className="text-3xl font-display font-bold">📊 Analytics</h1>
          <p className="font-mono text-sm text-ink/60 mt-1">
            Live aggregations over real transaction data — no mock values.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <p className="font-mono text-[10px] text-ink/40 uppercase tracking-wider">Time Window</p>
          <WindowSelector value={window} onChange={setWindow} />
        </div>
      </motion.div>

      {/* Charts — all share the same window selector */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <RiskDistributionSection window={window} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <DecisionTrendSection window={window} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <TopFlaggedVendorsSection />
      </motion.div>
    </main>
  );
}
