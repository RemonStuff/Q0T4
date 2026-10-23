import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Q0T4Exports } from "../../src/extension";
import { markdownLiteral } from "../../src/core/format/markdownLiteral";
import { FakeWorkspace } from "../fakes/environment";
import { removeTempDirs, workspaceWithOrigin } from "./gitFixtures";
import {
  FAKE_PROVIDER_ID,
  chatRequest,
  fakeModel,
  participantApi,
  recordingStream,
} from "./support";
import type { ProviderState } from "./support";

interface Reply {
  readonly text: string;
  readonly progress: string[];
  readonly metadata: Record<string, unknown>;
  readonly result: unknown;
}

const origin = (name: string) => `https://github.com/test-owner/${name}.git`;
const subjectOf = (name: string) => `test-owner/${name}`;

/** The chat history a real conversation would hold after `previous`. */
function historyAfter(
  prompt: string,
  answer: string,
  previous: Reply,
): vscode.ChatContext["history"] {
  return [
    { prompt, participant: "q0t4.chat", references: [], toolReferences: [] },
    {
      response: [new vscode.ChatResponseMarkdownPart(answer)],
      result: previous.result as vscode.ChatResult,
      participant: "q0t4.chat",
    },
  ];
}

async function send(
  api: Q0T4Exports,
  prompt: string,
  command?: string,
  history: vscode.ChatContext["history"] = [],
): Promise<Reply> {
  const source = new vscode.CancellationTokenSource();
  const { stream, markdown, progress } = recordingStream();
  try {
    const result = await api.test.handleRequest(
      chatRequest(await fakeModel(), prompt, command),
      { history },
      stream,
      source.token,
    );
    return {
      text: markdown.join(""),
      progress,
      metadata: (result as { metadata: Record<string, unknown> }).metadata,
      result,
    };
  } finally {
    source.dispose();
  }
}

const providerState = () => vscode.commands.executeCommand<ProviderState>("q0t4-test.getState");
const footerNames = (text: string, subject: string) =>
  text.includes(`*${markdownLiteral(subject)}: `);

