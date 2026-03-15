import { login, getCookieStatus } from "./microsoftLogin.js";


async function main() {

    const { authToken, sessionFetch } = await login();
    await getCookieStatus();

    const loginAttempt = await sessionFetch("https://one.prat.idf.il/api/account/login", {
            method: "GET",
            headers: {"Authorization": authToken.id_token}
        }
    );
    const loginResponse = await loginAttempt.json();
    console.log("res:", loginResponse)

    process.exit();
}

main();