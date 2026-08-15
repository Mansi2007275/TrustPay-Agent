import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db/init.js";
import { logAuditEvent } from "../utils/audit.js";
import { processTransaction } from "../utils/transactionProcessor.js";
import { assessRisk } from "../engine/riskEngine.js";

const router = Router();

// Canned fraud scenarios definition
const SCENARIOS = [
  {
    id: "structuring",
    name: "Structuring",
    description: "4 payments to a new vendor, each just under the ₹15,000 auto-approval threshold, sent in rapid succession.",
    setup: (db) => {
      db.prepare("DELETE FROM transactions WHERE vendor_id IN (SELECT id FROM vendors WHERE name = ?)").run("Apex Logistics Solutions");
      db.prepare("DELETE FROM vendors WHERE name = ?").run("Apex Logistics Solutions");
    },
    transactions: [
      { vendor: "Apex Logistics Solutions", amount: 14200, bankAccount: "98765432101", invoiceNumber: "INV-2026-001" },
      { vendor: "Apex Logistics Solutions", amount: 13900, bankAccount: "98765432101", invoiceNumber: "INV-2026-002" },
      { vendor: "Apex Logistics Solutions", amount: 14500, bankAccount: "98765432101", invoiceNumber: "INV-2026-003" },
      { vendor: "Apex Logistics Solutions", amount: 14100, bankAccount: "98765432101", invoiceNumber: "INV-2026-004" }
    ]
  },
  {
    id: "payment_diversion",
    name: "Payment Diversion",
    description: "An established high-trust vendor suddenly submits a payment with a different bank account number.",
    setup: (db) => {
      db.prepare("DELETE FROM transactions WHERE vendor_id IN (SELECT id FROM vendors WHERE name = ?)").run("Global Security Corp");
      db.prepare("DELETE FROM vendors WHERE name = ?").run("Global Security Corp");
      const id = "vendor-global-security";
      db.prepare(`
        INSERT INTO vendors (id, name, bank_account, trust_score, total_transactions, avg_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, "Global Security Corp", "12345678901", 90, 15, 45000);
    },
    transactions: [
      { vendor: "Global Security Corp", amount: 48000, bankAccount: "99999999999", invoiceNumber: "INV-SEC-99" }
    ]
  },
  {
    id: "shell_collusion",
    name: "Shell Vendor Collusion",
    description: "Two supposedly different vendors submit invoices sharing the exact same bank account number.",
    setup: (db) => {
      db.prepare("DELETE FROM transactions WHERE vendor_id IN (SELECT id FROM vendors WHERE name IN (?, ?))").run("Horizon IT Consulting", "Zenith Tech Partners");
      db.prepare("DELETE FROM vendors WHERE name IN (?, ?)").run("Horizon IT Consulting", "Zenith Tech Partners");
    },
    transactions: [
      { vendor: "Horizon IT Consulting", amount: 8500, bankAccount: "55566677700", invoiceNumber: "INV-HZ-10" },
      { vendor: "Zenith Tech Partners", amount: 12000, bankAccount: "55566677700", invoiceNumber: "INV-ZN-24" }
    ]
  },
  {
    id: "velocity_spike",
    name: "Velocity Spike",
    description: "A vendor with small recurring payments suddenly receives a transaction 90x their historical average.",
    setup: (db) => {
      db.prepare("DELETE FROM transactions WHERE vendor_id IN (SELECT id FROM vendors WHERE name = ?)").run("Office Depot");
      db.prepare("DELETE FROM vendors WHERE name = ?").run("Office Depot");
      const id = "vendor-office-depot";
      db.prepare(`
        INSERT INTO vendors (id, name, bank_account, trust_score, total_transactions, avg_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, "Office Depot", "11122233344", 85, 20, 2000);
    },
    transactions: [
      { vendor: "Office Depot", amount: 180000, bankAccount: "11122233344", invoiceNumber: "INV-DEP-542" }
    ]
  }
];

// Helper to run structuring detection check dynamically
async function runStructuringCheck(hours = 72) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19);
  
  // Fetch transactions in the last X hours that are AUTO_EXECUTE or under the 15k threshold
  const txs = db.prepare(`
    SELECT t.*, v.name as vendor_name, v.trust_score, v.avg_amount, v.total_transactions
    FROM transactions t
    LEFT JOIN vendors v ON t.vendor_id = v.id
    WHERE t.created_at >= ? AND (t.decision = 'AUTO_EXECUTE' OR t.amount <= 15000)
    ORDER BY t.created_at DESC
  `).all(cutoffTime);

  // Group transactions by vendor_id
  const vendorGroups = {};
  txs.forEach(t => {
    if (!t.vendor_id) return;
    if (!vendorGroups[t.vendor_id]) {
      vendorGroups[t.vendor_id] = {
        vendorName: t.vendor_name,
        trustScore: t.trust_score,
        avgAmount: t.avg_amount,
        totalTransactions: t.total_transactions,
        transactions: []
      };
    }
    vendorGroups[t.vendor_id].transactions.push(t);
  });

  // Check groups with 3+ transactions
  for (const vendorId in vendorGroups) {
    const group = vendorGroups[vendorId];
    if (group.transactions.length >= 3) {
      const totalAmount = group.transactions.reduce((sum, t) => sum + t.amount, 0);

      // Simulate risk scoring for the sum total
      const assessment = await assessRisk(
        { 
          amount: totalAmount, 
          vendor: group.vendorName, 
          invoiceNumber: "STRUCT-CHECK", 
          timestamp: new Date().toISOString() 
        },
        { 
          avgAmount: group.avgAmount, 
          trustScore: group.trustScore, 
          totalTransactions: group.totalTransactions, 
          bankAccountChanged: false 
        }
      );

      // Flag if sum would require review or block
      if (assessment.decision === "HUMAN_APPROVAL" || assessment.decision === "BLOCKED") {
        const sortedIds = group.transactions.map(t => t.id).sort();
        const txIdsJson = JSON.stringify(sortedIds);

        // Deduplicate check
        const existing = db.prepare("SELECT * FROM fraud_alerts WHERE transactionIds = ?").get(txIdsJson);
        if (!existing) {
          const alertId = uuid();
          db.prepare(`
            INSERT INTO fraud_alerts (id, type, vendorName, transactionIds, totalAmount)
            VALUES (?, 'STRUCTURING', ?, ?, ?)
          `).run(alertId, group.vendorName, txIdsJson, totalAmount);

          // Log in audit log
          logAuditEvent(
            null, 
            "fraud_alert_detected", 
            `Structuring pattern flagged: Vendor "${group.vendorName}" received ${group.transactions.length} split payments totalling ₹${totalAmount.toLocaleString("en-IN")} in ${hours}h.`
          );
        }
      }
    }
  }
}

