// Powers the Simulation Lab — runs canned scenarios through the real risk engine
// without touching live data.
import { Router } from "express";
import { assessRisk } from "../engine/riskEngine.js";
const router = Router();

const SCENARIOS = {
  normal: { amount: 12000, vendor: "Acme Supplies", vendorHistory: { avgAmount: 11000, trustScore: 80, totalTransactions: 40, bankAccountChanged: false } },
  new_vendor_large: { amount: 400000, vendor: "Unknown Traders", vendorHistory: { avgAmount: 0, trustScore: 20, totalTransactions: 0, bankAccountChanged: false } },
  bank_account_changed: { amount: 85000, vendor: "Acme Supplies", vendorHistory: { avgAmount: 30000, trustScore: 70, totalTransactions: 25, bankAccountChanged: true } },
  night_payment: { amount: 60000, vendor: "Late Vendor Co", vendorHistory: { avgAmount: 15000, trustScore: 50, totalTransactions: 5, bankAccountChanged: false } },
};

router.post("/:scenario", async (req, res) => {
  const scenario = SCENARIOS[req.params.scenario];
  if (!scenario) return res.status(404).json({ error: "Unknown scenario" });

  const result = await assessRisk(
    { amount: scenario.amount, vendor: scenario.vendor, invoiceNumber: "SIM-0001", timestamp: new Date().toISOString() },
    scenario.vendorHistory
  );

  res.json({ scenario: req.params.scenario, ...result });
});

export default router;
