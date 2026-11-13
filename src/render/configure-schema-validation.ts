import { config } from "zod";

// Run before schema modules are evaluated: Zod's capability probe itself attempts
// new Function, even when it would subsequently fall back under a strict CSP.
config({ jitless: true });
