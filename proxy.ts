import { NextResponse, type NextRequest } from "next/server";

// Lightweight presence-only guard. Every Server Action still re-verifies the
// signed session cookie (see lib/session/*) before touching Firestore — this
// proxy just avoids flashing protected pages to obviously-unauthenticated
// visitors and redirects them to the right entry point.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const hasAdminCookie = request.cookies.has("admin_session");
    if (!hasAdminCookie) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  if (pathname.startsWith("/team")) {
    const hasTeamCookie = request.cookies.has("team_session");
    if (!hasTeamCookie) {
      return NextResponse.redirect(new URL("/join", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/team/:path*"],
};
