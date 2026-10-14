/*
 * tesana-desktop.js — injected by build/build-game.mjs (--target desktop) as a
 * classic script, after tesana-shell.js and before tesana-play.js.
 *
 * Why it exists
 * -------------
 * On the web a game is loaded into an iframe on a Tesana page. That page posts
 * the play SDK a bootstrap naming the game and carrying a player token; the SDK
 * waits for it, and an answer that never comes reads as `offline`. In a desktop
 * window there is no page above us, so without this file every Steam player
 * boots as a local-only guest with the shop dark — correct behaviour for a
 * hostless web page, wrong for the thing we ship on a storefront.
 *
 * So this script says what the page would have said. It reads the game's
 * identity out of the `#tesana-desktop` block the build wrote next to it and
 * puts it on `window.__TESANA__` in the same shape a host posts, before the SDK
 * runs and before the game's first line.
 *
 * Scope: identity and address only — deliberately no credential.
 *
 * The coin economy is switched off for Steam builds, and this file is where
 * that is enforced rather than merely assumed. A pack needs a price and a
 * checkout page; `economy.topUp` and `shop.buy` ask the host to run checkout
 * through postMessage, and a window with no Tesana page above it has no host to
 * ask. With no endpoint and no token the SDK's own guards do the rest: reads
 * answer empty, writes surface an error. That is the behaviour a game already
 * has to survive on the web, so nothing in a game has to change for desktop.
 *
 * Saves follow the same rule. A Steam build syncs through Steam Cloud (see the
 * `cloud` capability below), not through the play service, so no player token
 * is minted or stored here — there is nothing in this file worth stealing from
 * a player who opens devtools, which is the property that lets it ship at all.
 */
(function () {
  "use strict";
  var VERSION = "1.0.0";

  // The build writes this block immediately before this script. Absent or
  // malformed means a hand-assembled directory: fall back to the page title
  // rather than refusing to boot, because a broken identity still beats a
  // black window — saves go local and the game plays.
  var config = {};
  try {
    var block = document.getElementById("tesana-desktop");
    if (block) config = JSON.parse(block.textContent) || {};
  } catch (e) {
    /* defaults below */
  }

  // Preload exposes native facts here (contextIsolation is on, so this is the
  // only channel between the Electron side and the page). Undefined means this
  // build is being opened in an ordinary browser — which is a supported thing
  // to do with an export — so everything below degrades to "no native side".
  var native = window.__TESANA_DESKTOP__ || null;
  var facts = (native && native.facts) || {};

  var gameId = String(config.gameId || "").trim();
  var rail = String(config.rail || "steam");

  // The block the host page would have posted, in the host's own shape. Kept
  // as a merge rather than an assignment: `waitBootstrap` treats a baked
  // bootstrap that already carries a token as authoritative, so a future
  // online build can pre-seed one without this file fighting it.
  var baked = window.__TESANA__ || {};
  window.__TESANA__ = {
    gameId: gameId,
    publicId: gameId,
    rail: rail,
    // No endpoint and no token by design — see the header. `offline: true`
    // states that as a fact rather than leaving the SDK to infer it.
    offline: true,
    ...(baked.token ? { token: baked.token } : {}),
    ...(baked.endpoint ? { endpoint: baked.endpoint } : {}),
    ...(facts.steamAppId ? { steamAppId: facts.steamAppId } : {}),
    ...(facts.platform ? { platform: facts.platform } : {}),
  };

  /**
   * What the page can ask the native side to do.
   *
   * Every method answers a value and never throws, including when there is no
   * native side at all. A game that asks for an achievement on a browser tab
   * should miss its trophy quietly; it should not take the game-over screen
   * down with it. Callers get `{ ok: false, reason }` instead.
   */
  var unavailable = function (reason) {
    return Promise.resolve({ ok: false, reason: reason });
  };

  var steam = native && native.steam
    ? native.steam
    : {
        available: false,
        playerName: null,
        unlockAchievement: function () { return unavailable("no_native"); },
        isUnlocked: function () { return Promise.resolve(false); },
        player: function () { return Promise.resolve(null); },
        cloudRead: function () { return unavailable("no_native"); },
        cloudWrite: function () { return unavailable("no_native"); },
      };

  window.TesanaDesktop = {
    version: VERSION,
    gameId: gameId,
    // Whether a native process is underneath us. False in a plain browser,
    // which is how an exported build behaves when someone double-clicks
    // index.html without the wrapper.
    embedded: Boolean(native),
    platform: facts.platform || "browser",
    // Steam's own availability, which is separate from `embedded`: the wrapper
    // runs fine with no Steam client running, and a game should be able to tell
    // those two states apart.
    steamAvailable: Boolean(steam.available),
    // The player's Steam name when there is one, so a "Welcome back" needs no
    // round trip. The async `steam.player()` is the authority; this is the
    // pre-resolution that a title screen can read on its first frame.
    playerName: steam.playerName || null,
    message: native && native.message ? native.message : null,
    quit: native && native.quit ? native.quit : function () { return unavailable("no_native"); },
    toggleFullscreen: native && native.toggleFullscreen
      ? native.toggleFullscreen
      : function () { return unavailable("no_native"); },
    steam: steam,
  };

  // Tell the shell there is a player, so nothing downstream waits on a host
  // page that is never going to answer.
  if (native) native.booted(config);
})();
