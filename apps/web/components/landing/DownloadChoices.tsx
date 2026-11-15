import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr";

import { AppleMark, LinuxMark, WindowsMark } from "@/components/site/Marks";
import { type DesktopPlatform, platformDownloads, platformNames } from "@/lib/downloads";
import { site } from "@/lib/site";

const marks = { mac: AppleMark, windows: WindowsMark, linux: LinuxMark };

export function DownloadChoices({ preferred }: { preferred?: DesktopPlatform | null }) {
  const platforms: DesktopPlatform[] = ["mac", "windows", "linux"];
  if (preferred) platforms.sort((a, b) => Number(b === preferred) - Number(a === preferred));

  return (
    <>
      <div className="download-choices">
        {platforms.map(platform => {
          const Mark = marks[platform];
          return (
            <div className="download-platform" key={platform}>
              <h3><Mark />{platformNames[platform]}</h3>
              <div className="download-builds">
                {platformDownloads[platform].map(build => (
                  <a key={build.target} href={`/download/${build.target}`} className="download-build" aria-label={`Download NativePi for ${platformNames[platform]}, ${build.label}`}>
                    {build.label}<ArrowDownIcon aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="download-advice">Installers are unsigned. Windows and macOS may show a warning on first launch. <a href={`${site.repo}#install`} target="_blank" rel="noreferrer noopener">Installation help</a></p>
      <div className="download-links"><a href={site.releasesLatest} target="_blank" rel="noreferrer noopener">Release notes</a><a href={site.releases} target="_blank" rel="noreferrer noopener">Nightly builds</a></div>
    </>
  );
}
