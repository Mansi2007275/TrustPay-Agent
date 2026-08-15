// Policies CRUD, versioning, and trust-mode switching.
// Every write operation bumps the global policy version and snapshots the full active set.
import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db/init.js";
import { logAuditEvent } from "../utils/audit.js";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Bump the policy version, snapshot all currently active policies, and return the new version number */
function bumpPolicyVersion(reason) {
  const latestRow = db.prepare("SELECT MAX(versionNumber) as maxVer FROM policy_versions").get();
  const nextVer = (latestRow?.maxVer || 0) + 1;

  const activePolicies = db.prepare("SELECT * FROM policies WHERE isActive = 1").all();
  const snapshot = activePolicies.map(p => ({ ...p, config: JSON.parse(p.config) }));

  db.prepare(`
    INSERT INTO policy_versions (id, versionNumber, fullConfigSnapshot)
    VALUES (?, ?, ?)
  `).run(uuid(), nextVer, JSON.stringify({ version: nextVer, reason, policies: snapshot, createdAt: new Date().toISOString() }));

  return nextVer;
}

// Trust Mode preset bundles
const TRUST_MODE_PRESETS = {
  conservative: [
    {
      id: "policy-threshold",
      name: "Conservative Thresholds",
      ruleType: "amount_threshold",
      config: { autoExecuteLimit: 5000, blockLimit: 50000 }
    },
    {
      id: "policy-routing",
      name: "Conservative Approver Routing",
      ruleType: "approver_routing",
      config: {
        routes: [
          { minAmount: 0, maxAmount: 50000, chatId: process.env.TELEGRAM_APPROVER_CHAT_ID || "6390520739" },
          { minAmount: 50000, maxAmount: 9999999, chatId: "6390520740" }
        ]
      }
    },
    {
      id: "policy-blocked",
      name: "Conservative Blocked Overrides",
      ruleType: "blocked_condition",
      config: {
        rules: [
          { conditions: [{ field: "bankAccountChanged", operator: "equals", value: "true" }] },
          { conditions: [{ field: "newVendor", operator: "equals", value: "true" }, { field: "amount", operator: "greater_than", value: "3000" }] }
        ]
      }
    }
  ],
  balanced: [
    {
      id: "policy-threshold",
      name: "Default Balanced Thresholds",
      ruleType: "amount_threshold",
      config: { autoExecuteLimit: 15000, blockLimit: 100000 }
    },
    {
      id: "policy-routing",
      name: "Default Approver Routing",
      ruleType: "approver_routing",
      config: {
        routes: [
          { minAmount: 0, maxAmount: 100000, chatId: process.env.TELEGRAM_APPROVER_CHAT_ID || "6390520739" },
          { minAmount: 100000, maxAmount: 9999999, chatId: "6390520740" }
        ]
      }
    },
    {
      id: "policy-blocked",
      name: "Default Blocked Overrides",
      ruleType: "blocked_condition",
      config: {
        rules: [
          { conditions: [{ field: "bankAccountChanged", operator: "equals", value: "true" }] }
        ]
      }
    }
  ],
  autonomous: [
    {
      id: "policy-threshold",
      name: "Autonomous Thresholds",
      ruleType: "amount_threshold",
      config: { autoExecuteLimit: 50000, blockLimit: 500000 }
    },
    {
      id: "policy-routing",
      name: "Autonomous Approver Routing",
      ruleType: "approver_routing",
      config: {
        routes: [
          { minAmount: 0, maxAmount: 500000, chatId: process.env.TELEGRAM_APPROVER_CHAT_ID || "6390520739" },
          { minAmount: 500000, maxAmount: 9999999, chatId: "6390520740" }
        ]
      }
    },
    {
      id: "policy-blocked",
      name: "Autonomous Blocked Overrides",
      ruleType: "blocked_condition",
      config: {
        rules: [
          { conditions: [{ field: "bankAccountChanged", operator: "equals", value: "true" }] }
        ]
      }
    }
  ]
};

