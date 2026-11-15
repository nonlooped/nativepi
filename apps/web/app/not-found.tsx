import { Button } from "@/components/site/Button";

export default function NotFound() {
  return (
    <div className="rail py-24 sm:py-32">
      <p className="text-sm text-silver">Page not found</p>
      <h1 className="section-head mt-4 text-bright">This page has moved or doesn&apos;t exist.</h1>
      <p className="lede mt-6 max-w-xl">Return to NativePi or choose a download for your computer.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button href="/">Return home</Button>
        <Button href="/download" variant="outline">Download NativePi</Button>
      </div>
    </div>
  );
}
