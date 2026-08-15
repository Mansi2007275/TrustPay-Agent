"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ZAxis,
} from "recharts";
import { getTransactions, getTransactionReasoning, getTransactionScores, askAgent } from "../../lib/api";
import RiskBadge from "../../components/shared/RiskBadge";
import DecisionBadge from "../../components/shared/DecisionBadge";

// ─── Scatter Tooltip ──────────────────────────────────────────────────────────
function ScatterTooltip({ active, payload, onClickTx }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="nb-panel p-3 text-xs font-mono cursor-pointer"
      style={{ minWidth: 180 }}
      onClick={() => onClickTx && onClickTx(d.id)}
    >
      <p className="font-display font-bold text-sm mb-1">{d.vendor}</p>
      <p>₹{Number(d.amount).toLocaleString("en-IN")}</p>
      <p>Risk: <strong>{d.risk_score}/100</strong></p>
      <p>Confidence: <strong>{d.confidence_score}%</strong></p>
      <DecisionBadge decision={d.decision} />
      <p className="mt-1 text-ink/40">Click to view reasoning</p>
    </div>
  );
}

// ─── Reasoning Panel ──────────────────────────────────────────────────────────
function ReasoningPanel({ txId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
    getTransactionReasoning(txId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [txId]);

  const panels = data ? [
    {
      icon: "🧠",
      title: "What I Know",
      items: data.whatIKnow || [],
      bg: "#d4f5d4",
      border: "#0a0a0a",
    },
    {
      icon: "⚠️",
      title: "What Concerns Me",
      items: data.whatConcernsMe?.length ? data.whatConcernsMe : ["No concerns flagged — transaction looks clean."],
      bg: "#fff8d6",
      border: "#0a0a0a",
    },
    {
      icon: data.myDecision?.toLowerCase().includes("block") || data.myDecision?.toLowerCase().includes("escalat") ? "🚫" : "✅",
      title: "My Decision",
      items: [data.myDecision || "No decision recorded."],
      bg: "#f0f0f0",
      border: "#0a0a0a",
      isSingle: true,
    },
  ] : [];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-3 border-t-[2px] border-ink/20">
        {loading && (
          <div className="flex items-center gap-2 font-mono text-sm text-ink/60 py-4">
            <span className="animate-pulse">🧠</span>
            <span>Agent is thinking...</span>
          </div>
        )}
        {error && (
          <p className="font-mono text-sm text-danger">Error: {error}</p>
        )}
        {data && (
          <div className="grid md:grid-cols-3 gap-3">
            {panels.map((panel, i) => (
              <motion.div
                key={panel.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="border-[3px] border-ink p-3"
                style={{ backgroundColor: panel.bg, boxShadow: "4px 4px 0px #0a0a0a" }}
              >
                <p className="font-display font-bold text-sm mb-2">
                  {panel.icon} {panel.title}
                </p>
                {panel.isSingle ? (
                  <p className="font-mono text-xs leading-relaxed">{panel.items[0]}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {panel.items.map((item, j) => (
                      <li key={j} className="font-mono text-xs flex gap-1.5">
                        <span className="text-ink/40 mt-0.5">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
function TxRow({ tx, index, expanded, onToggle }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="nb-panel p-4"
      id={`tx-${tx.id}`}
    >
      <button
        className="w-full text-left flex flex-col md:flex-row md:items-center justify-between gap-3"
        onClick={onToggle}
      >
        <div>
          <p className="font-display font-bold">{tx.vendor}</p>
          <p className="font-mono text-sm text-ink/60">
            ₹{Number(tx.amount).toLocaleString("en-IN")} · Invoice {tx.invoice_number}
          </p>
          <p className="font-mono text-xs text-ink/40">
            {new Date(tx.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RiskBadge score={tx.risk_score} />
          <DecisionBadge decision={tx.decision} />
          <span className="font-mono text-xs text-ink/50 ml-2">
            {expanded ? "▲ collapse" : "▼ view reasoning"}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && <ReasoningPanel txId={tx.id} />}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────
function ChatBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] px-4 py-2.5 border-[2.5px] border-ink font-mono text-sm leading-relaxed`}
        style={{
          backgroundColor: isUser ? "#ffde59" : "#ffffff",
          boxShadow: "3px 3px 0px #0a0a0a",
        }}
      >
        {!isUser && <span className="text-xs text-ink/50 block mb-1">🤖 TrustPay Agent</span>}
        {msg.content}
      </div>
    </motion.div>
  );
}

// ─── Scatter dot decision colors ──────────────────────────────────────────────
const DECISION_COLORS = {
  AUTO_EXECUTE: "#7ee787",
  HUMAN_APPROVAL: "#ffde59",
  BLOCKED: "#ff5c5c",
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AiDecisionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const [chatMessages, setChatMessages] = useState([
    { role: "agent", content: "Hi! Ask me anything about past payment decisions. Try: \"Why was the last payment blocked?\" or \"Which vendors have been flagged this week?\"" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const txListRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [txData, scoreData] = await Promise.all([
        getTransactions(),
        getTransactionScores(),
      ]);
      setTransactions(Array.isArray(txData) ? txData : []);
      setScores(Array.isArray(scoreData) ? scoreData : []);
    } catch (e) {
      console.error("Failed to load AI Decisions data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function handleToggle(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  function handleScatterClick(id) {
    setExpandedId(id);
    // Scroll to that transaction row
    setTimeout(() => {
      const el = document.getElementById(`tx-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  async function handleChatSubmit(e) {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: q }]);
    setChatLoading(true);
    try {
      const res = await askAgent(q);
      setChatMessages(prev => [...prev, { role: "agent", content: res.answer }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "agent", content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  // Split scores by decision for multi-series scatter
  const scatterSeries = Object.entries(DECISION_COLORS).map(([decision, color]) => ({
    decision,
    color,
    data: scores.filter(s => s.decision === decision).map(s => ({
      ...s,
      risk_score: s.risk_score || 0,
      confidence_score: s.confidence_score || 0,
    })),
  }));

  return (
    <main className="p-8 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="nb-panel p-6 mb-8"
      >
        <h1 className="text-3xl font-display font-bold">🧠 AI Decisions</h1>
        <p className="font-mono text-sm text-ink/60 mt-1">
          Per-transaction reasoning explorer — the agent's full conscience breakdown.
        </p>
        {!loading && (
          <p className="font-mono text-xs mt-2 text-ink/40">
            {transactions.length} transactions analysed · {scores.filter(s => s.decision === "AUTO_EXECUTE").length} auto-executed · {scores.filter(s => s.decision === "BLOCKED").length} blocked
          </p>
        )}
      </motion.div>

      {/* ── Section 1: Transaction Reasoning List ── */}
      <section className="mb-10" ref={txListRef}>
        <h2 className="font-display font-bold text-xl mb-4">📋 Transaction Reasoning</h2>

        {loading && (
          <div className="nb-panel p-6 font-mono text-sm text-ink/60 animate-pulse">
            Loading agent decisions...
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="nb-panel p-6 font-mono text-sm text-ink/60">
            No transactions yet. Head to <a href="/command-center" className="underline font-bold">Command Center</a> to submit a payment.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {transactions.map((tx, i) => (
            <TxRow
              key={tx.id}
              tx={tx}
              index={i}
              expanded={expandedId === tx.id}
              onToggle={() => handleToggle(tx.id)}
            />
          ))}
        </div>
      </section>

      {/* ── Section 2: Ask the Agent ── */}
      <section className="mb-10">
        <h2 className="font-display font-bold text-xl mb-4">💬 Ask the Agent</h2>
        <div className="nb-panel flex flex-col" style={{ height: 420 }}>
          {/* Chat history */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {chatMessages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} />
            ))}
            {chatLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="px-4 py-2.5 border-[2.5px] border-ink font-mono text-sm bg-white"
                  style={{ boxShadow: "3px 3px 0px #0a0a0a" }}>
                  <span className="text-xs text-ink/50 block mb-1">🤖 TrustPay Agent</span>
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleChatSubmit}
            className="border-t-[3px] border-ink p-4 flex gap-3"
          >
            <input
              className="flex-1 border-[3px] border-ink px-3 py-2 font-mono text-sm bg-paper focus:outline-none"
              placeholder="Ask about a vendor, decision, or risk pattern..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="nb-btn bg-accent px-5 py-2 font-display font-bold text-sm disabled:opacity-50"
            >
              Ask →
            </button>
          </form>
        </div>

        {/* Quick prompts */}
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            "Which payments were blocked?",
            "Show me high-risk transactions",
            "What's pending approval?",
            "Which vendors have been flagged?",
          ].map(prompt => (
            <button
              key={prompt}
              onClick={() => { setChatInput(prompt); }}
              className="nb-btn bg-paper px-3 py-1.5 font-mono text-xs"
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>

      {/* ── Section 3: Confidence vs Risk Scatter ── */}
      <section className="mb-10">
        <h2 className="font-display font-bold text-xl mb-1">📊 Confidence vs. Risk</h2>
        <p className="font-mono text-xs text-ink/50 mb-4">
          Each dot = one transaction. X = risk score, Y = agent confidence. Click a dot to see its reasoning.
        </p>

        {scores.length === 0 && !loading && (
          <div className="nb-panel p-6 font-mono text-sm text-ink/60">
            No score data yet. Submit some transactions first.
          </div>
        )}

        {scores.length > 0 && (
          <div className="nb-panel p-4">
            {/* Legend */}
            <div className="flex gap-4 mb-4 flex-wrap">
              {[
                { label: "Auto-Executed", color: "#7ee787" },
                { label: "Pending Approval", color: "#ffde59" },
                { label: "Blocked", color: "#ff5c5c" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 font-mono text-xs">
                  <div className="w-3 h-3 border-[2px] border-ink rounded-sm" style={{ backgroundColor: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#0a0a0a22" strokeDasharray="4 4" />
                <XAxis
                  dataKey="risk_score"
                  type="number"
                  domain={[0, 100]}
                  name="Risk Score"
                  label={{ value: "Risk Score →", position: "insideBottom", offset: -10, className: "font-mono text-xs" }}
                  tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}
                />
                <YAxis
                  dataKey="confidence_score"
                  type="number"
                  domain={[0, 100]}
                  name="Confidence"
                  label={{ value: "Confidence →", angle: -90, position: "insideLeft", offset: 10, className: "font-mono text-xs" }}
                  tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}
                />
                <ZAxis range={[80, 80]} />
                <Tooltip
                  content={<ScatterTooltip onClickTx={handleScatterClick} />}
                  cursor={{ strokeDasharray: "4 4", stroke: "#0a0a0a55" }}
                />
                {scatterSeries.map(({ decision, color, data }) => (
                  <Scatter
                    key={decision}
                    name={decision}
                    data={data}
                    fill={color}
                    stroke="#0a0a0a"
                    strokeWidth={2}
                    onClick={(d) => handleScatterClick(d.id)}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </main>
  );
}
