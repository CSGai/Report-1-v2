import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import crypto from "node:crypto";
import readline from "node:readline/promises";

const jar = new CookieJar();
const sessionFetch = fetchCookie(fetch, jar);

const username = requireEnv("USER_ID");
const password = requireEnv("USER_PASSWORD");

// Entra tenant of idf.il and the application (client) id of the דוח 1 web app; fixed per site, not secrets
const TENANT_ID = "78820852-55fa-450b-908d-45c0d911e76b";
const CLIENT_ID = "f39dfb4b-6a50-42a5-98aa-829fc7414a10";
const LOGIN_BASE = "https://login.microsoftonline.com";
const SITE_URL = "https://one.prat.idf.il/";
const AUTH_COOKIES = ["ESTSAUTH", "ESTSAUTHPERSISTENT", "ESTSAUTHLIGHT"];

export async function login() {
    // initial tokens
    await sessionFetch(SITE_URL);
    console.log("grabbing initial tokens...\n");
    let { flowToken, ctx, canary, sessionId } = await getInitTokens();

    // login
    console.log("attempting login authentication...");
    ({ flowToken, ctx, canary, sessionId } = await postLogin(flowToken, ctx, canary, sessionId));

    const currentCookies = await getCookieStatus();
    if (AUTH_COOKIES.some(name => currentCookies.some(c => c.key === name))) {
        console.log("initial authentication successful!");
    }

    // Multi Factor Authentication
    console.log("user input is required for MFA!");
    console.log("attempting Multi factor authentication...");
    const mfaStatus = await multiFactorAuth(flowToken, ctx);
    if (!mfaStatus) {
        throw new Error("Multi factor authentication failed");
    }

    // final דוח 1 authentication sequence
    const authToken = await finalAuthentication();
    return { sessionFetch, authToken };
}

/*================ AUTHENTICATION SEQUENCE ================*/

// retrieves session tokens for further verification
async function getInitTokens() {
    const res = await sessionFetch(`${LOGIN_BASE}/`);
    const html = await res.text();
    return extractTokensCDATA(html);
}

// initial login post request line
async function postLogin(flowToken, ctx, canary, sessionId) {
    const auth = await sessionFetch(`${LOGIN_BASE}/${TENANT_ID}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            login: `${username}@idf.il`,
            passwd: password,
            flowToken: flowToken,
            type: 11,
            ctx: ctx,
            canary: canary,
            hpgrequestid: sessionId
        }),
        redirect: "follow"
    });

    // handle hiddenform in login response and nested hiddenform login within that
    const deviceLoginRedirect = await handleHiddenForm(await auth.text());
    const reprocessRedirect = await handleHiddenForm(await deviceLoginRedirect.text());

    // returns new CDATA tokens assuming MFA
    return extractTokensCDATA(await reprocessRedirect.text());
}

// multi factor authentication request line
// TODO: login() never passes `canary`, so ProcessAuth receives the string "undefined".
// The live flow works this way today; passing the real canary needs a live test first.
async function multiFactorAuth(flowToken, ctx, canary) {
    // post request that sends the sms to your device
    const beginAuth = await sessionFetch(`${LOGIN_BASE}/common/SAS/BeginAuth`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            AuthMethodId: "OneWaySMS",
            Method: "BeginAuth",
            flowToken: flowToken,
            ctx: ctx
        })
    });
    const beginAuthRes = await beginAuth.json();
    if (beginAuthRes["Success"] !== true) {
        console.error("BeginAuth failed:", beginAuthRes["Message"] ?? beginAuthRes);
        return false;
    }

    const smsCode = await promptSmsCode();

    // post request with the code given user input
    console.log("posting user input");
    const endAuth = await sessionFetch(`${LOGIN_BASE}/common/SAS/EndAuth`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            AuthMethodId: "OneWaySMS",
            Method: "EndAuth",
            AdditionalAuthData: smsCode,
            flowToken: beginAuthRes["FlowToken"],
            ctx: beginAuthRes["Ctx"],
            SessionId: beginAuthRes["SessionId"]
        })
    });
    const endAuthRes = await endAuth.json();
    if (endAuthRes["Success"] !== true) {
        console.error("EndAuth failed:", endAuthRes["Message"] ?? endAuthRes);
        return false;
    }

    const processAuth = await sessionFetch(`${LOGIN_BASE}/common/SAS/ProcessAuth`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            type: 18,
            GeneralVerify: false,
            login: `${username}@idf.il`,
            flowToken: endAuthRes["FlowToken"],
            ctx: endAuthRes["Ctx"],
            hpgrequestid: endAuthRes["SessionId"],
            mfaAuthMethod: "OneWaySMS",
            canary: canary
        })
    });

    return processAuth;
}

// final authentication with the actual site
async function finalAuthentication() {
    // generate PKCE challenge to handle antispam
    const { verifier, challenge } = generatePKCE();

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        client_info: "1",
        response_type: "code",
        state: crypto.randomUUID(),
        nonce: base64UrlEncode(crypto.randomBytes(16)),
        redirect_uri: SITE_URL,
        scope: "openid profile email offline_access",
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "none"
    });

    const auth = await sessionFetch(`${LOGIN_BASE}/${TENANT_ID}/oauth2/v2.0/authorize?${params}`, {
        redirect: "manual"
    });

    // extract redirect and code
    const redirectUrl = auth.headers.get("location");
    if (!redirectUrl) {
        throw new Error(`authorize did not redirect (HTTP ${auth.status})`);
    }
    const code = extract(redirectUrl, /code=([^&]+)/, "authorization code");

    // exchange code for access token
    const oauth2 = await sessionFetch(`${LOGIN_BASE}/${TENANT_ID}/oauth2/v2.0/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: "https://one.prat.idf.il"
        },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: SITE_URL,
            code_verifier: verifier
        })
    });
    const tokens = await oauth2.json();
    if (!tokens.id_token) {
        throw new Error(`token exchange failed: ${tokens.error_description ?? tokens.error ?? "no id_token in response"}`);
    }
    return tokens;
}

