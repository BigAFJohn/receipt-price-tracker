import { describe, expect, it } from "vitest";
import { SignUpInputSchema, signUpErrorMessage, type SignUpInput } from "./signup-input";

const valid: SignUpInput = {
  email: " Friend@Example.com ",
  password: "long enough",
  inviteCode: " ZOMER-2026 ",
  consent: true,
};

const firstError = (input: SignUpInput) => {
  const result = SignUpInputSchema.safeParse(input);
  return result.success ? null : result.error.issues[0]?.message;
};

describe("SignUpInputSchema", () => {
  it("tidies the email and the code", () => {
    const parsed = SignUpInputSchema.parse(valid);
    expect(parsed.email).toBe("friend@example.com");
    expect(parsed.inviteCode).toBe("ZOMER-2026");
  });

  it.each([
    [{ email: "not an email" }, "Enter a valid email address"],
    [{ password: "short" }, "Choose a password of at least 8 characters"],
    [{ inviteCode: "  " }, "Enter your invite code"],
    [{ consent: false as unknown as true }, "Tick the box to confirm you've read how your receipts are used"],
  ])("rejects %o", (change, message) => {
    expect(firstError({ ...valid, ...change })).toBe(message);
  });
});

describe("signUpErrorMessage", () => {
  it.each([
    [{ message: "That invite code isn't valid.", status: 403 }, "That invite code isn't valid."],
    [{ code: "user_already_exists", message: "User already registered" }, "An account with this email already exists. Sign in instead."],
    [{ code: "signup_disabled", message: "Signups not allowed for this instance" }, "Sign-up is closed right now."],
    [{ status: 429, message: "rate limit" }, "Too many attempts. Wait a few minutes and try again."],
    [{ message: "something else" }, "Sign-up didn't work. Try again in a moment."],
  ])("explains %o", (error, message) => {
    expect(signUpErrorMessage(error)).toBe(message);
  });
});
