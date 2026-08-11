#!/usr/bin/env node

import { main } from "../lib/sew-models.mjs";

process.exitCode = await main(process.argv.slice(2));
