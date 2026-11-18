import { createGame, expect, joinGame, startGame, test } from "./fixtures";
import { closeAll, newPlayer } from "./helpers";

test("public list: listed rooms appear live and vanish on start; unlisted rooms join by code", async ({
  browser,
}) => {
  const tag = String(Date.now() % 100000);
  const listedName = `Open ${tag}`;
  const hiddenName = `Secret ${tag}`;
  const anon = await newPlayer(browser, "Anon");
  const host = await newPlayer(browser, "Hella");
  const hiddenHost = await newPlayer(browser, "Hugo");
  const guest = await newPlayer(browser, "Gina");
  const friend = await newPlayer(browser, "Finn");
  try {
    await anon.page.goto("/");
    await expect(anon.page.getByRole("button", { name: `Join ${listedName}` })).toHaveCount(0);

    const code = await createGame(host, { roomName: listedName, password: "pw-list", max: 2 });
    await expect(anon.page.getByRole("button", { name: `Join ${listedName}` })).toBeVisible({
      timeout: 2_000,
    });

    // Unlisted room: never shown, but joinable with code + password.
    const hiddenCode = await createGame(hiddenHost, {
      roomName: hiddenName,
      password: "pw-hide",
      max: 2,
      listed: false,
    });
    // Sync point: a later listed room is visible, so an earlier unlisted one would be too.
    const marker = await newPlayer(browser, "Mara");
    const markerName = `Marker ${tag}`;
    try {
      await createGame(marker, { roomName: markerName, password: "pw-mark", max: 2 });
      await expect(anon.page.getByRole("button", { name: `Join ${markerName}` })).toBeVisible({
        timeout: 2_000,
      });
      await expect(anon.page.getByText(hiddenName)).toHaveCount(0);
    } finally {
      await closeAll([marker]);
    }
    await joinGame(friend, hiddenCode, "pw-hide");
    await expect(hiddenHost.page.getByText("Finn").first()).toBeVisible();

    // Starting removes the listed room from the list.
    await joinGame(guest, code, "pw-list", listedName);
    await startGame(host);
    await expect(anon.page.getByRole("button", { name: `Join ${listedName}` })).toHaveCount(0, {
      timeout: 5_000,
    });
  } finally {
    await closeAll([anon, host, hiddenHost, guest, friend]);
  }
});
