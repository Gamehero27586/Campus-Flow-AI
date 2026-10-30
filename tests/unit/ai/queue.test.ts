import { describe, expect, it } from "vitest";
import { createAiQueue } from "@/server/ai/queue";

// The in-process AI queue (rule AI-j): one job at a time, a line of 3, one job per person, a pause between one
// person's requests, and a stuck or failing job gives its place back. Jobs here are promises the test controls.

function deferred<T = string>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets queued continuations run. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(options: Parameters<typeof createAiQueue>[0] = {}) {
  let time = 1_000_000;
  const queue = createAiQueue({ clock: () => time, cooldownMs: 10_000, ...options });
  return { queue, advance: (ms: number) => (time += ms) };
}

describe("one job at a time, in order", () => {
  it("runs a job at once when the model is free", async () => {
    const { queue } = setup();
    const outcome = await queue.run("a", async () => "done");
    expect(outcome).toEqual({ ok: true, value: "done", waitedBehind: 0 });
  });

  it("runs waiting jobs one by one in the order they arrived", async () => {
    const { queue } = setup();
    const order: string[] = [];
    const gates = { a: deferred(), b: deferred(), c: deferred() };
    const job = (name: "a" | "b" | "c") => async () => {
      order.push(`start ${name}`);
      await gates[name].promise;
      order.push(`end ${name}`);
      return name;
    };

    const a = queue.run("a", job("a"));
    const b = queue.run("b", job("b"));
    const c = queue.run("c", job("c"));
    await tick();
    expect(order).toEqual(["start a"]);
    expect(queue.snapshot()).toEqual({ running: true, waiting: 2 });

    gates.a.resolve("x");
    await tick();
    expect(order).toEqual(["start a", "end a", "start b"]);

    gates.b.resolve("x");
    await tick();
    gates.c.resolve("x");

    expect(await a).toMatchObject({ ok: true, value: "a", waitedBehind: 0 });
    expect(await b).toMatchObject({ ok: true, value: "b", waitedBehind: 1 });
    expect(await c).toMatchObject({ ok: true, value: "c", waitedBehind: 2 });
    expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
    expect(queue.snapshot()).toEqual({ running: false, waiting: 0 });
  });

  it("never runs two jobs at the same time, even when a new request arrives as one finishes", async () => {
    const { queue } = setup();
    let active = 0;
    let peak = 0;
    const gates = [deferred(), deferred(), deferred()];
    const make = (index: number) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gates[index].promise;
      active -= 1;
      return index;
    };
    const first = queue.run("a", make(0));
    const second = queue.run("b", make(1));
    await tick();
    gates[0].resolve("x");
    // Arrives right after the first job finished: the waiting job has the model, so this one must queue.
    const third = queue.run("c", make(2));
    await tick();
    gates[1].resolve("x");
    await tick();
    gates[2].resolve("x");
    await Promise.all([first, second, third]);
    expect(peak).toBe(1);
  });
});

describe("a full line", () => {
  it("accepts one running and three waiting, and says busy to the fifth person", async () => {
    const { queue } = setup();
    const gate = deferred();
    const slow = () => gate.promise;
    const accepted = ["a", "b", "c", "d"].map((user) => queue.run(user, slow));
    await tick();
    expect(queue.snapshot()).toEqual({ running: true, waiting: 3 });

    expect(await queue.run("e", slow)).toEqual({ ok: false, reason: "busy" });

    gate.resolve("done");
    const results = await Promise.all(accepted);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("a rejected request leaves no trace: the person can try again once there is room", async () => {
    const { queue, advance } = setup();
    const gate = deferred();
    const accepted = ["a", "b", "c", "d"].map((user) => queue.run(user, () => gate.promise));
    await tick();
    expect(await queue.run("e", async () => "x")).toMatchObject({ reason: "busy" });
    gate.resolve("done");
    await Promise.all(accepted);
    advance(11_000);
    expect(await queue.run("e", async () => "later")).toMatchObject({ ok: true, value: "later" });
  });
});

describe("one request per person at a time", () => {
  it("refuses a second request while the first is running", async () => {
    const { queue } = setup();
    const gate = deferred();
    const first = queue.run("a", () => gate.promise);
    await tick();
    expect(await queue.run("a", async () => "again")).toEqual({ ok: false, reason: "you_are_waiting" });
    gate.resolve("done");
    await first;
  });

  it("refuses a second request while the first is still waiting in line", async () => {
    const { queue } = setup();
    const gate = deferred();
    const running = queue.run("a", () => gate.promise);
    const waiting = queue.run("b", async () => "b");
    await tick();
    expect(await queue.run("b", async () => "b again")).toEqual({ ok: false, reason: "you_are_waiting" });
    gate.resolve("done");
    await Promise.all([running, waiting]);
  });
});

describe("a pause between one person's requests", () => {
  it("says too soon, with how long to wait, counted from when the last job finished", async () => {
    const { queue, advance } = setup();
    await queue.run("a", async () => "first");
    advance(4_000);
    expect(await queue.run("a", async () => "second")).toEqual({ ok: false, reason: "too_soon", retryAfterMs: 6_000 });
    advance(6_000);
    expect(await queue.run("a", async () => "third")).toMatchObject({ ok: true, value: "third" });
  });

  it("starts the pause when the job finishes, not when it was asked for", async () => {
    const { queue, advance } = setup();
    const gate = deferred();
    const job = queue.run("a", () => gate.promise);
    advance(30_000); // a long job
    gate.resolve("done");
    await job;
    expect(await queue.run("a", async () => "x")).toMatchObject({ reason: "too_soon", retryAfterMs: 10_000 });
  });

  it("is per person: someone else is not held back", async () => {
    const { queue } = setup();
    await queue.run("a", async () => "a");
    expect(await queue.run("b", async () => "b")).toMatchObject({ ok: true });
  });
});

describe("a job that does not finish normally still gives its place back", () => {
  it("a job that throws releases the model, passes the error on, and starts the pause", async () => {
    const { queue } = setup();
    const failing = queue.run("a", async () => {
      throw new Error("model blew up");
    });
    const next = queue.run("b", async () => "b ran");
    await expect(failing).rejects.toThrow("model blew up");
    expect(await next).toMatchObject({ ok: true, value: "b ran" });
    expect(await queue.run("a", async () => "x")).toMatchObject({ reason: "too_soon" });
    expect(queue.snapshot()).toEqual({ running: false, waiting: 0 });
  });

  it("a job that takes too long is given up on: the next job runs and the late result is ignored", async () => {
    const { queue } = setup({ jobMaxMs: 20 });
    const never = deferred();
    const stuck = queue.run("a", () => never.promise);
    const next = queue.run("b", async () => "b ran");

    expect(await stuck).toEqual({ ok: false, reason: "timeout" });
    expect(await next).toMatchObject({ ok: true, value: "b ran" });

    never.resolve("far too late");
    await tick();
    expect(queue.snapshot()).toEqual({ running: false, waiting: 0 });
  });
});
