import { login, getCookieStatus } from "./microsoftLogin.js";
import { getNextSevenDays, updateCalander } from "./calanderAPI/calanderHandler.js"
import plan from "./calanderAPI/weeklyCalanderPlan.json" assert { type: "json" };


async function main() {

    const { authToken, sessionFetch } = await login();
    await getCookieStatus();

    // log into דוח 1 with the microsoft authentication
    const loginAttempt = await sessionFetch("https://one.prat.idf.il/api/account/login", {
        method: "GET",
        headers: { "Authorization": authToken.id_token }
    }
    );
    const loginResponse = await loginAttempt.json();
    console.log("res:", loginResponse)



    const updateRes = await Promise.all(
        getNextSevenDays().map(date => {
            const dayData = plan[date.WeekDay];
            console.log(dayData);
            console.log(date.Date);
            return updateCalander(
                sessionFetch,
                dayData.MainCode,
                dayData.SecondaryCode,
                dayData.Note,
                date.Date
            );
        })
    );
    
    console.log(updateRes);

    process.exit();
}

main();