/*================ MISC ================*/

// reads a required environment variable or fails fast with a clear message
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`missing environment variable ${name} (see .env.example)`);
    }
    return value;
}

// reads the SMS code from the terminal
async function promptSmsCode() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await rl.question("Please enter SMS code here: ")).trim();
    } finally {
        rl.close();
    }
}

// returns the first capture group of regex in text, or throws naming what was missing
function extract(text, regex, name) {
    const match = text.match(regex);
    if (!match) {
        throw new Error(`could not find ${name} in response`);
    }
    return match[1];
}

// extracts session tokens from CDATA using regex
function extractTokensCDATA(html) {
    const flowToken = extract(html, /"sFT":"(.*?)"/, "sFT");
    const ctx = extract(html, /"sCtx":"(.*?)"/, "sCtx");
    const canary = extract(html, /"canary":"(.*?)"/, "canary");
    const sessionId = extract(html, /"sessionId":"(.*?)"/, "sessionId");

    return { flowToken, ctx, canary, sessionId };
}

// submits an html hiddenform and returns the response
async function handleHiddenForm(html) {
    const { target, inputs } = extractTokensHiddenForm(html);
    console.log("following hiddenform redirect:", target);
    return await sessionFetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(inputs),
        redirect: "follow"
    });
}

// extracts the target and hidden inputs from an html hiddenform using regex
function extractTokensHiddenForm(html) {
    // captures all inputs and values
    const regex = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g;
    const inputs = {};

    for (const match of html.matchAll(regex)) {
        inputs[match[1]] = match[2];
    }
    const target = extract(html, /name="hiddenform"[^>]*action="([^"]+)"/, "hiddenform action");

    return { target, inputs };
}

// logs and returns the cookies collected for the Microsoft login domain
async function getCookieStatus() {
    console.log("\ncollected cookies:");
    const cookies = await jar.getCookies(LOGIN_BASE);
    console.log(cookies.map(k => k.key));
    return cookies;
}

// base64url encoding helper
function base64UrlEncode(buffer) {
    return Buffer.from(buffer)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

// generate a random but valid PKCE verifier and challenge
function generatePKCE() {
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());
    return { verifier, challenge };
}
