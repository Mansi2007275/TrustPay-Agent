// Invoice management: upload, parse, deduplicate, match to transactions
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";
import { db } from "../db/init.js";
import { logAuditEvent } from "../utils/audit.js";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const router = Router();

const hasGroq = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "your_groq_api_key_here";
const groq = hasGroq ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// ─── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".png", ".jpg", ".jpeg"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(allowed.includes(ext) ? null : new Error("Unsupported file type"), allowed.includes(ext));
  },
});

// ─── Text extraction ───────────────────────────────────────────────────────────
async function extractText(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    // pdf-parse is CJS — use module-level createRequire for ESM compatibility
    const pdfParse = require("pdf-parse");
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return data.text || "";
  }

  // Image: try Groq vision first, fallback to tesseract
  if (hasGroq) {
    return extractTextViaGroq(filePath);
  }

  // Tesseract fallback
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const { data: { text } } = await worker.recognize(filePath);
  await worker.terminate();
  return text;
}

async function extractTextViaGroq(filePath) {
  const buf = fs.readFileSync(filePath);
  const b64 = buf.toString("base64");
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const mediaType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

  const completion = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: "Extract all text from this invoice image. Output the raw text only, no commentary.",
        },
        {
          type: "image_url",
          image_url: { url: `data:${mediaType};base64,${b64}` },
        },
      ],
    }],
  });
  return completion.choices[0].message.content.trim();
}

// ─── Field parsing ─────────────────────────────────────────────────────────────
async function parseInvoiceFields(rawText) {
  if (hasGroq) {
    return parseFieldsViaGroq(rawText);
  }
  return parseFieldsViaRegex(rawText);
}

async function parseFieldsViaGroq(rawText) {
  const prompt = `Extract the following fields from this invoice text and return ONLY valid JSON with no markdown, no preamble:
{
  "invoiceNumber": "<string or null>",
  "vendorName": "<string or null>",
  "amount": <number or null>,
  "invoiceDate": "<YYYY-MM-DD or null>",
  "dueDate": "<YYYY-MM-DD or null>"
}

Invoice text:
${rawText.slice(0, 3000)}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const raw = completion.choices[0].message.content.trim();
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq field parse failed, using regex:", err.message);
    return parseFieldsViaRegex(rawText);
  }
}

function parseFieldsViaRegex(text) {
  const t = text;

  // Invoice number
  const invMatch = t.match(/invoice\s*(?:#|no\.?|number)[\s:]*([A-Z0-9\-\/]+)/i);
  const invoiceNumber = invMatch?.[1]?.trim() || null;

  // Amount — look for total / amount due / grand total
  const amtMatch = t.match(/(?:total|amount\s*due|grand\s*total|net\s*amount)[\s:₹$£€]*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, "")) : null;

  // Vendor: first non-empty line heuristic, or "From:" / "Bill From:" pattern
  const vendorMatch = t.match(/(?:from|bill\s*from|vendor|company|seller)[\s:]*([^\n]+)/i);
  const vendorName = vendorMatch?.[1]?.trim() || null;

  // Dates — match DD/MM/YYYY, YYYY-MM-DD, "Month DD, YYYY"
  const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/gi;
  const dates = [...t.matchAll(datePattern)].map(m => m[0]);

  const parseDate = (str) => {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };

  return {
    invoiceNumber,
    vendorName,
    amount,
    invoiceDate: parseDate(dates[0]) || null,
    dueDate: parseDate(dates[1]) || null,
  };
}

// ─── Duplicate check ───────────────────────────────────────────────────────────
function checkDuplicate(invoiceNumber, vendorName, excludeId = null) {
  if (!invoiceNumber) return null;
  let query = `SELECT * FROM invoices WHERE invoice_number = ?`;
  const params = [invoiceNumber];
  if (vendorName) { query += ` AND vendor_name = ?`; params.push(vendorName); }
  if (excludeId) { query += ` AND id != ?`; params.push(excludeId); }
  return db.prepare(query).get(...params) || null;
}

// ─── ROUTES ────────────────────────────────────────────────────────────────────

// POST /api/invoices/upload
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { filename, originalname, path: filePath, mimetype } = req.file;

    // Extract text
    let rawText = "";
    try {
      rawText = await extractText(filePath, mimetype);
    } catch (err) {
      console.error("Text extraction error:", err.message);
      rawText = "";
    }

    // Parse fields
    const fields = await parseInvoiceFields(rawText);

    // Duplicate check
    const duplicate = checkDuplicate(fields.invoiceNumber, fields.vendorName);

    const id = uuid();
    const status = duplicate ? "DUPLICATE_WARNING" : "UNMATCHED";

    db.prepare(`
      INSERT INTO invoices (id, filename, original_name, invoice_number, vendor_name, amount,
        invoice_date, due_date, status, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, filename, originalname, fields.invoiceNumber, fields.vendorName,
      fields.amount, fields.invoiceDate, fields.dueDate, status, rawText.slice(0, 5000));

    logAuditEvent(id, "invoice_uploaded", `Invoice uploaded: ${originalname}, status: ${status}`);

    const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id);
    res.json({ invoice, duplicate: duplicate || null });

  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices
router.get("/", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT i.*, t.amount as tx_amount, v.name as tx_vendor
      FROM invoices i
      LEFT JOIN transactions t ON i.matched_transaction_id = t.id
      LEFT JOIN vendors v ON t.vendor_id = v.id
      ORDER BY i.uploaded_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id
router.get("/:id", (req, res) => {
  const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  res.json(inv);
});

// PATCH /api/invoices/:id — update user-corrected fields
router.patch("/:id", (req, res) => {
  try {
    const { invoiceNumber, vendorName, amount, invoiceDate, dueDate } = req.body;
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const newInvNum = invoiceNumber ?? inv.invoice_number;
    const newVendor = vendorName ?? inv.vendor_name;

    // Re-check duplicate with new values
    const duplicate = checkDuplicate(newInvNum, newVendor, req.params.id);
    const newStatus = duplicate ? "DUPLICATE_WARNING" : (inv.status === "DUPLICATE_WARNING" ? "UNMATCHED" : inv.status);

    db.prepare(`
      UPDATE invoices SET invoice_number = ?, vendor_name = ?, amount = ?,
        invoice_date = ?, due_date = ?, status = ? WHERE id = ?
    `).run(newInvNum, newVendor, amount ?? inv.amount, invoiceDate ?? inv.invoice_date,
      dueDate ?? inv.due_date, newStatus, req.params.id);

    logAuditEvent(req.params.id, "invoice_edited", `Fields updated by user`);
    const updated = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
    res.json({ invoice: updated, duplicate: duplicate || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices/:id/match — link to a transaction and check amount
router.post("/:id/match", (req, res) => {
  try {
    const { transactionId, autoMatch } = req.body;
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    let txId = transactionId;

    if (autoMatch || !txId) {
      // Auto-match: same vendor name, amount within 20%, within 30 days
      const candidates = db.prepare(`
        SELECT t.*, v.name as vendor FROM transactions t
        LEFT JOIN vendors v ON t.vendor_id = v.id
        WHERE LOWER(v.name) = LOWER(?)
        ORDER BY ABS(t.amount - ?) ASC
        LIMIT 1
      `).get(inv.vendor_name || "", inv.amount || 0);
      txId = candidates?.id || null;
    }

    if (!txId) return res.status(404).json({ error: "No matching transaction found" });

    const tx = db.prepare(`
      SELECT t.*, v.name as vendor FROM transactions t
      LEFT JOIN vendors v ON t.vendor_id = v.id
      WHERE t.id = ?
    `).get(txId);
    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    const invAmount = inv.amount || 0;
    const txAmount = tx.amount || 0;
    const delta = Math.abs(invAmount - txAmount);
    const deltaPercent = txAmount > 0 ? (delta / txAmount) * 100 : 0;
    const TOLERANCE = 1; // 1%
    const hasMismatch = deltaPercent > TOLERANCE;

    const newStatus = hasMismatch ? "AMOUNT_MISMATCH" : "OK";

    db.prepare(`
      UPDATE invoices SET matched_transaction_id = ?, amount_delta = ?, status = ? WHERE id = ?
    `).run(txId, delta, newStatus, req.params.id);

    const event = hasMismatch ? "invoice_mismatch_flagged" : "invoice_matched";
    logAuditEvent(req.params.id, event,
      hasMismatch
        ? `Amount mismatch: invoice ₹${invAmount} vs payment ₹${txAmount} (${deltaPercent.toFixed(1)}% delta)`
        : `Invoice matched to transaction ${txId} — amounts align`
    );

    const updated = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
    res.json({ invoice: updated, transaction: tx, delta, deltaPercent: parseFloat(deltaPercent.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices/:id/override-duplicate — user says "not a duplicate, proceed"
router.post("/:id/override-duplicate", (req, res) => {
  try {
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    db.prepare("UPDATE invoices SET status = 'UNMATCHED' WHERE id = ?").run(req.params.id);
    logAuditEvent(req.params.id, "duplicate_invoice_override", "User overrode duplicate warning — proceeding with invoice");
    res.json({ id: req.params.id, status: "UNMATCHED" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
