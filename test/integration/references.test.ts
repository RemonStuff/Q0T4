import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { referenceReader } from "../../src/adapters/referenceReader";
import { contextText, contextUri, referenceForwardingTests } from "./referenceCases";
import { participantApi } from "./support";

describe("referenceReader", () => {
  it("reads a workspace file URI with a relative label", async () => {
    assert.equal(vscode.workspace.getWorkspaceFolder(contextUri())?.uri.scheme, "file");
    assert.deepEqual(await referenceReader.read({ id: "file", value: contextUri() }), {
      label: "context.txt",
      text: contextText,
    });
  });

  it("reads only a Location range, including its columns", async () => {
    assert.deepEqual(
      await referenceReader.read({
        id: "selection",
        value: new vscode.Location(contextUri(), new vscode.Range(1, 0, 1, 8)),
      }),
      { label: "context.txt:2:1-2:9", text: "selected" },
    );
  });

  it("preserves empty selections and empty string references", async () => {
    assert.deepEqual(
      await referenceReader.read({
        id: "selection",
        value: new vscode.Location(contextUri(), new vscode.Range(1, 0, 1, 0)),
      }),
      { label: "context.txt:2:1-2:1", text: "" },
    );
    assert.deepEqual(await referenceReader.read({ id: "text", value: "" }), {
      label: "text",
      text: "",
    });
  });

  it("uses string values as-is rather than treating them as filenames", async () => {
    assert.deepEqual(await referenceReader.read({ id: "text", value: " \nfile:///not-a-file\t" }), {
      label: "text",
      text: " \nfile:///not-a-file\t",
    });
  });

  it("returns undefined for unknown values and image data", async () => {
    for (const value of [null, undefined, {}, 1, new Uint8Array([137, 80, 78, 71])]) {
      assert.equal(await referenceReader.read({ id: "unknown", value }), undefined);
    }
  });

  it("skips image file URIs instead of decoding their bytes as source text", async () => {
    for (const suffix of [".png", ".JPG", ".gif", ".webp", ".avif", ".heic", ".tiff"]) {
      assert.equal(
        await referenceReader.read({
          id: "image",
          value: contextUri().with({ path: `${contextUri().path}${suffix}` }),
        }),
        undefined,
      );
    }
  });

  it("preserves Unicode and line endings while refusing NUL-containing binary content", async () => {
    const uri = vscode.Uri.joinPath(contextUri(), "../temporary-reference.txt");
    try {
      const text = "caf\u00e9\r\n\u{1f642}\r\n";
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
      assert.equal((await referenceReader.read({ id: "file", value: uri }))?.text, text);
      const binary = await vscode.workspace.openTextDocument({ content: "A\0B" });
      assert.equal(await referenceReader.read({ id: "binary", value: binary.uri }), undefined);
    } finally {
      await vscode.workspace.fs.delete(uri);
    }
  });

  it("rejects actual file read errors instead of claiming unsupported content", async () => {
    await assert.rejects(
      referenceReader.read({
        id: "file",
        value: vscode.Uri.joinPath(contextUri(), "missing.txt"),
      }),
      /missing\.txt/,
    );
  });

  it("reads unsaved editor text for files and selections", async () => {
    const document = await vscode.workspace.openTextDocument(contextUri());
    const original = document.getText();
    const replace = async (text: string) => {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
        text,
      );
      assert.equal(await vscode.workspace.applyEdit(edit), true);
    };
    try {
      await replace("unsaved\nnew content");
      assert.equal(document.isDirty, true);
      assert.equal(
        (await referenceReader.read({ id: "file", value: document.uri }))?.text,
        "unsaved\nnew content",
      );
      assert.equal(
        (
          await referenceReader.read({
            id: "selection",
            value: new vscode.Location(document.uri, new vscode.Range(1, 0, 1, 3)),
          })
        )?.text,
        "new",
      );
    } finally {
      await replace(original);
      assert.equal(await document.save(), true);
    }
  });
});

referenceForwardingTests(participantApi);