// ─── GET /api/policies/versions ───────────────────────────────────────────────
// MUST come before /:id to avoid routing conflict
router.get("/versions", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM policy_versions ORDER BY versionNumber DESC").all();
    res.json(rows.map(r => ({ ...r, fullConfigSnapshot: JSON.parse(r.fullConfigSnapshot) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/policies/versions/:id ──────────────────────────────────────────
router.get("/versions/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM policy_versions WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Version not found" });
    res.json({ ...row, fullConfigSnapshot: JSON.parse(row.fullConfigSnapshot) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/policies/trust-mode ───────────────────────────────────────────
router.post("/trust-mode", (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode || !TRUST_MODE_PRESETS[mode]) {
      return res.status(400).json({ error: "Invalid mode. Use: conservative | balanced | autonomous" });
    }

    const presets = TRUST_MODE_PRESETS[mode];

    // Soft-delete all current policies with those IDs
    for (const preset of presets) {
      db.prepare("DELETE FROM policies WHERE id = ?").run(preset.id);
    }
    // Soft-deactivate any extra policies not in this preset
    db.prepare("UPDATE policies SET isActive = 0 WHERE id NOT IN (?, ?, ?)")
      .run(...presets.map(p => p.id));

    // Insert preset policies as active
    for (const preset of presets) {
      db.prepare(`
        INSERT OR REPLACE INTO policies (id, name, ruleType, config, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(preset.id, preset.name, preset.ruleType, JSON.stringify(preset.config));
    }

    const newVersion = bumpPolicyVersion(`Trust Mode switched to ${mode.toUpperCase()}`);
    logAuditEvent(null, "trust_mode_switched", `Trust Mode set to ${mode.toUpperCase()} — Policy Version ${newVersion} created`);

    res.json({ success: true, mode, newVersionNumber: newVersion });
  } catch (err) {
    console.error("Trust mode switch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/policies ────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM policies WHERE isActive = 1 ORDER BY createdAt DESC").all();
    const withParsed = rows.map(r => ({ ...r, config: JSON.parse(r.config) }));
    const currentVersion = db.prepare("SELECT MAX(versionNumber) as v FROM policy_versions").get();
    res.json({ policies: withParsed, currentVersionNumber: currentVersion?.v || 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/policies/active (legacy compat) ────────────────────────────────
router.get("/active", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM policies WHERE isActive = 1 ORDER BY createdAt DESC").all();
    res.json(rows.map(r => ({ ...r, config: JSON.parse(r.config) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/policies ───────────────────────────────────────────────────────
router.post("/", (req, res) => {
  try {
    const { name, ruleType, config } = req.body;
    if (!name || !ruleType || !config) {
      return res.status(400).json({ error: "name, ruleType, and config are required" });
    }
    const validTypes = ["amount_threshold", "approver_routing", "blocked_condition"];
    if (!validTypes.includes(ruleType)) {
      return res.status(400).json({ error: `ruleType must be one of: ${validTypes.join(", ")}` });
    }

    const id = uuid();
    db.prepare(`
      INSERT INTO policies (id, name, ruleType, config, isActive)
      VALUES (?, ?, ?, ?, 1)
    `).run(id, name, ruleType, JSON.stringify(config));

    const newVersion = bumpPolicyVersion(`Policy "${name}" created`);
    logAuditEvent(null, "policy_created", `New ${ruleType} policy "${name}" created — Policy Version ${newVersion}`);

    const row = db.prepare("SELECT * FROM policies WHERE id = ?").get(id);
    res.status(201).json({ ...row, config: JSON.parse(row.config), newVersionNumber: newVersion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/policies/:id ────────────────────────────────────────────────────
router.put("/:id", (req, res) => {
  try {
    const { name, config } = req.body;
    const existing = db.prepare("SELECT * FROM policies WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Policy not found" });

    db.prepare(`
      UPDATE policies SET name = ?, config = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    `).run(name || existing.name, JSON.stringify(config) || existing.config, req.params.id);

    const newVersion = bumpPolicyVersion(`Policy "${name || existing.name}" updated`);
    logAuditEvent(null, "policy_updated", `Policy "${name || existing.name}" updated — Policy Version ${newVersion}`);

    const row = db.prepare("SELECT * FROM policies WHERE id = ?").get(req.params.id);
    res.json({ ...row, config: JSON.parse(row.config), newVersionNumber: newVersion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/policies/:id (soft delete via isActive=false) ────────────────
router.delete("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM policies WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Policy not found" });

    db.prepare("UPDATE policies SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);

    const newVersion = bumpPolicyVersion(`Policy "${existing.name}" deactivated`);
    logAuditEvent(null, "policy_deactivated", `Policy "${existing.name}" deactivated — Policy Version ${newVersion}`);

    res.json({ success: true, id: req.params.id, newVersionNumber: newVersion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