// POST /api/fraud-center/attack-mode — fire 4 fraud scenarios at once
router.post("/attack-mode", async (req, res) => {
  try {
    const simulationBatchId = uuid();
    const results = [];

    logAuditEvent(null, "simulation_started", `Attack Mode launched! Running 4 canned scenarios under batch ${simulationBatchId}`);

    for (const scenario of SCENARIOS) {
      if (scenario.setup) {
        scenario.setup(db);
      }

      const txResults = [];
      for (const txPayload of scenario.transactions) {
        const txResult = await processTransaction({
          amount: txPayload.amount,
          vendor: txPayload.vendor,
          invoiceNumber: txPayload.invoiceNumber,
          bankAccount: txPayload.bankAccount,
          simulationBatchId
        });
        txResults.push(txResult);
      }

      results.push({
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        transactions: txResults
      });
    }

    res.json({
      success: true,
      simulationBatchId,
      scenarios: results
    });
  } catch (err) {
    console.error("Attack Mode error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fraud-center/clear-simulation — reset and delete simulation data
router.post("/clear-simulation", (req, res) => {
  try {
    // Find transaction IDs first to clean up audit logs
    const simTxs = db.prepare("SELECT id FROM transactions WHERE simulation_batch_id IS NOT NULL").all();
    const txIds = simTxs.map(t => t.id);

    if (txIds.length > 0) {
      const placeholders = txIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM audit_log WHERE transaction_id IN (${placeholders})`).run(...txIds);
    }

    db.prepare(`DELETE FROM audit_log WHERE event IN ('simulation_started', 'fraud_alert_detected')`).run();

    const txDeleteResult = db.prepare("DELETE FROM transactions WHERE simulation_batch_id IS NOT NULL").run();
    const alertDeleteResult = db.prepare("DELETE FROM fraud_alerts").run();

    logAuditEvent(null, "simulation_reset", `Simulation cleaned up. Removed ${txDeleteResult.changes} transactions and ${alertDeleteResult.changes} alerts.`);

    res.json({
      success: true,
      deletedTransactionsCount: txDeleteResult.changes,
      deletedAlertsCount: alertDeleteResult.changes
    });
  } catch (err) {
    console.error("Clear Simulation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fraud-center/alerts — list and calculate structuring alerts
router.get("/alerts", async (req, res) => {
  try {
    const { type } = req.query;
    const hours = parseInt(req.query.hours) || 72;

    await runStructuringCheck(hours);

    let rows;
    if (type) {
      rows = db.prepare("SELECT * FROM fraud_alerts WHERE type = ? ORDER BY detectedAt DESC").all(type);
    } else {
      rows = db.prepare("SELECT * FROM fraud_alerts ORDER BY detectedAt DESC").all();
    }

    const result = [];
    for (const row of rows) {
      const txIds = JSON.parse(row.transactionIds);
      const placeholders = txIds.map(() => "?").join(",");
      const txs = db.prepare(`
        SELECT id, amount, created_at, decision, invoice_number
        FROM transactions
        WHERE id IN (${placeholders})
        ORDER BY created_at ASC
      `).all(...txIds);

      result.push({
        ...row,
        transactionIds: txIds,
        transactions: txs
      });
    }

    res.json(result);
  } catch (err) {
    console.error("Fetch alerts error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fraud-center/vendor-graph — relationship graph nodes and edges
router.get("/vendor-graph", (req, res) => {
  try {
    const vendors = db.prepare(`
      SELECT v.*, 
        (SELECT COUNT(*) FROM transactions WHERE vendor_id = v.id) as txCount,
        (SELECT SUM(amount) FROM transactions WHERE vendor_id = v.id) as totalAmount
      FROM vendors v
    `).all();

    const accounts = {};
    vendors.forEach(v => {
      if (v.bank_account && v.bank_account.trim() !== "") {
        const acc = v.bank_account.trim();
        if (!accounts[acc]) {
          accounts[acc] = [];
        }
        accounts[acc].push(v);
      }
    });

    const edges = [];
    const flaggedVendorIds = new Set();

    Object.entries(accounts).forEach(([bankAccount, list]) => {
      if (list.length > 1) {
        list.forEach(v => flaggedVendorIds.add(v.id));

        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            edges.push({
              id: `edge-${list[i].id}-${list[j].id}`,
              source: list[i].id,
              target: list[j].id,
              bankAccount: bankAccount,
              sourceName: list[i].name,
              targetName: list[j].name
            });
          }
        }
      }
    });

    const nodes = vendors.map(v => ({
      id: v.id,
      name: v.name,
      bankAccount: v.bank_account,
      txCount: v.txCount,
      totalAmount: v.totalAmount || 0,
      trustScore: v.trust_score,
      isFlagged: flaggedVendorIds.has(v.id)
    }));

    res.json({ nodes, edges });
  } catch (err) {
    console.error("Vendor graph error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
