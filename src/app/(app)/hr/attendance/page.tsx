import { PageHeader } from "@/components/app/page-header";
import { AttendanceMonthGrid } from "@/components/hr/attendance-month-grid";
import { AttendanceSheet } from "@/components/hr/attendance-sheet";
import { SegmentLinks } from "@/components/hr/segment-links";
import { DayPicker, MonthPicker } from "@/components/hr/url-pickers";
import { formatDate, monthLabel, today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { attendanceMonth, attendanceSheet } from "@/server/queries/hr";
import { isSunday, workingDaysBetween, periodEnd, periodStart } from "@/server/services/hr-dates";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; month?: string }> }) {
  const user = await requirePermission(["hr.attendance", "hr.view"]);
  const sp = await searchParams;
  const view = sp.view === "month" ? "month" : "day";
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today();
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : date.slice(0, 7);

  const views = (
    <SegmentLinks
      items={[
        { label: "Daily sheet", href: `/hr/attendance?date=${date}`, active: view === "day" },
        { label: "Monthly grid", href: `/hr/attendance?view=month&month=${month}`, active: view === "month" },
      ]}
    />
  );

  if (view === "month") {
    const data = await attendanceMonth(month);
    return (
      <>
        <PageHeader
          title="Attendance"
          description={`${monthLabel(month)} · ${workingDaysBetween(periodStart(month), periodEnd(month)).length} working days (Sundays off). Click a day to open its sheet.`}
          actions={views}
        />
        <div className="mb-4">
          <MonthPicker value={month} />
        </div>
        <AttendanceMonthGrid period={month} staff={data.staff} marks={data.marks} />
      </>
    );
  }

  const sheet = await attendanceSheet(date);
  return (
    <>
      <PageHeader
        title="Attendance"
        description={`Mark who came in on ${formatDate(date, "long")}. One click per person, then save once.`}
        actions={views}
      />
      <div className="mb-4">
        <DayPicker value={date} />
      </div>
      <AttendanceSheet
        key={date}
        date={date}
        rows={sheet.rows}
        locked={sheet.locked}
        canEdit={can(user, "hr.attendance")}
        canManage={can(user, "hr.manage")}
        isSunday={isSunday(date)}
      />
    </>
  );
}
