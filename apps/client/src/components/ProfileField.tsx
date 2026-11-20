/**
 * Profile slot (T-NEW-15): the large avatar preview sits left of the name field (passed as
 * children); the colour + cat picker below loads as a lazy chunk.
 */
import type { Profile } from "@cd/protocol";
import type { ComponentChildren, ComponentType, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "./Avatar";
import "../styles/profile.css";

export interface ProfileFieldProps {
  value: Profile;
  onChange: (p: Profile) => void;
}

/** Preview size: within the 80–96 px desktop target and ≥ 72 px at 360 px. */
export const PREVIEW_SIZE = 80;

export function ProfileField(
  props: ProfileFieldProps & { children?: ComponentChildren },
): JSX.Element {
  const [Picker, setPicker] = useState<ComponentType<ProfileFieldProps> | null>(null);
  useEffect(() => {
    let alive = true;
    import("./ProfilePicker").then((m) => alive && setPicker(() => m.ProfilePicker));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div class="pf stack">
      <div class="pf-head">
        <Avatar profile={props.value} size={PREVIEW_SIZE} class="pf-av" />
        {props.children ? <div class="pf-name">{props.children}</div> : null}
      </div>
      {Picker ? <Picker value={props.value} onChange={props.onChange} /> : null}
    </div>
  );
}
