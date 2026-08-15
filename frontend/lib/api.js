// Thin fetch wrapper for talking to the backend.
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function getTransactions() {
  const res = await fetch(`${BASE}/transactions`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

export async function submitTransaction(payload) {
  const res = await fetch(`${BASE}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to submit transaction");
  return res.json();
}

export async function resolveTransaction(id, action) {
  const res = await fetch(`${BASE}/transactions/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error("Failed to resolve transaction");
  return res.json();
}

export async function runSimulation(scenario) {
  const res = await fetch(`${BASE}/simulate/${scenario}`, { method: "POST" });
  if (!res.ok) throw new Error("Simulation failed");
  return res.json();
}

export async function getAuditLog(transactionId) {
  const url = transactionId ? `${BASE}/audit/${transactionId}` : `${BASE}/audit`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch audit log");
  return res.json();
}

export async function getTransactionReasoning(id) {
  const res = await fetch(`${BASE}/transactions/${id}/reasoning`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch reasoning");
  return res.json();
}

export async function getTransactionScores() {
  const res = await fetch(`${BASE}/transactions/scores`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch scores");
  return res.json();
}

export async function askAgent(question) {
  const res = await fetch(`${BASE}/agent/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error("Agent ask failed");
  return res.json();
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export async function uploadInvoice(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/invoices/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Upload failed");
  }
  return res.json();
}

export async function getInvoices() {
  const res = await fetch(`${BASE}/invoices`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch invoices");
  return res.json();
}

export async function updateInvoice(id, fields) {
  const res = await fetch(`${BASE}/invoices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error("Failed to update invoice");
  return res.json();
}

export async function matchInvoice(id, transactionId) {
  const body = transactionId ? { transactionId } : { autoMatch: true };
  const res = await fetch(`${BASE}/invoices/${id}/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Match failed" }));
    throw new Error(err.error || "Match failed");
  }
  return res.json();
}

export async function overrideDuplicate(id) {
  const res = await fetch(`${BASE}/invoices/${id}/override-duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Override failed");
  return res.json();
}

// ─── Fraud Center ────────────────────────────────────────────────────────────
export async function triggerAttackMode() {
  const res = await fetch(`${BASE}/fraud-center/attack-mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to trigger Attack Mode");
  return res.json();
}

export async function clearSimulation() {
  const res = await fetch(`${BASE}/fraud-center/clear-simulation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to clear simulation");
  return res.json();
}

export async function getFraudAlerts(type = "") {
  const url = type ? `${BASE}/fraud-center/alerts?type=${type}` : `${BASE}/fraud-center/alerts`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch fraud alerts");
  return res.json();
}

export async function getVendorGraph() {
  const res = await fetch(`${BASE}/fraud-center/vendor-graph`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch vendor relationship graph");
  return res.json();
}

// ─── Policies ─────────────────────────────────────────────────────────────────
export async function getPolicies() {
  const res = await fetch(`${BASE}/policies`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch policies");
  return res.json();
}

export async function createPolicy(payload) {
  const res = await fetch(`${BASE}/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Create failed" }));
    throw new Error(err.error || "Create failed");
  }
  return res.json();
}

export async function updatePolicy(id, payload) {
  const res = await fetch(`${BASE}/policies/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Update failed" }));
    throw new Error(err.error || "Update failed");
  }
  return res.json();
}

export async function deletePolicy(id) {
  const res = await fetch(`${BASE}/policies/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
}

export async function getPolicyVersions() {
  const res = await fetch(`${BASE}/policies/versions`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch policy versions");
  return res.json();
}

export async function getPolicyVersionDetails(id) {
  const res = await fetch(`${BASE}/policies/versions/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch version details");
  return res.json();
}

export async function switchTrustMode(mode) {
  const res = await fetch(`${BASE}/policies/trust-mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Trust mode switch failed" }));
    throw new Error(err.error || "Trust mode switch failed");
  }
  return res.json();
}

// ─── Agent Control ─────────────────────────────────────────────────────────────
export async function getAgentStatus() {
  const res = await fetch(`${BASE}/agent-control/status`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch agent status");
  return res.json();
}

export async function getSpendingLimits() {
  const res = await fetch(`${BASE}/agent-control/limits`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch spending limits");
  return res.json();
}

export async function updateSpendingLimits(perTransactionLimit, dailyLimit) {
  const res = await fetch(`${BASE}/agent-control/limits`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ perTransactionLimit, dailyLimit }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Update failed" }));
    throw new Error(err.error || "Update failed");
  }
  return res.json();
}

export async function triggerEmergencyStop(reason) {
  const res = await fetch(`${BASE}/agent-control/emergency-stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error("Emergency stop failed");
  return res.json();
}

export async function resumeAgent() {
  const res = await fetch(`${BASE}/agent-control/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Resume failed");
  return res.json();
}

export async function getAgentHealth() {
  const res = await fetch(`${BASE}/agent-control/health`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch agent health");
  return res.json();
}

// ─── Analytics ─────────────────────────────────────────────────────────────────
export async function getRiskDistribution(window = "7d") {
  const res = await fetch(`${BASE}/analytics/risk-distribution?window=${window}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch risk distribution");
  return res.json();
}

export async function getDecisionTrend(window = "7d") {
  const res = await fetch(`${BASE}/analytics/decision-trend?window=${window}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch decision trend");
  return res.json();
}

export async function getTopFlaggedVendors() {
  const res = await fetch(`${BASE}/analytics/top-flagged-vendors`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch top flagged vendors");
  return res.json();
}
