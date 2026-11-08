import { Window } from "happy-dom";
import { createServer } from "vite";

export async function environment({ demo = false } = {}) {
  const win = new Window({ url: "http://localhost/#studio" });
  const globals = ["document", "location", "localStorage", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement",
    "HTMLFormElement", "HTMLButtonElement", "HTMLOptionElement", "HTMLMediaElement", "SVGElement", "ShadowRoot", "Document",
    "Element", "Node", "NodeFilter", "DocumentFragment", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "PointerEvent",
    "MutationObserver", "ResizeObserver", "IntersectionObserver"];
  Object.defineProperty(globalThis, "window", { value: win, configurable: true });
  for (const key of globals) Object.defineProperty(globalThis, key, { value: win[key], configurable: true });
  for (const key of ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "requestIdleCallback", "cancelIdleCallback"])
    if (typeof win[key] === "function") Object.defineProperty(globalThis, key, { value: win[key].bind(win), configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error("Không được gọi mạng trong kiểm thử UI"); };
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.scrollTo = () => {};
  const { createRoot } = await import("react-dom/client");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent",
    define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify(demo ? "" : "https://tts.test") } });
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
  return { win, root, mount, load: (path) => server.ssrLoadModule(`/src/${path}`),
    close: async () => { await server.close(); await win.happyDOM.close(); } };
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

export const recording = (id = "one") => ({ jobId: id, text: "Nội dung bản thu.", lang: "vi-VN", voice: "Linh",
  charCount: 17, speed: 1, status: "DONE", audioUrl: `https://audio.test/${id}.mp3`, createdAt: new Date().toISOString() });
