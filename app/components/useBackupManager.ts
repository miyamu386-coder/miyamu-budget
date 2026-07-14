"use client";

import {
  BACKUP_STORAGE_KEY,
  exportMiyamuBackup,
  importMiyamuBackup,
} from "../../lib/backup";

import type { Transaction } from "../types";
import type { RingGoal } from "../../lib/ringGoals";

type Params = {
  userKey: string;
  nowYm: string;
  selectedYm: string;

  transactions: Transaction[];
  ringGoals: RingGoal[];
  extraRings: any[];
  holdings: any[];

  setUserKey: (v: string) => void;
  setSelectedYm: (v: string) => void;
  setExtraRings: (v: any) => void;
  setRingGoals: (v: RingGoal[]) => void;
  setTransactions: (v: Transaction[]) => void;
  setHoldings: (v: any) => void;

  hardReload: () => void;
};

export function useBackupManager({
  userKey,
  nowYm,
  selectedYm,
  transactions,
  ringGoals,
  extraRings,
  holdings,
  setUserKey,
  setSelectedYm,
  setExtraRings,
  setRingGoals,
  setTransactions,
  setHoldings,
  hardReload,
}: Params) {
  const exportBackup = () => {
    exportMiyamuBackup({
      version: 1,
      exportedAt: "",
      userKey,
      transactions,
      ringGoals,
      selectedYm,
      extraRings,
      holdings,
    });
  };

  const importBackup = async (file: File) => {
    await importMiyamuBackup({
      file,
      userKey,
      nowYm,
      storageKey: BACKUP_STORAGE_KEY,
      setUserKey,
      setSelectedYm,
      setExtraRings,
      setRingGoals,
      setTransactions,
      setHoldings,
      hardReload,
    });
  };

  return {
    exportBackup,
    importBackup,
  };
}