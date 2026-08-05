/**
 * Player-facing rules summaries for each supported ruleset — written for
 * someone learning the variant, not the full spec (see docs/variants/*.md
 * for the authoritative rules this is adapted from). Keyed by rulesetId so
 * VariantInfoView can look one up from the route param.
 */
export interface VariantInfoSection {
  heading: string;
  bullets: string[];
}

export interface VariantInfo {
  title: string;
  tagline: string;
  sections: VariantInfoSection[];
}

export const VARIANT_INFO: Record<string, VariantInfo> = {
  junk: {
    title: "垃圾胡",
    tagline: "最简单的入门玩法：136 张牌，起胡无番种门槛，谁先凑成牌型谁赢。",
    sections: [
      {
        heading: "开局",
        bullets: [
          "4 人游戏，万/筒/条各 1–9 加风牌东南西北、箭牌中发白，共 136 张；不含花牌，没有癞子/宝牌",
          "座位与庄家由本局随机数决定；庄家发 14 张，其余三家各 13 张，庄家先打",
        ],
      },
      {
        heading: "行牌",
        bullets: [
          "轮到自己：摸一张牌，然后打出一张，或暗杠、补杠、自摸胡",
          "别人打出的牌，按 胡 > 杠 > 碰 > 吃 的优先级抢：吃只能吃上家的牌，碰/杠任意一家都能抢",
          "一炮多响时只有出牌者逆时针方向最近的可胡家胡牌（头跳）",
        ],
      },
      {
        heading: "胡牌与算分",
        bullets: [
          "胡牌型：4 组面子 + 1 对将牌，或者 7 个对子",
          "命中的番型倍数连乘：杠开、混一色、清一色、七对、碰碰胡、门清都能算一份",
          "庄家的收付固定再乘 2 倍；牌墙摸完没人胡就流局，不计分",
        ],
      },
    ],
  },
  hangzhou: {
    title: "杭州麻将",
    tagline: "以白板为财神的地方玩法：爆头、财飘、连庄倍率，算分比垃圾胡更丰富。",
    sections: [
      {
        heading: "开局与财神",
        bullets: [
          "4 人游戏，136 张牌（含风牌、箭牌），白板固定是财神，能代替任意一张牌凑成面子、将牌或七对子的普通对子",
          "财神不能用来吃、碰、杠，也不能被别人吃/碰/杠/胡——打出的财神谁都抢不走",
          "打出财神后，全场进入一圈的限制：其他人不能吃/碰/明杠/点炮，摸牌后也只能打刚摸的那张",
        ],
      },
      {
        heading: "行牌",
        bullets: [
          "摸牌方向、声明优先级（胡 > 杠 > 碰 > 吃）与垃圾胡一致",
          "自己回合内可以暗杠、补杠、自摸；处于财神限制圈内则不能补杠，只能打刚摸的牌",
        ],
      },
      {
        heading: "胡牌与算分",
        bullets: [
          "爆头：听牌且手里有财神，摸什么都能胡；财飘：爆头时主动打出财神、打出后仍然爆头",
          "财飘倍数会累计——第一次财飘 4 倍，之后每再成功一次翻到双财飘 8 倍、三财飘 16 倍，直到自己弃一张非财神的牌才清零重新计数",
          "七对子里凑够 4 张相同算「豪华」，越豪华倍数越高；连续开杠再摸到胡牌牌也有额外倍数",
          "庄家连续坐庄会按连庄局数升高收付倍率；连坐 3 局以上才解锁点炮胡（三牢），之前只能自摸",
        ],
      },
    ],
  },
  bloodbattle: {
    title: "血战到底",
    tagline: "川麻经典打法：换三张、定缺，一直打到最后一人或牌墙摸完才结束。",
    sections: [
      {
        heading: "开局：换三张与定缺",
        bullets: [
          "4 人游戏，108 张牌，只有万/筒/条，没有风牌箭牌",
          "开局先各自选 3 张同花色的牌换出去，换牌方向（左手/右手/对家）由本局随机数决定",
          "换牌后每人从自己手里选一门花色定缺；手里还有缺门牌时只能打这门牌，不能碰/杠/胡，直到打光缺门牌",
        ],
      },
      {
        heading: "行牌与胡牌",
        bullets: [
          "没有吃，声明优先级是 胡 > 杠 > 碰",
          "胡牌前提是手牌里不含自己定缺的花色，牌型是 4 组面子 + 1 对，或者七对",
          "有人胡牌后不算结束——胡的人亮牌离场，其余人继续打，直到打到只剩一人没胡，或者牌墙摸完",
          "一炮多响时点炮者要分别付给每个胡的人；补杠时也允许被抢杠",
        ],
      },
      {
        heading: "算分",
        bullets: [
          "基础番型：平胡、对对胡、七对、龙七对（七对里有豪华对子）、金钩钓（只剩一张单钓）",
          "清一色、每组四张相同（根）都能加番；自摸、杠上花、海底捞月等操作也各加番",
          "杠还有即时结算：直杠放杠者付分，暗杠/补杠全场其他人一起付",
        ],
      },
      {
        heading: "当前状态",
        bullets: ["规则引擎已实现；桌面端专属操作 UI（换三张/定缺界面）还在开发中"],
      },
    ],
  },
};
