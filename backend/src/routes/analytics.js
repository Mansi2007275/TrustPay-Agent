/**
 * Analytics API — pure SQL aggregations over existing stored fields.
 * No LLM, no recomputation — read-only aggregate layer over transactions/vendors/fraud_alerts.
 */
import { Router } from "express";
import { db } from "../db/init.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns SQLite-compatible date cutoff string for a given window */
function windowCutoff(window) {
  const days = window === "90d" ? 90 : window === "30d" ? 30 : 7;
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString().replace("T", " ").substring(0, 19);
}

/** Returns the prior-window cutoff (for trend comparison) */
function priorWindowCutoff(window) {
  const days = window === "90d" ? 90 : window === "30d" ? 30 : 7;
  const d = new Date(Date.now() - 2 * days * 24 * 3600 * 1000);
  return d.toISOString().replace("T", " ").substring(0, 19);
}

/** Score bucket label */
function scoreBucket(score) {
  if (score <= 20) return "0–20";
  if (score <= 40) return "21–40";
  if (score <= 60) return "41–60";
  if (score <= 80) return "61–80";
  return "81–100";
}

// ─── GET /api/analytics/risk-distribution ─────────────────────────────────────
router.get("/risk-distribution", (req, res) => {
  try {
    const win = req.query.window || "7d";
    const cutoff = windowCutoff(win);
    const priorCutoff = priorWindowCutoff(win);

    // All non-simulation transactions in window with their risk score + date
    const rows = db.prepare(`
      SELECT
        SUBSTR(created_at, 1, 10) as date,
        risk_score
      FROM transactions
      WHERE created_at >= ?
        AND simulation_batch_id IS NULL
        AND risk_score IS NOT NULL
      ORDER BY date ASC
    `).all(cutoff);

    // Group by date → bucket → count
    const byDate = {};
    for (const row of rows) {
      const bucket = scoreBucket(row.risk_score);
      if (!byDate[row.date]) byDate[row.date] = { date: row.date, "0–20": 0, "21–40": 0, "41–60": 0, "61–80": 0, "81–100": 0 };
      byDate[row.date][bucket]++;
    }
    const distribution = Object.values(byDate);

    // Average risk score this window
    const avgRow = db.prepare(`
      SELECT ROUND(AVG(risk_score), 1) as avg FROM transactions
      WHERE created_at >= ? AND simulation_batch_id IS NULL AND risk_score IS NOT NULL
    `).get(cutoff);

    // Average risk score prior window (for trend comparison)
    const priorAvgRow = db.prepare(`
      SELECT ROUND(AVG(risk_score), 1) as avg FROM transactions
      WHERE created_at >= ? AND created_at < ? AND simulation_batch_id IS NULL AND risk_score IS NOT NULL
    `).get(priorCutoff, cutoff);

    const currentAvg = avgRow?.avg ?? null;
    const priorAvg = priorAvgRow?.avg ?? null;
    const trend = currentAvg === null || priorAvg === null ? "insufficient_data"
      : currentAvg > priorAvg ? "up" : currentAvg < priorAvg ? "down" : "flat";

    res.json({
      window: win,
      distribution,
      summary: {
        avgRiskScore: currentAvg,
        priorAvgRiskScore: priorAvg,
        trend,
        totalTransactions: rows.length,
      },
    });
  } catch (err) {
    console.error("risk-distribution error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/decision-trend ────────────────────────────────────────
router.get("/decision-trend", (req, res) => {
  try {
    const win = req.query.window || "7d";
    const cutoff = windowCutoff(win);

    // Group by date + decision
    const rows = db.prepare(`
      SELECT
        SUBSTR(created_at, 1, 10) as date,
        decision,
        COUNT(*) as count
      FROM transactions
      WHERE created_at >= ?
        AND simulation_batch_id IS NULL
        AND decision IS NOT NULL
      GROUP BY date, decision
      ORDER BY date ASC
    `).all(cutoff);

    // Pivot to [{date, AUTO_EXECUTE, HUMAN_APPROVAL, BLOCKED}]
    const byDate = {};
    for (const row of rows) {
      if (!byDate[row.date]) byDate[row.date] = { date: row.date, AUTO_EXECUTE: 0, HUMAN_APPROVAL: 0, BLOCKED: 0 };
      byDate[row.date][row.decision] = row.count;
    }
    const trend = Object.values(byDate);

    // Overall rates for the window
    const totals = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN decision = 'AUTO_EXECUTE' THEN 1 ELSE 0 END) as autoExec,
        SUM(CASE WHEN decision = 'HUMAN_APPROVAL' THEN 1 ELSE 0 END) as humanApproval,
        SUM(CASE WHEN decision = 'BLOCKED' THEN 1 ELSE 0 END) as blocked
      FROM transactions
      WHERE created_at >= ? AND simulation_batch_id IS NULL AND decision IS NOT NULL
    `).get(cutoff);

    const total = totals.total || 1; // avoid /0
    res.json({
      window: win,
      trend,
      rates: {
        total: totals.total,
        autoExecPct: Math.round((totals.autoExec / total) * 100),
        humanApprovalPct: Math.round((totals.humanApproval / total) * 100),
        blockedPct: Math.round((totals.blocked / total) * 100),
        autoExec: totals.autoExec,
        humanApproval: totals.humanApproval,
        blocked: totals.blocked,
      },
    });
  } catch (err) {
    console.error("decision-trend error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/top-flagged-vendors ───────────────────────────────────
router.get("/top-flagged-vendors", (req, res) => {
  try {
    // Current calendar month start
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString().replace("T", " ").substring(0, 19);

    // Flagged = PENDING or BLOCKED (non-auto-executed = required scrutiny)
    const flagged = db.prepare(`
      SELECT
        v.name as vendor,
        v.id as vendorId,
        COUNT(*) as flaggedCount,
        SUM(t.amount) as flaggedAmount,
        MAX(t.reasoning) as latestReasoning
      FROM transactions t
      JOIN vendors v ON t.vendor_id = v.id
      WHERE t.created_at >= ?
        AND t.simulation_batch_id IS NULL
        AND t.decision IN ('HUMAN_APPROVAL', 'BLOCKED')
      GROUP BY v.id, v.name
      ORDER BY flaggedCount DESC
      LIMIT 10
    `).all(monthStart);

    // Cross-reference with fraud_alerts for each vendor name
    const fraudVendors = new Set(
      db.prepare(`SELECT DISTINCT vendorName FROM fraud_alerts WHERE status = 'ACTIVE'`).all().map(r => r.vendorName)
    );

    // Extract most common reason from stored reasoning JSON
    const withReasons = flagged.map(row => {
      let reason = "Elevated risk score";
      try {
        if (row.latestReasoning) {
          const parsed = JSON.parse(row.latestReasoning);
          if (parsed.reasoning && typeof parsed.reasoning === "string") {
            // Take first sentence for brevity
            reason = parsed.reasoning.split(".")[0].trim().substring(0, 80) || reason;
          }
        }
      } catch (_) {}

      return {
        vendor: row.vendor,
        vendorId: row.vendorId,
        flaggedCount: row.flaggedCount,
        flaggedAmount: row.flaggedAmount,
        reason,
        inFraudCenter: fraudVendors.has(row.vendor),
      };
    });

    res.json({
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      vendors: withReasons,
    });
  } catch (err) {
    console.error("top-flagged-vendors error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
