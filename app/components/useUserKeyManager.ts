"use client";

import { useEffect, useState } from "react";
import {
  clearUserKeyCache,
  getOrCreateUserKey,
  getUserKeyName,
  normalizeUserKeyInput,
  setUserKeyName,
  removeUserKey,
  saveUserKey,
} from "../../lib/userKey";

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

  void (async () => {
    const name = await getUserKeyName(userKey);
    setCurrentName(name);
  })();
}, [userIdOpen, userKey]);

  useEffect(() => {
    if (!keyEditingOpen) return;

    setUserKeyInput(userKey);
  }, [keyEditingOpen, userKey]);

  const isValidUserKey = (value: string) => {
    return /^[0-9a-f]{32}$/i.test(value.trim());
  };

  const saveAndApplyUserKey = async (next: string) => {
  await saveUserKey(next);

  clearUserKeyCache();

  const syncedKey = await getOrCreateUserKey();
  setUserKey(syncedKey);
};


  const applyPastedKey = async () => {
    const next = normalizeUserKeyInput(pasteKey);

    if (!isValidUserKey(next)) {
      window.alert(
        "ユーザーIDは32桁の英数字（0〜9・a〜f）で入力してください"
      );
      return;
    }

    const name = pasteName.trim();

    if (name) {
  await setUserKeyName(next, name);
}

    try {
      await saveAndApplyUserKey(next);
      setUserIdOpen(false);
    } catch (error) {
      console.error("applyPastedKey failed:", error);
      window.alert("ユーザーIDの切り替えに失敗しました");
    }
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

  const applyUserKey = async () => {
    const next = normalizeUserKeyInput(userKeyInput);

    if (!isValidUserKey(next)) {
      window.alert(
        "userKeyは32桁の英数字（0〜9・a〜f）で入力してください"
      );
      return;
    }

    try {
      await saveAndApplyUserKey(next);
      setKeyEditingOpen(false);
    } catch (error) {
      console.error("applyUserKey failed:", error);
      window.alert("userKeyの切り替えに失敗しました");
    }
  };

  const hardReload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(Date.now()));
    window.location.replace(url.toString());
  };

  const regenerateUserKey = async () => {
  try {
    await removeUserKey();

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

