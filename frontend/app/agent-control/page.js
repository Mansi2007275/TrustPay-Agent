"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  ShieldOff, Play, Save, AlertTriangle, CheckCircle2,
  Activity, TrendingUp, Clock, Zap, RefreshCw, Info
} from "lucide-react";
import {
  getAgentStatus, getSpendingLimits, updateSpendingLimits,
  triggerEmergencyStop, resumeAgent, getAgentHealth,
} from "../../lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatUptime(seconds) {
  if (!seconds || seconds < 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!d && !h) parts.push(`${s}s`);
  return parts.join(" ");
}

function formatINR(val) {
  return `₹${Number(val || 0).toLocaleString("en-IN")}`;
}

// ─── Save Banner ──────────────────────────────────────────────────────────────
function Toast({ message, type = "success", onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className={`fixed top-4 right-4 z-50 nb-panel px-5 py-3 font-mono text-sm flex items-center gap-2 ${
        type === "success" ? "bg-safe" : "bg-danger text-white"
      }`}
    >
      {type === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      {message}
    </motion.div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, children, color = "bg-accent" }) {
  return (
    <h2 className="font-display font-bold text-xl mb-5 flex items-center gap-3">
      <span className={`w-2 h-6 ${color} inline-block`} />
      {Icon && <Icon size={20} />}
      {children}
    </h2>
  );
}

// ─── Spending Limits Panel ────────────────────────────────────────────────────
function SpendingLimitsPanel({ onToast }) {
  const [perTx, setPerTx] = useState("");
  const [daily, setDaily] = useState("");
  const [dailyUsed, setDailyUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getSpendingLimits();
      setPerTx(data.perTransactionLimit);
      setDaily(data.dailyLimit);
      setDailyUsed(data.dailyUsed || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pct = Math.min(100, daily > 0 ? Math.round((dailyUsed / daily) * 100) : 0);
  const overLimit = dailyUsed >= daily;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSpendingLimits(Number(perTx), Number(daily));
      onToast("Spending limits saved & active immediately");
      await load();
    } catch (e) {
      onToast("Save failed: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-10">
      <SectionHeader icon={Zap} color="bg-warn">Spending Limits</SectionHeader>

      {loading ? (
        <div className="nb-panel p-6 font-mono text-sm text-ink/50 animate-pulse">Loading limits...</div>
      ) : (
        <div className="nb-panel p-6 bg-panel">
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block font-mono text-xs text-ink/60 mb-1">
                Per-Transaction Auto-Execute Ceiling (₹)
              </label>
              <p className="font-mono text-[10px] text-ink/40 mb-2">
                Any single payment above this is forced to HUMAN_APPROVAL regardless of risk score.
              </p>
              <input
                type="number"
                value={perTx}
                onChange={e => setPerTx(e.target.value)}
                className="w-full border-[3px] border-ink px-3 py-2 font-mono text-xl bg-paper focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-mono text-xs text-ink/60 mb-1">
                Daily Cumulative Auto-Execute Limit (₹)
              </label>
              <p className="font-mono text-[10px] text-ink/40 mb-2">
                Once the agent has auto-executed this total today, all further auto-executions are paused.
              </p>
              <input
                type="number"
                value={daily}
                onChange={e => setDaily(e.target.value)}
                className="w-full border-[3px] border-ink px-3 py-2 font-mono text-xl bg-paper focus:outline-none"
              />
            </div>
          </div>

          {/* Daily progress bar */}
          <div className="mb-5">
            <div className="flex justify-between font-mono text-xs mb-1.5">
              <span className="text-ink/60">Today's auto-executed total</span>
              <span className={`font-bold ${overLimit ? "text-danger" : "text-ink"}`}>
                {formatINR(dailyUsed)} / {formatINR(daily)} ({pct}%)
              </span>
            </div>
            <div className="w-full h-4 border-[3px] border-ink bg-paper overflow-hidden">
              <motion.div
                className={`h-full ${overLimit ? "bg-danger" : pct > 75 ? "bg-warn" : "bg-safe"}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            {overLimit && (
              <p className="font-mono text-xs text-danger mt-1 font-bold">
                ⚠ Daily limit reached — agent will escalate all further payments today
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="nb-btn bg-accent px-6 py-2.5 font-display font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={15} />
              {saving ? "Saving..." : "Save Limits"}
            </button>
            <button onClick={load} className="nb-btn bg-paper px-3 py-2 font-mono text-xs flex items-center gap-1.5">
              <RefreshCw size={12} /> Refresh
            </button>
            <div className="font-mono text-[10px] text-ink/40 flex items-center gap-1 ml-auto">
              <Info size={11} /> Changes take effect immediately on the next transaction
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Emergency Stop Panel ─────────────────────────────────────────────────────
function EmergencyStopPanel({ onToast, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'stop' | 'resume'
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getAgentStatus();
      setStatus(data);
      onStatusChange?.(Boolean(data.isEmergencyStopped));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => { load(); }, [load]);

  const handleStop = async () => {
    setActing(true);
    try {
      await triggerEmergencyStop("Manual emergency stop via Agent Control panel");
      onToast("🔴 Emergency Stop activated — all autonomous execution paused");
      await load();
    } catch (e) {
      onToast("Stop failed: " + e.message, "error");
    } finally {
      setActing(false);
      setConfirm(null);
    }
  };

  const handleResume = async () => {
    setActing(true);
    try {
      await resumeAgent();
      onToast("▶️ Agent resumed — autonomous execution re-enabled");
      await load();
    } catch (e) {
      onToast("Resume failed: " + e.message, "error");
    } finally {
      setActing(false);
      setConfirm(null);
    }
  };

  const isStopped = status?.isEmergencyStopped;

  return (
    <section className="mb-10">
      <SectionHeader icon={ShieldOff} color="bg-danger">Emergency Stop</SectionHeader>

      {loading ? (
        <div className="nb-panel p-6 font-mono text-sm text-ink/50 animate-pulse">Checking agent status...</div>
      ) : (
        <>
          {/* Current state banner */}
          <AnimatePresence mode="wait">
            {isStopped ? (
              <motion.div
                key="stopped"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="nb-panel p-5 mb-5 bg-danger/10 border-danger"
                style={{ borderColor: "#dc2626", borderWidth: 3 }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-danger animate-pulse" />
                  <p className="font-display font-bold text-lg text-danger">AGENT STOPPED</p>
                </div>
                <p className="font-mono text-xs text-ink/70">
                  All autonomous execution is paused. Every new transaction will be forced to{" "}
                  <strong>HUMAN_APPROVAL</strong> regardless of risk score.
                </p>
                {status?.stoppedAt && (
                  <p className="font-mono text-[10px] text-ink/40 mt-2">
                    Stopped at: {new Date(status.stoppedAt).toLocaleString()}
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="active"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="nb-panel p-5 mb-5 bg-safe/20"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block w-3 h-3 rounded-full bg-safe animate-pulse" />
                  <p className="font-display font-bold text-lg">Agent Active</p>
                </div>
                <p className="font-mono text-xs text-ink/60 mt-1">
                  Autonomous execution is enabled. Transactions meeting policy thresholds will auto-execute.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Confirmation prompt */}
          <AnimatePresence>
            {confirm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className={`nb-panel p-4 mb-4 ${confirm === "stop" ? "bg-danger/10 border-danger" : "bg-safe/10"}`}
                  style={{ borderColor: confirm === "stop" ? "#dc2626" : undefined, borderWidth: confirm === "stop" ? 3 : undefined }}>
                  <p className="font-mono text-sm font-bold mb-3">
                    {confirm === "stop"
                      ? "⚠️ This will immediately pause ALL autonomous payment execution. Continue?"
                      : "▶️ Resume agent? Autonomous execution will re-enable instantly."}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={confirm === "stop" ? handleStop : handleResume}
                      disabled={acting}
                      className={`nb-btn px-5 py-2 font-display font-bold text-sm flex items-center gap-2 disabled:opacity-50 ${
                        confirm === "stop" ? "bg-danger text-white" : "bg-safe"
                      }`}
                    >
                      {acting ? <RefreshCw size={13} className="animate-spin" /> : null}
                      {acting ? "Processing..." : confirm === "stop" ? "Yes, Stop Agent" : "Yes, Resume Agent"}
                    </button>
                    <button
                      onClick={() => setConfirm(null)}
                      className="nb-btn bg-paper px-4 py-2 font-mono text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          {!confirm && (
            <div className="flex gap-4">
              {!isStopped ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setConfirm("stop")}
                  className="nb-btn px-8 py-4 font-display font-bold text-lg flex items-center gap-3"
                  style={{
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "4px solid #0a0a0a",
                    boxShadow: "6px 6px 0 #0a0a0a",
                  }}
                >
                  <ShieldOff size={22} />
                  🔴 EMERGENCY STOP
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setConfirm("resume")}
                  className="nb-btn px-8 py-4 font-display font-bold text-lg flex items-center gap-3 bg-safe"
                  style={{
                    border: "4px solid #0a0a0a",
                    boxShadow: "6px 6px 0 #0a0a0a",
                  }}
                >
                  <Play size={22} />
                  ▶️ Resume Agent
                </motion.button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Agent Health Panel ───────────────────────────────────────────────────────
function AgentHealthPanel() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await getAgentHealth();
      setHealth(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(pollRef.current);
  }, [load]);

  const ViolationCard = ({ label, count, color }) => (
    <div className={`nb-panel p-4 text-center ${color}`}>
      <p className="font-mono text-[10px] text-ink/60 mb-1">{label}</p>
      <p className="font-display font-bold text-4xl">{count ?? "—"}</p>
      <p className="font-mono text-[10px] text-ink/50 mt-1">BLOCKED txns</p>
    </div>
  );

  return (
    <section>
      <SectionHeader icon={Activity} color="bg-safe">
        Live Agent Health
        <span className="ml-auto font-mono text-[10px] text-ink/40 font-normal flex items-center gap-1">
          <RefreshCw size={10} /> Auto-refreshes every 30s
        </span>
      </SectionHeader>

      {loading ? (
        <div className="nb-panel p-8 text-center font-mono text-sm text-ink/50 animate-pulse">
          Loading health metrics...
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Uptime */}
          <div className="nb-panel p-5 bg-panel grid md:grid-cols-2 gap-4">
            <div>
              <p className="font-mono text-xs text-ink/60 mb-1 flex items-center gap-1">
                <Clock size={12} /> Server Uptime
              </p>
              <p className="font-display font-bold text-3xl">
                {formatUptime(health?.uptimeSeconds)}
              </p>
              {health?.serverStartedAt && (
                <p className="font-mono text-[10px] text-ink/40 mt-1">
                  Started: {new Date(health.serverStartedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div>
              <p className="font-mono text-xs text-ink/60 mb-1 flex items-center gap-1">
                <TrendingUp size={12} /> 7-Day Availability
              </p>
              <p className={`font-display font-bold text-3xl ${
                health?.uptimePercent7d >= 99 ? "text-safe" : health?.uptimePercent7d >= 90 ? "text-warn" : "text-danger"
              }`}>
                {health?.uptimePercent7d ?? 100}%
              </p>
              <p className="font-mono text-[10px] text-ink/40 mt-1">
                Time NOT in Emergency Stop
              </p>
            </div>
          </div>

          {/* Policy Violations */}
          <div>
            <p className="font-mono text-xs font-bold text-ink/60 mb-3 uppercase tracking-wider">
              Policy Violations (BLOCKED Transactions)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <ViolationCard label="Today" count={health?.policyViolations?.today} color="bg-panel" />
              <ViolationCard
                label="Last 7 Days"
                count={health?.policyViolations?.last7d}
                color={health?.policyViolations?.last7d > 5 ? "bg-warn/20" : "bg-panel"}
              />
              <ViolationCard
                label="Last 30 Days"
                count={health?.policyViolations?.last30d}
                color={health?.policyViolations?.last30d > 20 ? "bg-danger/10" : "bg-panel"}
              />
            </div>
          </div>

          {/* Confidence Trend Chart */}
          <div className="nb-panel p-5 bg-panel">
            <p className="font-mono text-xs font-bold text-ink/60 mb-4 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={13} /> 14-Day Confidence Trend (Daily Average)
            </p>
            {health?.confidenceTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={health.confidenceTrend} margin={{ top: 4, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }}
                    tickFormatter={d => d?.slice(5)} // show MM-DD
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{ fontFamily: "IBM Plex Mono", fontSize: 11, border: "2px solid #0a0a0a" }}
                    formatter={(v) => [`${v}%`, "Avg Confidence"]}
                    labelFormatter={(l) => `Date: ${l}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgConfidence"
                    stroke="#0a0a0a"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#ffb700", stroke: "#0a0a0a", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center font-mono text-sm text-ink/40">
                No confidence data yet — submit transactions to see the trend.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AgentControlPage() {
  const [toast, setToast] = useState(null);
  const [isStopped, setIsStopped] = useState(false);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
  }, []);

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <AnimatePresence>
        {toast && (
          <Toast
            key={toast.msg}
            message={toast.msg}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="nb-panel p-6 mb-8 bg-panel flex justify-between items-start flex-wrap gap-4"
      >
        <div>
          <h1 className="text-3xl font-display font-bold">🤖 Agent Control</h1>
          <p className="font-mono text-sm text-ink/60 mt-1">
            Spending limits, live health monitoring, and the emergency kill switch.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {isStopped ? (
            <motion.div
              key="stopped-badge"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="nb-panel px-4 py-2 bg-danger text-white font-mono text-xs font-bold flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              AGENT STOPPED — EMERGENCY MODE
            </motion.div>
          ) : (
            <motion.div
              key="active-badge"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="nb-panel px-4 py-2 bg-safe font-mono text-xs font-bold flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />
              AGENT ACTIVE
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Sections */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <EmergencyStopPanel onToast={showToast} onStatusChange={setIsStopped} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <SpendingLimitsPanel onToast={showToast} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <AgentHealthPanel />
      </motion.div>
    </main>
  );
}
