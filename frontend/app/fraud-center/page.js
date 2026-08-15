"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, TrendingUp, Info, ShieldAlert, Network,
  RefreshCw, Play, X, ChevronDown, ChevronUp, Trash2,
  HelpCircle, Activity, CheckCircle2, ShieldX
} from "lucide-react";
import {
  triggerAttackMode,
  clearSimulation,
  getFraudAlerts,
  getVendorGraph
} from "../../lib/api";
import RiskBadge from "../../components/shared/RiskBadge";
import DecisionBadge from "../../components/shared/DecisionBadge";

// ─── Force-Directed Layout Algorithm (Fruchterman-Reingold) ────────────────────
function computeForceLayout(nodes, edges, width = 600, height = 350) {
  if (!nodes || nodes.length === 0) return [];

  // 1. Initialize positions in a circle to prevent overlaps initially
  const layoutNodes = nodes.map((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    const radius = Math.min(width, height) * 0.35;
    return {
      ...node,
      x: width / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 10,
      y: height / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 10,
      vx: 0,
      vy: 0
    };
  });

  const nodeMap = {};
  layoutNodes.forEach(node => {
    nodeMap[node.id] = node;
  });

  const iterations = 180;
  // Area scaling constant
  const k = Math.sqrt((width * height) / (layoutNodes.length || 1)) * 0.75;

  for (let step = 0; step < iterations; step++) {
    // A. Repulsive force between all node pairs
    for (let i = 0; i < layoutNodes.length; i++) {
      const u = layoutNodes[i];
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const v = layoutNodes[j];
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const dist = Math.hypot(dx, dy) || 1;
        // Stronger repulsion for flagged nodes to separate them visually
        const repForce = (k * k) / dist;
        const fx = (dx / dist) * repForce * 0.15;
        const fy = (dy / dist) * repForce * 0.15;
        u.vx += fx;
        u.vy += fy;
        v.vx -= fx;
        v.vy -= fy;
      }
    }

    // B. Attractive force along edges (pulls connected nodes together)
    edges.forEach(edge => {
      const source = nodeMap[edge.source];
      const target = nodeMap[edge.target];
      if (!source || !target) return;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy) || 1;
      const attForce = (dist * dist) / k;
      const fx = (dx / dist) * attForce * 0.08;
      const fy = (dy / dist) * attForce * 0.08;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });

    // C. Gravity pulling nodes towards center
    const cx = width / 2;
    const cy = height / 2;
    layoutNodes.forEach(node => {
      const dx = cx - node.x;
      const dy = cy - node.y;
      const dist = Math.hypot(dx, dy) || 1;
      node.vx += dx * 0.015;
      node.vy += dy * 0.015;
    });

    // D. Update positions and apply friction
    layoutNodes.forEach(node => {
      const speed = Math.hypot(node.vx, node.vy);
      const maxSpeed = 12;
      if (speed > maxSpeed) {
        node.vx = (node.vx / speed) * maxSpeed;
        node.vy = (node.vy / speed) * maxSpeed;
      }
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= 0.8;
      node.vy *= 0.8;

      // Restrict positions to canvas boundaries
      const padding = 25;
      node.x = Math.max(padding, Math.min(width - padding, node.x));
      node.y = Math.max(padding, Math.min(height - padding, node.y));
    });
  }

  return layoutNodes;
}

// ─── Default Canned Scenarios Data (UI Representation) ────────────────────────
const SCENARIO_PREVIEWS = [
  {
    id: "structuring",
    name: "Structuring Pattern",
    description: "Submit 4 payments in rapid succession to the same new vendor, each priced just below the ₹15k auto-approval threshold.",
    impact: "Inline risk engine bypass, caught by dynamic structuring rules.",
    expectedBehavior: "All 4 individual transactions will AUTO-EXECUTE (risk engines assess them independently). A post-run fraud alert will flag the vendor for suspicious structuring."
  },
  {
    id: "payment_diversion",
    name: "Payment Diversion (BEC)",
    description: "An invoice is submitted for an established, trusted security vendor, but contains a modified bank account number.",
    impact: "High risk override, forced human approval or direct block.",
    expectedBehavior: "Inline risk checks identify that the vendor's bank account doesn't match past history. The transaction is instantly escalated to PENDING_APPROVAL / BLOCKED."
  },
  {
    id: "shell_collusion",
    name: "Shell Vendor Collusion",
    description: "Two new consultation firms with different business names submit payments linking to the exact same bank account.",
    impact: "Collusion linkage, highlighted in relationships graph.",
    expectedBehavior: "Transactions process normally, but the Vendor Relationship Graph will instantly bridge the two companies with a red highlighted connection."
  },
  {
    id: "velocity_spike",
    name: "Velocity / Amount Spike",
    description: "An office supplier vendor with a ₹2,000 transaction average suddenly receives a payment request of ₹180,000.",
    impact: "Inline rule blocking due to extreme amount ratio anomaly.",
    expectedBehavior: "Inline checks determine the payment is 90x the vendor's historic transaction average. The risk engine spikes to CRITICAL and blocks the transaction."
  }
];

