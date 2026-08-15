/**
 * Agent Control API — spending limits, emergency stop, and health metrics.
 * All controls wire into the live risk pipeline via the policies table and agent_status table.
 */
import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db/init.js";
import { logAuditEvent } from "../utils/audit.js";

const router = Router();

// ─── Helper: get or create spending limit policy row ─────────────────────────
function getSpendingLimitConfig() {
  let row = db.prepare("SELECT * FROM policies WHERE id = 'policy-spending-limits' AND isActive = 1").get();
  if (!row) {
    // Create default if missing
    db.prepare(`
      INSERT OR IGNORE INTO policies (id, name, ruleType, config, isActive)
      VALUES ('policy-spending-limits', 'Default Spending Limits', 'spending_limit', ?, 1)
    `).run(JSON.stringify({ perTransactionLimit: 50000, dailyLimit: 200000 }));
    row = db.prepare("SELECT * FROM policies WHERE id = 'policy-spending-limits'").get();
  }
  return JSON.parse(row.config);
}

// ─── Helper: bump policy version ─────────────────────────────────────────────
function bumpPolicyVersion(reason) {
  const latestRow = db.prepare("SELECT MAX(versionNumber) as maxVer FROM policy_versions").get();
  const nextVer = (latestRow?.maxVer || 0) + 1;
  const activePolicies = db.prepare("SELECT * FROM policies WHERE isActive = 1").all();
  const snapshot = activePolicies.map(p => ({ ...p, config: JSON.parse(p.config) }));
  db.prepare(`INSERT INTO policy_versions (id, versionNumber, fullConfigSnapshot) VALUES (?, ?, ?)`)
    .run(uuid(), nextVer, JSON.stringify({ version: nextVer, reason, policies: snapshot, createdAt: new Date().toISOString() }));
  return nextVer;
}

