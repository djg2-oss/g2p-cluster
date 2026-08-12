# Dual-Engine — best design + output plan

## Goal
Two backends that **raise quality**, not only share load.

| Wrong | Right |
|-------|--------|
| Same work in parallel, first wins | **Series:** draft → critic → edit |
| Duplicate META only | Specialist draft + structured rubric |
| Hope | **Measured** quality score |

---

## Compared to “best” patterns

| Pattern | Who uses it | We implement |
|---------|-------------|--------------|
| Draft → verify / self-check | Strong LLM products | Critic rubric + verify pass |
| Mixture-of-experts routing | Large systems | META A/B/C → specialist |
| Cascade refinement | Map-reduce / agentic | Engine-D then Engine-R |
| Load-balanced replicas | K8s / SaaS | Still for `/api/health` & FE |
| Adversarial critic | Eval harnesses | Hole list + patches |

We do **not** pretend to beat frontier model pretraining.  
We **do** beat thin dual-replica “same answer twice.”

---

## Architecture

```
        LB :8080
           |
    POST /api/pipeline
           |
     ┌─────▼─────┐
     │  Engine-D │  BE that accepts request
     │  ANALYZE  │  META route
     │  DRAFT    │  specialist + real math when possible
     └─────┬─────┘
           │ draft JSON
     ┌─────▼─────┐
     │  Engine-R │  PEER backend
     │  CRITIC   │  rubric 0–1
     │  EDIT     │  patches for holes
     │  VERIFY   │  optional 2nd pass if quality < 0.62
     └─────┬─────┘
           ▼
        FINAL + quality score
```

**Parallel RR** remains for static/health.  
**Quality path is sequential.**

---

## Roles

| Engine | Host | Job |
|--------|------|-----|
| **D** | Request BE | Route + draft (solve if math) |
| **R** | Peer BE | Critique + edit + confidence |

If peer down → local refine fallback (degraded, still works).

---

## Rubric (output quality)

| Axis | Weight (in score) |
|------|-------------------|
| Correctness | 0.30 |
| Completeness | 0.25 |
| Clarity | 0.20 |
| Actionability | 0.25 |
| Safety | multiplier (0 kills output) |

`quality = safety * weighted sum`  
Pass threshold: **≥ 0.72**

---

## API

| Method | Path | Use |
|--------|------|-----|
| POST | `/api/pipeline` | Full dual-engine quality |
| POST | `/api/refine` | Critic/edit only |
| POST | `/api/route` | Fast META only |
| GET | `/api/metrics` | routes, pipelines, refines |

---

## Output plan (ship sequence)

### Phase A — Now (done in code)
- [x] Sequential draft→refine
- [x] Structured critic rubric
- [x] Real quadratic/linear solver in draft
- [x] Peer hop + local fallback
- [x] Double-pass if quality low
- [x] FE uses `/api/pipeline`
- [x] 2 FE + 2 BE + LB

### Phase B — Next
- [ ] Role pin: `ENGINE_ROLE=draft|refine` sticky hosts
- [ ] Pipeline result cache (hash text → quality payload TTL)
- [ ] Wire Agent G2P UI chat to edge `/api/pipeline` when cluster mode
- [ ] Video: Director draft on BE-D → param refine on BE-R → RunPod

### Phase C — Scale
- [ ] Optional 3rd engine verify-only
- [ ] Metrics dashboard (p50/p95 pipeline ms, quality hist)
- [ ] VPS docker-compose multi-node (not Vercel)

---

## Success metrics

| Metric | Target |
|--------|--------|
| Pipeline p95 | < 50ms local (no GPU) |
| Math simple accuracy | > 95% on linear/quadratic suite |
| Peer failover | 100% local fallback |
| Safety block | 100% on illegal patterns |
| Quality score mean | > 0.75 on bake prompts |

---

## Commands

```bash
sh deploy/start-cluster.sh

curl -s -X POST http://127.0.0.1:8080/api/pipeline \
  -H 'content-type: application/json' \
  -d '{"text":"solve 2x^2+3x-5=0"}'
```

---

## One-line design law

**Two engines, one direction: D creates, R improves — never two copies of the same guess.**
