import { useAtom } from "jotai";
import { createSyncedPreferenceAtom } from "@/lib/ui-preferences/synced-preference-atom";
import { usePluginFrontendsSettled } from "@/lib/plugin-frontend-boot-state";
import { usePluginSlots } from "@/lib/plugin-slots";
import { SettingsSection } from "@/components/ui/settings-section";
import { ChoiceDropdownSetting } from "./ChoiceDropdownSetting";

const desktopHomepageAtom = createSyncedPreferenceAtom("homepage.desktop");
const mobileHomepageAtom = createSyncedPreferenceAtom("homepage.mobile");

export function HomepageSetting() {
  const [desktop, setDesktop] = useAtom(desktopHomepageAtom);
  const [mobile, setMobile] = useAtom(mobileHomepageAtom);
  const { navPanels } = usePluginSlots();
  const pluginsSettled = usePluginFrontendsSettled();
  const options = [
    { key: "/", title: "bb Home (default)", description: "Start a new thread." },
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
    <SettingsSection title="Homepage">
      <p className="mb-5 text-sm text-muted-foreground">
        Choose where the Home button takes you and where bb opens without a
        restored layout. Unavailable plugin pages open bb Home.
      </p>
      <div className="space-y-5">
        <ChoiceDropdownSetting
          label="Desktop"
          description="Desktop app and all web browsers, including phone browsers."
          triggerAriaLabel="Desktop homepage"
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
          label="Mobile app"
          description="The bb mobile app, at any window size."
          triggerAriaLabel="Mobile app homepage"
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
