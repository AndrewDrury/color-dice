/** Profile picker slot: shows the current avatar at once and loads the picker chunk on demand. */
import type { Profile } from "@cd/protocol";
import type { ComponentType, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "./Avatar";

export interface ProfileFieldProps {
  value: Profile;
  onChange: (p: Profile) => void;
}

export function ProfileField(props: ProfileFieldProps): JSX.Element {
  const [Picker, setPicker] = useState<ComponentType<ProfileFieldProps> | null>(null);
  useEffect(() => {
    let alive = true;
    import("./ProfilePicker").then((m) => alive && setPicker(() => m.ProfilePicker));
    return () => {
      alive = false;
    };
  }, []);
  return Picker ? <Picker {...props} /> : <Avatar profile={props.value} size={44} />;
}
