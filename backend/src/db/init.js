// // Creates SQLite tables on first run. Reused pattern from AgentPager.
// import Database from "better-sqlite3";
// import dotenv from "dotenv";
// import { v4 as uuid } from "uuid";
// dotenv.config();

// const dbPath = process.env.DB_PATH || "./src/data/trustpay.db";
// export const db = new Database(dbPath);

// export function initDb() {
//   // Drop old policies table if it has the old schema (e.g. has column "version" but not "ruleType")
//   try {
//     const info = db.prepare("PRAGMA table_info(policies)").all();
//     const hasRuleType = info.some(col => col.name === "ruleType");
//     if (info.length > 0 && !hasRuleType) {
//       console.log("Dropping old policies table to upgrade schema...");
//       db.exec("DROP TABLE IF EXISTS policies;");
//     }
//   } catch (e) {
//     // Ignore if table does not exist
//   }

//   db.exec(`
//     CREATE TABLE IF NOT EXISTS vendors (
//       id TEXT PRIMARY KEY,
//       name TEXT NOT NULL,
//       bank_account TEXT,
//       trust_score INTEGER DEFAULT 20,
//       total_transactions INTEGER DEFAULT 0,
//       total_rejected INTEGER DEFAULT 0,
//       avg_amount REAL DEFAULT 0,
//       first_seen TEXT DEFAULT CURRENT_TIMESTAMP
//     );

//     CREATE TABLE IF NOT EXISTS transactions (
//       id TEXT PRIMARY KEY,
//       vendor_id TEXT,
//       amount REAL NOT NULL,
//       invoice_number TEXT,
//       risk_score INTEGER,
//       confidence_score INTEGER,
//       decision TEXT,           -- AUTO_EXECUTE | HUMAN_APPROVAL | BLOCKED
//       reasoning TEXT,          -- JSON string of factors + explanation
//       status TEXT DEFAULT 'PENDING', -- PENDING | EXECUTED | REJECTED | EXPIRED
//       created_at TEXT DEFAULT CURRENT_TIMESTAMP,
//       resolved_at TEXT,
//       simulation_batch_id TEXT,
//       policy_version_number INTEGER,
//       FOREIGN KEY (vendor_id) REFERENCES vendors(id)
//     );

//     CREATE TABLE IF NOT EXISTS audit_log (
//       id TEXT PRIMARY KEY,
//       transaction_id TEXT,
//       event TEXT,              -- e.g. "risk_calculated", "telegram_sent", "approved"
//       detail TEXT,
//       prev_hash TEXT,
//       hash TEXT,
//       created_at TEXT DEFAULT CURRENT_TIMESTAMP
//     );

//     CREATE TABLE IF NOT EXISTS policies (
//       id TEXT PRIMARY KEY,
//       name TEXT NOT NULL,
//       ruleType TEXT NOT NULL,
//       config TEXT NOT NULL, -- JSON string
//       isActive INTEGER DEFAULT 1,
//       createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
//       updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
//     );

//     CREATE TABLE IF NOT EXISTS policy_versions (
//       id TEXT PRIMARY KEY,
//       versionNumber INTEGER NOT NULL,
//       fullConfigSnapshot TEXT NOT NULL, -- JSON string of all active policies
//       createdAt TEXT DEFAULT CURRENT_TIMESTAMP
//     );

//     CREATE TABLE IF NOT EXISTS invoices (
//       id TEXT PRIMARY KEY,
//       filename TEXT,
//       original_name TEXT,
//       invoice_number TEXT,
//       vendor_name TEXT,
//       amount REAL,
//       invoice_date TEXT,
//       due_date TEXT,
//       uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
//       matched_transaction_id TEXT,
//       amount_delta REAL,
//       status TEXT DEFAULT 'UNMATCHED',
//       raw_text TEXT,
//       FOREIGN KEY (matched_transaction_id) REFERENCES transactions(id)
//     );

//     CREATE TABLE IF NOT EXISTS fraud_alerts (
//       id TEXT PRIMARY KEY,
//       type TEXT NOT NULL,
//       vendorName TEXT NOT NULL,
//       transactionIds TEXT NOT NULL, -- JSON array of strings
//       totalAmount REAL NOT NULL,
//       detectedAt TEXT DEFAULT CURRENT_TIMESTAMP,
//       status TEXT DEFAULT 'ACTIVE'
//     );

//     CREATE TABLE IF NOT EXISTS agent_status (
//       id TEXT PRIMARY KEY DEFAULT 'singleton',
//       isEmergencyStopped INTEGER DEFAULT 0,
//       stoppedAt TEXT,
//       stoppedReason TEXT,
//       resumedAt TEXT,
//       serverStartedAt TEXT
//     );
//   `);

