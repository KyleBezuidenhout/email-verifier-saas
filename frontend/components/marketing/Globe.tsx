"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const GLOBE_RADIUS = 2.2;
const DOT_SIZE = 0.024;
const OCEAN_DOT_SIZE = 0.014;
const MAX_LAND_DOTS = 6000;
const MAX_OCEAN_DOTS = 3000;
const MASK_W = 720;
const MASK_H = 360;

function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// ── Continent outline polygons ([lat, lng] pairs, clockwise) ───────────

type Outline = [number, number][];

const AFRICA: Outline = [
  [37, -9], [37, 10], [34, 11], [32, 25], [32, 33],
  [31, 34], [27, 35], [22, 37], [18, 40], [15, 43],
  [12, 44], [11, 50], [5, 47], [2, 43], [0, 42],
  [-1, 41], [-5, 40], [-8, 39], [-11, 40], [-15, 36],
  [-20, 35], [-25, 33], [-30, 32], [-34, 27],
  [-35, 20], [-34, 18], [-32, 16], [-28, 15],
  [-22, 14], [-17, 12], [-12, 14], [-6, 12],
  [-1, 9], [3, 10], [4, 7], [4, 2], [5, -4],
  [8, -13], [11, -16], [15, -17], [21, -17],
  [25, -15], [28, -13], [32, -9], [35, -5],
  [36, -2], [37, -9],
];

const MADAGASCAR: Outline = [
  [-12, 49], [-16, 50], [-20, 45], [-24, 44],
  [-26, 47], [-24, 48], [-18, 50], [-12, 49],
];

const EUROPE_WEST: Outline = [
  [36, -9], [37, -8], [43, -9], [44, -8],
  [44, -2], [46, -2], [47, -2], [48, -5],
  [51, 2], [53, 7], [55, 8], [57, 10],
  [55, 12], [54, 10], [52, 7], [49, 5],
  [48, 2], [47, 3], [46, 2], [44, 0],
  [43, 3], [42, 3], [40, 3], [39, -1],
  [38, -4], [37, -6], [36, -9],
];

const EUROPE_EAST: Outline = [
  [55, 12], [57, 10], [58, 12], [60, 11],
  [60, 5], [63, 5], [65, 14], [70, 20],
  [71, 28], [70, 40], [65, 40], [60, 32],
  [57, 30], [55, 28], [52, 24], [50, 22],
  [48, 20], [47, 18], [46, 16], [45, 14],
  [44, 14], [43, 12], [42, 12], [41, 15],
  [40, 18], [42, 20], [44, 22], [46, 24],
  [48, 22], [50, 22], [52, 18], [53, 14],
  [55, 12],
];

const ITALY: Outline = [
  [46, 7], [46, 10], [46, 13], [45, 12],
  [44, 12], [43, 16], [41, 16], [40, 18],
  [39, 17], [38, 16], [38, 13], [39, 15],
  [40, 15], [41, 14], [43, 12], [44, 11],
  [45, 7], [46, 7],
];

const UK: Outline = [
  [50, -5], [51, 1], [53, 0], [54, -1],
  [55, -2], [57, -2], [58, -5], [59, -3],
  [58, -7], [57, -6], [55, -5], [53, -4],
  [51, -3], [50, -5],
];

const IRELAND: Outline = [
  [52, -10], [53, -6], [55, -6], [54, -8],
  [53, -10], [52, -10],
];

const ICELAND: Outline = [
  [64, -24], [64, -14], [66, -14], [66, -18],
  [66, -23], [65, -24], [64, -24],
];

const SCANDINAVIA: Outline = [
  [56, 8], [56, 11], [58, 12], [60, 11],
  [60, 5], [62, 5], [63, 10], [65, 14],
  [68, 16], [70, 20], [71, 26], [71, 31],
  [70, 30], [68, 20], [66, 14], [64, 12],
  [62, 12], [60, 18], [59, 18], [58, 16],
  [57, 14], [56, 12], [56, 8],
];

