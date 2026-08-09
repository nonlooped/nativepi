import { defineRenderer } from "@nativepi/extension-api";
import { subscriptionUsageProtocol } from "../types.ts";

export default defineRenderer({
  apiVersion: 1,
  protocol: subscriptionUsageProtocol,
});
