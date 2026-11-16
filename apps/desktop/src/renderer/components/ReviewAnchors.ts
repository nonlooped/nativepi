import { createContext, type ReactNode } from "react";
import type { ReviewSnapshot } from "../../shared/review.ts";
/** Only current anchors enter the diff. Inspection lives in the contextual pane. */
export const ReviewAnchors = createContext<ReviewSnapshot["findings"]>([]);
export const ReviewControls = createContext<{ toolbar: ReactNode; inspect: (id: string) => void } | null>(null);
