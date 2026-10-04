import { describe, expect, it, vi } from "vitest";
import {
  EmailError,
  NoopEmailProvider,
  ResendEmailProvider,
  sendEmail,
  type EmailProvider,
} from "./provider";
import { inviteEmail, resetEmail, verifyEmail } from "./messages";

function okResponse(): Response {
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

describe("sendEmail", () => {
  const message = { to: "a@x.com", subject: "Hi", text: "Hello" };

  it("reports not-configured and does not call the provider", async () => {
    const provider = new NoopEmailProvider();
    const sendSpy = vi.spyOn(provider, "send");
    const result = await sendEmail(message, { provider });
    expect(result).toMatchObject({ sent: false, provider: "none" });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("sends once on success", async () => {
    const provider: EmailProvider = { name: "test", configured: true, send: vi.fn(async () => {}) };
    const result = await sendEmail(message, { provider });
    expect(result.sent).toBe(true);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable failure then succeeds", async () => {
    let calls = 0;
    const provider: EmailProvider = {
      name: "test",
      configured: true,
      send: vi.fn(async () => {
        calls += 1;
        if (calls < 2) throw new EmailError("temporary", { retryable: true });
      }),
    };
    const sleep = vi.fn(async () => {});
    const result = await sendEmail(message, { provider, sleep });
    expect(result.sent).toBe(true);
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry a permanent failure and reports the reason", async () => {
    const provider: EmailProvider = {
      name: "test",
      configured: true,
      send: vi.fn(async () => {
        throw new EmailError("The email service returned HTTP 422.", { httpStatus: 422, retryable: false });
      }),
    };
    const sleep = vi.fn(async () => {});
    const result = await sendEmail(message, { provider, sleep });
    expect(result.sent).toBe(false);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after the retry budget", async () => {
    const provider: EmailProvider = {
      name: "test",
      configured: true,
      send: vi.fn(async () => {
        throw new EmailError("temporary", { retryable: true });
      }),
    };
    const result = await sendEmail(message, { provider, sleep: async () => {} });
    expect(result.sent).toBe(false);
    expect(provider.send).toHaveBeenCalledTimes(3);
  });
});

describe("ResendEmailProvider", () => {
  it("posts the message with the bearer key and from address", async () => {
    const fetchImpl = vi.fn(async () => okResponse()) as unknown as typeof fetch;
    const provider = new ResendEmailProvider({ apiKey: "key", from: { email: "books@x.com", name: "Token Ledger" }, fetchImpl });
    await provider.send({ to: "a@x.com", subject: "Hi", text: "Hello" });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(call[1].body as string);
    expect(call[1].headers.Authorization).toBe("Bearer key");
    expect(body.from).toBe("Token Ledger <books@x.com>");
    expect(body.to).toBe("a@x.com");
  });
});

describe("message builders", () => {
  it("includes the link, expiry, CTA, and inviter in the invite", () => {
    const message = inviteEmail({
      to: "a@x.com",
      link: "/sign-in?invite=tok",
      organizationName: "Acme",
      inviterName: "Nico",
      expiresInDays: 7,
    });
    expect(message.subject).toContain("Acme");
    expect(message.subject).toContain("👋");
    expect(message.text).toContain("/sign-in?invite=tok");
    expect(message.text).toContain("expires in 7 days");
    expect(message.text).toContain("Nico invited you");
    expect(message.text).toContain("weren't expecting this invite");
    expect(message.html).toBeDefined();
    expect(message.html).toContain("Accept invitation");
    expect(message.html).toContain('href="/sign-in?invite=tok"');
    expect(message.html).toContain("Nico");
    expect(message.html).toContain("Acme");
    expect(message.html).toContain("#C8F542");
    expect(message.html).toContain("#2140E6");
  });

  it("escapes user-controlled names in invite HTML", () => {
    const message = inviteEmail({
      to: "a@x.com",
      link: "https://app.example/invite",
      organizationName: '<Acme & Co>',
      inviterName: 'Nico<script>alert(1)</script>',
      expiresInDays: 1,
    });
    expect(message.html).toContain("&lt;Acme &amp; Co&gt;");
    expect(message.html).toContain("Nico&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.html).not.toContain("<script>alert(1)</script>");
  });

  it("includes the link in the reset and a branded verify message", () => {
    expect(resetEmail({ to: "a@x.com", link: "/reset?token=t", organizationName: "Acme", expiresInDays: 60 }).text).toContain("/reset?token=t");
    const verify = verifyEmail({ to: "a@x.com", link: "/verify?token=v", organizationName: "Acme" });
    expect(verify.subject).toContain("✉️");
    expect(verify.text).toContain("/verify?token=v");
    expect(verify.text).toContain("Welcome to Token Ledger");
    expect(verify.text).toContain("ignore this email");
    expect(verify.html).toBeDefined();
    expect(verify.html).toContain("Confirm email");
    expect(verify.html).toContain('href="/verify?token=v"');
    expect(verify.html).toContain("Acme");
  });
});
