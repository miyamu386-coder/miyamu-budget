const SOUND_ENABLED_KEY =
  "miyamu-maker-sound-enabled";

export function isSoundEnabled() {
  if (typeof window === "undefined") {
    return true;
  }

  return (
    localStorage.getItem(
      SOUND_ENABLED_KEY
    ) !== "false"
  );
}

export function setSoundEnabled(
  enabled: boolean
) {
  localStorage.setItem(
    SOUND_ENABLED_KEY,
    String(enabled)
  );
}

export function playSound(src: string) {
  if (!isSoundEnabled()) {
    return;
  }

  const audio = new Audio(src);

  audio.currentTime = 0;

  void audio.play().catch((error) => {
    console.warn(
      "SEの再生に失敗しました",
      error
    );
  });
}