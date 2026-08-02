import type { RulesetModule } from "./engine.ts";
import { junkRuleSet } from "./rulesets/junk/index.ts";
import { bloodbattleRuleSet } from "./rulesets/bloodbattle/index.ts";
import { hangzhouRuleSet } from "./rulesets/hangzhou/index.ts";

// any：登记表本身要跨玩法异构存放，具体类型在各玩法自己的入口收窄；
// 这是 engine.ts dispatch 与测试适配（support/registered-rulesets.ts）共用的唯一来源，
// 新增玩法只需要在这里加一行，两处消费者自动感知。
export const RULESETS: Record<string, RulesetModule<any, any, any>> = {
  junk: junkRuleSet,
  bloodbattle: bloodbattleRuleSet,
  hangzhou: hangzhouRuleSet,
};

export const getRuleset = (rulesetId: string): RulesetModule<any, any, any> | undefined =>
  RULESETS[rulesetId];