const NORTH_AMERICA: Outline = [
  [60, -138], [56, -133], [52, -128],
  [49, -125], [46, -124], [42, -124],
  [38, -123], [35, -120], [33, -117],
  [30, -114], [28, -112], [25, -110],
  [22, -106], [19, -105], [17, -100],
  [16, -97], [15, -92], [18, -88],
  [20, -87], [22, -83], [25, -80],
  [27, -80], [30, -82], [30, -85],
  [29, -90], [30, -94], [33, -97],
  [36, -94], [38, -90], [40, -86],
  [42, -83], [43, -79], [45, -75],
  [44, -69], [46, -67], [47, -64],
  [46, -60], [44, -59], [47, -53],
  [51, -56], [53, -60], [55, -60],
  [57, -63], [59, -65], [60, -68],
  [62, -75], [64, -83], [66, -88],
  [68, -97], [70, -108], [71, -118],
  [72, -128], [70, -140], [62, -140],
  [60, -138],
];

const ALASKA: Outline = [
  [71, -162], [71, -147], [68, -142],
  [64, -141], [62, -143], [60, -148],
  [58, -153], [56, -158], [55, -162],
  [56, -166], [58, -170], [60, -166],
  [62, -164], [65, -168], [68, -163],
  [71, -162],
];

const GREENLAND: Outline = [
  [84, -36], [83, -24], [81, -18],
  [78, -18], [75, -20], [72, -22],
  [70, -24], [68, -28], [65, -38],
  [62, -42], [60, -45], [60, -50],
  [62, -52], [65, -54], [68, -56],
  [72, -56], [76, -54], [79, -48],
  [81, -42], [83, -38], [84, -36],
];

const SOUTH_AMERICA: Outline = [
  [12, -72], [11, -68], [10, -62],
  [8, -58], [6, -55], [4, -52],
  [2, -50], [0, -49], [-2, -44],
  [-5, -35], [-8, -35], [-10, -36],
  [-14, -39], [-18, -40], [-22, -41],
  [-25, -47], [-28, -49], [-33, -52],
  [-36, -56], [-40, -62], [-44, -65],
  [-48, -66], [-52, -69], [-55, -68],
  [-54, -71], [-50, -74], [-46, -75],
  [-40, -73], [-35, -72], [-30, -71],
  [-24, -70], [-18, -71], [-14, -76],
  [-8, -79], [-4, -80], [0, -80],
  [3, -78], [6, -76], [9, -75],
  [11, -74], [12, -72],
];

const RUSSIA_ASIA: Outline = [
  [55, 30], [60, 32], [65, 40], [70, 40],
  [71, 48], [72, 60], [73, 80], [75, 100],
  [74, 115], [72, 130], [70, 140],
  [68, 150], [65, 160], [63, 170],
  [62, 175], [60, 170], [57, 162],
  [55, 155], [52, 155], [50, 143],
  [48, 137], [46, 135], [44, 132],
  [42, 130], [44, 122], [46, 115],
  [48, 110], [50, 100], [50, 90],
  [50, 82], [48, 72], [48, 62],
  [50, 52], [52, 44], [55, 38],
  [55, 30],
];

const MIDDLE_EAST: Outline = [
  [42, 28], [39, 30], [37, 36], [33, 36],
  [30, 35], [28, 34], [25, 38], [22, 40],
  [20, 40], [16, 43], [13, 44], [14, 48],
  [16, 52], [22, 56], [24, 56], [27, 57],
  [26, 50], [30, 48], [33, 48], [36, 44],
  [38, 42], [40, 40], [42, 36], [42, 28],
];

const CENTRAL_ASIA: Outline = [
  [42, 44], [40, 52], [38, 58], [36, 62],
  [33, 62], [30, 66], [28, 68], [25, 64],
  [25, 58], [27, 52], [30, 48], [33, 48],
  [36, 44], [42, 44],
];

const SOUTH_ASIA: Outline = [
  [35, 74], [33, 72], [30, 70], [28, 68],
  [24, 69], [22, 72], [20, 73], [16, 74],
  [12, 76], [10, 76], [8, 77], [8, 80],
  [10, 80], [14, 80], [18, 82], [21, 87],
  [23, 90], [25, 92], [26, 95], [28, 97],
  [30, 96], [32, 90], [34, 82], [35, 78],
  [35, 74],
];

const SRI_LANKA: Outline = [
  [10, 80], [8, 80], [6, 80], [7, 82],
  [9, 82], [10, 80],
];

