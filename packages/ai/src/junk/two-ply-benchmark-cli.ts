import { benchmarkSelfDrawTwoPly } from "./two-ply-benchmark.ts";

const [iterationsArgument] = process.argv.slice(2);
const iterations = iterationsArgument === undefined ? 25 : Number(iterationsArgument);
const result = benchmarkSelfDrawTwoPly(iterations);
process.stdout.write(`${JSON.stringify(result)}\n`);
