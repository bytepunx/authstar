//! Shared test-only helpers, mainly EC key generation. Kept in one place so every test module
//! that needs a throwaway ES256 keypair doesn't re-derive its own `rand`-0.8-into-`rand_core`-
//! 0.6 adapter (the two crates' RNG traits don't unify automatically, and `p256::SecretKey::
//! random` wants the latter).

use p256::pkcs8::{EncodePrivateKey, LineEnding};
use p256::SecretKey;

use crate::keys::EcKeyPair;

struct OsRngAdapter;

impl p256::elliptic_curve::rand_core::RngCore for OsRngAdapter {
    fn next_u32(&mut self) -> u32 {
        rand::rngs::OsRng.next_u32()
    }
    fn next_u64(&mut self) -> u64 {
        rand::rngs::OsRng.next_u64()
    }
    fn fill_bytes(&mut self, dest: &mut [u8]) {
        rand::rngs::OsRng.fill_bytes(dest)
    }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand::Error> {
        rand::rngs::OsRng.fill_bytes(dest);
        Ok(())
    }
}
impl p256::elliptic_curve::rand_core::CryptoRng for OsRngAdapter {}

pub fn generate_pkcs8_pem() -> String {
    let secret_key = SecretKey::random(&mut OsRngAdapter);
    secret_key.to_pkcs8_pem(LineEnding::LF).unwrap().to_string()
}

pub fn generate_keypair() -> EcKeyPair {
    EcKeyPair::from_pem_bytes(generate_pkcs8_pem().as_bytes()).unwrap()
}
