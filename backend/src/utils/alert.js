'use strict';

// Alerting (spec 13.3): reuse the Telegram bot already running on the VPS
// rather than standing up a second alerting path.
//
// Alerts are best-effort and deliberately rate-limited: a full disk fires the
// same alert every five minutes otherwise, and an alert channel that cries wolf
// is one nobody reads.

const RESEND_INTERVAL_MS = 30 * 60 * 1000;
const SEND_TIMEOUT_MS = 5000;

function createAlerter({ logger, env = process.env, fetchImpl = globalThis.fetch }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const lastSentAt = new Map();

  async function send(key, message) {
    const now = Date.now();
    if (now - (lastSentAt.get(key) || 0) < RESEND_INTERVAL_MS) return false;
    lastSentAt.set(key, now);

    logger.warn('alert', { key, message });
    if (!token || !chatId) return false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `[FileForge] ${message}` }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      return true;
    } catch (err) {
      logger.error('alert delivery failed', { key, error: err.message });
      return false;
    }
  }

  return { send };
}

module.exports = { createAlerter, RESEND_INTERVAL_MS };
