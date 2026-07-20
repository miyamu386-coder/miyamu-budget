import type { HoldingDictionaryEntry } from "../../app/types";
import { fundHoldingDictionary } from "./funds";
import { japanHoldingDictionary } from "./japan";
import { usHoldingDictionary } from "./us";

export const holdingDictionary: HoldingDictionaryEntry[] = [
  ...fundHoldingDictionary,
  ...japanHoldingDictionary,
  ...usHoldingDictionary,
];