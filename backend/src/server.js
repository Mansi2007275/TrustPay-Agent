// Entry point — wires up Express app, routes, DB, and the Telegram bot.
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDb } from "./db/init.js";
import transactionRoutes from "./routes/transactions.js";
import vendorRoutes from "./routes/vendors.js";
import policyRoutes from "./routes/policies.js";
import auditRoutes from "./routes/audit.js";
import simulationRoutes from "./routes/simulation.js";
import reasoningRoutes from "./routes/reasoning.js";
import agentRoutes from "./routes/agent.js";
import invoiceRoutes from "./routes/invoices.js";
import fraudCenterRoutes from "./routes/fraudCenter.js";
import agentControlRoutes from "./routes/agentControl.js";
import analyticsRoutes from "./routes/analytics.js";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { startBot } from "./bot/telegramBot.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

initDb();

app.use("/api/transactions", transactionRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/policies", policyRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/simulate", simulationRoutes);
app.use("/api/transactions", reasoningRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/fraud-center", fraudCenterRoutes);
app.use("/api/agent-control", agentControlRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (req, res) => res.json({ status: "ok", agent: "active" }));

startBot();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`TrustPay backend running on :${PORT}`));
