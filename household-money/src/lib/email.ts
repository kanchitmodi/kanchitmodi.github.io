import { env, isSet } from "./env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(msg: OutgoingEmail): Promise<{ delivered: boolean; via: string }>;
}

/** Dev / unconfigured: log to the server console (the invite link is also shown in the UI). */
export const consoleSender: EmailSender = {
  async send(msg) {
    console.info(`[email] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return { delivered: false, via: "console" };
  },
};

/** Resend HTTP API — no SDK dependency. */
export function resendSender(apiKey: string, from: string): EmailSender {
  return {
    async send(msg) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
      });
      if (!res.ok) throw new Error(`Email send failed: ${res.status}`);
      return { delivered: true, via: "resend" };
    },
  };
}

export function emailSender(): EmailSender {
  const e = env();
  return isSet(e.RESEND_API_KEY) ? resendSender(e.RESEND_API_KEY, e.EMAIL_FROM) : consoleSender;
}
