import { describe, it } from "vitest";

// The permission cases from docs/permissions.md §9 that need tables not built yet. Each one is a
// visible TODO in the test output; the slice that builds the table writes the real test in its own
// policy test file and deletes the line here. Nothing about permissions is silently untested.

describe.skip("Slice 3: personal tasks (tier 1)", () => {
  it.todo("Admin reads a student's personal task: denied (not found)");
  it.todo("Admin reads the subtasks of an assignment task: denied (not found)");
  it.todo("Faculty reads a student's personal task or Growth Tracker: denied");
});

describe.skip("Slice 6: classes and rosters", () => {
  it.todo(
    "Faculty owner of class A and co-teacher of class B: archiving A allowed, archiving B denied",
  );
  it.todo(
    "Faculty owner of class A and co-teacher of class B: adding a co-teacher to A allowed, to B denied",
  );
  it.todo("Student who is not a member opens a class: not found");
  it.todo("Student whose join request is pending or rejected sees no class content");
  it.todo("Faculty of another class opens this class: not found");
  it.todo("Admin transfers class ownership: allowed and audited");
});

describe.skip("Slice 7: assignments, submissions and files", () => {
  it.todo("Student reads another student's submission: denied (not found)");
  it.todo("Student not selected as a recipient opens the assignment: not found");
  it.todo("Co-teacher grades in their class: allowed");
  it.todo("Admin edits a grade in any class: denied; Admin reads that grade: allowed");
  it.todo("Admin submits for a student: denied");
  it.todo("Admin opens a submission file: allowed and audited with via = admin");
  it.todo("Downloading a submission file by direct URL while not authorised: not found");
  it.todo("Student changes an assignment task to done by hand: refused");
});

describe.skip("Slice 10: Admin completion", () => {
  it.todo("Admin grants class.create to Student (ineligible): refused");
  it.todo("Admin removes a locked key from Admin: refused");
  it.todo("Admin makes another user an Admin: allowed and audited");
  it.todo("Last admin deactivates themselves: refused");
  it.todo(
    "Admin changes the role of a faculty member who owns a class: refused, with the class listed",
  );
  it.todo("Deactivating a user deletes their session rows in the same transaction");
});

describe.skip("Slice 11: teams", () => {
  it.todo("Teammate changes the status of a task assigned to someone else: denied (not allowed)");
  it.todo("Teammate reassigns a task assigned to someone else: allowed");
  it.todo("Invited user sees only the invitation, not the team's tasks");
  it.todo("Admin transfers the team creator: allowed and audited");
});
