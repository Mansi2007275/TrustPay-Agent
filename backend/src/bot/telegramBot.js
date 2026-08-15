// Human-in-the-loop escalation. Adapted from AgentPager's approval bot.
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { db } from "../db/init.js";
import { logAuditEvent } from "../utils/audit.js";
import { updateVendorAfterTransaction } from "../utils/vendorHistory.js";
dotenv.config();

let bot;

const isRealToken = (t) => !!t && t !== "your_telegram_bot_token_here";

export function startBot() {
  if (!isRealToken(process.env.TELEGRAM_BOT_TOKEN)) {
    console.warn("TELEGRAM_BOT_TOKEN not set — running in MOCK MODE (approvals will log to console instead of Telegram).");
    return;
  }
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on("callback_query", async (query) => {
    try {
      const [action, transactionId] = query.data.split(":"); // "approve:tx_123"
      const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(transactionId);

      if (!tx) {
        await bot.answerCallbackQuery(query.id, { text: "Transaction not found." });
        return;
      }

      if (tx.status !== "PENDING") {
        await bot.answerCallbackQuery(query.id, { text: `Already ${tx.status.toLowerCase()}.` });
        return;
      }

      const status = action === "approve" ? "EXECUTED" : "REJECTED";
      db.prepare("UPDATE transactions SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(status, transactionId);
      updateVendorAfterTransaction(tx.vendor_id, tx.amount, action !== "approve");
      logAuditEvent(transactionId, action === "approve" ? "approved" : "rejected", `Resolved via Telegram by approver`);

      const emoji = action === "approve" ? "✅" : "❌";
      await bot.answerCallbackQuery(query.id, { text: `${emoji} Transaction ${status.toLowerCase()}!` });
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      });
      await bot.sendMessage(query.message.chat.id, `${emoji} *${status}* — Transaction resolved.`, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("Telegram callback error:", err.message);
      await bot.answerCallbackQuery(query.id, { text: "Error processing action." });
    }
  });

  console.log("Telegram bot started ✅");
}

export async function sendApprovalRequest(transaction, customChatId) {
  const chatId = customChatId || process.env.TELEGRAM_APPROVER_CHAT_ID;
  if (!bot) {
    console.log(`\n[MOCK TELEGRAM] Approval needed for ${transaction.vendor} — ₹${transaction.amount} (risk ${transaction.riskScore}/100) — Routed to Chat ID: ${chatId}`);
    console.log(`[MOCK TELEGRAM] Reason: ${transaction.reasoning}\n`);
    return;
  }

  const text = `
🚨 *TRUSTPAY APPROVAL NEEDED*

Amount: ₹${transaction.amount}
Vendor: ${transaction.vendor}
Invoice: ${transaction.invoiceNumber}

*Risk Score:* ${transaction.riskScore}/100

*Why?*
${transaction.reasoning}

Recommendation: ${transaction.riskScore > 60 ? "❌ Do not auto-execute" : "⚠️ Review before proceeding"}
`;

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Approve", callback_data: `approve:${transaction.id}` },
        { text: "❌ Reject", callback_data: `reject:${transaction.id}` },
      ]],
    },
  });
}
