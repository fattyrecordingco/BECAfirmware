use beca_bridge::controller::{list_controller_inputs, ControllerBatch, ControllerInput};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct ControllerState(Mutex<Option<ControllerInput>>);

#[tauri::command]
pub async fn controller_inputs() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| list_controller_inputs().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn controller_connect(app: AppHandle, name: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ControllerState>();
        let mut connection = state.0.lock().map_err(|e| e.to_string())?;
        *connection = None;
        if let Some(name) = name {
            *connection = Some(ControllerInput::open(&name).map_err(|e| e.to_string())?);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn controller_drain(app: AppHandle) -> Result<ControllerBatch, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ControllerState>();
        let connection = state.0.lock().map_err(|e| e.to_string())?;
        Ok(connection
            .as_ref()
            .map(ControllerInput::drain)
            .unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?
}
