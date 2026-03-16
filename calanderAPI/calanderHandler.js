const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// returns valid dates for the next 7 days
function getNextSevenDays() {
    const dateObj = new Date();
    
    const dates = []
    for (var i = 0; i <= 7; i++) {
        const nextDate = new Date(dateObj);
        nextDate.setDate(dateObj.getDate() + i);

        const day = nextDate.getUTCDate().toString().padStart(2, "0");
        const month = (nextDate.getUTCMonth() + 1).toString().padStart(2, "0");
        const year = nextDate.getUTCFullYear();

        dates.push({"Date":`${day}.${month}.${year}`, "WeekDay": days[nextDate.getDay()]});
    }

    return dates;

}

async function updateCalander(sessionFetch, MainCode, SecondaryCode, Note, FutureReportDate) {
    const form = new FormData();
    // catagory
    form.append("MainCode", MainCode);
    // subcatagory
    form.append("SecondaryCode", SecondaryCode);

    form.append("Note", Note);
    form.append("FutureReportDate", FutureReportDate);

    const res = await sessionFetch(
        "https://one.prat.idf.il/api/Attendance/InsertFutureReport",
        {
            method: "POST",
            headers: {
                "Accept": "application/json, text/plain, */*"
            },
            body: form
        }
    );

    return await res.text();
}

export { getNextSevenDays, updateCalander };