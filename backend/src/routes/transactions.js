// Core transaction lifecycle: create -> assess -> decide -> (escalate | execute) -> log
import { Router } from "express";
import { db } from "../db/init.js";
import { logAuditEvent } from "../utils/audit.js";
import { updateVendorAfterTransaction } from "../utils/vendorHistory.js";
import { processTransaction } from "../utils/transactionProcessor.js";

const router = Router();

// POST /api/transactions — submit a new payment request
router.post("/", async (req, res) => {
  try {
    const { amount, vendor, invoiceNumber, bankAccount } = req.body;
    if (!amount || !vendor) return res.status(400).json({ error: "amount and vendor are required" });

    const result = await processTransaction({ amount, vendor, invoiceNumber, bankAccount });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions — list all (for dashboard feed), joined with vendor name
router.get("/", (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, v.name as vendor FROM transactions t
    LEFT JOIN vendors v ON t.vendor_id = v.id
    WHERE t.simulation_batch_id IS NULL
    ORDER BY t.created_at DESC
  `).all();
  res.json(rows);
});

// POST /api/transactions/:id/resolve — approve/reject from dashboard or bot callback
router.post("/:id/resolve", (req, res) => {
  const { action } = req.body; // "approve" | "reject"
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  const status = action === "approve" ? "EXECUTED" : "REJECTED";

  db.prepare("UPDATE transactions SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(status, req.params.id);

  updateVendorAfterTransaction(tx.vendor_id, tx.amount, action !== "approve");
  logAuditEvent(req.params.id, action === "approve" ? "approved" : "rejected", `Resolved by human: ${action}`);

  res.json({ id: req.params.id, status });
});

export default router;
