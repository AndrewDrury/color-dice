/** T-NEW-32: colours other seats hold, fetched before joining; preselects a free one. */
import { PROFILE_COLORS, type Profile, type ProfileColor } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { ApiError, getTakenColors } from "./api";

type SetProfile = (f: (p: Profile) => Profile) => void;

export function useTakenColors(code: string, setProfile: SetProfile) {
  const [taken, setTaken] = useState<ProfileColor[]>([]);
  const apply = (list: ProfileColor[]) => {
    setTaken(list);
    setProfile((p) => {
      const free = PROFILE_COLORS.find((c) => !list.includes(c));
      return list.includes(p.color) && free ? { ...p, color: free } : p;
    });
  };
  useEffect(() => {
    let alive = true;
    getTakenColors(code)
      .then((r) => alive && apply(r.taken))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code]);
  /** A lost race: the error's reason lists the taken colours. */
  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.code === "E_COLOUR_TAKEN" && err.reason) {
      apply(
        err.reason
          .split(",")
          .filter((c): c is ProfileColor => PROFILE_COLORS.includes(c as ProfileColor)),
      );
    }
  };
  return { taken, onError };
}
