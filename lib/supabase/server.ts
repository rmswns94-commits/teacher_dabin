import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

// React cache(): 한 서버 요청 안에서 클라이언트 생성과 auth.getUser()를
// 각 1회로 dedupe한다. 여러 쿼리 헬퍼가 각각 auth를 왕복 호출하던
// 오버헤드를 없애는 것으로, 요청마다 여전히 토큰 검증은 수행된다.
export const createServerSupabaseClient = cache(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Ignore cookie write failures in server actions / render phase.
        }
      },
    },
  });
});

export const getServerUser = cache(async () => {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
});

export async function requireUser() {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
