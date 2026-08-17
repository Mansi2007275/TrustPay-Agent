# TrustPay Agent — Project Questionnaire

**1. What does your application/service do?**
TrustPay Agent is a human-in-the-loop trust layer for AI payment agents. It automatically approves low-risk transactions, but routes uncertain or high-risk payment decisions to a human via Telegram for real-time, one-tap approval — combining AI speed with human judgment to prevent fraud in autonomous agent payments.

**2. Who is the target audience?**
Developers and businesses building AI agents that need to make or approve payments autonomously — e.g., agentic commerce platforms, AI-driven procurement tools, subscription/vendor payment automation, and agent-to-agent micropayment systems that need a safety layer before granting agents real spending power.

**3. Which countries are the expected buyers of this service?**
Primarily the US, India, and other markets with active AI/fintech and agentic-commerce ecosystems — anywhere teams are building or deploying autonomous AI agents that handle payments and need built-in fraud prevention.

**4. Who are your competitors?**
General AI agent frameworks (LangChain, AutoGPT-style agents) that lack a built-in approval/trust layer, and traditional fraud-detection/payment-approval tools (e.g., Stripe Radar) that aren't designed for AI-agent-initiated transactions or human-in-the-loop Telegram-based approval.

**5. What is your advantage?**
Unlike systems that force a choice between full automation (risky) or full manual approval (slow), TrustPay Agent does risk-based routing: safe transactions go through instantly, risky ones get a real human decision in seconds via Telegram — no dashboard, no login, just a tap. This makes it fast to deploy and genuinely usable in production, not just a demo concept.
