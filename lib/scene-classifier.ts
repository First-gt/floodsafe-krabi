/**
 * ตัวจำแนกฉากในเครื่อง (MobileNetV2 / ImageNet ผ่าน TensorFlow.js)
 * ใช้ปฏิเสธรูปที่ชัดเจนว่าไม่เกี่ยวข้อง เช่น อาหาร สัตว์ บุคคล
 * และตรวจหาสัญญาณของ "ฉากที่มีน้ำ" (ทะเลสาบ ชายฝั่ง เรือ ฯลฯ)
 *
 * โมเดลอยู่ใน /public/models/mobilenet_v2 (โหลดครั้งแรกประมาณ 14 MB แล้วเบราว์เซอร์แคชไว้)
 * โหลดแบบ lazy เฉพาะตอนผู้ใช้แนบรูป ถ้าโหลดไม่ได้จะข้ามไปโดยไม่ทำให้ฟอร์มพัง
 */

import { withBase } from './base-path';

export interface SceneResult {
  /** ความน่าจะเป็นรวมของคลาสที่ไม่เกี่ยวกับน้ำท่วมแน่ ๆ (สัตว์ / อาหาร / บุคคลโพสต์ท่า) */
  unrelated: number;
  unrelatedLabel: string;
  /** ความน่าจะเป็นรวมของคลาสที่เกี่ยวกับน้ำ (ทะเลสาบ ชายฝั่ง เรือ ท่าเรือ ฯลฯ) */
  water: number;
}

// ดัชนีคลาสของ ImageNet-1k
const WATER = new Set([449, 460, 472, 484, 510, 525, 536, 554, 576, 625, 628, 693, 694, 718, 724, 780, 814, 833, 871, 913, 914, 973, 975, 977, 978]);
const inRange = (i: number, a: number, b: number) => i >= a && i <= b;

type Model = { infer: (img: HTMLImageElement, embedding?: boolean) => { data: () => Promise<Float32Array>; dispose: () => void } };
let modelPromise: Promise<Model> | null = null;

function loadModel(): Promise<Model> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      const mobilenet = await import('@tensorflow-models/mobilenet');
      await tf.ready();
      return (await mobilenet.load({ version: 2, alpha: 1.0, modelUrl: withBase('/models/mobilenet_v2/model.json') })) as unknown as Model;
    })();
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

export async function classifyScene(img: HTMLImageElement): Promise<SceneResult | null> {
  try {
    const model = await Promise.race([loadModel(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 45000))]);
    const logits = model.infer(img, false);
    const raw = await logits.data();
    logits.dispose();
    // softmax
    let mx = -Infinity;
    for (let i = 0; i < 1000; i++) mx = Math.max(mx, raw[i]);
    let sum = 0;
    const p = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) {
      p[i] = Math.exp(raw[i] - mx);
      sum += p[i];
    }
    let animal = 0;
    let food = 0;
    let person = 0;
    let water = 0;
    for (let i = 0; i < 1000; i++) {
      const v = p[i] / sum;
      if (inRange(i, 0, 397)) animal += v;
      else if (inRange(i, 922, 969)) food += v;
      else if (inRange(i, 981, 983)) person += v;
      if (WATER.has(i)) water += v;
    }
    const unrelated = animal + food + person;
    const top = Math.max(animal, food, person);
    return {
      unrelated,
      unrelatedLabel: top === food ? 'อาหาร' : top === animal ? 'สัตว์' : 'บุคคล',
      water,
    };
  } catch {
    return null;
  }
}