describe("@q0t4 repo subjects", () => {
  const settings = () => vscode.workspace.getConfiguration("q0t4");

  before(async () => {
    await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
  });

  beforeEach(async () => {
    await vscode.commands.executeCommand("q0t4-test.setScript", ["Hel", "lo", "!"]);
  });

  afterEach(async () => {
    (await participantApi()).test.setWorkspace(undefined);
    await settings().update("subjects", undefined, vscode.ConfigurationTarget.Global);
    await settings().update("includeHistory", undefined, vscode.ConfigurationTarget.Global);
  });

  after(removeTempDirs);

  it("charges a prompt in a repo with origin test-owner/test-repo to that repo, and says so", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("test-repo")));
    const subject = subjectOf("test-repo");
    const before = (await api.test.ledger.usedThisWeek(subject)).tokens;
    const reply = await send(api, "hi");
    assert.equal(reply.metadata.subject, subject);
    assert.deepEqual(reply.progress, [`Subject: ${subject} (repo)`]);
    assert.ok(footerNames(reply.text, subject), reply.text);
    const used = (reply.metadata.inputTokens as number) + (reply.metadata.outputTokens as number);
    assert.ok(used > 0);
    assert.equal((await api.test.ledger.usedThisWeek(subject)).tokens, before + used);
  });

  it("an unlisted repo gets defaultLimit and a listed repo gets its own limit", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("unlisted")));
    assert.match((await send(api, "hi")).text, / \/ 150k this week/);

    api.test.setWorkspace(await workspaceWithOrigin(origin("listed")));
    await settings().update(
      "subjects",
      { [subjectOf("listed")]: { weeklyLimit: 50_000 } },
      vscode.ConfigurationTarget.Global,
    );
    assert.match((await send(api, "hi")).text, / \/ 50k this week/);
  });

  it("a follow-up stays on the thread subject, even if the workspace changed", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("first")));
    const first = await send(api, "one");
    api.test.setWorkspace(await workspaceWithOrigin(origin("second")));
    const second = await send(api, "two", undefined, historyAfter("one", "Hello!", first));
    assert.equal(second.metadata.subject, subjectOf("first"));
    assert.deepEqual(second.progress, [`Subject: ${subjectOf("first")} (thread)`]);
  });

  it("/use general charges the prompt to general and the thread keeps general", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("elsewhere")));
    const before = (await api.test.ledger.usedThisWeek("general")).tokens;
    const used = await send(api, "general explain this", "use");
    assert.equal(used.metadata.subject, "general");
    assert.deepEqual(used.progress, ["Subject: general (use)"]);
    assert.ok(footerNames(used.text, "general"), used.text);
    const state = await providerState();
    assert.equal(state?.requests.at(-1)?.messages.at(-1)?.text, "explain this");
    assert.ok((await api.test.ledger.usedThisWeek("general")).tokens > before);

    const followUp = await send(
      api,
      "and more",
      undefined,
      historyAfter("explain this", "Hello!", used),
    );
    assert.equal(followUp.metadata.subject, "general");
    assert.deepEqual(followUp.progress, ["Subject: general (thread)"]);
  });

  it("/use general alone confirms and switches the conversation without calling the model", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("switching")));
    const before = (await providerState())?.requests.length ?? 0;
    const ledgerBefore = (await api.test.ledger.usedThisWeek("general")).tokens;
    const set = await send(api, "general", "use");
    assert.match(set.text, /Subject set to `general`/);
    assert.equal(set.metadata.subject, "general");
    assert.equal(set.metadata.inputTokens, 0);
    assert.equal(set.metadata.outputTokens, 0);
    assert.equal((await providerState())?.requests.length ?? 0, before);
    assert.equal((await api.test.ledger.usedThisWeek("general")).tokens, ledgerBefore);

    const next = await send(api, "now ask", undefined, historyAfter("/use general", set.text, set));
    assert.equal(next.metadata.subject, "general");
  });

  it("an unknown /use subject lists the known ones and sends nothing", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("typo-check")));
    const before = (await providerState())?.requests.length ?? 0;
    const reply = await send(api, "no-such/subject hi", "use");
    assert.match(reply.text, /doesn't know the subject/);
    assert.ok(reply.text.includes(markdownLiteral(subjectOf("typo-check"))), reply.text);
    assert.equal((await providerState())?.requests.length ?? 0, before);
    assert.deepEqual(reply.metadata, { outcome: "error" });
  });

  it("exhausting one repo's budget refuses it, while /use general still works", async () => {
    const api = await participantApi();
    const subject = subjectOf("exhausted");
    api.test.setWorkspace(await workspaceWithOrigin(origin("exhausted")));
    await settings().update(
      "subjects",
      { [subject]: { weeklyLimit: 0 } },
      vscode.ConfigurationTarget.Global,
    );
    const refused = await send(api, "hi");
    assert.equal(refused.metadata.stopped, "precheck");
    assert.ok(
      refused.text.includes(`doesn't fit the budget for ${markdownLiteral(subject)}`),
      refused.text,
    );

    const general = await send(api, "general hi", "use");
    assert.equal(general.metadata.stopped, false);
    assert.equal(general.metadata.subject, "general");
  });

  it("changing q0t4.subjects at runtime takes effect on the next request", async () => {
    const api = await participantApi();
    const subject = subjectOf("runtime");
    api.test.setWorkspace(await workspaceWithOrigin(origin("runtime")));
    assert.match((await send(api, "hi")).text, / \/ 150k this week/);
    await settings().update(
      "subjects",
      { [subject]: { weeklyLimit: 0 } },
      vscode.ConfigurationTarget.Global,
    );
    assert.equal((await send(api, "hi")).metadata.stopped, "precheck");
    await settings().update(
      "subjects",
      { [subject]: { weeklyLimit: 80_000 } },
      vscode.ConfigurationTarget.Global,
    );
    assert.match((await send(api, "hi")).text, / \/ 80k this week/);
  });

  it("sends only the history of the same subject, and none when includeHistory is off", async () => {
    const api = await participantApi();
    api.test.setWorkspace(new FakeWorkspace(undefined));
    const old = await send(api, "about general");
    const history = historyAfter("about general", "general answer", old);

    await send(api, "next", undefined, history);
    assert.deepEqual(
      (await providerState())?.requests.at(-1)?.messages.map((m) => m.text),
      ["about general", "general answer", "next"],
    );

    // Same history, but the thread is moved to another subject with /use: the pair is not sent.
    api.test.setWorkspace(await workspaceWithOrigin(origin("other-subject")));
    await send(api, `${subjectOf("other-subject")} question`, "use", history);
    assert.deepEqual(
      (await providerState())?.requests.at(-1)?.messages.map((m) => m.text),
      ["question"],
    );

    await settings().update("includeHistory", false, vscode.ConfigurationTarget.Global);
    await send(api, "alone", undefined, history);
    assert.deepEqual(
      (await providerState())?.requests.at(-1)?.messages.map((m) => m.text),
      ["alone"],
    );
  });
});