const CHINA: Outline = [
  [50, 90], [50, 100], [48, 110],
  [46, 118], [44, 122], [42, 128],
  [40, 124], [38, 122], [35, 119],
  [32, 121], [30, 122], [27, 120],
  [24, 117], [22, 114], [22, 110],
  [22, 108], [21, 105], [22, 100],
  [24, 99], [26, 98], [28, 97],
  [30, 96], [32, 90], [35, 82],
  [38, 76], [42, 74], [45, 76],
  [48, 80], [50, 85], [50, 90],
];

const KOREA: Outline = [
  [43, 128], [42, 128], [40, 126],
  [38, 126], [36, 127], [35, 126],
  [34, 127], [35, 129], [37, 129],
  [39, 128], [41, 130], [43, 130],
  [43, 128],
];

const JAPAN: Outline = [
  [45, 141], [44, 145], [42, 143],
  [40, 140], [38, 140], [36, 140],
  [35, 137], [34, 135], [33, 131],
  [32, 131], [31, 131], [33, 133],
  [34, 133], [35, 135], [36, 137],
  [37, 140], [39, 140], [41, 141],
  [43, 142], [45, 141],
];

const SE_ASIA: Outline = [
  [22, 100], [20, 100], [18, 100],
  [16, 100], [14, 100], [12, 103],
  [10, 105], [8, 104], [5, 103],
  [2, 103], [1, 101], [2, 98],
  [6, 98], [10, 98], [14, 98],
  [17, 98], [20, 97], [22, 97],
  [22, 100],
];

const SUMATRA: Outline = [
  [6, 95], [5, 97], [2, 99], [0, 101],
  [-2, 103], [-5, 105], [-6, 104],
  [-5, 101], [-2, 99], [0, 98],
  [3, 96], [6, 95],
];

const JAVA: Outline = [
  [-6, 106], [-7, 108], [-8, 110],
  [-8, 113], [-7, 114], [-6, 112],
  [-6, 109], [-6, 106],
];

const BORNEO: Outline = [
  [7, 117], [5, 119], [2, 118],
  [0, 115], [-1, 112], [-2, 110],
  [-4, 115], [-2, 118], [0, 119],
  [3, 118], [5, 118], [7, 117],
];

const NEW_GUINEA: Outline = [
  [-1, 132], [-2, 137], [-4, 141],
  [-6, 143], [-8, 146], [-6, 148],
  [-4, 145], [-2, 141], [0, 136],
  [-1, 132],
];

const SULAWESI: Outline = [
  [2, 121], [0, 121], [-2, 121],
  [-4, 122], [-5, 120], [-3, 120],
  [-1, 120], [1, 121], [2, 121],
];

const PHILIPPINES: Outline = [
  [18, 120], [16, 120], [13, 121],
  [10, 124], [8, 126], [7, 124],
  [8, 122], [10, 119], [14, 119],
  [17, 120], [18, 120],
];

const AUSTRALIA: Outline = [
  [-12, 131], [-13, 128], [-15, 125],
  [-18, 122], [-22, 117], [-26, 114],
  [-30, 115], [-33, 116], [-35, 118],
  [-35, 122], [-34, 128], [-35, 134],
  [-35, 138], [-37, 142], [-38, 146],
  [-37, 150], [-35, 151], [-30, 153],
  [-26, 153], [-23, 150], [-20, 148],
  [-18, 146], [-16, 145], [-14, 142],
  [-15, 140], [-17, 137], [-14, 136],
  [-12, 136], [-12, 131],
];

const TASMANIA: Outline = [
  [-41, 145], [-42, 145], [-43, 147],
  [-42, 148], [-41, 148], [-41, 145],
];

const NZ_NORTH: Outline = [
  [-35, 173], [-37, 175], [-38, 177],
  [-41, 176], [-41, 174], [-39, 174],
  [-37, 174], [-35, 173],
];

const NZ_SOUTH: Outline = [
  [-41, 172], [-43, 171], [-45, 168],
  [-47, 167], [-46, 170], [-44, 172],
  [-42, 173], [-41, 172],
];

