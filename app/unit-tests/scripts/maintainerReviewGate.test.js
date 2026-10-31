// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi } from "vitest";
import { approvalState, issueApprovalState } from "../../../scripts/maintainer-review-gate.mjs";
import { ALLOWED_LOGINS, OPERATOR_LOGIN } from "../../../scripts/issue-agent-allowlist.mjs";

const OPERATOR = "antonycc";
const labeled = (login) => ({ event: "labeled", label: { name: "maintainer-review" }, actor: { login } });
const unlabeled = (login) => ({ event: "unlabeled", label: { name: "maintainer-review" }, actor: { login } });
const ev = (event, name, login) => ({ event, label: { name }, actor: { login } });
const state = (labels, events) => approvalState({ labels, events, operatorLogin: OPERATOR });

describe("maintainer review gate", () => {
  it("names the operator login from the allow list", () => {
    expect(OPERATOR_LOGIN).toBe(OPERATOR);
    expect(ALLOWED_LOGINS).toContain(OPERATOR_LOGIN);
  });

  it("is pending while the label is present", () => {
    expect(state(["support", "maintainer-review"], [labeled("diyaccounting-ops[bot]")])).toBe("pending");
  });

  it("is not approved when the agent App removed the label", () => {
    expect(state(["support"], [labeled("diyaccounting-ops[bot]"), unlabeled("diyaccounting-agent[bot]")])).toBe("not-approved");
  });

  it("is not approved when the ops App removed the label", () => {
    expect(state(["support"], [labeled("diyaccounting-ops[bot]"), unlabeled("diyaccounting-ops[bot]")])).toBe("not-approved");
  });

  it("is pending when the operator removed the label and it was put back", () => {
    const events = [labeled("diyaccounting-ops[bot]"), unlabeled(OPERATOR), labeled("diyaccounting-agent[bot]")];
    expect(state(["support", "maintainer-review"], events)).toBe("pending");
  });

  it("is not approved when the operator removed the label and a bot put it back and removed it again", () => {
    const events = [labeled("a"), unlabeled(OPERATOR), labeled("diyaccounting-agent[bot]"), unlabeled("diyaccounting-agent[bot]")];
    expect(state(["support"], events)).toBe("not-approved");
  });

  it("is approved when the operator removed the label", () => {
    expect(state(["support"], [labeled("diyaccounting-ops[bot]"), unlabeled(OPERATOR)])).toBe("approved");
  });

  it("is approved when the operator removed the label and the issue never showed who added it", () => {
    expect(state(["support"], [unlabeled("AntonyCC")])).toBe("approved");
  });

  it("is not approved when the label never appeared", () => {
    expect(state(["support"], [])).toBe("not-approved");
  });

  it("ignores events about other labels", () => {
    const other = { event: "unlabeled", label: { name: "support" }, actor: { login: OPERATOR } };
    expect(state([], [labeled("diyaccounting-ops[bot]"), other])).toBe("not-approved");
  });

  describe("injection-suspected", () => {
    it("is pending while the label is present, even after the operator removed maintainer-review", () => {
      const events = [labeled("a"), ev("labeled", "injection-suspected", "diyaccounting-agent[bot]"), unlabeled(OPERATOR)];
      expect(state(["support", "injection-suspected"], events)).toBe("pending");
    });

    it("is approved when the operator removed both labels", () => {
      const events = [
        labeled("a"),
        ev("labeled", "injection-suspected", "diyaccounting-agent[bot]"),
        unlabeled(OPERATOR),
        ev("unlabeled", "injection-suspected", OPERATOR),
      ];
      expect(state(["support"], events)).toBe("approved");
    });

    it("is not approved when a bot removed the injection label", () => {
      const events = [
        labeled("a"),
        ev("labeled", "injection-suspected", "diyaccounting-agent[bot]"),
        ev("unlabeled", "injection-suspected", "diyaccounting-agent[bot]"),
        unlabeled(OPERATOR),
      ];
      expect(state(["support"], events)).toBe("not-approved");
    });
  });

  describe("rejected", () => {
    it("is rejected while the label is present, whatever else the timeline says", () => {
      const events = [labeled("a"), unlabeled(OPERATOR), ev("labeled", "rejected", OPERATOR)];
      expect(state(["support", "rejected"], events)).toBe("rejected");
      expect(state(["support", "rejected", "maintainer-review"], events)).toBe("rejected");
    });

    it("is pending when the operator removed rejected and maintainer-review has not come back", () => {
      const events = [labeled("a"), unlabeled(OPERATOR), ev("labeled", "rejected", OPERATOR), ev("unlabeled", "rejected", OPERATOR)];
      expect(state(["support"], events)).toBe("pending");
    });

    it("is pending once the sweep put maintainer-review back", () => {
      const events = [
        labeled("a"),
        unlabeled(OPERATOR),
        ev("labeled", "rejected", OPERATOR),
        ev("unlabeled", "rejected", OPERATOR),
        labeled("diyaccounting-agent[bot]"),
      ];
      expect(state(["support", "maintainer-review"], events)).toBe("pending");
    });
  });

  it("reads the issue and its timeline from GitHub", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labels: [{ name: "support" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [labeled("diyaccounting-ops[bot]"), unlabeled(OPERATOR)] });
    expect(await issueApprovalState({ repo: "o/r", issue: 4, token: "t", fetchImpl })).toBe("approved");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.github.com/repos/o/r/issues/4");
    expect(fetchImpl.mock.calls[1][0]).toContain("/repos/o/r/issues/4/events");
  });
});
