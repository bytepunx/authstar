pub mod internal;
pub mod session;

#[derive(Debug, thiserror::Error)]
pub enum DurationParseError {
    #[error("empty duration string")]
    Empty,
    #[error("unrecognized duration unit {0:?} (expected s, m, h, or d)")]
    UnknownUnit(char),
    #[error("invalid numeric duration value: {0}")]
    InvalidNumber(#[from] std::num::ParseIntError),
}

/// Parses a duration string of the form `Xs`/`Xm`/`Xh`/`Xd` (e.g. `168h`) into seconds.
pub fn parse_duration(s: &str) -> Result<u64, DurationParseError> {
    let s = s.trim();
    if s.is_empty() {
        return Err(DurationParseError::Empty);
    }
    let unit = s.chars().last().unwrap();
    let (value_str, multiplier) = match unit {
        's' => (&s[..s.len() - 1], 1),
        'm' => (&s[..s.len() - 1], 60),
        'h' => (&s[..s.len() - 1], 60 * 60),
        'd' => (&s[..s.len() - 1], 60 * 60 * 24),
        _ => return Err(DurationParseError::UnknownUnit(unit)),
    };
    let value: u64 = value_str.parse()?;
    Ok(value * multiplier)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_seconds() {
        assert_eq!(parse_duration("30s").unwrap(), 30);
    }

    #[test]
    fn parses_minutes() {
        assert_eq!(parse_duration("5m").unwrap(), 300);
    }

    #[test]
    fn parses_hours() {
        assert_eq!(parse_duration("2h").unwrap(), 7200);
    }

    #[test]
    fn parses_days() {
        assert_eq!(parse_duration("7d").unwrap(), 604800);
    }

    #[test]
    fn parses_168h() {
        assert_eq!(parse_duration("168h").unwrap(), 604800);
    }

    #[test]
    fn rejects_unknown_unit() {
        assert!(parse_duration("5x").is_err());
    }

    #[test]
    fn rejects_empty() {
        assert!(parse_duration("").is_err());
    }
}
