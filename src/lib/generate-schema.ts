import { zodToJsonSchema } from "zod-to-json-schema";
import { KernConfigSchema } from "./config.ts";
import { UserConfigSchema, ThemeSchema } from "./user-config.ts";
import { resolve } from "path";
import { mkdir } from "fs/promises";

const rootDir = resolve(import.meta.dir, "../..");

// Generate kern.schema.json
const kernSchema = zodToJsonSchema(KernConfigSchema, { $refStrategy: "none" });
const kernSchemaPath = resolve(rootDir, "kern.schema.json");
await Bun.write(kernSchemaPath, JSON.stringify(kernSchema, null, 2) + "\n");
console.log(`Written ${kernSchemaPath}`);

// Generate schemas/ directory
const schemasDir = resolve(rootDir, "schemas");
await mkdir(schemasDir, { recursive: true });

// Generate schemas/config.schema.json
const configSchema = zodToJsonSchema(UserConfigSchema, { $refStrategy: "none" });
const configSchemaPath = resolve(schemasDir, "config.schema.json");
await Bun.write(configSchemaPath, JSON.stringify(configSchema, null, 2) + "\n");
console.log(`Written ${configSchemaPath}`);

// Generate schemas/theme.schema.json
const themeSchema = zodToJsonSchema(ThemeSchema, { $refStrategy: "none" });
const themeSchemaPath = resolve(schemasDir, "theme.schema.json");
await Bun.write(themeSchemaPath, JSON.stringify(themeSchema, null, 2) + "\n");
console.log(`Written ${themeSchemaPath}`);
