"use client";

import { useEffect, useRef, useState } from "react";

export type SaveCharacterKind = "mofu" | "hina";
export type WatchTone = "repay" | "invest" | "save" | "neutral";

type SaveOverlayState = {
  kind: SaveCharacterKind;
  message: string;
  key: number;
} | null;

type WatchMofuSpeechState = {
  show: boolean;
  text: string;
  key: number;
};

type PayoffModalState = {
  title: string;
  amount: number;
  date: string;
} | null;

type WatchQuotes = Record<WatchTone, string[]>;

const WATCH_QUOTES_KEY = "miyamu_watch_quotes_v1";

const DEFAULT_WATCH_QUOTES: WatchQuotes = {
  repay: [
    "偉い。返済は正義。",
    "ちゃんと減ってる。強い。",
    "その調子。完済は近いぞ。",
    "やるじゃん（煽り）",
    "逃げずに向き合ったな。",
  ],
  invest: [
    "焦るな。積み上げは裏切らない。",
    "長期目線でいこう。",
    "いいね。淡々といこう。",
    "相場に振り回されるなよ。",
    "見守ってる。",
  ],
  save: [
    "コツコツ、えらい。",
    "貯める力は武器だ。",
    "いい流れ。",
    "守りが固い。",
    "その調子。",
  ],
  neutral: [
    "見てるぞ。",
    "その調子。",
    "記録は裏切らない。",
    "OK。続けろ。",
    "無理はするな。",
  ],
};

function loadWatchQuotes(): WatchQuotes {
  if (typeof window === "undefined") {
    return DEFAULT_WATCH_QUOTES;
  }

  try {
    const raw = localStorage.getItem(WATCH_QUOTES_KEY);

    if (!raw) {
      return DEFAULT_WATCH_QUOTES;
    }

    const parsed = JSON.parse(raw);

    return {
      repay: Array.isArray(parsed?.repay)
        ? parsed.repay
        : DEFAULT_WATCH_QUOTES.repay,
      invest: Array.isArray(parsed?.invest)
        ? parsed.invest
        : DEFAULT_WATCH_QUOTES.invest,
      save: Array.isArray(parsed?.save)
        ? parsed.save
        : DEFAULT_WATCH_QUOTES.save,
      neutral: Array.isArray(parsed?.neutral)
        ? parsed.neutral
        : DEFAULT_WATCH_QUOTES.neutral,
    };
  } catch {
    return DEFAULT_WATCH_QUOTES;
  }
}

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function pickSaveMessage(kind: SaveCharacterKind): string {
  const mofu = [
    "OK。保存した。",
    "やるじゃん。",
    "記録は強い。",
    "積み上げろ。",
    "無理すんなよ。",
  ];

  const hina = [
    "できた！",
    "コツコツ大事！",
    "積み立て成功〜！",
    "明るい未来！",
    "いい感じ！",
  ];

  return pickRandom(kind === "mofu" ? mofu : hina);
}

export function decideSaveReaction(meta: {
  title: string;
  ringKey: string;
  fixedLifeKey: string;
  fixedSaveKey: string;
}): {
  kind: SaveCharacterKind;
  tone: WatchTone;
} {
  const title = (meta.title ?? "").toLowerCase();

  const repayWords = [
    "返済",
    "ローン",
    "借入",
    "カードローン",
    "クレカ",
    "リボ",
    "分割",
  ];

  const investWords = [
    "投資",
    "nisa",
    "ニーサ",
    "株",
    "積立",
    "つみたて",
    "資産",
    "運用",
    "配当",
  ];

  const saveWords = [
    "貯蓄",
    "貯金",
    "積立",
    "積み立て",
    "資産形成",
  ];

  if (repayWords.some((word) => title.includes(word))) {
    return {
      kind: "mofu",
      tone: "repay",
    };
  }

  if (investWords.some((word) => title.includes(word))) {
    return {
      kind: "hina",
      tone: "invest",
    };
  }

  if (saveWords.some((word) => title.includes(word))) {
    return {
      kind: "hina",
      tone: "save",
    };
  }

  if (meta.ringKey === meta.fixedLifeKey) {
    return {
      kind: "mofu",
      tone: "neutral",
    };
  }

  if (meta.ringKey === meta.fixedSaveKey) {
    return {
      kind: "hina",
      tone: "save",
    };
  }

  return {
    kind: "mofu",
    tone: "neutral",
  };
}

