use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize)]
pub struct AppUpdate {
    version: String,
}

fn version_tuple(value: &str) -> Option<[u32; 3]> {
    let parts: Vec<_> = value.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    Some([
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ])
}

fn newer_release(releases: &Value, current: &str) -> Option<AppUpdate> {
    let current = version_tuple(current)?;
    releases
        .as_array()?
        .iter()
        .filter_map(|release| {
            if release["draft"].as_bool() != Some(false)
                || release["prerelease"].as_bool() != Some(false)
            {
                return None;
            }
            let version = release["tag_name"].as_str()?.strip_prefix("apps-v")?;
            let parsed = version_tuple(version)?;
            let has_installers = release["assets"].as_array()?.iter().any(|asset| {
                asset["name"].as_str().is_some_and(|name| {
                    name.starts_with(&format!("BECA_{version}_"))
                        && (name.ends_with(".msi")
                            || name.ends_with(".dmg")
                            || name.ends_with(".deb"))
                })
            });
            (has_installers && parsed > current).then_some((parsed, version))
        })
        .max_by_key(|(parsed, _)| *parsed)
        .map(|(_, version)| AppUpdate {
            version: version.to_string(),
        })
}

#[tauri::command]
pub async fn check_app_update(app: tauri::AppHandle) -> Result<Option<AppUpdate>, String> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?
        .get("https://api.github.com/repos/fattyrecordingco/BECAfirmware/releases?per_page=20")
        .header("User-Agent", "BECA-update-check")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let body = response.text().await.map_err(|e| e.to_string())?;
    let releases: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(newer_release(
        &releases,
        &app.package_info().version.to_string(),
    ))
}

#[tauri::command]
pub async fn open_app_update(version: String) -> Result<(), String> {
    if version_tuple(&version).is_none() {
        return Err("Invalid app version".into());
    }
    let url =
        format!("https://github.com/fattyrecordingco/BECAfirmware/releases/tag/apps-v{version}");
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        let result = std::process::Command::new("explorer.exe").arg(&url).spawn();
        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open").arg(&url).spawn();
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let result = std::process::Command::new("xdg-open").arg(&url).spawn();
        result.map(|_| ()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn only_new_stable_app_releases_with_installers_are_offered() {
        let releases = json!([
          {"tag_name":"instrument-v9.0.0","draft":false,"prerelease":false,"assets":[]},
          {"tag_name":"apps-v0.4.0","draft":false,"prerelease":true,"assets":[{"name":"BECA_0.4.0_x64.msi"}]},
          {"tag_name":"apps-v0.3.2","draft":false,"prerelease":false,"assets":[]},
          {"tag_name":"apps-v0.3.1","draft":false,"prerelease":false,"assets":[{"name":"BECA_0.3.1_x64.msi"}]}
        ]);
        assert_eq!(newer_release(&releases, "0.3.0").unwrap().version, "0.3.1");
        assert!(newer_release(&releases, "0.3.1").is_none());
        assert!(version_tuple("0.3.2/../../bad").is_none());
    }
}
