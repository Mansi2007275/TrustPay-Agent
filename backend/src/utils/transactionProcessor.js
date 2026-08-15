import { v4 as uuid } from "uuid";
import { db } from "../db/init.js";
import { assessRisk } from "../engine/riskEngine.js";
import { sendApprovalRequest } from "../bot/telegramBot.js";
import { logAuditEvent } from "./audit.js";
import { getOrCreateVendor, updateVendorAfterTransaction } from "./vendorHistory.js";

/**
 * Core transaction pipeline. Reused by transactions API and Fraud Center Attack Mode.
 * 
 * @param {object} params { amount, vendor, invoiceNumber, bankAccount, simulationBatchId }
 * @returns {promise<object>} The saved transaction object.
 */
export async function processTransaction({ amount, vendor, invoiceNumber, bankAccount, simulationBatchId = null }) {
  const id = uuid();
  const vendorHistory = getOrCreateVendor(vendor, bankAccount);

  // ── GATE 1: Emergency Stop — checked FIRST, before any risk logic ────────────
  let emergencyOverrideReason = null;
  try {
    const agentStatus = db.prepare("SELECT isEmergencyStopped FROM agent_status WHERE id = 'singleton'").get();
    if (agentStatus?.isEmergencyStopped) {
      emergencyOverrideReason = "🔴 Agent is in Emergency Stop mode — all autonomous execution is paused.";
    }
  } catch (e) {
    console.error("Emergency stop gate check failed:", e.message);
  }

  // ── GATE 2: Per-transaction spending limit ────────────────────────────────────
  let spendingOverrideReason = null;
  let spendingConfig = { perTransactionLimit: 50000, dailyLimit: 200000 };
  try {
    const limitRow = db.prepare("SELECT config FROM policies WHERE id = 'policy-spending-limits' AND isActive = 1").get();
    if (limitRow) spendingConfig = JSON.parse(limitRow.config);

    if (!emergencyOverrideReason && amount > spendingConfig.perTransactionLimit) {
      spendingOverrideReason = `Per-transaction limit reached — ₹${amount.toLocaleString("en-IN")} exceeds limit of ₹${spendingConfig.perTransactionLimit.toLocaleString("en-IN")}.`;
    }

    if (!emergencyOverrideReason && !spendingOverrideReason) {
      // GATE 3: Daily cumulative spending limit
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().replace("T", " ").substring(0, 19);
      const dailyUsedRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions
        WHERE status = 'EXECUTED' AND decision = 'AUTO_EXECUTE'
          AND simulation_batch_id IS NULL AND created_at >= ?
      `).get(todayStr);
      const dailyUsed = dailyUsedRow.total;
      if (dailyUsed + amount > spendingConfig.dailyLimit) {
        spendingOverrideReason = `Daily spending limit reached — ₹${dailyUsed.toLocaleString("en-IN")} of ₹${spendingConfig.dailyLimit.toLocaleString("en-IN")} used today.`;
      }
    }
  } catch (e) {
    console.error("Spending limit gate check failed:", e.message);
  }

  // ── Run risk assessment (LLM + rules) ────────────────────────────────────────
  const assessment = await assessRisk(
    { amount, vendor, invoiceNumber: invoiceNumber || "N/A", timestamp: new Date().toISOString() },
    vendorHistory
  );

  // Apply override gates — emergency stop and spending limits force PENDING even if risk says AUTO_EXECUTE
  const overrideReason = emergencyOverrideReason || spendingOverrideReason;
  if (overrideReason && assessment.decision === "AUTO_EXECUTE") {
    assessment.decision = "HUMAN_APPROVAL";
    assessment.reasoning = `${overrideReason} ${assessment.reasoning || ""}`.trim();
  }

  const finalStatus = assessment.decision === "AUTO_EXECUTE" ? "EXECUTED" : "PENDING";

  // Fetch the active policy version number
  const latestVersionRow = db.prepare("SELECT MAX(versionNumber) as maxVer FROM policy_versions").get();
  const activePolicyVersion = latestVersionRow ? latestVersionRow.maxVer : 1;

  db.prepare(`
    INSERT INTO transactions (id, vendor_id, amount, invoice_number, risk_score, confidence_score, decision, reasoning, status, resolved_at, simulation_batch_id, policy_version_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    vendorHistory.id,
    amount,
    invoiceNumber || "N/A",
    assessment.riskScore,
    assessment.confidenceScore,
    assessment.decision,
    JSON.stringify(assessment),
    finalStatus,
    finalStatus === "EXECUTED" ? new Date().toISOString() : null,
    simulationBatchId,
    activePolicyVersion
  );

  logAuditEvent(id, "risk_calculated", `Risk ${assessment.riskScore}/100, confidence ${assessment.confidenceScore}%, decision ${assessment.decision}`);

  if (emergencyOverrideReason) {
    logAuditEvent(id, "emergency_stop_gate", `Transaction gated by Emergency Stop — forced to HUMAN_APPROVAL`);
  } else if (spendingOverrideReason) {
    logAuditEvent(id, "spending_limit_gate", `Transaction gated by spending limit — forced to HUMAN_APPROVAL. ${spendingOverrideReason}`);
  }

  if (finalStatus === "EXECUTED") {
    updateVendorAfterTransaction(vendorHistory.id, amount, false);
    logAuditEvent(id, "auto_executed", "Payment auto-executed — risk within safe threshold");
  }

  if (assessment.decision === "HUMAN_APPROVAL") {
    // Resolve dynamic approver routing from policy
    let targetChatId = null;
    try {
      const activePolicies = db.prepare("SELECT * FROM policies WHERE isActive = 1").all();
      const routingRule = activePolicies.find(p => p.ruleType === "approver_routing");
      if (routingRule) {
        const routingConfig = JSON.parse(routingRule.config);
        if (routingConfig && Array.isArray(routingConfig.routes)) {
          const match = routingConfig.routes.find(r => amount >= (r.minAmount || 0) && amount <= (r.maxAmount || Infinity));
          if (match && match.chatId) targetChatId = match.chatId;
        }
      }
    } catch (e) {
      console.error("Routing resolution failed:", e.message);
    }

    await sendApprovalRequest(
      { id, amount, vendor, invoiceNumber, riskScore: assessment.riskScore, reasoning: assessment.reasoning },
      targetChatId
    );
    logAuditEvent(id, "telegram_sent", `Approval request sent to approver (Chat ID: ${targetChatId || "default"})`);
  }

  if (assessment.decision === "BLOCKED") {
    updateVendorAfterTransaction(vendorHistory.id, amount, true);
    logAuditEvent(id, "blocked", "Transaction blocked — risk exceeded safe threshold");
  }

  const saved = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
  return { ...saved, vendor };
}
