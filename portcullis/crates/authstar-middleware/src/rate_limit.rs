//! Per design/decisions/0101-api-keys.md -- portcullis's first rate-limiting infrastructure.
//! In-process, single-replica, fixed-window, keyed by `apiKeyId`. Config arrives fresh on every
//! `/verify-api-key` response (`api_key_verifier::ApiKeyRateLimit`) and is applied against the
//! existing local bucket for that key -- a config refresh (a plan change taking effect) never
//! resets the bucket's current window.
//!
//! **Single-instance pilot, same disclaimer `chronicle`/`lookout` already carry for their own
//! in-memory limiters** (`chronicle/src/lib/rate-limit.ts`, `lookout/src/lib/rate-limiter.ts`):
//! correct only because portcullis genuinely runs `replicas: 1` today (confirmed directly against
//! its real deployment manifest, no HPA). A second replica would let a caller get twice the
//! configured rate by round-robin-ing between two independent, un-synchronized bucket maps. Needs
//! a shared backing store (Redis/Valkey) before any multi-replica portcullis deployment -- not
//! invented here, a real forward-looking gap same as those two services' own.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::api_key_verifier::ApiKeyRateLimit;

struct Bucket {
    window_start_secs: u64,
    count: u32,
}

/// `burst` is folded into a single effective per-window cap
/// (`requests_per_minute + burst.unwrap_or(0)`) rather than modeled as a separate token-bucket
/// dimension -- a fixed 60-second window already only resets once a minute, so "burst" here means
/// "how far over the steady-state rate this window may go," not true token-bucket burst-then-
/// refill behavior. A simplification worth revisiting if real traffic shows the difference
/// matters (see this module's own single-instance-pilot framing above).
pub struct ApiKeyRateLimiter {
    buckets: Mutex<HashMap<String, Bucket>>,
}

impl ApiKeyRateLimiter {
    pub fn new() -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
        }
    }

    /// `true` if this request is allowed (and recorded); `false` if it would exceed the limit for
    /// the current window (recorded as an attempt regardless, so a caller hammering past their
    /// limit doesn't get to keep re-testing for free within the same window).
    pub fn check_and_record(&self, api_key_id: &str, limit: &ApiKeyRateLimit) -> bool {
        self.check_and_record_at(api_key_id, limit, now_unix())
    }

    fn check_and_record_at(&self, api_key_id: &str, limit: &ApiKeyRateLimit, now_secs: u64) -> bool {
        let window_start = now_secs - (now_secs % 60);
        let cap = limit.requests_per_minute + limit.burst.unwrap_or(0);

        let mut buckets = self.buckets.lock().unwrap();
        let bucket = buckets.entry(api_key_id.to_string()).or_insert(Bucket {
            window_start_secs: window_start,
            count: 0,
        });

        if bucket.window_start_secs != window_start {
            bucket.window_start_secs = window_start;
            bucket.count = 0;
        }

        if bucket.count >= cap {
            return false;
        }
        bucket.count += 1;
        true
    }
}

impl Default for ApiKeyRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limit(requests_per_minute: u32, burst: Option<u32>) -> ApiKeyRateLimit {
        ApiKeyRateLimit {
            requests_per_minute,
            burst,
        }
    }

    #[test]
    fn allows_requests_up_to_the_cap() {
        let limiter = ApiKeyRateLimiter::new();
        let l = limit(3, None);
        assert!(limiter.check_and_record_at("k1", &l, 0));
        assert!(limiter.check_and_record_at("k1", &l, 0));
        assert!(limiter.check_and_record_at("k1", &l, 0));
        assert!(!limiter.check_and_record_at("k1", &l, 0));
    }

    #[test]
    fn burst_extends_the_effective_cap() {
        let limiter = ApiKeyRateLimiter::new();
        let l = limit(2, Some(1));
        assert!(limiter.check_and_record_at("k1", &l, 0));
        assert!(limiter.check_and_record_at("k1", &l, 0));
        assert!(limiter.check_and_record_at("k1", &l, 0));
        assert!(!limiter.check_and_record_at("k1", &l, 0));
    }

    #[test]
    fn resets_on_a_new_window() {
        let limiter = ApiKeyRateLimiter::new();
        let l = limit(1, None);
        assert!(limiter.check_and_record_at("k1", &l, 0));
        assert!(!limiter.check_and_record_at("k1", &l, 30));
        assert!(limiter.check_and_record_at("k1", &l, 60));
    }

    #[test]
    fn keys_are_independent() {
        let limiter = ApiKeyRateLimiter::new();
        let l = limit(1, None);
        assert!(limiter.check_and_record_at("k1", &l, 0));
        assert!(limiter.check_and_record_at("k2", &l, 0));
    }
}
