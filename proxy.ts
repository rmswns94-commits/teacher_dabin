import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedRoutes = [
  "/dashboard",
  "/students",
  "/daily-logs",
  "/makeups",
  "/passages",
  "/question-sets",
  "/groups",
  "/growth-notes",
  "/pretty-words",
  "/settings",
];

// 로그인된 사용자가 오면 바로 앱으로 보내는 공개 경로.
// PWA start_url("/")·재접속 시 세션이 살아있는데도 랜딩/로그인 화면이 떠서
// "로그아웃된 것처럼" 보이던 문제를 여기서 해결한다.
// (reset-password는 recovery 세션도 authenticated라 제외 — 비밀번호 변경을 막으면 안 됨)
const authRedirectRoutes = ["/", "/login", "/signup"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isAuthRedirectRoute = authRedirectRoutes.includes(pathname);

  if (!isProtectedRoute && !isAuthRedirectRoute) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    },
  );

  // getUser()가 만료된 access token을 refresh token으로 자동 갱신하고,
  // 갱신된 세션 cookie는 위 setAll을 통해 response에 실려 브라우저에 저장된다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    const redirect = NextResponse.redirect(loginUrl);
    // 갱신 시도에서 발생한 cookie 변경(만료 세션 정리 등)도 함께 전달
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (isAuthRedirectRoute && user) {
    // /login?redirectTo=... 로 왔던 경우 원래 가려던 보호 페이지로 복귀
    const redirectTo = request.nextUrl.searchParams.get("redirectTo");
    const target =
      pathname === "/login" && redirectTo?.startsWith("/") ? redirectTo : "/dashboard";
    const redirect = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/dashboard/:path*",
    "/students/:path*",
    "/daily-logs/:path*",
    "/makeups/:path*",
    "/passages/:path*",
    "/question-sets/:path*",
    "/groups/:path*",
    "/growth-notes/:path*",
    "/pretty-words/:path*",
    "/settings/:path*",
  ],
};
