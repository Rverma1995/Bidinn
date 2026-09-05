import "reflect-metadata";
import assert from "assert";
import { buildAssignmentNotice, shouldNotifyAssignee } from "../../src/services/assignment-notify.service";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

const emily = { id: "rep-1", email: "emily@bidinn.com", name: "Emily Davis", is_active: true };
const alex = { id: "admin-1", email: "alex@bidinn.com", name: "Alex Admin", is_active: true };

test("notifies when a different active agent is assigned one or more leads", () => {
  assert.strictEqual(
    shouldNotifyAssignee({ assignee: emily, assignerId: alex.id, assignerName: alex.name, count: 1 }),
    true
  );
  assert.strictEqual(
    shouldNotifyAssignee({ assignee: emily, assignerId: alex.id, assignerName: alex.name, count: 5 }),
    true
  );
});

test("skips self-assignment", () => {
  assert.strictEqual(
    shouldNotifyAssignee({ assignee: emily, assignerId: emily.id, assignerName: emily.name, count: 1 }),
    false
  );
});

test("skips inactive assignee", () => {
  assert.strictEqual(
    shouldNotifyAssignee({
      assignee: { ...emily, is_active: false },
      assignerId: alex.id,
      assignerName: alex.name,
      count: 1,
    }),
    false
  );
});

test("skips missing assignee, missing id, count < 1, and zero", () => {
  assert.strictEqual(shouldNotifyAssignee({ assignee: null, assignerId: alex.id, assignerName: alex.name, count: 1 }), false);
  assert.strictEqual(
    shouldNotifyAssignee({ assignee: { ...emily, id: "" }, assignerId: alex.id, assignerName: alex.name, count: 1 }),
    false
  );
  assert.strictEqual(
    shouldNotifyAssignee({ assignee: emily, assignerId: alex.id, assignerName: alex.name, count: 0 }),
    false
  );
  assert.strictEqual(
    shouldNotifyAssignee({ assignee: emily, assignerId: alex.id, assignerName: alex.name, count: -3 }),
    false
  );
});

test("single-lead copy names the lead and assigner; target is lead when leadId is set", () => {
  const notice = buildAssignmentNotice({
    assignee: emily,
    assignerId: alex.id,
    assignerName: alex.name,
    count: 1,
    leadId: "lead-1",
    leadName: "Ravi Kumar",
  });
  assert.strictEqual(notice.title, "New lead assigned to you");
  assert.ok(notice.message.includes("Ravi Kumar"));
  assert.ok(notice.message.includes(alex.name));
  assert.ok(notice.message.includes("dashboard"));
  assert.strictEqual(notice.target_type, "lead");
});

test("single-lead with no name falls back to 'A lead'", () => {
  const notice = buildAssignmentNotice({
    assignee: emily,
    assignerId: alex.id,
    assignerName: alex.name,
    count: 1,
  });
  assert.ok(notice.message.startsWith("A lead was assigned"));
  assert.strictEqual(notice.target_type, "dashboard");
});

test("bulk copy uses the count and dashboard target when there is no single leadId", () => {
  const notice = buildAssignmentNotice({
    assignee: emily,
    assignerId: alex.id,
    assignerName: alex.name,
    count: 7,
  });
  assert.strictEqual(notice.title, "7 leads assigned to you");
  assert.ok(notice.message.includes("7 leads were assigned"));
  assert.ok(notice.message.includes(alex.name));
  assert.strictEqual(notice.target_type, "dashboard");
});

test("bulk with one lead_ids item still uses singular copy when count is 1", () => {
  const notice = buildAssignmentNotice({
    assignee: emily,
    assignerId: alex.id,
    assignerName: alex.name,
    count: 1,
    leadId: "only-one",
  });
  assert.strictEqual(notice.title, "New lead assigned to you");
  assert.strictEqual(notice.target_type, "lead");
});

console.log("All assignment-notify tests passed");
