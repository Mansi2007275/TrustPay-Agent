"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// The agent's "brain" — a rotating wireframe icosahedron with an inner
// pulsing core. Pure vanilla three.js (no extra renderer deps), mounted
// into a fixed-size canvas. Colors track the current risk state.
export default function AgentOrb({ riskTone = "safe", size = 260 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const toneColors = {
      safe: 0x0a0a0a,
      warn: 0xffb700,
      danger: 0xff5c5c,
    };
    const wireColor = toneColors[riskTone] ?? toneColors.safe;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Outer wireframe shell — the agent's decision boundary
    const outerGeo = new THREE.IcosahedronGeometry(2, 1);
    const outerMat = new THREE.MeshBasicMaterial({ color: wireColor, wireframe: true });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    scene.add(outer);

    // Inner glowing core — the "conscience"
    const coreGeo = new THREE.IcosahedronGeometry(0.7, 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffde59, wireframe: true });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    let frameId;
    let mouseX = 0, mouseY = 0;

    const handleMouseMove = (e) => {
      const rect = mount.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener("mousemove", handleMouseMove);

    const clock = new THREE.Clock();

    const animate = () => {
      const t = clock.getElapsedTime();
      outer.rotation.x = t * 0.25 + mouseY * 0.3;
      outer.rotation.y = t * 0.35 + mouseX * 0.3;
      core.rotation.x = -t * 0.5;
      core.rotation.y = t * 0.4;
      core.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("mousemove", handleMouseMove);
      outerGeo.dispose();
      outerMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [riskTone, size]);

  return <div ref={mountRef} style={{ width: size, height: size }} />;
}
