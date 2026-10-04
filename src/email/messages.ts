/**
 * Message builders. Pure: given a link and a few labels, produce the subject and
 * body. Keeping them here means a flow shares one wording and a test can assert
 * the link is present without a provider.
 */
import { emailLayout, escapeHtml, signatureText } from "./layout";
import type { EmailMessage } from "./provider";

export interface EmailContext {
  to: string;
  link: string;
  organizationName: string;
  inviterName?: string;
  expiresInDays?: number;
}

function dayLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function inviteEmail(context: EmailContext): EmailMessage {
  const days = context.expiresInDays ?? 7;
  const org = context.organizationName;
  const who = context.inviterName
    ? `${context.inviterName} invited you to join ${org}`
    : `You've been invited to join ${org}`;
  const whoHtml = context.inviterName
    ? `<strong>${escapeHtml(context.inviterName)}</strong> invited you to join <strong>${escapeHtml(org)}</strong>`
    : `You've been invited to join <strong>${escapeHtml(org)}</strong>`;

  const text = [
    "Hi there,",
    "",
    `${who} on Token Ledger.`,
    "",
    "Accept the invitation and set your password here:",
    context.link,
    "",
    `This link expires in ${dayLabel(days)} and can be used once. If you weren't expecting this invite, you can ignore this email.`,
  ].join("\n") + signatureText();

  const html = emailLayout({
    preheader: `${who} on Token Ledger. Set your password to get started.`,
    eyebrow: "Team invitation",
    heading: "You're invited 👋",
    paragraphs: [
      `${whoHtml} on Token Ledger — we're glad you're here.`,
      "Accept the invitation below to set your password and join the team.",
    ],
    cta: { label: "Accept invitation", href: context.link },
    notices: [`This link expires in ${dayLabel(days)} and can be used once.`],
    ignoreNote: "If you weren't expecting this invite, you can ignore this email.",
  });

  return {
    to: context.to,
    subject: `You're invited to ${org} on Token Ledger 👋`,
    text,
    html,
  };
}

export function resetEmail(context: EmailContext): EmailMessage {
  const minutes = context.expiresInDays ?? 60;
  return {
    to: context.to,
    subject: "Reset your Token Ledger password",
    text: `A password reset was requested for your Token Ledger account.\n\nSet a new password:\n${context.link}\n\nThis link expires in ${minutes} minute${minutes === 1 ? "" : "s"} and can be used once. If you did not ask for this, you can ignore this email.${signatureText()}`,
  };
}

export function verifyEmail(context: EmailContext): EmailMessage {
  const org = context.organizationName;
  const text = [
    "Welcome to Token Ledger!",
    "",
    `Please confirm this email address for your ${org} account so we know it's really you.`,
    "",
    "Confirm your email:",
    context.link,
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n") + signatureText();

  const html = emailLayout({
    preheader: `Confirm your email for ${org} on Token Ledger.`,
    eyebrow: "Email confirmation",
    heading: "Confirm your email ✉️",
    paragraphs: [
      `Welcome to Token Ledger! Please confirm this address for your <strong>${escapeHtml(org)}</strong> account so we know it's really you.`,
      "It only takes a moment — tap the button below.",
    ],
    cta: { label: "Confirm email", href: context.link },
    ignoreNote: "If you did not create this account, you can ignore this email.",
  });

  return {
    to: context.to,
    subject: "Confirm your Token Ledger email ✉️",
    text,
    html,
  };
}
