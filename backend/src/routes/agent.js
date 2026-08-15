// POST /api/agent/ask — natural language Q&A about past decisions
import { Router } from "express";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { db } from "../db/init.js";
dotenv.config();

const router = Router();

const hasKey = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "your_groq_api_key_here";
const groq = hasKey ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "question is required" });
    }

    // Pull transaction data from DB, join vendor name
    const allTransactions = db.prepare(`
      SELECT t.id, t.amount, t.risk_score, t.confidence_score, t.decision, t.status,
             t.invoice_number, t.created_at, t.reasoning,
             v.name as vendor, v.trust_score, v.total_transactions
      FROM transactions t
      LEFT JOIN vendors v ON t.vendor_id = v.id
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all();

    // Smart filtering: match vendor name, status keywords, or decision keywords
    const q = question.toLowerCase();
    let relevantTx = allTransactions;

    // Try vendor name match first
    const vendorNames = [...new Set(allTransactions.map(t => t.vendor).filter(Boolean))];
    const matchedVendor = vendorNames.find(name => q.includes(name.toLowerCase()));
    if (matchedVendor) {
      relevantTx = allTransactions.filter(t => t.vendor?.toLowerCase() === matchedVendor.toLowerCase());
    } else if (q.includes("block")) {
      relevantTx = allTransactions.filter(t => t.decision === "BLOCKED" || t.status === "REJECTED");
    } else if (q.includes("pend") || q.includes("approv") || q.includes("escalat")) {
      relevantTx = allTransactions.filter(t => t.status === "PENDING" || t.decision === "HUMAN_APPROVAL");
    } else if (q.includes("execut") || q.includes("auto") || q.includes("success")) {
      relevantTx = allTransactions.filter(t => t.status === "EXECUTED" && t.decision === "AUTO_EXECUTE");
    } else if (q.includes("high risk") || q.includes("risky")) {
      relevantTx = allTransactions.filter(t => (t.risk_score || 0) >= 60);
    } else if (q.includes("this week") || q.includes("recent") || q.includes("today")) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      relevantTx = allTransactions.filter(t => t.created_at >= cutoff);
    }

    // Cap context to 15 most relevant transactions
    relevantTx = relevantTx.slice(0, 15);

    if (hasKey) {
      const answer = await askGroq(question, relevantTx, allTransactions.length);
      return res.json({ answer, matchCount: relevantTx.length });
    }

    return res.json({ answer: buildMockAnswer(question, relevantTx, allTransactions), matchCount: relevantTx.length });

  } catch (err) {
    console.error("agent/ask error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Groq Q&A ─────────────────────────────────────────────────────────────────
async function askGroq(question, relevantTx, totalCount) {
  const context = relevantTx.map(t =>
    `- ${t.vendor}: ₹${Number(t.amount).toLocaleString("en-IN")}, risk ${t.risk_score}/100, decision: ${t.decision}, status: ${t.status}, date: ${t.created_at?.slice(0, 10)}`
  ).join("\n");

  const prompt = `
You are TrustPay, an AI financial agent assistant. Answer the user's question using ONLY the transaction data provided below.
Be concise (2-4 sentences max). If the answer is not in the data, say so clearly. Do not make up data.

Total transactions in system: ${totalCount}
Relevant transactions (${relevantTx.length}):
${context || "No matching transactions found."}

User question: ${question}
`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error("Groq ask failed, using mock:", err.message);
    return buildMockAnswer(question, relevantTx, []);
  }
}

// ─── Mock keyword-based fallback ──────────────────────────────────────────────
function buildMockAnswer(question, relevantTx, allTransactions) {
  const q = question.toLowerCase();

  if (relevantTx.length === 0) {
    return "I couldn't find any transactions matching your question. Try asking about a specific vendor name, or use keywords like 'blocked', 'pending', 'auto-executed', or 'high risk'.";
  }

  // Vendor-specific answer
  const vendorName = relevantTx[0]?.vendor;
  const allSameVendor = relevantTx.every(t => t.vendor === vendorName);
  if (allSameVendor && vendorName) {
    const total = relevantTx.length;
    const blocked = relevantTx.filter(t => t.decision === "BLOCKED").length;
    const executed = relevantTx.filter(t => t.status === "EXECUTED").length;
    const avgRisk = Math.round(relevantTx.reduce((s, t) => s + (t.risk_score || 0), 0) / total);
    const amounts = relevantTx.map(t => t.amount);
    const totalAmt = amounts.reduce((s, a) => s + a, 0);
    return `${vendorName} has ${total} transaction(s) on record. ${executed} were auto-executed, ${blocked} were blocked. Average risk score: ${avgRisk}/100. Total payments processed: ₹${Math.round(totalAmt).toLocaleString("en-IN")}.`;
  }

  // Generic summary for filtered results
  const total = relevantTx.length;
  const avgRisk = Math.round(relevantTx.reduce((s, t) => s + (t.risk_score || 0), 0) / total);
  const vendors = [...new Set(relevantTx.map(t => t.vendor))].slice(0, 3).join(", ");
  const totalAmt = relevantTx.reduce((s, t) => s + (t.amount || 0), 0);

  if (q.includes("block")) {
    return `Found ${total} blocked/rejected transaction(s). Vendors involved: ${vendors || "unknown"}. Average risk score: ${avgRisk}/100. Total amount that was blocked: ₹${Math.round(totalAmt).toLocaleString("en-IN")}.`;
  }
  if (q.includes("pend") || q.includes("approv")) {
    return `Found ${total} pending/escalated transaction(s) awaiting human approval. Vendors: ${vendors || "unknown"}. Average risk score: ${avgRisk}/100.`;
  }
  return `Found ${total} matching transaction(s). Vendors: ${vendors || "unknown"}. Average risk score: ${avgRisk}/100. Total amount: ₹${Math.round(totalAmt).toLocaleString("en-IN")}.`;
}

export default router;
