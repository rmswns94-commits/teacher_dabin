export function getDisplayName(user: {
  user_metadata?: { display_name?: string | null; full_name?: string | null; name?: string | null };
  email?: string | null;
} | null) {
  const metadataName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name;

  if (metadataName && metadataName.trim()) {
    return metadataName.trim();
  }

  if (user?.email) {
    return user.email.split("@")[0];
  }

  return "선생님";
}

export function getAuthErrorMessage(error: { message?: string } | null, fallback = "요청을 처리하지 못했어요. 다시 시도해주세요.") {
  const message = error?.message?.toLowerCase() ?? "";

  if (!message) {
    return fallback;
  }

  if (message.includes("invalid login credentials") || message.includes("invalid login") || message.includes("wrong password")) {
    return "이메일 또는 비밀번호를 확인해주세요.";
  }

  if (message.includes("user already registered") || message.includes("already registered") || message.includes("already exists")) {
    return "이미 가입된 이메일이에요.";
  }

  if (message.includes("email not confirmed") || message.includes("confirm your email") || message.includes("email confirmation")) {
    return "이메일 인증을 먼저 완료해주세요.";
  }

  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "요청이 너무 많아요. 잠시 후 다시 시도해주세요.";
  }

  if (message.includes("network") || message.includes("fetch failed") || message.includes("failed to fetch")) {
    return "연결 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.";
  }

  if (message.includes("password should be at least") || message.includes("passwords do not match")) {
    return "비밀번호는 8자 이상이어야 하고, 확인값도 일치해야 해요.";
  }

  if (message.includes("validation") || message.includes("invalid email")) {
    return "입력 내용을 다시 확인해주세요.";
  }

  return fallback;
}
