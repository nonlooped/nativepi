import AboutSettings from "./AboutSettings.tsx";
import GeneralSettings from "./GeneralSettings.tsx";

/** NativePi behavior and maintenance that does not change how Pi runs a turn. */
export default function SystemSettings() {
  return (
    <div className="flex flex-col gap-12">
      <GeneralSettings />
      <AboutSettings />
    </div>
  );
}
