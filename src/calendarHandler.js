const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const INSERT_FUTURE_REPORT_URL = "https://one.prat.idf.il/api/Attendance/InsertFutureReport";

// formats a Date as dd.mm.yyyy using the local calendar day
function formatReportDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

// returns { Date, WeekDay } for today and the following seven days
export function getNextSevenDays() {
    const today = new Date();
    const dates = [];

    for (let i = 0; i <= 7; i++) {
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + i);

        dates.push({ Date: formatReportDate(nextDate), WeekDay: WEEKDAYS[nextDate.getDay()] });
    }

    return dates;
}

// posts a single future report and returns the HTTP status with the response body
export async function updateCalendar(sessionFetch, MainCode, SecondaryCode, Note, FutureReportDate) {
    const form = new FormData();
    form.append("MainCode", MainCode);         // category
    form.append("SecondaryCode", SecondaryCode); // subcategory
    form.append("Note", Note);
    form.append("FutureReportDate", FutureReportDate);

    const res = await sessionFetch(INSERT_FUTURE_REPORT_URL, {
        method: "POST",
        headers: { "Accept": "application/json, text/plain, */*" },
        body: form
    });

    return { status: res.status, body: await res.text() };
}
