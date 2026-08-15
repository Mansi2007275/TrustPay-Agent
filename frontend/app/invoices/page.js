"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  uploadInvoice, getInvoices, updateInvoice,
  matchInvoice, overrideDuplicate, getTransactions,
} from "../../lib/api";

// ─── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  OK:                { bg: "#7ee787", label: "✅ MATCHED",   text: "#0a0a0a" },
  UNMATCHED:         { bg: "#e5e5e5", label: "⬜ UNMATCHED", text: "#0a0a0a" },
  DUPLICATE_WARNING: { bg: "#ffde59", label: "⚠️ DUPLICATE", text: "#0a0a0a" },
  AMOUNT_MISMATCH:   { bg: "#ff5c5c", label: "🔴 MISMATCH",  text: "#ffffff" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.UNMATCHED;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 border-[2.5px] border-ink font-mono text-xs font-bold"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────
function UploadZone({ onUpload, uploading }) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    // Fake progress animation
    setProgress(10);
    const timer = setInterval(() => setProgress(p => Math.min(p + 12, 85)), 200);
    try {
      await onUpload(file);
      setProgress(100);
      setTimeout(() => setProgress(0), 1000);
    } finally {
      clearInterval(timer);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className="border-[3px] border-dashed border-ink p-10 text-center cursor-pointer transition-all"
      style={{
        backgroundColor: dragging ? "#ffde59" : "#ffffff",
        boxShadow: dragging ? "6px 6px 0px #0a0a0a" : "none",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
        disabled={uploading}
      />
      <div className="text-4xl mb-3">{uploading ? "⏳" : "📤"}</div>
      <p className="font-display font-bold text-lg">
        {uploading ? "Extracting invoice fields…" : "Drop invoice here or click to upload"}
      </p>
      <p className="font-mono text-sm text-ink/50 mt-1">PDF, PNG, JPG — max 20 MB</p>

      {progress > 0 && (
        <div className="mt-4 h-2 border-[2px] border-ink bg-paper overflow-hidden">
          <motion.div
            className="h-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut" }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Editable field confirmation form ─────────────────────────────────────────
function FieldConfirmForm({ invoice, onSave, onCancel }) {
  const [form, setForm] = useState({
    invoiceNumber: invoice.invoice_number || "",
    vendorName:    invoice.vendor_name    || "",
    amount:        invoice.amount         || "",
    invoiceDate:   invoice.invoice_date   || "",
    dueDate:       invoice.due_date       || "",
  });
  const [saving, setSaving] = useState(false);

  const field = (label, key, type = "text") => (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-xs text-ink/50 uppercase">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="border-[3px] border-ink px-3 py-2 font-mono text-sm bg-paper focus:outline-none"
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="nb-panel p-5 mt-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold">📋 Confirm Extracted Fields</h3>
        <span className="font-mono text-xs text-ink/40 border border-ink/20 px-2 py-1">
          {invoice.original_name}
        </span>
      </div>
      <p className="font-mono text-xs text-ink/50 mb-4">
        Review and correct any extraction errors before saving.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        {field("Invoice Number", "invoiceNumber")}
        {field("Vendor Name", "vendorName")}
        {field("Amount (₹)", "amount", "number")}
        {field("Invoice Date", "invoiceDate", "date")}
        {field("Due Date", "dueDate", "date")}
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="nb-btn bg-accent px-5 py-2 font-display font-bold text-sm"
        >
          {saving ? "Saving…" : "Save Invoice →"}
        </button>
        <button
          onClick={onCancel}
          className="nb-btn bg-paper px-4 py-2 font-mono text-sm"
        >
          Discard
        </button>
      </div>
    </motion.div>
  );
}

// ─── Duplicate Warning Banner ─────────────────────────────────────────────────
function DuplicateWarning({ invoice, duplicate, onOverride }) {
  const [overriding, setOverriding] = useState(false);
  async function handleOverride() {
    setOverriding(true);
    try { await onOverride(); } finally { setOverriding(false); }
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-[3px] border-ink p-4 mb-4"
      style={{ backgroundColor: "#ffde59", boxShadow: "6px 6px 0px #0a0a0a" }}
    >
      <p className="font-display font-bold text-lg mb-3">⚠️ Duplicate Invoice Detected</p>
      <div className="grid grid-cols-2 gap-4 font-mono text-sm mb-4">
        <div className="border-[2px] border-ink p-3 bg-white">
          <p className="text-xs text-ink/50 uppercase mb-1">This upload</p>
          <p className="font-bold">{invoice.vendor_name || "—"}</p>
          <p>₹{invoice.amount ? Number(invoice.amount).toLocaleString("en-IN") : "—"}</p>
          <p className="text-xs text-ink/40">Invoice #{invoice.invoice_number || "—"}</p>
          <p className="text-xs text-ink/40">{invoice.uploaded_at?.slice(0, 10)}</p>
        </div>
        <div className="border-[2px] border-ink p-3 bg-white">
          <p className="text-xs text-ink/50 uppercase mb-1">Original (existing)</p>
          <p className="font-bold">{duplicate.vendor_name || "—"}</p>
          <p>₹{duplicate.amount ? Number(duplicate.amount).toLocaleString("en-IN") : "—"}</p>
          <p className="text-xs text-ink/40">Invoice #{duplicate.invoice_number || "—"}</p>
          <p className="text-xs text-ink/40">{duplicate.uploaded_at?.slice(0, 10)}</p>
        </div>
      </div>
      <button
        onClick={handleOverride}
        disabled={overriding}
        className="nb-btn bg-white px-4 py-2 font-mono text-xs font-bold border-[2px] border-ink"
      >
        {overriding ? "Overriding…" : "This is not a duplicate — proceed anyway"}
      </button>
    </motion.div>
  );
}

// ─── Invoice Detail (expandable row) ─────────────────────────────────────────
function InvoiceDetail({ invoice, transactions, onRefresh }) {
  const [matchResult, setMatchResult] = useState(null);
  const [selectedTx, setSelectedTx] = useState(invoice.matched_transaction_id || "");
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState(null);

  const vendorTxs = transactions.filter(
    t => !invoice.vendor_name || t.vendor?.toLowerCase() === invoice.vendor_name?.toLowerCase()
  );
  const allTxs = vendorTxs.length > 0 ? vendorTxs : transactions;

  async function handleMatch(txId) {
    setMatching(true);
    setMatchError(null);
    try {
      const res = await matchInvoice(invoice.id, txId || null);
      setMatchResult(res);
      onRefresh();
    } catch (e) {
      setMatchError(e.message);
    } finally {
      setMatching(false);
    }
  }

  const result = matchResult;
  const hasMismatch = invoice.status === "AMOUNT_MISMATCH";
  const isMatched = invoice.status === "OK";
  const delta = invoice.amount_delta;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22 }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-3 border-t-[2px] border-ink/20 flex flex-col gap-4">
        {/* Amount mismatch alert */}
        {hasMismatch && delta !== null && (
          <div className="border-[3px] border-ink p-3" style={{ backgroundColor: "#ff5c5c", boxShadow: "4px 4px 0px #0a0a0a" }}>
            <p className="font-display font-bold text-white">🔴 Amount Mismatch</p>
            <p className="font-mono text-sm text-white mt-1">
              Invoice: ₹{Number(invoice.amount).toLocaleString("en-IN")} vs Payment: ₹{Number(invoice.tx_amount || 0).toLocaleString("en-IN")}
              {" "}— ₹{Number(delta).toLocaleString("en-IN")} mismatch
            </p>
          </div>
        )}

        {/* Match confirmation */}
        {isMatched && (
          <div className="border-[3px] border-ink p-3" style={{ backgroundColor: "#7ee787", boxShadow: "4px 4px 0px #0a0a0a" }}>
            <p className="font-display font-bold">✅ Matches Payment</p>
            <p className="font-mono text-sm mt-1">Invoice amount aligns with the matched transaction.</p>
          </div>
        )}

        {/* Transaction matcher */}
        {!isMatched && !hasMismatch && (
          <div>
            <p className="font-mono text-xs text-ink/50 uppercase mb-2">Link to Transaction</p>
            <div className="flex gap-2 flex-wrap">
              <select
                value={selectedTx}
                onChange={e => setSelectedTx(e.target.value)}
                className="border-[3px] border-ink px-3 py-2 font-mono text-xs bg-paper focus:outline-none flex-1 min-w-0"
              >
                <option value="">— select a transaction —</option>
                {allTxs.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.vendor} · ₹{Number(t.amount).toLocaleString("en-IN")} · {t.created_at?.slice(0, 10)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleMatch(selectedTx)}
                disabled={matching}
                className="nb-btn bg-accent px-4 py-2 font-mono text-xs font-bold"
              >
                {matching ? "Matching…" : "Match →"}
              </button>
              <button
                onClick={() => handleMatch(null)}
                disabled={matching}
                className="nb-btn bg-paper px-3 py-2 font-mono text-xs"
              >
                Auto-match
              </button>
            </div>
            {matchError && <p className="font-mono text-xs text-danger mt-2">⚠️ {matchError}</p>}
          </div>
        )}

        {/* Raw fields */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-xs">
          {[
            ["Invoice #", invoice.invoice_number],
            ["Vendor", invoice.vendor_name],
            ["Amount", invoice.amount ? `₹${Number(invoice.amount).toLocaleString("en-IN")}` : null],
            ["Invoice Date", invoice.invoice_date],
            ["Due Date", invoice.due_date],
            ["Uploaded", invoice.uploaded_at?.slice(0, 10)],
            ["File", invoice.original_name],
          ].map(([label, val]) => (
            <div key={label} className="border-[2px] border-ink/20 p-2">
              <p className="text-ink/40 uppercase text-[10px]">{label}</p>
              <p className="font-bold truncate">{val || "—"}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Invoice Row ──────────────────────────────────────────────────────────────
function InvoiceRow({ invoice, index, expanded, onToggle, transactions, onRefresh }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="nb-panel p-4"
    >
      <button
        className="w-full text-left flex flex-col md:flex-row md:items-center justify-between gap-3"
        onClick={onToggle}
      >
        <div>
          <p className="font-display font-bold">{invoice.vendor_name || "Unknown Vendor"}</p>
          <p className="font-mono text-sm text-ink/60">
            {invoice.amount ? `₹${Number(invoice.amount).toLocaleString("en-IN")}` : "Amount unknown"}
            {invoice.invoice_number ? ` · #${invoice.invoice_number}` : ""}
          </p>
          <p className="font-mono text-xs text-ink/40">
            {invoice.original_name} · {invoice.uploaded_at?.slice(0, 10)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={invoice.status} />
          <span className="font-mono text-xs text-ink/40">
            {expanded ? "▲ collapse" : "▼ details"}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <InvoiceDetail
            invoice={invoice}
            transactions={transactions}
            onRefresh={onRefresh}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const [invoices, setInvoices]         = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState(null);
  const [pending, setPending]           = useState(null);   // { invoice, duplicate }
  const [expandedId, setExpandedId]     = useState(null);

  const load = useCallback(async () => {
    try {
      const [inv, tx] = await Promise.all([getInvoices(), getTransactions()]);
      setInvoices(Array.isArray(inv) ? inv : []);
      setTransactions(Array.isArray(tx) ? tx : []);
    } catch (e) {
      console.error("Failed to load invoices:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file) {
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadInvoice(file);
      setPending(result);
      await load();
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveFields(fields) {
    if (!pending?.invoice?.id) return;
    const result = await updateInvoice(pending.invoice.id, fields);
    setPending(prev => ({ ...prev, invoice: result.invoice, duplicate: result.duplicate }));
    await load();
  }

  async function handleOverride() {
    if (!pending?.invoice?.id) return;
    await overrideDuplicate(pending.invoice.id);
    setPending(prev => ({ ...prev, duplicate: null }));
    await load();
  }

  function handleToggle(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  // Stats
  const stats = {
    total: invoices.length,
    ok: invoices.filter(i => i.status === "OK").length,
    dup: invoices.filter(i => i.status === "DUPLICATE_WARNING").length,
    mismatch: invoices.filter(i => i.status === "AMOUNT_MISMATCH").length,
  };

  return (
    <main className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="nb-panel p-6 mb-8"
      >
        <h1 className="text-3xl font-display font-bold">📄 Invoices</h1>
        <p className="font-mono text-sm text-ink/60 mt-1">
          Invoice parsing, duplicate detection, and invoice/payment mismatch checks.
        </p>
        {!loading && invoices.length > 0 && (
          <div className="flex gap-4 mt-3 font-mono text-xs text-ink/50 flex-wrap">
            <span>{stats.total} total</span>
            <span className="text-safe">· {stats.ok} matched</span>
            {stats.dup > 0 && <span className="text-warn">· {stats.dup} duplicate warnings</span>}
            {stats.mismatch > 0 && <span className="text-danger">· {stats.mismatch} mismatches</span>}
          </div>
        )}
      </motion.div>

      {/* Upload Zone */}
      <section className="mb-8">
        <h2 className="font-display font-bold text-xl mb-4">📤 Upload Invoice</h2>
        <UploadZone onUpload={handleUpload} uploading={uploading} />
        {uploadError && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono text-sm text-danger mt-2"
          >
            ⚠️ {uploadError}
          </motion.p>
        )}

        <AnimatePresence>
          {pending && (
            <div className="mt-4">
              {pending.duplicate && (
                <DuplicateWarning
                  invoice={pending.invoice}
                  duplicate={pending.duplicate}
                  onOverride={handleOverride}
                />
              )}
              <FieldConfirmForm
                invoice={pending.invoice}
                onSave={handleSaveFields}
                onCancel={() => setPending(null)}
              />
            </div>
          )}
        </AnimatePresence>
      </section>

      {/* Invoice list */}
      <section>
        <h2 className="font-display font-bold text-xl mb-4">🗂️ All Invoices</h2>

        {loading && (
          <div className="nb-panel p-6 font-mono text-sm text-ink/60 animate-pulse">
            Loading invoices…
          </div>
        )}

        {!loading && invoices.length === 0 && (
          <div className="nb-panel p-8 text-center font-mono text-sm text-ink/60">
            <p className="text-3xl mb-3">📭</p>
            <p>No invoices yet — upload one above to get started.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {invoices.map((inv, i) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              index={i}
              expanded={expandedId === inv.id}
              onToggle={() => handleToggle(inv.id)}
              transactions={transactions}
              onRefresh={load}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
