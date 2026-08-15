"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ShieldAlert, ShieldCheck, Zap, Edit2, Trash2,
  Plus, Save, X, ChevronDown, ChevronUp, Clock, CheckCircle2,
  AlertTriangle, Info, RefreshCw
} from "lucide-react";
import {
  getPolicies, createPolicy, updatePolicy, deletePolicy,
  getPolicyVersions, switchTrustMode
} from "../../lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────
const TRUST_MODES = [
  {
    id: "conservative",
    label: "Conservative",
    icon: ShieldAlert,
    color: "#ff5c5c",
    bg: "#fff0f0",
    description: "Agent escalates aggressively. Auto-execute only below ₹5,000. Block above ₹50,000. Extra blocked conditions for new vendors.",
    thresholds: { auto: "₹5,000", block: "₹50,000" },
    tagline: "Minimal autonomy · Maximum oversight"
  },
  {
    id: "balanced",
    label: "Balanced",
    icon: Shield,
    color: "#ffb700",
    bg: "#fffbea",
    description: "Default operating mode. Auto-execute below ₹15,000. Block above ₹1,00,000. Standard bank-account-change protection.",
    thresholds: { auto: "₹15,000", block: "₹1,00,000" },
    tagline: "Moderate autonomy · Sensible defaults"
  },
  {
    id: "autonomous",
    label: "Autonomous",
    icon: Zap,
    color: "#7ee787",
    bg: "#f0fff4",
    description: "Agent handles most transactions independently. Auto-execute below ₹50,000. Block only above ₹5,00,000.",
    thresholds: { auto: "₹50,000", block: "₹5,00,000" },
    tagline: "High autonomy · Minimal interruptions"
  }
];