//   // Migration for existing DBs
//   try {
//     db.exec(`ALTER TABLE transactions ADD COLUMN simulation_batch_id TEXT;`);
//   } catch (err) {
//     // Column already exists, ignore
//   }

//   try {
//     db.exec(`ALTER TABLE transactions ADD COLUMN policy_version_number INTEGER;`);
//   } catch (err) {
//     // Column already exists, ignore
//   }

//   // Ensure agent_status singleton row exists
//   try {
//     const statusRow = db.prepare("SELECT id FROM agent_status WHERE id = 'singleton'").get();
//     if (!statusRow) {
//       db.prepare(`
//         INSERT INTO agent_status (id, isEmergencyStopped, serverStartedAt)
//         VALUES ('singleton', 0, ?)
//       `).run(new Date().toISOString());
//     } else {
//       // Update server start time on every boot
//       db.prepare("UPDATE agent_status SET serverStartedAt = ? WHERE id = 'singleton'").run(new Date().toISOString());
//     }
//   } catch (e) {
//     console.error("agent_status init failed:", e.message);
//   }

//   // Seed default policies if table is empty
//   try {
//     const count = db.prepare("SELECT COUNT(*) as cnt FROM policies").get().cnt;
//     if (count === 0) {
//       console.log("Seeding default policies (Balanced preset)...");
//       const defaultPolicies = [
//         {
//           id: "policy-threshold-balanced",
//           name: "Default Balanced Thresholds",
//           ruleType: "amount_threshold",
//           config: JSON.stringify({ autoExecuteLimit: 15000, blockLimit: 100000 }),
//           isActive: 1
//         },
//         {
//           id: "policy-routing-balanced",
//           name: "Default Approver Routing",
//           ruleType: "approver_routing",
//           config: JSON.stringify({
//             routes: [
//               { minAmount: 0, maxAmount: 100000, chatId: process.env.TELEGRAM_APPROVER_CHAT_ID || "6390520739" },
//               { minAmount: 100000, maxAmount: 9999999, chatId: "6390520740" }
//             ]
//           }),
//           isActive: 1
//         },
//         {
//           id: "policy-blocked-balanced",
//           name: "Default Blocked Overrides",
//           ruleType: "blocked_condition",
//           config: JSON.stringify({
//             rules: [
//               {
//                 conditions: [
//                   { field: "bankAccountChanged", operator: "equals", value: "true" }
//                 ]
//               }
//             ]
//           }),
//           isActive: 1
//         },
//         {
//           id: "policy-spending-limits",
//           name: "Default Spending Limits",
//           ruleType: "spending_limit",
//           config: JSON.stringify({ perTransactionLimit: 50000, dailyLimit: 200000 }),
//           isActive: 1
//         }
//       ];

//       for (const p of defaultPolicies) {
//         db.prepare(`
//           INSERT INTO policies (id, name, ruleType, config, isActive)
//           VALUES (?, ?, ?, ?, ?)
//         `).run(p.id, p.name, p.ruleType, p.config, p.isActive);
//       }

//       // Seed initial version snapshot
//       db.prepare(`
//         INSERT INTO policy_versions (id, versionNumber, fullConfigSnapshot)
//         VALUES (?, 1, ?)
//       `).run(uuid(), JSON.stringify(defaultPolicies));
//       console.log("Seeding completed successfully.");
//     }
//   } catch (err) {
//     console.error("Seeding default policies failed:", err.message);
//   }

//   console.log("DB initialized at", dbPath);
// }
// Creates SQLite tables on first run. Reused pattern from AgentPager.
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
dotenv.config();

const dbPath = process.env.DB_PATH || "./src/data/trustpay.db";

// Ensure the directory for the DB file exists (fresh clones / Render don't have it,
// since /backend/src/data/ is gitignored).
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

