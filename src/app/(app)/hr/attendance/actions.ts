"use server";
import { action } from "@/server/action";
import { saveAttendance } from "@/server/services/hr";
import { attendanceSchema } from "@/server/services/hr-schemas";

export const saveAttendanceAction = action({ permission: "hr.attendance", schema: attendanceSchema, revalidate: ["/hr"] }, async (input, { tx, actor }) =>
  saveAttendance(tx, actor, input)
);
