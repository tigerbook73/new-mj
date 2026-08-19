import { packageName as corePackageName } from "@new-mj/core";

export const packageName = "@new-mj/ai" as const;
export const coreDependency = corePackageName;

export * from "./strategy.ts";
export {
  chooseJunkAction,
  JUNK_STRUCTURAL_BASELINE,
  JunkBotAgent,
  recommendJunkAction,
  recommendStructuralBaselineV3Action,
  recommendStructuralBaselineV3ActionWithDiagnostics,
  recommendStructuralJunkAction,
  type JunkBotAgentSnapshot,
  type StructuralDecisionDiagnostics,
} from "./junk/strategy.ts";
