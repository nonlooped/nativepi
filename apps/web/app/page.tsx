import { Button } from "@/components/site/Button";
import { GitHubMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <section className="rail flex min-h-svh flex-col items-center text-center py-8 sm:py-12">
      <header>
        <Wordmark className="h-6" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center py-20">
        <h1 className="max-w-5xl text-[clamp(4rem,10vw,9rem)] font-medium leading-[1.02] tracking-[-0.06em]">A lot is changing.</h1>
        <p className="lede mt-6 max-w-lg">
          We’re updating the website. Check back soon.
        </p>
        <div className="mt-9">
          <Button href={site.repo} variant="outline">
            <GitHubMark className="size-4" />
            Follow development on GitHub
          </Button>
        </div>
      </div>
    </section>
  );
}
