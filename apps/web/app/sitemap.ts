import type { MetadataRoute } from "next";

import { docsLinks } from "@/lib/docs";
import { site } from "@/lib/site";

const routes = ["", ...docsLinks.map((link) => link.href)];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${site.url}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
