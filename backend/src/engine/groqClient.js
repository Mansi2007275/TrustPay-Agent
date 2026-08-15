// Wraps the Groq SDK call for risk reasoning.
// Falls back to a local mock reasoning generator if no GROQ_API_KEY is set,
// so the whole pipeline runs end-to-end even before you add real keys.
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { weightedFactorScore } from "./riskEngine.js";
dotenv.config();

const hasKey = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "your_groq_api_key_here";
const groq = hasKey ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

export async function getGroqReasoning(payment, vendorHistory, factors) {
  if (!hasKey) return mockReasoning(payment, vendorHistory, factors);

  const prompt = `
You are a financial risk analyst for an AI payment agent. Analyze this transaction
and respond ONLY with valid JSON — no markdown, no preamble.

Transaction:
- Amount: ₹${payment.amount}
- Vendor: ${payment.vendor}
- Invoice: ${payment.invoiceNumber}
- Timestamp: ${payment.timestamp}

Vendor history:
- Average payment: ₹${vendorHistory.avgAmount || "unknown"}
- Trust score: ${vendorHistory.trustScore}/100
- Total prior transactions: ${vendorHistory.totalTransactions}
- Bank account recently changed: ${vendorHistory.bankAccountChanged}

Rule-based factor scores (0-100, higher = riskier):
${JSON.stringify(factors, null, 2)}

Respond with this exact JSON shape:
{
  "suggestedScore": <0-100 integer>,
  "confidence": <0-100 integer, how certain you are in this assessment>,
  "explanation": "<2-3 sentence plain-English reason a business owner would understand>"
}
`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });
    const raw = completion.choices[0].message.content.trim();
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq call failed, falling back to mock reasoning:", err.message);
    return mockReasoning(payment, vendorHistory, factors);
  }
}

// Deterministic local fallback — mirrors what the LLM would roughly say,
// so the demo works offline / without an API key.
function mockReasoning(payment, vendorHistory, factors) {
  const weightedScore = weightedFactorScore(factors);
  const reasons = [];

  if (factors.amountAnomaly > 40) reasons.push(`the amount is unusually high compared to this vendor's ₹${vendorHistory.avgAmount || 0} average`);
  if (factors.vendorTrust > 50) reasons.push("this vendor has a low trust score");
  if (factors.timeAnomaly > 0) reasons.push("the transaction is happening outside normal business hours");
  if (factors.bankAccountChanged > 0) reasons.push("the vendor's bank account details changed recently");
  if (vendorHistory.totalTransactions === 0) reasons.push("there is no prior transaction history with this vendor");

  const explanation = reasons.length
    ? `Flagged because ${reasons.join(", and ")}.`
    : "Transaction pattern matches this vendor's normal history and business hours.";

  return {
    suggestedScore: Math.round(weightedScore),
    confidence: vendorHistory.totalTransactions > 5 ? 85 : 55,
    explanation,
  };
}
