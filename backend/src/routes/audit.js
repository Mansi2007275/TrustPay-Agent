import { Router } from "express";
import { db } from "../db/init.js";
const router = Router();

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").all());
});

router.get("/:transactionId", (req, res) => {
  res.json(db.prepare("SELECT * FROM audit_log WHERE transaction_id = ? ORDER BY created_at ASC").all(req.params.transactionId));
});

export default router;
