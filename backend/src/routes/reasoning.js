// GET /api/transactions/:id/reasoning
// GET /api/transactions/scores
import { Router } from "express";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { db } from "../db/init.js";
import { weightedFactorScore } from "../engine/riskEngine.js";
dotenv.config();

const router = Router();

const hasKey = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "your_groq_api_key_here";
const groq = hasKey ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// ─── GET /api/transactions/scores ────────────────────────────────────────────
// Returns lightweight score pairs for every transaction (feeds scatter plot).
// Must be registered BEFORE /:id to avoid "scores" being matched as an id.
router.get("/scores", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT t.id, t.amount, t.risk_score, t.confidence_score, t.decision, t.status, t.created_at,
             v.name as vendor
      FROM transactions t
      LEFT JOIN vendors v ON t.vendor_id = v.id
      WHERE t.simulation_batch_id IS NULL
      ORDER BY t.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error("scores error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/transactions/:id/reasoning ─────────────────────────────────────
router.get("/:id/reasoning", async (req, res) => {
  try {
    const tx = db.prepare(`
      SELECT t.*, v.name as vendor, v.trust_score, v.total_transactions, v.avg_amount, v.bank_account
      FROM transactions t
      LEFT JOIN vendors v ON t.vendor_id = v.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    // Parse the stored reasoning JSON blob
    let storedReasoning = {};
    try { storedReasoning = JSON.parse(tx.reasoning || "{}"); } catch {}

    const factors = storedReasoning.factors || {};
    const explanation = storedReasoning.reasoning || storedReasoning.explanation || "";

    if (hasKey) {
      // Ask Groq to produce structured breakdown
      const structured = await getGroqStructuredReasoning(tx, factors, explanation);
      return res.json(structured);
    }

    // Mock: build deterministically from stored data
    return res.json(buildMockReasoning(tx, factors, explanation));

  } catch (err) {
    console.error("reasoning error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Groq structured reasoning ───────────────────────────────────────────────
async function getGroqStructuredReasoning(tx, factors, explanation) {
  const prompt = `
You are TrustPay, an AI financial agent. Explain your decision on this transaction in exactly this JSON shape — no markdown, no extra text:
{
  "whatIKnow": ["<fact 1>", "<fact 2>", ...],
  "whatConcernsMe": ["<risk factor 1>", ...],
  "myDecision": "<one sentence summary of decision and why>"
}

Transaction:
- Vendor: ${tx.vendor}
- Amount: ₹${Number(tx.amount).toLocaleString("en-IN")}
- Invoice: ${tx.invoice_number}
- Vendor trust score: ${tx.trust_score}/100
- Prior transactions with vendor: ${tx.total_transactions}
- Vendor avg payment: ₹${Math.round(tx.avg_amount || 0).toLocaleString("en-IN")}
- Risk score: ${tx.risk_score}/100
- Confidence: ${tx.confidence_score}%
- Decision: ${tx.decision}
- Status: ${tx.status}
- Risk factors: ${JSON.stringify(factors)}
- Agent reasoning: ${explanation}

Rules for the JSON:
- whatIKnow: 3-5 plain-English facts about this vendor and transaction
- whatConcernsMe: list ONLY actual concerns (0 items if none)
- myDecision: exactly one sentence
`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const raw = completion.choices[0].message.content.trim();
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq reasoning failed, using mock:", err.message);
    return buildMockReasoning(tx, factors, explanation);
  }
}

// ─── Deterministic mock fallback ──────────────────────────────────────────────
function buildMockReasoning(tx, factors, explanation) {
  const whatIKnow = [
    `Vendor: ${tx.vendor}`,
    `Payment amount: ₹${Number(tx.amount).toLocaleString("en-IN")}`,
    `Vendor trust score: ${tx.trust_score ?? "unknown"}/100`,
    `Prior transactions with this vendor: ${tx.total_transactions ?? 0}`,
    tx.avg_amount > 0
      ? `Historical average payment: ₹${Math.round(tx.avg_amount).toLocaleString("en-IN")}`
      : "No prior transaction history with this vendor",
  ];

  const whatConcernsMe = [];
  if ((factors.amountAnomaly || 0) > 40) {
    const ratio = tx.avg_amount > 0 ? Math.round((tx.amount / tx.avg_amount) * 10) / 10 : null;
    whatConcernsMe.push(
      ratio
        ? `Amount is ${ratio}× this vendor's historical average (₹${Math.round(tx.avg_amount).toLocaleString("en-IN")})`
        : `Large first-time payment with no history to compare against`
    );
  }
  if ((factors.vendorTrust || 0) > 50) whatConcernsMe.push(`Low vendor trust score (${tx.trust_score}/100)`);
  if ((factors.bankAccountChanged || 0) > 0) whatConcernsMe.push("Vendor bank account details changed recently — classic payment-diversion signal");
  if ((factors.timeAnomaly || 0) > 0) whatConcernsMe.push("Transaction submitted outside normal business hours (9am–7pm)");
  if (tx.total_transactions === 0) whatConcernsMe.push("Brand-new vendor with zero prior transaction history");

  const decisionMap = {
    AUTO_EXECUTE: `Auto-executed — risk score ${tx.risk_score}/100 is within the safe threshold and all signals are green.`,
    HUMAN_APPROVAL: `Escalated to human approval — risk score ${tx.risk_score}/100 warrants review before payment is released.`,
    BLOCKED: `Blocked — risk score ${tx.risk_score}/100 exceeds the safe threshold; payment requires manual override to proceed.`,
  };

  return {
    whatIKnow,
    whatConcernsMe,
    myDecision: decisionMap[tx.decision] || explanation || `Decision: ${tx.decision}`,
  };
}

export default router;
