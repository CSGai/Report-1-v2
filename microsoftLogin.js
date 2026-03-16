import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import crypto from "crypto";

const jar = new CookieJar();
const sessionFetch = fetchCookie(fetch, jar);

const username = process.env.USER_ID;
const password = process.env.USER_PASSWORD;
const clientId = process.env.CLIENT_ID;


export async function login() {
    // initial tokens
    await sessionFetch("https://one.prat.idf.il/");
    console.log("grabbing initial tokens...\n")
    let { flowToken, ctx, canary, sessionId } = await getInitTokens();

    // login
    console.log("attempting login authentication...");
    ({ flowToken, ctx, canary, sessionId } = await postLogin(flowToken, ctx, canary, sessionId));

    var currentCookies = await getCookieStatus();
    const authCookies = ["ESTSAUTH", "ESTSAUTHPERSISTENT", "ESTSAUTHLIGHT",];
    if (authCookies.some(name => currentCookies.some(c => c.key === name))) console.log("initial authentication successful!");


    // Multi Factor Authentication
    console.log("user input is required for MFA!");
    console.log("attempting Multi factor authentication...");
    const mfaStatus = await multiFactorAuth(flowToken, ctx);
    
    if (mfaStatus) {
        // final דוח 1 authentication sequence
        const authToken = await finalAuthentication();
        console.log(authToken);
        return { sessionFetch, authToken };
    }
    
    console.error("Authentication Failed!");
    process.exit(1);
}



/*================ AUTHENTICATION SEQUENCE ================*/

// retrieves session tokens for further verification
async function getInitTokens() {
    const res = await sessionFetch("https://login.microsoftonline.com/");
    const html = await res.text();
    return extractTokensCDATA(html);
}

// initial login post request line
async function postLogin(flowToken, ctx, canary, sessionId) {
    const auth = await sessionFetch(
        "https://login.microsoftonline.com/78820852-55fa-450b-908d-45c0d911e76b/login",
        {
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
        }
    )

    // handle hiddenform in login respose and nested hiddenform login within that
    const deviceLoginRedirect = await handleHiddenForm(await auth.text());
    const reprocessRedirect = await handleHiddenForm(await deviceLoginRedirect.text());

    // returns new CDATA tokens assuming MFA
    return extractTokensCDATA(await reprocessRedirect.text());
}

// multi factor authentication request line
async function multiFactorAuth(flowToken, ctx, canary) {
    // post request that sends the sms to your device
    const beginAuth = await sessionFetch(
        "https://login.microsoftonline.com/common/SAS/BeginAuth",
        {
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
            }),
        }
    )
    const beginAuthRes = await beginAuth.json();
    console.log("Please enter SMS code here:");
    const smsCode = await new Promise(resolve => {
        process.stdin.once('data', data => resolve(data.toString().trim()));
    });

    if (beginAuthRes["Success"] == true) {
        // post request with the code given user input 
        console.log("posting user input")
        const endAuth = await sessionFetch(
            "https://login.microsoftonline.com/common/SAS/EndAuth",
            {
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
                }),
            }
        )

        const endAuthRes = await endAuth.json();
        if (endAuthRes["Success"] === true) {
            const processAuth = await sessionFetch(
                "https://login.microsoftonline.com/common/SAS/ProcessAuth",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        type: 18,
                        GeneralVerify: false,
                        login: username + "@idf.il",
                        flowToken: endAuthRes["FlowToken"],
                        ctx: endAuthRes["Ctx"],
                        hpgrequestid: endAuthRes["SessionId"],
                        mfaAuthMethod: "OneWaySMS",
                        canary: canary
                    }),
                }
            );

            // const processAuthRes =  extractTokensCDATA(await processAuth.text())
            return processAuth;
        }
    }
    return false;
}

// final authentication with the actual site
async function finalAuthentication() {
    // generate PKCE challenge to handle antispam
    const { verifier, challenge } = generatePKCE()

    const params = new URLSearchParams({
        client_id: clientId,
        client_info:"1",
        response_type: "code",
        state: crypto.randomUUID(),
        nonce: base64UrlEncode(crypto.randomBytes(16)),
        redirect_uri: "https://one.prat.idf.il/",
        scope: "openid profile email offline_access",
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "none"
    });

    const auth = await sessionFetch(
        `https://login.microsoftonline.com/78820852-55fa-450b-908d-45c0d911e76b/oauth2/v2.0/authorize?${params}`,
        { redirect: "manual" }
    );

    // extract redirect and code
    console.log(auth.status);
    console.log(auth.headers.get("location"));
    const redirectUrl = auth.headers.get("location");
    const code = redirectUrl.match(/code=([^&]+)/)[1];

    console.log("OAuth code:", code);

    // exchange code for access token
    const oauth2 = await sessionFetch(
        "https://login.microsoftonline.com/78820852-55fa-450b-908d-45c0d911e76b/oauth2/v2.0/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Origin: "https://one.prat.idf.il"
            },
            body: new URLSearchParams({
                client_id: "f39dfb4b-6a50-42a5-98aa-829fc7414a10",
                grant_type: "authorization_code",
                code: code,
                redirect_uri: "https://one.prat.idf.il/",
                code_verifier: verifier
            })
        }
    );
    return await oauth2.json();
}


/*================ MISC ================*/

// extracts session tokens from CDATA using regex
function extractTokensCDATA(html) {
    // console.log(html.match(/\/\/<!\[CDATA\[(.*?)\/\/\]\]>/s)[1]);
    const flowToken = html.match(/"sFT":"(.*?)"/)[1];
    const ctx = html.match(/"sCtx":"(.*?)"/)[1];
    const canary = html.match(/"canary":"(.*?)"/)[1];
    const sessionId = html.match(/"sessionId":"(.*?)"/)[1];

    return { flowToken, ctx, canary, sessionId }
}

async function handleHiddenForm(html) {
    const { target, inputs } = extractTokensHiddenForm(html);
    console.log(`\n\n${target}:\n`);
    for (const [key, value] of Object.entries(inputs)) console.log(key, ":", value);
    return await sessionFetch(
        target,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(inputs),
            redirect: "follow"
        }
    )
}
// extracts session tokens from html hiddenfo using regex
function extractTokensHiddenForm(html) {
    // captures all inputs and values
    const regex = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g;
    const inputs = {};

    for (const match of html.matchAll(regex)) {
        inputs[match[1]] = match[2];
    }
    const target = html.match(/name="hiddenform"[^>]*action="([^"]+)"/)?.[1];

    return { target, inputs };
}

// cookie status
export async function getCookieStatus() {
    // cookie check
    console.log("\ncollected cookies:");
    const cookies = await jar.getCookies("https://login.microsoftonline.com");
    console.log(cookies.map(k => k.key));
    return cookies;
}

// based 64 urlencoding stuff
function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// generate a random but valid PKCE verifier and challenger
function generatePKCE() {
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}