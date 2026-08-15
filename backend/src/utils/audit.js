// Appends an audit log entry with simple hash chaining (stretch: tamper-evidence).
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { db } from "../db/init.js";

export function logAuditEvent(transactionId, event, detail) {
  const last = db.prepare("SELECT hash FROM audit_log ORDER BY created_at DESC LIMIT 1").get();
  const prevHash = last?.hash || "genesis";
  const hash = crypto.createHash("sha256").update(prevHash + event + detail + Date.now()).digest("hex");

  db.prepare(`
    INSERT INTO audit_log (id, transaction_id, event, detail, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), transactionId, event, detail, prevHash, hash);
}
