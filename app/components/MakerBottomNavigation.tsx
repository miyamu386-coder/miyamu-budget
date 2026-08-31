"use client";

export type MakerTab =
  | "home"
  | "report"
  | "mypage";

type Props = {
  activeTab: MakerTab;
  onChange: (tab: MakerTab) => void;
};

const tabs: {
  key: MakerTab;
  label: string;
}[] = [
  {
    key: "home",
    label: "ホーム",
  },
  {
    key: "report",
    label: "明細・レポート",
  },
  {
    key: "mypage",
    label: "マイページ",
  },
];

export default function MakerBottomNavigation({
  activeTab,
  onChange,
}: Props) {
  return (
    <nav className="maker-bottom-navigation">
      <div className="maker-bottom-navigation-inner">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`maker-bottom-navigation-button ${
              activeTab === tab.key
                ? "is-active"
                : ""
            }`}
            onClick={() =>
              onChange(tab.key)
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}