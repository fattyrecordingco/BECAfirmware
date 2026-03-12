use crate::manifest::FirmwareRelease;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FlashTool {
    Espflash,
    Esptool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashCommandConfig {
    pub tool: FlashTool,
    pub tool_path: PathBuf,
    pub port: String,
    pub baud: u32,
    pub firmware_path: PathBuf,
    pub offset: String,
}

pub fn resolve_flash_tool(base_dir: &Path) -> Option<(FlashTool, PathBuf)> {
    let candidates = if cfg!(target_os = "windows") {
        vec![
            (FlashTool::Esptool, base_dir.join(sidecar_name("esptool"))),
            (FlashTool::Espflash, base_dir.join(sidecar_name("espflash"))),
        ]
    } else {
        vec![
            (FlashTool::Espflash, base_dir.join(sidecar_name("espflash"))),
            (FlashTool::Esptool, base_dir.join(sidecar_name("esptool"))),
        ]
    };

    for (tool, path) in candidates {
        if path.exists() {
            return Some((tool, path));
        }
    }

    None
}

pub async fn download_firmware(release: &FirmwareRelease, target_dir: &Path) -> Result<PathBuf> {
    fs::create_dir_all(target_dir)
        .await
        .with_context(|| format!("failed to create cache dir: {}", target_dir.display()))?;

    let output = target_dir.join(format!("beca-{}-merged.bin", release.version));
    let client = reqwest::Client::new();
    let bytes = client
        .get(&release.merged_bin_url)
        .header("User-Agent", "beca-setup/0.1.0")
        .send()
        .await
        .context("firmware download failed")?
        .error_for_status()
        .context("firmware URL returned non-success")?
        .bytes()
        .await
        .context("unable to read firmware bytes")?;

    let mut file = fs::File::create(&output)
        .await
        .with_context(|| format!("failed to create firmware file: {}", output.display()))?;
    file.write_all(&bytes)
        .await
        .with_context(|| format!("failed to write firmware file: {}", output.display()))?;

    verify_sha256(&output, &release.merged_bin_sha256)
        .await
        .context("firmware checksum mismatch")?;

    Ok(output)
}

pub async fn verify_sha256(path: &Path, expected_hex: &str) -> Result<()> {
    let bytes = fs::read(path)
        .await
        .with_context(|| format!("failed to read file for checksum: {}", path.display()))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hasher.finalize();
    let actual = hex::encode(digest);

    if actual.eq_ignore_ascii_case(expected_hex) {
        Ok(())
    } else {
        Err(anyhow!(
            "SHA256 mismatch for {}. expected={}, actual={actual}",
            path.display(),
            expected_hex
        ))
    }
}

pub async fn flash_firmware(cfg: &FlashCommandConfig) -> Result<()> {
    let mut cmd = Command::new(&cfg.tool_path);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    for arg in build_flash_args(cfg) {
        cmd.arg(arg);
    }

    let output = cmd
        .output()
        .await
        .with_context(|| format!("failed to run flasher tool: {}", cfg.tool_path.display()))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(anyhow!(
            "flash tool failed. stdout: {stdout}\nstderr: {stderr}"
        ))
    }
}

pub async fn backup_nvs(
    tool: &Path,
    port: &str,
    baud: u32,
    output_path: &Path,
    offset: &str,
    size: &str,
) -> Result<()> {
    let output = Command::new(tool)
        .arg("--chip")
        .arg("esp32")
        .arg("--port")
        .arg(port)
        .arg("--baud")
        .arg(baud.to_string())
        .arg("read_flash")
        .arg(offset)
        .arg(size)
        .arg(output_path)
        .output()
        .await
        .with_context(|| format!("failed to run NVS backup tool: {}", tool.display()))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(anyhow!(
            "NVS backup failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

pub async fn restore_nvs(
    tool: &Path,
    port: &str,
    baud: u32,
    backup_path: &Path,
    offset: &str,
) -> Result<()> {
    let output = Command::new(tool)
        .arg("--chip")
        .arg("esp32")
        .arg("--port")
        .arg(port)
        .arg("--baud")
        .arg(baud.to_string())
        .arg("write_flash")
        .arg(offset)
        .arg(backup_path)
        .output()
        .await
        .with_context(|| format!("failed to run NVS restore tool: {}", tool.display()))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(anyhow!(
            "NVS restore failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

fn sidecar_name(base: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

fn build_flash_args(cfg: &FlashCommandConfig) -> Vec<String> {
    match cfg.tool {
        FlashTool::Espflash => vec![
            // espflash v4+ expects subcommand first and raw binaries via write-bin.
            "write-bin".to_string(),
            "--chip".to_string(),
            "esp32".to_string(),
            "--port".to_string(),
            cfg.port.clone(),
            "--baud".to_string(),
            cfg.baud.to_string(),
            "--non-interactive".to_string(),
            "--skip-update-check".to_string(),
            cfg.offset.clone(),
            cfg.firmware_path.display().to_string(),
        ],
        FlashTool::Esptool => vec![
            "--chip".to_string(),
            "esp32".to_string(),
            "--port".to_string(),
            cfg.port.clone(),
            "--baud".to_string(),
            cfg.baud.to_string(),
            "write-flash".to_string(),
            "--flash-mode".to_string(),
            "dio".to_string(),
            "--flash-freq".to_string(),
            "40m".to_string(),
            "--flash-size".to_string(),
            "detect".to_string(),
            cfg.offset.clone(),
            cfg.firmware_path.display().to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn checksum_validation_works() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("test.bin");
        fs::write(&path, b"beca-firmware").await.expect("write");

        verify_sha256(
            &path,
            "804b4bb2fba9ec5a33da18647d964c67021995392eee66998a97d1ef5ce97c72",
        )
        .await
        .expect("sha should match");
    }

    #[test]
    fn espflash_uses_write_bin_subcommand() {
        let cfg = FlashCommandConfig {
            tool: FlashTool::Espflash,
            tool_path: PathBuf::from("espflash"),
            port: "COM5".to_string(),
            baud: 921_600,
            firmware_path: PathBuf::from("firmware.bin"),
            offset: "0x0".to_string(),
        };

        let args = build_flash_args(&cfg);
        assert_eq!(args.first().expect("first arg"), "write-bin");
        assert!(args.contains(&"--port".to_string()));
        assert!(args.contains(&"COM5".to_string()));
        assert!(args.contains(&"--skip-update-check".to_string()));
        assert!(args.contains(&"0x0".to_string()));
    }

    #[test]
    fn esptool_uses_write_flash_command() {
        let cfg = FlashCommandConfig {
            tool: FlashTool::Esptool,
            tool_path: PathBuf::from("esptool"),
            port: "COM5".to_string(),
            baud: 460_800,
            firmware_path: PathBuf::from("firmware.bin"),
            offset: "0x0".to_string(),
        };

        let args = build_flash_args(&cfg);
        assert!(args.contains(&"write-flash".to_string()));
        assert!(args.contains(&"--flash-mode".to_string()));
    }
}
