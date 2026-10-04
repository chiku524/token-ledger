/**
 * Shared, email-client-safe HTML layout for transactional mail.
 * Tables + inline CSS only — no JS, web fonts, or external stylesheets.
 * Brand colours match docs/design-system (Cobalt / Lime / Cloud / Night).
 */

/** Design-system hex values inlined for clients that strip <style>. */
export const emailBrand = {
  cobalt: "#2140E6",
  lime: "#C8F542",
  onLime: "#0C0F1F",
  night: "#0C0F1F",
  inkSoft: "#5C6578",
  cloud: "#F7F8FC",
  paper: "#FFFFFF",
  line: "#E3E6EF",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailCta {
  label: string;
  href: string;
}

export interface EmailLayoutInput {
  /** Hidden preview text some clients show next to the subject. */
  preheader: string;
  eyebrow?: string;
  heading: string;
  paragraphs: string[];
  cta: EmailCta;
  /** Extra notice under the button (expiry, once-use, etc.). */
  notices?: string[];
  ignoreNote: string;
}

function ctaButton(cta: EmailCta): string {
  const href = escapeHtml(cta.href);
  const label = escapeHtml(cta.label);
  return [
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">`,
    `<tr>`,
    `<td style="border-radius:10px;background:${emailBrand.lime};">`,
    `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:1.2;color:${emailBrand.onLime};text-decoration:none;border-radius:10px;">${label}</a>`,
    `</td>`,
    `</tr>`,
    `</table>`,
  ].join("");
}

/**
 * Wrap body content in a light, branded shell. Paragraphs may include trusted
 * HTML (callers must escape user-controlled strings first).
 */
export function emailLayout(input: EmailLayoutInput): string {
  const preheader = escapeHtml(input.preheader);
  const heading = escapeHtml(input.heading);
  const eyebrow = input.eyebrow ? escapeHtml(input.eyebrow) : null;
  const notices = (input.notices ?? []).map((note) => escapeHtml(note));
  const ignoreNote = escapeHtml(input.ignoreNote);
  const linkHref = escapeHtml(input.cta.href);

  const paragraphHtml = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:${emailBrand.night};">${p}</p>`,
    )
    .join("");

  const noticeHtml =
    notices.length === 0
      ? ""
      : `<p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${emailBrand.inkSoft};">${notices.join("<br />")}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${emailBrand.cloud};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${emailBrand.cloud};">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:${emailBrand.paper};border:1px solid ${emailBrand.line};border-radius:16px;overflow:hidden;">
<tr>
<td style="height:6px;background:${emailBrand.cobalt};font-size:0;line-height:0;">&nbsp;</td>
</tr>
<tr>
<td style="padding:32px 32px 8px;">
<p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${emailBrand.cobalt};">Token Ledger</p>
${eyebrow ? `<p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.4;color:${emailBrand.inkSoft};">${eyebrow}</p>` : ""}
<h1 style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.25;color:${emailBrand.night};">${heading}</h1>
${paragraphHtml}
</td>
</tr>
<tr>
<td align="center" style="padding:8px 32px 8px;">
${ctaButton(input.cta)}
</td>
</tr>
<tr>
<td style="padding:8px 32px 28px;">
${noticeHtml}
<p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${emailBrand.inkSoft};">
Or paste this link into your browser:<br />
<a href="${linkHref}" style="color:${emailBrand.cobalt};word-break:break-all;">${linkHref}</a>
</p>
<p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${emailBrand.inkSoft};">${ignoreNote}</p>
</td>
</tr>
<tr>
<td style="padding:20px 32px;border-top:1px solid ${emailBrand.line};background:${emailBrand.cloud};">
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${emailBrand.inkSoft};">
— Token Ledger<br />
This is an automated message; replies are not read.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

export function signatureText(): string {
  return "\n\n— Token Ledger\nThis is an automated message; replies are not read.";
}
