import { useAtom } from "jotai";
import { createSyncedPreferenceAtom } from "@/lib/ui-preferences/synced-preference-atom";
import { usePluginFrontendsSettled } from "@/lib/plugin-frontend-boot-state";
import { usePluginSlots } from "@/lib/plugin-slots";
import { SettingsSection } from "@/components/ui/settings-section";
import { ChoiceDropdownSetting } from "./ChoiceDropdownSetting";

const desktopStartPageAtom = createSyncedPreferenceAtom("startPage.desktop");
const mobileStartPageAtom = createSyncedPreferenceAtom("startPage.mobile");

export function StartPageSetting() {
  const [desktop, setDesktop] = useAtom(desktopStartPageAtom);
  const [mobile, setMobile] = useAtom(mobileStartPageAtom);
  const { navPanels } = usePluginSlots();
  const pluginsSettled = usePluginFrontendsSettled();
  const options = [
    { key: "/", title: "Home", description: "Start a new thread." },
    {
      key: "threads",
      title: "Thread list",
      description: "Open your sidebar thread list.",
    },
    ...navPanels.map((panel) => ({
      key: `/plugins/${panel.pluginId}/${panel.path}`,
      title: panel.title,
      description: `From ${panel.pluginId}.`,
    })),
  ];
  return (
    <SettingsSection title="Start page">
      <p className="mb-5 text-sm text-muted-foreground">
        Choose where bb opens when there is no restored layout. Links open
        their destination. Unavailable plugin pages open Home.
      </p>
      <div className="space-y-5">
        <ChoiceDropdownSetting
          label="Desktop"
          description="Desktop app and browser windows 768px or wider."
          triggerAriaLabel="Desktop start page"
          options={options}
          selected={
            options.find((option) => option.key === desktop) ?? {
              key: desktop,
              title: pluginsSettled ? "Unavailable page" : "Loading page…",
            }
          }
          onSelect={setDesktop}
        />
        <ChoiceDropdownSetting
          label="Mobile"
          description="Mobile app and browser windows below 768px."
          triggerAriaLabel="Mobile start page"
          options={options}
          selected={
            options.find((option) => option.key === mobile) ?? {
              key: mobile,
              title: pluginsSettled ? "Unavailable page" : "Loading page…",
            }
          }
          onSelect={setMobile}
        />
      </div>
    </SettingsSection>
  );
}
