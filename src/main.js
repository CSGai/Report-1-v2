import { login } from "./microsoftLogin.js";
import { getNextSevenDays, updateCalendar } from "./calendar/calendarHandler.js";
import plan from "../config/weeklyCalendarPlan.json" with { type: "json" };

async function main() {
    const { authToken, sessionFetch } = await login();

    // log into דוח 1 with the Microsoft id_token
    const loginAttempt = await sessionFetch("https://one.prat.idf.il/api/account/login", {
        method: "GET",
        headers: { "Authorization": authToken.id_token }
    });
    const loginResponse = await loginAttempt.json();
    console.log("דוח 1 login:", loginResponse);

    // submit one future report per day for the coming week
    const results = await Promise.all(
        getNextSevenDays().map(({ Date, WeekDay }) => {
            const { MainCode, SecondaryCode, Note } = plan[WeekDay];
            return updateCalendar(sessionFetch, MainCode, SecondaryCode, Note, Date)
                .then(res => ({ date: Date, weekday: WeekDay, response: res }));
        })
    );

    console.table(results);
    process.exit(0);
}

main().catch(err => {
    console.error("Run failed:", err);
    process.exit(1);
});
