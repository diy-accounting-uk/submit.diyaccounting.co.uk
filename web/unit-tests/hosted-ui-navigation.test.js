import { describe, it, expect } from "vitest";
import {
  hasReachedHostedUi,
  hostedUiFormFailureMessage,
  hostedUiRedirectFailureMessage,
} from "../../behaviour-tests/helpers/hosted-ui-navigation.js";

const appOrigin = "https://submit.diyaccounting.co.uk";

describe("hasReachedHostedUi", () => {
  it("is false while the browser is still on the app's own login page", () => {
    expect(hasReachedHostedUi(`${appOrigin}/auth/login.html`, appOrigin)).toBe(false);
  });

  it("is false for any other page on the app origin", () => {
    expect(hasReachedHostedUi(`${appOrigin}/`, appOrigin)).toBe(false);
    expect(hasReachedHostedUi(`${appOrigin}/auth/loginWithCognitoCallback.html?code=abc`, appOrigin)).toBe(false);
  });

  it("is true on a custom Cognito auth domain", () => {
    expect(hasReachedHostedUi("https://prod-auth.diyaccounting.co.uk/oauth2/authorize?client_id=x", appOrigin)).toBe(true);
  });

  it("is true on an amazoncognito.com hosted domain", () => {
    expect(hasReachedHostedUi("https://example.auth.eu-west-2.amazoncognito.com/login?client_id=x", appOrigin)).toBe(true);
  });

  it("is false for a blank or unparseable page", () => {
    expect(hasReachedHostedUi("about:blank", appOrigin)).toBe(false);
    expect(hasReachedHostedUi("", appOrigin)).toBe(false);
  });
});

describe("hostedUiRedirectFailureMessage", () => {
  it("names the attempt count and the page the browser is stuck on", () => {
    const message = hostedUiRedirectFailureMessage({
      attempts: 3,
      currentUrl: `${appOrigin}/auth/login.html`,
      pageTitle: "DIY Accounting Submit - Login",
      statusText: "",
    });
    expect(message).toContain("after 3 click(s)");
    expect(message).toContain(`${appOrigin}/auth/login.html`);
    expect(message).toContain("DIY Accounting Submit - Login");
    expect(message).not.toContain("Page status message");
  });

  it("includes the on-page status message when the app showed one", () => {
    const message = hostedUiRedirectFailureMessage({
      attempts: 1,
      currentUrl: `${appOrigin}/auth/login.html`,
      pageTitle: "Login",
      statusText: "Sign-in is unavailable because the site configuration failed to load.",
    });
    expect(message).toContain("Page status message: Sign-in is unavailable");
  });
});

describe("hostedUiFormFailureMessage", () => {
  it("names the attempt count and the Hosted UI page", () => {
    const message = hostedUiFormFailureMessage({
      attempts: 3,
      currentUrl: "https://prod-auth.diyaccounting.co.uk/login?client_id=x",
      pageTitle: "Signin",
      errorText: "",
    });
    expect(message).toContain("after 3 attempt(s)");
    expect(message).toContain("prod-auth.diyaccounting.co.uk");
    expect(message).not.toContain("Hosted UI error");
  });

  it("includes the Cognito error text when the Hosted UI showed one", () => {
    const message = hostedUiFormFailureMessage({
      attempts: 2,
      currentUrl: "https://prod-auth.diyaccounting.co.uk/error?client_id=x",
      pageTitle: "Error",
      errorText: "An error was encountered with the requested page.",
    });
    expect(message).toContain("Hosted UI error: An error was encountered with the requested page.");
  });
});
