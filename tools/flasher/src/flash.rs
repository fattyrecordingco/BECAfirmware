use crate::manifest::FirmwareRelease;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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
    // A merged image fills gaps with FF; writing it whole would erase saved NVS.
    if matches!(cfg.offset.as_str(), "0x0" | "0x0000" | "0") {
        let bytes = fs::read(&cfg.firmware_path).await?;
        let ranges = beca_image_ranges(&bytes)?;
        for (index, (start, end)) in ranges.iter().copied().enumerate() {
            let path = cfg.firmware_path.with_extension(format!("part{index}.bin"));
            fs::write(&path, &bytes[start..end]).await?;
            let mut part = cfg.clone();
            part.firmware_path = path.clone();
            part.offset = format!("0x{start:x}");
            let result = flash_raw(&part).await;
            let _ = fs::remove_file(path).await;
            result?;
        }
        return Ok(());
    }
    flash_raw(cfg).await
}

fn beca_image_ranges(bytes: &[u8]) -> Result<[(usize, usize); 2]> {
    if bytes.len() <= 0x10000
        || bytes.len() > 0x400000
        || bytes[0x1000] != 0xe9
        || bytes[0x10000] != 0xe9
    {
        return Err(anyhow!(
            "Expected a complete BECA ESP32 merged image, including bootloader and application."
        ));
    }
    let nvs = bytes[0x8000..0x9000].chunks_exact(32).find(|entry| {
        entry[0..4] == [0xaa, 0x50, 1, 2] && entry[12..16] == *b"nvs\0"
    }).ok_or_else(|| anyhow!("BECA settings partition is missing; refusing to overwrite an unknown flash layout."))?;
    let start = u32::from_le_bytes(nvs[4..8].try_into().unwrap());
    let size = u32::from_le_bytes(nvs[8..12].try_into().unwrap());
    if start != 0x9000 || size != 0x5000 {
        return Err(anyhow!(
            "Unsupported BECA settings layout. No data has been written."
        ));
    }
    Ok([(0, 0x9000), (0xe000, bytes.len())])
}

async fn flash_raw(cfg: &FlashCommandConfig) -> Result<()> {
    let mut cmd = Command::new(&cfg.tool_path);
    cmd.kill_on_drop(true);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    for arg in build_flash_args(cfg) {
        cmd.arg(arg);
    }
    apply_background_process_flags(&mut cmd);

    let output = tokio::time::timeout(std::time::Duration::from_secs(120), cmd.output())
        .await.context("Flasher timed out. Reconnect USB and retry; hold BOOT if the board cannot enter its bootloader.")?
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
    let mut cmd = Command::new(tool);
    cmd.arg("--chip")
        .arg("esp32")
        .arg("--port")
        .arg(port)
        .arg("--baud")
        .arg(baud.to_string())
        .arg("read_flash")
        .arg(offset)
        .arg(size)
        .arg(output_path);
    apply_background_process_flags(&mut cmd);
    let output = cmd
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
    if offset == "0x9000" && fs::metadata(backup_path).await?.len() != 0x5000 {
        return Err(anyhow!("Expected a 20 KiB BECA settings backup. Legacy 24 KiB backups include boot data and must be converted before restoring."));
    }
    let mut cmd = Command::new(tool);
    cmd.arg("--chip")
        .arg("esp32")
        .arg("--port")
        .arg(port)
        .arg("--baud")
        .arg(baud.to_string())
        .arg("write_flash")
        .arg(offset)
        .arg(backup_path);
    apply_background_process_flags(&mut cmd);
    let output = cmd
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

fn apply_background_process_flags(cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn first_flash_contains_boot_code_and_preserves_settings() {
        let mut bytes = vec![0xff; 0x20000];
        bytes[0x1000] = 0xe9;
        bytes[0x10000] = 0xe9;
        bytes[0x8000..0x8004].copy_from_slice(&[0xaa, 0x50, 1, 2]);
        bytes[0x8004..0x8008].copy_from_slice(&0x9000u32.to_le_bytes());
        bytes[0x8008..0x800c].copy_from_slice(&0x5000u32.to_le_bytes());
        bytes[0x800c..0x8010].copy_from_slice(b"nvs\0");
        assert_eq!(
            beca_image_ranges(&bytes).unwrap(),
            [(0, 0x9000), (0xe000, 0x20000)]
        );
        bytes[0x8004] = 1;
        assert!(beca_image_ranges(&bytes).is_err());
        assert!(beca_image_ranges(&[0xff; 100]).is_err());
    }

    #[tokio::test]
    async fn damaged_firmware_is_rejected() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("damaged.bin");
        fs::write(&path, b"damaged").await.unwrap();
        assert!(verify_sha256(&path, &"0".repeat(64)).await.is_err());
    }

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
