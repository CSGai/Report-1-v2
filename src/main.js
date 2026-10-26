import { login } from "./microsoftLogin.js";
import { getReportDays, updateCalendar } from "./calendarHandler.js";
import plan from "../config/weeklyCalendarPlan.json" with { type: "json" };

const SITE_LOGIN_URL = "https://one.prat.idf.il/api/account/login";

// fails before any network call if the plan is missing a weekday
function validatePlan(days) {
    const missing = days.filter(({ WeekDay }) => !plan[WeekDay]).map(d => d.WeekDay);
    if (missing.length > 0) {
        throw new Error(`config/weeklyCalendarPlan.json has no entry for: ${missing.join(", ")}`);
    }
}

async function main() {
    const days = getReportDays();
    validatePlan(days);

    const { authToken, sessionFetch } = await login();

    // log into דוח 1 with the Microsoft id_token
    const loginAttempt = await sessionFetch(SITE_LOGIN_URL, {
        method: "GET",
        headers: { "Authorization": authToken.id_token }
    });
    if (!loginAttempt.ok) {
        throw new Error(`דוח 1 login failed with HTTP ${loginAttempt.status}: ${await loginAttempt.text()}`);
    }
    console.log(`דוח 1 login succeeded (HTTP ${loginAttempt.status})`);

    // submit one future report for today and each of the next seven days
    const results = await Promise.allSettled(
        days.map(({ Date: date, WeekDay }) => {
            const { MainCode, SecondaryCode, Note } = plan[WeekDay];
            return updateCalendar(sessionFetch, MainCode, SecondaryCode, Note, date);
        })
    );

    console.table(results.map((result, i) => ({
        date: days[i].Date,
        weekday: days[i].WeekDay,
        status: result.status === "fulfilled" ? result.value.status : "error",
        response: result.status === "fulfilled" ? result.value.body : String(result.reason)
    })));

    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) {
        throw new Error(`${failed} of ${results.length} reports failed`);
    }
}

main().catch(err => {
    console.error("Run failed:", err.message ?? err);
    process.exitCode = 1;
});
