import { v4 as uuid } from "uuid";
import { db } from "../db/init.js";

export function getOrCreateVendor(name, bankAccount) {
  let vendor = db.prepare("SELECT * FROM vendors WHERE name = ?").get(name);

  if (!vendor) {
    const id = uuid();
    db.prepare(`INSERT INTO vendors (id, name, bank_account, trust_score) VALUES (?, ?, ?, 20)`)
      .run(id, name, bankAccount || null);
    vendor = db.prepare("SELECT * FROM vendors WHERE id = ?").get(id);
  }

  const bankAccountChanged = !!(bankAccount && vendor.bank_account && bankAccount !== vendor.bank_account);

  return {
    id: vendor.id,
    avgAmount: vendor.avg_amount || 0,
    trustScore: vendor.trust_score,
    totalTransactions: vendor.total_transactions,
    bankAccountChanged,
  };
}

export function updateVendorAfterTransaction(vendorId, amount, wasRejectedOrBlocked) {
  const vendor = db.prepare("SELECT * FROM vendors WHERE id = ?").get(vendorId);
  if (!vendor) return;

  const newTotal = vendor.total_transactions + 1;
  const newAvg = ((vendor.avg_amount * vendor.total_transactions) + amount) / newTotal;
  const trustDelta = wasRejectedOrBlocked ? -10 : 2;
  const newTrust = Math.max(0, Math.min(100, vendor.trust_score + trustDelta));

  db.prepare(`
    UPDATE vendors SET total_transactions = ?, avg_amount = ?, trust_score = ?,
      total_rejected = total_rejected + ? WHERE id = ?
  `).run(newTotal, newAvg, newTrust, wasRejectedOrBlocked ? 1 : 0, vendorId);
}
