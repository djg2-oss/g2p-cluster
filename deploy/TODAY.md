# G2P Studio — map and today’s better build

## What exists (mapped)

| Layer | Job | Limit before today |
|-------|-----|-------------------|
| Agent dual-engine | draft → critic → edit for **text** | Video prompts skipped this |
| Director | preset + camera wrap | No second pass |
| WAN 2.2 | GPU | FE called `/api/video` raw |
| Studio UI | generate / stage / library / memory / agent | No sequential queue, no GPU knobs |

## What is better now (real, not extra AI keys)

1. **Studio run** `/api/studio/run` — director draft → critic holes → edit prompt → WAN  
2. **Sequential queue** — one GPU job at a time (quality + fewer 429s)  
3. **Manual steps + seed**  
4. Still no xAI. Agent G2P stays independent.

No new foundation model was added. Quality gain is the series pass on the shot, then the same WAN you already pay for.
