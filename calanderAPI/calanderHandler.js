export function nextSevenDays() {
    const dateObj = new Date();

    const dates = []
    for (var i = 0; i < 7; i++) {
        const nextDate = new Date(dateObj);
        nextDate.setDate(dateObj.getDate() + i);

        const day = nextDate.getUTCDate().toString().padStart(2, "0");
        const month = (nextDate.getUTCMonth() + 1).toString().padStart(2, "0");
        const year = nextDate.getUTCFullYear();

        dates.push(`${day}.${month}.${year}`);
    }

    return dates;

}

// nextSevenDays();