import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Building } from "./geo";

export const CAPTURE_WIDTH = 1024;
export const CAPTURE_HEIGHT = 576;

export type WhiteboxView = {
  setBuildings(buildings: Building[]): void;
  /** Renders the current camera as a shaded white-box PNG and a depth PNG (near = white). */
  capture(): Promise<{ shaded: Blob; depth: Blob }>;
  dispose(): void;
};

function extrude(b: Building): THREE.BufferGeometry {
  // Shape lives in the XY plane; after rotating -90deg about X, shape-y maps to -z, so feed it z directly negated.
  const shape = new THREE.Shape(b.footprint.map(([east, south]) => new THREE.Vector2(east, -south)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // extrude along +y; shape-y -> -z, so north (-south) lands on -z
  return geo;
}

export function createWhiteboxView(canvas: HTMLCanvasElement): WhiteboxView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(CAPTURE_WIDTH, CAPTURE_HEIGHT, false);

  const scene = new THREE.Scene();
  const sky = new THREE.Color(0xc9d3dc);
  scene.background = sky;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(120, 200, 80);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 1 }),
  );
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(50, CAPTURE_WIDTH / CAPTURE_HEIGHT, 1, 3000);
  camera.position.set(90, 60, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.enableDamping = true;

  const group = new THREE.Group();
  scene.add(group);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const highlight = new THREE.MeshStandardMaterial({ color: 0xfff1b8, roughness: 0.95 });

  let frame = 0;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  function clearGroup() {
    for (const child of group.children) (child as THREE.Mesh).geometry.dispose();
    group.clear();
  }

  function toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not capture the view."))), "image/png"),
    );
  }

  return {
    setBuildings(buildings) {
      clearGroup();
      for (const b of buildings) group.add(new THREE.Mesh(extrude(b), b.isTarget ? highlight : white));
      const target = buildings.find((b) => b.isTarget);
      const h = target?.height ?? 15;
      const d = Math.max(110, h * 1.6); // back off further for tall buildings
      controls.target.set(0, h * 0.45, 0);
      camera.position.set(d * 0.6, h * 0.6 + 30, d);
      controls.update();
    },
    async capture() {
      controls.update();
      renderer.render(scene, camera);
      const shaded = await toBlob();

      // Depth pass: whitened near, black far, scaled to the scene around the camera target.
      const dist = camera.position.distanceTo(controls.target);
      const near = camera.near;
      const far = camera.far;
      camera.near = Math.max(1, dist * 0.2);
      camera.far = dist * 4;
      camera.updateProjectionMatrix();
      const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
      scene.overrideMaterial = depthMat;
      scene.background = new THREE.Color(0x000000);
      renderer.render(scene, camera);
      const depth = await toBlob();

      scene.overrideMaterial = null;
      scene.background = sky;
      depthMat.dispose();
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return { shaded, depth };
    },
    dispose() {
      cancelAnimationFrame(frame);
      controls.dispose();
      clearGroup();
      renderer.dispose();
    },
  };
}
