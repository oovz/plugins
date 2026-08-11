#!/usr/bin/env node
import { main } from "../lib/sew.mjs";

process.exitCode = await main(process.argv.slice(2));
