import type { Transaction } from "../app/types";
import type { RingGoal } from "./ringGoals";
import { clearUserKeyCache } from "./userKey";
function normalizeUserKeyInput(s: string) {
  return s.trim().slice(0, 64);
}

export type BackupData = {
  version: 1;
  exportedAt: string;
  userKey: string;
  transactions: Transaction[];
  ringGoals: RingGoal[];
  selectedYm: string;
  extraRings: unknown[];
  holdings: unknown[];
};

export function exportMiyamuBackup(params: BackupData) {
  try {
    const backup: BackupData = {
  ...params,
  version: 1,
  exportedAt: new Date().toISOString(),
};

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `miyamuMaker-backup-${params.selectedYm}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert("バックアップ作成に失敗しました");
  }
}

export async function importMiyamuBackup(params: {
  file: File;
  userKey: string;
  nowYm: string;
  storageKey: string;
  setUserKey: (key: string) => void;
  setSelectedYm: (ym: string) => void;
  setExtraRings: (rings: any[]) => void;
  setRingGoals: (goals: RingGoal[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
  hardReload: () => void;
}) {
  try {
    const text = await params.file.text();
    const data = JSON.parse(text) as Partial<BackupData>;

    if (!data || data.version !== 1) {
      alert("バックアップファイルの形式が違います");
      return;
    }

    const ok = window.confirm("現在のデータを上書きして復元します。よろしいですか？");
    if (!ok) return;

    const nextUserKey = normalizeUserKeyInput(data.userKey || params.userKey);
    const nextSelectedYm = data.selectedYm || params.nowYm;
    const nextRingGoals = Array.isArray(data.ringGoals) ? (data.ringGoals as RingGoal[]) : [];
    const nextExtraRings = Array.isArray(data.extraRings)? data.extraRings: [];
    const nextTransactions = Array.isArray(data.transactions) ? (data.transactions as Transaction[]) : [];

    // userKey復元
    try {
      localStorage.setItem(params.storageKey, nextUserKey);
    } catch {}

    clearUserKeyCache();
    params.setUserKey(nextUserKey);

    // selectedYm復元
    try {
      localStorage.setItem(`miyamu_selected_ym:${nextUserKey}`, nextSelectedYm);
    } catch {}

    // extraRings復元
    try {
      localStorage.setItem(`miyamu_maker_extra_rings_v6:${nextUserKey}`, JSON.stringify(nextExtraRings));
    } catch {}

    // ringGoals復元
    try {
      localStorage.setItem("miyamu_ring_goals_v1", JSON.stringify(nextRingGoals));
    } catch {
      try {
        localStorage.setItem("ringGoals", JSON.stringify(nextRingGoals));
      } catch {}
    }

    // state反映
    params.setSelectedYm(nextSelectedYm);
    params.setExtraRings(nextExtraRings);
    params.setRingGoals(nextRingGoals);
    params.setTransactions(nextTransactions);

    alert("バックアップを復元しました。画面を再読み込みします。");
   params.hardReload();
  } catch (e) {
    console.error(e);
    alert("復元に失敗しました");
  }
};