describe("@q0t4 /status", () => {
  const settings = () => vscode.workspace.getConfiguration("q0t4");
  const rowFor = (text: string, subject: string) =>
    text.split("\n").find((line) => line.startsWith(`| ${markdownLiteral(subject)} |`));

  before(async () => {
    await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
  });

  beforeEach(async () => {
    await vscode.commands.executeCommand("q0t4-test.setScript", ["Hel", "lo", "!"]);
  });

  afterEach(async () => {
    (await participantApi()).test.setWorkspace(undefined);
    await settings().update("subjects", undefined, vscode.ConfigurationTarget.Global);
  });

  after(removeTempDirs);

  it("shows the current repo first with this week's usage, without calling the model", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("status-repo")));
    const subject = subjectOf("status-repo");
    const chat = await send(api, "hi");
    const used = (chat.metadata.inputTokens as number) + (chat.metadata.outputTokens as number);
    assert.ok(used > 0);

    const providerBefore = (await providerState())?.requests.length ?? 0;
    const ledgerBefore = (await api.test.ledger.usedThisWeek(subject)).tokens;
    const status = await send(api, "", "status");

    const lines = status.text.split("\n");
    assert.equal(lines[0], "| Subject | Used | Weekly budget | % | Today | Requests |");
    assert.ok(lines[2]?.startsWith(`| ${markdownLiteral(subject)} |`), status.text);
    assert.match(lines[2] ?? "", /\(default\) \| \d+% \| \S+ \| [1-9]\d* \|$/);
    assert.match(status.text, /Weekly budgets reset on [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}\.$/);
    assert.equal(status.metadata.outcome, "completed");
    assert.equal("subject" in status.metadata, false);
    assert.deepEqual(status.progress, []);
    assert.equal((await providerState())?.requests.length ?? 0, providerBefore);
    assert.equal((await api.test.ledger.usedThisWeek(subject)).tokens, ledgerBefore);
  });

  it("lists a configured subject without usage, with its own limit and no default marker", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("status-other")));
    const idle = subjectOf("configured-idle");
    await settings().update(
      "subjects",
      { [idle]: { weeklyLimit: 50_000 } },
      vscode.ConfigurationTarget.Global,
    );
    const row = rowFor((await send(api, "", "status")).text, idle);
    assert.ok(row, "the configured subject has a row");
    assert.match(row, /\| 0 \| 50k \| 0% \| 0 \| 0 \|$/);
  });

  it("does not change the subject of the conversation", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("thread-keeps")));
    const first = await send(api, "one");
    const status = await send(api, "", "status", historyAfter("one", "Hello!", first));
    const next = await send(api, "two", undefined, [
      ...historyAfter("one", "Hello!", first),
      {
        prompt: "",
        command: "status",
        participant: "q0t4.chat",
        references: [],
        toolReferences: [],
      },
      {
        response: [new vscode.ChatResponseMarkdownPart(status.text)],
        result: status.result as vscode.ChatResult,
        participant: "q0t4.chat",
      },
    ]);
    assert.equal(next.metadata.subject, subjectOf("thread-keeps"));
  });
});
