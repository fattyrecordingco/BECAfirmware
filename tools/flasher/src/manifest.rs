use anyhow::{anyhow, Context, Result};
use reqwest::header::{ACCEPT, USER_AGENT};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmwareManifest {
    pub schema_version: String,
    pub repository: String,
    #[serde(default)]
    pub generated_at: Option<String>,
    pub firmware: Vec<FirmwareRelease>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmwareRelease {
    pub version: String,
    #[serde(default = "default_channel")]
    pub channel: String,
    pub supported_hardware: Vec<String>,
    pub merged_bin_url: String,
    pub merged_bin_sha256: String,
    #[serde(default)]
    pub release_notes_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    draft: bool,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

fn default_channel() -> String {
    "stable".to_string()
}

impl FirmwareManifest {
    pub fn latest_stable_for_hardware(&self, hardware: &str) -> Option<&FirmwareRelease> {
        self.firmware
            .iter()
            .filter(|fw| fw.channel.eq_ignore_ascii_case("stable"))
            .filter(|fw| {
                fw.supported_hardware
                    .iter()
                    .any(|h| h.eq_ignore_ascii_case(hardware))
            })
            .max_by(|a, b| version_key(&a.version).cmp(&version_key(&b.version)))
    }

    pub fn by_version_for_hardware(
        &self,
        version: &str,
        hardware: &str,
    ) -> Option<&FirmwareRelease> {
        self.firmware.iter().find(|fw| {
            fw.version == version
                && fw
                    .supported_hardware
                    .iter()
                    .any(|h| h.eq_ignore_ascii_case(hardware))
        })
    }
}

pub fn parse_manifest(raw: &str) -> Result<FirmwareManifest> {
    let manifest: FirmwareManifest =
        serde_json::from_str(raw).context("failed to parse firmware manifest JSON")?;
    if manifest.schema_version.trim().is_empty() {
        return Err(anyhow!("manifest schema_version cannot be empty"));
    }
    if manifest.firmware.is_empty() {
        return Err(anyhow!("manifest firmware list is empty"));
    }
    for fw in &manifest.firmware {
        if fw.version.trim().is_empty() {
            return Err(anyhow!("manifest firmware version cannot be empty"));
        }
        if fw.merged_bin_url.trim().is_empty() {
            return Err(anyhow!("manifest firmware URL cannot be empty"));
        }
        if fw.merged_bin_sha256.trim().len() != 64 {
            return Err(anyhow!("manifest firmware checksum must be 64 hex chars"));
        }
    }
    Ok(manifest)
}

pub async fn fetch_latest_manifest(repository: &str) -> Result<FirmwareManifest> {
    let url = format!("https://api.github.com/repos/{repository}/releases?per_page=25");
    let client = reqwest::Client::new();
    let user_agent = format!("beca-flasher/{}", env!("CARGO_PKG_VERSION"));
    let release_response = client
        .get(url)
        .header(USER_AGENT, &user_agent)
        .header(ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .context("failed to query GitHub releases")?;

    if release_response.status() == StatusCode::NOT_FOUND {
        return Err(anyhow!(
            "latest release not found for repo '{repository}'. \
Create a GitHub Release and attach firmware-manifest.json."
        ));
    }

    let releases: Vec<GithubRelease> = release_response
        .error_for_status()
        .context("GitHub release endpoint returned non-success")?
        .json()
        .await
        .context("failed to decode GitHub release response")?;

    if releases.is_empty() {
        return Err(anyhow!(
            "no releases found for repo '{repository}'. Create a release and attach firmware-manifest.json."
        ));
    }

    let release = releases
        .iter()
        .find(|r| {
            !r.draft
                && r.assets
                    .iter()
                    .any(|a| a.name.eq_ignore_ascii_case("firmware-manifest.json"))
        })
        .ok_or_else(|| {
            anyhow!(
                "no release with firmware-manifest.json found in '{repository}'. \
Attach firmware-manifest.json to a published release."
            )
        })?;

    let manifest_asset = release
        .assets
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case("firmware-manifest.json"))
        .ok_or_else(|| anyhow!("release does not contain firmware-manifest.json"))?;

    let raw = client
        .get(&manifest_asset.browser_download_url)
        .header(USER_AGENT, &user_agent)
        .send()
        .await
        .context("failed to download firmware manifest")?
        .error_for_status()
        .context("firmware manifest download returned non-success")?
        .text()
        .await
        .context("failed to read firmware manifest body")?;

    parse_manifest(&raw).with_context(|| {
        format!(
            "failed to parse firmware-manifest.json from release '{}'",
            release.tag_name
        )
    })
}

fn version_key(version: &str) -> Vec<u32> {
    version
        .trim_start_matches('v')
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../fixtures/firmware-manifest.json");

    #[test]
    fn parse_fixture_manifest() {
        let manifest = parse_manifest(FIXTURE).expect("fixture should parse");
        assert_eq!(manifest.schema_version, "1.0.0");
        assert_eq!(manifest.firmware.len(), 2);
    }

    #[test]
    fn picks_latest_stable_for_hw() {
        let manifest = parse_manifest(FIXTURE).expect("fixture should parse");
        let fw = manifest
            .latest_stable_for_hardware("ESP32-PICO-V3")
            .expect("expected stable firmware for hw");
        assert_eq!(fw.version, "1.0.2");
    }

    #[test]
    fn finds_exact_version_for_hw() {
        let manifest = parse_manifest(FIXTURE).expect("fixture should parse");
        let fw = manifest
            .by_version_for_hardware("1.0.1", "esp32-pico-v3")
            .expect("expected matching firmware");
        assert_eq!(fw.channel, "stable");
    }
}
