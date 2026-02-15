use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BridgeRuntimeInput {
    pub bundled_native_bridge_exists: bool,
    pub embedded_python_exists: bool,
    pub python_binary_wheels_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BridgeRuntimeDecision {
    pub mode: String,
    pub reason: String,
    pub blocks_source_builds: bool,
}

pub fn resolve_bridge_runtime(input: &BridgeRuntimeInput) -> BridgeRuntimeDecision {
    if input.bundled_native_bridge_exists {
        return BridgeRuntimeDecision {
            mode: "native-rust".to_string(),
            reason: "Bundled native bridge binary is available.".to_string(),
            blocks_source_builds: true,
        };
    }

    if input.embedded_python_exists && input.python_binary_wheels_available {
        return BridgeRuntimeDecision {
            mode: "embedded-python-binary-only".to_string(),
            reason: "Embedded Python path is wheel-only and disallows source builds.".to_string(),
            blocks_source_builds: true,
        };
    }

    BridgeRuntimeDecision {
        mode: "unsupported".to_string(),
        reason:
            "No safe runtime found. Source builds are blocked to avoid Meson/MSVC toolchain failures.".to_string(),
        blocks_source_builds: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_native_bridge_when_present() {
        let decision = resolve_bridge_runtime(&BridgeRuntimeInput {
            bundled_native_bridge_exists: true,
            embedded_python_exists: true,
            python_binary_wheels_available: true,
        });
        assert_eq!(decision.mode, "native-rust");
        assert!(decision.blocks_source_builds);
    }

    #[test]
    fn falls_back_to_embedded_python_when_safe() {
        let decision = resolve_bridge_runtime(&BridgeRuntimeInput {
            bundled_native_bridge_exists: false,
            embedded_python_exists: true,
            python_binary_wheels_available: true,
        });
        assert_eq!(decision.mode, "embedded-python-binary-only");
        assert!(decision.blocks_source_builds);
    }

    #[test]
    fn rejects_unsafe_python_source_build_path() {
        let decision = resolve_bridge_runtime(&BridgeRuntimeInput {
            bundled_native_bridge_exists: false,
            embedded_python_exists: true,
            python_binary_wheels_available: false,
        });
        assert_eq!(decision.mode, "unsupported");
        assert!(decision.reason.contains("Source builds are blocked"));
    }
}
