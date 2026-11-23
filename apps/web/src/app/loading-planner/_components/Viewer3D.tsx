"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BALANCE_TOLERANCE_PCT } from "../_lib/balance";
import { hasDoors } from "../_lib/loadStats";
import type { ContainerLoad, PlacedPiece } from "../_lib/plan";
import { cameraFor, sceneBalance, sceneBoxes, sceneFloor, type CameraView } from "../_lib/scene";
import { HINT } from "@/styles/ui";

interface Viewer3DProps {
  load: ContainerLoad;
  view: CameraView;
  /** Changes when another container is shown: the camera then goes back to where the view puts it. */
  containerKey: string;
  /** The colour of a cargo line, as "#rrggbb". */
  hexOf: (lineId: string) => string;
  /** The picked piece, as `pieceKey` names it. */
  selectedKey: string | null;
  onSelect: (piece: PlacedPiece | null) => void;
  /** Said to screen readers: what the picture shows. */
  label: string;
}

/** A piece by its cargo line and place: it stays the same piece when the plan is worked out again. */
export const pieceKey = (piece: PlacedPiece): string => `${piece.lineId}|${piece.x}|${piece.y}|${piece.z}`;

// The picture's own colours (slate, indigo, emerald and red of the app's palette), as three.js takes them.
const FLOOR = 0xe2e8f0;
const FRAME = 0x64748b;
const EDGE = 0x1e293b;
const DOORS = 0x4f46e5;
const OK = 0x10b981;
const OFF = 0xef4444;
const PICKED = 0x4338ca;

/** Frees the GPU memory of everything in the scene. */
function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) material.dispose();
  });
}

function buildScene(load: ContainerLoad, hexOf: (lineId: string) => string): { scene: THREE.Scene; pieces: THREE.Mesh[] } {
  const scene = new THREE.Scene();
  const floor = sceneFloor(load);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-floor.length, floor.length, floor.length);
  scene.add(sun);

  // The floor, a little under the cargo so the two never flicker.
  const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(floor.length, 0.05, floor.width), new THREE.MeshLambertMaterial({ color: FLOOR }));
  floorMesh.position.set(floor.length / 2, -0.03, floor.width / 2);
  scene.add(floorMesh);

  // The container: its frame as lines, or, for a flat rack, its two end walls.
  const frame = new THREE.LineBasicMaterial({ color: FRAME });
  const endWall = (x: number, material: THREE.LineBasicMaterial) => {
    const wall = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(floor.width, floor.height)), material);
    wall.rotation.y = Math.PI / 2;
    wall.position.set(x, floor.height / 2, floor.width / 2);
    scene.add(wall);
  };
  if (hasDoors(load.container)) {
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(floor.length, floor.height, floor.width)), frame);
    box.position.set(floor.length / 2, floor.height / 2, floor.width / 2);
    scene.add(box);
    // The door end, in the accent colour, with its two leaves.
    const doors = new THREE.LineBasicMaterial({ color: DOORS });
    endWall(floor.length + 0.01, doors);
    const post = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, floor.height, 0)]), doors);
    post.position.set(floor.length + 0.01, 0, floor.width / 2);
    scene.add(post);
  } else {
    endWall(0, frame);
    endWall(floor.length, frame);
  }

  // The cargo: a box per piece in the colour of its line, with dark edges.
  const edge = new THREE.LineBasicMaterial({ color: EDGE });
  const boxes = sceneBoxes(load);
  const pieces = boxes.map((box) => {
    const geometry = new THREE.BoxGeometry(...box.size);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: hexOf(box.piece.lineId) }));
    mesh.position.set(...box.centre);
    mesh.userData.piece = box.piece;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge));
    scene.add(mesh);
    return mesh;
  });

  // The balance: the area the centre of gravity must stay in, drawn on the floor, and a post with
  // a ball where it is. Green inside, red outside.
  const balance = sceneBalance(load, BALANCE_TOLERANCE_PCT);
  const [tolX, tolZ] = balance.tolerance;
  const zone = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(tolX * 2, tolZ * 2)), new THREE.LineBasicMaterial({ color: OK }));
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(floor.length / 2, 0.01, floor.width / 2);
  scene.add(zone);

  const mark = new THREE.MeshBasicMaterial({ color: balance.ok ? OK : OFF });
  const top = Math.max(floor.height, ...boxes.map((b) => b.centre[1] + b.size[1] / 2)) + 0.4;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, top, 8), mark);
  post.position.set(balance.cog[0], top / 2, balance.cog[1]);
  scene.add(post);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mark);
  ball.position.set(balance.cog[0], top, balance.cog[1]);
  scene.add(ball);

  return { scene, pieces };
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  pieces: THREE.Mesh[];
  render: () => void;
}

