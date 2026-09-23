// Steward's proxy client for herald's operator key-rotation route (Story
// 005 "Herald Keys" -- the one screen where the backend target isn't tower
// or keep). Deliberately its own tiny client, not folded into
// tower-client.ts, so the "this call goes to a different service" fact stays
// visible in the code, not just in a comment.

import { backendRequest, type BackendResult, type FetchLike } from './backend-client.js'
import type { RotateHeraldKeysRequest, RotateHeraldKeysResponse } from '../types.js'

export interface HeraldClientOptions {
  baseUrl: string
  fetchImpl?: FetchLike
}

export function createHeraldClient({ baseUrl, fetchImpl = fetch }: HeraldClientOptions) {
  return {
    rotateKeys(token: string, actorLabel: string, body: RotateHeraldKeysRequest): Promise<BackendResult<RotateHeraldKeysResponse>> {
      return backendRequest<RotateHeraldKeysResponse>(fetchImpl, baseUrl, {
        method: 'POST',
        path: '/operator/rotate-keys',
        token,
        actorLabel,
        body,
      })
    },
  }
}

export type HeraldClient = ReturnType<typeof createHeraldClient>
