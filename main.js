import { login, getCookieStatus } from "./microsoftLogin.js";
import { FormData } from "node-fetch";


async function main() {

    const { authToken, sessionFetch } = await login();
    await getCookieStatus();

    // log into דוח 1 with the microsoft authentication
    const loginAttempt = await sessionFetch("https://one.prat.idf.il/api/account/login", {
            method: "GET",
            headers: {"Authorization": authToken.id_token}
        }
    );
    const loginResponse = await loginAttempt.json();
    console.log("res:", loginResponse)


    // const form = new FormData();
    // // type
    // form.append("MainCode", "02");
    // // subtype
    // form.append("SecondaryCode", "32");
    // form.append("Note", "");
    // form.append("FutureReportDate", "23.03.2026");

    // const res = await sessionFetch(
    //     "https://one.prat.idf.il/api/Attendance/InsertFutureReport",
    //     {
    //         method: "POST",
    //         headers: {
    //             "Accept": "application/json, text/plain, */*"
    //         },
    //         body: form
    //     }
    // );

    // console.log(await res.text());

    process.exit();
}

main();