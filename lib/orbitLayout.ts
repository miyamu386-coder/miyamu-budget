import type { ExtraRing } from "./ringUtils";

export type OrbitPosition = {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  zIndex: number;
};

type BuildOrbitPositionsParams = {
  extraRings: ExtraRing[];
  isMobile: boolean;
  selectedRing: string | null;
  orbitOffset: number;
};

export function buildOrbitPositions({
  extraRings,
  isMobile,
  selectedRing,
  orbitOffset,
}: BuildOrbitPositionsParams): OrbitPosition[] {
  const count = extraRings.length;

  const extraSize = isMobile ? 112 : 150;
  const orbitRadiusX = isMobile ? 125 : 240;
  const orbitRadiusY = isMobile ? 210 : 285;

  const selectedIndex = selectedRing
    ? extraRings.findIndex(
        (ring) => ring.id === selectedRing
      )
    : 0;

  return extraRings.map((ring, index) => {
    const step =
      (Math.PI * 2) / Math.max(count, 1);

    const frontAngle = Math.PI / 2;

    const angle =
      frontAngle +
      (index - selectedIndex) * step +
      orbitOffset;

    const depth = Math.sin(angle);

    const x =
      Math.cos(angle) * orbitRadiusX;

    const y =
      Math.sin(angle) * orbitRadiusY;

    const scale = 1 + depth * 0.12;
    const opacity = 0.72 + depth * 0.28;

    return {
      id: ring.id,
      x,
      y,
      size: extraSize * scale,
      opacity,
      zIndex: Math.round(20 + depth * 20),
    };
  });
}