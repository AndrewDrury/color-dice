import type { PublicGame } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { GameRow, ROW_ANIM_MS } from "./GameRow";

export interface GameListProps {
  /** Latest live list; null until the first `games` message. */
  games: PublicGame[] | null;
  onJoin: (game: PublicGame) => void;
}

interface Item {
  game: PublicGame;
  leaving: boolean;
}

/** Re-render relative times this often. */
const TICK_MS = 30_000;

/**
 * Live list of open games. Rows that drop out of the list stay for 220 ms (fading out,
 * disabled) so the list doesn't jump; new rows fade in.
 */
export function GameList({ games, onJoin }: GameListProps) {
  useT();
  const [items, setItems] = useState<Item[]>(() =>
    (games ?? []).map((game) => ({ game, leaving: false })),
  );
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    const pending = timers.current;
    return () => {
      clearInterval(t);
      for (const id of pending.values()) clearTimeout(id);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    const next = games ?? [];
    const live = new Set(next.map((g) => g.code));
    setNow(Date.now());
    setItems((prev) => {
      const out: Item[] = next.map((game) => ({ game, leaving: false }));
      for (const code of live) {
        const t = timers.current.get(code);
        if (t !== undefined) clearTimeout(t);
        timers.current.delete(code);
      }
      // Keep vanished rows at their old position while they fade out.
      prev.forEach((item, i) => {
        if (live.has(item.game.code)) return;
        out.splice(Math.min(i, out.length), 0, { game: item.game, leaving: true });
        if (!timers.current.has(item.game.code)) {
          const code = item.game.code;
          timers.current.set(
            code,
            setTimeout(() => {
              timers.current.delete(code);
              setItems((cur) => cur.filter((it) => !(it.leaving && it.game.code === code)));
            }, ROW_ANIM_MS),
          );
        }
      });
      return out;
    });
  }, [games]);

  if (games === null) {
    return <p class="muted">{t("home.looking")}</p>;
  }
  if (games.length === 0 && items.every((it) => it.leaving)) {
    return <p class="muted">{t("home.noGames")}</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label={t("home.openGamesAria")}>
      {items.map((it) => (
        <GameRow key={it.game.code} game={it.game} now={now} leaving={it.leaving} onJoin={onJoin} />
      ))}
    </ul>
  );
}
