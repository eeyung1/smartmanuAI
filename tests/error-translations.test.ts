import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import ts from "typescript";
import { screenChinese, screenMessage } from "../src/i18n/screens";
const root = fileURLToPath(new URL("../", import.meta.url));
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : [join(directory, entry.name)],
    ),
  );
  return groups.flat();
}
test("fixed application error messages have Chinese translations without changing API strings", async () => {
  const paths = (
    await Promise.all([files(join(root, "src")), files(join(root, "app/api"))])
  )
    .flat()
    .filter((path) => path.endsWith(".ts"));
  const messages = new Map<string, string[]>();
  for (const path of paths) {
    const file = relative(root, path).replaceAll("\\", "/");
    const ast = ts.createSourceFile(
      file,
      await readFile(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      let value: ts.Expression | undefined;
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(ast) === "CatalogueError"
      )
        value = node.arguments?.[1];
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(ast) === "Error" &&
        file === "src/catalogue/schema.ts"
      )
        value = node.arguments?.[0];
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "error")
        value = node.initializer;
      if (value && ts.isStringLiteral(value))
        messages.set(value.text, [...(messages.get(value.text) ?? []), file]);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.ok(
    messages.size > 30,
    "audit must inspect the application service/API paths",
  );
  const missing = [...messages].filter(
    ([message]) => !Object.hasOwn(screenChinese, message),
  );
  assert.deepEqual(
    missing,
    [],
    "new fixed application errors need an explicit Chinese translation",
  );
  assert.equal(
    screenMessage("en", "Unsubscribe link expired."),
    "Unsubscribe link expired.",
  );
  assert.equal(
    screenMessage(
      "zh-Hans",
      "This candidate already has a model attempt. Inspect uncertain usage before retrying.",
    ),
    "此候选记录已有模型尝试。重试前请核查结果不确定的用量。",
  );
  assert.equal(
    screenMessage("zh-Hans", "Unknown dynamic provider response"),
    "服务消息（原文）：Unknown dynamic provider response",
  );
});
