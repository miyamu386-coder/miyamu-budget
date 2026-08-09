import type { Transaction } from "../app/types";
import type { RingGoal } from "./ringGoals";
import { Capacitor } from "@capacitor/core";
import {
  Filesystem,
  Directory,
  Encoding,
} from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  clearUserKeyCache,
  normalizeUserKeyInput,
  saveUserKey,
} from "./userKey";
import { setStoredValue } from "./storage";

export const BACKUP_STORAGE_KEY =
  "miyamu_budget_user_key";

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

// =========================
// バックアップ書き出し
// =========================
export async function exportMiyamuBackup(
  params: BackupData
) {
  try {
    const backup: BackupData = {
      ...params,
      version: 1,
      exportedAt: new Date().toISOString(),
    };

    const fileName =
      `miyamuMaker-backup-${params.selectedYm}.json`;

    const json =
      JSON.stringify(backup, null, 2);

    // =========================
    // iOS / Android
    // =========================
    if (Capacitor.isNativePlatform()) {
      const result =
        await Filesystem.writeFile({
          path: fileName,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

      await Share.share({
        title: "みやむMaker バックアップ",
        text: "バックアップファイルを保存してください。",
        url: result.uri,
        dialogTitle: "バックアップを保存",
      });

      return;
    }

    // =========================
    // Web
    // =========================
    const blob = new Blob(
      [json],
      {
        type: "application/json",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;
    a.download = fileName;

    a.click();

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(
      "backup export failed",
      error
    );

    alert(
      "バックアップ作成に失敗しました"
    );
  }
}

// =========================
// バックアップ復元
// =========================
export async function importMiyamuBackup(
  params: {
    file: File;
    userKey: string;
    nowYm: string;
    storageKey: string;

    setUserKey: (key: string) => void;

    setSelectedYm: (ym: string) => void;

    setExtraRings: (rings: any[]) => void;

    setRingGoals: (
      goals: RingGoal[]
    ) => void;

    setTransactions: (
      transactions: Transaction[]
    ) => void;

    setHoldings: (
      holdings: any[]
    ) => void;

    hardReload: () => void;
  }
) {
  try {
    // =========================
    // ファイル読み込み
    // =========================
    const text =
      await params.file.text();

    const data =
      JSON.parse(text) as Partial<BackupData>;

    if (
      !data ||
      data.version !== 1
    ) {
      alert(
        "バックアップファイルの形式が違います"
      );

      return;
    }

    const ok = window.confirm(
      "現在のデータを上書きして復元します。よろしいですか？"
    );

    if (!ok) return;

    // =========================
    // 復元データを整える
    // =========================
    const nextUserKey =
      normalizeUserKeyInput(
        data.userKey ||
          params.userKey
      );

    const nextSelectedYm =
      data.selectedYm ||
      params.nowYm;

    const nextRingGoals =
      Array.isArray(data.ringGoals)
        ? (data.ringGoals as RingGoal[])
        : [];

    const nextExtraRings =
      Array.isArray(data.extraRings)
        ? data.extraRings
        : [];

    const nextTransactions =
      Array.isArray(data.transactions)
        ? (data.transactions as Transaction[])
        : [];

    const nextHoldings =
      Array.isArray(data.holdings)
        ? data.holdings
        : [];

    // =========================
    // userKey復元
    // Web → localStorage
    // iOS → Preferences
    // =========================
    await saveUserKey(
      nextUserKey
    );

    clearUserKeyCache();

    params.setUserKey(
      nextUserKey
    );

    // =========================
    // selectedYm復元
    // =========================
    await setStoredValue(
      `miyamu_selected_ym:${nextUserKey}`,
      nextSelectedYm
    );

    // =========================
    // extraRings復元
    // =========================
    await setStoredValue(
      `miyamu_maker_extra_rings_v6:${nextUserKey}`,
      JSON.stringify(
        nextExtraRings
      )
    );

    // =========================
    // ringGoals復元
    // ※現在のringGoals.tsと
    // 保存キーを統一
    // =========================
    await setStoredValue(
      `miyamuLog:ringGoals:${nextUserKey}`,
      JSON.stringify(
        nextRingGoals
      )
    );

    // =========================
    // holdings復元
    // =========================
    await setStoredValue(
      `miyamu_holdings_v1:${nextUserKey}`,
      JSON.stringify(
        nextHoldings
      )
    );

   // =========================
// transactions復元
// Web → localStorage
// iOS / Android → Preferences
// =========================
await setStoredValue(
  `miyamu_transactions_v1:${nextUserKey}`,
  JSON.stringify(nextTransactions)
);

    // =========================
    // React stateにも反映
    // =========================
    params.setSelectedYm(
      nextSelectedYm
    );

    params.setExtraRings(
      nextExtraRings
    );

    params.setRingGoals(
      nextRingGoals
    );

    params.setTransactions(
      nextTransactions
    );

    params.setHoldings(
      nextHoldings
    );

    alert(
      "バックアップを復元しました。"
    );
  } catch (error) {
    console.error(
      "復元エラー",
      error
    );

    alert(
      error instanceof Error
        ? error.message
        : String(error)
    );
  }
}