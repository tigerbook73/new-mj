import {
  ArrowBigDown,
  ArrowBigLeft,
  ArrowBigRight,
  ArrowBigUp,
  type LucideIcon,
} from "lucide-react";
import type { SeatDirection } from "@/lib/seatLayout";

/** Points toward the seat that sits at each direction — shared by TableBoard's turn indicator and DiscardPile's claim badge. */
export const DIRECTION_ARROW_ICON: Record<SeatDirection, LucideIcon> = {
  top: ArrowBigUp,
  right: ArrowBigRight,
  bottom: ArrowBigDown,
  left: ArrowBigLeft,
};
