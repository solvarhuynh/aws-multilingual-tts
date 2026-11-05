import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

// FLIP: đổi bố cục một lần, rồi dùng transform để nối từ vị trí cũ đến vị trí mới.
export function useSidebarMotion(toggle: () => void, reduced: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const running = useRef<Animation[]>([]);

  function stop() {
    const previous = running.current;
    running.current = [];
    previous.forEach((animation) => animation.cancel());
    ref.current?.removeAttribute("data-sidebar-moving");
  }
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => { if (media.matches) stop(); };
    media.addEventListener("change", onChange);
    window.addEventListener("resize", stop);
    return () => { media.removeEventListener("change", onChange); window.removeEventListener("resize", stop); stop(); };
  }, []);
  useEffect(() => { if (reduced) stop(); }, [reduced]);

  function toggleWithMotion() {
    const root = ref.current;
    if (!root || reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof root.animate !== "function") {
      stop(); toggle(); return;
    }
    const nodes = [...root.querySelectorAll<HTMLElement>(
      ".workspace, .sidebar-glass, .sidebar-brand, .sidebar-content > nav, .sidebar-toggle, .nav-selection",
    )];
    // Đọc trước khi hủy để bấm đảo chiều giữa chừng không nhảy về điểm xuất phát.
    const before = nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const radius = getComputedStyle(node).borderTopLeftRadius.split(" ").map(parseFloat);
      return { rect, rx: radius[0] * rect.width / node.offsetWidth,
        ry: (radius[1] ?? radius[0]) * rect.height / node.offsetHeight };
    });
    stop();
    flushSync(toggle);
    const style = getComputedStyle(root);
    const options: KeyframeAnimationOptions = { duration: parseFloat(style.getPropertyValue("--sidebar-duration")) || 380,
      easing: style.getPropertyValue("--sidebar-ease").trim() || "ease-out", fill: "both" };
    root.setAttribute("data-sidebar-moving", "");
    const animations = nodes.flatMap((node, index) => {
      const after = node.getBoundingClientRect(), old = before[index];
      if (!after.width || !after.height) return [];
      const glass = node.classList.contains("sidebar-glass");
      const pill = node.classList.contains("nav-selection");
      const scaleX = glass || pill || node.classList.contains("workspace") ? old.rect.width / after.width : 1;
      const scaleY = glass ? old.rect.height / after.height : 1;
      const computed = getComputedStyle(node);
      const end = computed.transform === "none" ? "" : computed.transform;
      const move = pill ? "" : `translate(${old.rect.left - after.left}px, ${old.rect.top - after.top}px)`;
      const from: Keyframe = { transform: `${move} scale(${scaleX},${scaleY}) ${end}` };
      const to: Keyframe = { transform: end || "none" };
      if (glass && Number.isFinite(old.rx) && Number.isFinite(old.ry)) {
        from.borderRadius = `${old.rx / scaleX}px / ${old.ry / scaleY}px`;
        to.borderRadius = computed.borderRadius;
      }
      return [node.animate([from, to], options)];
    });
    running.current = animations;
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (running.current === animations) stop();
    });
  }
  return { ref, toggleWithMotion };
}
