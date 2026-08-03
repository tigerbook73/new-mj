import type { RoomInfo } from "@new-mj/protocol";

type ScoreDeltas = readonly number[];

export const playerName = (players: RoomInfo["players"], mySeat: number, seat: number): string =>
  seat === mySeat ? "我" : (players[seat]?.nickname ?? `座位 ${seat + 1}`);

export const scoreRows = (scoreDeltas: ScoreDeltas, winners: readonly number[]): number[] => {
  const winnerSeats = [...new Set(winners)];
  return [
    ...winnerSeats,
    ...scoreDeltas.map((_, seat) => seat).filter((seat) => !winnerSeats.includes(seat)),
  ];
};

export const waitingPlayerNames = (players: RoomInfo["players"], mySeat: number): string[] =>
  players
    .map((player, seat) => ({ player, seat }))
    .filter(({ player }) => player && !player.isBot && player.isReady !== true)
    .map(({ player, seat }) => playerName(players, mySeat, seat));
