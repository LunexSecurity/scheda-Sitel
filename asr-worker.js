// Speech to text on the phone: Whisper runs here, the audio never leaves the device.
import { pipeline, env } from "./vendor/transformers.min.js";

env.allowLocalModels = false;
env.useBrowserCache = true;  // the model is downloaded once and kept on the phone
env.backends.onnx.wasm.wasmPaths = new URL("./vendor/", self.location).href;

// "small" understands Italian much better than "base"; both repos hold the same model, the second is a spare
const MODELS = ["onnx-community/whisper-small", "Xenova/whisper-small"];
let asr = null;

function progress(p) {
  if (p.status === "progress" && p.total) self.postMessage({ type: "download", file: p.file, loaded: p.loaded, total: p.total });
}

// the earlier "base" model is no longer used: free its space on the phone
async function dropOldModel() {
  try { const c = await caches.open("transformers-cache"); for (const r of await c.keys()) if (r.url.includes("whisper-base")) await c.delete(r); } catch (e) {}
}

async function load() {
  if (asr) return asr;
  // iPhone: WebGPU is still unreliable with Whisper there, use the plain engine
  const ios = /iPhone|iPad|iPod/.test(self.navigator.userAgent) || (self.navigator.platform === "MacIntel" && self.navigator.maxTouchPoints > 1);
  if (self.navigator.gpu && !ios) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        asr = await pipeline("automatic-speech-recognition", MODELS[0], { device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback: progress });
        dropOldModel();
        return asr;
      }
    } catch (e) { asr = null; }
  }
  let last;
  for (const id of MODELS) {
    try { asr = await pipeline("automatic-speech-recognition", id, { device: "wasm", dtype: { encoder_model: "q8", decoder_model_merged: "q8" }, progress_callback: progress }); break; }
    catch (e) { last = e; asr = null; }
  }
  if (!asr) throw last;
  dropOldModel();
  return asr;
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "load") { await load(); self.postMessage({ type: "ready" }); return; }
    if (m.type === "transcribe") {
      const t = await load();
      self.postMessage({ type: "working" });
      const out = await t(m.audio, { language: "italian", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
      self.postMessage({ type: "text", text: (out.text || "").trim() });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