const CONDITION_FIELDS = [
  { value: "bankAccountChanged", label: "Bank Account Changed" },
  { value: "newVendor", label: "New Vendor (no history)" },
  { value: "amount", label: "Payment Amount (₹)" },
  { value: "trustScore", label: "Vendor Trust Score" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
];

// ─── Sub-Components ───────────────────────────────────────────────────────────

function SectionHeader({ children }) {
  return (
    <h2 className="font-display font-bold text-xl mb-5 flex items-center gap-2">
      {children}
    </h2>
  );
}

function SaveBanner({ message, type = "success" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`fixed top-4 right-4 z-50 nb-panel px-5 py-3 font-mono text-sm flex items-center gap-2 ${
        type === "success" ? "bg-safe" : "bg-danger text-white"
      }`}
    >
      {type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {message}
    </motion.div>
  );
}

// ─── Trust Mode Selector ──────────────────────────────────────────────────────
function TrustModeSelector({ currentVersion, onSwitch }) {
  const [pendingMode, setPendingMode] = useState(null);
  const [switching, setSwitching] = useState(false);

  const handleSelect = (modeId) => {
    if (!pendingMode) {
      setPendingMode(modeId);
    } else if (pendingMode === modeId) {
      // Confirmed — switch
      doSwitch(modeId);
    } else {
      setPendingMode(modeId);
    }
  };

  const doSwitch = async (mode) => {
    setSwitching(true);
    try {
      const res = await switchTrustMode(mode);
      onSwitch(res.newVersionNumber, mode);
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setSwitching(false);
      setPendingMode(null);
    }
  };

  return (
    <section className="mb-10">
      <SectionHeader>
        <Shield size={20} /> Trust Mode
      </SectionHeader>

      <div className="grid md:grid-cols-3 gap-4">
        {TRUST_MODES.map((mode, i) => {
          const Icon = mode.icon;
          const isPending = pendingMode === mode.id;

          return (
            <motion.div
              key={mode.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <button
                onClick={() => !switching && handleSelect(mode.id)}
                disabled={switching}
                className={`w-full text-left nb-panel p-5 transition-all cursor-pointer ${
                  isPending ? "ring-4 ring-offset-1 ring-ink" : "hover:translate-x-[-2px] hover:translate-y-[-2px]"
                }`}
                style={{ backgroundColor: isPending ? mode.color : mode.bg, boxShadow: isPending ? "6px 6px 0 #0a0a0a" : "4px 4px 0 #0a0a0a" }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <Icon size={28} strokeWidth={2.2} style={{ color: mode.color === mode.bg ? "#0a0a0a" : mode.color }} />
                  {isPending && (
                    <span className="text-[10px] font-mono font-bold bg-ink text-paper px-2 py-0.5 animate-pulse">
                      CLICK AGAIN TO CONFIRM
                    </span>
                  )}
                </div>
                <p className="font-display font-bold text-xl mb-1">{mode.label}</p>
                <p className="font-mono text-[10px] text-ink/50 mb-3">{mode.tagline}</p>
                <p className="font-mono text-xs text-ink/70 leading-relaxed mb-3">{mode.description}</p>
                <div className="flex gap-3 text-[10px] font-mono">
                  <span className="bg-safe border border-ink px-2 py-0.5 font-bold">AUTO ≤ {mode.thresholds.auto}</span>
                  <span className="bg-danger text-white border border-ink px-2 py-0.5 font-bold">BLOCK ≥ {mode.thresholds.block}</span>
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>

      {pendingMode && !switching && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-4 nb-panel p-4 bg-warn/20 flex items-center justify-between"
        >
          <div className="font-mono text-sm flex items-center gap-2">
            <AlertTriangle size={16} className="text-warn" />
            Switching to <strong>{pendingMode.toUpperCase()}</strong> will change how the live risk engine evaluates every future transaction.
          </div>
          <div className="flex gap-2 ml-4 shrink-0">
            <button
              onClick={() => doSwitch(pendingMode)}
              className="nb-btn bg-safe px-4 py-1.5 font-display font-bold text-xs"
            >
              Confirm Switch
            </button>
            <button
              onClick={() => setPendingMode(null)}
              className="nb-btn bg-panel px-3 py-1.5 font-mono text-xs"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {switching && (
        <div className="mt-4 nb-panel p-4 bg-paper font-mono text-sm flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Applying trust mode and bumping policy version...
        </div>
      )}
    </section>
  );
}

// ─── Amount Threshold Editor ──────────────────────────────────────────────────
function ThresholdEditor({ policy, onSave }) {
  const config = policy?.config || { autoExecuteLimit: 15000, blockLimit: 100000 };
  const [autoLimit, setAutoLimit] = useState(config.autoExecuteLimit);
  const [blockLimit, setBlockLimit] = useState(config.blockLimit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (policy?.config) {
      setAutoLimit(policy.config.autoExecuteLimit);
      setBlockLimit(policy.config.blockLimit);
    }
  }, [policy]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { config: { autoExecuteLimit: Number(autoLimit), blockLimit: Number(blockLimit) } };
      if (policy?.id) {
        await updatePolicy(policy.id, { ...payload, name: policy.name });
      } else {
        await createPolicy({ name: "Default Balanced Thresholds", ruleType: "amount_threshold", ...payload });
      }
      onSave(`Amount thresholds saved — v${(policy?.newVersionNumber || 0) + 1}`);
    } catch (e) {
      onSave("Save failed: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nb-panel p-5 bg-panel">
      <h3 className="font-display font-bold text-base mb-4 flex items-center gap-2">
        <span className="w-2 h-5 bg-safe inline-block" />
        Amount Thresholds
      </h3>

      <div className="grid md:grid-cols-2 gap-6 mb-5">
        <div>
          <label className="block font-mono text-xs text-ink/60 mb-1">
            🟢 AUTO-EXECUTE below (₹)
          </label>
          <p className="font-mono text-[10px] text-ink/40 mb-2">Agent executes independently without human review</p>
          <input
            type="number"
            value={autoLimit}
            onChange={e => setAutoLimit(e.target.value)}
            className="w-full border-[3px] border-ink px-3 py-2 font-mono text-lg bg-paper focus:outline-none"
          />
        </div>

        <div>
          <label className="block font-mono text-xs text-ink/60 mb-1">
            🔴 BLOCK above (₹)
          </label>
          <p className="font-mono text-[10px] text-ink/40 mb-2">Agent automatically rejects regardless of other factors</p>
          <input
            type="number"
            value={blockLimit}
            onChange={e => setBlockLimit(e.target.value)}
            className="w-full border-[3px] border-ink px-3 py-2 font-mono text-lg bg-paper focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 p-3 border-2 border-ink/10 bg-paper mb-5 font-mono text-xs text-ink/60">
        <Info size={14} className="shrink-0" />
        Between ₹{Number(autoLimit).toLocaleString("en-IN")} and ₹{Number(blockLimit).toLocaleString("en-IN")}: agent flags for HUMAN APPROVAL
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="nb-btn bg-accent px-5 py-2 font-display font-bold text-sm flex items-center gap-2 disabled:opacity-50"
      >
        <Save size={14} />
        {saving ? "Saving..." : "Save Thresholds"}
      </button>
    </div>
  );
}

// ─── Approver Routing Editor ──────────────────────────────────────────────────
function RoutingEditor({ policy, onSave }) {
  const defaultRoutes = [
    { minAmount: 0, maxAmount: 100000, chatId: "" },
  ];
  const [routes, setRoutes] = useState(policy?.config?.routes || defaultRoutes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (policy?.config?.routes) {
      setRoutes(policy.config.routes);
    }
  }, [policy]);

  const updateRoute = (idx, field, value) => {
    setRoutes(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRoute = () => setRoutes(prev => [...prev, { minAmount: 0, maxAmount: 999999, chatId: "" }]);
  const removeRoute = (idx) => setRoutes(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { config: { routes: routes.map(r => ({ ...r, minAmount: Number(r.minAmount), maxAmount: Number(r.maxAmount) })) } };
      if (policy?.id) {
        await updatePolicy(policy.id, { ...payload, name: policy.name });
      } else {
        await createPolicy({ name: "Default Approver Routing", ruleType: "approver_routing", ...payload });
      }
      onSave("Routing rules saved");
    } catch (e) {
      onSave("Save failed: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nb-panel p-5 bg-panel">
      <h3 className="font-display font-bold text-base mb-4 flex items-center gap-2">
        <span className="w-2 h-5 bg-warn inline-block" />
        Approver Routing
      </h3>
      <p className="font-mono text-xs text-ink/50 mb-4">
        Map amount ranges to specific Telegram Chat IDs. The first matching route is used.
      </p>

      <div className="flex flex-col gap-3 mb-4">
        {routes.map((route, i) => (
          <div key={i} className="border-[3px] border-ink p-3 bg-paper grid grid-cols-3 gap-3 items-center">
            <div>
              <label className="font-mono text-[10px] text-ink/50">Min Amount (₹)</label>
              <input
                type="number"
                value={route.minAmount}
                onChange={e => updateRoute(i, "minAmount", e.target.value)}
                className="w-full border-[2px] border-ink/30 px-2 py-1 font-mono text-sm bg-white focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-ink/50">Max Amount (₹)</label>
              <input
                type="number"
                value={route.maxAmount}
                onChange={e => updateRoute(i, "maxAmount", e.target.value)}
                className="w-full border-[2px] border-ink/30 px-2 py-1 font-mono text-sm bg-white focus:outline-none focus:border-ink"
              />
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="font-mono text-[10px] text-ink/50">Telegram Chat ID</label>
                <input
                  type="text"
                  value={route.chatId}
                  onChange={e => updateRoute(i, "chatId", e.target.value)}
                  placeholder="e.g. 6390520739"
                  className="w-full border-[2px] border-ink/30 px-2 py-1 font-mono text-sm bg-white focus:outline-none focus:border-ink"
                />
              </div>
              {routes.length > 1 && (
                <button onClick={() => removeRoute(i)} className="nb-btn bg-danger/20 p-1.5 text-danger shrink-0">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={addRoute} className="nb-btn bg-paper px-3 py-2 font-mono text-xs flex items-center gap-1">
          <Plus size={13} /> Add Route
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="nb-btn bg-accent px-5 py-2 font-display font-bold text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "Saving..." : "Save Routing"}
        </button>
      </div>
    </div>
  );
}

// ─── Blocked Conditions Editor ────────────────────────────────────────────────
function BlockedConditionsEditor({ policy, onSave }) {
  const defaultRules = [{ conditions: [{ field: "bankAccountChanged", operator: "equals", value: "true" }] }];
  const [rules, setRules] = useState(policy?.config?.rules || defaultRules);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (policy?.config?.rules) setRules(policy.config.rules);
  }, [policy]);

  const addRule = () => setRules(prev => [...prev, { conditions: [{ field: "bankAccountChanged", operator: "equals", value: "true" }] }]);
  const removeRule = (rIdx) => setRules(prev => prev.filter((_, i) => i !== rIdx));
  const addCondition = (rIdx) => setRules(prev => prev.map((r, i) => i === rIdx ? { ...r, conditions: [...r.conditions, { field: "amount", operator: "greater_than", value: "0" }] } : r));
  const removeCondition = (rIdx, cIdx) => setRules(prev => prev.map((r, i) => i === rIdx ? { ...r, conditions: r.conditions.filter((_, j) => j !== cIdx) } : r));
  const updateCondition = (rIdx, cIdx, field, value) => setRules(prev => prev.map((r, i) => i === rIdx ? {
    ...r,
    conditions: r.conditions.map((c, j) => j === cIdx ? { ...c, [field]: value } : c)
  } : r));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { config: { rules } };
      if (policy?.id) {
        await updatePolicy(policy.id, { ...payload, name: policy.name });
      } else {
        await createPolicy({ name: "Default Blocked Overrides", ruleType: "blocked_condition", ...payload });
      }
      onSave("Blocked conditions saved");
    } catch (e) {
      onSave("Save failed: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nb-panel p-5 bg-panel">
      <h3 className="font-display font-bold text-base mb-4 flex items-center gap-2">
        <span className="w-2 h-5 bg-danger inline-block" />
        Blocked Override Conditions
      </h3>
      <p className="font-mono text-xs text-ink/50 mb-4">
        Each block is an AND-chain of conditions. If all conditions in a block match, the transaction is force-blocked regardless of risk score.
      </p>

      <div className="flex flex-col gap-4 mb-4">
        {rules.map((rule, rIdx) => (
          <div key={rIdx} className="border-[3px] border-danger p-4 bg-danger/5 relative">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] font-bold text-danger">BLOCK RULE {rIdx + 1}</span>
              <button onClick={() => removeRule(rIdx)} className="text-danger hover:text-ink">
                <Trash2 size={14} />
              </button>
            </div>

            {rule.conditions.map((cond, cIdx) => (
              <div key={cIdx} className="flex gap-2 items-center mb-2">
                {cIdx > 0 && <span className="font-mono text-[10px] font-bold text-ink/50 w-6 shrink-0">AND</span>}
                {cIdx === 0 && <span className="font-mono text-[10px] text-ink/40 w-6 shrink-0">IF</span>}

                <select
                  value={cond.field}
                  onChange={e => updateCondition(rIdx, cIdx, "field", e.target.value)}
                  className="border-[2px] border-ink/30 px-2 py-1 font-mono text-xs bg-white focus:outline-none focus:border-ink"
                >
                  {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>

                <select
                  value={cond.operator}
                  onChange={e => updateCondition(rIdx, cIdx, "operator", e.target.value)}
                  className="border-[2px] border-ink/30 px-2 py-1 font-mono text-xs bg-white focus:outline-none focus:border-ink"
                >
                  {CONDITION_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>

                <input
                  type="text"
                  value={cond.value}
                  onChange={e => updateCondition(rIdx, cIdx, "value", e.target.value)}
                  className="border-[2px] border-ink/30 px-2 py-1 font-mono text-xs bg-white w-24 focus:outline-none focus:border-ink"
                  placeholder="value"
                />

                {rule.conditions.length > 1 && (
                  <button onClick={() => removeCondition(rIdx, cIdx)} className="text-ink/40 hover:text-danger ml-1">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={() => addCondition(rIdx)}
              className="mt-1 font-mono text-[10px] text-ink/50 hover:text-ink flex items-center gap-1"
            >
              <Plus size={11} /> Add condition (AND)
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={addRule} className="nb-btn bg-paper px-3 py-2 font-mono text-xs flex items-center gap-1">
          <Plus size={13} /> Add Block Rule
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="nb-btn bg-accent px-5 py-2 font-display font-bold text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "Saving..." : "Save Conditions"}
        </button>
      </div>
    </div>
  );
}

// ─── Version History ──────────────────────────────────────────────────────────
function VersionHistory({ versions, currentVersionNumber }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!versions.length) {
    return (
      <div className="nb-panel p-8 text-center font-mono text-sm text-ink/50">
        No version history yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {versions.map((v, i) => {
        const snap = v.fullConfigSnapshot;
        const isLatest = v.versionNumber === currentVersionNumber;
        const isExpanded = expandedId === v.id;

        return (
          <motion.div
            key={v.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`nb-panel p-4 ${isLatest ? "border-l-[6px] border-l-safe" : ""}`}
          >
            <button
              className="w-full text-left flex items-center justify-between gap-4"
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`font-mono font-bold text-lg ${isLatest ? "text-safe" : "text-ink/50"}`}>
                  v{v.versionNumber}
                </div>
                <div>
                  <p className="font-mono text-xs text-ink/60">
                    <Clock size={11} className="inline mr-1" />
                    {new Date(snap?.createdAt || v.createdAt).toLocaleString()}
                  </p>
                  {snap?.reason && (
                    <p className="font-mono text-xs text-ink/80 mt-0.5">{snap.reason}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLatest && (
                  <span className="bg-safe border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold">
                    ACTIVE
                  </span>
                )}
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            <AnimatePresence>
              {isExpanded && snap?.policies && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 pt-4 border-t-2 border-ink/10 grid gap-3">
                    {snap.policies.map(p => (
                      <div key={p.id} className="font-mono text-xs bg-paper p-3 border border-ink/15">
                        <p className="font-bold mb-1">{p.name} <span className="text-ink/40 font-normal">({p.ruleType})</span></p>
                        <pre className="text-[10px] text-ink/60 whitespace-pre-wrap overflow-auto max-h-32">
                          {JSON.stringify(p.config || (typeof p.config === "string" ? JSON.parse(p.config) : p.config), null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [versions, setVersions] = useState([]);
  const [currentVersionNumber, setCurrentVersionNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    try {
      const [polData, verData] = await Promise.all([getPolicies(), getPolicyVersions()]);
      setPolicies(polData.policies || []);
      setCurrentVersionNumber(polData.currentVersionNumber || 1);
      setVersions(verData);
    } catch (e) {
      console.error("Failed to load policies:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showBanner = (msg, type = "success") => {
    setBanner({ msg, type });
    setTimeout(() => setBanner(null), 3500);
  };

  const handleAfterSave = async (msg, type = "success") => {
    showBanner(msg, type);
    if (type !== "error") await load();
  };

  const handleTrustModeSwitch = async (newVersionNumber, mode) => {
    setCurrentVersionNumber(newVersionNumber);
    showBanner(`Trust Mode set to ${mode.toUpperCase()} — Policy v${newVersionNumber} active`);
    await load();
  };

  const thresholdPolicy = policies.find(p => p.ruleType === "amount_threshold");
  const routingPolicy = policies.find(p => p.ruleType === "approver_routing");
  const blockedPolicy = policies.find(p => p.ruleType === "blocked_condition");

  return (
    <main className="p-8 max-w-6xl mx-auto">
      {/* Save Banner */}
      <AnimatePresence>
        {banner && <SaveBanner message={banner.msg} type={banner.type} />}
      </AnimatePresence>

      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="nb-panel p-6 mb-8 bg-panel"
      >
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">⚙️ Policies</h1>
            <p className="font-mono text-sm text-ink/60 mt-1">
              Business-defined rules that bound the agent's autonomy. Every change is versioned and audited.
            </p>
          </div>
          <div className="font-mono text-xs text-ink/50 nb-panel px-4 py-2 bg-paper">
            Active Policy Version: <strong className="text-ink text-sm">v{currentVersionNumber}</strong>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="nb-panel p-8 text-center font-mono text-sm text-ink/50 animate-pulse">
          Loading active policy configuration...
        </div>
      ) : (
        <>
          {/* ── Trust Mode ── */}
          <TrustModeSelector
            currentVersion={currentVersionNumber}
            onSwitch={handleTrustModeSwitch}
          />

          {/* ── Rule Editors ── */}
          <section className="mb-10">
            <SectionHeader>
              <Edit2 size={20} /> Rule Editors
            </SectionHeader>
            <div className="flex flex-col gap-5">
              <ThresholdEditor policy={thresholdPolicy} onSave={handleAfterSave} />
              <RoutingEditor policy={routingPolicy} onSave={handleAfterSave} />
              <BlockedConditionsEditor policy={blockedPolicy} onSave={handleAfterSave} />
            </div>
          </section>

          {/* ── Version History ── */}
          <section>
            <SectionHeader>
              <Clock size={20} /> Policy Version History
            </SectionHeader>
            <VersionHistory versions={versions} currentVersionNumber={currentVersionNumber} />
          </section>
        </>
      )}
    </main>
  );
}
