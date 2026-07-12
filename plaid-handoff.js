/*
 * plaid-handoff.js — OAuth-return handler for marshon.holdings/plaid.html
 *
 * Runs ONLY in the browser, as the registered Plaid redirect_uri target.
 * Its sole job is to let Plaid Link complete the OAuth handshake after a
 * bank (Chase/BofA/NFCU/...) redirects back here with an oauth_state_id.
 *
 * SECURITY (Cyra spec) — what this file deliberately does NOT do:
 *   - It holds NO Plaid `secret`. Never. The secret lives only on the local
 *     machine (1Password, op-loaded at runtime).
 *   - It performs NO public_token -> access_token exchange. That happens
 *     exclusively on the local machine (link.py), never client-side.
 *   - It contains NO client_id (Link doesn't need it — the link_token,
 *     minted server-side, already carries it) and NO hardcoded
 *     link_token / access_token.
 *   - It loads NO analytics, tag manager, or any third-party script. The
 *     only external script on the page is Plaid's official Link loader.
 *
 * The local link.py retrieves the resulting public_token via
 * /link/token/get (server-side, on the machine that holds the secret), so
 * this page never needs to transmit a token anywhere.
 */
(function () {
  "use strict";

  var LINK_TOKEN_KEY = "plaid_link_token"; // set by the launcher, same origin

  function setState(headline, message, submessage) {
    var h = document.getElementById("headline");
    var m = document.getElementById("message");
    var s = document.getElementById("submessage");
    if (h) { h.textContent = headline; }
    if (m) { m.innerHTML = message; }
    if (s) { s.textContent = submessage || ""; }
  }

  var params = new URLSearchParams(window.location.search);
  var oauthStateId = params.get("oauth_state_id");

  // No OAuth state in the URL -> this is a plain completion landing (e.g.
  // Plaid's Hosted Link completion_redirect_uri). Leave the default
  // "Connection complete" content in place and do nothing else.
  if (!oauthStateId) {
    return;
  }

  // OAuth return path: re-initialize Link with the received redirect so
  // Plaid can finish the handshake for the in-flight session.
  if (typeof Plaid === "undefined") {
    setState(
      "Couldn’t finish the connection",
      "The secure connection library didn’t load. Please return to your " +
        "machine and start the connection again.",
      ""
    );
    return;
  }

  var linkToken = null;
  try {
    linkToken = window.localStorage.getItem(LINK_TOKEN_KEY);
  } catch (e) {
    linkToken = null;
  }

  if (!linkToken) {
    // The in-flight session token isn't present in this browser's storage
    // (e.g. a different browser/profile finished the OAuth step). The local
    // pipeline can still recover the session server-side; guide the user
    // back rather than exposing anything.
    setState(
      "Almost there",
      "Return to your machine to finish linking this account. If it doesn’t " +
        "complete automatically, start the connection again from the setup " +
        "step.",
      ""
    );
    return;
  }

  setState(
    "Finishing your connection…",
    "Please keep this tab open for a moment while we securely finish " +
      "linking your account.",
    ""
  );

  var handler = Plaid.create({
    token: linkToken,
    receivedRedirectUri: window.location.href,
    onSuccess: function () {
      // NO exchange here — the local machine picks up the public_token
      // server-side via /link/token/get. Just confirm to the user.
      try { window.localStorage.removeItem(LINK_TOKEN_KEY); } catch (e) {}
      setState(
        "Connection complete",
        "Your account has been securely linked. You can " +
          "<strong>close this tab</strong> and return to your machine.",
        "This page collects no information, sets no cookies, and uses no " +
          "tracking."
      );
    },
    onExit: function (err) {
      var detail = err && err.display_message
        ? err.display_message
        : "The connection was not completed.";
      setState(
        "Connection not completed",
        detail + " You can return to your machine and try again.",
        ""
      );
    }
  });

  handler.open();
})();
