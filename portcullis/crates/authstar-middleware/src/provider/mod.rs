pub mod discovery;

pub use discovery::{
    discover_all, discover_one, DiscoveryError, DiscoveryOutcome, DiscoveryTarget, ResolvedProvider,
};
