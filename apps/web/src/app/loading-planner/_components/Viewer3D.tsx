"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BALANCE_TOLERANCE_PCT } from "../_lib/balance";
import type { ContainerLoad, PlacedPiece } from "../_lib/plan";
import { cameraFor, sceneBalance, sceneBoxes, sceneFloor, type CameraView } from "../_lib/scene";

interface Viewer3DProps {
  load: ContainerLoad;
  view: CameraView;
  /** The colour of a cargo line, as "#rrggbb". */
  hexOf: (lineId: string) => string;
  selected: PlacedPiece | null;
  onSelect: (piece: PlacedPiece | null) => void;
}

// The picture's own colours (slate, emerald and red of the app's palette), as three.js takes them.
const FLOOR = 0xe2e8f0;
const FRAME = 0x64748b;
const EDGE = 0x1e293b;
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
  if (load.container.group === "flat-rack") {
    for (const x of [0, floor.length]) {
      const wall = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(floor.width, floor.height)), frame);
      wall.rotation.y = Math.PI / 2;
      wall.position.set(x, floor.height / 2, floor.width / 2);
      scene.add(wall);
    }
  } else {
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(floor.length, floor.height, floor.width)), frame);
    box.position.set(floor.length / 2, floor.height / 2, floor.width / 2);
    scene.add(box);
  }

  // The cargo: a box per piece in the colour of its line, with dark edges.
  const edge = new THREE.LineBasicMaterial({ color: EDGE });
  const pieces = sceneBoxes(load).map((box) => {
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
  const top = Math.max(floor.height, ...sceneBoxes(load).map((b) => b.centre[1] + b.size[1] / 2)) + 0.4;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, top, 8), mark);
  post.position.set(balance.cog[0], top / 2, balance.cog[1]);
  scene.add(post);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mark);
  ball.position.set(balance.cog[0], top, balance.cog[1]);
  scene.add(ball);

  return { scene, pieces };
}

// One load in 3D: drag to turn it, Ctrl or ⌘ with the wheel to zoom, click a piece to pick it. The picture is drawn
// again only when something changes (the load, the camera, the picked piece), not in a loop.
export function Viewer3D({ load, view, hexOf, selected, onSelect }: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // What the effects below share: made once per load, so picking a piece does not rebuild the scene.
  const stageRef = useRef<{ render: () => void; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; pieces: THREE.Mesh[] } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const { scene, pieces } = buildScene(load, hexOf);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    // The wheel scrolls the page, as everywhere else; it zooms the picture only with Ctrl or ⌘ held.
    // Registered before the controls, so a plain wheel never reaches them.
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
    };
    renderer.domElement.addEventListener("wheel", handleWheel);
    const controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);

    const fit = () => {
      const { clientWidth, clientHeight } = host;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      render();
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
      const hit = ray.intersectObjects(pieces, false)[0];
      onSelectRef.current((hit?.object.userData.piece as PlacedPiece | undefined) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", handleDown);
    renderer.domElement.addEventListener("pointerup", handleUp);

    stageRef.current = { render, scene, camera, controls, pieces };
    return () => {
      stageRef.current = null;
      resize.disconnect();
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
    // hexOf follows the cargo list, which `load` already follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // The camera stands where the chosen view puts it, for this load.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const host = hostRef.current;
    const aspect = host && host.clientHeight > 0 ? host.clientWidth / host.clientHeight : undefined;
    const { position, target } = cameraFor(view, load, aspect);
    stage.camera.position.set(...position);
    stage.controls.target.set(...target);
    stage.controls.update();
    stage.render();
  }, [view, load]);

  // The picked piece gets an indigo frame around it and an indigo glow.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const mesh = stage.pieces.find((m) => m.userData.piece === selected);
    if (!mesh) {
      stage.render();
      return;
    }
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
    };
  }, [selected, load]);

  return <div ref={hostRef} className="h-[460px] w-full cursor-grab touch-none overflow-hidden rounded-lg bg-slate-50 active:cursor-grabbing" />;
}
