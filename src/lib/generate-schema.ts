import { zodToJsonSchema } from "zod-to-json-schema";
import { KernConfigSchema } from "./config.ts";
import { resolve } from "path";

const jsonSchema = zodToJsonSchema(KernConfigSchema, {
  $refStrategy: "none",
});

const outPath = resolve(import.meta.dir, "../../kern.schema.json");
await Bun.write(outPath, JSON.stringify(jsonSchema, null, 2) + "\n");
console.log(`Written ${outPath}`);
