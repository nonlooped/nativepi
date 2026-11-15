import Image from "next/image";

export function Devices() {
  return (
    <div className="devices">
      <div className="device-stage">
        <div className="desktop-device">
          <Image src="/app/desktop.webp" alt="The NativePi desktop app showing a conversation about the project, with its composer and dithered Mist landscape." width={1280} height={840} sizes="(min-width: 1400px) 770px, (min-width: 960px) 52vw, 76vw" preload />
        </div>
        <div className="phone-device">
          <Image src="/app/phone.webp" alt="The same NativePi workspace open on a phone through browser access." width={390} height={844} sizes="(min-width: 1400px) 185px, (min-width: 960px) 13vw, 20vw" preload />
        </div>
      </div>
      <p className="device-note">Your workspace, on your phone too.</p>
    </div>
  );
}
