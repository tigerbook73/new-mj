export type PrngState = {
  seed: number;
  state: number;
};

export type PrngStep = {
  value: number;
  prng: PrngState;
};

export type RandomIntStep = PrngStep;

export type ShuffleResult<T> = {
  items: T[];
  prng: PrngState;
};

const UINT32_RANGE = 0x1_0000_0000;

const normalizeSeed = (seed: number): number => {
  if (!Number.isInteger(seed)) {
    throw new Error("INVALID_SEED");
  }
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d_2b_79_31 : normalized;
};

export const createPrng = (seed: number): PrngState => {
  const normalized = normalizeSeed(seed);
  return { seed: normalized, state: normalized };
};

// xorshift32 是确定性的纯计算；每一步返回新状态，调用方可直接序列化/重放。
export const nextUint32 = (prng: PrngState): PrngStep => {
  let state = prng.state >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return { value: state, prng: { seed: prng.seed, state } };
};

export const nextInt = (prng: PrngState, maxExclusive: number): RandomIntStep => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
    throw new Error("INVALID_RANDOM_BOUND");
  }
  const next = nextUint32(prng);
  return { value: Math.floor((next.value / UINT32_RANGE) * maxExclusive), prng: next.prng };
};

export const shuffle = <T>(items: readonly T[], prng: PrngState): ShuffleResult<T> => {
  const result = [...items];
  let nextPrng = prng;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = nextInt(nextPrng, index + 1);
    [result[index], result[next.value]] = [result[next.value] as T, result[index] as T];
    nextPrng = next.prng;
  }
  return { items: result, prng: nextPrng };
};
