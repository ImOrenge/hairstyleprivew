import PostalMime, { type Address, type Attachment } from "postal-mime";

interface Env {
  APP_INBOUND_EMAIL_URL: string;
  INBOUND_EMAIL_SECRET: string;
  INBOUND_FALLBACK_EMAIL?: string;
}

interface EmailAddressLike {
  name?: string;
  address?: string;
  group?: EmailAddressLike[];
}

function formatAddress(address: Address | EmailAddressLike | undefined): string {
  if (!address) {
    return "";
  }

  const value = address as EmailAddressLike;
  if (value.group?.length) {
    return value.group.map((member) => formatAddress(member)).filter(Boolean).join(", ");
  }

  if (!value.address) {
    return "";
  }

  return value.name ? `${value.name} <${value.address}>` : value.address;
}

function formatAddresses(addresses: Address[] | undefined) {
  return (addresses || []).map(formatAddress).filter(Boolean);
}

function attachmentSize(attachment: Attachment) {
  const content = attachment.content;
  if (typeof content === "string") {
    return content.length;
  }
  return content.byteLength;
}

function buildPreview(text: string, html: string) {
  const source = text || html.replace(/<[^>]+>/g, " ");
  return source.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function forwardOrReject(message: ForwardableEmailMessage, env: Env, reason: string) {
  if (env.INBOUND_FALLBACK_EMAIL) {
    await message.forward(env.INBOUND_FALLBACK_EMAIL);
    return;
  }

  message.setReject(reason);
}

export default {
  async email(message, env): Promise<void> {
    if (!env.APP_INBOUND_EMAIL_URL || !env.INBOUND_EMAIL_SECRET) {
      await forwardOrReject(message, env, "Inbound email endpoint is not configured");
      return;
    }

    const rawBuffer = await new Response(message.raw).arrayBuffer();

    try {
      const parsed = await PostalMime.parse(rawBuffer, {
        attachmentEncoding: "arraybuffer",
      });
      const text = parsed.text || "";
      const html = parsed.html || "";
      const payload = {
        provider: "cloudflare",
        messageId: parsed.messageId || message.headers.get("message-id") || null,
        envelope: {
          from: message.from,
          to: message.to,
        },
        headers: {
          from: formatAddress(parsed.from) || message.headers.get("from") || "",
          to: formatAddresses(parsed.to),
          messageId: parsed.messageId || message.headers.get("message-id") || null,
          inReplyTo: parsed.inReplyTo || message.headers.get("in-reply-to") || null,
          references: parsed.references || message.headers.get("references") || "",
        },
        subject: parsed.subject || message.headers.get("subject") || "",
        text,
        html,
        bodyPreview: buildPreview(text, html),
        attachments: (parsed.attachments || []).map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.mimeType,
          disposition: attachment.disposition,
          contentId: attachment.contentId || null,
          size: attachmentSize(attachment),
        })),
        rawSize: message.rawSize,
        receivedAt: new Date().toISOString(),
      };

      const response = await fetch(env.APP_INBOUND_EMAIL_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hairfit-inbound-secret": env.INBOUND_EMAIL_SECRET,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        await forwardOrReject(message, env, `Inbound email API failed with ${response.status}`);
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown inbound email error";
      await forwardOrReject(message, env, messageText);
    }
  },
} satisfies ExportedHandler<Env>;
