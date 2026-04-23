use anyhow::{anyhow, Context, Result};
use beca_flasher::flash::{download_firmware, FlashCommandConfig, FlashTool};
use beca_flasher::{
    backup_nvs, detect_beca_ports, fetch_latest_manifest, flash_firmware, resolve_flash_tool,
    restore_nvs,
};
use clap::{Parser, Subcommand};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Parser)]
#[command(name = "beca-flasher")]
#[command(about = "BECA firmware flasher helper")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    Detect,
    Manifest {
        #[arg(long)]
        repo: String,
    },
    Flash {
        #[arg(long)]
        repo: String,
        #[arg(long)]
        port: String,
        #[arg(long, default_value = "latest-stable")]
        firmware: String,
        #[arg(long, default_value = "ESP32-PICO-V3")]
        hardware: String,
        #[arg(long, default_value_t = 460800)]
        baud: u32,
        #[arg(long, default_value = "0x0")]
        offset: String,
        #[arg(long)]
        tool_path: Option<PathBuf>,
        #[arg(long, default_value = ".beca-cache")]
        cache_dir: PathBuf,
    },
    BackupNvs {
        #[arg(long)]
        port: String,
        #[arg(long)]
        output: PathBuf,
        #[arg(long, default_value_t = 115200)]
        baud: u32,
        #[arg(long, default_value = "0x9000")]
        offset: String,
        #[arg(long, default_value = "0x6000")]
        size: String,
        #[arg(long)]
        tool_path: PathBuf,
    },
    RestoreNvs {
        #[arg(long)]
        port: String,
        #[arg(long)]
        backup: PathBuf,
        #[arg(long, default_value_t = 115200)]
        baud: u32,
        #[arg(long, default_value = "0x9000")]
        offset: String,
        #[arg(long)]
        tool_path: PathBuf,
    },
}

#[derive(Debug, Serialize)]
struct FlashResult {
    firmware_version: String,
    port: String,
    status: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Detect => {
            println!("{}", serde_json::to_string_pretty(&detect_beca_ports())?);
        }
        Commands::Manifest { repo } => {
            let manifest = fetch_latest_manifest(&repo).await?;
            println!("{}", serde_json::to_string_pretty(&manifest)?);
        }
        Commands::Flash {
            repo,
            port,
            firmware,
            hardware,
            baud,
            offset,
            tool_path,
            cache_dir,
        } => {
            let manifest = fetch_latest_manifest(&repo).await.with_context(|| {
                format!("unable to fetch manifest from latest release for {repo}")
            })?;

            let selected = if firmware.eq_ignore_ascii_case("latest-stable") {
                manifest
                    .latest_stable_for_hardware(&hardware)
                    .ok_or_else(|| anyhow!("no stable firmware found for hardware {hardware}"))?
            } else {
                manifest
                    .by_version_for_hardware(&firmware, &hardware)
                    .ok_or_else(|| {
                        anyhow!("firmware {firmware} is not available for hardware {hardware}")
                    })?
            };

            let downloaded = download_firmware(selected, &cache_dir)
                .await
                .context("failed to download and verify firmware")?;

            let command = if let Some(path) = tool_path {
                let detected = if path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase()
                    .contains("esptool")
                {
                    FlashTool::Esptool
                } else {
                    FlashTool::Espflash
                };
                FlashCommandConfig {
                    tool: detected,
                    tool_path: path,
                    port,
                    baud,
                    firmware_path: downloaded,
                    offset,
                }
            } else {
                let base = std::env::current_exe()
                    .context("cannot resolve current executable path")?
                    .parent()
                    .map(Path::to_path_buf)
                    .ok_or_else(|| anyhow!("cannot resolve executable directory"))?;
                let (tool, path) = resolve_flash_tool(&base).ok_or_else(|| {
                    anyhow!(
                        "no bundled flash tool found. expected espflash/esptool next to beca-flasher"
                    )
                })?;
                FlashCommandConfig {
                    tool,
                    tool_path: path,
                    port,
                    baud,
                    firmware_path: downloaded,
                    offset,
                }
            };

            flash_firmware(&command).await?;
            let result = FlashResult {
                firmware_version: selected.version.clone(),
                port: command.port,
                status: "ok".to_string(),
            };
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        Commands::BackupNvs {
            port,
            output,
            baud,
            offset,
            size,
            tool_path,
        } => {
            backup_nvs(&tool_path, &port, baud, &output, &offset, &size).await?;
            println!("{{\"status\":\"ok\",\"backup\":\"{}\"}}", output.display());
        }
        Commands::RestoreNvs {
            port,
            backup,
            baud,
            offset,
            tool_path,
        } => {
            restore_nvs(&tool_path, &port, baud, &backup, &offset).await?;
            println!("{{\"status\":\"ok\",\"restore\":\"{}\"}}", backup.display());
        }
    }

    Ok(())
}