export function useSaveEffects() {
  const [saveOverlay, setSaveOverlay] =
    useState<SaveOverlayState>(null);

  const [payoffModal, setPayoffModal] =
    useState<PayoffModalState>(null);

  const [pendingGlowRingId, setPendingGlowRingId] =
    useState<string | null>(null);

  const [watchMofuSpeech, setWatchMofuSpeech] =
    useState<WatchMofuSpeechState>({
      show: false,
      text: "",
      key: 0,
    });

  const [glowRingId, setGlowRingId] =
    useState<string | null>(null);

  const [watchQuotes, setWatchQuotes] =
    useState<WatchQuotes>(DEFAULT_WATCH_QUOTES);

  const overlayTimerRef = useRef<number | null>(null);
  const watchShowTimerRef = useRef<number | null>(null);
  const watchHideTimerRef = useRef<number | null>(null);
  const glowTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setWatchQuotes(loadWatchQuotes());
  }, []);

  const pickWatchMofu = (tone: WatchTone): string => {
    const list =
      watchQuotes[tone] ??
      watchQuotes.neutral ??
      DEFAULT_WATCH_QUOTES.neutral;

    return pickRandom(list);
  };

  const triggerSaveOverlay = (
    kind: SaveCharacterKind,
    tone: WatchTone = "neutral"
  ) => {
    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }

    if (watchShowTimerRef.current !== null) {
      window.clearTimeout(watchShowTimerRef.current);
      watchShowTimerRef.current = null;
    }

    if (watchHideTimerRef.current !== null) {
      window.clearTimeout(watchHideTimerRef.current);
      watchHideTimerRef.current = null;
    }

    setWatchMofuSpeech({
      show: false,
      text: "",
      key: Date.now(),
    });

    const message = pickSaveMessage(kind);
    const key = Date.now();

    setSaveOverlay({
      kind,
      message,
      key,
    });

    overlayTimerRef.current = window.setTimeout(() => {
      setSaveOverlay(null);
      overlayTimerRef.current = null;

      watchShowTimerRef.current = window.setTimeout(() => {
        const text = pickWatchMofu(tone);
        const speechKey = Date.now();

        setWatchMofuSpeech({
          show: true,
          text,
          key: speechKey,
        });

        watchShowTimerRef.current = null;

        watchHideTimerRef.current = window.setTimeout(() => {
          setWatchMofuSpeech((previous) => ({
            ...previous,
            show: false,
          }));

          watchHideTimerRef.current = null;
        }, 2000);
      }, 250);
    }, 2600);
  };

  const triggerRingGlow = (ringId: string) => {
    setGlowRingId(ringId);

    if (glowTimerRef.current !== null) {
      window.clearTimeout(glowTimerRef.current);
      glowTimerRef.current = null;
    }

    glowTimerRef.current = window.setTimeout(() => {
      setGlowRingId(null);
      glowTimerRef.current = null;
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current);
      }

      if (watchShowTimerRef.current !== null) {
        window.clearTimeout(watchShowTimerRef.current);
      }

      if (watchHideTimerRef.current !== null) {
        window.clearTimeout(watchHideTimerRef.current);
      }

      if (glowTimerRef.current !== null) {
        window.clearTimeout(glowTimerRef.current);
      }
    };
  }, []);

  return {
    saveOverlay,
    setSaveOverlay,

    payoffModal,
    setPayoffModal,

    pendingGlowRingId,
    setPendingGlowRingId,

    watchMofuSpeech,

    glowRingId,

    triggerSaveOverlay,
    triggerRingGlow,
  };
}