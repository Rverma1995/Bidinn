import "reflect-metadata";
import assert from "assert";
import {
  LeadStatus,
  STAGE_TRANSITIONS,
  STAGES_REQUIRING_ASSIGNMENT,
  STAGES_REQUIRING_REASON,
} from "../../src/entities/Lead";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("Rule 5: interested and followup cannot jump to not_interested", () => {
  assert.ok(!STAGE_TRANSITIONS[LeadStatus.INTERESTED].includes(LeadStatus.NOT_INTERESTED));
  assert.ok(!STAGE_TRANSITIONS[LeadStatus.FOLLOWUP].includes(LeadStatus.NOT_INTERESTED));
  assert.ok(STAGE_TRANSITIONS[LeadStatus.INTERESTED].includes(LeadStatus.WON));
  assert.ok(STAGE_TRANSITIONS[LeadStatus.INTERESTED].includes(LeadStatus.LOST));
  assert.ok(STAGE_TRANSITIONS[LeadStatus.FOLLOWUP].includes(LeadStatus.WON));
  assert.ok(STAGE_TRANSITIONS[LeadStatus.FOLLOWUP].includes(LeadStatus.LOST));
});

test("new and not_answered can still go to not_interested", () => {
  assert.ok(STAGE_TRANSITIONS[LeadStatus.NEW].includes(LeadStatus.NOT_INTERESTED));
  assert.ok(STAGE_TRANSITIONS[LeadStatus.NOT_ANSWERED].includes(LeadStatus.NOT_INTERESTED));
});

test("won is terminal; lost and not_interested reopen only to new", () => {
  assert.deepStrictEqual(STAGE_TRANSITIONS[LeadStatus.WON], []);
  assert.deepStrictEqual(STAGE_TRANSITIONS[LeadStatus.LOST], [LeadStatus.NEW]);
  assert.deepStrictEqual(STAGE_TRANSITIONS[LeadStatus.NOT_INTERESTED], [LeadStatus.NEW]);
});

test("Rule 1: assignment required before not_answered / interested / followup", () => {
  assert.deepStrictEqual(STAGES_REQUIRING_ASSIGNMENT, [
    LeadStatus.NOT_ANSWERED,
    LeadStatus.INTERESTED,
    LeadStatus.FOLLOWUP,
  ]);
  assert.ok(!STAGES_REQUIRING_ASSIGNMENT.includes(LeadStatus.NEW));
  assert.ok(!STAGES_REQUIRING_ASSIGNMENT.includes(LeadStatus.WON));
});

test("Rule 2: closed reason required for not_interested and lost only", () => {
  assert.deepStrictEqual(STAGES_REQUIRING_REASON, [LeadStatus.NOT_INTERESTED, LeadStatus.LOST]);
  assert.ok(!STAGES_REQUIRING_REASON.includes(LeadStatus.WON));
});

test("every status has a transitions entry", () => {
  for (const status of Object.values(LeadStatus)) {
    assert.ok(status in STAGE_TRANSITIONS, `missing transitions for ${status}`);
  }
});

console.log("All lead-rules tests passed");
