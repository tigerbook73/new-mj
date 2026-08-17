import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type EvaluationRunMetadata = Readonly<{
  schemaVersion: 1;
  runId: string;
  command: string;
  gitSha: string;
  startedAt: string;
}>;

export type TextEvaluationArtifact<TData> = Readonly<{
  run: EvaluationRunMetadata;
  data: TData;
}>;

export type TextArtifactRuntime = Readonly<{
  exists?: (filePath: string) => boolean;
  makeDirectory?: (directory: string) => void;
  write?: (filePath: string, content: string) => void;
}>;

const artifactPaths = (outputDir: string, fileStem: string) => {
  const directory = path.resolve(outputDir);
  return {
    directory,
    jsonPath: path.join(directory, `${fileStem}.json`),
    textPath: path.join(directory, `${fileStem}.txt`),
  };
};

export const assertTextEvaluationArtifactsAvailable = (
  outputDir: string,
  fileStem: string,
  runtime: Pick<TextArtifactRuntime, "exists"> = {},
): void => {
  const { jsonPath, textPath } = artifactPaths(outputDir, fileStem);
  const exists = runtime.exists ?? existsSync;
  if (exists(jsonPath) || exists(textPath)) throw new Error(`OUTPUT_ALREADY_EXISTS: ${fileStem}`);
};

export const writeTextEvaluationArtifacts = <TData>(
  outputDir: string,
  fileStem: string,
  artifact: TextEvaluationArtifact<TData>,
  report: string,
  runtime: TextArtifactRuntime = {},
): Readonly<{ jsonPath: string; textPath: string }> => {
  const { directory, jsonPath, textPath } = artifactPaths(outputDir, fileStem);
  assertTextEvaluationArtifactsAvailable(outputDir, fileStem, runtime);
  (runtime.makeDirectory ?? ((value) => mkdirSync(value, { recursive: true })))(directory);
  const write =
    runtime.write ?? ((filePath: string, content: string) => writeFileSync(filePath, content));
  write(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  write(textPath, report.endsWith("\n") ? report : `${report}\n`);
  return { jsonPath, textPath };
};
