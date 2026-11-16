import { createContext } from "react";
import type { ReviewSnapshot } from "../../shared/review.ts";
/** Only verified current anchors enter the diff; stale findings stay in the review list. */
export const ReviewAnchors = createContext<ReviewSnapshot["findings"]>([]);
