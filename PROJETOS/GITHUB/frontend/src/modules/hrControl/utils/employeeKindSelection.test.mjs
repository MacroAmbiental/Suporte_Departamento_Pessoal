import test from "node:test";
import assert from "node:assert/strict";
import { employeeKindLabels, employeeKindOf } from "../../../common/utils/employeeKind.ts";
import { employeeMatchesBaseFilters, employeeMatchesCardKindSelection } from "./employeeCardScope.ts";

test("RH and employee registry agree on legacy contract and explicit CLT types", () => {
  const legacy = { companyId: "macro", admissionDate: "2024-01-01", status: "terminated", registrationData: {} };
  const clt = { ...legacy, registrationData: { employeeKind: "company" } };
  assert.equal(employeeKindOf(legacy), "contract");
  assert.equal(employeeKindOf(clt), "company");
  assert.equal(employeeKindOf({ ...legacy, employeeKind: "company" }), "company");
  assert.equal(employeeKindLabels.contract, "Funcionário - Contrato");
  assert.equal(employeeKindLabels.company, "Funcionário - CLT");
});

test("employee card includes terminated contracts only when selected and respects company and date", () => {
  const employee = { companyId: "macro", admissionDate: "2024-01-01", status: "terminated" };
  const macro = new Set(["macro"]);
  const empty = new Set();
  assert.equal(employeeMatchesBaseFilters(employee, macro, true, empty, "2026-09-25"), false);
  assert.equal(employeeMatchesBaseFilters(employee, macro, true, empty, "2026-09-25", true), true);
  assert.equal(employeeMatchesBaseFilters(employee, new Set(["other"]), true, empty, "2026-09-25", true), false);
  assert.equal(employeeMatchesBaseFilters(employee, macro, true, empty, "2023-12-31", true), false);
});

test("contract totals are based on system registry and a system total option ignores date filters", () => {
  const activeContract = { companyId: "macro", admissionDate: "2027-01-10", status: "active", registrationData: { employeeKind: "contract" } };
  const inactiveContract = { companyId: "macro", admissionDate: "2020-01-01", status: "leave", registrationData: { employeeKind: "contract" } };
  const clt = { companyId: "macro", admissionDate: "2024-01-01", status: "active", registrationData: { employeeKind: "company" } };
  assert.equal(employeeMatchesCardKindSelection(activeContract, ["contract"], ["active"], "2026-09-25"), true);
  assert.equal(employeeMatchesCardKindSelection(activeContract, ["system"], ["active"], "2026-09-25"), true);
  assert.equal(employeeMatchesCardKindSelection({ ...activeContract, admissionDate: "2027-01-10" }, ["contract"], ["active"], "2024-01-01"), true);
  assert.equal(employeeMatchesCardKindSelection(clt, ["contract"], ["active"], "2026-09-25"), false);
  assert.equal(employeeMatchesCardKindSelection(inactiveContract, ["system"], ["active"], "2026-09-25"), false);
});