export default function FraudCenterPage() {
  const [activeTab, setActiveTab] = useState("attack");
  const [isAttacking, setIsAttacking] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [runningScenarios, setRunningScenarios] = useState([]);
  
  // Alerts State
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [expandedAlertId, setExpandedAlertId] = useState(null);

  // Graph State
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [graphLoading, setGraphLoading] = useState(true);
  const [positions, setPositions] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  // ─── Fetch Data Helpers ──────────────────────────────────────────────────────
  const loadAlerts = useCallback(async () => {
    try {
      setAlertsLoading(true);
      const data = await getFraudAlerts();
      setAlerts(data);
    } catch (e) {
      console.error("Failed to load fraud alerts:", e);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const loadGraph = useCallback(async () => {
    try {
      setGraphLoading(true);
      const data = await getVendorGraph();
      setGraphData(data);
      const layout = computeForceLayout(data.nodes, data.edges, 600, 350);
      setPositions(layout);
    } catch (e) {
      console.error("Failed to load vendor graph:", e);
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    loadGraph();
  }, [loadAlerts, loadGraph]);

  // ─── Event Handlers ─────────────────────────────────────────────────────────
  const handleAttack = async () => {
    if (isAttacking) return;
    setIsAttacking(true);
    setRunningScenarios([]);
    setSelectedNode(null);
    setSelectedEdge(null);

    try {
      const res = await triggerAttackMode();
      const scenarios = res.scenarios;

      // Step-by-step staggering of processing animations (~1s intervals)
      // Scenario 0 starts processing
      setRunningScenarios([{ ...scenarios[0], status: "PROCESSING" }]);

      setTimeout(() => {
        // Scenario 0 resolves, Scenario 1 starts processing
        setRunningScenarios([
          { ...scenarios[0], status: "RESOLVED" },
          { ...scenarios[1], status: "PROCESSING" }
        ]);
      }, 1000);

      setTimeout(() => {
        // Scenario 1 resolves, Scenario 2 starts processing
        setRunningScenarios([
          { ...scenarios[0], status: "RESOLVED" },
          { ...scenarios[1], status: "RESOLVED" },
          { ...scenarios[2], status: "PROCESSING" }
        ]);
      }, 2000);

      setTimeout(() => {
        // Scenario 2 resolves, Scenario 3 starts processing
        setRunningScenarios([
          { ...scenarios[0], status: "RESOLVED" },
          { ...scenarios[1], status: "RESOLVED" },
          { ...scenarios[2], status: "RESOLVED" },
          { ...scenarios[3], status: "PROCESSING" }
        ]);
      }, 3000);

      setTimeout(() => {
        // Scenario 3 resolves
        setRunningScenarios([
          { ...scenarios[0], status: "RESOLVED" },
          { ...scenarios[1], status: "RESOLVED" },
          { ...scenarios[2], status: "RESOLVED" },
          { ...scenarios[3], status: "RESOLVED" }
        ]);
        setIsAttacking(false);
        // Automatically refetch DB elements post-attack to reflect updates
        loadAlerts();
        loadGraph();
      }, 4000);

    } catch (e) {
      console.error(e);
      alert("Attack simulation failed: " + e.message);
      setIsAttacking(false);
    }
  };

  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const handleClear = async () => {
    if (isClearing) return;
    if (!showConfirmReset) {
      setShowConfirmReset(true);
      setTimeout(() => setShowConfirmReset(false), 4000);
      return;
    }
    setShowConfirmReset(false);
    setIsClearing(true);
    try {
      await clearSimulation();
      setRunningScenarios([]);
      setSelectedNode(null);
      setSelectedEdge(null);
      await Promise.all([loadAlerts(), loadGraph()]);
    } catch (e) {
      console.error(e);
      alert("Clear simulation failed: " + e.message);
    } finally {
      setIsClearing(false);
    }
  };

  // Helper to resolve scenario decision badge
  const getScenarioOutcomeBadge = (scenario) => {
    if (!scenario.transactions || scenario.transactions.length === 0) return null;
    
    // Check if inline caught the threat
    const decisions = scenario.transactions.map(t => t.decision);
    if (decisions.includes("BLOCKED")) {
      return <span className="px-2 py-0.5 border-2 border-ink bg-danger text-xs font-mono font-bold">🛡️ BLOCKED (CAUGHT)</span>;
    }
    if (decisions.includes("HUMAN_APPROVAL")) {
      return <span className="px-2 py-0.5 border-2 border-ink bg-warn text-xs font-mono font-bold">⚠️ ESCALATED (CAUGHT)</span>;
    }
    return <span className="px-2 py-0.5 border-2 border-ink bg-safe text-xs font-mono font-bold">🟢 AUTO EXECUTED</span>;
  };

  return (
    <main className="p-8 max-w-6xl mx-auto">
      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="nb-panel p-6 mb-8 bg-panel"
      >
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">🛡️ Fraud Center</h1>
            <p className="font-mono text-sm text-ink/60 mt-1">
              Dynamic detection systems, simulated scenario injections, and vendor collusion maps.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAttack}
              disabled={isAttacking || isClearing}
              className={`nb-btn bg-danger px-4 py-2 font-display font-bold text-sm text-white flex items-center gap-2 ${
                isAttacking ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <Play size={15} fill="white" />
              {isAttacking ? "Attacking..." : "🚨 Launch Attack Mode"}
            </button>
            <button
              onClick={handleClear}
              disabled={isAttacking || isClearing}
              className={`nb-btn px-4 py-2 font-mono text-sm flex items-center gap-2 transition-all ${
                showConfirmReset ? "bg-danger text-white border-danger" : "bg-panel hover:bg-paper"
              }`}
            >
              <RefreshCw size={14} className={isClearing ? "animate-spin" : ""} />
              {showConfirmReset ? "Confirm Reset?" : "Reset Demo"}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Tabbed Navigation ── */}
      <div className="flex border-b-[3px] border-ink mb-6 overflow-x-auto">
        {[
          { id: "attack", label: "🚨 Attack Simulator" },
          { id: "structuring", label: `⚠️ Structuring Alerts (${alerts.length})` },
          { id: "graph", label: "🕸️ Relationship Graph" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 font-display font-bold text-sm border-t-[3px] border-l-[3px] border-r-[3px] border-ink mr-2 transition-all relative ${
              activeTab === tab.id
                ? "bg-accent border-b-transparent translate-y-[3px] z-10"
                : "bg-panel hover:bg-paper border-b-ink translate-y-0"
            }`}
            style={{ top: "-3px" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Contents ── */}
      <AnimatePresence mode="wait">
        {activeTab === "attack" && (
          <motion.div
            key="attack"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-6"
          >
            {/* Info panel */}
            <div className="nb-panel p-4 bg-accent/15 border-accent flex gap-3 items-start">
              <Info size={20} className="text-warn mt-0.5 shrink-0" />
              <div className="text-xs font-mono leading-relaxed text-ink/80">
                <strong>How to test:</strong> Attack Mode runs 4 advanced fraud attacks through the real risk assessment pipeline simultaneously. 
                Individual payments bypass inline filters if priced under thresholds, but trigger subsequent structuring/collusion flags. 
                Reset the simulation at any time to re-run.
              </div>
            </div>

            {/* Scenarios Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {SCENARIO_PREVIEWS.map((preview, i) => {
                const runStatus = runningScenarios.find(s => s.id === preview.id);
                
                return (
                  <motion.div
                    key={preview.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="nb-panel p-5 bg-panel flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <h3 className="font-display font-bold text-lg leading-tight">{preview.name}</h3>
                        {!runStatus && (
                          <span className="px-2 py-0.5 border-2 border-ink bg-paper font-mono text-[10px] text-ink/50 font-bold">
                            READY
                          </span>
                        )}
                        {runStatus && runStatus.status === "PROCESSING" && (
                          <span className="px-2 py-0.5 border-2 border-ink bg-warn font-mono text-[10px] font-bold animate-pulse">
                            🧠 PROCESSING...
                          </span>
                        )}
                        {runStatus && runStatus.status === "RESOLVED" && (
                          getScenarioOutcomeBadge(runStatus)
                        )}
                      </div>
                      <p className="font-mono text-xs text-ink/70 mb-4">{preview.description}</p>
                    </div>

                    <div className="border-t-[2px] border-ink/10 pt-3">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink/50 mb-2">
                        <Activity size={12} />
                        <span>Expected Engine Outcome:</span>
                      </div>
                      <div className="bg-paper p-2.5 border-[2px] border-ink font-mono text-[11px] leading-relaxed">
                        {preview.expectedBehavior}
                      </div>

                      {/* Display live transaction outputs if resolved */}
                      {runStatus && runStatus.status === "RESOLVED" && runStatus.transactions && (
                        <div className="mt-3 flex flex-col gap-2">
                          <p className="font-mono text-[10px] font-bold text-ink/40">TRANSACTION FEEDBACK:</p>
                          {runStatus.transactions.map((tx, idx) => (
                            <div key={tx.id} className="flex justify-between items-center text-xs font-mono bg-paper/50 p-2 border border-ink/20">
                              <span>
                                tx {idx+1}: <strong>₹{tx.amount.toLocaleString("en-IN")}</strong>
                              </span>
                              <div className="flex gap-2">
                                <RiskBadge score={tx.risk_score} />
                                <DecisionBadge decision={tx.decision} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === "structuring" && (
          <motion.div
            key="structuring"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-4"
          >
            {alertsLoading ? (
              <div className="nb-panel p-8 text-center font-mono text-sm text-ink/50 animate-pulse">
                Analyzing recent transactions for structuring attempts...
              </div>
            ) : alerts.length === 0 ? (
              <div className="nb-panel p-8 text-center bg-panel flex flex-col items-center justify-center py-16">
                <CheckCircle2 size={48} className="text-safe mb-3" />
                <h3 className="font-display font-bold text-lg mb-1">No Structuring Alerts Found</h3>
                <p className="font-mono text-xs text-ink/50 max-w-sm">
                  The risk engine has not detected any multi-transaction splitting attempts in the last 72 hours.
                </p>
                <button
                  onClick={() => setActiveTab("attack")}
                  className="nb-btn bg-accent px-4 py-2 mt-5 font-display font-bold text-xs"
                >
                  Trigger Simulator
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {alerts.map((alertItem) => {
                  const isExpanded = expandedAlertId === alertItem.id;
                  
                  return (
                    <div
                      key={alertItem.id}
                      className="nb-panel p-5 bg-panel border-l-[8px] border-l-danger relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="bg-danger text-white border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold">
                              🚨 STRUCTURING ATTEMPT
                            </span>
                            <span className="font-mono text-[10px] text-ink/40">
                              Detected: {new Date(alertItem.detectedAt).toLocaleString()}
                            </span>
                          </div>
                          <h3 className="font-display font-bold text-xl">{alertItem.vendorName}</h3>
                          <p className="font-mono text-xs text-ink/70 mt-1">
                            ⚠️ This looks like structuring: {alertItem.transactions?.length || 3} separate payments were submitted, each individually under the auto-approval threshold.
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs text-ink/50">COMBINED VALUE</p>
                          <p className="font-display font-bold text-2xl text-danger">
                            ₹{alertItem.totalAmount.toLocaleString("en-IN")}
                          </p>
                          <button
                            onClick={() => setExpandedAlertId(isExpanded ? null : alertItem.id)}
                            className="mt-2 text-xs font-mono text-ink/50 hover:text-ink flex items-center gap-1 ml-auto"
                          >
                            {isExpanded ? (
                              <>Hide splits <ChevronUp size={14} /></>
                            ) : (
                              <>Show splits ({alertItem.transactions?.length || 0}) <ChevronDown size={14} /></>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expandable transaction table */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mt-4 pt-4 border-t-[2px] border-ink/10"
                          >
                            <p className="font-mono text-[10px] font-bold text-ink/40 mb-2">SPLIT TRANSACTIONS HISTORY:</p>
                            <div className="border-[3px] border-ink overflow-x-auto">
                              <table className="w-full font-mono text-xs text-left bg-paper">
                                <thead>
                                  <tr className="border-b-[3px] border-ink bg-accent/20">
                                    <th className="p-2 border-r-[3px] border-ink">Invoice</th>
                                    <th className="p-2 border-r-[3px] border-ink">Amount</th>
                                    <th className="p-2 border-r-[3px] border-ink">Decision</th>
                                    <th className="p-2">Date Submitted</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {alertItem.transactions?.map((tx) => (
                                    <tr key={tx.id} className="border-b border-ink/20 last:border-b-0 hover:bg-paper/40">
                                      <td className="p-2 border-r-[3px] border-ink font-bold">{tx.invoice_number}</td>
                                      <td className="p-2 border-r-[3px] border-ink font-bold">₹{tx.amount.toLocaleString("en-IN")}</td>
                                      <td className="p-2 border-r-[3px] border-ink">
                                        <DecisionBadge decision={tx.decision} />
                                      </td>
                                      <td className="p-2 text-ink/60">{new Date(tx.created_at).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "graph" && (
          <motion.div
            key="graph"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-6"
          >
            {graphLoading ? (
              <div className="nb-panel p-8 text-center font-mono text-sm text-ink/50 animate-pulse">
                Building relationship graph database mappings...
              </div>
            ) : graphData.nodes.length === 0 ? (
              <div className="nb-panel p-8 text-center bg-panel flex flex-col items-center justify-center py-16">
                <Network size={48} className="text-ink/40 mb-3" />
                <h3 className="font-display font-bold text-lg mb-1">No Vendors in Database</h3>
                <p className="font-mono text-xs text-ink/50 max-w-sm">
                  Create vendors or run Attack Simulator scenarios to map company accounts.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* SVG Graph Area */}
                <div className="lg:col-span-2 nb-panel p-4 bg-panel flex flex-col relative overflow-hidden" style={{ minHeight: 400 }}>
                  <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
                    <h3 className="font-display font-bold text-sm">Vendor Relationship Map</h3>
                    <p className="font-mono text-[10px] text-ink/40">Each circle is a vendor. Connectors indicate shared bank accounts.</p>
                  </div>
                  
                  {/* Legend */}
                  <div className="absolute bottom-3 left-3 z-10 flex gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 font-mono text-[9px]">
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-ink bg-white" />
                      <span>Normal Vendor</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[9px]">
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-ink bg-danger" />
                      <span>Collusion Suspect</span>
                    </div>
                  </div>

                  <div className="flex-1 flex items-center justify-center">
                    <svg
                      viewBox="0 0 600 350"
                      className="w-full h-auto"
                      style={{ maxHeight: 350 }}
                    >
                      {/* 1. Draw Edges */}
                      {graphData.edges.map((edge) => {
                        const src = positions.find(n => n.id === edge.source);
                        const tgt = positions.find(n => n.id === edge.target);
                        if (!src || !tgt) return null;

                        const isSelected = selectedEdge?.id === edge.id;
                        
                        return (
                          <line
                            key={edge.id}
                            x1={src.x}
                            y1={src.y}
                            x2={tgt.x}
                            y2={tgt.y}
                            stroke={isSelected ? "#ff5c5c" : "#0a0a0a"}
                            strokeWidth={isSelected ? 4 : 2}
                            strokeDasharray={isSelected ? "0" : "4 4"}
                            className="cursor-pointer transition-all hover:stroke-danger"
                            onClick={() => {
                              setSelectedEdge(edge);
                              setSelectedNode(null);
                            }}
                          />
                        );
                      })}

                      {/* 2. Draw Nodes */}
                      {positions.map((node) => {
                        const isSelected = selectedNode?.id === node.id;
                        const isHovered = hoveredNode?.id === node.id;
                        const r = node.isFlagged ? 16 : 11;
                        
                        return (
                          <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedNode(node);
                              setSelectedEdge(null);
                            }}
                            onMouseEnter={() => setHoveredNode(node)}
                            onMouseLeave={() => setHoveredNode(null)}
                          >
                            <circle
                              r={r}
                              fill={node.isFlagged ? "#ff5c5c" : "#ffffff"}
                              stroke="#0a0a0a"
                              strokeWidth={isSelected || isHovered ? 4 : 2.5}
                              className="transition-all"
                            />
                            {/* Hover info tooltip */}
                            {isHovered && (
                              <g transform="translate(0, -22)">
                                <rect
                                  x="-50"
                                  y="-25"
                                  width="100"
                                  height="20"
                                  fill="#0a0a0a"
                                  rx="3"
                                />
                                <text
                                  fill="#ffffff"
                                  textAnchor="middle"
                                  y="-12"
                                  className="font-mono text-[9px] font-bold"
                                >
                                  ₹{node.totalAmount.toLocaleString("en-IN")} paid
                                </text>
                              </g>
                            )}
                            <text
                              y={r + 11}
                              textAnchor="middle"
                              className="font-mono font-bold text-[9px] select-none"
                              style={{
                                fill: node.isFlagged ? "#ff5c5c" : "#0a0a0a"
                              }}
                            >
                              {node.name.length > 15 ? `${node.name.substring(0, 12)}...` : node.name}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Sidebar Details Panel */}
                <div className="nb-panel p-5 bg-panel flex flex-col justify-between">
                  <div>
                    <h3 className="font-display font-bold text-lg border-b-[2px] border-ink/10 pb-2 mb-3">
                      Inspect Entity
                    </h3>

                    {/* Edge Details */}
                    {selectedEdge && (
                      <div className="flex flex-col gap-3">
                        <div className="bg-danger/10 p-3 border-2 border-danger font-mono text-xs flex gap-2">
                          <AlertTriangle className="text-danger shrink-0 mt-0.5" size={16} />
                          <div>
                            <strong>Shell Collusion Signal:</strong> Two distinct vendors share the identical bank account listed below.
                          </div>
                        </div>

                        <div className="font-mono text-xs mt-2 flex flex-col gap-1.5">
                          <p className="text-ink/40">COMPANY A:</p>
                          <p className="font-bold text-sm">{selectedEdge.sourceName}</p>
                          <p className="text-ink/40 mt-1">COMPANY B:</p>
                          <p className="font-bold text-sm">{selectedEdge.targetName}</p>
                          <p className="text-ink/40 mt-2">SHARED BANK ACCOUNT:</p>
                          <p className="font-bold bg-paper p-2 border border-ink/20 text-center font-mono">
                            {selectedEdge.bankAccount}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Node Details */}
                    {selectedNode && (
                      <div className="font-mono text-xs flex flex-col gap-2.5">
                        <div>
                          <p className="text-ink/40">VENDOR NAME:</p>
                          <p className="font-display font-bold text-base">{selectedNode.name}</p>
                        </div>
                        
                        {selectedNode.isFlagged && (
                          <div className="bg-danger border-[2.5px] border-ink p-2.5 text-white font-bold text-[11px] leading-tight shadow-hard-sm">
                            ⚠️ Suspected Shell Collusion (shares bank account details with other vendors)
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="bg-paper p-2 border border-ink/20">
                            <p className="text-[9px] text-ink/50">TRUST SCORE</p>
                            <p className="font-bold text-sm">{selectedNode.trustScore}/100</p>
                          </div>
                          <div className="bg-paper p-2 border border-ink/20">
                            <p className="text-[9px] text-ink/50">TRANS. COUNT</p>
                            <p className="font-bold text-sm">{selectedNode.txCount} txs</p>
                          </div>
                        </div>

                        <div className="bg-paper p-2 border border-ink/20">
                          <p className="text-[9px] text-ink/50">TOTAL AMOUNT PAID</p>
                          <p className="font-bold text-sm text-ink/80">
                            ₹{selectedNode.totalAmount.toLocaleString("en-IN")}
                          </p>
                        </div>

                        <div className="bg-paper p-2 border border-ink/20">
                          <p className="text-[9px] text-ink/50">REGISTERED BANK ACCOUNT</p>
                          <p className="font-bold text-xs">{selectedNode.bankAccount || "N/A"}</p>
                        </div>
                      </div>
                    )}

                    {/* Empty State */}
                    {!selectedNode && !selectedEdge && (
                      <div className="text-center font-mono text-xs text-ink/40 py-16 flex flex-col items-center">
                        <HelpCircle size={24} className="mb-2 text-ink/30" />
                        Select a vendor circle or edge line in the map to run fraud audit inspections.
                      </div>
                    )}
                  </div>

                  {(selectedNode || selectedEdge) && (
                    <button
                      onClick={() => {
                        setSelectedNode(null);
                        setSelectedEdge(null);
                      }}
                      className="nb-btn bg-paper px-3 py-1.5 font-mono text-[10px] w-full mt-4 flex items-center justify-center gap-1"
                    >
                      <X size={12} /> Clear Selection
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
