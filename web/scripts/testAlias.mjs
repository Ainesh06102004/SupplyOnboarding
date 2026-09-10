// Registers the module hooks that let `node --test` load src/ directly.
// See testAliasHooks.mjs for why they are needed.
import { register } from "node:module";

register("./testAliasHooks.mjs", import.meta.url);
