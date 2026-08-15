import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db/init.js";
const router = Router();

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM vendors ORDER BY trust_score DESC").all());
});

router.get("/:id", (req, res) => {
  const vendor = db.prepare("SELECT * FROM vendors WHERE id = ?").get(req.params.id);
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });
  const transactions = db.prepare("SELECT * FROM transactions WHERE vendor_id = ? ORDER BY created_at DESC").all(req.params.id);
  res.json({ ...vendor, transactions });
});

router.post("/", (req, res) => {
  const { name, bankAccount } = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO vendors (id, name, bank_account) VALUES (?, ?, ?)`).run(id, name, bankAccount || null);
  res.json({ id, name, bankAccount });
});

export default router;