export function initDb() {
  // Drop old policies table if it has the old schema (e.g. has column "version" but not "ruleType")
  try {
    const info = db.prepare("PRAGMA table_info(policies)").all();
    const hasRuleType = info.some(col => col.name === "ruleType");
    if (info.length > 0 && !hasRuleType) {
      console.log("Dropping old policies table to upgrade schema...");
      db.exec("DROP TABLE IF EXISTS policies;");
    }
  } catch (e) {
    // Ignore if table does not exist
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bank_account TEXT,
      trust_score INTEGER DEFAULT 20,
      total_transactions INTEGER DEFAULT 0,
      total_rejected INTEGER DEFAULT 0,
      avg_amount REAL DEFAULT 0,
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      vendor_id TEXT,
      amount REAL NOT NULL,
      invoice_number TEXT,
      risk_score INTEGER,
      confidence_score INTEGER,
      decision TEXT,           -- AUTO_EXECUTE | HUMAN_APPROVAL | BLOCKED
      reasoning TEXT,          -- JSON string of factors + explanation
      status TEXT DEFAULT 'PENDING', -- PENDING | EXECUTED | REJECTED | EXPIRED
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      simulation_batch_id TEXT,
      policy_version_number INTEGER,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      transaction_id TEXT,
      event TEXT,              -- e.g. "risk_calculated", "telegram_sent", "approved"
      detail TEXT,
      prev_hash TEXT,
      hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ruleType TEXT NOT NULL,
      config TEXT NOT NULL, -- JSON string
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS policy_versions (
      id TEXT PRIMARY KEY,
      versionNumber INTEGER NOT NULL,
      fullConfigSnapshot TEXT NOT NULL, -- JSON string of all active policies
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      filename TEXT,
      original_name TEXT,
      invoice_number TEXT,
      vendor_name TEXT,
      amount REAL,
      invoice_date TEXT,
      due_date TEXT,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      matched_transaction_id TEXT,
      amount_delta REAL,
      status TEXT DEFAULT 'UNMATCHED',
      raw_text TEXT,
      FOREIGN KEY (matched_transaction_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS fraud_alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      vendorName TEXT NOT NULL,
      transactionIds TEXT NOT NULL, -- JSON array of strings
      totalAmount REAL NOT NULL,
      detectedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'ACTIVE'
    );

    CREATE TABLE IF NOT EXISTS agent_status (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      isEmergencyStopped INTEGER DEFAULT 0,
      stoppedAt TEXT,
      stoppedReason TEXT,
      resumedAt TEXT,
      serverStartedAt TEXT
    );
  `);

  // Migration for existing DBs
  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN simulation_batch_id TEXT;`);
  } catch (err) {
    // Column already exists, ignore
  }

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN policy_version_number INTEGER;`);
  } catch (err) {
    // Column already exists, ignore
  }

  // Ensure agent_status singleton row exists
  try {
    const statusRow = db.prepare("SELECT id FROM agent_status WHERE id = 'singleton'").get();
    if (!statusRow) {
      db.prepare(`
        INSERT INTO agent_status (id, isEmergencyStopped, serverStartedAt)
        VALUES ('singleton', 0, ?)
      `).run(new Date().toISOString());
    } else {
      // Update server start time on every boot
      db.prepare("UPDATE agent_status SET serverStartedAt = ? WHERE id = 'singleton'").run(new Date().toISOString());
    }
  } catch (e) {
    console.error("agent_status init failed:", e.message);
  }

  // Seed default policies if table is empty
  try {
    const count = db.prepare("SELECT COUNT(*) as cnt FROM policies").get().cnt;
    if (count === 0) {
      console.log("Seeding default policies (Balanced preset)...");
      const defaultPolicies = [
        {
          id: "policy-threshold-balanced",
          name: "Default Balanced Thresholds",
          ruleType: "amount_threshold",
          config: JSON.stringify({ autoExecuteLimit: 15000, blockLimit: 100000 }),
          isActive: 1
        },
        {
          id: "policy-routing-balanced",
          name: "Default Approver Routing",
          ruleType: "approver_routing",
          config: JSON.stringify({
            routes: [
              { minAmount: 0, maxAmount: 100000, chatId: process.env.TELEGRAM_APPROVER_CHAT_ID || "6390520739" },
              { minAmount: 100000, maxAmount: 9999999, chatId: "6390520740" }
            ]
          }),
          isActive: 1
        },
        {
          id: "policy-blocked-balanced",
          name: "Default Blocked Overrides",
          ruleType: "blocked_condition",
          config: JSON.stringify({
            rules: [
              {
                conditions: [
                  { field: "bankAccountChanged", operator: "equals", value: "true" }
                ]
              }
            ]
          }),
          isActive: 1
        },
        {
          id: "policy-spending-limits",
          name: "Default Spending Limits",
          ruleType: "spending_limit",
          config: JSON.stringify({ perTransactionLimit: 50000, dailyLimit: 200000 }),
          isActive: 1
        }
      ];

      for (const p of defaultPolicies) {
        db.prepare(`
          INSERT INTO policies (id, name, ruleType, config, isActive)
          VALUES (?, ?, ?, ?, ?)
        `).run(p.id, p.name, p.ruleType, p.config, p.isActive);
      }

      // Seed initial version snapshot
      db.prepare(`
        INSERT INTO policy_versions (id, versionNumber, fullConfigSnapshot)
        VALUES (?, 1, ?)
      `).run(uuid(), JSON.stringify(defaultPolicies));
      console.log("Seeding completed successfully.");
    }
  } catch (err) {
    console.error("Seeding default policies failed:", err.message);
  }

  console.log("DB initialized at", dbPath);
}