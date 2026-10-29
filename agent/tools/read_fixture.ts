import { defineTool } from "eve/tools";
import { z } from "zod";
import { fixtureSource } from "../../src/research/fixture";
export default defineTool({
  description:
    "Read the fixed synthetic smart manufacturing source. No URL or user input accepted.",
  inputSchema: z.object({}).strict(),
  execute: () => ({ source: fixtureSource }),
});
