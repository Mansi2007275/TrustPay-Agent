// Core risk scoring. Combines rule-based signals with an LLM reasoning pass.
// IMPORTANT: this module only RECOMMENDS a score — it never executes payment.
import { getGroqReasoning } from "./groqClient.js";
import { db } from "../db/init.js";

/**
 * Dynamic evaluator for custom policy blocked conditions
 */
export function evaluateBlockedConditions(payment, vendorHistory, ruleConfig) {
  if (!ruleConfig || !ruleConfig.rules || !Array.isArray(ruleConfig.rules)) {
    return false;
  }

  const context = {
    amount: payment.amount,
    bankAccountChanged: vendorHistory.bankAccountChanged ? "true" : "false",
    newVendor: vendorHistory.totalTransactions === 0 ? "true" : "false",
    trustScore: vendorHistory.trustScore,
  };

  for (const rule of ruleConfig.rules) {
    if (!rule.conditions || !Array.isArray(rule.conditions)) continue;

    // Check if ALL conditions in this rule are met (AND-chain)
    const isMatched = rule.conditions.every(cond => {
      const actualVal = context[cond.field];
      if (actualVal === undefined) return false;

      const targetVal = cond.value;
      if (cond.operator === "equals") {
        return String(actualVal) === String(targetVal);
      }
      if (cond.operator === "greater_than") {
        return Number(actualVal) > Number(targetVal);
      }
      if (cond.operator === "less_than") {
        return Number(actualVal) < Number(targetVal);
      }
      return false;
    });

    if (isMatched) {
      return true; // Match triggers a block override
    }
  }

  return false;
}

/**
 * @param {object} payment { amount, vendor, invoiceNumber, timestamp }
 * @param {object} vendorHistory { avgAmount, trustScore, totalTransactions, bankAccountChanged }
 * @returns {object} { riskScore, confidenceScore, factors, reasoning, decision }
 */
export async function assessRisk(payment, vendorHistory) {
  // Fetch active policies
  let activePolicies = [];
  try {
    activePolicies = db.prepare("SELECT * FROM policies WHERE isActive = 1").all();
  } catch (e) {
    console.error("Failed to query active policies:", e.message);
  }

  const thresholdRule = activePolicies.find(p => p.ruleType === "amount_threshold");
  const thresholdConfig = thresholdRule ? JSON.parse(thresholdRule.config) : { autoExecuteLimit: 15000, blockLimit: 100000 };

  const blockedRule = activePolicies.find(p => p.ruleType === "blocked_condition");
  const blockedConfig = blockedRule ? JSON.parse(blockedRule.config) : { rules: [{ conditions: [{ field: "bankAccountChanged", operator: "equals", value: "true" }] }] };

  const isForceBlocked = evaluateBlockedConditions(payment, vendorHistory, blockedConfig);

  const factors = {
    amountAnomaly: scoreAmountAnomaly(payment.amount, vendorHistory.avgAmount),
    vendorTrust: 100 - vendorHistory.trustScore,
    frequencyAnomaly: 0,   // TODO: query recent tx count for this vendor
    timeAnomaly: scoreTimeAnomaly(payment.timestamp),
    invoiceAnomaly: 0,     // TODO: wire up invoice parser mismatch check
    bankAccountChanged: vendorHistory.bankAccountChanged ? 40 : 0,
  };

  const ruleScore = weightedFactorScore(factors);

  // LLM adds plain-English reasoning + can nudge the score based on context
  // rule-based logic can't easily capture (e.g. narrative anomalies).
  const llmResult = await getGroqReasoning(payment, vendorHistory, factors);

  let riskScore = Math.min(100, Math.round((ruleScore + llmResult.suggestedScore) / 2));

  // Hard override: a changed bank account is a critical fraud signal
  // (classic payment-diversion / BEC pattern) — never let a trusted vendor's
  // otherwise-clean history average this risk away.
  if (vendorHistory.bankAccountChanged) {
    riskScore = Math.max(riskScore, 65);
  }

  let decision = decideAction(riskScore, llmResult.confidence);
  let policyAppliedExplanation = "";

  if (isForceBlocked) {
    decision = "BLOCKED";
    policyAppliedExplanation = "Blocked due to active policy override condition match.";
  } else if (payment.amount > thresholdConfig.blockLimit) {
    decision = "BLOCKED";
    policyAppliedExplanation = `Blocked due to amount exceeding active policy limit of ₹${thresholdConfig.blockLimit.toLocaleString("en-IN")}.`;
  } else if (decision === "AUTO_EXECUTE" && payment.amount >= thresholdConfig.autoExecuteLimit) {
    decision = "HUMAN_APPROVAL";
    policyAppliedExplanation = `Escalated to human review due to amount exceeding active policy auto-execute limit of ₹${thresholdConfig.autoExecuteLimit.toLocaleString("en-IN")}.`;
  }

  return {
    riskScore,
    confidenceScore: llmResult.confidence,
    factors,
    reasoning: policyAppliedExplanation ? `${policyAppliedExplanation} ${llmResult.explanation}` : llmResult.explanation,
    decision, // AUTO_EXECUTE | HUMAN_APPROVAL | BLOCKED
  };
}

// Strongest fraud signals (amount size, vendor trust, bank account changes)
// carry more weight than softer ones (time of day) — a flat average let big
// red flags get diluted by zeroed-out minor factors.
export const FACTOR_WEIGHTS = {
  amountAnomaly: 0.30,
  vendorTrust: 0.20,
  frequencyAnomaly: 0.10,
  timeAnomaly: 0.10,
  invoiceAnomaly: 0.10,
  bankAccountChanged: 0.20,
};

export function weightedFactorScore(factors) {
  return Object.entries(factors).reduce(
    (sum, [key, val]) => sum + val * (FACTOR_WEIGHTS[key] ?? 0),
    0
  );
}

function scoreAmountAnomaly(amount, avgAmount) {
  // No history yet — score purely on absolute size, since we have nothing to
  // compare against. A large first-time payment is inherently risky.
  if (!avgAmount) {
    if (amount <= 15000) return 15;
    if (amount <= 50000) return 35;
    if (amount <= 150000) return 60;
    if (amount <= 400000) return 80;
    return 95;
  }

  const ratio = amount / avgAmount;
  if (ratio <= 1.5) return 5;
  if (ratio <= 3) return 25;
  if (ratio <= 6) return 55;
  return 85;
}

function scoreTimeAnomaly(timestamp) {
  const hour = new Date(timestamp).getHours();
  return hour >= 9 && hour <= 19 ? 0 : 20;
}

function decideAction(riskScore, confidence) {
  // Low confidence should push toward human review even if risk looks low.
  if (confidence < 50) return "HUMAN_APPROVAL";
  if (riskScore <= 25) return "AUTO_EXECUTE";
  if (riskScore <= 80) return "HUMAN_APPROVAL";
  return "BLOCKED";
}