// ─── GET /api/agent-control/limits ────────────────────────────────────────────
router.get("/limits", (req, res) => {
  try {
    const config = getSpendingLimitConfig();

    // Compute today's cumulative auto-executed total (real query)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().replace("T", " ").substring(0, 19);

    const dailyUsed = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE status = 'EXECUTED'
        AND decision = 'AUTO_EXECUTE'
        AND simulation_batch_id IS NULL
        AND created_at >= ?
    `).get(todayStr);

    res.json({
      perTransactionLimit: config.perTransactionLimit,
      dailyLimit: config.dailyLimit,
      dailyUsed: dailyUsed.total,
      dailyRemaining: Math.max(0, config.dailyLimit - dailyUsed.total),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/agent-control/limits ────────────────────────────────────────────
router.put("/limits", (req, res) => {
  try {
    const { perTransactionLimit, dailyLimit } = req.body;
    if (perTransactionLimit == null || dailyLimit == null) {
      return res.status(400).json({ error: "perTransactionLimit and dailyLimit are required" });
    }
    const newConfig = { perTransactionLimit: Number(perTransactionLimit), dailyLimit: Number(dailyLimit) };
    db.prepare("UPDATE policies SET config = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = 'policy-spending-limits'")
      .run(JSON.stringify(newConfig));

    const newVersion = bumpPolicyVersion(`Spending limits updated: per-tx ₹${perTransactionLimit}, daily ₹${dailyLimit}`);
    logAuditEvent(null, "spending_limits_updated", `Per-transaction limit: ₹${perTransactionLimit}, Daily limit: ₹${dailyLimit} — Policy Version ${newVersion}`);

    res.json({ success: true, ...newConfig, newVersionNumber: newVersion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent-control/status ────────────────────────────────────────────
router.get("/status", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM agent_status WHERE id = 'singleton'").get();
    res.json(row || { isEmergencyStopped: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agent-control/emergency-stop ───────────────────────────────────
router.post("/emergency-stop", (req, res) => {
  try {
    const { reason = "Manual emergency stop triggered" } = req.body;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE agent_status SET isEmergencyStopped = 1, stoppedAt = ?, stoppedReason = ?, resumedAt = NULL
      WHERE id = 'singleton'
    `).run(now, reason);
    logAuditEvent(null, "emergency_stop", `🔴 Emergency Stop activated at ${now}. Reason: ${reason}`);
    res.json({ success: true, isEmergencyStopped: true, stoppedAt: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agent-control/resume ───────────────────────────────────────────
router.post("/resume", (req, res) => {
  try {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE agent_status SET isEmergencyStopped = 0, resumedAt = ?, stoppedAt = NULL, stoppedReason = NULL
      WHERE id = 'singleton'
    `).run(now);
    logAuditEvent(null, "agent_resumed", `▶️ Agent resumed at ${now}. Autonomous execution re-enabled.`);
    res.json({ success: true, isEmergencyStopped: false, resumedAt: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent-control/health ────────────────────────────────────────────
router.get("/health", (req, res) => {
  try {
    const statusRow = db.prepare("SELECT * FROM agent_status WHERE id = 'singleton'").get();
    const serverStartedAt = statusRow?.serverStartedAt ? new Date(statusRow.serverStartedAt) : new Date();
    const uptimeSeconds = Math.floor((Date.now() - serverStartedAt.getTime()) / 1000);

    // 7-day uptime %: count seconds spent in emergency stop over last 7 days via audit log
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19);
    const stopEvents = db.prepare(`
      SELECT detail, created_at FROM audit_log
      WHERE event IN ('emergency_stop', 'agent_resumed')
        AND created_at >= ?
      ORDER BY created_at ASC
    `).all(sevenDaysAgo);

    const sevenDaySeconds = 7 * 24 * 3600;
    let stoppedSeconds = 0;
    let lastStopTime = null;
    for (const ev of stopEvents) {
      if (ev.event === "emergency_stop" || ev.detail?.includes("Emergency Stop")) {
        lastStopTime = new Date(ev.created_at).getTime();
      } else if (ev.detail?.includes("resumed") && lastStopTime) {
        stoppedSeconds += (new Date(ev.created_at).getTime() - lastStopTime) / 1000;
        lastStopTime = null;
      }
    }
    if (lastStopTime && statusRow?.isEmergencyStopped) {
      stoppedSeconds += (Date.now() - lastStopTime) / 1000;
    }
    const uptimePercent7d = Math.max(0, Math.round(((sevenDaySeconds - stoppedSeconds) / sevenDaySeconds) * 100));

    // Policy violations: BLOCKED transactions per window (real queries)
    const today7 = new Date(); today7.setHours(0, 0, 0, 0);
    const todayStr = today7.toISOString().replace("T", " ").substring(0, 19);
    const d7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19);
    const d30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19);

    const countBlocked = (since) => db.prepare(`
      SELECT COUNT(*) as cnt FROM transactions
      WHERE decision = 'BLOCKED' AND simulation_batch_id IS NULL AND created_at >= ?
    `).get(since).cnt;

    // Confidence trend: daily average over last 14 days
    const d14 = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19);
    const trend = db.prepare(`
      SELECT
        SUBSTR(created_at, 1, 10) as date,
        ROUND(AVG(confidence_score), 1) as avgConfidence,
        COUNT(*) as txCount
      FROM transactions
      WHERE created_at >= ? AND simulation_batch_id IS NULL AND confidence_score IS NOT NULL
      GROUP BY SUBSTR(created_at, 1, 10)
      ORDER BY date ASC
    `).all(d14);

    res.json({
      uptimeSeconds,
      uptimePercent7d,
      isEmergencyStopped: Boolean(statusRow?.isEmergencyStopped),
      serverStartedAt: statusRow?.serverStartedAt,
      policyViolations: {
        today: countBlocked(todayStr),
        last7d: countBlocked(d7),
        last30d: countBlocked(d30),
      },
      confidenceTrend: trend,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
