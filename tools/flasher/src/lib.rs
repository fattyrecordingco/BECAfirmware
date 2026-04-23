pub mod flash;
pub mod manifest;
pub mod serial_detect;

pub use flash::{
    backup_nvs, flash_firmware, resolve_flash_tool, restore_nvs, FlashCommandConfig, FlashTool,
};
pub use manifest::{fetch_latest_manifest, parse_manifest, FirmwareManifest, FirmwareRelease};
pub use serial_detect::{detect_beca_ports, score_port, select_best_port, BecaPort};
