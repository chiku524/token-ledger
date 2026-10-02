/**
 * Message builders. Pure: given a link and a few labels, produce the subject and
 * body. Keeping them here means a flow shares one wording and a test can assert
 * the link is present without a provider.
 */
import type { EmailMessage } from "./provider";

export interface EmailContext {
  to: string;
  link: string;
  organizationName: string;
  inviterName?: string;
  expiresInDays?: number;
}

function signature(): string {
  return "\n\n— Token Ledger\nThis is an automated message; replies are not read.";
}

export function inviteEmail(context: EmailContext): EmailMessage {
  const days = context.expiresInDays ?? 7;
  const who = context.inviterName ? `${context.inviterName} invited you` : "You have been invited";
  return {
    to: context.to,
    subject: `Join ${context.organizationName} on Token Ledger`,
    text: `${who} to ${context.organizationName} on Token Ledger.\n\nSet your password to join:\n${context.link}\n\nThis link expires in ${days} day${days === 1 ? "" : "s"} and can be used once.${signature()}`,
  };
}

export function resetEmail(context: EmailContext): EmailMessage {
  const minutes = context.expiresInDays ?? 60;
  return {
    to: context.to,
    subject: "Reset your Token Ledger password",
    text: `A password reset was requested for your Token Ledger account.\n\nSet a new password:\n${context.link}\n\nThis link expires in ${minutes} minute${minutes === 1 ? "" : "s"} and can be used once. If you did not ask for this, you can ignore this email.${signature()}`,
  };
}

export function verifyEmail(context: EmailContext): EmailMessage {
  return {
    to: context.to,
    subject: "Confirm your Token Ledger email",
    text: `Confirm this email address for your Token Ledger account, ${context.organizationName}.\n\nConfirm:\n${context.link}\n\nIf you did not create this account, you can ignore this email.${signature()}`,
  };
}
