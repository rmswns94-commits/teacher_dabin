"use client";

import { RefreshCw, Sprout } from "lucide-react";
import { useSyncExternalStore } from "react";

import { CatDoodle } from "@/components/cat-doodle";
import { Doodle, Tape } from "@/components/doodle";
import { Card, CardContent } from "@/components/ui/card";
import { encouragementMessages } from "@/lib/constants/encouragement-messages";

const STORAGE_KEY = "dabin-encouragement-id";

function pickRandomId(excludeId?: string) {
  const pool = encouragementMessages.filter((item) => item.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// 브라우저 세션당 한 문구를 유지하는 아주 작은 외부 store.
// 서버 스냅샷은 항상 null이라 hydration 첫 렌더는 빈 자리를 그리고,
// hydration 직후 클라이언트 스냅샷으로 한 번만 채워진다 (mismatch 없음).
const listeners = new Set<() => void>();
let currentId: string | null = null;

function initializeId() {
  let stored: string | null = null;

  try {
    stored = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // storage를 못 쓰는 환경이면 이번 세션 동안 메모리로만 유지한다.
  }

  if (stored && encouragementMessages.some((item) => item.id === stored)) {
    return stored;
  }

  const id = pickRandomId();

  try {
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }

  return id;
}

if (typeof window !== "undefined") {
  currentId = initializeId();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentId;
}

function getServerSnapshot() {
  return null;
}

function refreshMessage() {
  currentId = pickRandomId(currentId ?? undefined);

  try {
    window.sessionStorage.setItem(STORAGE_KEY, currentId);
  } catch {
    // ignore
  }

  listeners.forEach((listener) => listener());
}

export function EncouragementCard() {
  const messageId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const entry = encouragementMessages.find((item) => item.id === messageId);

  return (
    <div className="relative">
      <Tape />
      <Card className="relative overflow-hidden border-[#f2ddcf] bg-gradient-to-br from-[#fff8f3] to-[#fdf3ea]">
        <CatDoodle variant="heart" className="absolute bottom-1 right-3 h-14 w-16" />
        <Doodle kind="sparkle" className="absolute right-20 top-4 h-4 w-4 text-[#ecd9c7]" />

        <CardContent className="relative p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#7a6455]">
            <Sprout className="h-4 w-4 text-[#5f8d6f]" aria-hidden />
            오늘의 한마디
          </div>

          <div className="mt-3 flex min-h-14 items-start gap-3">
            {entry ? (
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/85 text-2xl shadow-[0_3px_10px_rgba(164,130,109,0.12)]"
              >
                {entry.emoji}
              </span>
            ) : null}
            <p className="whitespace-pre-line pt-1 font-display text-[15px] leading-7 text-[#544639]">
              {entry?.message ?? ""}
            </p>
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={refreshMessage}
              disabled={!entry}
              aria-label="다른 한마디 보기"
              className="flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs text-[#a2886f] transition hover:bg-white/70 hover:text-[#7a6455] disabled:opacity-40"
            >
              다른 한마디 <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
