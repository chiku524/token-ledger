import { describe, expect, it } from "vitest";
import { billingExitSteps, treasuryExitSteps } from "./exit-client";

const PROGRAM = "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb";
const ADMIN = "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp";

describe("billingExitSteps", () => {
  it("names the revoke then withdraw instructions with the derived PDAs", async () => {
    const steps = await billingExitSteps({ programId: PROGRAM, merchant: ADMIN, controller: ADMIN });
    expect(steps.map((step) => step.instruction)).toEqual(["revoke_mandate", "withdraw"]);
    expect(steps[1]!.accounts.find((a) => a.name === "vault")!.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(steps[1]!.description).toMatch(/no merchant signature/i);
  });
});

describe("treasuryExitSteps", () => {
  it("names the emergency exit and derives the treasury PDAs", async () => {
    const steps = await treasuryExitSteps({ programId: PROGRAM, entity: ADMIN });
    expect(steps[0]!.instruction).toBe("execute_emergency_exit");
    expect(steps[0]!.accounts.find((a) => a.name === "treasury")!.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});
