"use client";

import { useEffect, useState } from "react";
import {
  clearUserKeyCache,
  getOrCreateUserKey,
  getUserKeyName,
  normalizeUserKeyInput,
  setUserKeyName,
} from "../../lib/userKey";

const STORAGE_KEY = "miyamu_budget_user_key";

export function useUserKeyManager() {
  const [userKey, setUserKey] = useState("");

  const [userIdOpen, setUserIdOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [pasteKey, setPasteKey] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [currentName, setCurrentName] = useState("");

  const [keyEditingOpen, setKeyEditingOpen] = useState(false);
  const [userKeyInput, setUserKeyInput] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const key = await getOrCreateUserKey();
        setUserKey(key);
      } catch (error) {
        console.error("getOrCreateUserKey failed:", error);
      }
    })();
  }, []);

  useEffect(() => {
    if (!userIdOpen) return;

    setPasteKey("");
    setPasteName("");
    setCurrentName(getUserKeyName(userKey));
  }, [userIdOpen, userKey]);

  useEffect(() => {
    if (!keyEditingOpen) return;
    setUserKeyInput(userKey);
  }, [keyEditingOpen, userKey]);

  const isValidUserKey = (value: string) => {
    const normalized = value.trim();

    if (/^[0-9a-f]{32}$/i.test(normalized)) {
      return true;
    }

    return normalized.length >= 8 && normalized.length <= 64;
  };

  const applyPastedKey = () => {
    const next = normalizeUserKeyInput(pasteKey);

    if (!isValidUserKey(next)) {
      window.alert(
        "ユーザーIDの形式が違うみたい（32桁の英数字 or 8〜64文字）"
      );
      return;
    }

    const name = pasteName.trim();

    if (name) {
      setUserKeyName(next, name);
    }

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      console.error("userKey localStorage save failed:", error);
    }

    clearUserKeyCache();
    setUserKey(next);
    setUserIdOpen(false);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1200);

      return;
    } catch {
      const textarea = document.createElement("textarea");

      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      try {
        document.execCommand("copy");
        setCopied(true);

        window.setTimeout(() => {
          setCopied(false);
        }, 1200);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const applyUserKey = () => {
    const next = normalizeUserKeyInput(userKeyInput);

    if (next.length < 8 || next.length > 64) {
      window.alert(
        "userKey は8〜64文字で入力してください（英数字推奨）"
      );
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      console.error("userKey localStorage save failed:", error);
    }

    clearUserKeyCache();
    setUserKey(next);
    setKeyEditingOpen(false);
  };
const hardReload = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("v", String(Date.now()));
  window.location.replace(url.toString());
};

  const regenerateUserKey = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("userKey localStorage remove failed:", error);
    }

    try {
      clearUserKeyCache();

      const next = await getOrCreateUserKey();

      setUserKey(next);
      setKeyEditingOpen(false);
    } catch (error) {
      console.error("regenerateUserKey failed:", error);

      window.alert(
        "再生成に失敗しました。コンソールを確認してね。"
      );
    }
  };

    return {
    userKey,
    setUserKey,

    userIdOpen,
    setUserIdOpen,

    copied,

    pasteKey,
    setPasteKey,

    pasteName,
    setPasteName,

    currentName,

    keyEditingOpen,
    setKeyEditingOpen,

    userKeyInput,
    setUserKeyInput,

    applyPastedKey,
    copyText,
    applyUserKey,
    regenerateUserKey,
    hardReload,
  };
}