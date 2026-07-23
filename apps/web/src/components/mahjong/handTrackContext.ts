import { createContext, useContext } from "react";

export type HandTrackLayout = {
  tileWidthPx: number;
  tileHeightPx: number;
  handOverflows: boolean;
};

export const HandTrackLayoutContext = createContext<HandTrackLayout | undefined>(undefined);

export const useHandTrackLayout = () => {
  const layout = useContext(HandTrackLayoutContext);
  if (!layout) throw new Error("HandTrack leaf must render inside HandTrack");
  return layout;
};
