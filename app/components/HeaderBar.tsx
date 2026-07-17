"use client";

import type {
  Dispatch,
  SetStateAction,
} from "react";

import {
  addMonths,
  fmtYM,
} from "../../lib/dateUtils";

type Props = {
  selectedYm: string;
  setSelectedYm: Dispatch<SetStateAction<string>>;
};

export default function HeaderBar({
  selectedYm,
  setSelectedYm,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={() =>
          setSelectedYm((value) =>
            addMonths(value, -1)
          )
        }
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
          fontWeight: 800,
        }}
      >
        ◀
      </button>

      <div
        style={{
          fontWeight: 900,
          fontSize: 18,
        }}
      >
        {fmtYM(selectedYm)}
      </div>

      <button
        type="button"
        onClick={() =>
          setSelectedYm((value) =>
            addMonths(value, 1)
          )
        }
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
          fontWeight: 800,
        }}
      >
        ▶
      </button>
    </div>
  );
}