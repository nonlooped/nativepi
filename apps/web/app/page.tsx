import type { Metadata } from "next";

import { Introduction } from "@/components/landing/Introduction";

import "./landing.css";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <Introduction />
  );
}
