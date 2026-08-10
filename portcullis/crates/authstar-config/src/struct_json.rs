//! Converts a `prost_types::Struct` (the wire shape signet's `GetServiceBundleResponse.bundle`
//! comes back as) into `serde_json::Value`, so it can be deserialized into our typed [`Bundle`]
//! via serde. Neither `prost-types` nor `signet-client` ship this conversion (confirmed against
//! the signet-client `echo` example, which hand-rolls the same thing purely for log output) —
//! this is the one place portcullis needs its own equivalent.
//!
//! **Real bug found by the live signet integration test** (see TESTING.md): `google.protobuf.
//! Struct`'s `number_value` is *always* a double — protobuf's `Struct`/`Value` has no separate
//! integer variant at all. A config value authored as plain YAML `timeout: 30` therefore comes
//! back from signet as the float `30.0`, and `serde_json::Number::from_f64(30.0)` produces a
//! JSON number that `serde` tracks internally as float-typed — which `serde`'s strict-by-default
//! integer deserialization (`u64`/`u32` fields throughout `bundle.rs`) then rejects with
//! `invalid type: floating point '30.0', expected u64`, even though `30.0` is mathematically a
//! whole number. `value_to_json` below special-cases whole-number floats into a JSON integer so
//! every count/duration/timeout field in `bundle.rs` (all realistically always whole numbers —
//! seconds, byte counts, generation numbers) deserializes as the caller actually intends.
//! Genuinely fractional values (none exist in the current bundle shape, but nothing stops a
//! future one) still round-trip as floats.

use prost_types::{value::Kind, ListValue, Struct, Value};
use serde_json::{Map, Number};

pub fn struct_to_json(s: &Struct) -> serde_json::Value {
    let mut map = Map::with_capacity(s.fields.len());
    for (k, v) in &s.fields {
        map.insert(k.clone(), value_to_json(v));
    }
    serde_json::Value::Object(map)
}

fn value_to_json(v: &Value) -> serde_json::Value {
    match &v.kind {
        None | Some(Kind::NullValue(_)) => serde_json::Value::Null,
        Some(Kind::NumberValue(n)) => number_to_json(*n),
        Some(Kind::StringValue(s)) => serde_json::Value::String(s.clone()),
        Some(Kind::BoolValue(b)) => serde_json::Value::Bool(*b),
        Some(Kind::StructValue(s)) => struct_to_json(s),
        Some(Kind::ListValue(ListValue { values })) => {
            serde_json::Value::Array(values.iter().map(value_to_json).collect())
        }
    }
}

fn number_to_json(n: f64) -> serde_json::Value {
    // Whole-number float -> JSON integer, so strict integer `Deserialize` impls (u64/u32
    // throughout bundle.rs) accept it. See this module's doc comment for why this is needed at
    // all: protobuf's Struct has no integer variant, everything is `NumberValue(f64)`.
    if n.fract() == 0.0 && n.is_finite() {
        if n >= 0.0 && n <= u64::MAX as f64 {
            return Number::from(n as u64).into();
        }
        if n >= i64::MIN as f64 && n < 0.0 {
            return Number::from(n as i64).into();
        }
    }
    Number::from_f64(n)
        .map(serde_json::Value::Number)
        .unwrap_or(serde_json::Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use prost_types::value::Kind;
    use std::collections::BTreeMap;

    fn string_value(s: &str) -> Value {
        Value {
            kind: Some(Kind::StringValue(s.to_string())),
        }
    }

    #[test]
    fn converts_nested_struct() {
        let mut inner_fields = BTreeMap::new();
        inner_fields.insert("name".to_string(), string_value("acme"));
        let inner = Struct {
            fields: inner_fields,
        };

        let mut fields = BTreeMap::new();
        fields.insert(
            "tenant".to_string(),
            Value {
                kind: Some(Kind::StructValue(inner)),
            },
        );
        let outer = Struct { fields };

        let json = struct_to_json(&outer);
        assert_eq!(json["tenant"]["name"], "acme");
    }

    #[test]
    fn converts_list_and_bool() {
        let mut fields = BTreeMap::new();
        fields.insert(
            "scopes".to_string(),
            Value {
                kind: Some(Kind::ListValue(ListValue {
                    values: vec![string_value("openid"), string_value("email")],
                })),
            },
        );
        fields.insert(
            "active".to_string(),
            Value {
                kind: Some(Kind::BoolValue(true)),
            },
        );
        let s = Struct { fields };
        let json = struct_to_json(&s);
        assert_eq!(json["scopes"], serde_json::json!(["openid", "email"]));
        assert_eq!(json["active"], true);
    }

    #[test]
    fn whole_number_float_deserializes_as_u64() {
        // Regression test for the real bug the live signet integration test caught: protobuf's
        // Struct has no integer variant, so a config value like `timeout: 30` arrives as
        // `NumberValue(30.0)` — this must still deserialize into a `u64`-typed struct field.
        let mut fields = BTreeMap::new();
        fields.insert(
            "timeout".to_string(),
            Value {
                kind: Some(Kind::NumberValue(30.0)),
            },
        );
        let s = Struct { fields };
        let json = struct_to_json(&s);

        #[derive(serde::Deserialize)]
        struct Timeout {
            timeout: u64,
        }
        let parsed: Timeout = serde_json::from_value(json).expect("30.0 should deserialize as u64");
        assert_eq!(parsed.timeout, 30);
    }

    #[test]
    fn fractional_value_still_round_trips_as_float() {
        let mut fields = BTreeMap::new();
        fields.insert(
            "ratio".to_string(),
            Value {
                kind: Some(Kind::NumberValue(0.5)),
            },
        );
        let s = Struct { fields };
        let json = struct_to_json(&s);
        assert_eq!(json["ratio"], 0.5);
    }
}
