import { useState } from "preact/hooks";
import { getHistory, HISTORY_CAP, type HistoryEntry } from "../history";
import { t, useT } from "../i18n";
import { AvatarHover } from "./AvatarHover";

function relativeTime(at: number): string {
  const seconds = Math.round((at - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const unit: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [name, size] of unit) {
    if (abs >= size)
      return new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(
        Math.round(seconds / size),
        name,
      );
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(seconds, "second");
}

function resultText(result: HistoryEntry["result"]): string {
  return result === "W"
    ? t("profile.resultWin")
    : result === "T"
      ? t("profile.resultTie")
      : t("profile.resultLoss");
}

export function HistoryList() {
  useT();
  const [limit, setLimit] = useState(20);
  const history = [...getHistory()]
    .sort((a, b) => b.at - a.at || b.game - a.game)
    .slice(0, HISTORY_CAP);
  return (
    <section class="profile-history" aria-label={t("profile.historyAria")}>
      <h3>{t("profile.history")}</h3>
      {history.length === 0 ? (
        <p class="muted">{t("profile.historyEmpty")}</p>
      ) : (
        <ol class="profile-history-list">
          {history.slice(0, limit).map((entry) => {
            const opponents = entry.opponents ?? [];
            const participants = [
              ...(entry.myScore !== undefined
                ? [
                    {
                      name: t("profile.you"),
                      score: entry.myScore,
                      profile: undefined,
                      isYou: true,
                    },
                  ]
                : []),
              ...opponents.map((o) => ({
                name: o.name,
                score: o.score,
                profile: { color: o.colour, cat: o.cat },
                isYou: false,
              })),
            ].sort((a, b) => b.score - a.score);
            return (
              <li key={`${entry.code}:${entry.game}`} class="profile-history-row">
                <span class={`profile-result result-${entry.result.toLowerCase()}`} role="status">
                  {entry.result === "W" ? "✓ " : entry.result === "T" ? "= " : "× "}
                  {resultText(entry.result)}
                </span>
                <time
                  datetime={new Date(entry.at).toISOString()}
                  title={new Date(entry.at).toLocaleString()}
                >
                  {relativeTime(entry.at)}
                </time>
                {participants.length ? (
                  <div class="profile-scores">
                    <div class="profile-opponents">
                      {participants.map((p) =>
                        p.profile ? (
                          <AvatarHover key={p.name} profile={p.profile} name={p.name} size={28} />
                        ) : null,
                      )}
                    </div>
                    <span class="profile-score-list">
                      {participants.map((p, i) => (
                        <>
                          {i > 0 ? " – " : null}
                          {p.isYou ? (
                            <strong class="profile-you-score">
                              {p.name} {p.score}
                            </strong>
                          ) : (
                            <span>
                              {p.name} {p.score}
                            </span>
                          )}
                        </>
                      ))}
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {history.length > limit ? (
        <button type="button" class="btn" onClick={() => setLimit((n) => n + 20)}>
          {t("profile.showMore")}
        </button>
      ) : null}
    </section>
  );
}
