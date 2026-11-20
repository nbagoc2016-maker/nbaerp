import { NextResponse, type NextRequest } from "next/server";

// Cheap first gate: no session cookie, no app. The real check (valid, unexpired session and
// permissions) happens on the server in every page and action.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("sv4_session");
  const { pathname, search } = req.nextUrl;
  if (!hasSession && pathname !== "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