// One load in 3D: drag to turn it, Ctrl or ⌘ with the wheel to zoom, click a piece to pick it. The
// drawing surface is made once and kept while the plan changes: only the cargo is drawn again, the
// camera stays where the user turned it. The picture is drawn when something changes, not in a loop.
// Where the computer cannot draw 3D at all, a line says so and the rest of the page works as usual.
export function Viewer3D({ load, view, containerKey, hexOf, selectedKey, onSelect, label }: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // The drawing surface, the camera and the mouse: once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    // The wheel scrolls the page, as everywhere else; it zooms the picture only with Ctrl or ⌘ held.
    // Registered before the controls, so a plain wheel never reaches them.
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
    };
    renderer.domElement.addEventListener("wheel", handleWheel);
    const controls = new OrbitControls(camera, renderer.domElement);
    const stage: Stage = { renderer, camera, controls, scene: new THREE.Scene(), pieces: [], render: () => renderer.render(stage.scene, camera) };
    controls.addEventListener("change", stage.render);

    const fit = () => {
      const { clientWidth, clientHeight } = host;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      stage.render();
    };
    const resize = new ResizeObserver(fit);
    resize.observe(host);

    // A click picks the piece under the pointer; a drag (turning the picture) picks nothing.
    let downAt: [number, number] | null = null;
    const handleDown = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY];
    };
    const handleUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
      const box = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(stage.pieces, false)[0];
      onSelectRef.current((hit?.object.userData.piece as PlacedPiece | undefined) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", handleDown);
    renderer.domElement.addEventListener("pointerup", handleUp);

    stageRef.current = stage;
    return () => {
      stageRef.current = null;
      resize.disconnect();
      controls.dispose();
      disposeScene(stage.scene);
      // Browsers allow only a few 3D surfaces at once: give this one back at once.
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // The cargo: drawn again whenever the plan is worked out again.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    disposeScene(stage.scene);
    const built = buildScene(load, hexOf);
    stage.scene = built.scene;
    stage.pieces = built.pieces;
    stage.render();
    // hexOf follows the cargo list, which `load` already follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // The camera stands where the chosen view puts it, for this container; it does not move while
  // the same container's cargo changes.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!stage) return;
    const aspect = host && host.clientHeight > 0 ? host.clientWidth / host.clientHeight : undefined;
    const { position, target } = cameraFor(view, loadRef.current, aspect);
    stage.camera.position.set(...position);
    stage.controls.target.set(...target);
    stage.controls.update();
    stage.render();
  }, [view, containerKey]);

  // The picked piece gets an indigo frame around it and an indigo glow.
  useEffect(() => {
    const stage = stageRef.current;
    const mesh = stage?.pieces.find((m) => pieceKey(m.userData.piece as PlacedPiece) === selectedKey);
    if (!stage || !mesh) return;
    const material = mesh.material as THREE.MeshLambertMaterial;
    material.emissive.set(0x3730a3);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: PICKED }));
    frame.position.copy(mesh.position);
    frame.scale.setScalar(1.03);
    stage.scene.add(frame);
    stage.render();
    return () => {
      material.emissive.set(0x000000);
      frame.removeFromParent();
      frame.geometry.dispose();
      (frame.material as THREE.Material).dispose();
      stageRef.current?.render();
    };
  }, [selectedKey, load]);

  if (unavailable) {
    return <p className={`${HINT} m-0 rounded-lg bg-slate-50 px-4 py-6 text-center`}>The 3D view is not available on this computer. The floor plans below show the same loads.</p>;
  }
  // A finger scrolls the page up and down over the picture; turning it is a sideways drag.
  return <div ref={hostRef} role="img" aria-label={label} className="h-[460px] w-full cursor-grab touch-pan-y overflow-hidden rounded-lg bg-slate-50 active:cursor-grabbing" />;
}