const ALL_LANDMASSES: Outline[] = [
  AFRICA, MADAGASCAR,
  EUROPE_WEST, EUROPE_EAST, ITALY, UK, IRELAND, ICELAND, SCANDINAVIA,
  NORTH_AMERICA, ALASKA, GREENLAND,
  SOUTH_AMERICA,
  RUSSIA_ASIA, MIDDLE_EAST, CENTRAL_ASIA,
  SOUTH_ASIA, SRI_LANKA,
  CHINA, KOREA, JAPAN,
  SE_ASIA, SUMATRA, JAVA, BORNEO, NEW_GUINEA, SULAWESI, PHILIPPINES,
  AUSTRALIA, TASMANIA, NZ_NORTH, NZ_SOUTH,
];

// ── Canvas-based land mask ─────────────────────────────────────────────

function createLandMask(): Uint8ClampedArray | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = MASK_W;
  canvas.height = MASK_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, MASK_W, MASK_H);
  ctx.fillStyle = "#fff";

  for (const outline of ALL_LANDMASSES) {
    ctx.beginPath();
    outline.forEach(([lat, lng], i) => {
      const x = ((lng + 180) / 360) * MASK_W;
      const y = ((90 - lat) / 180) * MASK_H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }

  return ctx.getImageData(0, 0, MASK_W, MASK_H).data;
}

function isLandFromMask(
  mask: Uint8ClampedArray,
  lat: number,
  lng: number
): boolean {
  const x = Math.round(((lng + 180) / 360) * (MASK_W - 1));
  const y = Math.round(((90 - lat) / 180) * (MASK_H - 1));
  return mask[(y * MASK_W + x) * 4] > 60;
}

// ── Arc data ───────────────────────────────────────────────────────────

interface ArcData {
  from: [number, number];
  to: [number, number];
}

const ARCS: ArcData[] = [
  { from: [40.7, -74.0], to: [51.5, -0.1] },
  { from: [51.5, -0.1], to: [25.2, 55.3] },
  { from: [35.7, 139.7], to: [-33.9, 151.2] },
  { from: [37.8, -122.4], to: [35.7, 139.7] },
  { from: [48.9, 2.35], to: [-23.6, -46.6] },
  { from: [1.35, 103.8], to: [55.8, 37.6] },
  { from: [40.7, -74.0], to: [-33.9, 18.4] },
  { from: [22.3, 114.2], to: [19.1, 72.9] },
];

function createArcCurve(
  from: [number, number],
  to: [number, number],
  radius: number
): THREE.QuadraticBezierCurve3 {
  const start = latLngToVec3(from[0], from[1], radius);
  const end = latLngToVec3(to[0], to[1], radius);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const dist = start.distanceTo(end);
  mid.normalize().multiplyScalar(radius + dist * 0.35);
  return new THREE.QuadraticBezierCurve3(start, mid, end);
}

// ── Component ──────────────────────────────────────────────────────────

export default function Globe() {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const landMask = createLandMask();
    if (!landMask) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0.2, 7.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // ── Dark sphere body ──
    const sphereGeo = new THREE.SphereGeometry(
      GLOBE_RADIUS * 0.99,
      64,
      64
    );
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x080820,
      transparent: true,
      opacity: 0.5,
    });
    globeGroup.add(new THREE.Mesh(sphereGeo, sphereMat));

    // ── Graticule grid ──
    const gratMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.06,
    });
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let d = 0; d <= 360; d += 3)
        pts.push(latLngToVec3(lat, d - 180, GLOBE_RADIUS * 1.001));
      globeGroup.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat)
      );
    }
    for (let lng = -180; lng < 180; lng += 30) {
      const pts: THREE.Vector3[] = [];
      for (let d = -90; d <= 90; d += 3)
        pts.push(latLngToVec3(d, lng, GLOBE_RADIUS * 1.001));
      globeGroup.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat)
      );
    }

    // ── Continent dots ──
    const dotGeo = new THREE.CircleGeometry(DOT_SIZE, 6);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const dots = new THREE.InstancedMesh(dotGeo, dotMat, MAX_LAND_DOTS);
    const dummy = new THREE.Object3D();
    let idx = 0;

    const latStep = 2;
    for (let lat = -88; lat <= 88; lat += latStep) {
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const lngCount = Math.max(12, Math.round(160 * cosLat));
      const lngStep = 360 / lngCount;
      for (let j = 0; j < lngCount; j++) {
        const lng = -180 + lngStep * j;
        if (!isLandFromMask(landMask, lat, lng)) continue;
        const pos = latLngToVec3(lat, lng, GLOBE_RADIUS);
        dummy.position.copy(pos);
        dummy.lookAt(pos.clone().multiplyScalar(2));
        dummy.updateMatrix();
        if (idx < MAX_LAND_DOTS) {
          dots.setMatrixAt(idx, dummy.matrix);
          idx++;
        }
      }
    }
    dots.count = idx;
    dots.instanceMatrix.needsUpdate = true;
    globeGroup.add(dots);

    // ── Sparse ocean dots ──
    const oceanGeo = new THREE.CircleGeometry(OCEAN_DOT_SIZE, 5);
    const oceanMat = new THREE.MeshBasicMaterial({
      color: 0x6688cc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.12,
    });
    const oceanDots = new THREE.InstancedMesh(oceanGeo, oceanMat, MAX_OCEAN_DOTS);
    let oIdx = 0;
    const oceanLatStep = 6;
    for (let lat = -84; lat <= 84; lat += oceanLatStep) {
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const lngCount = Math.max(6, Math.round(60 * cosLat));
      const lngStep = 360 / lngCount;
      for (let j = 0; j < lngCount; j++) {
        const lng = -180 + lngStep * j;
        if (isLandFromMask(landMask, lat, lng)) continue;
        const pos = latLngToVec3(lat, lng, GLOBE_RADIUS);
        dummy.position.copy(pos);
        dummy.lookAt(pos.clone().multiplyScalar(2));
        dummy.updateMatrix();
        if (oIdx < MAX_OCEAN_DOTS) {
          oceanDots.setMatrixAt(oIdx, dummy.matrix);
          oIdx++;
        }
      }
    }
    oceanDots.count = oIdx;
    oceanDots.instanceMatrix.needsUpdate = true;
    globeGroup.add(oceanDots);

    // ── Atmosphere glow (3 layers) ──
    const a1 = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide,
      })
    );
    const a2 = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.1, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x3366ff,
        transparent: true,
        opacity: 0.04,
        side: THREE.BackSide,
      })
    );
    const a3 = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.18, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x1144aa,
        transparent: true,
        opacity: 0.02,
        side: THREE.BackSide,
      })
    );
    globeGroup.add(a1, a2, a3);

    // ── Arcs ──
    const arcCurves: THREE.QuadraticBezierCurve3[] = [];
    ARCS.forEach((arc) => {
      const curve = createArcCurve(arc.from, arc.to, GLOBE_RADIUS);
      arcCurves.push(curve);
      const points = curve.getPoints(50);
      globeGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.18,
          })
        )
      );
    });

    // ── Pulse dots travelling along arcs ──
    const pulseGeo = new THREE.SphereGeometry(0.032, 8, 8);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x6699ff,
      transparent: true,
      opacity: 0.9,
    });
    const pulseDots = arcCurves.map((curve, i) => {
      const m = new THREE.Mesh(pulseGeo, pulseMat.clone());
      m.position.copy(curve.getPoint(0));
      globeGroup.add(m);
      return { mesh: m, curve, offset: i * 0.12 };
    });

    // ── Hotspot dots at arc endpoints ──
    const hsGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const hsMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    ARCS.forEach((arc) => {
      [arc.from, arc.to].forEach(([lat, lng]) => {
        const d = new THREE.Mesh(hsGeo, hsMat);
        d.position.copy(latLngToVec3(lat, lng, GLOBE_RADIUS));
        globeGroup.add(d);
      });
    });

    globeGroup.rotation.x = 0.15;

    // ── Animate ──
    const clock = new THREE.Clock();
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      globeGroup.rotation.y = t * 0.08;
      pulseDots.forEach(({ mesh, curve, offset }) => {
        const p = (t * 0.15 + offset) % 1;
        mesh.position.copy(curve.getPoint(p));
        (mesh.material as THREE.MeshBasicMaterial).opacity =
          Math.sin(p * Math.PI) * 0.9;
      });
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}
