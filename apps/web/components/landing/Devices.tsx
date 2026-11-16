import Image from "next/image";

export function Devices() {
  return (
    <div className="devices">
      <div className="device-stage">
        <div className="desktop-device">
          <Image src="/app/desktop.webp" alt="The NativePi desktop app showing a conversation about the project, with its composer and dithered Mist landscape." width={1280} height={840} sizes="(min-width: 1400px) 770px, (min-width: 960px) 52vw, 76vw" preload />
        </div>
        <div className="phone-device">
          <span className="phone-action-button" aria-hidden="true" />
          <span className="phone-volume-buttons" aria-hidden="true" />
          <span className="phone-power-button" aria-hidden="true" />
          <div className="phone-screen">
            <div className="phone-status-bar" aria-hidden="true">
              <span className="phone-time">9:41</span>
              <span className="phone-island"><span /></span>
              <svg className="phone-status-icons" viewBox="0 0 66 14" fill="currentColor">
                <path d="M0 10h3v4H0zm5-3h3v7H5zm5-3h3v10h-3zm5-3h3v13h-3z" />
                <path d="M23 4a14 14 0 0 1 19 0l-2 2a11 11 0 0 0-15 0zm4 4a8 8 0 0 1 11 0l-2 2a5 5 0 0 0-7 0zm4 4a2 2 0 0 1 3 0l-1.5 2z" />
                <rect x="47" y="2" width="16" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
                <rect x="49" y="4" width="12" height="6" rx="1" />
                <path d="M65 5v4" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
              </svg>
            </div>
            <Image src="/app/phone.webp" alt="NativePi in a phone browser, connected to an awake computer running its background work." width={390} height={844} sizes="(min-width: 1400px) 185px, (min-width: 960px) 13vw, 20vw" preload />
            <div className="phone-home-area" aria-hidden="true"><span /></div>
          </div>
        </div>
      </div>
      <p className="device-note">Your phone’s browser connects to your awake computer running NativePi background work.</p>
    </div>
  );
}
