---
id: I-0026
title: A kluster deploy's image build fails when Docker Hub's token endpoint drops the connection pulling a base image
class: blocker
status: open
count: 1
cost: 15m
first_reported: 2026-11-14T09:13:58Z
last_reported: 2026-11-14T09:13:58Z
updated: 2026-11-14T09:30:31Z
---

# I-0026 A kluster deploy's image build fails when Docker Hub's token endpoint drops the connection pulling a base image

## Description
A kluster deploy's image build fails when Docker Hub's token endpoint drops the connection pulling a base image

## Instances

### 2026-11-14T09:13:58Z
Story: S-0017.
flai serve's deploy of S-0017 at c92154e failed at build-tower. `scripts/kluster-build.sh` ran `docker build` on `tower/Dockerfile`, and loading `node:22-slim`'s metadata failed with `failed to fetch oauth token: Post "https://auth.docker.io/token": unexpected EOF`. None of the story's code was built, and the same build passed an hour earlier at 8b350d4. The flaky registry call sent the story back from review (TH-0052) and costs a full redeploy cycle. A retry around the base-image pull, or a base image the kluster keeps locally, would spare stories this.

## Remediation

Story S-0030 remediates this issue, created from it at 2026-11-14T09:30:31Z.
