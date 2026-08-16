import { packageName as corePackageName } from "@new-mj/core";

export const packageName = "@new-mj/ai" as const;
export const coreDependency = corePackageName;

export * from "./strategy.ts";
export {
  chooseJunkAction,
  recommendJunkAction,
  recommendStructuralJunkAction,
  type JunkStrengthConfig,
} from "./junk/strategy.ts";
